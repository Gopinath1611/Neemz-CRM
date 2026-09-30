# User Activity & System Monitoring (Admin only)

A brand-new, self-contained module that shows who is using the CRM, what they open, how long they stay, and what data they change. Nothing in the existing app is redesigned — one new menu entry, one new page, and new recording tables.

## What the Admin will see

Top row of small cards: Online now, Total users, Offline, Active in last 30 minutes, Page visits today, Data changes today, Flagged items (clearly labelled "off-hours access only — basic rule").

Tabs:
1. **Live Overview & Analytics** — "User Activity by Hour" bar chart for the chosen day plus a live activity feed on the right ("Sudha updated a treatment for P-1092 — Clinic Workflow, 2 min ago"), updating in real time.
2. **Logged-In Users & Sessions** — every user who has ever signed in, last seen, online/offline, session count, total time.
3. **Page Time Spent** — per page: visits, total and average time, most active users; expandable per user.
4. **Recent Data Changes** — created/edited/deleted records with a before/after comparison, who did it and when.
5. **Module Activity** — activity grouped by module (Clinic, Finance, Sales, HR...).
6. **Activity Logs Explorer** — searchable, filterable (user, date range, action type, module) paginated log table with CSV export.
7. **Monitoring Settings** — which tables are recorded, retention (1 year), and a note that recording is read-only reporting.

A badge shows the role currently viewing. Search box filters user / page / module.

## How activity is captured

**Page visits and time spent** — a small new hook mounted once inside the new module's own provider added at the app shell level, so no page file changes. On every route change it closes the previous page view (writing the seconds spent) and opens a new one. It also sends a light "still here" heartbeat every 60 seconds and writes the final duration when the tab closes or is hidden. All writes are fire-and-forget so nothing can block or slow a page. If a write fails it is silently dropped.

**Sessions and online status** — same heartbeat: a user is "online" if their last heartbeat is under 5 minutes old.

**Data changes** — recorded in the database itself, so no existing page code is touched. A new recording function plus one new trigger is attached to these tables: `patients`, `appointments`, `treatment_plans`, `treatment_plan_items`, `billings`, `billing_payments`, `expenses`. Each create/edit/delete stores the table, record id, action, who did it, when, and the changed fields with old and new values. The triggers only write to the new log table — they never change, block, or reject the original operation, and existing columns, policies and data stay exactly as they are.

**Flagged items** — a simple, honest rule to start: actions recorded outside 08:00–21:00 local time. Labelled in the UI as a basic starter rule, not intelligent anomaly detection.

**Retention** — a daily cleanup job removes records older than 1 year.

## Access control

The new route is added only to the Admin route list — every other role's access list is left untouched, and because non-admin roles are allow-listed, they cannot reach it. The existing route guard and sidebar filter already enforce this; no new access mechanism is introduced.

## Files

New files:
- `src/pages/admin/UserActivityMonitor.tsx` — the page with all tabs
- `src/components/admin/activity/*` — KPI row, hourly chart, live feed, sessions table, page-time table, change-diff table, module activity, logs explorer, settings tab
- `src/hooks/useActivityTracking.ts` — page view / heartbeat capture
- `src/lib/activityMonitoring.ts` — shared queries, module mapping, formatting

Existing files touched (minimum unavoidable):
- `src/components/CRMLayout.tsx` — one new top-level "Admin & Governance" menu group with a single item
- `src/App.tsx` — one new route
- `src/lib/roleAccess.ts` — the new route added to the admin list only

## Technical notes

New tables (nothing existing altered):

- `activity_page_views` — id, user_id, user_name, route, module, page_title, started_at, ended_at, duration_seconds, session_id, branch_id
- `activity_sessions` — id, user_id, user_name, role, session_id, started_at, last_seen_at, ended_at, user_agent
- `activity_data_changes` — id, user_id, user_name, table_name, record_id, action (insert/update/delete), changed_fields jsonb, old_values jsonb, new_values jsonb, module, created_at, is_off_hours

All three: RLS enabled, `GRANT` for `authenticated` and `service_role`; insert allowed for the acting user, select restricted to `has_role(auth.uid(),'admin')`. Indexes on `(user_id, created_at)`, `(route)`, `(table_name, record_id)`, `created_at`.

A single `SECURITY DEFINER` trigger function writes `activity_data_changes` rows; it is wrapped so any logging error is swallowed and never affects the original operation, and existing columns, policies and data stay exactly as they are.
Live feed uses realtime on `activity_data_changes`. All reads are paginated to avoid the 1,000-row cap.

**Retention cleanup** — a `pg_cron` job runs once a day at 02:00 UTC and deletes rows older than 1 year from `activity_page_views`, `activity_sessions`, and `activity_data_changes`.
