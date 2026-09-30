
-- Folders
CREATE TABLE public.workflow_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_folders TO authenticated;
GRANT ALL ON public.workflow_folders TO service_role;
ALTER TABLE public.workflow_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage workflow_folders"
  ON public.workflow_folders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Workflows
CREATE TABLE public.workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Automation',
  subtitle TEXT NOT NULL DEFAULT 'Trigger Not Set',
  folder_id UUID REFERENCES public.workflow_folders(id) ON DELETE SET NULL,
  meta_form_id TEXT,
  trigger_type TEXT,
  reentry BOOLEAN NOT NULL DEFAULT true,
  status BOOLEAN NOT NULL DEFAULT false,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflows_folder_id ON public.workflows(folder_id);
CREATE INDEX idx_workflows_meta_form_id ON public.workflows(meta_form_id) WHERE meta_form_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage workflows"
  ON public.workflows FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Runs / execution logs
CREATE TABLE public.workflow_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  contact_name TEXT,
  contact_phone TEXT,
  step TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  meta_lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_runs TO service_role;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage workflow_runs"
  ON public.workflow_runs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- updated_at triggers (reuse existing helper)
CREATE TRIGGER trg_workflow_folders_updated_at
  BEFORE UPDATE ON public.workflow_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Counter increment + run log RPC used by meta-lead-webhook
CREATE OR REPLACE FUNCTION public.increment_workflow_contacts_for_form(
  p_form_id TEXT,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_meta_lead_id TEXT DEFAULT NULL,
  p_step TEXT DEFAULT 'Lead ingested from Meta form'
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wf RECORD;
  v_count INTEGER := 0;
BEGIN
  IF p_form_id IS NULL OR p_form_id = '' THEN
    RETURN 0;
  END IF;

  FOR v_wf IN
    SELECT id FROM public.workflows
    WHERE meta_form_id = p_form_id AND status = true
  LOOP
    UPDATE public.workflows
       SET total_contacts = total_contacts + 1,
           completed = completed + 1,
           updated_at = now()
     WHERE id = v_wf.id;

    INSERT INTO public.workflow_runs (workflow_id, contact_name, contact_phone, step, status, meta_lead_id)
    VALUES (v_wf.id, p_contact_name, p_contact_phone, p_step, 'success', p_meta_lead_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_workflow_contacts_for_form(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role, authenticated;
