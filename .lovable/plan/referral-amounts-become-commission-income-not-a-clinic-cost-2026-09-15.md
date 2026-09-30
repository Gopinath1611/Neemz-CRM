# Referral amounts become Commission Income (not a clinic cost)

## What changes

Referral amounts stop behaving like money the clinic pays out and start behaving like commission the scan centre / lab pays the clinic.

1. Card renamed back to **Referral Income** in the Cash Flow section, styled as income (positive colour), not as an outflow.
2. Removed from Total Expenses, so it no longer reduces Net Profit or Net Cash Flow.
3. Added into Total Cash In: **Total Cash In = Current Collections + Old Dues Collected + Referral Income**.
4. Net Cash Flow and Net Profit therefore go up by this amount instead of down.
5. Recognition rule unchanged: only referrals at *Report Received* or *Reviewed*, dated inside the selected period. *Ordered* / *Pending* stay out.
6. Tooltip becomes: "Commission income receivable from scan centres and blood labs for referrals whose report has been received or reviewed in this period. Counted inside Total Cash In / Revenue."
7. Every place the amount is written out — Excel/CSV, PDF, the Total Expenses pop-up, the Net Profit pop-up, and the Total Realized Cash breakdown — is relabelled "Referral Income" and moved to the income side.
8. On the External Referrals page, the money labels change from "Cost" to "Commission" (the summary card, the table column, and the edit field), matching the Add Referral dialog which already says "Commission Amount".

Nothing about how referrals are recorded, stored, or which statuses exist changes. No database changes.

## Effect on today's numbers

Only 9 referrals have ever reached Report Received / Reviewed (₹4,790 in total). All 25 September referrals are still *Ordered* (₹12,910), so for "This Month" the card stays ₹0 and no dashboard figure moves. A range covering August will show the commission as cash in rather than as expense.

## Technical notes

- Single-figure rename in `src/pages/Finance.tsx`: `referralCost` → `referralIncome` (same `diagnostic_orders` query and same status filter).
- `allExpenses = totalExpenses + totalPurchases + totalPayroll + totalLabCost` (referral term dropped).
- `totalCashIn = totalCollectedAll + referralIncome`; `netCashFlow`, `profit`, `profitMargin` follow from the existing formulas.
- Formula strips updated: Total Expenses strip drops the referral term; Cash Flow strip adds it.
- `treatmentsByBilling.reconciliation`: `referralCost` → `referralIncome`, shown as an inflow line with its amount in the collected column and added into `cashIn`.
- CSV and PDF export rows relabelled and moved from the expense block to the cash-in block.
- `src/pages/ExternalReferrals.tsx`: label-only edits ("Total Cost" → "Total Commission", `Cost` column header → `Commission`, edit field label → `Commission (₹)`). Field name and stored data untouched.

## Verification

- TypeScript check passes.
- "This Month": Referral Income ₹0; Total Cash In, Net Cash Flow, Net Profit identical to the current screen.
- Range covering August: the ₹490 Reviewed referral plus August Report Received rows appear inside Total Cash In and are absent from Total Expenses.
