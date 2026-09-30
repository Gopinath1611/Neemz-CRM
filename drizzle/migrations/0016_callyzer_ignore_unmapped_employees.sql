ALTER TABLE public.callyzer_settings
  ADD COLUMN IF NOT EXISTS ignore_unmapped_employees boolean NOT NULL DEFAULT true;