# Pipeline Status Filter & Stage Check — Findings + Fix Plan

## What I checked (read-only)

Live data, with the same rules the Pipeline list uses (leads from 30 Jul onwards + campaign-form rule):

- Total leads: 991 — screen shows 991. Match.
- Appointment Booked: 282 — screen shows "282 leads of 991". Match.
- New Leads: 156 — the "156 New Leads" button matches.

So the filter numbers are correct — nothing is being lost or miscounted.

The lead in your screenshot (M Mani) is stored as **Appointment Booked** in the database, and the activity log shows the same. Booking an appointment from the lead card does change the stage to Appointment Booked automatically, assigns the owner, logs the activity, and refreshes the list. That flow is working.

## The real mismatch: confusing labels, not wrong data

1. The top dropdown is titled **"All Statuses"**, but its options are stage *groups* (New Leads, Interested, Callback, Appointment Booked, Diagnosed, Treatment Done, Not Interested / Lost). Inside the Filters panel the same control is titled **"Stage"**, while a *different* control titled **"Status"** actually filters the lead temperature (Hot / Warm / Cold / Won / Lost). Two different meanings for the same word.

2. Stage groups bundle several statuses. Choosing "Callback" also returns Not Reachable, Not Clicking, Partially Looking and Reschedule. So a lead marked "Reschedule" shows the badge "Callback" — it looks like a mismatch even though it is intended grouping.

3. "Interested" group also includes Contacted; "Diagnosed" also includes Treatment Started.

4. If a lead ever has an empty or unrecognised stage, the list silently shows it as **"New Leads"**. Today no lead is in that state, but this would hide bad data instead of showing it.

## Fix plan (presentation only, no data changes)

1. Rename the top dropdown to **"All Stages"** and keep only stage groups there, so it matches the Filters panel wording.
2. Rename the temperature filter from "Status" to **"Lead Temperature"** in the Filters panel, and rename the table column "Status" to "Temperature".
3. Add a second, precise **"Exact Stage"** dropdown in the Filters panel listing every individual stage (New Lead, Interested, Callback, Not Reachable, Not Clicking, Partially Looking, Reschedule, Appointment Booked, Diagnosed, Treatment Started, Treatment Done, Not Interested, Lost) for one-to-one filtering.
4. In the Stage column show the lead's exact stage name, with the group name as a small caption underneath, so "Reschedule" no longer reads as "Callback".
5. When a lead has no recognisable stage, show "Unknown" in grey instead of defaulting to "New Leads".

## Technical notes

- `src/pages/Pipeline.tsx`: `stages` group definitions, `stageForStatus` fallback, `filterStage` / `filterPriority` selects, Stage and Status table cells, and the `activeFilterCount` / `clearFilters` handling for the new exact-stage filter.
- Exact stage labels come from `allStages` already exported by `src/components/pipeline/OpportunityDetail.tsx` — reuse it, no new list.
- No database, edge function, or booking-logic changes.
