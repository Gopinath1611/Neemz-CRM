CREATE OR REPLACE FUNCTION public.can_register_patient(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'duty_doctor'::app_role, 'dental_assistant'::app_role,
                   'receptionist'::app_role, 'dre'::app_role, 'telecaller'::app_role)
  )
$$;

DROP POLICY IF EXISTS "Clinical staff can add patients" ON public.patients;

CREATE POLICY "Booking staff can add patients"
ON public.patients FOR INSERT TO authenticated
WITH CHECK (public.can_register_patient(auth.uid()));