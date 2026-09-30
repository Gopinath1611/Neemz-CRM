# Remove Database-Level Attendance ↔ Leave Sync

Restore `src/lib/hrmsSync.ts` as the single source of truth by removing the conflicting database trigger that performs incremental leave-balance writes when attendance status changes.

## What will change

1. **Drop the database trigger on `attendance_logs`**
   - `trg_sync_attendance_leave_balance` (INSERT / UPDATE)
   - `trg_sync_attendance_leave_balance_del` (DELETE)

2. **Drop the trigger-only helper functions**
   - `public.sync_attendance_leave_balance()`
   - `public.apply_attendance_leave_balance(_employee_id uuid, _date date, _leave_type text, _delta numeric)`
   - `public.attendance_leave_type(_status text)`

   These functions were created only to support the trigger and are not called from the application code.

3. **Preserve app-layer sync**
   - Keep `src/lib/hrmsSync.ts` unchanged.
   - `applyLeaveDecision` continues to write/adopt `attendance_logs` rows from approved leave and revert them on rejection/cancellation.
   - `recomputeLeaveBalances` continues to recompute `leave_balances.used` absolutely from approved leave requests plus uncovered `absent` days.

4. **No other changes**
   - No table, column, route, or UI modifications.
   - The `update_updated_at_column` trigger on `attendance_logs` will remain untouched.

## Migration SQL

```sql
-- 1. Remove the triggers
DROP TRIGGER IF EXISTS trg_sync_attendance_leave_balance ON public.attendance_logs;
DROP TRIGGER IF EXISTS trg_sync_attendance_leave_balance_del ON public.attendance_logs;

-- 2. Remove the functions that were created only for this trigger
DROP FUNCTION IF EXISTS public.sync_attendance_leave_balance();
DROP FUNCTION IF EXISTS public.apply_attendance_leave_balance(uuid, date, text, numeric);
DROP FUNCTION IF EXISTS public.attendance_leave_type(text);
```

## Verification

After the migration:
- The `pg_trigger` catalog should show only `trg_attendance_logs_updated` on `attendance_logs`.
- Editing an attendance status to CL/SL/EL/LV will no longer auto-deduct from `leave_balances`; the balance stays under control of `hrmsSync.ts` until leave is approved/rejected through the app.
- No 404s, no UI regressions, and no data migrations are required.
