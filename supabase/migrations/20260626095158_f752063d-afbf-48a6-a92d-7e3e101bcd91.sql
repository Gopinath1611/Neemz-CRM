
CREATE POLICY "Authenticated can read purchase invoices"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'purchase-invoices');

CREATE POLICY "Authenticated can upload purchase invoices"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'purchase-invoices');

CREATE POLICY "Authenticated can update purchase invoices"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'purchase-invoices');

CREATE POLICY "Authenticated can delete purchase invoices"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'purchase-invoices');
