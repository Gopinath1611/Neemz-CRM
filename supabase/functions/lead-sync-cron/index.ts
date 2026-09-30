// Server-side lead sync + workflow catch-up worker.
// Runs on a schedule (pg_cron -> pg_net) so lead processing never depends on
// somebody keeping the Lead Automation page open in a browser.
//
// Guarantees:
//  - single-flight: a lease row in public.job_state (5 min expiry)
//  - bounded work per run: MAX_CATCHUP leads
//  - idempotent: progress is marked by workflow_runs rows written by workflow-execute
//  - circuit breaker: run marked paused/failed in job_state on hard failures
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB = "lead_sync";
const LEASE_MINUTES = 5;
const MAX_CATCHUP = 50;
const CATCHUP_CONCURRENCY = 5;
const META_RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000;
// Only process leads that arrived from 30 Jul 2026 (IST) onwards — matches the
// cutoff used by the Lead Automation counters.
const CUTOFF_ISO = "2026-07-29T18:30:00.000Z";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  const invoke = (fn: string, body: unknown) =>
    fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });

  try {
    const nowIso = new Date().toISOString();

    // ---- paused-state guard -------------------------------------------------
    const { data: state } = await admin
      .from("job_state")
      .select("job, paused, paused_reason, lease_until, last_run_at, last_result")
      .eq("job", JOB)
      .maybeSingle();

    if (state?.paused) {
      return json({ ok: true, skipped: "paused", reason: state.paused_reason ?? null });
    }

    // ---- single-flight lease ----------------------------------------------
    const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
    if (!state) {
      const { error } = await admin.from("job_state").insert({ job: JOB, lease_until: leaseUntil, last_run_at: nowIso });
      if (error) return json({ ok: true, skipped: "locked" });
    } else {
      const { data: claimed } = await admin
        .from("job_state")
        .update({ lease_until: leaseUntil, last_run_at: nowIso })
        .eq("job", JOB)
        .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
        .select("job");
      if (!claimed?.length) return json({ ok: true, skipped: "locked" });
    }

    const result: Record<string, unknown> = {};

    // ---- 1. pull fresh Meta leads into the CRM ----------------------------
    const previousIngestError = typeof state?.last_result?.ingest?.error === "string"
      ? state.last_result.ingest.error
      : "";
    const previousRunAt = state?.last_run_at ? new Date(state.last_run_at).getTime() : 0;
    const savedRetryAfter = typeof state?.last_result?.ingest?.retry_after === "string"
      ? new Date(state.last_result.ingest.retry_after).getTime()
      : 0;
    const retryAfter = savedRetryAfter > Date.now()
      ? savedRetryAfter
      : (/\(#4\)|application request limit/i.test(previousIngestError) && Number.isFinite(previousRunAt)
        ? previousRunAt + META_RATE_LIMIT_COOLDOWN_MS
        : 0);
    const metaCooldownActive = retryAfter > Date.now();

    if (metaCooldownActive) {
      result.ingest = {
        skipped: "meta_rate_limit_cooldown",
        retry_after: new Date(retryAfter).toISOString(),
      };
    } else {
      try {
        const r = await invoke("meta-ads", { action: "sync_leads_to_crm" });
        const j = await r.json().catch(() => ({}));
        result.ingest = r.ok && !j?.error
          ? { inserted: j?.inserted ?? 0, skipped: j?.skipped ?? 0 }
          : { error: j?.message || j?.error || `HTTP ${r.status}` };
      } catch (e) {
        result.ingest = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // ---- 2. bounded workflow catch-up ------------------------------------
    let fired = 0;
    const { data: wfs } = await admin
      .from("workflows")
      .select("meta_form_id")
      .eq("status", true)
      .not("meta_form_id", "is", null);
    const formIds = [...new Set((wfs ?? []).map((w: any) => String(w.meta_form_id)))];

    if (formIds.length) {
      const { data: leadRows } = await admin
        .from("leads")
        .select("id,name,phone,email,city,meta_form_id,meta_lead_id,created_at")
        .in("meta_form_id", formIds)
        .gte("created_at", CUTOFF_ISO)
        .order("created_at", { ascending: false })
        .limit(500);

      const candidates = (leadRows ?? []) as any[];

      // Processed-lead lookup, scoped to the candidates only. A single broad
      // "all runs" query silently truncates at the Data API's 1,000-row cap,
      // which made almost every lead look unprocessed and re-fired the whole
      // batch on every cron tick. Chunked lookups are paginated too, because a
      // single lead can own hundreds of run rows.
      const done = new Set<string>();
      const CHUNK = 40;
      const PAGE = 1000;
      const MAX_PAGES = 25;
      const collect = async (column: "meta_lead_id" | "contact_phone", keys: string[]) => {
        for (let i = 0; i < keys.length; i += CHUNK) {
          const slice = keys.slice(i, i + CHUNK);
          if (!slice.length) continue;
          const remaining = new Set(slice);
          for (let page = 0; page < MAX_PAGES && remaining.size; page++) {
            const { data: runs, error } = await admin
              .from("workflow_runs")
              .select("meta_lead_id,contact_phone")
              .gte("created_at", CUTOFF_ISO)
              .in(column, [...remaining])
              .order("created_at", { ascending: false })
              .range(0, PAGE - 1);
            if (error) throw error;
            const rows = (runs ?? []) as any[];
            for (const r of rows) {
              if (r.meta_lead_id) { done.add(String(r.meta_lead_id)); remaining.delete(String(r.meta_lead_id)); }
              if (r.contact_phone) { done.add(String(r.contact_phone)); remaining.delete(String(r.contact_phone)); }
            }
            // Nothing new resolved on a full page -> shrink the key set instead
            // of looping; the remaining keys are re-queried on their own.
            if (rows.length < PAGE) break;
          }
        }
      };

      const metaIds = [...new Set(candidates.map((l) => l.meta_lead_id).filter(Boolean).map(String))];
      const phones = [...new Set(candidates.map((l) => l.phone).filter(Boolean).map(String))];
      await collect("meta_lead_id", metaIds);
      await collect("contact_phone", phones);


      const unprocessed = candidates.filter(
        (l) => !(l.meta_lead_id && done.has(String(l.meta_lead_id))) && !(l.phone && done.has(String(l.phone))),
      );
      const pending = unprocessed.slice(0, MAX_CATCHUP);
      result.candidates = candidates.length;
      result.already_processed = candidates.length - unprocessed.length;


      for (let i = 0; i < pending.length; i += CATCHUP_CONCURRENCY) {
        await Promise.all(
          pending.slice(i, i + CATCHUP_CONCURRENCY).map(async (l) => {
            try {
              const r = await invoke("workflow-execute", {
                form_id: String(l.meta_form_id),
                lead_id: l.id,
                meta_lead_id: l.meta_lead_id ?? null,
                contact: { name: l.name, phone: l.phone, email: l.email, city: l.city },
              });
              if (r.ok) fired += 1;
            } catch (_) { /* best effort, retried next run */ }
          }),
        );
      }
      result.pending_found = pending.length;
    }
    result.workflows_fired = fired;

    await admin
      .from("job_state")
      .update({ lease_until: null, last_result: result as any, last_error: null })
      .eq("job", JOB);

    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("lead-sync-cron error:", msg);
    await admin.from("job_state").update({ lease_until: null, last_error: msg }).eq("job", JOB);
    return json({ ok: false, error: msg }, 200);
  }
});
