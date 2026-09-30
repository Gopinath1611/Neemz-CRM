CREATE TABLE public.cash_drawer_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drawer_date date NOT NULL UNIQUE,
  opening_denominations jsonb NOT NULL DEFAULT '{}'::jsonb,
  opening_total numeric NOT NULL DEFAULT 0,
  opened_by uuid REFERENCES auth.users(id),
  opened_by_name text,
  opening_time timestamp with time zone,
  closing_denominations jsonb,
  closing_total numeric,
  closed_by uuid REFERENCES auth.users(id),
  closed_by_name text,
  closing_time timestamp with time zone,
  cash_received numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_drawer_days TO authenticated;
GRANT ALL ON public.cash_drawer_days TO service_role;

ALTER TABLE public.cash_drawer_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cash drawer days" ON public.cash_drawer_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create cash drawer days" ON public.cash_drawer_days FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update cash drawer days" ON public.cash_drawer_days FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete cash drawer days" ON public.cash_drawer_days FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance_manager'));

CREATE TABLE public.cash_drawer_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drawer_day_id uuid NOT NULL REFERENCES public.cash_drawer_days(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  approved_by_name text,
  entered_by uuid REFERENCES auth.users(id),
  entered_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_drawer_expenses TO authenticated;
GRANT ALL ON public.cash_drawer_expenses TO service_role;

ALTER TABLE public.cash_drawer_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cash drawer expenses" ON public.cash_drawer_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create cash drawer expenses" ON public.cash_drawer_expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update cash drawer expenses" ON public.cash_drawer_expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete cash drawer expenses" ON public.cash_drawer_expenses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance_manager'));

CREATE INDEX idx_cash_drawer_expenses_day ON public.cash_drawer_expenses(drawer_day_id);
CREATE INDEX idx_cash_drawer_expenses_date ON public.cash_drawer_expenses(expense_date);

CREATE TRIGGER update_cash_drawer_days_updated_at BEFORE UPDATE ON public.cash_drawer_days FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cash_drawer_expenses_updated_at BEFORE UPDATE ON public.cash_drawer_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();