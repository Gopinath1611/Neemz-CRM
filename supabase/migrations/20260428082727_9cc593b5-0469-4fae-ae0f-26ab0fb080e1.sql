ALTER TABLE public.employee_targets
  ADD COLUMN IF NOT EXISTS manual_achieved numeric,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;