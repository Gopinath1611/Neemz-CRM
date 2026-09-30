# Restore lead stages, normalize spellings, stop duplicate activity logs

## Confirmed current state (read-only checks just run)

- `leads.status` today: `new_leads` 873, `new_lead` 708, `consultation_booked` 16, plus small counts of `not_clicking` (10), `not_reachable` (10), `partially_looking` (9), `interested` (5), `not_interested` (4), `callback` (3).
- Two spellings exist for the same stage: `new_lead` and `new_leads`. All app code (Pipeline stage definition, Lead detail, Leads page) uses `new_lead`, so `new_lead` is the canonical value and `new_leads` rows currently fall outside the "New Leads" stage filter.
- 753 leads have a latest logged stage in the activity log that does not match their current `status`. Breakdown of the latest logged stage for those 753: Appointment Booked 272, Not Clicking 134, Partially Looking 122, Callback 79, Not Reachable 63, Interested 54, Not Interested 25, Treatment Started 3, Reschedule 1.
- Temperature/"Status" values (`ai_priority`) were not reset: 574 rows are already `won` versus 569 leads whose latest logged status entry is `won`. So only the Stage column needs restoring.
- Duplicate-log cause is confirmed in code: `saveLeadData` in `src/components/pipeline/OpportunityDetail.tsx` compares the new values against the `lead` prop (`lead.status`, `lead.ai_priority`, …), which is stale after an earlier save in the same open dialog. A `baseline` state already exists in that component and is the correct comparison source.

## What will be done

### 1. Backfill stages from the activity log (data change)
For each lead, take the most recent `lead_activity` row with `action = 'stage'`, map its label to the stage value used by the app (`Appointment Booked` → `consultation_booked`, `Treatment Started` → `treatment_started`, `Not Clicking` → `not_clicking`, `Partially Looking` → `partially_looking`, `Callback` → `callback`, `Not Reachable` → `not_reachable`, `Interested` → `interested`, `Not Interested` → `not_interested`, `Reschedule` → `reschedule`, `New Lead` → `new_lead`) and write it to `leads.status` where it differs. Leads with no stage log are untouched. `ai_priority` is not touched, so the 574 "Won" leads keep their status.

### 2. Normalize stage spelling (data change)
Update every remaining `new_leads` row to `new_lead` so the New Leads stage filter matches all of them. Then confirm only one spelling remains.

### 3. Stop duplicate activity logging (code change)
In `src/components/pipeline/OpportunityDetail.tsx`, change the change-detection in `saveLeadData` to compare against the last-saved snapshot (`baseline`) instead of the `lead` prop, and update that snapshot immediately after a successful save. Same for the appointment-booking path, which sets `consultation_booked` directly. Result: a second save with no further edits logs nothing, so no more duplicate consecutive stage/status entries.

### 4. Verify filtered views and report numbers
After the backfill, open the Pipeline list view, apply Stage = "Appointment Booked" and separately Status = "Won", and report the exact row counts alongside the matching database counts so both can be compared side by side. Expected after backfill: `consultation_booked` ≈ 288 (16 existing + 272 restored) and `ai_priority = 'won'` 574 — final figures will be reported from the actual result, not from this estimate.

## Technical notes

- Steps 1 and 2 run as data updates (not schema migrations), scoped to `leads.status` only; `updated_at` will be left as-is so the audit trail is not distorted.
- No new activity rows are written by the backfill; it restores the state the log already documents.
- Step 4 is verified in the running app with a browser check plus direct database counts.
