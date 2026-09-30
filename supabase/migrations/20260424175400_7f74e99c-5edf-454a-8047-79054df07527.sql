CREATE TABLE IF NOT EXISTS public.role_hidden_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.department_roles(id) ON DELETE CASCADE,
  preset_name text NOT NULL,
  preset_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, preset_name, preset_kind)
);

ALTER TABLE public.role_hidden_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view role_hidden_presets" ON public.role_hidden_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert role_hidden_presets" ON public.role_hidden_presets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete role_hidden_presets" ON public.role_hidden_presets FOR DELETE TO authenticated USING (true);