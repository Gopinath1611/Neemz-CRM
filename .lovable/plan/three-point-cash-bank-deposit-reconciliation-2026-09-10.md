# Three-Point Cash & Bank Deposit Reconciliation

Tie together the three places cash appears: money collected from patients (Payments), cash physically held for the day (Cash Drawer), and money handed to the bank (Deposits). A bank deposit is a transfer of cash already counted as income, so it is never added to revenue again.

## How the three points relate

```text
Patient pays cash          -> counted once as income (Payments)
Cash sits in the drawer    -> Opening + Received - Drawer Expenses = Expected Cash
Cash taken to the bank     -> Bank Deposit (transfer only, not income)
Net cash left in drawer    = Expected Cash - Bank Deposits for that date
```

## 1. Deposits: where the money came from

- Add a "Source" choice in the Add/Edit Deposit form: "From Cash Drawer" or "Direct Transfer / Cheque". Existing deposits are treated as Direct.
- When "From Cash Drawer" is picked, the form shows the cash actually available in the drawer for the chosen date and warns (does not block) if the amount entered is higher, so backdated corrections stay possible.
- The Bank Deposits table gets a "Source" column with a clean badge: "Cash Drawer" or "Direct".
- Existing filters, export, slip upload and invoice linking stay as they are.

## 2. Cash Drawer

- New metric card "Bank Deposits" next to Opening, Received Today, Drawer Expenses, Expected Cash — total of drawer-sourced deposits recorded for the selected date.
- New "Net Closing Cash in Drawer" figure = Expected Cash − Bank Deposits for that date.
- End-of-day closing compares the counted cash against this net figure, so cash sent to the bank no longer shows up as a shortage. Variance in the drawer history list uses the same rule.

## 3. Payments

- Income totals (Cash ₹725 + UPI ₹2,104 = ₹2,829) stay exactly as they are.
- A compact strip appears under the Cash card: Cash Collected, Remitted to Bank, Retained in Drawer — read from the drawer/deposit records for the active date range.

## 4. Safety

- No change to profit & loss formulas, treatment profitability, or any existing KPI totals.
- Deposits stay out of revenue and expense maths entirely; they only affect the cash-in-drawer view.
- All new figures are calculated from data already loaded plus one read of deposits per screen; tables stay horizontally scrollable on phones.

## Technical notes

- Migration: add `deposits.source text not null default 'direct'` with a check for `'direct' | 'cash_drawer'`, plus `deposits.drawer_date date null` to anchor a drawer-sourced deposit to the drawer day it came from (defaults to `deposit_date` when unset). Backfill leaves all current rows as `direct`. No other schema change.
- `src/components/finance/DepositsSection.tsx`: add `source` state to the form, a Select control, drawer-availability lookup (`cash_drawer_days` + `cash_drawer_expenses` + drawer deposits for the date) shown as helper text, non-blocking over-deposit warning, `source`/`drawer_date` in insert/update payload, badge column in the table and in CSV export, and a Source filter option.
- `src/pages/CashDrawer.tsx`: query `deposits` where `source='cash_drawer'` and `coalesce(drawer_date, deposit_date) = drawerDate`; derive `bankDeposits`, `netClosingCash = expectedCash - bankDeposits`; add the metric card, use `netClosingCash` for the closing/variance display (lines ~216-217, ~370, ~476) and for the history variance calc (~637-639).
- `src/pages/Finance.tsx` `PaymentsSection`: add a read-only query for drawer-sourced deposits in the active date range and render the settlement sub-strip below the Cash card. `incomeAgg`, `incomeData`, `totalIncome`, expense maths and every other section untouched.
