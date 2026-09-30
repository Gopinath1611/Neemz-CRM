# Make the Meta workflow CRM step stage-safe

Backend-only change to `workflow-execute`. No UI files touched, no schema change, no backfill in this step.

## Behaviour after the change

The "Add/Update to CRM" step keeps running, but it stops being able to move a lead backwards:

- If the lead's current stage is New Lead (`new_lead` / `new_leads`) or empty, the configured stage is applied as today (first ingestion).
- If the lead's current stage is anything else (Appointment Booked, Callback, Interested, Won, etc.), the stage is left exactly as staff set it.
- The step still updates the other configured fields (pipeline/source, lead value) as before, so nothing else about the workflow changes.
- The run log records the skip clearly: `CRM updated -> Meta Ads (stage kept: Appointment Booked)` instead of claiming it set New Leads, so the Workflow Runs view stays honest.

## Technical detail

In `supabase/functions/workflow-execute/index.ts`, inside the `add_update_crm` branch:

1. Read the lead's current `status` from the already-loaded `lead` record (re-fetch it right before the update so a concurrent staff edit is respected).
2. Only include `status` in the update payload when the fresh current status is null/empty or normalises to `new_lead`.
3. Build the log line from what was actually written.

Deploy the function and verify against a lead that currently sits at a non-New stage (for example Sivasakthi) by triggering a run and confirming the stage is untouched and the run log shows the skip.

## Not included here (say the word and I'll do them next)

- Fixing the 1,000-row dedupe cap that makes the workflow re-fire every ~10 minutes. With this change the re-fires become harmless for stages, but they still burn quota and retry the paused WhatsApp template.
- Backfilling the 737 leads already reset to New Lead.
- The duplicate activity-log writes from the lead detail dialog.
