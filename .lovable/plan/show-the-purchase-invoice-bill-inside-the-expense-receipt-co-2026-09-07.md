# Show the purchase invoice bill inside the Expense receipt column

Expenses that were created automatically from a Purchase are already linked to that purchase, but the Receipt column only ever shows the file someone uploaded by hand. The purchase's invoice bill file will now appear there too.

## New behaviour in the Expenses list

The Receipt column looks at two possible files for each row:

1. The receipt uploaded in the Add/Edit Expense form (unchanged).
2. The invoice bill attached to the linked purchase, when the expense came from a Purchase.

Display rules:

- Both files exist → one "View (2)" button; clicking it opens a small menu with "Uploaded Receipt" and "Purchase Invoice", each opening in a new tab.
- Only one file exists → single "View" button that opens it directly, exactly as today.
- Neither → dash, as today.
- Rows coming from a purchase get a small "From Purchase" hint under the button so it is clear where the invoice came from.

Nothing about adding or editing an expense changes — manual receipt upload stays the same, and the purchase invoice is read-only here (managed from the Purchase screen).

## Technical detail

- `src/pages/Expenses.tsx` only. Extend the expenses query to also select `purchase_id`, then fetch the matching `purchases` rows (`id, invoice_number, invoice_file_url`) for the linked ids and build a lookup map.
- Purchase invoice files live in the `purchase-invoices` storage bucket, receipts in `expense-receipts`; add a second signed-url opener for the purchase bucket alongside the existing `openReceipt`.
- Use the existing dropdown-menu component for the two-file case; no new dependencies, no schema change, no changes to the purchase → expense trigger.
- CSV export keeps its current receipt-number field; no export change.
