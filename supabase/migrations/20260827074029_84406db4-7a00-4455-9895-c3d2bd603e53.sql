ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS duration_type text NOT NULL DEFAULT 'full_day';

UPDATE public.leave_requests
   SET duration_type = 'half_day'
 WHERE COALESCE(days, 0) = 0.5;

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_dates
  ON public.leave_requests (employee_id, start_date, end_date);