CREATE TABLE IF NOT EXISTS public.whatsapp_blocked_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone text NOT NULL UNIQUE,
  reason text,
  error_code integer,
  source text,
  blocked boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 1,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_blocked_numbers TO authenticated;
GRANT ALL ON public.whatsapp_blocked_numbers TO service_role;

ALTER TABLE public.whatsapp_blocked_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view blocked numbers"
ON public.whatsapp_blocked_numbers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can add blocked numbers"
ON public.whatsapp_blocked_numbers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update blocked numbers"
ON public.whatsapp_blocked_numbers FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can remove blocked numbers"
ON public.whatsapp_blocked_numbers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_whatsapp_blocked_numbers_updated_at
BEFORE UPDATE ON public.whatsapp_blocked_numbers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();