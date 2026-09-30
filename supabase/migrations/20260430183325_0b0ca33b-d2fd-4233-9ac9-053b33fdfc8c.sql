-- Meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  agenda TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  location TEXT,
  meeting_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  decisions TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  organizer TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view meetings"
  ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert meetings"
  ON public.meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update meetings"
  ON public.meetings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete meetings"
  ON public.meetings FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_meetings_scheduled_at ON public.meetings(scheduled_at);
CREATE INDEX idx_meetings_status ON public.meetings(status);

-- Action items table
CREATE TABLE public.meeting_action_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view action items"
  ON public.meeting_action_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert action items"
  ON public.meeting_action_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update action items"
  ON public.meeting_action_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete action items"
  ON public.meeting_action_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_meeting_action_items_updated_at
  BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_action_items_meeting ON public.meeting_action_items(meeting_id);
CREATE INDEX idx_action_items_status ON public.meeting_action_items(status);
CREATE INDEX idx_action_items_due_date ON public.meeting_action_items(due_date);