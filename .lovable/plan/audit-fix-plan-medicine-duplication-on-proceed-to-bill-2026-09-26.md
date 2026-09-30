# Audit + Fix Plan: Medicine duplication on "Proceed to Bill"

## Audit findings (from code reading; to be confirmed with one real patient before editing)

All logic is in `src/pages/ClinicWorkflow.tsx`.

1. **Applying a template does not append.** `applyPrescriptionTemplate` (~line 1770) *replaces* the prescription list (`setMedicines(items)`). No effect/listener re-fires it. The template itself is not the direct cause, unless the template contains the same medicine twice (then two lines are carried through, with no dedupe).

2. **Real cause: how medicine bill lines are matched.** "Proceed to Bill" (~line 5679) and Save Bill (`handleSaveBilling`, ~line 2892) both call `mergeExistingBillingItems`. It matches existing bill lines to freshly generated ones using `buildBillingItemIdentity` = treatment type + **description** + tooth. For medicines, `buildPrescriptionBillingItems` builds the description from name + timing (M/A/E/N) + duration, e.g. `Amoxicillin (M:1, N:1) 5 days`.
   - If staff click Proceed to Bill, go back, then apply a template or change timing/duration, the description changes. The old line no longer matches, so it is kept as an "extra/manual" line, and the new line is added too. That's the duplicate.
   - The same thing happens when a saved, unpaid bill is reopened: its lines come back tagged "manual" (`loadOrPopulateBilling`, ~line 1742). Any medicine with changed timing then shows up twice.

3. **Saving to the database.** Updating a bill deletes and re-inserts `billing_items` (~line 2922), and saving is already protected against double clicks (`runLocked("billing")`). So the backend faithfully saves whatever duplicates are on screen. `billing_items` has no unique key per medicine, and none is needed.

4. **The "Proceed to Bill" button** only changes what's on screen and is safe to click twice. It has no lock, though.

## Fix (only these areas)

1. **Match medicine lines by medicine name.** In `mergeExistingBillingItems`, use a medicine-specific identity for lines with treatment type "Medicine": the normalized medicine name taken from the start of the description. Timing and duration are left out. Old lines for the same medicine are then *replaced* by the current prescription line, never kept alongside it. Treatment, lab and manual lines keep their current matching.
2. **Merge repeated medicines when building the bill.** In `buildPrescriptionBillingItems`, combine lines with the same medicine name and same timing/duration by adding up their quantities. Different dosages of the same medicine stay separate.
3. **Dedupe when a template is applied.** In `applyPrescriptionTemplate`, drop repeated rows that have the same name, timing and duration.
4. **Lock the Proceed to Bill button.** Disable the prescription "Proceed to Bill" button while it runs, using the existing `runLocked`/`isBusy` pattern.

## Not touched
Billing totals, prices, discounts, tax, payments, inventory deduction, schema, lab-order Proceed to Bill, manual medicine additions (still work as before), and all other workflow steps.

## Verification
- Apply a template, Proceed to Bill, go back, change a duration, then Proceed again. Each medicine should appear once.
- Reopen a saved unpaid bill. There should be no duplicates.
- Save the bill and check that its `billing_items` count equals the number of distinct medicines plus treatments.
