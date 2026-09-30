
-- Treatment-wise Revenue Targets
CREATE TABLE public.fy_treatment_revenue_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL,
  treatment TEXT NOT NULL,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  case_count_target INTEGER NOT NULL DEFAULT 0,
  avg_case_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fy_treatment_revenue_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users can view treatment revenue targets" ON public.fy_treatment_revenue_targets FOR SELECT USING (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can insert treatment revenue targets" ON public.fy_treatment_revenue_targets FOR INSERT WITH CHECK (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can update treatment revenue targets" ON public.fy_treatment_revenue_targets FOR UPDATE USING (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can delete treatment revenue targets" ON public.fy_treatment_revenue_targets FOR DELETE USING (public.is_finance_user(auth.uid()));
CREATE TRIGGER tg_fy_treatment_revenue_targets_updated BEFORE UPDATE ON public.fy_treatment_revenue_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Digital Marketing ROI Targets (per platform)
CREATE TABLE public.fy_digital_marketing_roi_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL,
  platform TEXT NOT NULL,
  ad_spend_target NUMERIC NOT NULL DEFAULT 0,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  leads_target INTEGER NOT NULL DEFAULT 0,
  roas_target NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fy_digital_marketing_roi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users can view digital marketing ROI targets" ON public.fy_digital_marketing_roi_targets FOR SELECT USING (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can insert digital marketing ROI targets" ON public.fy_digital_marketing_roi_targets FOR INSERT WITH CHECK (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can update digital marketing ROI targets" ON public.fy_digital_marketing_roi_targets FOR UPDATE USING (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can delete digital marketing ROI targets" ON public.fy_digital_marketing_roi_targets FOR DELETE USING (public.is_finance_user(auth.uid()));
CREATE TRIGGER tg_fy_digital_marketing_roi_targets_updated BEFORE UPDATE ON public.fy_digital_marketing_roi_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Offline Camp ROI Targets
CREATE TABLE public.fy_offline_camp_roi_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  month INTEGER NOT NULL,
  camp_type TEXT NOT NULL,
  spend_target NUMERIC NOT NULL DEFAULT 0,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  participants_target INTEGER NOT NULL DEFAULT 0,
  conversions_target INTEGER NOT NULL DEFAULT 0,
  roi_target NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fy_offline_camp_roi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users can view offline camp ROI targets" ON public.fy_offline_camp_roi_targets FOR SELECT USING (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can insert offline camp ROI targets" ON public.fy_offline_camp_roi_targets FOR INSERT WITH CHECK (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can update offline camp ROI targets" ON public.fy_offline_camp_roi_targets FOR UPDATE USING (public.is_finance_user(auth.uid()));
CREATE POLICY "Finance users can delete offline camp ROI targets" ON public.fy_offline_camp_roi_targets FOR DELETE USING (public.is_finance_user(auth.uid()));
CREATE TRIGGER tg_fy_offline_camp_roi_targets_updated BEFORE UPDATE ON public.fy_offline_camp_roi_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
