# Finance: fix the ₹1,00,000 discrepancy and unify revenue figures

## What the ₹1,00,000 actually is (verified in the database)

It is **not** a dummy invoice, deposit or capital transfer. It is two genuine patient payments received on 4 Sep 2026 against invoices raised in **August**:

- ₹50,000 UPI on 4 Sep against INV-MT16JVLF (Aug invoice, ₹1,02,000)
- ₹50,000 cash on 4 Sep against INV-MSYWO7VI (Aug invoice, ₹1,12,000)

Verified numbers for This Month (1–10 Sep 2026):

- Invoices raised this month: 102 invoices, ₹1,34,349 billed
- All cash received this month: ₹2,19,841
- Of that, old-dues cash (against pre-September invoices): ₹1,00,000
- Cash against this month's own invoices: ₹1,19,841
- Referral income this month: ₹0

So the two views were not disagreeing by accident — Revenue Management counts only this month's invoices and their payments, while the Dashboard was silently folding the ₹1,00,000 of old dues into both "Total Revenue" and "Total Collected". Adding collected cash into a *billed* figure is the actual defect.

## Fix 1 — one consistent set of figures, both views

Both the Finance Dashboard and Revenue Management will show the same four numbers for any selected period:

| Figure | This Month |
| --- | --- |
| Total Billed (invoices raised this period) | ₹1,34,349 |
| Collected (against this period's invoices) | ₹1,19,841 |
| Outstanding | ₹14,508 |
| Old Dues Collected (cash for earlier invoices) | ₹1,00,000 |
| Total Cash In (Collected + Old Dues + Referral) | ₹2,19,841 |

- "Total Revenue" on the Dashboard becomes billed-only — no old-dues cash mixed in.
- "Old Dues Collected" and "Total Cash In" become their own clearly labelled cards, so the money is never hidden but never double-counted either.
- Revenue Management gains the same two extra cards, so both pages read identically.
- Outstanding stays Billed − Collected, so it still reconciles exactly.
- Net Profit and Profit Margin keep using billed revenue; because billed revenue no longer includes the ₹1,00,000, profit becomes correct rather than inflated.
- Drill-down dialogs and the CSV / PDF exports are relabelled to match the same five lines.

## Fix 2 — Treatment-wise table shows clinical treatments only

- The table lists only real treatments from invoice line items, so BMP, Zirconia and the rest rank against each other honestly. The ₹1,00,000 no longer sits at the top with a 42.7% share.
- Share % is computed against clinical billed total only.
- Below the totals row, a visually separated reconciliation block shows the non-treatment amounts: Direct bills with no line items, Old Dues Collected (₹1,00,000), Referral Income, and a final "Total Cash In" line that ties back to the KPI card. Nothing disappears; it is simply out of the clinical ranking.

## Technical notes

All changes are confined to `src/pages/Finance.tsx`. No migrations, schema, trigger or data changes.

- `totalRevenue` (line 494) drops the `+ previousDuesCollected` term; `previousDuesCollected` is surfaced as its own displayed metric alongside a new `totalCashIn = totalPaid + previousDuesCollected + referralIncome`.
- `totalCollectedAll` / `totalCollectedWithReferral` are retained only to drive the new "Total Cash In" card; the "Collected" card uses `totalPaid`.
- In `treatmentRevenueBreakdown` (lines ~689–741), the injected `Uncategorized / Direct Bill` previous-dues and referral rows are removed from the returned rows array and returned instead as a separate `reconciliation` object consumed by the new footer block. The no-line-item direct-bill fallback and orphan-payment handling stay, reported in the reconciliation block rather than as a treatment.
- Both Dashboard and Revenue Management render the shared card set from the same memoized values, so the two views cannot drift again.
- Metric dialogs (lines ~3014, ~3200, ~3350, ~3442) and the CSV/PDF export blocks (~889, ~966) are updated to the new labels and formulas.
