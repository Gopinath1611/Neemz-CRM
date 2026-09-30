
-- Employee shifts table
CREATE TABLE public.employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_name TEXT NOT NULL DEFAULT 'General',
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  weekly_off_days INTEGER[] NOT NULL DEFAULT ARRAY[0], -- 0=Sun..6=Sat
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view shifts"
  ON public.employee_shifts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage shifts"
  ON public.employee_shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_employee_shifts_updated_at
  BEFORE UPDATE ON public.employee_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Geofence zones table
CREATE TABLE public.geofence_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  place_address TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 200,
  applicable_departments TEXT[] DEFAULT ARRAY[]::TEXT[],
  applicable_locations TEXT[] DEFAULT ARRAY[]::TEXT[],
  applicable_employees UUID[] DEFAULT ARRAY[]::UUID[],
  applicable_marital_status TEXT[] DEFAULT ARRAY[]::TEXT[],
  excluded_employees UUID[] DEFAULT ARRAY[]::UUID[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view geofences"
  ON public.geofence_zones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage geofences"
  ON public.geofence_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_geofence_zones_updated_at
  BEFORE UPDATE ON public.geofence_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_employee_shifts_emp ON public.employee_shifts(employee_id);
CREATE INDEX idx_geofence_zones_active ON public.geofence_zones(is_active);
