# Expenses List View — auditor-ready table under Expense Management

Adds a searchable, filterable expense table below the "Expense Category Breakdown" chart. Display-only: no new data fetching, no changes to the four KPI cards or the chart.

## What appears on screen

A card titled "Expenses List View" with:

| S.No | Date | Category | Vendor / Payee | Description | Payment Mode | Amount | Action |

- Category shown as a coloured badge, using the same colour each category already has in the breakdown chart above, so chart and table agree.
- Vendor / Payee comes from the expense's "paid to" field; a dash when blank.
- Description shows the description, falling back to notes; long text is truncated with the full text on hover.
- Payment Mode shown as a badge with a friendly label (Cash, UPI, Bank Transfer, Card, Cheque…).
- Amount right-aligned, rupee formatted with two decimals.
- Action: a receipt button that opens the attached bill in a new tab when the expense has one; otherwise a muted dash. No edit or delete here — those stay on the Expenses page, so this view cannot change any financial record.

## Filters and controls

- Search box: matches vendor/payee, description, notes, expense number and receipt number.
- Category dropdown, built from the categories actually present in the period (plus "All").
- Payment Mode dropdown, built from the modes actually present (plus "All").
- "Clear" appears when any filter or search is active.
- Pagination at 25 rows per page using the existing shared pagination control, with a rows-per-page selector.

## Reconciliation footer

- A footer row shows "Filtered Total" — the sum of every row matching the current search/filters (not just the visible page).
- Alongside it, "Period Total" shows the same figure as the "Total Expenses" KPI card. When no filter is active the two are identical, which is the reconciliation check; when a filter is active the difference is visible on screen.
- Row count shown as "N of M expenses".

## Technical notes

- `src/pages/Finance.tsx` only, inside `ExpensesSection`, rendered after the breakdown chart card.
- Uses the already-fetched `fExpenses` (expenses filtered by the active global date range). No new query, no refetch.
- Filtering/paging in memory via `useMemo`; local state for search, category, mode, page, page size.
- Category colour reuses the mapping behind `expenseByCategory()` so badges match the chart.
- Payment mode labels reuse `modeLabel` / `normalizeMode` from `src/lib/paymentMode.ts`.
- Receipt opens via a short-lived signed URL from the existing `expense-receipts` bucket (same pattern already used on the Expenses page). No uploads, no writes.
- Table wrapped in a horizontal-scroll container; S.No, Payment Mode and Description are hidden on the narrowest viewports to keep columns readable.

## Data note found while checking

The existing "Total Expenses" drill-down dialog lists a "Vendor" column reading a field named `vendor`, which does not exist on the expenses table — the real field is "paid to", so that column currently always shows a dash. The new table will read the correct field. Say the word if you also want that older dialog column corrected in the same change.

## Guardrails

- No database, schema, or write changes; read-only rendering.
- KPI cards (Total Expenses, Purchases, Salaries, Lab Costs), the breakdown chart, existing drill-down dialogs, CSV/PDF exports and all other Finance sections stay untouched.
