# DRE role: Receivables actions not showing

## What I found (verified)

The permission you set **did save correctly**. For the DRE staff member (Sabana) the stored access row for Receivables is: view, create, modify, remove — all ON (`/finance#receivables`). All other Finance rows are view-only, as expected.

So the setting is fine. Two separate things block the buttons:

1. **The Receivables screen ignores the permission grid.** Inside the Finance page, the Receivables "Adjust" button and the "Reverse" action are shown only when the signed-in user holds the **Admin** role — a hard-coded check. No part of the Finance page reads the per-module View/Create/Modify/Remove settings, so a DRE user sees the list but no action buttons, no matter what is ticked.

2. **The database rule is also admin-only.** Saving a receivable adjustment is permitted only for Admin accounts. Even if the button were shown, a DRE save would be rejected. So a UI-only fix would just swap "no button" for an error.

## Fix

### Step 1 — Make Receivables read the permission grid
- Read the Receivables capabilities from the saved access settings (path `/finance#receivables`) instead of the hard-coded Admin check.
- Show "Adjust" when Create is allowed; show "Reverse" when Modify is allowed; keep the row visible when only View is allowed.
- Admin keeps full access exactly as today (Admin bypasses all checks already).
- No change to the Receivables figures, list contents, date filters, or any other Finance section.

### Step 2 — Allow the same at database level (migration, shown before applying)
- Add a read-only helper that answers "does this user have this action on this module path?" by looking at the saved access rows.
- Replace the admin-only insert rule on receivable adjustments with: Admin **or** a user whose saved access grants Create on `/finance#receivables`, and the record must still be stamped with their own user id.
- Nothing is loosened for anyone else: users without that grant stay blocked, and the append-only / one-time-reversal behaviour is unchanged.

### Step 3 — Verify
- Confirm the DRE account sees Adjust and can save an adjustment, and that a Finance-view-only account still sees no action buttons.

## Note on scope
This fixes Receivables only, which is what you asked about. The same hard-coded Admin pattern exists in a few other Finance areas — if you want, those can be moved onto the permission grid in a follow-up.

## Technical detail
- `src/pages/Finance.tsx`: `ReceivablesSection` and the adjust/reverse dialog currently use `hasRole("admin")` (lines ~2683 and ~3978); switch to `usePermissions("/finance#receivables")` (`canCreate` / `canEdit`).
- Migration: `has_module_perm(_user_id uuid, _path text, _action text)` as SQL `STABLE SECURITY DEFINER` with `search_path = public`, reading `user_module_access`; then drop and recreate the `receivable_adjustments` INSERT policy as `has_role(auth.uid(),'admin') OR public.has_module_perm(auth.uid(), '/finance#receivables', 'create')` AND `adjusted_by = auth.uid()`. No table/column changes, no data changes.
