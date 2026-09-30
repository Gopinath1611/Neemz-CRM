
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'one_time';

CREATE TABLE IF NOT EXISTS public.meeting_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 5,
  attachment_url text,
  attachment_type text,
  attachment_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_agenda_items_meeting ON public.meeting_agenda_items(meeting_id, position);

ALTER TABLE public.meeting_agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view agenda items" ON public.meeting_agenda_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert agenda items" ON public.meeting_agenda_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update agenda items" ON public.meeting_agenda_items
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete agenda items" ON public.meeting_agenda_items
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_meeting_agenda_items_updated
  BEFORE UPDATE ON public.meeting_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-files', 'meeting-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read meeting files" ON storage.objects
  FOR SELECT USING (bucket_id = 'meeting-files');
CREATE POLICY "Authenticated upload meeting files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-files');
CREATE POLICY "Authenticated update meeting files" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'meeting-files');
CREATE POLICY "Authenticated delete meeting files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'meeting-files');
