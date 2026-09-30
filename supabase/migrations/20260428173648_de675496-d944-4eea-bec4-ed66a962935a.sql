
-- Payruns table
CREATE TABLE public.payruns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  pay_period_month INTEGER NOT NULL,
  pay_period_year INTEGER NOT NULL,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  location TEXT,
  band TEXT DEFAULT 'all',
  employment_type TEXT DEFAULT 'all',
  payrun_type TEXT DEFAULT 'regular',
  status TEXT DEFAULT 'draft',
  total_employees INTEGER DEFAULT 0,
  total_ctc NUMERIC DEFAULT 0,
  total_net_pay NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  total_tax NUMERIC DEFAULT 0,
  total_benefits NUMERIC DEFAULT 0,
  total_reimbursement NUMERIC DEFAULT 0,
  proceed_date DATE,
  payment_details JSONB DEFAULT '{}'::jsonb,
  bank_name TEXT,
  bank_account TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payruns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view payruns" ON public.payruns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert payruns" ON public.payruns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update payruns" ON public.payruns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete payruns" ON public.payruns FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_payruns_updated_at BEFORE UPDATE ON public.payruns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Form 16 table
CREATE TABLE public.form_16 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  financial_year TEXT NOT NULL,
  status TEXT DEFAULT 'created',
  total_income NUMERIC DEFAULT 0,
  total_tax NUMERIC DEFAULT 0,
  generated_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, financial_year)
);

ALTER TABLE public.form_16 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view form16" ON public.form_16 FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert form16" ON public.form_16 FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update form16" ON public.form_16 FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete form16" ON public.form_16 FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_form_16_updated_at BEFORE UPDATE ON public.form_16 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bank accounts for payroll transfers
CREATE TABLE public.payroll_banks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc_code TEXT,
  branch_name TEXT,
  account_holder TEXT,
  excel_format TEXT DEFAULT 'standard',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view payroll_banks" ON public.payroll_banks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage payroll_banks" ON public.payroll_banks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_payroll_banks_updated_at BEFORE UPDATE ON public.payroll_banks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add tds, professional tax, lwf to payroll
ALTER TABLE public.payroll 
  ADD COLUMN IF NOT EXISTS payrun_id UUID,
  ADD COLUMN IF NOT EXISTS tds NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS professional_tax NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lwf NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursement NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS benefits NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctc NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payslip_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payslip_sent_at TIMESTAMPTZ;
