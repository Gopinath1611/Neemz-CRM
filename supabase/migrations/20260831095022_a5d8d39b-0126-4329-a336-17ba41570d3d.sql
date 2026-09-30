CREATE TABLE public.local_seo_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_url text NOT NULL,
  gsc_property text,
  range_start date,
  range_end date,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  rankings jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.local_seo_snapshots TO authenticated;
GRANT ALL ON public.local_seo_snapshots TO service_role;

ALTER TABLE public.local_seo_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read local seo snapshots"
ON public.local_seo_snapshots FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_local_seo_snapshots_created_at ON public.local_seo_snapshots (created_at DESC);

CREATE TRIGGER update_local_seo_snapshots_updated_at
BEFORE UPDATE ON public.local_seo_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();