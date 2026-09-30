# Audit: Clinic vs Reports (Clinical Reports) — are they duplicates?

## Headline finding

There is **no duplicate data and no second copy of these reports**. The Reports module's "Clinical Reports" section does **not** contain its own reports — it simply points at the **exact same two pages** the Clinic module points at:

| Menu location | Menu item | Page opened |
|---|---|---|
| Clinic module | Download Reports | `/download-reports` |
| Reports → Clinical Reports | Download Reports | `/download-reports` (same page) |
| Clinic module | Productivity Report | `/productivity-report` |
| Reports → Clinical Reports | Productivity Report | `/productivity-report` (same page) |

Both menu entries are shortcuts to one page each. Same page, same numbers, same date filters, same data sources — because it is literally one page, not two implementations.

## What the two pages show

**Download Reports** — a date-range export screen (Excel/PDF/preview) covering 13 report sets: Appointments, Clinic Workflow (check-in, vitals, treatment plan, billing), Ortho Treatment, External Referrals, Patient Database, Lab Orders, Pharmacy/Prescriptions, Sterilization Log, Waste Management, Inventory, Purchases, Expenses.

**Productivity Report** — staff productivity: per-doctor/assistant appointment counts, productive hours (check-in to check-out), daily productive hours chart, treatment-wise hours and counts, and a recent-appointments list.

## Side-by-side comparison

Because both menu paths open the same page, every field matches exactly:

| Field group (Download Reports) | In Clinical Reports? | Status |
|---|---|---|
| All 13 report sets, date range filter, Excel/PDF/preview actions | Yes — same page | Identical |

| Field group (Productivity Report) | In Clinical Reports? | Status |
|---|---|---|
| Staff cards, productive hours, daily hours chart, treatment-wise hours/counts, recent appointments | Yes — same page | Identical |

## Data available only in the Clinic versions

None. Nothing is unique to either menu path.

## Calculation differences

None possible — one page, one set of calculations.

## Other places that reference these pages

- The app routes `/download-reports` and `/productivity-report` (must stay).
- The User Manual lists both pages with their routes — if the Clinic menu entries are removed, the manual entries should be re-pointed to the Reports module so instructions stay accurate.
- No workflow step, button, or PDF export links to them.

## Conclusion

Removing the two Clinic-module menu entries would remove **only the shortcuts**. The pages themselves stay live and reachable from Reports → Clinical Reports. No data view is lost and no workflow breaks.

## Follow-up (awaiting your approval — not done in this pass)

1. Remove the "Download Reports" and "Productivity Report" entries from the Clinic module menu only.
2. Keep the pages, routes, calculations, and Reports → Clinical Reports untouched.
3. Update the User Manual entries for these two pages to say they live under Reports → Clinical Reports.
