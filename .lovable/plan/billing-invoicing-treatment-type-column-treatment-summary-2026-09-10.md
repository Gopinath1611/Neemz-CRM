# Billing & Invoicing — Treatment Type column + treatment summary

Presentation-only work inside `src/pages/Finance.tsx` → `BillingSection`. No database, query or write changes: the line items are already fetched and date-filtered.

## What exists today

- Bills table has 11 columns: S.No, Date, Invoice, Patient, Doctor, Amount, Paid, Pending, Mode of Payment, Status, Action.
- Line items are already loaded and filtered to the selected period (`fBillingItems`, derived from the invoices in range). Each item carries a treatment name, quantity and line total.
- Top cards: Total Bills, Total Amount, Collected, Pending — driven by shared parent values so filters do not distort them.

## 1. New "Treatment Type" column

- Position: between **Doctor** and **Amount**.
- Build one lookup, per invoice, of its treatment names (in line-item order, duplicates merged, blanks skipped).
- Display rules:
  - Single treatment → one badge with the treatment name.
  - Multiple → first treatment badge + a muted "+N more" tag; hovering either shows the full list of names in a tooltip.
  - No line items → muted text "Direct / General".
- Long names truncate with ellipsis inside the badge; the tooltip always carries the full text.

## 2. Treatment-wise summary under the KPI cards

- A collapsible strip directly under the four KPI cards, titled "Treatment-wise summary", collapsed-state showing the treatment count and a "Show / Hide" toggle.
- When expanded: small chips, one per treatment, sorted by billed amount descending — e.g. `Composite Filling · 3 bills · ₹4,200`.
- Amounts come from the same period-filtered line items; a chip for "Direct / General" appears when invoices in the period have no line items, using those invoices' amounts.
- Chips are read-only (no filtering behaviour added), scroll/wrap on narrow screens, and the list caps at the top 12 treatments with a "+N more" chip whose tooltip lists the rest.

## 3. Constraints honoured

- Status chips (All / Paid / Partial / Pending / Cancelled / No Charge), Doctor select, search, date picker, pagination and delete flow stay exactly as they are.
- KPI card values and their formulas are untouched; the new strip sits beside them as extra context only.
- The table already scrolls horizontally in a wrapper; the new column is narrow (badge with truncation) so standard desktop screens gain no overflow, and the column hides on small screens where the treatment is visible via the invoice drill-down.

## Technical notes

- Two new `useMemo` values inside `BillingSection`: `treatmentsByBilling` (invoice id → names array) and `treatmentSummary` (name → {bills, amount}), both reading only `fBillingItems` / `fBillings`.
- One local `useState` for the collapsible strip.
- Reuses the already-imported `Badge` and `UITooltip` components; no new dependencies.
- `colSpan` on the empty-state row increases from 11 to 12.
