
-- 1) Revoke EXECUTE on internal trigger-only SECURITY DEFINER functions
--    These are fired by DB triggers and must not be directly callable via PostgREST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_purchase_inventory_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_finding_cache_from_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_finding_history_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_appointment_to_employee_target() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_purchase_to_expense() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_referral_from_billing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_treatment_to_employee_target() FROM PUBLIC, anon, authenticated;

-- Other trigger-only functions that only had authenticated (defensive)
REVOKE EXECUTE ON FUNCTION public.generate_camp_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_lead_unique_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_expense_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_emi_case_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_billing_payment_dedupe_key() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_purchase_delivery_date() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_inventory_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_fy_actuals(uuid, text, integer) FROM PUBLIC, anon, authenticated;

-- Note: has_role / is_finance_user / is_hr_or_admin / current_employee_id keep
-- EXECUTE for authenticated because they are called inside RLS policies.

-- 2) Restrict storage.objects SELECT on public buckets so anonymous clients
--    cannot LIST the buckets. Direct public download URLs still work because
--    Supabase serves them through the public endpoint bypassing RLS.
DROP POLICY IF EXISTS "Anyone can view social media files" ON storage.objects;
CREATE POLICY "Authenticated can list social media files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'social-media');

DROP POLICY IF EXISTS "Public read clinic-assets" ON storage.objects;
CREATE POLICY "Authenticated can list clinic-assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-assets');

DROP POLICY IF EXISTS "Public read meeting files" ON storage.objects;
CREATE POLICY "Authenticated can list meeting files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'meeting-files');

DROP POLICY IF EXISTS "Public read warranty cards" ON storage.objects;
CREATE POLICY "Authenticated can list warranty cards"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'warranty-cards');
