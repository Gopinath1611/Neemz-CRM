ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

UPDATE public.whatsapp_messages wm
SET is_read = true
FROM public.whatsapp_threads wt
WHERE wm.thread_id = wt.id
  AND (wm.direction = 'out' OR COALESCE(wt.unread_count, 0) = 0);