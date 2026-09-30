# DRE Receivables access: why the actions still don't show

## What I verified (live data)

- The previous fix is in place and correct: the Finance → Receivables screen reads the saved permission grid (`/finance#receivables`), and the database rule allows a non-Admin to save an adjustment when their grid has Create. No change needed there.
- The real problem is in the **saved data**: Sabana's (DRE) stored permission row for Receivables is View-only — Create / Modify / Remove are all OFF in the database, even though the screenshot shows them ticked. All 9 Finance rows were written in one save at 10:50 IST today, ~13 minutes after the screenshot was taken at 10:37.
- Root cause found in the Manage Roles dialog: the permission grid **reloads itself from the database every time the staff list refreshes in the background** (the Staff settings page has a live subscription — any profile/role change anywhere triggers it). When that happens, unticked → ticked changes are silently wiped back to the old saved values. The dialog was open 13 minutes, the grid reset, and SAVE then wrote the old View-only values. So your ticks never reached the database.
- Second weakness in the same save: it deletes all rows and re-inserts them without checking for insert errors, so a failure could silently wipe a role's access.
- Checked the DRE role across all staff: Sabana is currently the only staff member with the DRE role, and her Receivables row is View-only. The repair step still runs role-wide so any DRE member added later is covered.
- Checked the database constraints: `user_module_access` already has a unique constraint on (user_id, module_path), so switching the save to upsert is safe with no schema change needed.

## Fix

### Step 1 — Stop the grid from resetting while you edit
- In the Manage Roles → Edit Role Permissions tab, load the grid from the database **only when you pick a role** — not on every background staff refresh.
- If a background refresh happens while the grid has unsaved changes, keep your ticks (optionally show a small "data refreshed" note; never overwrite silently).

### Step 2 — Make the save safe and verifiable
- Replace delete-all-then-insert with an upsert (insert-or-update per row) on the existing (user_id, module_path) unique constraint, so a partial failure can never wipe a staff member's access. No migration needed for this — the constraint already exists.
- Check every write for errors and show a clear error toast if any row fails.
- After saving, re-read the saved rows and confirm in the success message how many modules were saved with full access (so you can immediately see it stuck).

### Step 3 — Repair the Receivables rows for every DRE staff member (shown before applying)
One database update covering **all** staff holding the DRE role (not just Sabana) whose Receivables row is View-only, setting Create / Modify / Remove ON to match what you ticked. Today that is one person, but the update is written role-wide so nobody is missed. No other module rows touched. The exact statement is shown for approval before it runs.

### Step 4 — Verify
- Re-open Manage Roles → DRE → confirm Receivables keeps the ticks even after a background refresh.
- Sign in as the DRE account: Finance → Receivables shows the **Adjust** button and saving an adjustment succeeds.
- Same account: the **Reverse** action appears on an existing adjustment, and reversing it actually saves to the database (not just a UI change) — confirmed by re-reading the stored rows, including that the one-time-reversal rule still blocks a second reversal.
- A view-only Finance account still sees no action buttons.

## Technical detail
- `src/components/settings/StaffManager.tsx`: the perms `useEffect` (dep on `staff`) reloads `permMap` whenever the realtime `staff-manager-sync` channel refires `fetchAll`; scope loading to role change only (ref-guard) and preserve dirty state. `savePerms`: switch to `upsert` with `onConflict: "user_id,module_path"`, check `error` on every call, re-read and report.
- Constraint verified present: `user_module_access_user_id_module_path_key UNIQUE (user_id, module_path)` — no migration required.
- Data repair (shown for approval before running): `UPDATE public.user_module_access SET can_create=true, can_edit=true, can_delete=true, has_access=true WHERE module_path='/finance#receivables' AND user_id IN (SELECT user_id FROM public.user_roles WHERE role='dre');`
- Reverse verification covers the `receivable_adjustments` INSERT policy (`adjusted_by = auth.uid()` plus admin-or-`has_module_perm(...,'create')`) and the `validate_receivable_reversal` trigger.
- No changes to Finance.tsx, RLS policies, or any other module.
