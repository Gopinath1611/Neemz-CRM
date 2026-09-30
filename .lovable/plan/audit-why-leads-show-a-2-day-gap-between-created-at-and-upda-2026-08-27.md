# Audit: why leads show a ~2-day gap between created_at and updated_at

## What the data shows (verified)

- Every recent Meta lead has `created_at` in the past (17–25 Aug) but `updated_at` clustered today in two bursts: 05:41–05:43 and 05:52–05:54 UTC (364 rows in ~13 minutes). This is a bulk catch-up run, not per-lead slowness.
- `created_at` is deliberately backdated to Meta's `created_time` by the sync function, so the gap measures "time until the CRM first processed the lead", not row age.
- 1,444 leads have notes "Synced from Meta lead form" (polling path). **Zero** leads have ever been created by the webhook path ("Webhook lead…" notes = 0). So the Meta LeadGen webhook is effectively not delivering into the CRM today.
- `pg_cron` is not installed on this project — there is no server-side scheduler running lead sync or workflow execution.

## Root cause

Lead ingestion and workflow execution both depend on a **browser-triggered poll**, not on the webhook or a scheduler:

```text
Meta lead form
   |
   |-- webhook (meta-lead-webhook)  ->  never produced a lead row (not delivering/unsubscribed)
   |
   +-- polling: someone opens Lead Automation in the browser
         Lead Automation page (WorkflowBuilder)
           - runs sync on mount, on tab focus, and every 30s while open
           - calls meta-ads(sync_leads_to_crm) -> inserts leads with backdated created_at
           - then a catch-up loop finds leads with no workflow_run and fires workflow-execute
                 -> workflow-execute writes leads.updated_at  => the timestamp gap
```

Consequences: when nobody keeps that page open, leads accumulate on Meta's side and no workflow (CRM stage, staff assignment, WhatsApp welcome) fires. The next time the page is opened, the backlog is processed in one burst — exactly the 05:41 and 05:54 clusters, giving apparent 40–63 hour delays. The webhook code itself is synchronous and fast; it is simply never invoked. Pipeline's "Sync Now" is manual and also user-driven.

## Contributing details

- `meta-lead-webhook` and `meta-ads` both write leads synchronously and call `workflow-execute` inline — no queue, no delayed worker anywhere. So no backend batching is at fault.
- The catch-up loop is bounded by a hardcoded cutoff (`2026-07-29`) and a 2,000-lead read, and dedupes against `workflow_runs`; it is safe but only runs client-side.
- `workflow_runs` already holds ~29.7k rows, which will keep growing with each catch-up pass.

## Recommended fix (for a follow-up build task, not done in this audit)

1. Verify/repair the Meta webhook subscription for the `leadgen` field on the Dr Neemz Dentistry Page (the `meta-webhook-subscribe` function exists) and confirm the callback URL + verify token match the deployed `meta-lead-webhook`. This alone brings ingestion to near-real-time.
2. Add a server-side safety net independent of any open browser tab: a scheduled job (every 5–15 min) that calls the existing sync + a bounded workflow catch-up, with a single-flight lock, an item cap per run, and idempotent progress marking via `workflow_runs`.
3. Move the catch-up loop out of the page (keep only a manual "Sync Now") so lead processing no longer depends on someone viewing Lead Automation.
4. Optionally record an explicit `ingested_at` column so future latency can be measured without conflating Meta's `created_time` with CRM processing time.

## Scope note

This turn was read-only: backend function code and database timestamps were inspected; no files or data were changed.
