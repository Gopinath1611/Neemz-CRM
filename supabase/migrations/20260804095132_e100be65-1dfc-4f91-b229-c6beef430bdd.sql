-- Lead ownership + audit columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_id ON public.leads(assigned_to_id);

-- Follow-up attribution
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS created_by_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

-- Appointment attribution
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booked_by uuid,
  ADD COLUMN IF NOT EXISTS booked_by_name text;

-- Lead notes with author attribution
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access to lead_notes" ON public.lead_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON public.lead_notes(lead_id, created_at DESC);
CREATE TRIGGER update_lead_notes_updated_at BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lead audit trail
CREATE TABLE IF NOT EXISTS public.lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  action text NOT NULL,
  field text,
  old_value text,
  new_value text,
  description text NOT NULL,
  user_id uuid,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lead_activity TO authenticated;
GRANT ALL ON public.lead_activity TO service_role;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read lead_activity" ON public.lead_activity
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert lead_activity" ON public.lead_activity
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON public.lead_activity(lead_id, created_at DESC);