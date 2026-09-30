# HRMS Inbox: working Leaves, Comp off and Expenses requests

## What already exists
- `leave_requests` (5 rows, used by Leave Management) and `comp_off_requests` (empty) already exist, and staff can only see or add their own rows, with HR/admin override through `is_hr_or_admin`.
- `expenses` is the Finance ledger and only Finance can use it, so it's the wrong place for staff reimbursement claims.

## Approach
Keep using the two existing tables so Leave Management doesn't break. The only new table is `expense_requests`. This is fewer tables than the brief lists, on purpose, so leave data isn't copied into a second place.

### Database (one migration, additive only)
- `leave_requests` and `comp_off_requests`: add `admin_comment text` and `reviewed_by uuid`, both nullable. Existing columns and policies stay as they are.
- New `expense_requests`: id, employee_id (the employee record), expense_date, category, amount, description, receipt_url, status (default 'pending'), admin_comment, reviewed_by, created_at, updated_at. It gets grants, RLS, an updated_at trigger and a check that status is pending, approved or rejected.
  - SELECT: the employee's own rows (`current_employee_id()`), or everything for HR/admin.
  - INSERT: the employee's own rows only, with status pending.
  - UPDATE: HR/admin only.
- Private storage bucket `expense-receipts`. Staff can upload and read files under their own `<employee_id>/` folder, and HR/admin can read everything. Receipts open through signed links.
- Realtime is turned on for all three tables.

### Screen (extend the existing reusable Inbox page)
- The "Apply" button opens a form for the type:
  - Leave: leave type, from and to date, full or half day, reason. Days are worked out automatically.
  - Comp off: date worked, full or half day, reason.
  - Expense: date, category, amount, description, receipt upload.
- **My requests** shows your own requests, newest first, with status badges: Pending yellow, Approved green, Rejected red.
- **Awaiting approval** is for admin/HR only. It shows all pending requests with the employee name and code, plus Approve and Reject buttons. Reject asks for a reason and won't go through without one. Other staff see the empty state.
- **Completed** shows approved and rejected requests: all of them for admin/HR, your own for everyone else. Rejected requests show the admin comment.
- Lists update live when anything changes, and they also refresh when you come back to the tab.
- Uses the existing Button, Tabs, Card, Badge and Dialog pieces and colours.

## Out of scope
No change to sign-in, roles, Leave Management, leave balances, Finance expenses, or any other HRMS feature.

## Technical notes
- A signed-in user without a linked employee record sees "Your account isn't linked to an employee record" instead of the Apply button.
- Approving sets status, reviewed_by = auth.uid(), admin_comment and updated_at. The legacy `approved_by` text column is also filled on leave and comp off rows, so Leave Management keeps showing who approved.
- Files: `src/pages/hrms/InboxRequests.tsx`, plus a small `src/lib/hrmsInbox.ts` for the per-type config.
