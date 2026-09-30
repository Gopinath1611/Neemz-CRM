# Split Invoice Bill and Receipt into two columns on Expenses

## What changes

The Expenses list gets a new **Invoice Bill** column placed just before **Receipt**.

- **Invoice Bill** — the vendor/purchase invoice document that belongs to the linked purchase (e.g. the JASH TISSUES bill). A blue document icon opens it; a dash when the expense has no linked purchase or that purchase has no invoice file.
- **Receipt** — strictly the payment proof uploaded on the expense itself (voucher, cheque slip, bank receipt). Same icon style; dash when nothing is uploaded.

Clicking either icon opens the preview dialog showing **only** that one document, with Open in new tab and Download. The invoice preview keeps its caption (invoice number — supplier). No more mixed "View (2)" behaviour in one column.

The "From Purchase" hint moves under the Invoice Bill icon, where it belongs.

## One thing worth knowing

Standalone expenses (no linked purchase) have only one uploaded file today — the receipt on the expense record. There is no separate vendor-invoice field for them, so their Invoice Bill cell will show a dash. Adding a second upload slot for manual expenses would need a schema change, which is out of scope here.

The existing combined-PDF view (invoice page 1 + proof page 2) is kept as an extra button inside the invoice preview, so nothing already built is lost. Say the word if you'd rather drop it entirely.

## Technical notes

- `src/pages/Expenses.tsx` only. No migration, no storage or bucket change, no change to the purchase→expense trigger, permissions, or exports.
- Table header: insert `<TableHead>Invoice Bill</TableHead>` before the Receipt head; bump the empty-state `colSpan` by 1.
- Row: split the current single cell into two cells. Invoice cell reads `purchaseInvoiceMap[e.purchase_id]?.invoice_file_url` (bucket `purchase-invoices`); receipt cell reads `e.receipt_url` (bucket `expense-receipts`).
- `openReceiptPreview` is replaced by a single `openDocPreview(e, kind)` that resolves just the requested file via the existing `resolveFile` helper; the dialog title becomes "Invoice Bill — <expense no>" or "Receipt — <expense no>".
- Combined PDF build (`buildCombinedPdf`) runs only in the invoice preview and only when both files exist; blob URL still revoked on close.
