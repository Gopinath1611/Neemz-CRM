# Fix the processed-lead dedupe (stop the ~10-minute re-fire loop)

Backend-only change to `supabase/functions/lead-sync-cron/index.ts`. No UI, no schema change.

## The bug

The catch-up step builds its "already processed" set with one broad query:

```
workflow_runs.select("meta_lead_id, contact_phone").gte(created_at, CUTOFF).limit(20000)
```

The Data API caps responses at 1,000 rows, and 97,319 run rows exist in that window. So the set only ever holds the newest ~1,000 keys, almost every lead looks unprocessed, and up to 50 leads get re-fired on every cron tick.

## The fix

Stop asking for "all runs" and ask only about the candidate leads:

1. Keep the existing candidate query (leads on active forms since the cutoff, newest first).
2. Build the lookup keys from those candidates only: their `meta_lead_id` values and their `phone` values.
3. Query `workflow_runs` filtered to those keys, in chunks of ~100 keys per request (two chunked passes: one `in(meta_lead_id, ...)`, one `in(contact_phone, ...)`), selecting only the two key columns. Each response stays far below the 1,000-row cap, so nothing is silently dropped.
4. Mark a lead processed when either key matches. Only unmatched leads go to `workflow-execute`, capped at `MAX_CATCHUP` as today.
5. Record the diagnostic counts in `job_state.last_result` (`candidates`, `already_processed`, `pending_found`, `workflows_fired`) so the loop is visible if it ever returns.

Bounded work, single-flight lease, and the paused-state guard all stay exactly as they are.

## Verification

After deploy, capture the current stage for Sivasakthi, Ezhumalai S and one more previously-reset lead, then let two cron cycles pass (~20-25 min) and re-check:

- their `status` and `updated_at` in the leads table (should be unchanged),
- `workflow_runs` for their phone numbers (should show no new `Trigger: lead received` rows),
- the cron run result showing `pending_found` collapsing to near zero.

Reported back as a before/after table.

## The paused WhatsApp template

This fix removes the vast majority of the burn: those retries were re-runs of leads already processed, and they stop once dedupe works. It does not fix the template itself — `fl_checkout_google_review` is paused by Meta for low quality, so each genuinely new Meta lead will still hit one failed WhatsApp step. That needs separate handling, either:

- swap the workflow step to an approved template, or
- resubmit/replace the template in WhatsApp Manager, or
- add a guard that skips the step (logging "template paused") after repeated 132015 errors.

Say which you prefer and I'll do it as a follow-up.
