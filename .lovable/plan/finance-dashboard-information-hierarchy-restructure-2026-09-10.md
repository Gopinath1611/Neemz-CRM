# Finance Dashboard information hierarchy restructure

## Scope
Update only the `FinanceDashboard` presentation inside `src/pages/Finance.tsx`. Keep every query, filter, formula, drill-down, export, chart dataset, route, permission, and other Finance section unchanged.

## Existing bindings to preserve
- Total Billed: `totalRevenue`
- Current-period collections: `totalPaid`
- Outstanding: `outstanding`
- Pending Bills: `pendingPayments().length`
- Old Dues Collected: `previousDuesCollected`
- Referral Income: `referralIncome`
- Total Cash In: `totalCashIn`
- Total Expenses: `allExpenses`
- Net Profit: `profit`
- Profit Margin: `profitMargin`
- Revenue vs Collection chart: existing `dailyRevenue()` output and chart configuration

## UI changes
1. Add a clear **Revenue & Receivables** section containing Total Billed, Collected (This Period's Bills), Outstanding, and Pending Bills in one responsive four-card group.
2. Add a **Cash Flow** section that visually communicates Current Collections + Old Dues Collected + Referral Income = Total Cash In, with Total Cash In emphasized and Total Expenses alongside it. Reuse the existing values only.
3. Add a compact **Profitability** section showing existing billed revenue, expenses, Net Profit, and Profit Margin in a professional equation-style summary. Make a negative result visually clear using the existing destructive color.
4. Keep **Revenue vs Collection (30 Days)** unchanged in calculation and move it immediately after the three summary sections.
5. Leave Expense Breakdown, Monthly P&L, Treatment-wise Revenue, dialogs, controls, and all later dashboard content intact and in their current relative order.
6. Preserve existing card click actions and add only concise accounting tooltips where useful.
7. Use responsive grids with no main-dashboard horizontal scrolling.

## Verification
- Confirm the dashboard still renders with the current date and branch controls.
- Verify each displayed value references the bindings listed above, with no duplicated or newly calculated financial source.
- Verify card drill-downs still open.
- Check desktop and mobile layouts and run the existing TypeScript validation.
