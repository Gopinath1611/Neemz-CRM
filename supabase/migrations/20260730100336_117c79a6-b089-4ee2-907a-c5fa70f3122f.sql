ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_lead_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_meta_lead_id ON public.leads(meta_lead_id) WHERE meta_lead_id IS NOT NULL;