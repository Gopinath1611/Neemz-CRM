# Coupon redemption on the Payment page

Add coupon handling to the payment screen in the clinic workflow (`Payment` step), reusing the existing Coupons & Offers records from Offline Campaigns. No new tables or columns.

## What the user gets

1. **Coupon Code field** next to the existing Discount field on a selected invoice.
   - Type a code (e.g. `CPN-SCH001-002`) and press Apply.
   - The code is looked up in the campaign coupons list. If valid, the offer's percentage is converted into a rupee discount on that invoice and saved, exactly like a manual discount today.
   - The coupon is then marked Redeemed with today's date, so it cannot be used again.
2. **Coupon available banner** at the top of the payment screen.
   - When a patient is selected, their mobile number is matched (last 10 digits, ignoring +91/spaces/dashes) against offline campaign screening leads.
   - If that person has an unused, unexpired coupon, a small banner appears: `Coupon CPN-XXXXX available — Apply`.
   - Clicking Apply fills the Coupon Code field and applies it in one step.
   - Nothing shows when there is no pending coupon.

## Validation messages (plain English, shown as toasts)

- Code not found
- Coupon already redeemed
- Coupon expired on DD MMM YYYY
- No invoice selected yet
- Coupon belongs to a different phone number (only when the coupon's lead has a mobile that doesn't match the selected patient)

## How the discount is calculated

Coupons store a percentage (and an offer type such as discount / package / free consultation). Applied amount = invoice subtotal x percentage, capped at the subtotal, replacing the current discount on that invoice. The invoice total and payment status are recalculated the same way the existing manual discount already does, so paid/partial/pending stays correct.

## Data notes found while checking

- 15 coupons exist; only some have a `coupon_code` filled, and two demo rows share the code `CPN-C30000`. Lookup therefore picks the best candidate: unredeemed and unexpired first, most recent otherwise, and matches the patient's phone when possible.
- Coupons link to screening leads (offline campaign participants), whose mobile number is the matching key. Older rows without a code can still be surfaced by the phone-based banner only if a code exists; codeless coupons are ignored.

## Technical details

- Files changed: `src/components/workflow/PaymentStep.tsx` only (plus a small helper for coupon lookup/redeem if it keeps the file readable, e.g. `src/lib/couponRedemption.ts`).
- Reads `campaign_coupons` (code, discount_percentage, offer_type, expiry_date, redeemed, lead_id) and `screening_leads.mobile` for the phone match; reuses the existing last-10-digit normalisation pattern already used elsewhere.
- Writes: `billings.discount_amount/total_amount/payment_status` (existing update path) and `campaign_coupons.redeemed/redeemed_date`.
- No schema change, no migration, no changes to Offline Campaigns, coupon PDF/WhatsApp sending, billing items, or any finance KPI/report logic.
