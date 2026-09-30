ALTER TABLE public.custom_roles
ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_roles_reports_to ON public.custom_roles(reports_to);