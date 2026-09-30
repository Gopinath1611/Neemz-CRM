CREATE OR REPLACE FUNCTION public.has_module_perm(_user_id uuid, _path text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = _user_id
       AND uma.module_path = _path
       AND uma.has_access = true
       AND CASE lower(_action)
             WHEN 'read'   THEN COALESCE(uma.can_read, uma.has_access)
             WHEN 'create' THEN COALESCE(uma.can_create, false)
             WHEN 'edit'   THEN COALESCE(uma.can_edit, false)
             WHEN 'delete' THEN COALESCE(uma.can_delete, false)
             ELSE false
           END
  )
$$;

DROP POLICY IF EXISTS "Admins can insert adjustments" ON public.receivable_adjustments;

CREATE POLICY "Permitted users can insert adjustments"
ON public.receivable_adjustments
FOR INSERT
TO authenticated
WITH CHECK (
  adjusted_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), '/finance#receivables', 'create')
  )
);