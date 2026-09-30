ALTER TABLE public.employee_targets 
  ADD COLUMN IF NOT EXISTS points_per_unit numeric NOT NULL DEFAULT 1;