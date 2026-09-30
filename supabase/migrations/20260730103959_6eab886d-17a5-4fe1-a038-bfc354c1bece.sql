ALTER TABLE public.workflow_runs REPLICA IDENTITY FULL;
ALTER TABLE public.workflows REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflows;