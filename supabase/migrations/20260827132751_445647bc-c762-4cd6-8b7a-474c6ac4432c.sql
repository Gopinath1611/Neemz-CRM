REVOKE ALL ON FUNCTION public.apply_attendance_leave_balance(uuid, date, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_attendance_leave_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_attendance_leave_balance_delete() FROM PUBLIC, anon, authenticated;