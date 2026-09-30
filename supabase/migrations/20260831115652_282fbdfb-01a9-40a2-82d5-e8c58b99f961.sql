CREATE OR REPLACE FUNCTION public.is_sales_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'digital_marketing_manager'::app_role,
                   'digital_marketing_executive'::app_role, 'telecaller'::app_role,
                   'receptionist'::app_role, 'dre'::app_role)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_sales_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_sales_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_marketing_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'digital_marketing_manager'::app_role)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_marketing_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_marketing_admin(uuid) TO authenticated;

DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','lead_notes','lead_activity','follow_ups','campaigns','campaign_coupons',
    'campaign_followups','screening_leads','referrals','review_requests','patient_recalls',
    'whatsapp_campaigns','whatsapp_templates','whatsapp_threads','whatsapp_messages',
    'social_messages','content_calendar','connected_apps'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','lead_notes','lead_activity','follow_ups','campaigns','campaign_coupons',
    'campaign_followups','screening_leads','referrals','review_requests','patient_recalls',
    'whatsapp_campaigns','whatsapp_templates','whatsapp_threads','whatsapp_messages'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_sales_user(auth.uid()))', 'Sales view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_sales_user(auth.uid()))', 'Sales insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_sales_user(auth.uid()))', 'Sales update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_marketing_admin(auth.uid()))', 'Marketing delete ' || t, t);
  END LOOP;
END $$;

-- Social content: sales roles + video editors
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_messages','content_calendar'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_sales_user(auth.uid()) OR public.has_role(auth.uid(), ''video_editor''::app_role))', 'Social view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_sales_user(auth.uid()) OR public.has_role(auth.uid(), ''video_editor''::app_role))', 'Social insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_sales_user(auth.uid()) OR public.has_role(auth.uid(), ''video_editor''::app_role))', 'Social update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_marketing_admin(auth.uid()))', 'Social delete ' || t, t);
  END LOOP;
END $$;

-- Integration credentials: admin + marketing manager only
CREATE POLICY "Marketing admins manage connected apps" ON public.connected_apps
  FOR ALL TO authenticated
  USING (public.is_marketing_admin(auth.uid()))
  WITH CHECK (public.is_marketing_admin(auth.uid()));