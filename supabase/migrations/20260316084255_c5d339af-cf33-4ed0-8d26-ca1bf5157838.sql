
ALTER TABLE public.districts 
  ADD COLUMN IF NOT EXISTS state text DEFAULT 'Tamil Nadu',
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'India';

UPDATE public.districts SET state = 'Tamil Nadu', country = 'India' WHERE state IS NULL;
