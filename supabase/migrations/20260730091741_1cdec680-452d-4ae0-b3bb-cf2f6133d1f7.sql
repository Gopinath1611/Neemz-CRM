ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_form_id text;
CREATE INDEX IF NOT EXISTS idx_leads_meta_form_id ON public.leads(meta_form_id);