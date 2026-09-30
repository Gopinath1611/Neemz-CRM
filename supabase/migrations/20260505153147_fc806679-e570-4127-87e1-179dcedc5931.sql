CREATE TABLE public.medicine_dosages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_type TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medicine_type, value)
);

ALTER TABLE public.medicine_dosages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to medicine_dosages"
ON public.medicine_dosages FOR ALL
USING (true) WITH CHECK (true);

CREATE TRIGGER update_medicine_dosages_updated_at
BEFORE UPDATE ON public.medicine_dosages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.medicine_dosages (medicine_type, value, sort_order) VALUES
('tablet','125mg',1),('tablet','250mg',2),('tablet','500mg',3),('tablet','650mg',4),('tablet','1000mg',5),
('capsule','250mg',1),('capsule','500mg',2),
('syrup','2.5ml',1),('syrup','5ml',2),('syrup','10ml',3),('syrup','15ml',4),
('drops','2 drops',1),('drops','5 drops',2),
('injection','1ml',1),('injection','2ml',2),
('ointment','Apply thin layer',1),
('gel','Apply thin layer',1),
('mouthwash','10ml',1),('mouthwash','15ml',2),
('gargle','10ml',1),
('powder','1 sachet',1),
('toothpaste','Pea size',1),
('toothbrush','1 piece',1);