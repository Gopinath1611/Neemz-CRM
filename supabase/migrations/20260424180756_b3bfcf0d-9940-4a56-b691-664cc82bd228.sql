CREATE TABLE IF NOT EXISTS public.role_target_kind_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.department_roles(id) ON DELETE CASCADE,
  base_kind text NOT NULL,
  kind_label text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, base_kind)
);

ALTER TABLE public.role_target_kind_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view role_target_kind_overrides"
ON public.role_target_kind_overrides
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert role_target_kind_overrides"
ON public.role_target_kind_overrides
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update role_target_kind_overrides"
ON public.role_target_kind_overrides
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated can delete role_target_kind_overrides"
ON public.role_target_kind_overrides
FOR DELETE
TO authenticated
USING (true);

CREATE TRIGGER update_role_target_kind_overrides_updated_at
BEFORE UPDATE ON public.role_target_kind_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();