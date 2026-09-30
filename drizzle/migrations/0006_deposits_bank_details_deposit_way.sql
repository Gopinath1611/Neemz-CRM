ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS deposit_way text,
  ADD COLUMN IF NOT EXISTS deposit_branch_name text,
  ADD COLUMN IF NOT EXISTS challan_number text,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS referral_code text;

ALTER TABLE public.deposits
  ADD CONSTRAINT deposits_deposit_way_check
  CHECK (deposit_way IS NULL OR deposit_way IN ('bank_branch','atm_cdm'));