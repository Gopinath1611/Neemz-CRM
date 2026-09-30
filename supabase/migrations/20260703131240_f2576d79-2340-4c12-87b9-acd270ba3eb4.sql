DO $$
BEGIN
  ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_module_access REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_module_access;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;