# Audit Report — July 2026 Collected: App vs Receptionist Sheet

Audit only. No code, data, or config was changed.

## 1. Verified numbers (queried from the live ledger)

All `billing_payments` rows with `payment_date` in July 2026, `amount > 0`:

| Bucket (how the Finance dashboard treats it) | Cash | UPI | Other modes | Total |
|---|---|---|---|---|
| Counted in "Collected (Actual Revenue)" | 289,250 | 224,419 | bank_transfer 50,000 · EMI 34,681 · insurance 3,319 · credit card 1,600 | **603,269** |
| Shown separately as "Previous Dues Collected" | 4,500 | 16,000 | — | 20,500 |
| Dropped: parent invoice is `cancelled` | 6,000 | — | — | 6,000 |
| **Raw July ledger total** | **299,750** | **240,419** | **89,600** | **629,769** |

Receptionist sheet: total 632,363 · Cash 309,255 · UPI 238,427 + 84,681.

## 2. Root causes of the gap, in order of size

**A. Previous dues are excluded from "Collected" by design (20,500).**
`billablePaymentsInRange` (Finance.tsx:316) keeps a payment only if the parent invoice was *also created inside the selected range*. In July, 10 payments (UPI 16,000 + cash 4,500) landed against pre-July invoices. They are not lost — they render in the separate "Previous Dues Collected" card (Finance.tsx:943). The receptionist's sheet is a pure cash-book: it records money received on the day, regardless of invoice date, so those 20,500 sit inside her Cash/UPI columns. This is the single largest structural difference, and it is intentional app behaviour, not a bug.

**B. The sheet's second UPI column is not UPI (84,681).**
`238,427 + 84,681` is treated as one UPI figure in the sheet. In the database that 84,681 is exactly `bank_transfer 50,000 + EMI 34,681`. The app classifies those as their own modes via `normalizeMode` in `src/lib/paymentMode.ts`, so they never appear in the UPI bucket of the mode breakdown even though they are fully inside Collected. Nothing is missing — only the label differs.

**C. Payments on a cancelled invoice are silently dropped (6,000).**
`nonVoidBillingIdSet` / `isRealPayment` (Finance.tsx:295-313) discard any payment whose invoice status is `cancelled`/`void`/`voided`. Two July cash payments totalling 6,000 sit on one cancelled invoice (`billings`: 1 cancelled row, total 3,000, amount_paid 3,000 — the invoice was cancelled *after* money was taken, and the recorded payments exceed the invoice total). The receptionist counted that cash because it physically came in. This is the one item worth a business decision: cash was collected, but the app treats it as non-revenue and there is no refund row to offset it.

**D. Non-cash modes appear to be logged as Cash in the sheet (4,919).**
Insurance 3,319 + credit card 1,600 exist in the ledger but there is no matching column in the sheet, and her Cash column is 9,505 higher than the ledger's cash. Most of that excess is these two modes being folded into Cash manually.

**E. Residual 2,594 has no corresponding rows in the database.**
Sheet 632,363 − ledger 629,769 = 2,594. The mode-level differences reconcile to exactly this figure (cash +9,505, UPI −1,992, other −4,919). So beyond the classification differences there is a genuine ~2,594 of sheet-side entry that never became a `billing_payments` row (or was entered at a different amount/date). Confirming this needs the sheet's line items — it cannot be located from the database alone.

## 3. What is NOT causing the gap

**Mixed / legacy payment tags are not a factor for July.** I checked specifically:
- Zero July rows have a composite `payment_method` (no `"cash, upi"` or `"cash:500, upi:1240"` shapes). Every row carries a single canonical key, so `parsePaymentSplits` never produces a `legacy_unknown` bucket and no amount is left out of Cash/UPI for this month.
- Zero July invoices have `amount_paid > Σ billing_payments`, so `synthesizeLegacyPayments` (`src/lib/paymentReconciliation.ts`) generates no synthetic rows either. Ledger and payment table are fully in sync for July.

The "Cash + UPI (Legacy)" display path exists and would matter for older months, but it contributes ₹0 here.

## 4. Reconciliation summary

```text
Receptionist sheet total                632,363
 − sheet-only entries with no DB row     (2,594)
 − insurance + credit card counted as cash in sheet, already in app  (0 net)
= Raw July ledger                       629,769
 − payments on cancelled invoice         (6,000)
 − previous dues (reported separately)  (20,500)
= App "Collected (Actual Revenue)"      603,269
```

Cash: 309,255 (sheet) → 289,250 (app) = 4,500 prev dues + 6,000 cancelled + ~9,505 sheet-side classification.
UPI: 238,427 + 84,681 (sheet) → 224,419 (app UPI) + 50,000 bank transfer + 34,681 EMI, with 16,000 moved to Previous Dues and ~1,992 of ledger UPI not reflected in the sheet.

## 5. Recommended next steps (no changes made)

1. Decide the policy for the 6,000 collected on the cancelled invoice — either reverse it with a refund entry or keep the invoice active with a `no_charge` adjustment, so cash-book and app agree.
2. Ask the receptionist to split her second UPI column into Bank Transfer and EMI, and to add Insurance / Card columns, which removes ~89,600 of apparent mismatch instantly.
3. Compare her July line items against the 323 ledger rows to locate the 2,594 residual.
4. If a pure cash-book view is wanted in the app, that is the "Cash Flow" vs "Same-Day Invoices" toggle concept — Collected + Previous Dues Collected already equals the cash-book figure once cancelled-invoice handling is settled.
