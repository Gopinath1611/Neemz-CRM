
CREATE TABLE public.ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  department text,
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  created_by uuid,
  assigned_to uuid,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ops_task_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.ops_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_tasks_assigned ON public.ops_tasks(assigned_to);
CREATE INDEX idx_ops_tasks_created_by ON public.ops_tasks(created_by);
CREATE INDEX idx_ops_tasks_due_date ON public.ops_tasks(due_date);
CREATE INDEX idx_ops_task_checklist_task ON public.ops_task_checklist(task_id);
CREATE INDEX idx_ops_task_checklist_due ON public.ops_task_checklist(due_date);

ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_task_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own or assigned tasks" ON public.ops_tasks
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = assigned_to);

CREATE POLICY "Users create their own tasks" ON public.ops_tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users update own or assigned tasks" ON public.ops_tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = assigned_to);

CREATE POLICY "Users delete their own tasks" ON public.ops_tasks
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users view checklist of accessible tasks" ON public.ops_task_checklist
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ops_tasks t WHERE t.id = task_id AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())));

CREATE POLICY "Users manage checklist of accessible tasks" ON public.ops_task_checklist
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ops_tasks t WHERE t.id = task_id AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ops_tasks t WHERE t.id = task_id AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())));

CREATE TRIGGER set_ops_tasks_updated_at
  BEFORE UPDATE ON public.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
