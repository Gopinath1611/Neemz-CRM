# Salary Slip view (Payroll & Payslips)

A new printable payslip document opened from a "View Payslip" button in the Payroll & Payslips table. Nothing else changes: existing view dialog, PDF download, email, formulas and database stay as they are.

## What you will see
- A new printer icon button "View / Print Slip" next to the existing payslip buttons on each row.
- Opens a bordered A4-style slip:
  - Header: clinic name, address, phone/email from Clinic Settings (same as prescriptions/invoices), logo top-right.
  - Title: "Payslip for the period of <Month Year>".
  - Two-column details: Employee Id, Department, Days Worked, Casual Leave, Overtime Hours | Name, Designation, Bank Acct / Cheque Number, Earned Leave.
  - Side-by-side Earnings and Deductions tables (item | MTD | Amount), with rounded totals.
  - Full-width "Net Pay (Rounded)" bar.
  - Employer's Signature and Employee's Signature lines.
  - "Print / Download PDF" button (hidden when printing; only the slip prints).

## Where the numbers come from (no formula changes)
- Earnings: Basic, HRA, Conveyance, Medical, Special allowance — same split the current payslip already uses. Overtime Allowance shows 0 (not tracked).
- Deductions: PF, ESI, LOP (existing calculation), Professional Tax = current "Tax" value, Loan/Advance Repayment = 0 (not tracked); existing "Other deductions" shown as an extra row only if non-zero.
- MTD column = same monthly amount (single month).
- Net Pay = the existing live net figure.
- Casual Leave / Earned Leave = paid leave days from the existing breakdown (shown under Casual Leave; Earned Leave "0" since not split today). Overtime Hours "0".
- Bank account from the employee record, masked to last 4 digits; "-" if empty.

## Technical details
- New isolated file `src/components/payroll/SalarySlipDocument.tsx` (Dialog + slip), uses `fetchClinicBranding` and `attendanceBreakdown`.
- `src/pages/Payroll.tsx`: add one button + state to open it; ensure employee query includes `bank_account_number` (read only).
- Print via scoped `@media print` rules that hide everything except the slip.
- No schema, edge function or other module changes.
