
-- 1. Add columns to purchases
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS invoice_file_url text,
  ADD COLUMN IF NOT EXISTS payment_due_date date;

-- 2. Generic notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  entity_type text,
  entity_id uuid,
  severity text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view notifications"
  ON public.notifications FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update notifications"
  ON public.notifications FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete notifications"
  ON public.notifications FOR DELETE
  TO authenticated USING (true);

-- Prevent duplicate notifications per entity+type
CREATE UNIQUE INDEX IF NOT EXISTS notifications_type_entity_unique
  ON public.notifications (type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_is_read_idx
  ON public.notifications (is_read, created_at DESC);

CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
