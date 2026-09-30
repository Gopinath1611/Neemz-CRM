ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS worked_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_entry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_entry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp_date ON public.attendance_logs (employee_id, date DESC);

DROP TRIGGER IF EXISTS trg_attendance_logs_updated ON public.attendance_logs;
CREATE TRIGGER trg_attendance_logs_updated
BEFORE UPDATE ON public.attendance_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own attendance" ON public.attendance_logs;
CREATE POLICY "Employees view own attendance" ON public.attendance_logs
FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Employees record own attendance" ON public.attendance_logs;
CREATE POLICY "Employees record own attendance" ON public.attendance_logs
FOR INSERT TO authenticated
WITH CHECK (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Employees update own attendance" ON public.attendance_logs;
CREATE POLICY "Employees update own attendance" ON public.attendance_logs
FOR UPDATE TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()))
WITH CHECK (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()));

DROP POLICY IF EXISTS "HR delete attendance" ON public.attendance_logs;
CREATE POLICY "HR delete attendance" ON public.attendance_logs
FOR DELETE TO authenticated
USING (public.is_hr_or_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.attendance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.attendance_audit TO authenticated;
GRANT ALL ON public.attendance_audit TO service_role;
ALTER TABLE public.attendance_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own attendance audit" ON public.attendance_audit
FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Insert own attendance audit" ON public.attendance_audit
FOR INSERT TO authenticated
WITH CHECK (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()));

CREATE TRIGGER trg_attendance_audit_updated
BEFORE UPDATE ON public.attendance_audit
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();