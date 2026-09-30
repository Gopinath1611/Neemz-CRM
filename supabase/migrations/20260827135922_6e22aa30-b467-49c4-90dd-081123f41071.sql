-- Remove the conflicting attendance/leave balance triggers on attendance_logs
DROP TRIGGER IF EXISTS trg_sync_attendance_leave_balance ON public.attendance_logs;
DROP TRIGGER IF EXISTS trg_sync_attendance_leave_balance_del ON public.attendance_logs;

-- Remove the helper functions that existed only to support those triggers
DROP FUNCTION IF EXISTS public.sync_attendance_leave_balance();
DROP FUNCTION IF EXISTS public.sync_attendance_leave_balance_delete();
DROP FUNCTION IF EXISTS public.apply_attendance_leave_balance(uuid, date, text, numeric);
DROP FUNCTION IF EXISTS public.attendance_leave_type(text);