# Fix Pharmacy list Cost and Payment Status

## What is wrong (confirmed on PT1021 / Chandru V)

The bill for this visit (INV-MTSS7V3I) is fully paid, ₹1,165 total, and its medicine lines are exactly:

- Zenzive Mouth Wash — ₹75
- RA Thermoseal Tooth Paste — ₹90
- (plus a Scaling treatment line of ₹1,000, which is not a medicine)

So the pharmacy medicine amount is ₹165 and it is Paid.

The Pharmacy page ignores the bill entirely and invents its own number:

1. **Cost** = master selling price of the medicine × a quantity guessed from the prescription text. "Duration 30" with "Morning-1, Night-1" becomes quantity 30, so ₹75 and ₹90 balloon to ₹7,650. It is not mixing in treatment fees — it is multiplying by the course length instead of the dispensed/billed quantity.
2. **Payment Status** compares that invented cost against the *whole visit's* paid amount (₹1,165 paid vs ₹7,650 "due"), which is why a fully paid bill reads "Partial".
3. **Total Cost KPI (₹10,83,949)** is just the sum of these invented per-patient costs, so it is inflated the same way.

## The fix

Make the bill the single source of truth for money on this page.

- For each visit/patient, read only the bill lines whose type is `Medicine` and sum `quantity × unit price`. Treatment lines (Scaling, fillings, etc.) are excluded by that filter.
- Show that medicine-only sum in the **Cost** column and in the detail dialog.
- **Payment Status** for the medicine portion:
  - No bill at all for the visit → "Not Generated"
  - Bill exists, nothing paid → "Pending"
  - Bill part-paid, and the amount paid does not yet cover the medicine portion → "Partial"
  - Bill's paid amount covers the medicine portion (including a fully paid bill) → "Paid"
- When a prescription exists but was never billed, Cost shows the current estimate as before, clearly treated as not generated — no money is claimed as due.
- **Total Cost KPI** and **Medicine-wise Sales** amounts then follow the same medicine-only billed figures, so the totals stop being inflated.

## Technical notes

- File: `src/pages/Pharmacy.tsx` only.
- Fetch `billing_items` (chunked `in()` on billing ids, same chunking pattern already used) alongside the existing `billings` query in `fetchPaymentStatus`, filtering `treatment_type = 'Medicine'`; build a per-checkin and per-patient medicine subtotal map.
- Replace `computeItemCost`-driven `total_cost` for billed groups with the billed medicine subtotal; keep `computeItemCost` only as the unbilled estimate.
- Replace `derivePharmacyStatus(total_cost, pay.paid)` with a comparison against the medicine subtotal plus bill existence, and use the same helper in the filter, the table row, and the detail dialog so the filter and badge never disagree.
- No schema, trigger, stock-deduction, or billing-write changes. Display/aggregation layer only.

## Verification

- PT1021 shows Cost ₹165 and Paid.
- Spot-check a partially paid patient (e.g. PT3372) and a "Not Generated" patient (e.g. PT3305) still read sensibly.
- Total Cost KPI recomputed and reported before/after.
