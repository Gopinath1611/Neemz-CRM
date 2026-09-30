# Lab Orders — Three-Amount Billing Structure

## What will change

1. Replace the old single `Rate` meaning with three explicit amounts on each lab order:
   - **Price of Material** — base unit/manufacturing price.
   - **Lab Expense (Payable)** — total amount owed to the lab.
   - **Patient Bill (Receivable)** — amount charged to the patient.
2. Track **Amount Paid to Lab** separately so the lab status is calculated automatically:
   - `Unpaid` when paid amount is zero.
   - `Partial` when paid amount is above zero but below lab expense.
   - `Paid` when paid amount is equal to or above lab expense.
3. Keep invoice linking. A linked invoice supplies the patient payment indicator; an unlinked order shows `Not Linked`.

## Existing records

- Copy the current `rate` into **Price of Material**.
- Copy the current `rate` into **Patient Bill (Receivable)** so existing patient billing and generated invoice amounts do not change.
- Leave **Lab Expense (Payable)** and **Amount Paid to Lab** at zero because no reliable historical values exist.
- Keep the old `rate` column in the database for compatibility, but stop using it in the Lab Orders screens.

## Screen updates

- Update the `/lab-orders` right-side order to:
  `Warranty | Status | Price of Material | Lab Expense (Payable) | Patient Bill (Receivable) | Actions`.
- Show currency values as stacked, readable cells with semantic status badges.
- Patient payment indicator:
  - `Not Linked` when there is no invoice.
  - `Unpaid`, `Partial`, or `Paid` from the linked invoice’s paid amount versus total.
- Keep the existing invoice-link action and rename its explanatory text for the new column.
- Set a stable minimum table width and smooth horizontal scrolling.
- Update the Clinic Workflow Add/Edit Lab Order form with fields for Price of Material, Lab Expense, Patient Bill, and Amount Paid to Lab.
- Generated patient billing will use **Patient Bill**, not material price or lab expense.
- The Lab Orders “Total Lab Cost” card will total **Lab Expense**, matching its payable meaning.

## Database and compatibility

- Add nullable/defaulted numeric columns for `price_of_material`, `lab_expense`, `patient_bill`, and `lab_expense_paid_amount`.
- Backfill only the two values that can be safely derived from the old `rate`.
- Add non-negative checks for all four amounts.
- No table, policy, role, filter, search, pagination, warranty, or order-status changes.

## Verification

- Confirm old orders retain their previous material and patient-billing amounts.
- Confirm new/edit orders save all four amounts.
- Confirm invoice generation uses Patient Bill.
- Confirm lab payment badges correctly show Unpaid, Partial, and Paid.
- Confirm linked patient invoices correctly show Unpaid, Partial, or Paid, while unlinked rows show Not Linked.
- Check the Lab Orders table and Clinic Workflow form at desktop and mobile widths.
