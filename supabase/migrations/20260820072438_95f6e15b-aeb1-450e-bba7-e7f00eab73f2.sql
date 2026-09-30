CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name text NOT NULL,
  category text,
  assigned_to uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'in_use',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view assets" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR or admin can insert assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (public.is_hr_or_admin(auth.uid()));
CREATE POLICY "HR or admin can update assets" ON public.assets FOR UPDATE TO authenticated USING (public.is_hr_or_admin(auth.uid()));
CREATE POLICY "HR or admin can delete assets" ON public.assets FOR DELETE TO authenticated USING (public.is_hr_or_admin(auth.uid()));

CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON public.assets(assigned_to);