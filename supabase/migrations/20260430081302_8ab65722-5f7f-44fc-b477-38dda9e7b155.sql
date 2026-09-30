CREATE TABLE IF NOT EXISTS public.employee_target_achievement_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id UUID NOT NULL REFERENCES public.employee_targets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  achieved_date DATE NOT NULL,
  achieved_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT employee_target_achievement_logs_unique UNIQUE (target_id, achieved_date)
);

ALTER TABLE public.employee_target_achievement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view target achievement logs"
ON public.employee_target_achievement_logs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create target achievement logs"
ON public.employee_target_achievement_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update target achievement logs"
ON public.employee_target_achievement_logs
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete target achievement logs"
ON public.employee_target_achievement_logs
FOR DELETE
TO authenticated
USING (true);

CREATE TRIGGER update_employee_target_achievement_logs_updated_at
BEFORE UPDATE ON public.employee_target_achievement_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.employee_target_achievement_logs (
  target_id,
  employee_id,
  metric_name,
  achieved_date,
  achieved_value
)
SELECT
  et.id,
  et.employee_id,
  et.metric_name,
  gs::date AS achieved_date,
  ROUND((COALESCE(et.manual_achieved, 0) / GREATEST((et.period_end - et.period_start + 1), 1))::numeric, 2) AS achieved_value
FROM public.employee_targets et
CROSS JOIN generate_series(et.period_start, et.period_end, interval '1 day') AS gs
WHERE et.manual_override = true
  AND COALESCE(et.manual_achieved, 0) <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.employee_target_achievement_logs logs
    WHERE logs.target_id = et.id
  );