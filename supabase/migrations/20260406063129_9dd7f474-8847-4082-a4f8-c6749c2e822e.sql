CREATE TABLE public.lead_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to lead_sources"
  ON public.lead_sources
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Insert default sources
INSERT INTO public.lead_sources (name) VALUES
  ('Google'),
  ('Meta'),
  ('Walk-in'),
  ('WhatsApp'),
  ('Referral'),
  ('Website'),
  ('Instagram'),
  ('Facebook'),
  ('Phone Call'),
  ('SMS Campaign');