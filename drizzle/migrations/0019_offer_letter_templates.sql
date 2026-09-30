CREATE TABLE public.offer_letter_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE DEFAULT 'default',
  clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.offer_letter_templates TO authenticated;
GRANT ALL ON public.offer_letter_templates TO service_role;
ALTER TABLE public.offer_letter_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read offer templates" ON public.offer_letter_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR/admin insert offer templates" ON public.offer_letter_templates FOR INSERT TO authenticated WITH CHECK (public.is_hr_or_admin(auth.uid()));
CREATE POLICY "HR/admin update offer templates" ON public.offer_letter_templates FOR UPDATE TO authenticated USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()));