# Bulk download invoice bills and payment receipts as ZIP

Add two bulk download actions to the Expenses page so a whole month (or any active date range) of documents can be pulled down in one click for audits.

## What changes for the user

Next to the existing CSV and PDF buttons at the top right of Expenses, a new **Download** dropdown appears with:

- Download Invoices (ZIP)
- Download Receipts (ZIP)

Both act on the expenses currently visible under the active date range and filters.

While it runs, a progress toast shows "Preparing ZIP (3/12 files)…". Expenses with no document are skipped silently. If nothing in the range has a document, a plain message says so and no file is downloaded.

Downloaded file names:

- `Expenses_Invoices_20260901-20260930.zip`
- `Expenses_Receipts_20260901-20260930.zip`

Inside the ZIP each file is named `{expense_no}_{paid_to}_{invoice|receipt}.{ext}`, with unsafe characters replaced and a numeric suffix if two names collide.

## Where the documents come from

- Invoices: the linked purchase's invoice file (only expenses linked to a purchase have one), from the purchase invoices storage area.
- Receipts: the expense's own uploaded payment proof.

Both are private, so each file gets a short-lived signed link before being fetched — the same mechanism the existing preview dialog uses.

## Technical notes

- File: `src/pages/Expenses.tsx` only. No schema, storage, trigger, or permission changes.
- Use `jszip` (already present in the project) to build the archive client-side; trigger the download with an object URL + anchor click, matching the existing CSV export pattern — no `file-saver` dependency needed.
- Source lists:
  - Invoices: `filtered` expenses with `purchase_id` whose `purchaseInvoiceMap[purchase_id].invoice_file_url` is set, bucket `purchase-invoices`.
  - Receipts: `filtered` expenses with a `receipt_url` path, bucket `expense-receipts`.
  - `purchaseInvoiceMap` currently covers `expenses` in range, which is the same source `filtered` derives from, so no extra query is required.
- Sign each path with `createSignedUrl(path, 300)`, `fetch` the blob, add to the zip; run in small batches (e.g. 5 at a time) and update the toast counter per completed file.
- Any file that fails to sign or fetch is counted as skipped; at the end the toast reports "Downloaded N files, M skipped".
- Buttons are disabled while a ZIP is being built and when `filtered` is empty.
- Date range for the file name reuses `queryFromDate`/`queryToDate`, same as the CSV export.
