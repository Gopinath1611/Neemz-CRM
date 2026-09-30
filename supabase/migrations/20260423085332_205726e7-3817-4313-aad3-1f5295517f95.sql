ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS source text DEFAULT 'walk_in';
CREATE INDEX IF NOT EXISTS idx_patients_source ON public.patients(source);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON public.patients(created_at);