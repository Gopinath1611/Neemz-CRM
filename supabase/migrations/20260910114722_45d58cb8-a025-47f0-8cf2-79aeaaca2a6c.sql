CREATE TABLE public.awareness_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'post',
  title TEXT,
  caption TEXT,
  permalink TEXT,
  external_id TEXT,
  published_at DATE NOT NULL DEFAULT CURRENT_DATE,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  enquiries INTEGER NOT NULL DEFAULT 0,
  follower_gain INTEGER NOT NULL DEFAULT 0,
  boost_spend NUMERIC NOT NULL DEFAULT 0,
  data_source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX awareness_content_platform_external_id_key
  ON public.awareness_content (platform, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX awareness_content_published_at_idx ON public.awareness_content (published_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.awareness_content TO authenticated;
GRANT ALL ON public.awareness_content TO service_role;
ALTER TABLE public.awareness_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view awareness content"
  ON public.awareness_content FOR SELECT TO authenticated USING (true);
CREATE POLICY "Marketing can insert awareness content"
  ON public.awareness_content FOR INSERT TO authenticated
  WITH CHECK (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Marketing can update awareness content"
  ON public.awareness_content FOR UPDATE TO authenticated
  USING (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Marketing can delete awareness content"
  ON public.awareness_content FOR DELETE TO authenticated
  USING (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_awareness_content_updated_at
  BEFORE UPDATE ON public.awareness_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.awareness_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  followers INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  content_count INTEGER NOT NULL DEFAULT 0,
  raw JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX awareness_snapshots_platform_date_key
  ON public.awareness_snapshots (platform, snapshot_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.awareness_snapshots TO authenticated;
GRANT ALL ON public.awareness_snapshots TO service_role;
ALTER TABLE public.awareness_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view awareness snapshots"
  ON public.awareness_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Marketing can insert awareness snapshots"
  ON public.awareness_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Marketing can update awareness snapshots"
  ON public.awareness_snapshots FOR UPDATE TO authenticated
  USING (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Marketing can delete awareness snapshots"
  ON public.awareness_snapshots FOR DELETE TO authenticated
  USING (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_awareness_snapshots_updated_at
  BEFORE UPDATE ON public.awareness_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();