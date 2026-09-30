CREATE TABLE public.attendance_regularization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_date date NOT NULL,
  shift_details text,
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  original_check_in timestamptz,
  original_check_out timestamptz,
  claimed_hours text,
  approved_hours text,
  remarks text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_regularization_requests TO authenticated;
GRANT ALL ON public.attendance_regularization_requests TO service_role;
ALTER TABLE public.attendance_regularization_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own or HR" ON public.attendance_regularization_requests FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_hr_or_admin(auth.uid()));
CREATE POLICY "Create own pending" ON public.attendance_regularization_requests FOR INSERT TO authenticated
  WITH CHECK ((employee_id = public.current_employee_id() AND status = 'pending') OR public.is_hr_or_admin(auth.uid()));
CREATE POLICY "HR updates" ON public.attendance_regularization_requests FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()));
CREATE POLICY "Delete own pending or HR" ON public.attendance_regularization_requests FOR DELETE TO authenticated
  USING ((employee_id = public.current_employee_id() AND status = 'pending') OR public.is_hr_or_admin(auth.uid()));
CREATE INDEX idx_att_reg_req_status ON public.attendance_regularization_requests(status, created_at DESC);
CREATE INDEX idx_att_reg_req_emp ON public.attendance_regularization_requests(employee_id);