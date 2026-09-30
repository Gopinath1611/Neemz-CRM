# Add Deposit: bank details + deposit way

Restructure the Add/Edit Deposit form into four clean sections and capture how the cash actually reached the bank.

## 1. Deposit Header
Deposit date, Deposited by, Status, Source (Cash Drawer / Direct) — as today.

## 2. Target Bank & Account Details
- Bank account becomes a dropdown fed by the bank accounts already saved for salary transfers.
- Picking one auto-fills Account Number, Branch Name and IFSC (all still editable; IFSC forced to uppercase).
- Account Type dropdown: Current Account (default) or Savings.

## 3. Deposit Method & Channel Details
- Existing Deposit Mode stays.
- New **Deposit Way**: Bank Branch Deposit or ATM / Cash Deposit Machine (CDM).
- Bank Branch Deposit shows: Deposit Branch Name, Challan / Counterfoil Number (required).
- ATM / CDM shows: ATM / Machine Location, Machine / Transaction Reference Number (required), Referral / Staff Reference Code (optional).
- The existing single file upload is reused and relabelled — "Challan Copy" or "Deposit Slip / ATM Receipt" — accepting PDF, PNG, JPG, still required.

## 4. Invoice Linking & Total
Unchanged: searchable paid-invoice multi-select, running total, cash-drawer availability helper and over-deposit warning.

## List and exports
Deposits table gains a "Deposit Way" badge column; CSV export gains Deposit Way, Account Number, IFSC, Challan/Reference Number. The view dialog shows all new fields. Old deposits show dashes — nothing is backfilled and no existing deposit is altered.

## Technical notes
- Migration on `deposits`, all nullable so existing rows are untouched: `account_number text`, `ifsc_code text`, `account_type text`, `deposit_way text` with CHECK in ('bank_branch','atm_cdm'), `deposit_branch_name text`, `challan_number text`, `reference_number text`, `referral_code text`. `slip_path` continues to hold the single attachment. Then regenerate types.
- `src/components/finance/DepositsSection.tsx`: query `payroll_banks` (active only) for the account dropdown, add the new form state + reset/openEdit wiring, section wrappers, conditional field blocks, validation in `handleSave` (challan required for bank_branch, reference required for atm_cdm — same toast pattern as current checks), new fields in the insert/update payload, table column, CSV columns and view dialog rows.
- No change to amount calculation, deposit_invoices linking, drawer availability logic, or any Finance formula.
