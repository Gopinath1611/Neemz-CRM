
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS header_media_url text;

INSERT INTO public.whatsapp_templates (name, status, category, language, header_media_url)
VALUES (
  'drneemz_welcome', 'APPROVED', 'MARKETING', 'en',
  'https://kumtrpubuupvwgbwsqix.supabase.co/storage/v1/object/public/clinic-assets/whatsapp/drneemz-welcome.jpg'
)
ON CONFLICT (name) DO UPDATE SET
  header_media_url = EXCLUDED.header_media_url,
  status = COALESCE(public.whatsapp_templates.status, EXCLUDED.status),
  category = COALESCE(public.whatsapp_templates.category, EXCLUDED.category),
  language = COALESCE(public.whatsapp_templates.language, EXCLUDED.language);
