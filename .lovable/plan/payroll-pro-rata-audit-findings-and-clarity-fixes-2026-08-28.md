# Payroll Pro-Rata Audit — Findings and Clarity Fixes

## What the audit found

Traced the full chain: attendance logs → `getAttendancePresence` (`src/lib/hrmsSync.ts`) → `generatePayrunEmployees` (`src/lib/payrollCalculation.ts`) → `payroll` table → payslip view/PDF (`src/pages/Payroll.tsx`, `src/lib/payslipPdf.ts`).

Verified against live data for Gopinath S, August 2026:

- 24 distinct punched days with a verified check-in.
- August 2026 has 26 non-Sunday days; no holidays are configured for the month.
- The stored payroll row holds `working_days = 24`, `present_days = 24`, gross `= 15,000`.

The pro-rata multiplier **is** being applied: gross = (15,000 / 24) × 24 = 15,000. The reason it lands on the full amount is the elapsed-day cap: for an in-progress month the working-day denominator stops at today (Aug 28 → 24 working days), so a fully-present employee is at 24/24 = 100%.

Confirmed non-issues:

- No fixed-pay shortcut fired — `attendance_exempt` is unset for this employee, and the exemption only applies when zero attendance rows exist.
- No stale cache — Recalculate deletes and re-upserts payroll rows, and the payslip view/PDF/email each re-read the row fresh; realtime keeps the list in sync.
- The payslip PDF and dialog both derive the breakdown from the stored prorated `gross_salary`, not from full CTC.

You have confirmed the elapsed-only denominator is the intended rule, and working days stay "all days except Sundays and holidays". So no calculation change is needed. The real gap is that the payslip does not explain the denominator, which is what made the number look wrong.

## Changes to make (presentation only)

1. **Payrun detail (`src/pages/payroll/PayrunDetail.tsx`)** — label the working-days column so it reads as elapsed-to-date for in-progress periods, e.g. `24 (to date)` with a tooltip: "Period still in progress — working days counted up to today, excluding Sundays and holidays."
2. **Payslip dialog and PDF (`src/pages/Payroll.tsx`, `src/lib/payslipPdf.ts`)** — show the pro-rata line explicitly under Days Worked: `Pro-rata: 24 / 24 working days (100%)`, and add a short note when the period is still open, so a mid-month full payout is self-explanatory.
3. **Notes string (`src/lib/payrollCalculation.ts`)** — extend the existing attendance note to state the basis, e.g. "24 present + 0 paid leave of 24 working days elapsed (26 in full month)", so audit trails carry both numbers. This is a note/label change only; no amounts change.

## Technical notes

- No change to `getAttendancePresence` maths, the exemption check, or the persistence path.
- The full-month working-day count is derived in the same pass that builds the elapsed set, so no extra queries.
- Recalculate needs to be pressed once after the change for the notes text to refresh; amounts will stay identical.
