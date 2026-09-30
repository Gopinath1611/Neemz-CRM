-- Helper: staff allowed to create/collect bills at the chair or front desk
CREATE OR REPLACE FUNCTION public.is_billing_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'finance_manager'::app_role, 'duty_doctor'::app_role,
                   'dental_assistant'::app_role, 'receptionist'::app_role, 'dre'::app_role)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_billing_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_billing_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_cash_drawer_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'finance_manager'::app_role, 'receptionist'::app_role)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_cash_drawer_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cash_drawer_user(uuid) TO authenticated;

-- Clear existing policies on the money tables
DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billings','billing_items','billing_payments','expenses','deposits','deposit_invoices',
    'purchases','purchase_items','cash_drawer_days','cash_drawer_expenses'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- Billing tables: billing staff read/write, finance-only delete
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billings','billing_items','billing_payments'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_billing_user(auth.uid()))', 'Billing staff view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_billing_user(auth.uid()))', 'Billing staff insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_billing_user(auth.uid()))', 'Billing staff update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_finance_user(auth.uid()))', 'Finance delete ' || t, t);
  END LOOP;
END $$;

-- Expenses / deposits / purchases: finance + admin only
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses','deposits','deposit_invoices','purchases','purchase_items'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_finance_user(auth.uid()))', 'Finance view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_finance_user(auth.uid()))', 'Finance insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_finance_user(auth.uid()))', 'Finance update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_finance_user(auth.uid()))', 'Finance delete ' || t, t);
  END LOOP;
END $$;

-- Cash drawer: reception + finance + admin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_drawer_days','cash_drawer_expenses'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_cash_drawer_user(auth.uid()))', 'Drawer view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_cash_drawer_user(auth.uid()))', 'Drawer insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_cash_drawer_user(auth.uid()))', 'Drawer update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_finance_user(auth.uid()))', 'Drawer delete ' || t, t);
  END LOOP;
END $$;