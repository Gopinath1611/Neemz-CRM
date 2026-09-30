# Patient Database — Add Treatment Type Column

## Goal
Add a new "Treatment Type" column to the Clinic → Patient Database list view, displaying each patient's treatment type(s) from their treatment plan items.

## Current State
- `src/pages/PatientDatabase.tsx` already queries `treatment_plan_items` joined to `treatment_plans` and builds a `treatments: string[]` array per patient (lines 218–239).
- This data is currently used only for the "All Treatments" filter dropdown, not displayed in the table.
- 2,476 patients exist; 804 have at least one treatment type recorded.
- A patient can have multiple treatment types (Set is already used for uniqueness).

## Proposed Changes
1. **Table column**
   - Insert a "Treatment Type" column in the list view, placed immediately after "Patient Name" and before "Mobile".
   - Header text: "Treatment Type".

2. **Cell rendering**
   - For patients with treatments, render each unique treatment type as a small badge/chip (e.g., using the existing `Badge` component).
   - If there are more than 2 distinct treatments, show the first 2 badges plus a "+N more" suffix to keep row height consistent.
   - For patients with no treatments, render "—" (consistent with other empty fields).

3. **Export rows**
   - Add a "Treatment Type" field to `buildExportRows()`.
   - Export value: comma-separated list of treatment types, or empty string when none.

4. **No schema or data changes**
   - Reuses the existing `treatments` array already fetched by the query.
   - No changes to `patients`, `treatment_plans`, or `treatment_plan_items` tables.

## Open Question
- Confirm column placement: after "Patient Name" (before "Mobile") is proposed. If you prefer it elsewhere (e.g., after "Source Tag" or at the end before "Last Visit"), reply and the plan will be adjusted.
