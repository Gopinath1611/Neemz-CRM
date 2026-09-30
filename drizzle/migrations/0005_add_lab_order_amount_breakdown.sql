ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS price_of_material numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lab_expense numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patient_bill numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lab_expense_paid_amount numeric NOT NULL DEFAULT 0;

UPDATE public.lab_orders
SET price_of_material = COALESCE(rate, 0),
    patient_bill = COALESCE(rate, 0);

ALTER TABLE public.lab_orders
  ADD CONSTRAINT lab_orders_price_of_material_nonnegative CHECK (price_of_material >= 0),
  ADD CONSTRAINT lab_orders_lab_expense_nonnegative CHECK (lab_expense >= 0),
  ADD CONSTRAINT lab_orders_patient_bill_nonnegative CHECK (patient_bill >= 0),
  ADD CONSTRAINT lab_orders_lab_expense_paid_amount_nonnegative CHECK (lab_expense_paid_amount >= 0);