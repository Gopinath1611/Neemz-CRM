CREATE TABLE public.marketing_ad_spend (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  campaign_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ad_spend TO authenticated;
GRANT ALL ON public.marketing_ad_spend TO service_role;

ALTER TABLE public.marketing_ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view ad spend"
ON public.marketing_ad_spend FOR SELECT TO authenticated USING (true);

CREATE POLICY "Marketing can insert ad spend"
ON public.marketing_ad_spend FOR INSERT TO authenticated
WITH CHECK (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Marketing can update ad spend"
ON public.marketing_ad_spend FOR UPDATE TO authenticated
USING (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Marketing can delete ad spend"
ON public.marketing_ad_spend FOR DELETE TO authenticated
USING (public.is_marketing_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX marketing_ad_spend_period_idx ON public.marketing_ad_spend (period_start, period_end);

CREATE TRIGGER update_marketing_ad_spend_updated_at
BEFORE UPDATE ON public.marketing_ad_spend
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();