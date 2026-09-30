CREATE TABLE public.social_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'instagram',
  sender_name text,
  message text,
  message_type text NOT NULL DEFAULT 'dm',
  status text NOT NULL DEFAULT 'unread',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_messages TO authenticated;
GRANT ALL ON public.social_messages TO service_role;

ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage social messages"
ON public.social_messages FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_social_messages_updated_at
BEFORE UPDATE ON public.social_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();