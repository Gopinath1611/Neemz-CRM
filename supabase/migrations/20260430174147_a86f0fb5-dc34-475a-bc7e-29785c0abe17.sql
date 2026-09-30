
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS warranty_years integer,
  ADD COLUMN IF NOT EXISTS warranty_card_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('warranty-cards', 'warranty-cards', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read warranty cards"
ON storage.objects FOR SELECT
USING (bucket_id = 'warranty-cards');

CREATE POLICY "Anyone can upload warranty cards"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'warranty-cards');

CREATE POLICY "Anyone can update warranty cards"
ON storage.objects FOR UPDATE
USING (bucket_id = 'warranty-cards');

CREATE POLICY "Anyone can delete warranty cards"
ON storage.objects FOR DELETE
USING (bucket_id = 'warranty-cards');
