CREATE TABLE IF NOT EXISTS public.orthodontic_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.orthodontic_cases(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  record_type text NOT NULL DEFAULT 'OPG',
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_path text,
  file_size bigint,
  mime_type text,
  notes text,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ortho_records_case ON public.orthodontic_records(case_id);
CREATE INDEX IF NOT EXISTS idx_ortho_records_patient ON public.orthodontic_records(patient_id);

ALTER TABLE public.orthodontic_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ortho records"
  ON public.orthodontic_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ortho records"
  ON public.orthodontic_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ortho records"
  ON public.orthodontic_records FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete ortho records"
  ON public.orthodontic_records FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_orthodontic_records_updated_at
  BEFORE UPDATE ON public.orthodontic_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for ortho records under diagnostic-reports bucket
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated can upload ortho records') THEN
    CREATE POLICY "Authenticated can upload ortho records"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'diagnostic-reports');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated can delete ortho records') THEN
    CREATE POLICY "Authenticated can delete ortho records"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'diagnostic-reports');
  END IF;
END $$;