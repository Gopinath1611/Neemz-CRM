
CREATE TABLE public.billing_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_id uuid NOT NULL REFERENCES public.billings(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  payment_date timestamptz NOT NULL DEFAULT now(),
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_payments TO authenticated;
GRANT ALL ON public.billing_payments TO service_role;

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access to billing_payments"
  ON public.billing_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_billing_payments_billing_id ON public.billing_payments(billing_id);
CREATE INDEX idx_billing_payments_patient_id ON public.billing_payments(patient_id);
CREATE INDEX idx_billing_payments_payment_date ON public.billing_payments(payment_date DESC);

CREATE TRIGGER update_billing_payments_updated_at
  BEFORE UPDATE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing paid/partial billings as a single historic payment row
INSERT INTO public.billing_payments (billing_id, patient_id, payment_date, amount, payment_method, notes)
SELECT id, patient_id, created_at, COALESCE(amount_paid, 0), payment_method, 'Migrated from billing record'
FROM public.billings
WHERE COALESCE(amount_paid, 0) > 0;
