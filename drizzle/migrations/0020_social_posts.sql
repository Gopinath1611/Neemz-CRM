CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  caption text NOT NULL DEFAULT '',
  hashtags text,
  link_url text,
  post_type text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  platforms text[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','publishing','published','partial','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or marketing admin" ON public.social_posts FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_marketing_admin(auth.uid()));
CREATE POLICY "insert own" ON public.social_posts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "update own draft or marketing admin" ON public.social_posts FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_marketing_admin(auth.uid()));
CREATE POLICY "delete own or marketing admin" ON public.social_posts FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_marketing_admin(auth.uid()));
CREATE TRIGGER trg_social_posts_updated BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.social_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  external_post_id text,
  permalink text,
  error_code text,
  error_message text,
  attempted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, platform)
);
GRANT SELECT ON public.social_post_targets TO authenticated;
GRANT ALL ON public.social_post_targets TO service_role;
ALTER TABLE public.social_post_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read targets of visible posts" ON public.social_post_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id
    AND (p.created_by = auth.uid() OR public.is_marketing_admin(auth.uid()))));