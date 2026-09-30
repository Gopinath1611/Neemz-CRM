DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'social_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_messages;
  END IF;
END $$;
ALTER TABLE public.social_messages REPLICA IDENTITY FULL;