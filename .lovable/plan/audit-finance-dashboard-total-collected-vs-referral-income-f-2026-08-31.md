# Audit — Finance Dashboard "Total Collected" vs "Referral Income" (findings only)

## 1. Total Collected card
- Rendered at `src/pages/Finance.tsx:994`: value = `totalCollectedAll + referralIncome`.
- `totalCollectedAll = totalPaid + previousDuesCollected` (line 539); `totalPaid = totalCollected` (line 477).
- `totalCollected` (lines 445–454) = de-duped (by payment `id`) sum of `amount` over `billablePaymentsInRange`.
- `billablePaymentsInRange` (line 368) = `fPayments` filtered by `isRealPayment(p)` AND `billableIdSet.has(p.billing_id)`.
  - `fPayments` = merged payment ledger (`billing_payments` + legacy synthetic rows from `billings.amount_paid` via `mergeWithLegacyPayments`) filtered by `payment_date` inside the global range (line 299).
  - `isRealPayment` excludes amount 0/non-finite and `status` in failed / cancelled / refunded / void (lines 361–364).
  - `billableIdSet` comes from `billableBillings` = billings created in range, excluding `payment_status` cancelled/void/voided and ₹0 no-charge invoices (lines 307–325).
- `previousDuesCollected` = in-range payments against invoices billed before the range (the dues portion, from `previousPeriodPayments` / `previousDuesSplit`).
- **Referral income is ALREADY included** in the displayed Total Collected — it is added at the card level only (line 994), not inside `totalCollected` / `totalCollectedAll`.

## 2. Referral Income card
- Query at lines 246–252: `supabase.from("diagnostic_orders").select("id, status, cost, created_at")` — **table is `diagnostic_orders`, not `screening_leads`**.
- `qualifyingReferrals` (lines 329–333): `status` in `["report_received", "reviewed"]` AND `inGlobalRange(o.created_at)`.
- `referralIncome` (lines 334–337) = sum of `cost` over those rows.
- Card rendered at line 997 (`StatCard label="Referral Income"`, no click dialog).
- Statuses `ordered`, `sample_collected`, `cancelled` are excluded.

## 3. Date-range filter interaction
- Both respect the same top-of-page selector: `useDateRangeFilter("today")` → `globalRange`, applied through `inGlobalRange` (lines 265–276).
- Total Collected: filtered by `payment_date` (payments) plus invoice `created_at` for the billable set.
- Referral Income: filtered by `diagnostic_orders.created_at`.
- Neither is "All Time"; the queries fetch all rows but filtering happens client-side against `globalRange`.

## 4. Double-counting risk
- Referral income is already added once into the Total Collected card (line 994) — adding it again would double-count that card.
- `totalRevenue = totalBilled + previousDuesCollected` (line 480) — sourced only from `billings` / payments; contains **no** `diagnostic_orders.cost`.
- `profit = totalRevenue - allExpenses` (line 540) and `profitMargin` — therefore also exclude referral income.
- The `totalRevenue` dialog's "Referral / Special Revenue Streams" block (lines 2768–2841) uses the `referrals` table joined to invoices already in `totalBilled`; it is labelled informational / non-additive, so it is a subset of billed revenue, not extra income.
- `diagnostic_orders.cost` appears nowhere else in the dashboard aggregates — no indirect inclusion elsewhere.
