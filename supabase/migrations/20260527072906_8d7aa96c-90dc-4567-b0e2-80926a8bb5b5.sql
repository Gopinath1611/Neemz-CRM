ALTER TABLE public.connected_apps REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.connected_apps;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;