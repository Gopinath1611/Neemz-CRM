
-- =====================================================================
-- 1. Drop "Public access to ..." policies on tables that already have
--    proper authenticated policies (just removing the public override).
-- =====================================================================
DROP POLICY IF EXISTS "Public access to employees" ON public.employees;
DROP POLICY IF EXISTS "Public access to payroll" ON public.payroll;
DROP POLICY IF EXISTS "Public access to leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Public access to attendance_logs" ON public.attendance_logs;

-- =====================================================================
-- 2. Tables that only had the public ALL policy.
--    Drop it and create an authenticated ALL policy.
-- =====================================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'appointments','billing_items','billings','campaign_coupons','campaign_followups',
    'campaigns','clinic_treatments','clinical_photos','content_calendar','corporate_partnerships',
    'dental_assistants','dental_chart_entries','dental_charts','department_roles','districts',
    'doctor_quality_logs','doctors','education_categories','education_subcategories','education_videos',
    'employee_targets','expense_categories','expense_subcategories','expenses','follow_ups',
    'incentive_plans','institution_interactions','institutions','lab_orders','lab_quality_logs',
    'lab_works','labs','lead_sources','leads','medicine_dosages','medicines','onboarding_tasks',
    'patient_checkins','patient_recalls','patient_vitals','patients','performance_logs',
    'performance_points','pharma_quality_logs','prescription_items','prescription_template_items',
    'prescription_templates','prescriptions','purchase_items','purchases','referrals',
    'review_requests','role_metrics','screening_leads','sterilization_logs','supplier_items',
    'suppliers','treatment_plan_items','treatment_plans','waste_agencies','waste_logs',
    'whatsapp_campaigns'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public access to ' || tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'Authenticated full access to ' || tbl, tbl
    );
    -- Revoke any anon grants that may exist
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
  END LOOP;
END $$;

-- =====================================================================
-- 3. clinic_settings: authenticated read, admin-only writes
-- =====================================================================
DROP POLICY IF EXISTS "Public access to clinic_settings" ON public.clinic_settings;
CREATE POLICY "Authenticated can view clinic settings"
  ON public.clinic_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert clinic settings"
  ON public.clinic_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update clinic settings"
  ON public.clinic_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete clinic settings"
  ON public.clinic_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.clinic_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_settings TO authenticated;
GRANT ALL ON public.clinic_settings TO service_role;

-- =====================================================================
-- 4. Storage buckets: make sensitive ones private and tighten policies
-- =====================================================================
UPDATE storage.buckets SET public = false WHERE id IN ('clinical-photos','diagnostic-reports','smile-design');

-- clinical-photos: drop public ALL, add authenticated CRUD
DROP POLICY IF EXISTS "Public access to clinical photos" ON storage.objects;
CREATE POLICY "Authenticated read clinical photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinical-photos');
CREATE POLICY "Authenticated upload clinical photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinical-photos');
CREATE POLICY "Authenticated update clinical photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clinical-photos');
CREATE POLICY "Authenticated delete clinical photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clinical-photos');

-- diagnostic-reports: drop public SELECT and the duplicate public-role CRUD policies
DROP POLICY IF EXISTS "Diagnostic reports are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete diagnostic reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update diagnostic reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload diagnostic reports" ON storage.objects;
CREATE POLICY "Authenticated read diagnostic reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'diagnostic-reports');
CREATE POLICY "Authenticated upload diagnostic reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'diagnostic-reports');
CREATE POLICY "Authenticated update diagnostic reports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'diagnostic-reports');
CREATE POLICY "Authenticated delete diagnostic reports v2"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'diagnostic-reports');

-- smile-design: drop public SELECT, restrict to authenticated
DROP POLICY IF EXISTS "Smile design images are publicly viewable" ON storage.objects;
CREATE POLICY "Authenticated read smile design"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'smile-design');

-- warranty-cards: drop public writes, keep public read
DROP POLICY IF EXISTS "Anyone can delete warranty cards" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update warranty cards" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload warranty cards" ON storage.objects;
CREATE POLICY "Authenticated upload warranty cards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'warranty-cards');
CREATE POLICY "Authenticated update warranty cards"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'warranty-cards');
CREATE POLICY "Authenticated delete warranty cards"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'warranty-cards');

-- =====================================================================
-- 5. Realtime: require authentication to subscribe to any channel
-- =====================================================================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (true);

-- =====================================================================
-- 6. Revoke EXECUTE on SECURITY DEFINER helper functions from anon
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_finance_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_hr_or_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_employee_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recompute_fy_actuals(uuid, text, integer) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_finance_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_hr_or_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_fy_actuals(uuid, text, integer) TO service_role;
