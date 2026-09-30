CREATE TABLE public.institution_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL DEFAULT 'call',
  interaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_person TEXT,
  summary TEXT NOT NULL,
  outcome TEXT,
  next_action TEXT,
  next_action_date DATE,
  duration_minutes INTEGER,
  logged_by TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.institution_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to institution_interactions"
ON public.institution_interactions
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_institution_interactions_institution_id ON public.institution_interactions(institution_id);
CREATE INDEX idx_institution_interactions_date ON public.institution_interactions(interaction_date DESC);

CREATE TRIGGER update_institution_interactions_updated_at
BEFORE UPDATE ON public.institution_interactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();