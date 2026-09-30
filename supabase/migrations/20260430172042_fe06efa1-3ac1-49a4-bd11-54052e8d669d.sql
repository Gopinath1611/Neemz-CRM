
-- EMI / Insurance lenders (preset master list with default rates)
CREATE TABLE public.emi_lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'emi', -- 'emi' or 'insurance'
  default_interest_rate numeric DEFAULT 0,
  contact_phone text,
  contact_email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.emi_lenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view lenders" ON public.emi_lenders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage lenders" ON public.emi_lenders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed common Indian medical EMI/insurance providers
INSERT INTO public.emi_lenders (name, type, default_interest_rate) VALUES
  ('Bajaj Finserv', 'emi', 13.0),
  ('HDFC Bank EMI', 'emi', 14.0),
  ('ICICI Bank EMI', 'emi', 13.5),
  ('Axis Bank EMI', 'emi', 14.0),
  ('SaveIN', 'emi', 0),
  ('Denefits', 'emi', 0),
  ('Star Health Insurance', 'insurance', 0),
  ('HDFC Ergo', 'insurance', 0),
  ('ICICI Lombard', 'insurance', 0),
  ('Bajaj Allianz', 'insurance', 0),
  ('Niva Bupa', 'insurance', 0),
  ('CGHS', 'insurance', 0),
  ('ESI', 'insurance', 0);

-- EMI / Insurance cases
CREATE TABLE public.emi_insurance_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_code text UNIQUE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  case_type text NOT NULL DEFAULT 'emi', -- 'emi' or 'insurance'
  status text NOT NULL DEFAULT 'draft', -- draft, submitted, eligible, rejected, cancelled, active, completed
  -- KYC
  pan_number text,
  aadhar_number text,
  credit_score integer,
  -- EMI fields
  treatment_cost numeric DEFAULT 0,
  eligible_amount numeric DEFAULT 0,
  approved_amount numeric DEFAULT 0,
  down_payment numeric DEFAULT 0,
  tenure_months integer DEFAULT 0,
  interest_rate numeric DEFAULT 0,
  emi_amount numeric DEFAULT 0,
  total_interest numeric DEFAULT 0,
  total_payable numeric DEFAULT 0,
  lender_id uuid REFERENCES public.emi_lenders(id),
  lender_name text,
  -- Insurance fields
  insurance_company text,
  policy_number text,
  claim_amount numeric DEFAULT 0,
  approved_claim_amount numeric DEFAULT 0,
  claim_status text, -- pending, submitted, approved, partial, rejected
  documents_sent jsonb DEFAULT '[]'::jsonb,
  -- Common
  notes text,
  doctor text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emi_cases_patient ON public.emi_insurance_cases(patient_id);
CREATE INDEX idx_emi_cases_status ON public.emi_insurance_cases(status);
CREATE INDEX idx_emi_cases_type ON public.emi_insurance_cases(case_type);

ALTER TABLE public.emi_insurance_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view emi cases" ON public.emi_insurance_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage emi cases" ON public.emi_insurance_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_emi_cases_updated BEFORE UPDATE ON public.emi_insurance_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto generate case_code
CREATE OR REPLACE FUNCTION public.generate_emi_case_code()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  prefix text;
  next_num int;
BEGIN
  IF NEW.case_code IS NULL OR NEW.case_code = '' THEN
    prefix := CASE NEW.case_type WHEN 'insurance' THEN 'INS' ELSE 'EMI' END;
    SELECT COALESCE(MAX(CAST(SUBSTRING(case_code FROM '[0-9]+$') AS int)), 0) + 1
      INTO next_num
      FROM public.emi_insurance_cases
      WHERE case_code LIKE prefix || '%';
    NEW.case_code := prefix || '-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_emi_case_code BEFORE INSERT ON public.emi_insurance_cases
  FOR EACH ROW EXECUTE FUNCTION public.generate_emi_case_code();

-- Documents
CREATE TABLE public.emi_insurance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.emi_insurance_cases(id) ON DELETE CASCADE,
  doc_type text NOT NULL, -- pan, aadhar, bank_statement, salary_slip, insurance_form, claim_form, prescription, invoice, other
  file_url text NOT NULL,
  file_name text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_emi_docs_case ON public.emi_insurance_documents(case_id);

ALTER TABLE public.emi_insurance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view emi docs" ON public.emi_insurance_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage emi docs" ON public.emi_insurance_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('emi-documents', 'emi-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated read emi docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'emi-documents');
CREATE POLICY "Authenticated upload emi docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'emi-documents');
CREATE POLICY "Authenticated update emi docs" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'emi-documents');
CREATE POLICY "Authenticated delete emi docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'emi-documents');
