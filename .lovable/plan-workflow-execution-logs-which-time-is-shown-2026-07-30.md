# Workflow Execution Logs — which time is shown?

## Answer

The "Time" column in the Execution Logs dialog shows `workflow_runs.created_at` — the moment the **automation ran** (processing time), not the moment the user submitted the Meta form.

- Real-time webhook path (`meta-lead-webhook`): the run happens seconds after submission, so the time looks almost identical to the submit time.
- Manual/scheduled sync path (Connected Platforms → `meta-ads`): the run happens when the sync executes, so old leads pulled in a sync all show the **sync time**, not their real submit time.

The actual Meta submit time is already stored on the lead row (`leads.created_at`, taken from Meta's `created_time`).

## Proposed change (optional)

Show both times in the logs dialog so there is no ambiguity.

1. In the logs dialog, rename the current column to **Executed At** (still `workflow_runs.created_at`).
2. Add a new **Submitted At** column: for each run with a `meta_lead_id`, look up the matching lead and display `leads.created_at` (Meta submit time). Show "—" when no lead match (e.g. manual runs).
3. Both timestamps rendered in IST, same format as today.

## Technical notes

- File: `src/pages/WorkflowBuilder.tsx` (logs loader around line 375, dialog table around line 800).
- `workflow_runs` already has `meta_lead_id`; fetch leads with a single `.in("meta_lead_id", ids)` query and map client-side.
- No schema change, no migration, no edge-function change.
