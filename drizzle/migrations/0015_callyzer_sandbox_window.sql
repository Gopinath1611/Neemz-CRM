ALTER TABLE public.callyzer_settings
  ADD COLUMN IF NOT EXISTS sandbox_window_from date NOT NULL DEFAULT '2026-09-19',
  ADD COLUMN IF NOT EXISTS sandbox_window_to   date NOT NULL DEFAULT '2026-10-03';