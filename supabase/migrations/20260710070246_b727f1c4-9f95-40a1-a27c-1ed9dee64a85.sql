CREATE POLICY "Authenticated can read clinical photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'clinical-photos');
CREATE POLICY "Authenticated can upload clinical photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'clinical-photos');
CREATE POLICY "Authenticated can update clinical photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'clinical-photos');
CREATE POLICY "Authenticated can delete clinical photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'clinical-photos');