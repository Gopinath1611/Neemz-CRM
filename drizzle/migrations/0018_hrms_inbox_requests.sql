ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS admin_comment text, ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.comp_off_requests ADD COLUMN IF NOT EXISTS admin_comment text, ADD COLUMN IF NOT EXISTS reviewed_by uuid;

CREATE TABLE public.expense_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_comment text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.expense_requests TO authenticated;
GRANT ALL ON public.expense_requests TO service_role;
ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own or HR expense_requests" ON public.expense_requests FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id());
CREATE POLICY "Insert own expense_requests" ON public.expense_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id() AND status = 'pending');
CREATE POLICY "HR update expense_requests" ON public.expense_requests FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()));
CREATE INDEX expense_requests_emp_idx ON public.expense_requests(employee_id, created_at DESC);
CREATE TRIGGER expense_requests_updated_at BEFORE UPDATE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comp_off_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

CREATE POLICY "Upload own expense receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = public.current_employee_id()::text);
CREATE POLICY "Read own or HR expense receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND ((storage.foldername(name))[1] = public.current_employee_id()::text OR public.is_hr_or_admin(auth.uid())));