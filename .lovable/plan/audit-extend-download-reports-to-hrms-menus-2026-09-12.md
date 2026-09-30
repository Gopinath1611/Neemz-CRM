# Audit: Extend "Download Reports" to HRMS menus

Read-only audit. Nothing was built or changed.

## HRMS menus found today

Top level: Home, Employees, Recruitment, License & Renewals, Job Descriptions, Training, Document Management, Assets.
Attendance: My Attendance, My Team Attendance, My Shift, My Team Shift, Geo Fencing.
Leave: My Leaves, My Team Leaves, Holidays, Leave Roll Over, Comp Off Request, Customization Balance.
Payroll & Payslips: Dashboard, Payruns, Form 16, Payslips.
Reports: existing HRMS Reports page with Organization / Attendance / Leave / Payroll / Statutory tabs (mostly its own in-page report components).

## Audit table

| HRMS menu | Data it would export | Reuses existing pattern | Extra filter needed | Export today | Sensitivity |
|---|---|---|---|---|---|
| Employees (Master) | Name, code, department, role, joining date, status, phone, email, branch, reporting to (19 rows) | Yes | Department, Status | None | Personal data — HR/Admin only |
| Recruitment | Openings + candidates: role, stage, source, interview dates, status (currently 0 rows) | Yes | Status | Yes (in-page export) | Normal |
| License & Renewals | License name, authority, number, issue/expiry, status (1 row) | Yes | Status | None | Normal |
| Job Descriptions | Department, role, responsibilities, KPIs (1 row) | Yes (no date filter — full list) | None | None | Normal |
| Training | Programs + employee training records: program, trainer, date, completion (6 / 0 rows) | Yes | None | None | Normal |
| Document Management | Document categories + employee documents: type, employee, upload date, expiry (0 rows) | Yes | Category | None | Personal documents — HR/Admin only |
| Assets | Asset name, category, assigned employee, issue date, condition (1 row) | Yes | None | None | Normal |
| My Attendance / Team Attendance | Flattened attendance log: employee, date, check-in/out, hours, status, late, geo status (78 rows) | Yes | Employee, Department, Status | Yes on Team Attendance | Normal |
| My Shift / My Team Shift | Roster view → flatten to shift list: employee, shift name, start/end, days, effective dates (5 rows) | Yes, as flattened list (not calendar) | Employee, Shift | Yes on Team Shift | Normal |
| Geo Fencing | Zone name, branch, latitude/longitude, radius, active (2 rows) | Yes (no date filter) | None | None | Normal |
| My Leaves / Team Leaves | Leave requests: employee, type, from/to, days, reason, status, approver (5 rows) | Yes | Employee, Leave Type, Status | Yes on Team Leaves | Normal |
| Leave Balances (Customization Balance) | Employee, leave type, entitled, used, balance, year (6 rows) | Yes (year filter, not date range) | Employee, Leave Type | None | Normal |
| Holidays | Date, name, type, branch (0 rows) | Yes | None | None | Normal |
| Leave Roll Over | Employee, leave type, from year, to year, carried days (0 rows) | Yes | Employee | None | Normal |
| Comp Off Request | Employee, worked date, comp-off date, status, approver (0 rows) | Yes | Employee, Status | None | Normal |
| Payroll Dashboard / Payslips | Per-employee monthly salary: gross, basic, allowances, deductions, PF/ESI, net pay (46 rows) | Yes | Employee, Month/Payrun | None | **Sensitive — see below** |
| Payruns | Payrun period, status, headcount, total gross, total net (1 row) | Yes | Status | None | **Sensitive** |
| Form 16 | Employee, financial year, taxable income, TDS (12 rows) | Yes | Employee, FY | None | **Sensitive** |
| Existing HRMS Reports tabs | Already has its own report components | Not part of this addition | — | Mixed | — |

## Menus where a plain table needs a different shape

- My Shift / My Team Shift: roster/calendar view → export as one row per employee-shift assignment.
- Payroll Dashboard and HRMS Home: chart/KPI screens → export the underlying payroll rows, not the charts.
- Geo Fencing / Job Descriptions / Holidays: master lists with no meaningful transaction date → export full list, ignoring the shared date range.

## Payroll — needs your decision before build

Payroll, Payslips, Payruns and Form 16 contain salary and tax data. Two options:

1. Exclude them from this page entirely (HRMS Reports already covers payroll).
2. Include them but restrict those cards to Admin and HR roles only, while other HRMS cards follow normal HRMS access.

I will not build payroll cards until you pick one.

## Recommendation

A NEW separate page at `/reports/hrms/download-reports`, listed under Reports → HR Reports — same as the Sales & Marketing precedent. Simpler and keeps the three modules independent.

## Technical notes

- Reuses `DateRangeFilter`, `ReportPreviewDialog`, and the same View / Excel / PDF card layout as `SalesMarketingDownloadReports.tsx`; a new file only.
- Adds HRMS-only shared filters: Employee, Department, Leave Type, Status (Shift/Year applied per card).
- Reads are paginated so tables above 1,000 rows stay complete; all reads are read-only.
- Cards for tables with no date column skip the date range and export the full master list.

## Guarantees

- Clinic and Sales & Marketing download-report pages, cards and logic are untouched.
- No HRMS page's functionality, layout or calculations change — export only.
- No schema changes, no writes, no new tables.
