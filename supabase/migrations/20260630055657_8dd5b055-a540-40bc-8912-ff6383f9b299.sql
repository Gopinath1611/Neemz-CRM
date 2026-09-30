
-- ============================================================
-- consultation_findings (immutable canonical record)
-- ============================================================
CREATE TABLE public.consultation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  chart_id uuid REFERENCES public.dental_charts(id) ON DELETE SET NULL,
  chart_entry_id uuid REFERENCES public.dental_chart_entries(id) ON DELETE SET NULL,
  parent_finding_id uuid REFERENCES public.consultation_findings(id) ON DELETE SET NULL,
  tooth_number integer,
  surface text,
  condition text NOT NULL,
  diagnosis text,
  treatment_needed text,
  notes text,
  doctor text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cf_patient_recorded ON public.consultation_findings(patient_id, recorded_at DESC);
CREATE INDEX idx_cf_chart ON public.consultation_findings(chart_id);
CREATE INDEX idx_cf_checkin ON public.consultation_findings(checkin_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultation_findings TO authenticated;
GRANT ALL ON public.consultation_findings TO service_role;

ALTER TABLE public.consultation_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read findings"   ON public.consultation_findings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert findings" ON public.consultation_findings FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE / DELETE policy for authenticated => immutable from app. service_role bypasses RLS.

-- ============================================================
-- finding_status_history (append-only timeline)
-- ============================================================
CREATE TABLE public.finding_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.consultation_findings(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor text,
  previous_status text,
  new_status text NOT NULL CHECK (new_status IN ('active','continuing','monitoring','resolved','recurred','reopened')),
  progress_note text,
  updated_by uuid,
  event_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fsh_finding_event ON public.finding_status_history(finding_id, event_date);
CREATE INDEX idx_fsh_patient_event ON public.finding_status_history(patient_id, event_date DESC);

GRANT SELECT, INSERT ON public.finding_status_history TO authenticated;
GRANT ALL ON public.finding_status_history TO service_role;

ALTER TABLE public.finding_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read history"   ON public.finding_status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert history" ON public.finding_status_history FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE / DELETE policy => append-only tamper-proof audit log.

-- ============================================================
-- Trigger: seed initial "active" history row on finding insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_finding_history_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.finding_status_history (
    finding_id, patient_id, checkin_id, appointment_id, doctor,
    previous_status, new_status, progress_note, updated_by, event_date
  ) VALUES (
    NEW.id, NEW.patient_id, NEW.checkin_id, NEW.appointment_id, NEW.doctor,
    NULL, 'active', NEW.notes, NEW.created_by, NEW.recorded_at
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_finding_history
AFTER INSERT ON public.consultation_findings
FOR EACH ROW EXECUTE FUNCTION public.seed_finding_history_on_insert();
