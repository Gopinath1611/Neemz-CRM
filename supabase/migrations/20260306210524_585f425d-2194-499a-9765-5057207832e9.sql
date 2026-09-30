
-- Doctor Treatment Quality Logs
CREATE TABLE public.doctor_quality_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_name TEXT NOT NULL,
  patient_id UUID REFERENCES public.patients(id),
  patient_name TEXT NOT NULL,
  treatment_type TEXT NOT NULL,
  tooth_number INTEGER,
  issue_type TEXT NOT NULL DEFAULT 'complaint', -- complaint, repeat_treatment, poor_outcome, patient_dissatisfaction
  issue_description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  review_week INTEGER,
  review_month INTEGER,
  review_year INTEGER,
  action_taken TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open, under_review, resolved, escalated
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lab Quality Logs
CREATE TABLE public.lab_quality_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lab_name TEXT NOT NULL,
  lab_order_id UUID REFERENCES public.lab_orders(id),
  patient_name TEXT NOT NULL,
  work_type TEXT NOT NULL DEFAULT 'crown',
  material TEXT,
  issue_type TEXT NOT NULL DEFAULT 'fit_issue', -- fit_issue, shade_mismatch, chipping, breakage, delayed, wrong_design
  issue_description TEXT NOT NULL,
  is_repeat BOOLEAN NOT NULL DEFAULT false,
  repeat_count INTEGER DEFAULT 1,
  severity TEXT NOT NULL DEFAULT 'medium',
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_date DATE,
  action_taken TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pharma/Drug Quality Logs
CREATE TABLE public.pharma_quality_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drug_name TEXT NOT NULL,
  brand_name TEXT,
  batch_number TEXT,
  patient_name TEXT NOT NULL,
  patient_id UUID REFERENCES public.patients(id),
  reaction_type TEXT NOT NULL DEFAULT 'allergy', -- allergy, stomach_pain, no_effect, side_effect, other
  reaction_description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  doctor_name TEXT,
  action_taken TEXT,
  status TEXT NOT NULL DEFAULT 'reported', -- reported, under_review, confirmed, resolved
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.doctor_quality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_quality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharma_quality_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to doctor_quality_logs" ON public.doctor_quality_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to lab_quality_logs" ON public.lab_quality_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to pharma_quality_logs" ON public.pharma_quality_logs FOR ALL USING (true) WITH CHECK (true);
