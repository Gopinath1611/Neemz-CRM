-- Department Roles master
CREATE TABLE IF NOT EXISTS public.department_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  role_name text NOT NULL,
  display_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(department, role_name)
);

ALTER TABLE public.department_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to department_roles"
  ON public.department_roles FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_department_roles_updated_at
  BEFORE UPDATE ON public.department_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Role Metrics (KPIs per role)
CREATE TABLE IF NOT EXISTS public.role_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.department_roles(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  unit text NOT NULL DEFAULT 'count',
  default_target numeric NOT NULL DEFAULT 0,
  points_per_unit numeric NOT NULL DEFAULT 1,
  weight numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.role_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to role_metrics"
  ON public.role_metrics FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_role_metrics_updated_at
  BEFORE UPDATE ON public.role_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Performance points (manual bonus/penalty + auto cache)
CREATE TABLE IF NOT EXISTS public.performance_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  period_date date NOT NULL DEFAULT CURRENT_DATE,
  metric_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to performance_points"
  ON public.performance_points FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_perf_points_emp_date ON public.performance_points(employee_id, period_date);

-- Seed default roles
INSERT INTO public.department_roles (department, role_name, display_label, sort_order) VALUES
  ('clinic', 'doctor', 'Doctor', 1),
  ('clinic', 'dental_assistant', 'Dental Assistant', 2),
  ('clinic', 'receptionist', 'Receptionist', 3),
  ('clinic', 'housekeeping', 'Housekeeping', 4),
  ('sales_marketing', 'digital_marketing_manager', 'Digital Marketing Manager', 1),
  ('sales_marketing', 'digital_marketing_executive', 'Digital Marketing Executive', 2),
  ('sales_marketing', 'video_editor', 'Video Editor', 3),
  ('sales_marketing', 'telecaller', 'Telecaller', 4),
  ('finance', 'account_manager', 'Account Manager', 1),
  ('finance', 'accountant', 'Accountant', 2),
  ('hr', 'hr_manager', 'HR Manager', 1),
  ('hr', 'hr_executive', 'HR Executive', 2)
ON CONFLICT (department, role_name) DO NOTHING;

-- Seed default metrics for each role
INSERT INTO public.role_metrics (role_id, metric_name, unit, default_target, points_per_unit, weight)
SELECT id, m.metric_name, m.unit, m.default_target, m.points_per_unit, m.weight
FROM public.department_roles r
CROSS JOIN LATERAL (
  VALUES
    -- Doctor
    ('doctor', 'Patients Seen', 'count', 100, 5, 1),
    ('doctor', 'Treatments Completed', 'count', 80, 8, 1.2),
    ('doctor', 'Revenue Generated', 'inr', 200000, 0.001, 1.5),
    ('doctor', 'Patient Satisfaction', '%', 90, 2, 1),
    -- Dental Assistant
    ('dental_assistant', 'Chair Setups', 'count', 100, 3, 1),
    ('dental_assistant', 'Sterilization Cycles', 'count', 60, 4, 1),
    ('dental_assistant', 'Patient Comfort Score', '%', 90, 2, 1),
    -- Receptionist
    ('receptionist', 'Appointments Booked', 'count', 200, 3, 1),
    ('receptionist', 'Calls Handled', 'count', 300, 1, 1),
    ('receptionist', 'Walk-ins Converted', 'count', 30, 10, 1.2),
    -- Housekeeping
    ('housekeeping', 'Cleaning Cycles', 'count', 60, 2, 1),
    ('housekeeping', 'Hygiene Audit Score', '%', 95, 3, 1),
    -- Digital Marketing Manager
    ('digital_marketing_manager', 'Campaigns Launched', 'count', 8, 25, 1.2),
    ('digital_marketing_manager', 'Leads Generated', 'count', 200, 5, 1.5),
    ('digital_marketing_manager', 'ROI %', '%', 150, 2, 1.5),
    -- Digital Marketing Executive
    ('digital_marketing_executive', 'Posts Published', 'count', 30, 5, 1),
    ('digital_marketing_executive', 'Engagement Rate', '%', 5, 10, 1),
    ('digital_marketing_executive', 'Ad Performance Score', '%', 80, 3, 1),
    -- Video Editor
    ('video_editor', 'Videos Edited', 'count', 20, 15, 1),
    ('video_editor', 'Reels Created', 'count', 30, 10, 1),
    ('video_editor', 'Views Generated', 'count', 50000, 0.005, 1),
    -- Telecaller
    ('telecaller', 'Calls Made', 'count', 500, 1, 1),
    ('telecaller', 'Leads Qualified', 'count', 80, 5, 1.2),
    ('telecaller', 'Appointments Booked', 'count', 50, 8, 1.5),
    -- Account Manager
    ('account_manager', 'Reports Generated', 'count', 20, 10, 1),
    ('account_manager', 'Audits Completed', 'count', 4, 50, 1.2),
    ('account_manager', 'Vendor Payments', 'count', 50, 3, 1),
    -- Accountant
    ('accountant', 'Bills Processed', 'count', 200, 2, 1),
    ('accountant', 'Collections Done', 'inr', 500000, 0.0005, 1.2),
    ('accountant', 'Reconciliations', 'count', 30, 5, 1),
    -- HR Manager
    ('hr_manager', 'Hires Completed', 'count', 4, 50, 1.2),
    ('hr_manager', 'Policy Updates', 'count', 2, 25, 1),
    ('hr_manager', 'Employee Satisfaction', '%', 85, 3, 1),
    -- HR Executive
    ('hr_executive', 'Attendance Compliance', '%', 95, 2, 1),
    ('hr_executive', 'Onboarding Completed', 'count', 3, 30, 1),
    ('hr_executive', 'Payroll Processed', 'count', 1, 100, 1.2),
    ('hr_executive', 'Leave Requests Handled', 'count', 30, 3, 1)
) AS m(role_name, metric_name, unit, default_target, points_per_unit, weight)
WHERE r.role_name = m.role_name
ON CONFLICT DO NOTHING;