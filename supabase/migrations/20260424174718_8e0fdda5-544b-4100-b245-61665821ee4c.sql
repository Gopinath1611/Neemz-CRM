CREATE TABLE IF NOT EXISTS public.role_target_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.department_roles(id) ON DELETE CASCADE,
  kind_label text NOT NULL,
  base_kind text NOT NULL DEFAULT 'kpi',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, kind_label)
);

ALTER TABLE public.role_target_kinds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view role_target_kinds" ON public.role_target_kinds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert role_target_kinds" ON public.role_target_kinds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update role_target_kinds" ON public.role_target_kinds FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete role_target_kinds" ON public.role_target_kinds FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_role_target_kinds_updated_at
  BEFORE UPDATE ON public.role_target_kinds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();