ALTER TABLE public.fy_ad_targets
  ADD COLUMN IF NOT EXISTS campaign text,
  ADD COLUMN IF NOT EXISTS treatment text;