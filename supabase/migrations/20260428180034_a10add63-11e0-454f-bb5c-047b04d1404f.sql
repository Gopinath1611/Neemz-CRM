-- 1. Add user_id to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- 2. Helper: get current user's employee id
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- 3. Helper: is admin or hr
CREATE OR REPLACE FUNCTION public.is_hr_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::app_role, 'hr'::app_role)
  );
$$;

-- 4. Employees table policies — everyone can view list, only admin/HR can modify
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view employees" ON public.employees;
CREATE POLICY "Authenticated users can view employees"
  ON public.employees FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only admin/hr can insert employees" ON public.employees;
CREATE POLICY "Only admin/hr can insert employees"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admin/hr can update employees" ON public.employees;
CREATE POLICY "Only admin/hr can update employees"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admin/hr can delete employees" ON public.employees;
CREATE POLICY "Only admin/hr can delete employees"
  ON public.employees FOR DELETE
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

-- 5. Attendance — own records only (admin/HR see all)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance') THEN
    EXECUTE 'ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "View own attendance" ON public.attendance';
    EXECUTE 'CREATE POLICY "View own attendance" ON public.attendance FOR SELECT TO authenticated
      USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Insert own attendance" ON public.attendance';
    EXECUTE 'CREATE POLICY "Insert own attendance" ON public.attendance FOR INSERT TO authenticated
      WITH CHECK (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Update own attendance" ON public.attendance';
    EXECUTE 'CREATE POLICY "Update own attendance" ON public.attendance FOR UPDATE TO authenticated
      USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Delete attendance admin only" ON public.attendance';
    EXECUTE 'CREATE POLICY "Delete attendance admin only" ON public.attendance FOR DELETE TO authenticated
      USING (public.is_hr_or_admin(auth.uid()))';
  END IF;
END $$;

-- 6. Leave requests — own records only
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_requests') THEN
    EXECUTE 'ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "View own leaves" ON public.leave_requests';
    EXECUTE 'CREATE POLICY "View own leaves" ON public.leave_requests FOR SELECT TO authenticated
      USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Insert own leaves" ON public.leave_requests';
    EXECUTE 'CREATE POLICY "Insert own leaves" ON public.leave_requests FOR INSERT TO authenticated
      WITH CHECK (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Update own leaves" ON public.leave_requests';
    EXECUTE 'CREATE POLICY "Update own leaves" ON public.leave_requests FOR UPDATE TO authenticated
      USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Delete leaves admin only" ON public.leave_requests';
    EXECUTE 'CREATE POLICY "Delete leaves admin only" ON public.leave_requests FOR DELETE TO authenticated
      USING (public.is_hr_or_admin(auth.uid()))';
  END IF;
END $$;

-- 7. Leave balances — own records only
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_balances') THEN
    EXECUTE 'ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "View own balances" ON public.leave_balances';
    EXECUTE 'CREATE POLICY "View own balances" ON public.leave_balances FOR SELECT TO authenticated
      USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Modify balances admin only" ON public.leave_balances';
    EXECUTE 'CREATE POLICY "Modify balances admin only" ON public.leave_balances FOR ALL TO authenticated
      USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()))';
  END IF;
END $$;

-- 8. Payroll — own records only
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll') THEN
    EXECUTE 'ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "View own payroll" ON public.payroll';
    EXECUTE 'CREATE POLICY "View own payroll" ON public.payroll FOR SELECT TO authenticated
      USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())';

    EXECUTE 'DROP POLICY IF EXISTS "Modify payroll admin only" ON public.payroll';
    EXECUTE 'CREATE POLICY "Modify payroll admin only" ON public.payroll FOR ALL TO authenticated
      USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()))';
  END IF;
END $$;