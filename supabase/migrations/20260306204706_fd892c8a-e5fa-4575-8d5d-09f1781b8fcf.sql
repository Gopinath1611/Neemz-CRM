
-- Employee targets table for KPIs, goals, daily/weekly/monthly/quarterly/yearly targets
CREATE TABLE public.employee_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department TEXT NOT NULL DEFAULT 'general',
  role TEXT NOT NULL DEFAULT 'staff',
  target_type TEXT NOT NULL DEFAULT 'daily', -- daily, weekly, monthly, quarterly, yearly
  metric_name TEXT NOT NULL, -- e.g. "Patients Seen", "Calls Made", "Posts Created", "Revenue Generated"
  target_value NUMERIC NOT NULL DEFAULT 0,
  achieved_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'count', -- count, currency, percentage
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  period_end DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, achieved, missed, exceeded
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Incentive plans
CREATE TABLE public.incentive_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'general',
  metric_name TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL DEFAULT 0,
  incentive_type TEXT NOT NULL DEFAULT 'fixed', -- fixed, percentage
  incentive_amount NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, yearly
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Performance logs for daily tracking
CREATE TABLE public.performance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.employee_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incentive_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to employee_targets" ON public.employee_targets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to incentive_plans" ON public.incentive_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to performance_logs" ON public.performance_logs FOR ALL USING (true) WITH CHECK (true);
