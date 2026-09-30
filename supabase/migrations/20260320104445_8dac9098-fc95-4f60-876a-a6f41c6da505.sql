
CREATE TABLE public.expense_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  value text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to expense_categories" ON public.expense_categories FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.expense_categories (name, value, is_default) VALUES
  ('Rent', 'rent', true),
  ('Electricity', 'electricity', true),
  ('Water', 'water', true),
  ('Salary / Wages', 'salary', true),
  ('Lab Charges', 'lab_charges', true),
  ('Maintenance / Repair', 'maintenance', true),
  ('Cleaning / Housekeeping', 'cleaning', true),
  ('Internet / Phone', 'internet', true),
  ('Insurance', 'insurance', true),
  ('Marketing / Ads', 'marketing', true),
  ('Travel / Transport', 'travel', true),
  ('Food / Tea / Snacks', 'food', true),
  ('Stationery / Printing', 'stationery', true),
  ('Software / Subscriptions', 'software', true),
  ('Tax / Compliance', 'tax', true),
  ('Miscellaneous', 'miscellaneous', true),
  ('General', 'general', true),
  ('Consultant Doctor', 'consultant_doctor', true);
