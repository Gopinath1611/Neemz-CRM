-- Holidays
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  duration TEXT NOT NULL DEFAULT 'full_day',
  type TEXT NOT NULL DEFAULT 'public',
  location TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Holidays viewable by authenticated" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage holidays" ON public.holidays FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_holidays_updated BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leave Roll Over
CREATE TABLE public.leave_rollovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  from_year INT NOT NULL,
  to_year INT NOT NULL,
  leave_type TEXT NOT NULL,
  remaining_unused NUMERIC NOT NULL DEFAULT 0,
  carry_forward NUMERIC NOT NULL DEFAULT 0,
  enhancement NUMERIC NOT NULL DEFAULT 0,
  encashment NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_rollovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rollovers viewable by authenticated" ON public.leave_rollovers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rollovers" ON public.leave_rollovers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rollovers_updated BEFORE UPDATE ON public.leave_rollovers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comp Off Requests
CREATE TABLE public.comp_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  year INT NOT NULL,
  working_date DATE NOT NULL,
  duration_type TEXT NOT NULL DEFAULT 'full_day',
  expiry_date DATE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comp_off_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CompOff viewable by authenticated" ON public.comp_off_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert compoff" ON public.comp_off_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins manage compoff" ON public.comp_off_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete compoff" ON public.comp_off_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_compoff_updated BEFORE UPDATE ON public.comp_off_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Customization Balance (per-employee LOP / leave caps)
CREATE TABLE public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  year INT NOT NULL,
  leave_type TEXT NOT NULL,
  allocated NUMERIC NOT NULL DEFAULT 0,
  used NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, leave_type)
);
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Balances viewable by authenticated" ON public.leave_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage balances" ON public.leave_balances FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_balances_updated BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add reporting_person + leave_type expansion to existing leave_requests
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reporting_person TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS year INT;