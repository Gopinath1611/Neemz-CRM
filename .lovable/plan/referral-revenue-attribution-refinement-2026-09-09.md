# Referral Revenue & Attribution Refinement

## Goal
Make referral revenue reflect money actually collected, credited only to treatment done within 90 days of the referral — instead of the referred patient's entire lifetime invoiced amount.

## What changes

### 1. Collected money only
Referral revenue is calculated from payments actually received against the referred patient's bills, not from raised invoice amounts. Unpaid or partly paid bills only count for the part that has been collected.

### 2. 90-day attribution window
Only payments received within 90 days of the referral date count. Later, unrelated treatment for the same patient no longer inflates the referrer's figure.

### 3. Match unlinked referrals by phone
Referrals with no linked patient are matched to an existing patient by the last 10 digits of the referred phone number, and the link is stored so revenue can flow. Two of the four unlinked rows match today; the rest stay unlinked and simply show zero.

### 4. Recalculate existing rows
All 37 existing referrals are recalculated under the new rule. Expect some figures to change — for example one row currently shows ₹7,340 against ₹5,840 collected.

### 5. Remove the two demo rows
The legacy "Ramesh Kumar" referral (₹25,000, no real patient, no bills) and its duplicate are deleted. Total referral revenue drops accordingly and becomes real.

### Status rule
A referral counts as "Converted" only when attributed collected revenue is above zero. Rows manually set to converted keep their status; nothing is downgraded automatically.

## Technical detail

- Replace `public.sync_referral_from_billing()` with a version that:
  - resolves the referral by `referred_patient_id`, falling back to `normalize_phone_last10(referred_phone)` against `patients.phone` and backfilling `referred_patient_id`;
  - sums `billing_payments.amount` (joined via `billings.patient_id`) where `payment_date <= referrals.created_at + interval '90 days'`;
  - writes that sum to `revenue_generated`, sets `status = 'converted'` and stamps `converted_at` when the sum is above zero, never clearing an existing status.
- Add a matching trigger on `billing_payments` (AFTER INSERT/UPDATE/DELETE) so recorded payments — not invoice creation — drive the figure. Keep the `billings` trigger for the patient-link path only.
- One-off data pass (`run_sql`, not schema): backfill `referred_patient_id` by phone, recompute `revenue_generated` for all rows, delete the two demo rows.
- No schema columns added or dropped; `src/pages/Referrals.tsx` needs no change since it reads `revenue_generated` directly.

## Not touched
Billing, payments, Finance, Cash Drawer, WhatsApp, pipeline, purchases/expenses.
