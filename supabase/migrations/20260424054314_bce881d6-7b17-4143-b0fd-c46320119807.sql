
-- Create custom_roles table to manage user-defined roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_key TEXT NOT NULL UNIQUE,
  display_label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view active roles (needed for dropdowns)
CREATE POLICY "Authenticated users can view custom roles"
ON public.custom_roles
FOR SELECT
TO authenticated
USING (true);

-- Only admins can insert/update/delete custom roles
CREATE POLICY "Admins can insert custom roles"
ON public.custom_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update custom roles"
ON public.custom_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete custom roles"
ON public.custom_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND is_system = false);

-- Trigger for updated_at
CREATE TRIGGER update_custom_roles_updated_at
BEFORE UPDATE ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed system roles (the existing built-in roles)
INSERT INTO public.custom_roles (role_key, display_label, description, is_system, sort_order) VALUES
  ('admin', 'Admin', 'Full system access', true, 1),
  ('hr', 'HR', 'Human Resources management', true, 2),
  ('finance_manager', 'Finance Manager', 'Financial operations and reports', true, 3),
  ('digital_marketing_manager', 'DM Manager', 'Digital marketing leadership', true, 4),
  ('digital_marketing_executive', 'DM Executive', 'Digital marketing execution', true, 5),
  ('video_editor', 'Video Editor', 'Content editing and production', true, 6),
  ('telecaller', 'Telecaller', 'Telephone outreach', true, 7),
  ('duty_doctor', 'Duty Doctor', 'Clinical duty doctor', true, 8),
  ('dental_assistant', 'Dental Assistant', 'Chair-side assistance', true, 9),
  ('receptionist', 'Receptionist', 'Front desk operations', true, 10)
ON CONFLICT (role_key) DO NOTHING;
