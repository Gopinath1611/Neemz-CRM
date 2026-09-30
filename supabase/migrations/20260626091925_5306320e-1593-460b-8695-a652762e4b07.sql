
-- 1) Columns
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_number text,
  ADD COLUMN IF NOT EXISTS receipt_url text;

-- 2) Sequence for race-safe numbering
CREATE SEQUENCE IF NOT EXISTS public.expense_number_seq START 1;

-- 3) Backfill existing rows (ordered by created_at) using the sequence
DO $$
DECLARE
  r record;
  n int;
BEGIN
  FOR r IN SELECT id FROM public.expenses WHERE expense_number IS NULL ORDER BY created_at ASC LOOP
    n := nextval('public.expense_number_seq');
    UPDATE public.expenses SET expense_number = 'EXP-' || LPAD(n::text, 5, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Unique index
CREATE UNIQUE INDEX IF NOT EXISTS expenses_expense_number_key ON public.expenses(expense_number);

-- 5) Trigger function
CREATE OR REPLACE FUNCTION public.generate_expense_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num int;
BEGIN
  IF NEW.expense_number IS NULL OR NEW.expense_number = '' THEN
    next_num := nextval('public.expense_number_seq');
    NEW.expense_number := 'EXP-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_expense_number ON public.expenses;
CREATE TRIGGER trg_generate_expense_number
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.generate_expense_number();

-- 6) Storage policies for the expense-receipts bucket (bucket created via storage tool)
CREATE POLICY "Authenticated can view expense receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated can upload expense receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated can update expense receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated can delete expense receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts');
