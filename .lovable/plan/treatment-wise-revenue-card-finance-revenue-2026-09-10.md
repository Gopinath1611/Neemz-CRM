# Treatment-wise Revenue Card — Finance → Revenue

## Audit summary (read-only findings)

**Where treatment names live**
- Every invoice line is a row in `billing_items` with its own `treatment_type` (text), plus `description`, `tooth_number`, `quantity`, `unit_price`, `total_price`, `billing_id`.
- `treatment_plans` / `treatment_plan_items` also carry `treatment_type`, but they are *plans/estimates* (`estimated_cost`), not money. There is no foreign key from `billing_items` to plan items, so billing lines are the only reliable revenue source. Invoices themselves have no treatment column.
- So: treatment revenue = `billing_items.treatment_type` grouped over invoices in the selected period. This is exactly the source the existing "Revenue per Treatment" chart already uses.

**How collected money relates to a single treatment**
- `billing_payments` rows attach to an *invoice* (`billing_id`), never to a line item. When one invoice covers Root Canal + Cleaning, the receipt cannot be split at source.
- Therefore Collected per treatment must be **apportioned**: for each invoice, collected-in-period ÷ invoice total, applied to each of its line amounts. This is the same weighting technique already used for pending-amount-by-treatment (Receivables section, ~line 1869), so it stays consistent with the rest of the page.
- The card will state plainly that Collected per treatment is proportionally allocated, since receipts are per invoice.

**Date filter**
- `fBillingItems` is already derived from `fBillings` (invoices created inside `globalRange`), and `billablePaymentsInRange` holds period-bound receipts. Both are reused, so the card follows the top-right period picker ("This Month" etc.) automatically. No new queries or fetches.

## What gets built

A new card in the Revenue view, placed directly below the daily trend chart and above the existing "Revenue per Treatment" chart.

Contents — one row per treatment, sorted by billed amount descending:

| Treatment | Procedures | Billed | Collected | Share % |

- **Procedures**: sum of `quantity` (fallback 1 per line) across that treatment's billing lines.
- **Billed**: sum of `total_price`.
- **Collected**: apportioned share of period receipts (per-invoice ratio), rounded for display.
- **Share %**: treatment billed ÷ total billed of all lines in period, shown as a number plus a thin progress bar; top contributor gets a subtle "Top" badge.
- Footer totals row for Procedures / Billed / Collected so the numbers can be cross-checked.
- Empty state: "No treatment billing in this period."
- Responsive: the table scrolls horizontally on narrow screens; Procedures column hides on mobile.

## Technical notes

- One new isolated `useMemo` helper, `treatmentRevenueBreakdown`, reading only `fBillingItems`, `fBillings` and `billablePaymentsInRange`. It writes nothing back.
- `totalBilled`, `totalCollected`, `outstanding`, `collectionPct`, the daily chart and every dialog stay byte-for-byte unchanged.
- No migrations, no schema or column changes, no new data fetching, no changes outside `src/pages/Finance.tsx`.
