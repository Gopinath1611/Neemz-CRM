# Audit / Drill-Down View for "Collected (This Period)" Card

## Goal
Enhance the click dialog of the **Collected (This Period)** StatCard on the Finance dashboard so it shows a detailed, per-transaction breakdown of every receipt that makes up the total — instead of only the Cash/UPI mode summary.

## Strict constraint
UI-only change to the `case "collected"` block inside the metric dialog in `src/pages/Finance.tsx` (lines ~2633–2653). No calculation logic, no query changes, no new data fetching.

## What to build
Inside the existing `case "collected"` dialog:

1. Keep the existing **Breakdown by payment method** section as a compact summary at the top (modeLabel + amount + total), so the mode total is still visible.
2. Add a new **"Payment Transactions (this period)"** table listing every row in `billablePaymentsInRange` (the same array that already feeds `totalCollected`).
   - Each row maps `billing_id` → the matching billing record via a local `billingsById` map (built from `billings`, same pattern used in the Previous Dues dialog at line ~1061), and `patient_id` → patient name via the existing `getPatientName` helper.
   - Columns:
     | Payment Date/Time | Invoice # | Patient Name | Payment Mode | Amount |
   - Payment Date/Time: format `payment_date` with `format(d, "dd MMM yyyy, hh:mm a")` (date-fns, already imported).
   - Invoice #: `b.invoice_number || b.id.slice(0,8)` from the linked billing; show "—" if no billing found.
   - Patient Name: `getPatientName(b.patient_id)`.
   - Payment Mode: `prettyPaymentMethod(p.payment_method)` (already imported) for split-aware display.
   - Amount: `₹{Number(p.amount).toLocaleString("en-IN")}`, right-aligned, success color.
   - Sort newest-first by `payment_date`.
   - De-dupe by `p.id` (same `seen` Set guard used in `totalCollected`) so rows match the displayed total exactly.
   - Footer row summing the amount column to `totalPaid` for cross-verification.
3. Make the dialog wider for the table: bump `DialogContent` to `max-w-3xl` and add scroll (`max-h-[85vh] overflow-y-auto`, already present) so the table scrolls within the dialog.
4. Empty state: if no transactions, show "No payments collected in this period."

## No changes to
- `billablePaymentsInRange`, `totalCollected`, `totalPaid`, `outstanding`, profit/margin calculations.
- Queries / data fetching.
- Other metric dialog cases.
