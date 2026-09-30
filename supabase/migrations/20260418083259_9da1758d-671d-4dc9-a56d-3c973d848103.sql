
-- Departments table
CREATE TABLE public.jd_departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles table (belongs to a department)
CREATE TABLE public.jd_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.jd_departments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  job_description TEXT,
  kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsibilities TEXT,
  requirements TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jd_roles_department ON public.jd_roles(department_id);

ALTER TABLE public.jd_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jd_roles ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can manage (consistent with other HRMS tables)
CREATE POLICY "Authenticated users can view jd_departments"
ON public.jd_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage jd_departments"
ON public.jd_departments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view jd_roles"
ON public.jd_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage jd_roles"
ON public.jd_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at triggers
CREATE TRIGGER trg_jd_departments_updated
BEFORE UPDATE ON public.jd_departments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_jd_roles_updated
BEFORE UPDATE ON public.jd_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default departments
INSERT INTO public.jd_departments (name, description, sort_order) VALUES
  ('Clinic', 'Doctors, dental assistants, clinical staff', 1),
  ('HRMS', 'Human Resources, Payroll, Recruitment', 2),
  ('Sales & Marketing', 'Lead generation, campaigns, social media', 3),
  ('Finance', 'Accounts, billing, expenses', 4),
  ('Operations', 'Front desk, coordination, support', 5);
