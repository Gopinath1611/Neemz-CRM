DROP POLICY IF EXISTS "Users can view own connections" ON public.connected_apps;
DROP POLICY IF EXISTS "Users can insert own connections" ON public.connected_apps;
DROP POLICY IF EXISTS "Users can update own connections" ON public.connected_apps;
DROP POLICY IF EXISTS "Users can delete own connections" ON public.connected_apps;

CREATE POLICY "Authenticated can view all connections"
  ON public.connected_apps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage connections insert"
  ON public.connected_apps FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage connections update"
  ON public.connected_apps FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage connections delete"
  ON public.connected_apps FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));