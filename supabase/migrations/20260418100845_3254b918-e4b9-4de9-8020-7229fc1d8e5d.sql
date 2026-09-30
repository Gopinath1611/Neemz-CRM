-- Training Programs catalog
CREATE TABLE public.training_programs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'induction',
  description text,
  duration_hours numeric DEFAULT 0,
  materials_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage training programs"
ON public.training_programs FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_training_programs_updated_at
BEFORE UPDATE ON public.training_programs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-employee training tracking
CREATE TABLE public.employee_trainings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  start_date date,
  completion_date date,
  certificate_url text,
  certificate_expiry_date date,
  reminder_days integer NOT NULL DEFAULT 15,
  trainer_name text,
  score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage employee trainings"
ON public.employee_trainings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_employee_trainings_updated_at
BEFORE UPDATE ON public.employee_trainings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_employee_trainings_employee ON public.employee_trainings(employee_id);
CREATE INDEX idx_employee_trainings_expiry ON public.employee_trainings(certificate_expiry_date);

-- Document categories
CREATE TABLE public.document_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  requires_expiry boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage document categories"
ON public.document_categories FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_document_categories_updated_at
BEFORE UPDATE ON public.document_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-employee documents
CREATE TABLE public.employee_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.document_categories(id) ON DELETE RESTRICT,
  document_name text NOT NULL,
  file_url text NOT NULL,
  file_path text,
  file_size integer,
  mime_type text,
  issue_date date,
  expiry_date date,
  reminder_days integer NOT NULL DEFAULT 15,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage employee documents"
ON public.employee_documents FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_employee_documents_updated_at
BEFORE UPDATE ON public.employee_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_employee_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX idx_employee_documents_expiry ON public.employee_documents(expiry_date);

-- Seed default document categories
INSERT INTO public.document_categories (name, description, requires_expiry, sort_order) VALUES
  ('Offer Letter', 'Employment offer letter', false, 1),
  ('Experience Letter', 'Previous employment experience letter', false, 2),
  ('NDA Agreement', 'Non-disclosure agreement', false, 3),
  ('ID Proof', 'Aadhar, PAN, Passport, Voter ID', true, 4),
  ('Address Proof', 'Address verification document', true, 5),
  ('Educational Certificate', 'Degree, diploma certificates', false, 6),
  ('Resume / CV', 'Curriculum vitae', false, 7);

-- Seed default training programs
INSERT INTO public.training_programs (name, category, description, sort_order) VALUES
  ('Induction & Onboarding', 'induction', 'New employee orientation and clinic introduction', 1),
  ('Clinical Procedures Training', 'clinical', 'Clinical protocols, sterilization, patient handling', 2),
  ('Software Training (CRM)', 'software', 'Clinic CRM software and workflow training', 3),
  ('Patient Communication Skills', 'communication', 'Communication etiquette and patient handling', 4),
  ('Post-Training Assessment', 'post_training', 'Final evaluation after training completion', 5),
  ('BLS / CPR Certification', 'certificate_renewal', 'Basic life support certification', 6);

-- Storage bucket for HR documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('hr-documents', 'hr-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users view hr-documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hr-documents');

CREATE POLICY "Authenticated users upload hr-documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hr-documents');

CREATE POLICY "Authenticated users update hr-documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'hr-documents');

CREATE POLICY "Authenticated users delete hr-documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hr-documents');