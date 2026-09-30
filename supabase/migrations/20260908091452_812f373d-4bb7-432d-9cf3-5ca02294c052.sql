CREATE TABLE public.whatsapp_pricing_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  rate NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_pricing_rates TO authenticated;
GRANT ALL ON public.whatsapp_pricing_rates TO service_role;

ALTER TABLE public.whatsapp_pricing_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view WhatsApp rates"
ON public.whatsapp_pricing_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert WhatsApp rates"
ON public.whatsapp_pricing_rates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update WhatsApp rates"
ON public.whatsapp_pricing_rates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete WhatsApp rates"
ON public.whatsapp_pricing_rates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_whatsapp_pricing_rates_updated_at
BEFORE UPDATE ON public.whatsapp_pricing_rates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();