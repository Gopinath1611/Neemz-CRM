# Reclassify Referral Income as a Referral Cost in Finance

## What is happening today

The Finance Dashboard card "Referral Income" reads from the External Referrals records (diagnostic orders). It sums the **Cost** field of referrals whose status is *Report Received* or *Reviewed*, dated inside the selected period.

For "This Month" it shows ₹0 because all 25 September referrals are still at status *Ordered*. Across all time only 9 referrals have reached Report Received / Reviewed (₹4,790 total); September referrals total ₹12,910 of cost, all still *Ordered*.

That figure is currently added to money received:
- Total Cash In = Current Collections + Old Dues Collected + **Referral Income**
- Net Cash Flow = Total Cash In − Total Expenses

Since this amount is what the clinic **pays** the scan centre / blood lab, counting it as income is wrong on both sides: cash in is overstated and the cost is missing from spending.

## The change

Treat referral cost as spending, not income.

1. Remove the "Referral Income" card from the Cash Flow section and remove it from Total Cash In.
   - Total Cash In = Current Collections + Old Dues Collected.
2. Add a new card **"Referral / Diagnostic Cost"** on the expense side, same source and same status rule as today (Report Received or Reviewed, dated in the selected period).
3. Include that amount in Total Expenses, so:
   - Net Cash Flow = Total Cash In − Total Expenses (now lower by the referral cost)
   - Operating Profit / Net Profit and Profit Margin also absorb it, since they already subtract Total Expenses.
4. Update the formula strips, tooltips, expense breakdown dialog, treatment reconciliation dialog, and the CSV / PDF exports so the label and side match everywhere.

No double counting: the expense records contain no diagnostic or referral category, so this cost is not recorded anywhere else in Finance today.

## Status rule question, answered by keeping today's behaviour

Only *Report Received* and *Reviewed* referrals are counted, exactly as now. *Ordered*, *Sample Collected* and *Cancelled* stay excluded, so an ordered-but-not-delivered test does not hit the books yet. As a referral moves to Report Received, its cost automatically appears in that period's expense.

## Technical notes

- Single file: `src/pages/Finance.tsx`. Display and aggregation only.
- Rename `referralIncome` to `referralCost` (same `diagnostic_orders` query, same filter), then:
  - `totalCashIn = totalCollectedAll` (drop the referral term),
  - `allExpenses = totalExpenses + totalPurchases + totalPayroll + totalLabCost + referralCost`,
  - `netCashFlow`, `profit`, `profitMargin` follow automatically.
- Update the `treatmentsByBilling` reconciliation `cashIn` field and the "Total Realized Cash" dialog to show referral cost as an outflow line rather than added revenue.
- Update export rows in the CSV and PDF builders (`Referral Income` → `Referral / Diagnostic Cost`, moved under expenses).
- No schema changes, no changes to External Referrals, Cash Drawer, Deposits, Payments, or the treatment-wise tables' billed/collected values.

## Verification

- TypeScript check passes.
- With "This Month": Referral cost ₹0, so Total Cash In and Net Cash Flow are unchanged from the current screen.
- With a range covering August: referral cost ₹490 (Reviewed) plus the August Report Received rows appears as expense and no longer as cash in.
