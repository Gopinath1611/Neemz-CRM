CREATE TABLE IF NOT EXISTS public.job_state (
  job text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_result jsonb,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_state TO authenticated;
GRANT ALL ON public.job_state TO service_role;

ALTER TABLE public.job_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view job state" ON public.job_state;
CREATE POLICY "Admins can view job state" ON public.job_state
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_job_state_updated ON public.job_state;
CREATE TRIGGER trg_job_state_updated BEFORE UPDATE ON public.job_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.job_state (job) VALUES ('lead_sync') ON CONFLICT (job) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('lead-sync-every-10-min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-sync-every-10-min');

SELECT cron.schedule(
  'lead-sync-every-10-min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kumtrpubuupvwgbwsqix.supabase.co/functions/v1/lead-sync-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1bXRycHVidXVwdndnYndzcWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDc4MDksImV4cCI6MjA4ODM4MzgwOX0.AcKyhYX7IQLFQjWSRp6pEjUyIGpvGrhuq5wu3nwGa5Y"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);