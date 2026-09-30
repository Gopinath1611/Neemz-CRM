DROP INDEX IF EXISTS public.awareness_content_platform_external_id_key;
CREATE UNIQUE INDEX awareness_content_platform_external_id_key
  ON public.awareness_content (platform, external_id);