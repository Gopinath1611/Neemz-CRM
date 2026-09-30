ALTER TABLE public.fy_patient_targets
  ADD COLUMN IF NOT EXISTS ad_patient_target integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_media_patient_target integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offline_camp_patient_target integer NOT NULL DEFAULT 0;