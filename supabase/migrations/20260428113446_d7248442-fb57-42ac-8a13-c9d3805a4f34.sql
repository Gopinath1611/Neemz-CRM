-- Master: Scan Centers
CREATE TABLE public.scan_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Master: Scan Tests (X-ray / Scan types like CBCT, CEPH, OPG)
CREATE TABLE public.scan_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'scan', -- 'xray' or 'scan'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Master: Blood Tests
CREATE TABLE public.blood_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Diagnostic Orders (per patient)
CREATE TABLE public.diagnostic_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  appointment_id UUID,
  category TEXT NOT NULL, -- 'xray' | 'scan_center' | 'blood_test'
  scan_center TEXT, -- name (for scan_center category)
  tests JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of test names
  notes TEXT,
  doctor TEXT,
  status TEXT NOT NULL DEFAULT 'ordered',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read scan_centers" ON public.scan_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage scan_centers" ON public.scan_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read scan_tests" ON public.scan_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage scan_tests" ON public.scan_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read blood_tests" ON public.blood_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage blood_tests" ON public.blood_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read diagnostic_orders" ON public.diagnostic_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage diagnostic_orders" ON public.diagnostic_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_scan_centers_updated BEFORE UPDATE ON public.scan_centers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_scan_tests_updated BEFORE UPDATE ON public.scan_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_blood_tests_updated BEFORE UPDATE ON public.blood_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_diagnostic_orders_updated BEFORE UPDATE ON public.diagnostic_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed common scan tests
INSERT INTO public.scan_tests (name, category) VALUES
  ('IOPA', 'xray'),
  ('OPG', 'xray'),
  ('Bitewing', 'xray'),
  ('CBCT', 'scan'),
  ('CEPH', 'scan'),
  ('Lateral Ceph', 'scan'),
  ('PA Skull', 'scan');

-- Seed common blood tests
INSERT INTO public.blood_tests (name) VALUES
  ('CBC'),
  ('Blood Sugar (Fasting)'),
  ('Blood Sugar (Random)'),
  ('HbA1c'),
  ('Bleeding Time'),
  ('Clotting Time'),
  ('Prothrombin Time (PT/INR)'),
  ('HIV'),
  ('HBsAg'),
  ('HCV');

CREATE INDEX idx_diagnostic_orders_patient ON public.diagnostic_orders(patient_id);