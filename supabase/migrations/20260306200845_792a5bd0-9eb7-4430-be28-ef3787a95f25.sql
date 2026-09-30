
-- Employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  gender text DEFAULT 'male',
  address text,
  department text DEFAULT 'general',
  designation text DEFAULT 'staff',
  employment_type text DEFAULT 'full_time',
  join_date date NOT NULL DEFAULT CURRENT_DATE,
  exit_date date,
  status text NOT NULL DEFAULT 'active',
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  pan_number text,
  aadhar_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  base_salary numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Attendance logs
CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  check_in time,
  check_out time,
  status text NOT NULL DEFAULT 'present',
  hours_worked numeric,
  overtime_hours numeric DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Leave requests
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  leave_type text NOT NULL DEFAULT 'casual',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL DEFAULT 1,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Payroll records (monthly)
CREATE TABLE public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  working_days integer DEFAULT 0,
  present_days integer DEFAULT 0,
  leave_days integer DEFAULT 0,
  base_salary numeric DEFAULT 0,
  hra numeric DEFAULT 0,
  da numeric DEFAULT 0,
  other_allowances numeric DEFAULT 0,
  gross_salary numeric DEFAULT 0,
  pf_deduction numeric DEFAULT 0,
  esi_deduction numeric DEFAULT 0,
  tax_deduction numeric DEFAULT 0,
  other_deductions numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  net_salary numeric DEFAULT 0,
  payment_status text DEFAULT 'pending',
  payment_date date,
  payment_method text DEFAULT 'bank_transfer',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

-- Onboarding checklist
CREATE TABLE public.onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  task_name text NOT NULL,
  category text DEFAULT 'documents',
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to attendance_logs" ON public.attendance_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to leave_requests" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to payroll" ON public.payroll FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to onboarding_tasks" ON public.onboarding_tasks FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger for employees
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
