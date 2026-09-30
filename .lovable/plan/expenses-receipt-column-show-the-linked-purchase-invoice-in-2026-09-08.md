# Expenses Receipt column — show the linked purchase invoice in one preview

## Findings (read-only)

1. Storage
- Expenses keep their own uploaded file path in `expenses.receipt_url`, stored in the `expense-receipts` bucket.
- Purchases keep the invoice bill path in `purchases.invoice_file_url`, stored in a different bucket, `purchase-invoices`.
- Both are private; each file is opened through a short-lived signed link. Same pattern, different buckets — no shared column, no duplication.

2. The linked pair
- The join works today. Expense EXP-00257 ("Inventory Purchase — Inv PO-20260724-001 (JASH TISSUES)") has `purchase_id` set and resolves to the purchase whose invoice number is PO-20260724-001 and whose invoice file is a JPEG in `purchase-invoices`.
- That expense has no receipt of its own (`receipt_url` is empty), so only the purchase invoice exists for it.
- It is the only expense with a linked purchase right now.

3. Current View action
- No modal and no inline preview. The Receipt column renders a small "View" button that opens the file in a new browser tab via a signed link.
- The linked purchase invoice is already wired in: when both files exist the column shows "View (2)" with a small menu ("Uploaded Receipt", "Purchase Invoice — <invoice no>"); when only one exists it is a single "View"; purchase-sourced rows carry a small "From Purchase" hint. So the requested data link already exists — what is missing is a single view that shows both together with labels.

## Proposed change (display only)

Replace the new-tab behaviour in the Expenses Receipt column with one preview dialog.

- Clicking "View" opens a dialog titled with the expense number.
- The dialog lists each available file as a labeled block:
  - "Receipt" — the expense's own upload.
  - "Purchase invoice" — pulled from the linked purchase, with the invoice number and supplier shown as a caption.
- Images render inline; PDFs render in an embedded frame. Each block also has an "Open in new tab" and a "Download" link as a fallback.
- Expenses with no linked purchase show only the Receipt block — same information as today, just inside the dialog.
- Rows with no file at all keep the dash and no button.
- The small "From Purchase" hint under the button stays.

## Technical notes

- `src/pages/Expenses.tsx` only. Keep the existing `purchaseInvoiceMap` query, extend the selected columns with `supplier_name` for the caption.
- Add local state for the open row, and a small helper that resolves a bucket + path to a signed URL (5-minute expiry) for both `expense-receipts` and `purchase-invoices`; reuse the existing `openReceipt` / `openPurchaseInvoice` calls for the "Open in new tab" action.
- Use the existing dialog component; the two-item dropdown menu is no longer needed.
- No schema change, no storage writes, no change to the purchase-to-expense trigger, payment/delivery status logic, permissions, or CSV/PDF export.
