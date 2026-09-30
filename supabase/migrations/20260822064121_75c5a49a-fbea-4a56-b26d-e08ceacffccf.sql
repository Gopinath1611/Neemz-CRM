ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS error_code integer,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;