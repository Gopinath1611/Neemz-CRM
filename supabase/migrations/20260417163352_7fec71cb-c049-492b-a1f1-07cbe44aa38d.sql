-- Drop ALL existing policies on these tables to reset cleanly
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_tasks' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ops_tasks', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_task_checklist' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ops_task_checklist', pol.policyname);
  END LOOP;
END $$;

-- ops_tasks policies
CREATE POLICY "Admins manage all tasks"
  ON public.ops_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own or assigned tasks"
  ON public.ops_tasks FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "Users insert their own tasks"
  ON public.ops_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update own or assigned tasks"
  ON public.ops_tasks FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR assigned_to = auth.uid())
  WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "Users delete own tasks"
  ON public.ops_tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ops_task_checklist policies
CREATE POLICY "Admins manage all checklist"
  ON public.ops_task_checklist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view checklist of accessible tasks"
  ON public.ops_task_checklist FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ops_tasks t
    WHERE t.id = ops_task_checklist.task_id
      AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
  ));

CREATE POLICY "Users manage checklist of accessible tasks"
  ON public.ops_task_checklist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ops_tasks t
    WHERE t.id = ops_task_checklist.task_id
      AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ops_tasks t
    WHERE t.id = ops_task_checklist.task_id
      AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
  ));