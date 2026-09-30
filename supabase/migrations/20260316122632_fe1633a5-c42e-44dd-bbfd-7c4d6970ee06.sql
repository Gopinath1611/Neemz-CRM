
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinic-assets', 'clinic-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read clinic-assets" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'clinic-assets');

CREATE POLICY "Authenticated upload clinic-assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'clinic-assets');

CREATE POLICY "Authenticated update clinic-assets" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'clinic-assets');

CREATE POLICY "Authenticated delete clinic-assets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'clinic-assets');
