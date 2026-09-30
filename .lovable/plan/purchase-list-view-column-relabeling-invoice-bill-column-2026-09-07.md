Purchase List View Column Relabeling & Invoice Bill Column

Goal
Rename two column headers in the Purchase Management list and split the invoice-file action out of the Actions column into its own column.

Changes
1. In `src/pages/Purchases.tsx` update the list table headers:
   - "Payment" → "Payment Mode"
   - "Status" → "Payment Status"
2. Add a new table column "Invoice Bill" between "Delivery" and "Actions".
3. Move the existing invoice-file view button (FileText icon) from the Actions cell into the new "Invoice Bill" cell.
4. Update the loading and empty-state `colSpan` values from 10 to 11 to account for the new column.
5. Leave all other behavior unchanged: delivery dropdown stays in the Delivery column, view/edit/delete actions stay in Actions.

Verification
- Build/typecheck passes.
- Purchase list renders with the new headers and the invoice icon appears in its own column.
