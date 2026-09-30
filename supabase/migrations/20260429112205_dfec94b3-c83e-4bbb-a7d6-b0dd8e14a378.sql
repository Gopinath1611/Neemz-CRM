ALTER TABLE public.clinic_brands 
  ADD COLUMN IF NOT EXISTS rep_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT;