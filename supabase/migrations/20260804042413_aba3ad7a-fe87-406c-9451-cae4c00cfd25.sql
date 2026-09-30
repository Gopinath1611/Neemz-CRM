CREATE POLICY "Users can upload own call recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own call recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Admins can update call recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'call-recordings' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'call-recordings' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete call recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'call-recordings' AND public.has_role(auth.uid(), 'admin'));