-- Orthodontic Treatment Module: case-level data + visits + payments + photos
CREATE TABLE public.orthodontic_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  case_code TEXT,
  doctor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE DEFAULT CURRENT_DATE,
  estimated_months INTEGER,
  -- Diagnosis
  molar_relation TEXT,
  canine_relation TEXT,
  overjet TEXT,
  overbite TEXT,
  midline_deviation TEXT,
  crowding TEXT,
  spacing TEXT,
  growth_pattern TEXT,
  -- Records checklist
  records JSONB NOT NULL DEFAULT '{"opg":false,"cephalogram":false,"intraoral_photos":false,"extraoral_photos":false,"study_models":false,"cbct":false}'::jsonb,
  -- Treatment plan
  appliance_type TEXT,
  extraction_plan TEXT,
  mini_implant_plan TEXT,
  treatment_notes TEXT,
  wire_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Retention
  retainer_type TEXT,
  retention_review_schedule TEXT,
  retention_started_at DATE,
  -- Payment
  total_cost NUMERIC DEFAULT 0,
  installment_amount NUMERIC DEFAULT 0,
  installment_frequency TEXT DEFAULT 'monthly',
  next_due_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.orthodontic_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.orthodontic_cases(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  phase TEXT,
  procedures JSONB NOT NULL DEFAULT '[]'::jsonb,
  wire_used TEXT,
  notes TEXT,
  next_visit_date DATE,
  doctor TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.orthodontic_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.orthodontic_cases(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.orthodontic_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.orthodontic_cases(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_date DATE NOT NULL DEFAULT CURRENT_DATE,
  phase TEXT,
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ortho_cases_patient ON public.orthodontic_cases(patient_id);
CREATE INDEX idx_ortho_visits_case ON public.orthodontic_visits(case_id);
CREATE INDEX idx_ortho_payments_case ON public.orthodontic_payments(case_id);
CREATE INDEX idx_ortho_photos_case ON public.orthodontic_photos(case_id);

ALTER TABLE public.orthodontic_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orthodontic_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orthodontic_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orthodontic_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access ortho_cases" ON public.orthodontic_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access ortho_visits" ON public.orthodontic_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access ortho_payments" ON public.orthodontic_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access ortho_photos" ON public.orthodontic_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_ortho_cases_updated BEFORE UPDATE ON public.orthodontic_cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();