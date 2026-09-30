# Access Preview — verify what a staff member can see without their password

## Problem
When HR (or any role) is given access to only a few modules, the only way you can currently confirm what they actually see after login is to log in as them — which needs their password. There is no admin-side way to cross-check.

## Solution
Add an admin-only, read-only **"Preview Access"** view for any staff member in Settings → Staff. It reads that user's roles plus their per-user module access records and renders exactly the sidebar they would get after login, so you can confirm visibility without any password.

### What you get
1. **New action in the staff card menu: "Preview Access"** (next to Module Access / Manage Roles).
2. **Preview panel** showing, for the selected staff member:
   - Their roles.
   - The full sidebar tree, with each module marked Visible or Hidden — computed with the same rules the app uses at login (custom module access records if present, otherwise role-based defaults).
   - Per-module Read / Create / Edit / Delete flags where they exist.
   - A note when the user has no module records, meaning role-based defaults apply.
3. **Summary line**: "HR — 6 of 42 modules visible" plus a filter to show only visible modules, so a mismatch is obvious at a glance.
4. **Copy / print-friendly list** so the check can be shared or attached to an approval.

This is a read-only view — opening it never changes a user's permissions.

## Technical notes
- Reuse `canAccessRoute` / role defaults from `src/lib/roleAccess.ts` and the same precedence logic as `AuthContext.canAccessModule` and `ProtectedRoute` (custom records win; otherwise role fallback; personal HRMS routes always allowed; admin bypasses everything).
- To avoid drift, extract that precedence into a small pure helper (e.g. `resolveModuleVisibility(roles, moduleAccessRows, path)`) and have both `AuthContext` and the new preview call it — so the preview can never disagree with real login behaviour.
- Module list comes from the existing `moduleGroups` derived from `navGroups` in `StaffManager.tsx`.
- Data source: `user_roles` and `user_module_access` for the selected user (already fetched in Settings → Staff patterns).
- New component: `src/components/settings/AccessPreviewDialog.tsx`. No database changes, no new tables, no policy changes.

## Out of scope
- No impersonation / "log in as user" (that would need service-role token minting and is a security risk).
- No changes to how permissions are granted or to any other module.
