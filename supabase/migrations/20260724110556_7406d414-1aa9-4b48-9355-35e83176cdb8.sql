ALTER TABLE public.whatsapp_threads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS whatsapp_threads_deleted_at_idx ON public.whatsapp_threads(deleted_at);