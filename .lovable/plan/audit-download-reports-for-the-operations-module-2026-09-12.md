# Audit: Download Reports for the Operations module

## Key finding first

The Operations module in this app is **not** an inventory/stores module. Inventory, Purchases, Pharmacy, Lab Orders, Sterilization and Waste Management all sit under the **Clinic** menu (and are already cards on the Clinic Download Reports page). Assets sits under **HRMS** (already a card on the HRMS Download Reports page).

What Operations actually contains today:

- **Operations Dashboard** (`/operations`)
- **Department sections generated live from staff roles** (Clinic Operations, Sales & Marketing, Finance, HR & Admin) — every role link opens the same Operations Dashboard focused on that role/employee
- **Meetings** (`/meetings`), placed inside the HR & Admin section

So an Operations Download Reports page would be a small, people-and-targets page: staff, role setup, KPI targets and achievement, and meetings. No vendor, stock or purchase-cost data belongs here.

## Audit table

| Operations menu | Data it would export | Duplicate of a Clinic card | Reuses existing pattern | Extra filter needed | Export today | Sensitivity |
|---|---|---|---|---|---|---|
| Operations Dashboard — Staff Directory | Employee name, code, role, department, designation, joining date, status | No | Yes | Department, role, status | No | Employee master data — staff-level detail |
| Operations Dashboard — Role & Department Setup | Department, role name, display label, active flag, display order | No | Yes | Department | No | Low |
| Operations Dashboard — KPI & Targets | Employee, metric, kind (treatment/revenue/KPI), period, target, achieved, remaining, progress %, points, status, unit | No | Yes | Department, role, employee, metric kind, period | Yes — Excel + PDF for the focused employee only | **Sensitive**: individual performance scoring; revenue targets in ₹ |
| Operations Dashboard — Target Achievement Log | Date, employee, metric, value, source (Billing / Treatment), reference (invoice or patient) | No | Yes | Same as above | No | **Sensitive**: contains invoice amounts and patient references |
| Meetings (HR & Admin section) | Meeting title, type, scheduled date, organiser, attendees, status, agenda items, action items with owner/due date/status | No | Yes | Status, organiser | No | Internal minutes — Admin/HR level |

## Duplicates — exclude from the new page

These are **already** covered by existing Download Reports pages and must not be added again:

- Inventory, Purchases, Pharmacy / Prescriptions, Lab Orders, Sterilization Log, Waste Management, Expenses → already Clinic Download Reports cards
- Assets → already an HRMS Download Reports card

Since none of them live under Operations, there is no overlap to resolve — just confirmation that they stay where they are.

## Non-tabular cases

- The Operations Dashboard itself is a KPI/chart dashboard. Its exportable form is the flat KPI & Targets table plus the achievement log (one row per recorded achievement), not the charts.
- Role/department sections are navigation, not data; their exportable form is the role setup list.

## Recommendation

- Build a **new separate page** at `/reports/operations/download-reports`, linked under Reports as "Operations Reports → Download Reports". Same card component, shared date range, View / Excel / PDF, preview dialog, Download All — consistent with the Sales & Marketing and HRMS precedent.
- Nothing on the Clinic, Sales & Marketing, Finance or HRMS download pages is read, imported or edited.
- No Operations page behaviour, layout or calculation changes; the existing per-employee KPI Excel/PDF buttons on the dashboard stay exactly as they are.
- No schema changes. All five cards read existing tables (`employees`, `department_roles`, `employee_targets`, target achievement sources, `meetings` / `meeting_agenda_items` / `meeting_action_items`) read-only.

## Confirmed decisions

1. **KPI & Targets** and **Target Achievement Log** are included, but visible and exportable only for Admin and HR. Other roles see the page without these two cards, and Download All skips them.
2. **Meetings** is included with no role restriction (any role that can open the page).
3. Scope is the five cards listed above — Operations holds no vendor/stock/purchase data, so nothing else is added.

## Technical notes

- Cards follow the existing definition shape used on the other download pages: label, date column, paginated fetch beyond the 1,000-row cap, row mapper for Excel/PDF columns.
- Date range applies to `created_at` for staff/roles/targets, achievement date for the log, and `scheduled_at` for meetings.
- Route and sidebar entry added in `src/App.tsx` and `src/components/CRMLayout.tsx`, plus role access wiring — the only edits outside the new page file.
