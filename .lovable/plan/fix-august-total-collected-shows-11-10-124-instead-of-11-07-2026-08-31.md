# Fix: August "Total Collected" shows ₹11,10,124 instead of ₹11,07,334

## What the ₹2,790 difference actually is (verified from data)

The card value breaks down like this:

```text
shown  11,10,124  =  11,05,334 (payments counted)  +  4,790 (referral income)
wanted 11,07,334  =  11,07,334 (real payments)     +  0
```

Two separate defects combine into the ₹2,790 gap (−2,000 missing payment, +4,790 referral):

### Defect 1 — ₹2,000 of real August payments is silently dropped
`Finance.tsx:103` fetches `billings` with no pagination, and there are **1,388 invoice rows** in the database. The backend caps an unpaginated read at 1,000 rows, so the 388 oldest invoices never arrive in the browser. `isRealPayment` rejects any payment whose invoice is missing from that list.

Verified: exactly **1 August payment of ₹2,000** belongs to an invoice outside the newest 1,000 — that is the missing amount.
`billing_payments` has 1,054 rows and hits the same cap (line 155), so it will start dropping payments too.

### Defect 2 — ₹4,790 referral income is added at the card only
`Finance.tsx:994` renders `totalCollectedAll + referralIncome`. For August, qualifying `diagnostic_orders` (status `report_received` / `reviewed`) total ₹4,790 (₹490 + ₹4,300). Referral money is not a patient payment, and it is already shown on its own "Referral Income" card (line 997), so it inflates Total Collected.

The rest of the maths is correct: total August payments are ₹11,16,583; ₹9,249 of that is advance/overpayment reported separately, which matches the expected ₹11,07,334.

## Changes

1. **Paginate the two Finance queries** (`src/pages/Finance.tsx`, lines 100–158)
   - Fetch `billings` and `billing_payments` in 1,000-row pages in a loop until a short page returns, so all rows load regardless of table size. This alone restores the ₹2,000 and future-proofs both datasets.

2. **Remove referral income from the Total Collected card** (line 994)
   - Display `totalCollectedAll` only. "Referral Income" stays as its own card.
   - This also makes the card agree with its own drill-down dialog and with the CSV/PDF exports (lines 776, 851), which already use `totalCollectedAll`.

Nothing else on the dashboard changes: `totalRevenue`, `outstanding`, and `profit` never included referral income, so no other card moves.

## Verification
- After the fix, August Total Collected should read **₹11,07,334**, and the drill-down total and exports should match it.
- Referral Income card continues to show ₹4,790 for August.
