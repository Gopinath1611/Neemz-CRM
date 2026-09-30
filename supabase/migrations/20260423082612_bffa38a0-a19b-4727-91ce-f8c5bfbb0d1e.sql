
-- ============ CLINIC MODULE ============

-- Patient Targets (monthly patient flow)
CREATE TABLE public.fy_patient_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  new_patient_target INTEGER NOT NULL DEFAULT 0,
  recall_patient_target INTEGER NOT NULL DEFAULT 0,
  walk_in_target INTEGER NOT NULL DEFAULT 0,
  referral_target INTEGER NOT NULL DEFAULT 0,
  total_patient_target INTEGER NOT NULL DEFAULT 0,
  daily_avg_target NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, financial_year, month)
);

-- Treatment Targets (per treatment type)
CREATE TABLE public.fy_treatment_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  treatment_name TEXT NOT NULL,
  case_count_target INTEGER NOT NULL DEFAULT 0,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  avg_case_value NUMERIC NOT NULL DEFAULT 0,
  conversion_target NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Doctor Targets
CREATE TABLE public.fy_doctor_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  doctor_name TEXT NOT NULL,
  patient_target INTEGER NOT NULL DEFAULT 0,
  case_target INTEGER NOT NULL DEFAULT 0,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  utilization_target NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ MARKETING MODULE ============

-- Ad Targets (Meta / Google Ads etc)
CREATE TABLE public.fy_ad_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  platform TEXT NOT NULL,
  budget NUMERIC NOT NULL DEFAULT 0,
  lead_target INTEGER NOT NULL DEFAULT 0,
  cpl_target NUMERIC NOT NULL DEFAULT 0,
  roas_target NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Social Media Targets
CREATE TABLE public.fy_social_media_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  platform TEXT NOT NULL,
  posts_target INTEGER NOT NULL DEFAULT 0,
  reach_target INTEGER NOT NULL DEFAULT 0,
  engagement_target INTEGER NOT NULL DEFAULT 0,
  follower_growth_target INTEGER NOT NULL DEFAULT 0,
  lead_target INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Offline Camp Targets
CREATE TABLE public.fy_offline_camp_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  camp_type TEXT NOT NULL DEFAULT 'school',
  camps_planned INTEGER NOT NULL DEFAULT 0,
  expected_screenings INTEGER NOT NULL DEFAULT 0,
  expected_conversions INTEGER NOT NULL DEFAULT 0,
  budget NUMERIC NOT NULL DEFAULT 0,
  expected_revenue NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ SALES MODULE ============

CREATE TABLE public.fy_sales_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  total_lead_target INTEGER NOT NULL DEFAULT 0,
  qualified_lead_target INTEGER NOT NULL DEFAULT 0,
  conversion_rate_target NUMERIC NOT NULL DEFAULT 0,
  opportunity_value_target NUMERIC NOT NULL DEFAULT 0,
  closures_target INTEGER NOT NULL DEFAULT 0,
  closed_revenue_target NUMERIC NOT NULL DEFAULT 0,
  responsible_person TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, financial_year, month)
);

-- ============ RECRUITMENT MODULE ============

CREATE TABLE public.fy_recruitment_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  role_name TEXT NOT NULL,
  department TEXT,
  positions_target INTEGER NOT NULL DEFAULT 0,
  expected_joining_month INTEGER CHECK (expected_joining_month BETWEEN 1 AND 12),
  budget_per_position NUMERIC NOT NULL DEFAULT 0,
  total_budget NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FINANCE MODULE ============

CREATE TABLE public.fy_finance_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  topline_revenue_target NUMERIC NOT NULL DEFAULT 0,
  cogs_target NUMERIC NOT NULL DEFAULT 0,
  gross_profit_target NUMERIC NOT NULL DEFAULT 0,
  gross_margin_percent NUMERIC NOT NULL DEFAULT 0,
  operating_expense_target NUMERIC NOT NULL DEFAULT 0,
  net_profit_target NUMERIC NOT NULL DEFAULT 0,
  net_margin_percent NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, financial_year, month)
);

-- ============ Enable RLS ============
ALTER TABLE public.fy_patient_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_treatment_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_doctor_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_ad_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_social_media_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_offline_camp_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_sales_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_recruitment_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fy_finance_targets ENABLE ROW LEVEL SECURITY;

-- ============ RLS Policies (Finance users only) ============
CREATE POLICY "Finance users manage patient targets" ON public.fy_patient_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage treatment targets" ON public.fy_treatment_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage doctor targets" ON public.fy_doctor_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage ad targets" ON public.fy_ad_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage social media targets" ON public.fy_social_media_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage offline camp targets" ON public.fy_offline_camp_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage sales targets" ON public.fy_sales_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage recruitment targets" ON public.fy_recruitment_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

CREATE POLICY "Finance users manage finance targets" ON public.fy_finance_targets
  FOR ALL TO authenticated USING (is_finance_user(auth.uid())) WITH CHECK (is_finance_user(auth.uid()));

-- ============ Triggers for updated_at ============
CREATE TRIGGER trg_fy_patient_targets_upd BEFORE UPDATE ON public.fy_patient_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_treatment_targets_upd BEFORE UPDATE ON public.fy_treatment_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_doctor_targets_upd BEFORE UPDATE ON public.fy_doctor_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_ad_targets_upd BEFORE UPDATE ON public.fy_ad_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_social_media_targets_upd BEFORE UPDATE ON public.fy_social_media_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_offline_camp_targets_upd BEFORE UPDATE ON public.fy_offline_camp_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_sales_targets_upd BEFORE UPDATE ON public.fy_sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_recruitment_targets_upd BEFORE UPDATE ON public.fy_recruitment_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fy_finance_targets_upd BEFORE UPDATE ON public.fy_finance_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
