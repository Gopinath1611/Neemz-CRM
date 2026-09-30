# Fix lead visibility and duplicate handling in Pipeline

## What I found (read-only checks)

- The background sync ran at 07:50 UTC today with no error: 2,562 Meta leads fetched, 0 inserted, all skipped as duplicates.
- Newest lead in the database: today 08:35 IST. 62 leads in the last 2 days, 2,436 in total. The sync is alive.
- The newest Meta lead of all — `invisalign camp 12/09/2026`, arrived today 07:59 IST — is in the database but invisible in Pipeline, because Pipeline only shows leads whose form is attached to a Lead Automation workflow.
- Duplicate skipping has no time limit: a phone number that exists anywhere in the leads table is skipped forever, so a returning contact who fills a new campaign form never becomes a lead.

## What will change

### 1. Pipeline lead visibility

- Stop dropping leads whose Meta form is not attached to any workflow; they now appear in the list.
- Such a row gets a "Campaign form not linked" badge showing the raw campaign form name, so it is obvious the form still needs wiring in Lead Automation.
- Recruitment leads stay out of the sales pipeline: forms already classified as HR/recruitment, plus form names containing `job`, `hiring`, `telecalling` or `assistant`, are excluded. This keeps `Telecalling job`, `Hiring Digital Marketing Manager` and `Dental Assistant Female Job Ad` hidden as today.

### 2. Duplicate rule becomes time-bounded and form-aware

A Meta lead counts as a duplicate only when:

- the same phone already exists for the same campaign form, or
- the same phone submitted any form within the last 30 days.

Anything else is inserted as a fresh lead — so an older contact enquiring again, or the same person responding to a different campaign, is captured instead of silently dropped. Applied identically in both sync paths (scheduled sync and the Pipeline "Sync Now" button) so they cannot drift apart.

### 3. Sync result message

"Sync Now" reports three separate numbers instead of one: **Inserted**, **Skipped (duplicate)**, and **Unlinked** (leads that arrived on a form with no workflow attached). The message states plainly when 0 inserted simply means everything was already in the CRM, so it no longer reads as a failure.

## Verification

Re-run the sync and confirm: the invisalign camp lead is visible in Pipeline with the "not linked" badge, hiring leads are still absent, no duplicate rows were created for existing contacts, and the sync summary shows the three counts.

## Technical notes

- `src/pages/Pipeline.tsx` — `pipeline-leads` query: keep leads with an unmatched `meta_form_id` instead of filtering them out; derive a `formLinked` flag plus an HR/recruitment exclusion predicate; render the badge in the list and card views.
- `supabase/functions/meta-ads/index.ts` (`sync_leads_to_crm`, phone check ~lines 536-546) and `supabase/functions/meta-leads-sync/index.ts`: replace the unbounded `phone in (...)` existence check with a lookup that selects `phone, meta_form_id, created_at` for the candidate phones and applies the two duplicate conditions; keep in-batch dedupe per phone+form; count unlinked forms and return `inserted`, `skipped`, `unlinked` in the response.
- Both functions redeployed. No schema changes; `lead-sync-cron` scheduling, single-flight lease, and workflow-run dedupe stay as they are.
