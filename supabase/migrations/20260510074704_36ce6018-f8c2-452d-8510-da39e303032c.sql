ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS assistant TEXT;
ALTER TABLE public.treatment_plan_items ADD COLUMN IF NOT EXISTS assistant TEXT;