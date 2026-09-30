# Cash Drawer access for Duty Doctor

Right now a Duty Doctor sees Cash Drawer but cannot save anything: "Save opening count" stays disabled/fails. Two separate gates block it.

## What is blocking it

1. App-side: the Duty Doctor role's allowed pages list does not include Cash Drawer, so the page's create/edit permission resolves to "no" and the save button is disabled.
2. Database-side: the Cash Drawer security rule only recognises Admin, Finance Manager and Receptionist. Even with the button enabled, saving would be rejected.

## Fix (full drawer access, as chosen)

- Add Cash Drawer to the Duty Doctor role's allowed pages so the menu item and the save/edit actions are enabled.
- Extend the Cash Drawer database rule to include Duty Doctor, giving the same rights a Receptionist has: opening count, end-of-day closing, and drawer expenses (add/edit/view).
- Delete rights stay restricted to Finance/Admin, unchanged.

## Not changing

- No change to any cash, deposit, revenue or profit calculation.
- No change to other roles, other pages, or any other database table or rule.

## Technical notes

- `src/lib/roleAccess.ts`: add `'/cash-drawer'` to `roleAccessMap.duty_doctor`.
- Migration: `CREATE OR REPLACE FUNCTION public.is_cash_drawer_user(uuid)` adding `'duty_doctor'::app_role` to the role list (security definer, `search_path = public`, same body otherwise). Policies on `cash_drawer_days` / `cash_drawer_expenses` reference this function, so no policy edits needed.
- Verify by signing in as a duty doctor and saving an opening count for a fresh drawer date.
