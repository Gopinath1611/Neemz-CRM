# 10 — QA Test Cases

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Finance — QA Testing Matrix

| # | User Action | DB Writes | Affected Tables | Expected UI | Dashboard Δ | Reports Δ | Validation |
|---|---|---|---|---|---|---|---|
| F1 | Create new bill ₹1000 | INSERT billings, billing_items | billings, billing_items | Bill row appears | Revenue +1000 | FinanceReport pending +1 | total_amount=1000 |
| F2 | Add payment ₹400 to F1 | INSERT billing_payments, UPDATE billings | billing_payments, billings | Partial badge | Collected +400, Outstanding +600 | FinanceReport daily chart +400 on today | amount_paid=400, status='partial' |
| F3 | Add payment ₹600 to F1 | INSERT billing_payments, UPDATE billings | billing_payments, billings | Paid badge | Collected +600 | Paid count +1 | status='paid' |
| F4 | Refund ₹200 (negative row) | INSERT billing_payments(amount=-200) | billing_payments, billings | Refund visible | Collected −200 | Daily chart −200 | amount_paid=800 |
| F5 | Cancel bill F1 | UPDATE billings(payment_status='cancelled') | billings | Strikethrough | Revenue −1000 | excluded from outstanding | excluded counts |
| F6 | Add manual expense ₹500 | INSERT expenses | expenses | Row in Expenses | Expense KPI +500, Profit −500 | FinanceReport expense +500 | expense_number=EXP-... |
| F7 | Create purchase ₹3000, mark Paid | INSERT purchases/items, UPDATE status; triggers fire | purchases, purchase_items, expenses, inventory_items, inventory_transactions | Green row | Expense +3000, Inventory value ↑ | — | auto-expense exists |
| F8 | Switch branch | none | none | Filter applied | Most money KPIs unchanged ⚠ | unchanged ⚠ | known limitation §11.1 |
| F9 | Date filter change | none | none | Re-query | All KPIs recompute | charts redraw | from/to honored |
| F10 | Add deposit ₹2000 | INSERT deposits | deposits | Deposit row | Not in Collected KPI | — | open status |
| F11 | Ortho payment ₹1500 | INSERT orthodontic_payments | orthodontic_payments | Case row | Not in Finance Collected ⚠ | — | known gap §17.7 |
| F12 | Pharmacy dispense | UPDATE inventory_items | inventory_items, inventory_transactions | Stock ↓ | No revenue booked ⚠ | — | known gap §17.6 |

## Smoke test checklist
- [ ] Login as admin
- [ ] Open Finance → numbers load < 3s
- [ ] Run F1 → F3 → verify Collected and Outstanding update
- [ ] Run F6 → verify expenses count
- [ ] Open `/system-documentation` → all docs render

## Regression-critical files
`Finance.tsx`, `FinanceReport.tsx`, `PaymentStep.tsx`, `Expenses.tsx`, `Purchases.tsx`, triggers `sync_purchase_to_expense` + `handle_purchase_inventory_update`.
