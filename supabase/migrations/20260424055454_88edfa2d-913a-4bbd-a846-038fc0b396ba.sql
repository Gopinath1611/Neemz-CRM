-- Add hierarchy fields to custom_roles
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'clinic',
  ADD COLUMN IF NOT EXISTS sub_team text,
  ADD COLUMN IF NOT EXISTS hierarchy_level text NOT NULL DEFAULT 'member';

-- hierarchy_level values: 'board' | 'executive' | 'dept_head' | 'sub_lead' | 'member'
-- department values: 'leadership' | 'clinic' | 'marketing' | 'finance' | 'hr' | 'operations'

-- Map existing seeded roles to departments
UPDATE public.custom_roles SET department = 'leadership', hierarchy_level = 'executive' WHERE role_key = 'admin';
UPDATE public.custom_roles SET department = 'hr', hierarchy_level = 'dept_head' WHERE role_key = 'hr';
UPDATE public.custom_roles SET department = 'finance', hierarchy_level = 'dept_head' WHERE role_key = 'finance_manager';
UPDATE public.custom_roles SET department = 'marketing', hierarchy_level = 'dept_head', sub_team = 'Digital Marketing' WHERE role_key = 'digital_marketing_manager';
UPDATE public.custom_roles SET department = 'marketing', hierarchy_level = 'member', sub_team = 'Digital Marketing' WHERE role_key = 'digital_marketing_executive';
UPDATE public.custom_roles SET department = 'marketing', hierarchy_level = 'member', sub_team = 'Content' WHERE role_key = 'video_editor';
UPDATE public.custom_roles SET department = 'marketing', hierarchy_level = 'member', sub_team = 'Tele-sales' WHERE role_key = 'telecaller';
UPDATE public.custom_roles SET department = 'clinic', hierarchy_level = 'dept_head', sub_team = 'Doctors' WHERE role_key = 'duty_doctor';
UPDATE public.custom_roles SET department = 'clinic', hierarchy_level = 'member', sub_team = 'Chair-side' WHERE role_key = 'dental_assistant';
UPDATE public.custom_roles SET department = 'clinic', hierarchy_level = 'member', sub_team = 'Front Office' WHERE role_key = 'receptionist';