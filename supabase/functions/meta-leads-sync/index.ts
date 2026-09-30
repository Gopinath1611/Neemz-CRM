// Instant Force Sync — pulls fresh Meta lead-form submissions on demand.
// Called from the Pipeline "Sync Now" button.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMetaPageAccessToken, enrichPageAccessTokenError } from "../_shared/metaPageToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pick(fields: Record<string, string>, keys: string[]) {
  for (const k of keys) for (const fk of Object.keys(fields)) if (fk.includes(k)) return fields[fk];
  return "";
}

async function getJson(url: string) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error?.message || `Meta API HTTP ${res.status}`);
  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const hours = Math.min(Math.max(Number(payload?.hours) || 24, 1), 720);
    const sinceUnix = Math.floor((Date.now() - hours * 3600_000) / 1000);

    const rawToken = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
    if (!rawToken) return json({ ok: false, error: "META_PAGE_ACCESS_TOKEN is not configured." }, 400);

    const resolved = await resolveMetaPageAccessToken(rawToken, Deno.env.get("META_PAGE_ID") || "");
    const token = resolved.token;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. All lead forms on the Page
    const formsRes = await getJson(
      `${GRAPH}/${encodeURIComponent(resolved.pageId)}/leadgen_forms?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`,
    );
    const forms: { id: string; name?: string }[] = Array.isArray(formsRes?.data) ? formsRes.data : [];

    let fetched = 0, inserted = 0, skipped = 0;
    const errors: string[] = [];
    const deadline = Date.now() + 110_000; // stay well inside the 150s request limit

    // Pre-load existing lead keys once instead of 2 DB round-trips per lead.
    // Duplicate rule matches meta-ads: same phone on the same form, or the same
    // phone within the last 30 days. Older enquiries on a different campaign
    // form are allowed through as fresh leads.
    const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
    const seenMetaIds = new Set<string>();
    const phoneForms = new Set<string>();    // `${phone}|${form_id}`
    const recentPhones = new Set<string>();
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await supa
        .from("leads")
        .select("phone, meta_lead_id, meta_form_id, created_at")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data || []) {
        if (r.meta_lead_id) seenMetaIds.add(String(r.meta_lead_id));
        if (!r.phone) continue;
        const ph = String(r.phone).replace(/[^\d+]/g, "");
        if (r.meta_form_id) phoneForms.add(`${ph}|${String(r.meta_form_id)}`);
        const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
        if (ts && Date.now() - ts <= RECENT_MS) recentPhones.add(ph);
      }
      if (!data || data.length < 1000) break;
    }

    // Forms wired to a Lead Automation workflow — anything else is "unlinked".
    const linkedForms = new Set<string>();
    {
      const { data: wfs } = await supa.from("workflows").select("meta_form_id").not("meta_form_id", "is", null);
      for (const w of wfs || []) if (w.meta_form_id) linkedForms.add(String(w.meta_form_id));
    }
    let unlinked = 0;

    // Read all forms' recent leads in parallel (paged), instead of one form at a time.
    const perForm = await Promise.all(forms.map(async (form) => {
      const rows: any[] = [];
      let url =
        `${GRAPH}/${encodeURIComponent(form.id)}/leads?fields=id,created_time,ad_name,campaign_name,form_id,field_data` +
        `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]))}` +
        `&limit=100&access_token=${encodeURIComponent(token)}`;
      let pages = 0;
      while (url && pages < 20 && Date.now() < deadline) {
        let page: any;
        try {
          page = await getJson(url);
        } catch (e) {
          errors.push(`${form.name || form.id}: ${e instanceof Error ? e.message : String(e)}`);
          break;
        }
        for (const lead of page?.data || []) rows.push(lead);
        url = page?.paging?.next || "";
        pages++;
      }
      return { form, rows };
    }));

    for (const { form, rows } of perForm) {
      for (const lead of rows) {
        if (Date.now() > deadline) break;
        {
          fetched++;
          const fields: Record<string, string> = {};
          for (const fd of lead.field_data || []) {
            fields[String(fd.name).toLowerCase()] = (fd.values || []).join(", ");
          }
          const phone = (pick(fields, ["phone", "mobile", "contact"]) || "").replace(/[^\d+]/g, "");
          if (!phone) { skipped++; continue; }

          // De-dup on the Meta lead id, then phone+form / recent phone
          const formKey = `${phone}|${String(form.id)}`;
          if (
            seenMetaIds.has(String(lead.id)) ||
            phoneForms.has(formKey) ||
            recentPhones.has(phone)
          ) { skipped++; continue; }
          seenMetaIds.add(String(lead.id));
          phoneForms.add(formKey);
          recentPhones.add(phone);
          if (!linkedForms.has(String(form.id))) unlinked++;

          const createdAt = lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString();
          const leadName = pick(fields, ["full_name", "name"]) || "Meta Lead";
          const email = pick(fields, ["email"]) || null;
          const city = pick(fields, ["city", "location", "town"]) || null;

          const { data: newLead, error: insErr } = await supa.from("leads").insert({
            name: leadName,
            phone,
            email,
            city,
            source: "Facebook Ads",
            meta_form_id: form.id,
            meta_form_name: form.name || null,
            meta_lead_id: lead.id,
            treatment_interest: "Consultation",
            status: "new_lead",
            notes: `Force sync. Form: ${form.name || form.id}. Campaign: ${lead.campaign_name || "—"}. IST: ${new Date(createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
            created_at: createdAt,
          }).select("id").maybeSingle();

          if (insErr) { skipped++; errors.push(insErr.message); continue; }
          inserted++;

          // Run any active workflow mapped to this form (fire-and-forget).
          // Historical backfill is stored silently — only submissions from the
          // last 3 days trigger automations, so nobody gets a late message.
          const isFresh = Date.now() - new Date(createdAt).getTime() <= 3 * 24 * 60 * 60 * 1000;
          if (!isFresh) continue;
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/workflow-execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              form_id: form.id,
              lead_id: newLead?.id || null,
              meta_lead_id: lead.id,
              contact: { name: leadName, phone, email, city },
            }),
          }).catch((e) => console.warn("workflow-execute failed:", e instanceof Error ? e.message : String(e)));
        }
      }
    }

    return json({
      ok: true,
      page: resolved.pageName || resolved.pageId,
      forms: forms.length,
      fetched,
      inserted,
      skipped,
      unlinked,
      summary: inserted === 0
        ? `No new leads — all ${skipped} Meta lead(s) are already in the CRM.`
        : `${inserted} new lead(s) added, ${skipped} already in the CRM${unlinked ? `, ${unlinked} on a campaign form with no workflow attached` : ""}.`,
      errors: errors.slice(0, 5),
    });
  } catch (e) {
    const msg = enrichPageAccessTokenError(e instanceof Error ? e.message : String(e));
    console.error("meta-leads-sync error:", msg);
    return json({ ok: false, error: msg }, 200);
  }
});
