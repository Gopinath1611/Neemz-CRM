CREATE TABLE IF NOT EXISTS public.user_reports_to (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  manager_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, manager_user_id),
  CHECK (user_id <> manager_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_to_user ON public.user_reports_to(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_to_manager ON public.user_reports_to(manager_user_id);

ALTER TABLE public.user_reports_to ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view reporting links"
ON public.user_reports_to FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert reporting links"
ON public.user_reports_to FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update reporting links"
ON public.user_reports_to FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete reporting links"
ON public.user_reports_to FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));