# Security & Access-Control Audit — Findings and Remediation Plan

Read-only audit performed on the current build. Every statement below was verified against the code and the live database in this session.

## 1. Route enforcement — mostly OK

Verified in `src/App.tsx`: all 130+ app routes are nested inside a single parent route wrapped in `ProtectedRoute` + `CRMLayout`, so each one runs the auth, branch, and module/role check before rendering. Public routes outside the wrapper are `/auth`, `/reset-password`, `/patient-portal`, `/camp-register/:campaignId`, and the `*` NotFound.

Gaps found:

- `/patient-portal` renders with no authentication at all. Needs review — if it reads patient records it is an unauthenticated data surface.
- Route checks use only the **first** path segment for role fallback (`getBasePath` in `ProtectedRoute.tsx`). So a role allowed `/fy-projection/overview` effectively reaches every `/fy-projection/*` page, and anyone allowed `/settings` reaches `/settings/hrms/*`. Sub-route restrictions are not enforceable today.
- `/finance/deposits` and `/finance/download-reports` inherit `/finance`; `/clinic-whatsapp/*` has no entry in `roleAccessMap`, so non-admins without explicit module rows cannot reach it at all (silent redirect to `/`).

## 2. Action buttons vs per-module permissions — NOT enforced (critical)

`canPerform` and `modulePerms` are defined in `src/contexts/AuthContext.tsx` and `src/lib/moduleVisibility.ts`, but a repo-wide search shows **zero consumers** outside those two files. No page or dialog calls `canPerform`. Consequence:

- Create / Edit / Delete buttons render for every user who can open a module, regardless of the Read/Create/Edit/Delete flags shown in the Access Preview modal.
- The Access Preview modal therefore shows permissions the app does not honour — a display/behaviour mismatch, not a working control.
- Some modules do ad-hoc role checks (`hasRole` / `roles.includes` appear in ~25 files such as `Payroll.tsx`, `Employees.tsx`, `Pipeline.tsx`, `BillingDetailDialog.tsx`), but these are hardcoded per page and unrelated to the per-module permission grid.

## 3. Supabase RLS — enabled everywhere, but largely unrestrictive

Good: every table in the public schema has RLS enabled (zero tables without it), and there are **no policies granted to the `anon` role** — anonymous API access is closed.

Concern: of 172 tables with policies, **134 tables carry 201 blanket policies whose condition is literally `true` for the `authenticated` role**. Any signed-in staff account (or its JWT used directly against the API) can read and in most cases write those tables, bypassing all UI-level role and module restrictions. Confirmed blanket-`true` tables include:

| Table | Blanket commands |
|---|---|
| `patients` | ALL |
| `billings`, `billing_payments` | ALL |
| `prescriptions`, `clinical_photos` | ALL |
| `consultation_findings` | SELECT, INSERT |
| `expenses`, `deposits` | ALL |
| `payruns` | SELECT, INSERT, UPDATE, DELETE |
| `cash_drawer_days` | SELECT, INSERT, UPDATE |
| `emi_insurance_cases` | ALL |
| `leads` | ALL |
| `employees`, `profiles`, `user_roles` | SELECT |

Practical impact: a telecaller or video editor account can query full patient clinical records, billing, payroll runs, and finance data through the API even though the sidebar hides those modules. HRMS tables (`attendance_logs`, `attendance_audit`, `call_logs`, `assets`) are correctly scoped via `current_employee_id()` / `is_hr_or_admin()` / `has_role()` — those are the model to follow.

No privilege-escalation path found on roles themselves: `user_roles` is a separate table read through the `has_role` security-definer function, and write policies on it are admin-gated.

## Remediation plan (in priority order)

### Phase A — Make permissions real in the UI
1. Add a small `usePerm(modulePath)` helper wrapping `canPerform`, returning `{ canRead, canCreate, canEdit, canDelete }`.
2. Apply it in the high-risk modules first: Finance, Cash Drawer, Expenses, Purchases, Payroll/Payruns, Employees, Patient Database, Clinic Workflow billing, Pipeline/Leads, Inventory. Gate the Add/Edit/Delete/Export controls and disable the corresponding submit handlers.
3. Roll out to remaining modules module-by-module.

### Phase B — Tighten route checks
4. Change `ProtectedRoute` to match the longest declared path prefix rather than only the first segment, so `/settings/hrms/*` and `/fy-projection/*` sub-pages can be restricted independently.
5. Decide the intent of `/patient-portal`: either put it behind auth (or a signed token) or confirm it exposes nothing patient-identifying.
6. Add the missing `/clinic-whatsapp/*` entries to `roleAccessMap` for the roles that should have it.

### Phase C — Replace blanket RLS with role-scoped policies
Server-side is the only real boundary; do this in staged migrations, one domain per migration, so nothing breaks silently:
7. Clinical domain (`patients`, `consultation_findings`, `prescriptions`, `clinical_photos`, `dental_charts`, `treatment_plans`): restrict to clinical + reception + admin roles via `has_role`.
8. Finance domain (`billings`, `billing_payments`, `expenses`, `deposits`, `cash_drawer_days`, `purchases`): read/write for `admin` + `finance_manager`, insert-only where reception needs it; drop the `ALL … true` policies.
9. Payroll domain (`payruns`, `payroll`, `form_16`): `is_hr_or_admin` only, plus self-read for own payslip.
10. Sales domain (`leads`, `follow_ups`, `campaigns`): marketing/telecaller/admin roles.
11. Narrow `employees` and `profiles` SELECT to self + HR/admin (with a minimal name-only view where the UI needs staff names).
12. After each migration, re-run the linter and exercise the affected pages, since the UI currently relies on the permissive policies.

### Technical notes
- New role checks should reuse the existing security-definer helpers (`has_role`, `is_hr_or_admin`, `is_finance_user`, `current_employee_id`) to avoid recursive RLS.
- Phase C will surface UI breakage wherever a page reads a table its role should not — expect to add narrow read policies or lookup views rather than re-widening.
- No change to GRANTs is needed; grants already exist for `authenticated`/`service_role` on these tables.
