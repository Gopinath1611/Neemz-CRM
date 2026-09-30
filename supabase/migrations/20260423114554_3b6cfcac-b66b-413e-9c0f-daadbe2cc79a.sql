-- PRE (Patient Relationship Executive) Targets
CREATE TABLE IF NOT EXISTS public.fy_pre_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  pre_name text,
  total_calls_target integer NOT NULL DEFAULT 0,
  new_calls_target integer NOT NULL DEFAULT 0,
  followup_calls_target integer NOT NULL DEFAULT 0,
  old_leads_target integer NOT NULL DEFAULT 0,
  old_followup_calls_target integer NOT NULL DEFAULT 0,
  appointments_booked_target integer NOT NULL DEFAULT 0,
  clinic_converted_target integer NOT NULL DEFAULT 0,
  treatment_taken_target integer NOT NULL DEFAULT 0,
  responsible_person text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fy_pre_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view PRE targets"
  ON public.fy_pre_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert PRE targets"
  ON public.fy_pre_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update PRE targets"
  ON public.fy_pre_targets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete PRE targets"
  ON public.fy_pre_targets FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_fy_pre_targets_updated_at
  BEFORE UPDATE ON public.fy_pre_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Treatment-wise Targets
CREATE TABLE IF NOT EXISTS public.fy_treatment_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  treatment text NOT NULL,
  leads_target integer NOT NULL DEFAULT 0,
  appointments_booked_target integer NOT NULL DEFAULT 0,
  checkins_target integer NOT NULL DEFAULT 0,
  no_show_target integer NOT NULL DEFAULT 0,
  reschedule_target integer NOT NULL DEFAULT 0,
  treatment_done_target integer NOT NULL DEFAULT 0,
  responsible_person text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fy_treatment_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view treatment targets"
  ON public.fy_treatment_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert treatment targets"
  ON public.fy_treatment_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update treatment targets"
  ON public.fy_treatment_targets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete treatment targets"
  ON public.fy_treatment_targets FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_fy_treatment_targets_updated_at
  BEFORE UPDATE ON public.fy_treatment_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();