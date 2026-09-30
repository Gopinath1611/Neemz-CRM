CREATE TABLE public.dental_assistants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.dental_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to dental_assistants" ON public.dental_assistants FOR ALL USING (true) WITH CHECK (true);