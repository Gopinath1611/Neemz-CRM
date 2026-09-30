ALTER TABLE public.ops_tasks 
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'top_tasks',
  ADD COLUMN IF NOT EXISTS date_start date,
  ADD COLUMN IF NOT EXISTS date_end date,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.ops_task_checklist
  ADD COLUMN IF NOT EXISTS date_end date;

CREATE INDEX IF NOT EXISTS idx_ops_tasks_category ON public.ops_tasks(category);