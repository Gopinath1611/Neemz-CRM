ALTER TABLE public.scan_centers
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS location text;

CREATE TABLE IF NOT EXISTS public.blood_labs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  contact_person text,
  mobile text,
  whatsapp text,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.blood_labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view blood labs" ON public.blood_labs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert blood labs" ON public.blood_labs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update blood labs" ON public.blood_labs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete blood labs" ON public.blood_labs FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_blood_labs_updated_at BEFORE UPDATE ON public.blood_labs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.diagnostic_orders ADD COLUMN IF NOT EXISTS blood_lab text;