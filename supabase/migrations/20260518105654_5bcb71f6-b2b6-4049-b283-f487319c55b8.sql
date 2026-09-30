CREATE TABLE IF NOT EXISTS public.appointment_reschedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  old_date DATE NOT NULL,
  old_start_time TIME NOT NULL,
  old_end_time TIME NOT NULL,
  new_date DATE NOT NULL,
  new_start_time TIME NOT NULL,
  new_end_time TIME NOT NULL,
  reason TEXT,
  rescheduled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_reschedules_appt ON public.appointment_reschedules(appointment_id);

ALTER TABLE public.appointment_reschedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view reschedules"
  ON public.appointment_reschedules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert reschedules"
  ON public.appointment_reschedules FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete reschedules"
  ON public.appointment_reschedules FOR DELETE
  TO authenticated USING (true);