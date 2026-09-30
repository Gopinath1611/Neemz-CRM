# Add "Doctor Name" to Capture Screening Lead

Add an "Examined By (Doctor)" dropdown to the Screening Lead capture/edit form, backed by a new `doctor_name` column, and show it in the Screening Leads table.

## Changes

1. **Database migration** (one small, additive migration — requires approval):
   - Add nullable `doctor_name TEXT` column to `public.screening_leads`.
   - No new table, no RLS changes (table already has policies; text column inherits them).

2. **Form** (`src/pages/OfflineCampaigns.tsx`, lead dialog only):
   - Add a "Examined By (Doctor)" dropdown placed next to/after Chief Complaint, using the existing `useClinicMasters().doctorOptions` (same doctor list used across the app, deduped staff + master doctors).
   - Store selection in `leadForm.doctor_name`; include in `saveLead` insert/update payload; reset on dialog open.

3. **Table** (Screening Leads tab in same file):
   - Add a "Doctor" column showing `doctor_name` (em-dash when empty). Minimal width, light styling, no layout overhaul.

## Explicitly out of scope
- No other tabs, modules, or routes.
- No changes to other form fields, validation, or submit logic beyond the new field.
- No doctor_id/FK relationship — plain text name keeps it lightweight and consistent with how doctors are referenced elsewhere in this app.

## Technical notes
- Files touched: one migration + `src/pages/OfflineCampaigns.tsx`.
- Verify with TS check after implementation.
