# Cash Reconciliation Verification with Tagged Mock Data

Insert one clearly-tagged mock day and compare the four numbers side by side. No existing row is touched, no code or formula changes, no schema changes.

## 1. Where each screen reads from (verified in code)

| Screen | Table(s) read | Key columns used |
|---|---|---|
| Cash Drawer | `cash_drawer_days`, `cash_drawer_expenses`, `billing_payments`, `deposits` | `drawer_date`, `opening_total`, `closing_total`, `expense_date`+`amount`, `payment_date`+`payment_method`+`amount`, `deposits.source='cash_drawer'` with `drawer_date` (fallback `deposit_date`) |
| Deposits (Finance) | `deposits` | `deposit_date`, `deposit_amount`, `source`, `drawer_date`, `status` |
| Payments (Finance) | `billing_payments` (+ synthetic rows derived from `billings` when `amount_paid` exceeds recorded payments), `deposits` for the settlement strip | `payment_date`, `amount`, `payment_method` |

Neither cash drawer nor deposits are branch-scoped — these tables have no `branch_id`. Date is the only key.

## 2. Exact formulas in use today

- Cash Drawer "Received Today" = sum of `billing_payments.amount` where `payment_date` falls in the day AND `payment_method` contains the word "cash".
- Expected Cash = `opening_total` + Received Today − drawer expenses for the day.
- Bank Deposits (drawer) = sum of `deposits.deposit_amount` where `source='cash_drawer'`, status not Cancelled, and `drawer_date` (or `deposit_date`) = the day.
- Net Closing Cash = Expected Cash − Bank Deposits.
- Variance = counted closing cash − Net Closing Cash.
- Payments page: cash total = sum of payment rows classified as Cash mode for the selected range; settlement strip shows Cash Collected, Remitted to Bank (drawer-sourced deposits in range), Retained = difference.

So "tally" precisely means: Payments cash total = Drawer Received Today, and opening + cash-in − drawer expense − drawer deposit = counted closing (variance zero).

## 3. Test-data identification

There is no existing test flag or test branch. No migration is needed — every table involved already has a free-text field:

- Patient: first name `TEST-MOCK`, last name `DO-NOT-USE`, phone `9000000001`.
- `billings.notes`, `billing_payments.notes`, `cash_drawer_days.notes`, `cash_drawer_expenses.reason`, `deposits.remarks` each contain the exact string `MOCK DATA — DELETE AFTER VERIFICATION`.
- `deposits.deposit_no` = `MOCK-DEP-001`, `billings.invoice_number` = `MOCK-INV-001`.

Test date: **2026-12-31** — a future date with no real transactions and no existing drawer day, so no real daily total can be disturbed.

## 4. Rows to insert (preview — nothing runs until you approve)

1. `patients` — 1 row: TEST-MOCK DO-NOT-USE.
2. `billings` — 1 row, invoice `MOCK-INV-001`, total 3,500, amount_paid 3,500, status paid (amount_paid deliberately equals the payment rows so no synthetic reconciliation rows appear).
3. `billing_payments` — 4 rows dated 2026-12-31, all linked to that mock bill:
   - Cash ₹1,000
   - Cash ₹500
   - UPI ₹1,000
   - NEFT ₹500
   - Bank Transfer ₹500
   (total ₹3,500; cash portion ₹1,500)
4. `cash_drawer_days` — 1 row for 2026-12-31: opening ₹2,000, closing counted ₹2,200.
5. `cash_drawer_expenses` — 1 row: ₹300, reason tagged as mock.
6. `deposits` — 1 row: ₹1,000, `source='cash_drawer'`, `drawer_date='2026-12-31'`.

Expected arithmetic: 2,000 + 1,500 − 300 − 1,000 = **2,200** closing, variance ₹0.

## 5. After inserting

Report a four-number table — Payments cash total, Drawer cash-in, Deposit amount, Drawer closing (plus Expected/Net Closing and variance) — read back from the live pages, with a plain YES/NO on whether they tally. If any number disagrees, report the exact mismatch and cause and stop; no fix in this pass.

## 6. Clean-up (one step)

```sql
delete from deposits where deposit_no = 'MOCK-DEP-001';
delete from cash_drawer_days where drawer_date = '2026-12-31';
delete from patients where first_name = 'TEST-MOCK' and last_name = 'DO-NOT-USE';
```
Cascades remove the mock billing, its payments and the drawer expense. Exact inserted row IDs will also be listed.

## Safety notes

- Triggers that will fire: dedupe-key stamping, activity logging, and referral revenue recompute — the latter only recomputes for the mock patient, who has no referrals, so no real referral figure changes.
- Because the mock day is 31 Dec 2026, it can only appear in reports if someone deliberately selects a range covering that future date.
