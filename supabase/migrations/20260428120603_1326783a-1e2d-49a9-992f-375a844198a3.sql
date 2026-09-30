-- Add tracking columns to diagnostic_orders
ALTER TABLE public.diagnostic_orders
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_url text,
  ADD COLUMN IF NOT EXISTS report_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS sample_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

-- Storage bucket for diagnostic reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('diagnostic-reports', 'diagnostic-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (public read, authenticated write)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Diagnostic reports are publicly viewable') THEN
    CREATE POLICY "Diagnostic reports are publicly viewable"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'diagnostic-reports');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can upload diagnostic reports') THEN
    CREATE POLICY "Authenticated can upload diagnostic reports"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'diagnostic-reports' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can update diagnostic reports') THEN
    CREATE POLICY "Authenticated can update diagnostic reports"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'diagnostic-reports' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can delete diagnostic reports') THEN
    CREATE POLICY "Authenticated can delete diagnostic reports"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'diagnostic-reports' AND auth.role() = 'authenticated');
  END IF;
END $$;