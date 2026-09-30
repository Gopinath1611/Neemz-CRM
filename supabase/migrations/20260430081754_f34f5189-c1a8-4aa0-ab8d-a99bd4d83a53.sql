DROP POLICY IF EXISTS "Authenticated users can view target achievement logs" ON public.employee_target_achievement_logs;
DROP POLICY IF EXISTS "Authenticated users can create target achievement logs" ON public.employee_target_achievement_logs;
DROP POLICY IF EXISTS "Authenticated users can update target achievement logs" ON public.employee_target_achievement_logs;
DROP POLICY IF EXISTS "Authenticated users can delete target achievement logs" ON public.employee_target_achievement_logs;

CREATE POLICY "Authenticated users can view target achievement logs"
ON public.employee_target_achievement_logs
FOR SELECT
TO authenticated
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create target achievement logs"
ON public.employee_target_achievement_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update target achievement logs"
ON public.employee_target_achievement_logs
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete target achievement logs"
ON public.employee_target_achievement_logs
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');