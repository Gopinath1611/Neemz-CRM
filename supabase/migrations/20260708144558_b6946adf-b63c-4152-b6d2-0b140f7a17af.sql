CREATE TABLE public.whatsapp_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone text NOT NULL UNIQUE,
  display_name text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_threads TO authenticated;
GRANT ALL ON public.whatsapp_threads TO service_role;

ALTER TABLE public.whatsapp_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage whatsapp threads"
  ON public.whatsapp_threads FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.whatsapp_threads(id) ON DELETE CASCADE,
  wa_message_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  text text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage whatsapp messages"
  ON public.whatsapp_messages FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_whatsapp_messages_thread ON public.whatsapp_messages(thread_id, received_at DESC);

CREATE TRIGGER update_whatsapp_threads_updated_at
  BEFORE UPDATE ON public.whatsapp_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER TABLE public.whatsapp_threads REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;