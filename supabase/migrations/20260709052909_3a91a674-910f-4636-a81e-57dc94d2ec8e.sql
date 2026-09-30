
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS error jsonb;

CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_idx
  ON public.whatsapp_messages(wa_message_id);
