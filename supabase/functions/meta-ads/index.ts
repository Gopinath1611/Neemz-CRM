import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listCampaigns(
  token: string,
  adAccountId: string,
  datePreset: string = "maximum",
  timeRange?: { since?: string; until?: string } | null,
) {
  // Whitelist Meta-supported date_preset values so metrics mirror Ads Manager's
  // date picker (Today / Yesterday / Last 7d etc.). Default is "maximum" (lifetime).
  const ALLOWED_PRESETS = new Set([
    "today","yesterday","this_month","last_month","this_quarter",
    "maximum","last_3d","last_7d","last_14d","last_28d","last_30d","last_90d",
    "last_week_mon_sun","last_week_sun_sat","last_quarter","last_year",
    "this_week_mon_today","this_week_sun_today","this_year",
  ]);
  const preset = ALLOWED_PRESETS.has(datePreset) ? datePreset : "maximum";
  const useTimeRange = !!(timeRange?.since && timeRange?.until);
  const fields = [
    "name",
    "status",
    "effective_status",
    "objective",
    "daily_budget",
    "lifetime_budget",
    "created_time",
    "start_time",
    "stop_time",
  ].join(",");

  const fetchCampaignInsights = async (useUnifiedAttribution: boolean): Promise<any[]> => {
    const insightFields = [
      "campaign_id",
      "campaign_name",
      "impressions",
      "reach",
      "clicks",
      "spend",
      "ctr",
      "cpc",
      "actions",
      "date_start",
      "date_stop",
    ].join(",");
    const attributionParam = useUnifiedAttribution ? "&use_unified_attribution_setting=true" : "";
    const rangeParam = useTimeRange
      ? `&time_range=${encodeURIComponent(JSON.stringify({ since: timeRange!.since, until: timeRange!.until }))}`
      : `&date_preset=${encodeURIComponent(preset)}`;
    let insightsUrl: string | null = `${GRAPH}/act_${adAccountId}/insights?level=campaign&fields=${encodeURIComponent(
      insightFields
    )}${rangeParam}&limit=5000${attributionParam}&access_token=${token}`;
    const rows: any[] = [];
    while (insightsUrl) {
      const res: Response = await fetch(insightsUrl);
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `Meta API error ${res.status}`);
      }
      for (const row of data.data || []) rows.push(row);
      insightsUrl = data?.paging?.next || null;
    }
    return rows;
  };

  let insightRows: any[] = [];
  try {
    insightRows = await fetchCampaignInsights(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/unified attribution|use_unified_attribution_setting|Invalid parameter/i.test(msg)) throw e;
    insightRows = await fetchCampaignInsights(false);
  }

  const insightsByCampaign = new Map<string, any>();
  for (const ins of insightRows) {
    const campaignId = ins.campaign_id;
    if (!campaignId) continue;
    const leadAction = (ins.actions || []).find((a: any) =>
      ["lead", "leadgen.other", "onsite_conversion.lead_grouped"].includes(a.action_type)
    );
    insightsByCampaign.set(campaignId, {
      impressions: Number(ins.impressions || 0),
      reach: Number(ins.reach || 0),
      clicks: Number(ins.clicks || 0),
      spend: Number(ins.spend || 0),
      ctr: Number(ins.ctr || 0),
      cpc: Number(ins.cpc || 0),
      leads: leadAction ? Number(leadAction.value) : 0,
      date_start: ins.date_start || null,
      date_stop: ins.date_stop || null,
    });
  }

  let url: string | null = `${GRAPH}/act_${adAccountId}/campaigns?fields=${encodeURIComponent(
    fields
  )}&limit=100&access_token=${token}`;
  const raw: any[] = [];
  // Paginate to ensure we capture every campaign in the ad account (not just first 100)
  while (url) {
    const res: Response = await fetch(url);
    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Meta API error ${res.status}`);
    }
    for (const c of data.data || []) raw.push(c);
    url = data?.paging?.next || null;
  }

  // Dedupe by Meta Campaign ID to guarantee one row per unique campaign
  const seen = new Set<string>();
  const campaigns = raw.filter((c: any) => {
    if (!c?.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  }).map((c: any) => {
    const ins = insightsByCampaign.get(c.id) || {
      impressions: 0,
      reach: 0,
      clicks: 0,
      spend: 0,
      ctr: 0,
      cpc: 0,
      leads: 0,
      date_start: null,
      date_stop: null,
    };
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      created_time: c.created_time,
      start_time: c.start_time,
      stop_time: c.stop_time,
      insights: ins,
    };
  });
  return campaigns;
}

async function toggleCampaign(token: string, campaignId: string, status: "ACTIVE" | "PAUSED") {
  const res = await fetch(`${GRAPH}/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Meta API error ${res.status}`);
  }
  return data;
}

// Keeps the Meta connection alive automatically: tries every configured Meta
// credential and returns the first one Graph API still accepts. This prevents a
// single invalidated page token from silently disconnecting mapped campaigns.
let cachedToken: { token: string; at: number; fingerprint: string } | null = null;

function tokenFingerprint(candidates: string[]) {
  // Changes whenever any configured secret value changes, so updating
  // META_PAGE_ACCESS_TOKEN invalidates the cache on the next call.
  return candidates.map((t) => `${t.length}:${t.slice(-8)}`).join("|");
}

async function resolveAccessToken(forceRefresh = false): Promise<string> {
  const candidates = [
    Deno.env.get("META_PAGE_ACCESS_TOKEN"),
    Deno.env.get("WHATSAPP_ACCESS_TOKEN"),
  ].filter((t): t is string => !!t);

  if (!candidates.length) throw new Error("META_PAGE_ACCESS_TOKEN not configured");

  const fingerprint = tokenFingerprint(candidates);
  if (
    !forceRefresh &&
    cachedToken &&
    cachedToken.fingerprint === fingerprint &&
    Date.now() - cachedToken.at < 5 * 60 * 1000
  ) {
    return cachedToken.token;
  }
  cachedToken = null;


  let lastError = "Meta access token is invalid";
  for (const candidate of candidates) {
    try {
      const res = await fetch(`${GRAPH}/me?fields=id&access_token=${candidate}`);
      const data = await res.json();
      if (res.ok && data?.id) {
        cachedToken = { token: candidate, at: Date.now(), fingerprint };
        return candidate;
      }
      lastError = data?.error?.message || lastError;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function resolvePageContext(token: string, configuredPageId?: string | null) {
  if (configuredPageId) {
    try {
      const configuredRes = await fetch(
        `${GRAPH}/${configuredPageId}?fields=id,name,access_token&access_token=${token}`
      );
      const configuredData = await configuredRes.json();
      if (configuredRes.ok && configuredData?.id) {
        return {
          pageId: configuredData.id as string,
          pageName: configuredData.name as string | undefined,
          pageToken: (configuredData.access_token as string | undefined) || token,
        };
      }
    } catch (_) {
      // Fall through to account-based page discovery.
    }
  }

  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,connected_instagram_account{id,username}&limit=100&access_token=${token}`
  );
  const pagesData = await pagesRes.json();
  if (!pagesRes.ok) {
    throw new Error(pagesData?.error?.message || "Failed to discover connected Facebook pages");
  }

  const pages = pagesData.data || [];
  const matchedPage =
    pages.find((page: any) => page.id === configuredPageId || page.connected_instagram_account?.id === configuredPageId) ||
    pages[0];

  if (!matchedPage?.id) {
    throw new Error("No Facebook pages are available for this Meta connection");
  }

  return {
    pageId: matchedPage.id as string,
    pageName: matchedPage.name as string | undefined,
    pageToken: (matchedPage.access_token as string | undefined) || token,
  };
}

