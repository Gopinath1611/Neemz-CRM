-- 1) Link on employee insert/update by email
CREATE OR REPLACE FUNCTION public.link_employee_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL AND NEW.email <> '' THEN
    SELECT u.id INTO NEW.user_id
      FROM auth.users u
     WHERE lower(u.email) = lower(trim(NEW.email))
       AND NOT EXISTS (
         SELECT 1 FROM public.employees e2
          WHERE e2.user_id = u.id AND e2.id <> NEW.id
       )
     ORDER BY u.created_at
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_employee_to_auth_user ON public.employees;
CREATE TRIGGER trg_link_employee_to_auth_user
BEFORE INSERT OR UPDATE OF email, user_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.link_employee_to_auth_user();

-- 2) Link on new auth user creation (extends existing profile creation)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.employees e
       SET user_id = NEW.id, updated_at = now()
     WHERE e.user_id IS NULL
       AND lower(trim(e.email)) = lower(trim(NEW.email))
       AND NOT EXISTS (
         SELECT 1 FROM public.employees e2 WHERE e2.user_id = NEW.id
       );
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Backfill existing unlinked employees
WITH candidates AS (
  SELECT DISTINCT ON (u.id) e.id AS emp_id, u.id AS uid
    FROM public.employees e
    JOIN auth.users u ON lower(trim(e.email)) = lower(u.email)
   WHERE e.user_id IS NULL
     AND e.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = u.id)
   ORDER BY u.id, (e.status = 'active') DESC, e.created_at
)
UPDATE public.employees e
   SET user_id = c.uid, updated_at = now()
  FROM candidates c
 WHERE e.id = c.emp_id;