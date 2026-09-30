# Link an expense to a purchase, and show one combined receipt

## What you get

1. **"Link to Purchase (optional)"** on the Add/Edit Expense form — a searchable picker listing purchases by PO/invoice number and supplier name, with date and amount shown so the right one is easy to spot. Clearing it unlinks.
2. **Combined document in the Receipt view** — when an expense has both its own payment proof and a linked purchase that has an invoice bill, the preview builds a single PDF on the fly: page 1 = purchase invoice, page 2 = payment proof. It shows in the dialog as the primary view with a **Download combined PDF** button. The two original files stay available as separate labeled blocks underneath.
3. **No change otherwise** — no linked purchase, or the purchase has no invoice: the Receipt view behaves exactly as today.

Nothing changes on the Purchases page; invoice upload there stays as it is.

## Verification

Link the existing manual expense (with the e-Pay proof) to **PO-20260724-001**, open its Receipt view, and confirm page 1 is the JASH TISSUES invoice and page 2 is the e-Pay proof, and that the download works.

## Technical notes

- `src/pages/Expenses.tsx` only, plus one dependency: `pdf-lib` (merges pages whether the source file is a JPG/PNG or a PDF; `jspdf` alone cannot copy existing PDF pages).
- Form: add `purchase_id` to the form state, `resetForm`, `openEditExpense`, and the insert/update mutations (`purchase_id: form.purchase_id || null`). No schema change — `expenses.purchase_id` already exists (FK to `purchases`, ON DELETE SET NULL).
- Picker: new query for `purchases (id, invoice_number, supplier_name, purchase_date, total_amount, invoice_file_url)` ordered by date desc, rendered with the existing `Command`/`Popover` combobox pattern used elsewhere in the app; client-side filter over invoice number + supplier name. A hint marks purchases that have no invoice file.
- Merge helper (new local function): download both signed URLs as bytes, then with `PDFDocument` — for a PDF source `copyPages` all pages, for an image `embedJpg`/`embedPng` onto a new page scaled to fit A4. Order: purchase invoice first, then receipt. Produce a blob URL for the `<iframe>` preview and the download; revoke it when the dialog closes. Unsupported file kinds fall back to the current per-file blocks.
- Existing `purchaseInvoiceMap` query and the current preview dialog are reused; signed URLs stay at 300s.
- Untouched: purchase→expense auto-creation trigger, payment/delivery status logic, permissions, storage contents, CSV/PDF exports, WhatsApp/dedupe/quota, pipeline stage guard.
