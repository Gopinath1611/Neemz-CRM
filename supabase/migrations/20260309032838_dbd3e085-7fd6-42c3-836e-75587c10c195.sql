
-- Create storage bucket for social media uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('social-media', 'social-media', true);

-- Allow anyone to upload to social-media bucket (authenticated users)
CREATE POLICY "Authenticated users can upload social media files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'social-media');

-- Allow anyone to read social media files
CREATE POLICY "Anyone can view social media files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'social-media');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete social media files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'social-media');
