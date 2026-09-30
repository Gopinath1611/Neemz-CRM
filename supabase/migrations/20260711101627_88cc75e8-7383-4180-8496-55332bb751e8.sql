
CREATE POLICY "Authenticated staff can upload patient documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'patient-documents');

CREATE POLICY "Authenticated staff can read patient documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'patient-documents');

CREATE POLICY "Authenticated staff can update patient documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'patient-documents');

CREATE POLICY "Authenticated staff can delete patient documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'patient-documents');
