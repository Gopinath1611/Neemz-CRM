
-- Deposits table
CREATE TABLE public.deposits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deposit_no TEXT NOT NULL UNIQUE,
  deposit_date DATE NOT NULL,
  bank_account TEXT NOT NULL,
  deposit_mode TEXT NOT NULL,
  bank_reference TEXT,
  remarks TEXT,
  deposited_by TEXT NOT NULL,
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Deposited',
  slip_path TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage deposits" ON public.deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Junction table for deposit ↔ billing invoice (one invoice → one deposit)
CREATE TABLE public.deposit_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deposit_id UUID NOT NULL REFERENCES public.deposits(id) ON DELETE CASCADE,
  billing_id UUID NOT NULL UNIQUE REFERENCES public.billings(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_invoices TO authenticated;
GRANT ALL ON public.deposit_invoices TO service_role;
ALTER TABLE public.deposit_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage deposit_invoices" ON public.deposit_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_deposit_invoices_deposit ON public.deposit_invoices(deposit_id);
CREATE INDEX idx_deposits_date ON public.deposits(deposit_date DESC);

CREATE TRIGGER trg_deposits_updated_at BEFORE UPDATE ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
