DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payruns','form_16','payroll_banks','employee_documents','licenses',
    'leave_balances','leave_rollovers','comp_off_requests','employee_shifts',
    'employee_targets','incentive_plans','performance_logs'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- HR/admin only tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payruns','payroll_banks','licenses'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()))', 'HR manage ' || t, t);
  END LOOP;
END $$;

-- Own-record readable, HR/admin managed
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['form_16','employee_documents'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())', 'View own or HR ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_hr_or_admin(auth.uid()))', 'HR insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_hr_or_admin(auth.uid()))', 'HR update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_hr_or_admin(auth.uid()))', 'HR delete ' || t, t);
  END LOOP;
END $$;

-- Self-service HR records: staff readable, own-or-HR writable, HR-only delete
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leave_balances','leave_rollovers','comp_off_requests','employee_shifts'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'Staff view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())', 'Own or HR insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_hr_or_admin(auth.uid()) OR employee_id = public.current_employee_id())', 'Own or HR update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_hr_or_admin(auth.uid()))', 'HR delete ' || t, t);
  END LOOP;
END $$;

-- Performance data: staff readable, HR/admin writable
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_targets','incentive_plans','performance_logs'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'Staff view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_hr_or_admin(auth.uid()))', 'HR insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_hr_or_admin(auth.uid()))', 'HR update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_hr_or_admin(auth.uid()))', 'HR delete ' || t, t);
  END LOOP;
END $$;