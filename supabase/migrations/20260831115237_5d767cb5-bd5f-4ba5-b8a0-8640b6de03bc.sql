-- Helper: clinical staff (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_clinical_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'duty_doctor'::app_role, 'dental_assistant'::app_role,
                   'receptionist'::app_role, 'dre'::app_role)
  )
$$;

-- Drop existing (blanket) policies on the clinical tables
DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients','consultation_findings','finding_status_history','prescriptions','prescription_items',
    'clinical_photos','dental_charts','dental_chart_entries','treatment_plans','treatment_plan_items',
    'patient_checkins','patient_vitals'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- Patients: readable by any signed-in staff (names are needed app-wide), writable by clinical staff only
CREATE POLICY "Staff can view patients" ON public.patients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Clinical staff can add patients" ON public.patients
  FOR INSERT TO authenticated WITH CHECK (public.is_clinical_user(auth.uid()));
CREATE POLICY "Clinical staff can update patients" ON public.patients
  FOR UPDATE TO authenticated USING (public.is_clinical_user(auth.uid()));
CREATE POLICY "Admins can delete patients" ON public.patients
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Clinical record tables: clinical staff only for read + write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'consultation_findings','finding_status_history','prescriptions','prescription_items',
    'clinical_photos','dental_charts','dental_chart_entries','treatment_plans','treatment_plan_items',
    'patient_checkins','patient_vitals'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_clinical_user(auth.uid()))',
      'Clinical staff view ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_clinical_user(auth.uid()))',
      'Clinical staff insert ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_clinical_user(auth.uid()))',
      'Clinical staff update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_role(auth.uid(), ''duty_doctor''::app_role))',
      'Clinical delete ' || t, t);
  END LOOP;
END $$;