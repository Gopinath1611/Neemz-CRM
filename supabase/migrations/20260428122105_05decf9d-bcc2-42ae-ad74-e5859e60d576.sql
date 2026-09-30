ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS consultant_fee numeric NOT NULL DEFAULT 0;

INSERT INTO public.expense_categories (name, value, is_active)
SELECT 'Consultant Fees', 'consultant_fees', true
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE value = 'consultant_fees');