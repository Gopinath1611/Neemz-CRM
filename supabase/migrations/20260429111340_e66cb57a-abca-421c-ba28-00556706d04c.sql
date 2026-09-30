CREATE TABLE IF NOT EXISTS public.clinic_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view brands" ON public.clinic_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert brands" ON public.clinic_brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update brands" ON public.clinic_brands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete brands" ON public.clinic_brands FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_clinic_brands_updated_at
BEFORE UPDATE ON public.clinic_brands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();