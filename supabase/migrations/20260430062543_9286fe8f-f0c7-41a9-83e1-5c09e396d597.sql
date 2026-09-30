
-- Allow authenticated users to view profiles (needed for Operations dashboards employee dropdowns)
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to view all user_roles (needed for staff role mapping in Operations)
CREATE POLICY "Authenticated users can view user_roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (true);
