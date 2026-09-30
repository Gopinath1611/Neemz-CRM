ALTER TABLE public.fy_sales_targets
  ADD COLUMN IF NOT EXISTS campaign text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS treatment text,
  ADD COLUMN IF NOT EXISTS converted_target integer NOT NULL DEFAULT 0;