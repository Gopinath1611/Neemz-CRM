# Treatment Profitability & Contribution Margin — Profit & Loss view

Display-only addition inside `src/pages/Finance.tsx` → `PnLSection`, placed directly below the "Profit Trend" chart. No queries, schema, writes or existing calculations change.

## What the data actually supports (verified)

- Treatment revenue: `billing_items.treatment_type` grouped over the period-filtered invoices — the same source already used by the audited Treatment-wise Revenue card. Revenue per treatment = each line's share of its invoice's net `total_amount` (so invoice-level discounts stay reconciled).
- Direct cost: the only cost record that carries a procedure-level descriptor is `lab_orders` (`work_type`, `material`, `tooth_number`, `rate`, `patient_id`) — already period-filtered as `fLabOrders`. There is **no** foreign key from a lab order to a billing line, and expenses (`fExpenses`, including the "Lab Charges" category) carry no treatment reference at all.
- Consequence: cost attribution is a **name match**, not a hard link. Lab orders whose `work_type` matches a treatment name (case-insensitive, trimmed, either side contained in the other) are attributed to that treatment; every other lab order and all lab-category expenses stay in a clearly labelled unattributed pool. Treatments with no matched lab cost show a dash, not a fabricated ₹0-margin figure.

## Table

Title: "Treatment Profitability & Contribution Margin"
Subtitle: "Analysis of procedure revenue, direct attributable costs (lab charges & material purchases), and gross margin."

| S.No | Treatment | Procedures | Revenue | Direct Cost | Gross Margin | Margin % |

- Procedures: sum of line `quantity` (fallback 1).
- Direct Cost: matched lab-order `rate` total; muted dash when nothing maps.
- Gross Margin: Revenue − Direct Cost (equals Revenue when no cost maps — the row then reads as "no direct cost recorded" via a small muted hint in the Direct Cost cell).
- Margin %: badge — emerald >60%, amber 30–60%, rose <30%; plus a thin progress bar.
- Footer row: totals for Procedures / Revenue / Direct Cost / Gross Margin and blended margin %.
- Below the footer, one muted line: unattributed lab cost total (lab orders that matched no treatment name) plus lab-category expenses, stated as overhead not allocated to any procedure — so the numbers reconcile against the Lab Costs KPI.

## Controls

- Default sort: Gross Margin descending. Clicking the Revenue, Direct Cost, Gross Margin or Margin % headers re-sorts (toggles asc/desc).
- Search box filtering treatment names.
- Pagination at 10 rows per page using the shared `TablePagination` control already used elsewhere in this file, with rows-per-page selector.
- Empty state: "No treatment billing in this period."

## Constraints honoured

- KPI cards (Total Revenue, Total Expenses, Net Profit, Profit Margin), the 6-month P&L bar chart and the Profit Trend line chart are untouched.
- No new fetches: reuses `fBillings`, `fBillingItems`, `fLabOrders`, `fExpenses`.
- Table wrapped in a horizontal-scroll container; S.No and Procedures hide on the narrowest viewports.

## Technical notes

- One new `useMemo` (`treatmentProfitability`) inside `PnLSection` returning rows plus the unattributed cost total, and local state for search, sort key/direction, page and page size.
- Revenue apportionment reuses the same gross-line-total → net-invoice-amount logic as the existing treatment revenue breakdown so both tables agree.
- Reuses already-imported `Badge`, `Card`, `Input`, `TablePagination`; no new dependencies.
