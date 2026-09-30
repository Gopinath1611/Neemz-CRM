// Meta LeadGen Webhook receiver
// - GET: verifies subscription via hub.challenge (Meta webhook handshake)
// - POST: receives leadgen events, fetches lead field data from Graph API,
//         inserts into public.leads, and increments contact counters for any
//         workflow mapped to the incoming form_id.
//
// Notes:
//  - Workflow storage is currently client-side mock; when a `workflows` table
//    is introduced with a `meta_form_id` column, the counter-increment block
//    below will start updating rows automatically. Until then, only the lead
//    ingestion path runs (safe no-op for counters).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Accept the dedicated Meta verify token first, then legacy fallbacks, so the
  // subscription handshake succeeds regardless of which token name was configured.
  const verifyToken =
    Deno.env.get("META_VERIFY_TOKEN") ||
    Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ||
    Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  const pageToken =
    Deno.env.get("META_PAGE_ACCESS_TOKEN") || Deno.env.get("WHATSAPP_ACCESS_TOKEN");


  // --- Meta subscription handshake ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && verifyToken && token === verifyToken) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const payload = await req.json();
    if (!pageToken) return json({ error: "META_PAGE_ACCESS_TOKEN not configured" }, 500);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let inserted = 0;
    let skipped = 0;

    const entries = payload?.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const ch of changes) {
        if (ch.field !== "leadgen") continue;
        const v = ch.value || {};
        const leadgenId: string | undefined = v.leadgen_id;
        const formId: string | undefined = v.form_id;
        const createdTimeRaw = v.created_time ? new Date(v.created_time * 1000).toISOString() : new Date().toISOString();
        if (!leadgenId) { skipped++; continue; }

        // Fast de-dup on Meta's own lead id so retried deliveries exit before
        // any Graph API round-trip (keeps processing instant).
        const { data: dupById } = await supa.from("leads").select("id").eq("meta_lead_id", leadgenId).limit(1);
        if (dupById && dupById.length) { skipped++; continue; }

        // Fetch full lead details from Graph API
        const res = await fetch(`${GRAPH}/${leadgenId}?fields=id,created_time,ad_name,campaign_name,form_id,field_data&access_token=${pageToken}`);
        const data = await res.json();
        if (!res.ok) { skipped++; continue; }

        const fields: Record<string, string> = {};
        for (const fd of data.field_data || []) fields[String(fd.name).toLowerCase()] = (fd.values || []).join(", ");

        const phone = (pick(fields, ["phone", "mobile", "contact"]) || "").replace(/[^\d+]/g, "");
        if (!phone) { skipped++; continue; }

        // Dedup by phone
        const { data: existing } = await supa.from("leads").select("id").eq("phone", phone).limit(1);
        if (existing && existing.length) { skipped++; continue; }

        // Resolve the exact Meta lead form name for this lead
        let formName: string | null = null;
        if (formId) {
          try {
            const fr = await fetch(`${GRAPH}/${formId}?fields=id,name&access_token=${pageToken}`);
            const fd = await fr.json();
            if (fr.ok && fd?.name) formName = fd.name;
          } catch { /* best-effort */ }
        }

        const leadName = pick(fields, ["full_name", "name"]) || "Meta Lead";
        const { data: insertedLead, error: insErr } = await supa.from("leads").insert({
          name: leadName,
          phone,
          email: pick(fields, ["email"]) || null,
          city: pick(fields, ["city", "location", "town"]) || null,
          source: "Facebook Ads",
          meta_form_id: formId || null,
          meta_form_name: formName,
          meta_lead_id: leadgenId || null,
          treatment_interest: "Consultation",
          status: "new_lead",
          notes: `Webhook lead. Form: ${formName || formId || "—"}. Campaign: ${data.campaign_name || "—"}. IST: ${new Date(createdTimeRaw).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
          created_at: createdTimeRaw,
        }).select("id").maybeSingle();

        if (insErr) { skipped++; continue; }
        inserted++;

        // Run every ACTIVE workflow mapped to this Meta form: executes the
        // configured action nodes (CRM update, staff assignment, WhatsApp
        // template, ...) and logs each step + counters.
        if (formId) {
          try {
            const execRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/workflow-execute`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                form_id: formId,
                lead_id: insertedLead?.id || null,
                meta_lead_id: leadgenId || null,
                contact: { name: leadName, phone, email: pick(fields, ["email"]) || null, city: pick(fields, ["city", "location", "town"]) || null },
              }),
            });
            const execJson = await execRes.json().catch(() => ({}));
            if (!execRes.ok || execJson?.ok === false) {
              console.warn("workflow-execute error:", execRes.status, JSON.stringify(execJson));
            }
          } catch (err) {
            console.warn("workflow-execute call failed:", err instanceof Error ? err.message : String(err));
          }
        }
      }
    }

    return json({ ok: true, inserted, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("meta-lead-webhook error:", msg);
    return json({ error: msg }, 200);
  }
});
