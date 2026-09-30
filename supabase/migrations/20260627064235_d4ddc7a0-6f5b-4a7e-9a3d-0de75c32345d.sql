
CREATE POLICY "Authenticated read deposit slips" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'deposit-slips');
CREATE POLICY "Authenticated upload deposit slips" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'deposit-slips');
CREATE POLICY "Authenticated update deposit slips" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'deposit-slips');
CREATE POLICY "Authenticated delete deposit slips" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'deposit-slips');
