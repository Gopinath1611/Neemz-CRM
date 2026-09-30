# Stop Showing Prior-Visit Findings on the Treatment Done Step

## Verified facts (checked in code AND on the live page)

1. **"Existing Findings (from previous visits)" is rendered in exactly one place:**
   - `src/pages/ClinicWorkflow.tsx` line 3870 — `<ExistingFindingsPanel />`, inside the `currentStep === "consultation"` block (lines 3861–4060).
   - A full search confirms no other page or component renders it. The Treatment Done step (`currentStep === "treatment_plan"`, lines 4064–4699) does **not** contain it.

2. **Live-page check (two patients, incl. one with 28 recorded findings):**
   - On `step=treatment_plan` the text "Existing Findings" does **not** appear.
   - What Treatment Done DOES show is a card titled **"Clinical Findings (Current Consultation)"** with a "View Dental Chart" button — this is `ClinicalFindingsSummary` (`src/components/dental/ClinicalFindingsSummary.tsx`, rendered at line 4119). It shows the current consultation's tooth findings, but because the consultation form persists across re-check-ins of the same workflow day, it can look like "previous" data.

3. **Consultation page is untouched:** the same panel and the same fetch (`fetchOpenFindings` in `src/lib/findingsLifecycle.ts`) stay exactly as they are for the Consultation step.

## What I believe you're seeing

The "Clinical Findings (Current Consultation)" card on Treatment Done. It is the only findings-related block on that step.

## Planned change (display-only)

**File: `src/pages/ClinicWorkflow.tsx` — one edit, ~4 lines removed**
- Remove the `<ClinicalFindingsSummary entries={toothEntries} generalFindings={consultGeneralFindings} />` block (line 4119–4122) from the Treatment Done step.
- Result: Treatment Done shows only the treatment rows table and Upcoming Treatments — no findings card, no "View Dental Chart" dialog, no findings fetch triggered by that card.

**Nothing else changes:**
- Consultation step keeps `ExistingFindingsPanel`, `ToothChart`, and all save/lifecycle logic untouched.
- `ClinicalFindingsSummary.tsx`, `ExistingFindingsPanel.tsx`, `src/lib/findingsLifecycle.ts` — zero edits (shared code not modified).
- No database query, table, or field changes. No impact on how findings are recorded or on the "fresh lifecycle" logic. The chart data still loads for other steps that need it (Treatment & Photos, History); only the display card on Treatment Done is removed.

## If you meant something else

If after this change you still see a "from previous visits" section on Treatment Done, send me a screenshot or the patient name + date — since that panel provably renders only on the Consultation step in the current code, that would mean a different page (e.g. History or Current Oral Status) is involved, and I'll trace it from the screenshot.

## Verification

- Typecheck passes.
- Live browser check on `step=treatment_plan` with a patient who has findings: confirm no findings card appears; then open `step=consultation` and confirm "Existing Findings (from previous visits)" still shows and works.
