ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS lab_expense_paid_date date;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS payment_paid_date date;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_amount_paid_nonnegative;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_amount_paid_nonnegative CHECK (amount_paid >= 0);
UPDATE public.purchases SET amount_paid = total_amount WHERE payment_status = 'paid' AND coalesce(amount_paid, 0) = 0;
COMMENT ON COLUMN public.lab_orders.lab_expense_paid_date IS 'Date the lab expense was (last) paid';