// Reads every lead row of one form, following Meta's paging cursors so forms
// with hundreds of leads are fully retrieved (not just the newest page).
// Throws the exact Graph error message so callers can surface permission
// problems (e.g. a token without leads_retrieval) instead of silently
// reporting "0 leads".
async function fetchFormLeads(
  formId: string,
  pageToken: string,
  fields: string,
  pageSize = 200,
  maxPages = 30,
): Promise<any[]> {
  let url: string | null =
    `${GRAPH}/${formId}/leads?fields=${encodeURIComponent(fields)}&limit=${pageSize}&access_token=${pageToken}`;
  const rows: any[] = [];
  let pages = 0;
  while (url && pages < maxPages) {
    const res: Response = await fetch(url);
    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Meta API error ${res.status}`);
    }
    for (const l of data.data || []) rows.push(l);
    url = data?.paging?.next || null;
    pages++;
  }
  return rows;
}

async function downloadLeads(token: string, pageId: string, campaignId?: string) {
  const page = await resolvePageContext(token, pageId);
  // Get all lead forms on the page
  const formsRes = await fetch(
    `${GRAPH}/${page.pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${page.pageToken}`
  );
  const formsData = await formsRes.json();
  if (!formsRes.ok) {
    throw new Error(formsData?.error?.message || "Failed to list lead forms");
  }
  const forms = formsData.data || [];
  const allLeads: any[] = [];
  const errors: string[] = [];
  for (const f of forms) {
    let leadRows: any[] = [];
    try {
      leadRows = await fetchFormLeads(
        f.id,
        page.pageToken,
        "id,created_time,ad_id,ad_name,campaign_id,campaign_name,form_id,field_data",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("lead fetch failed", f.id, msg);
      errors.push(`${f.name || f.id}: ${msg}`);
      continue;
    }
    for (const l of leadRows) {
      if (campaignId && l.campaign_id !== campaignId) continue;
      const fields: Record<string, string> = {};
      for (const fd of l.field_data || []) {
        fields[fd.name] = (fd.values || []).join(", ");
      }
      allLeads.push({
        id: l.id,
        created_time: l.created_time,
        campaign_id: l.campaign_id,
        campaign_name: l.campaign_name,
        ad_name: l.ad_name,
        form_name: f.name,
        ...fields,
      });
    }
  }
  // If every form failed the credential/permission is the cause — report it.
  if (allLeads.length === 0 && errors.length > 0) {
    throw new Error(`Meta refused lead data: ${errors[0]}`);
  }
  return allLeads;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, campaignId, status, formId, datePreset, timeRange, forceRefresh } = body;

    const token = await resolveAccessToken(action === "token_status" || forceRefresh === true);
    const adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
    const pageId = Deno.env.get("META_PAGE_ID");

    // Read-only verification: confirms which secret is live right now.
    if (action === "token_status") {
      const envToken = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
      const debugRes = await fetch(
        `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
      );
      const debug = await debugRes.json();
      const info = debug?.data || {};
      let page: unknown = null;
      if (pageId) {
        const pRes = await fetch(`${GRAPH}/${pageId}?fields=id,name&access_token=${encodeURIComponent(token)}`);
        page = await pRes.json();
      }
      return json({
        active_secret: envToken && token === envToken ? "META_PAGE_ACCESS_TOKEN" : "WHATSAPP_ACCESS_TOKEN (fallback)",
        token_masked: token.slice(0, 8) + "..." + token.slice(-4),
        token_length: token.length,
        valid: info?.is_valid ?? false,
        type: info?.type ?? null,
        app_id: info?.app_id ?? null,
        expires_at: info?.expires_at ? new Date(info.expires_at * 1000).toISOString() : "never",
        scopes: info?.scopes || [],
        page,
        ad_account_id: adAccountId || null,
        page_id: pageId || null,
        cache_cleared: true,
      });
    }

    if (!adAccountId) return json({ error: "META_AD_ACCOUNT_ID not configured" }, 400);


    if (action === "list_campaigns") {
      const campaigns = await listCampaigns(token, adAccountId, datePreset || "maximum", timeRange || null);
      return json({ campaigns, datePreset: datePreset || "maximum" });
    }

    if (action === "toggle_campaign") {
      if (!campaignId || !status) return json({ error: "campaignId and status required" }, 400);
      if (!["ACTIVE", "PAUSED"].includes(status)) return json({ error: "invalid status" }, 400);
      await toggleCampaign(token, campaignId, status);
      return json({ success: true });
    }

    if (action === "list_lead_forms") {
      if (!pageId) return json({ error: "META_PAGE_ID not configured" }, 400);
      const page = await resolvePageContext(token, pageId);

      const formsRes = await fetch(
        `${GRAPH}/${page.pageId}/leadgen_forms?fields=id,name,status,created_time,leads_count&limit=100&access_token=${page.pageToken}`
      );
      const formsData = await formsRes.json();
      if (!formsRes.ok) {
        throw new Error(formsData?.error?.message || "Failed to list lead forms");
      }
      return json({ forms: formsData.data || [], page: { id: page.pageId, name: page.pageName || null } });
    }

    if (action === "download_leads") {
      if (!pageId) return json({ error: "META_PAGE_ID not configured" }, 400);
      const leads = await downloadLeads(token, pageId, campaignId);
      return json({ leads });
    }

    if (action === "sync_leads_to_crm") {
      if (!pageId) return json({ error: "META_PAGE_ID not configured" }, 400);

      const page = await resolvePageContext(token, pageId);
      const formIds: string[] = [];
      const formNames: Record<string, string> = {};
      if (formId) {
        formIds.push(formId);
        try {
          const fr = await fetch(`${GRAPH}/${formId}?fields=id,name&access_token=${page.pageToken}`);
          const fd = await fr.json();
          if (fr.ok && fd?.name) formNames[String(formId)] = fd.name;
        } catch { /* name is best-effort */ }
      } else {
        const formsRes = await fetch(`${GRAPH}/${page.pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${page.pageToken}`);
        const formsData = await formsRes.json();
        if (!formsRes.ok) throw new Error(formsData?.error?.message || "Failed to list lead forms");
        for (const f of formsData.data || []) {
          formIds.push(f.id);
          if (f?.name) formNames[String(f.id)] = f.name;
        }
      }


      // Fetch all forms' leads in parallel (much faster than sequential), fully
      // paginated so forms with hundreds of leads backfill completely.
      const formErrors: string[] = [];
      const formResults = await Promise.all(
        formIds.map(async (fid) => {
          try {
            const rows = await fetchFormLeads(
              fid,
              page.pageToken,
              "id,created_time,ad_name,campaign_name,form_id,field_data",
            );
            return rows.map((l: any) => {
              const fields: Record<string, string> = {};
              for (const fd of l.field_data || []) fields[String(fd.name).toLowerCase()] = (fd.values || []).join(", ");
              return { id: l.id, created_time: l.created_time, campaign_name: l.campaign_name, form_id: l.form_id || fid, fields };
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("lead fetch failed", fid, msg);
            formErrors.push(`${formNames[String(fid)] || fid}: ${msg}`);
            return [];
          }
        })
      );
      const collected: any[] = formResults.flat();

      // Every form rejected => credential/permission issue, not "no new leads".
      if (collected.length === 0 && formErrors.length > 0) {
        return json({
          error: "META_LEADS_ACCESS_DENIED",
          message: `Meta refused lead data. ${formErrors[0]}. The access token likely needs the leads_retrieval permission.`,
          inserted: 0,
          skipped: 0,
          total: 0,
        }, 200);
      }


      const supa = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const pick = (f: Record<string,string>, keys: string[]) => {
        for (const k of keys) {
          for (const fk of Object.keys(f)) {
            if (fk.includes(k)) return f[fk];
          }
        }
        return "";
      };

      // Convert Meta's created_time (UTC ISO) to an ISO string; timestamptz in Postgres
      // stores UTC internally so the instant is preserved. IST rendering/filtering is done
      // via AT TIME ZONE 'Asia/Kolkata' on the query side.
      const toISTIso = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return null;
        return d.toISOString();
      };

      // Prepare candidate rows (meta metadata kept out of the DB row)
      const candidates = collected.map((l) => {
        const f = l.fields;
        const phone = (pick(f, ["phone", "mobile", "contact"]) || "").replace(/[^\d+]/g, "");
        if (!phone) return null;
        const createdAt = toISTIso(l.created_time);
        return {
          __form_id: l.form_id || null,
          __meta_lead_id: l.id || null,
          row: {
            name: pick(f, ["full_name", "name"]) || "Meta Lead",
            phone,
            email: pick(f, ["email"]) || null,
            city: pick(f, ["city", "location", "town"]) || null,
            source: "Facebook Ads",
            meta_form_id: l.form_id || null,
            meta_form_name: (l.form_id && formNames[String(l.form_id)]) || null,
            meta_lead_id: l.id || null,

            treatment_interest: "Consultation",
            status: "new_lead",
            notes: `Synced from Meta lead form. Campaign: ${l.campaign_name || "—"}. Meta created_time (IST): ${createdAt ? new Date(createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}`,
            ...(createdAt ? { created_at: createdAt } : {}),
          },
        };
      }).filter(Boolean) as any[];


      let skipped = collected.length - candidates.length;

      // Time-bounded, form-aware duplicate check. A Meta lead counts as a
      // duplicate only when the same phone already exists for the same form,
      // or the same phone submitted any form within the last 30 days. An older
      // contact enquiring again through a different campaign becomes a new lead.
      const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
      const phones = Array.from(new Set(candidates.map((c) => c.row.phone)));
      const seenForms = new Set<string>();      // `${phone}|${form_id}` already in CRM
      const recentPhones = new Set<string>();   // phone seen in the last 30 days
      const seenMetaLeadIds = new Set<string>(); // exact Meta submissions already stored
      {
        // The sync re-reads a form's whole history, so the Meta submission id is
        // the authoritative "already imported" marker — without it, relaxing the
        // phone rule would re-insert years of old submissions.
        const metaIds = Array.from(new Set(candidates.map((c) => c.__meta_lead_id).filter(Boolean).map(String)));
        for (let i = 0; i < metaIds.length; i += 150) {
          const slice = metaIds.slice(i, i + 150);
          if (!slice.length) continue;
          const { data: exist, error: idErr } = await supa
            .from("leads")
            .select("meta_lead_id")
            .in("meta_lead_id", slice);
          if (idErr) throw new Error(`duplicate lookup failed: ${idErr.message}`);
          for (const e of exist || []) if (e.meta_lead_id) seenMetaLeadIds.add(String(e.meta_lead_id));
        }
      }
      for (let i = 0; i < phones.length; i += 150) {
        const slice = phones.slice(i, i + 150);
        if (!slice.length) continue;
        const { data: existing, error: exErr } = await supa
          .from("leads")
          .select("phone, meta_form_id, created_at")
          .in("phone", slice);
        if (exErr) throw new Error(`duplicate lookup failed: ${exErr.message}`);
        for (const e of existing || []) {
          const ph = String(e.phone);
          if (e.meta_form_id) seenForms.add(`${ph}|${String(e.meta_form_id)}`);
          const ts = e.created_at ? new Date(e.created_at).getTime() : 0;
          if (ts && Date.now() - ts <= RECENT_MS) recentPhones.add(ph);
        }
      }

      // Forms wired to a Lead Automation workflow — anything else is "unlinked".
      const linkedForms = new Set<string>();
      {
        const { data: wfs } = await supa.from("workflows").select("meta_form_id").not("meta_form_id", "is", null);
        for (const w of wfs || []) if (w.meta_form_id) linkedForms.add(String(w.meta_form_id));
      }

      const seen = new Set<string>();
      const toInsert = candidates.filter((c) => {
        const ph = c.row.phone;
        const key = `${ph}|${c.row.meta_form_id ?? ""}`;
        const isDuplicate =
          (c.__meta_lead_id && seenMetaLeadIds.has(String(c.__meta_lead_id))) ||
          seen.has(key) ||
          (c.row.meta_form_id && seenForms.has(`${ph}|${String(c.row.meta_form_id)}`)) ||
          recentPhones.has(ph);
        if (isDuplicate) { skipped++; return false; }
        seen.add(key);
        return true;
      });
      const unlinked = toInsert.filter(
        (c) => c.row.meta_form_id && !linkedForms.has(String(c.row.meta_form_id)),
      ).length;

      let inserted = 0;
      const triggerQueue: any[] = [];
      if (toInsert.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const { error: insErr, data } = await supa.from("leads").insert(chunk.map((c) => c.row)).select("id, phone");
          if (insErr) { skipped += chunk.length; continue; }
          inserted += data?.length || chunk.length;
          for (const row of data || []) {
            const src = chunk.find((c) => c.row.phone === row.phone);
            // Historical backfill must never message people: only leads whose
            // Meta submission happened in the last 3 days trigger automations.
            const submittedAt = src?.row?.created_at ? new Date(src.row.created_at).getTime() : Date.now();
            const isFresh = Date.now() - submittedAt <= 3 * 24 * 60 * 60 * 1000;
            if (src?.__form_id && isFresh) {
              triggerQueue.push({
                form_id: src.__form_id,
                lead_id: row.id,
                meta_lead_id: src.__meta_lead_id,
                contact: { name: src.row.name, phone: src.row.phone, email: src.row.email, city: src.row.city },
              });
            }
          }
        }
      }

      // Backfill meta_form_name on existing leads that already have a form id
      // but no stored form name (older rows synced before this field existed).
      for (const [fid, fname] of Object.entries(formNames)) {
        if (!fname) continue;
        try {
          await supa.from("leads").update({ meta_form_name: fname })
            .eq("meta_form_id", fid).is("meta_form_name", null);
        } catch { /* best-effort */ }
      }


      // Fire the workflow engine for every newly inserted lead (best-effort)
      let workflows_triggered = 0;
      if (triggerQueue.length > 0) {
        const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/workflow-execute`;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const batch = 5;
        for (let i = 0; i < triggerQueue.length; i += batch) {
          await Promise.all(triggerQueue.slice(i, i + batch).map(async (p) => {
            try {
              const r = await fetch(fnUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
                body: JSON.stringify(p),
              });
              const j = await r.json().catch(() => ({}));
              if (r.ok && j?.matched > 0) workflows_triggered += j.matched;
              else if (!r.ok) console.warn("workflow-execute failed", r.status, JSON.stringify(j));
            } catch (err) {
              console.warn("workflow-execute call error:", err instanceof Error ? err.message : String(err));
            }
          }));
        }
      }

      return json({
        success: true,
        inserted,
        skipped,
        unlinked,
        total: collected.length,
        workflows_triggered,
        summary: inserted === 0
          ? `No new leads — all ${skipped} Meta lead(s) are already in the CRM.`
          : `${inserted} new lead(s) added, ${skipped} already in the CRM${unlinked ? `, ${unlinked} on a campaign form with no workflow attached` : ""}.`,
      });

    }


    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("meta-ads error:", msg);
    if (/Application has been deleted|Invalid OAuth|access token/i.test(msg)) {
      return json({
        error: "META_TOKEN_INVALID",
        message: "Meta access token is invalid or its app was deleted. Please generate a new token and update META_PAGE_ACCESS_TOKEN.",
        campaigns: [],
        leads: [],
        forms: [],
        fallback: true,
      }, 200);
    }
    return json({ error: msg, campaigns: [], leads: [], forms: [], fallback: true }, 200);
  }
});
