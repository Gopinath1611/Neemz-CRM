CREATE TABLE public.housekeeping_quality_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  reported_by text NOT NULL,
  issue_type text NOT NULL DEFAULT 'cleanliness',
  issue_description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  reported_date date NOT NULL DEFAULT CURRENT_DATE,
  resolved_date date,
  action_taken text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.housekeeping_quality_logs TO authenticated;
GRANT ALL ON public.housekeeping_quality_logs TO service_role;

ALTER TABLE public.housekeeping_quality_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access to housekeeping_quality_logs"
ON public.housekeeping_quality_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX idx_housekeeping_quality_logs_date ON public.housekeeping_quality_logs (reported_date DESC);