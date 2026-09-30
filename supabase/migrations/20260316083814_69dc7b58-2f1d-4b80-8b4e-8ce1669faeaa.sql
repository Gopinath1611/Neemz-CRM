
-- Create districts table for managed dropdown list
CREATE TABLE public.districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to districts" ON public.districts
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Add location and district columns to patients table
ALTER TABLE public.patients 
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS district text;

-- Seed some common Tamil Nadu districts
INSERT INTO public.districts (name) VALUES
  ('Chennai'),
  ('Coimbatore'),
  ('Madurai'),
  ('Tiruchirappalli'),
  ('Salem'),
  ('Tirunelveli'),
  ('Erode'),
  ('Vellore'),
  ('Thoothukudi'),
  ('Thanjavur'),
  ('Dindigul'),
  ('Kanchipuram'),
  ('Tiruvannamalai'),
  ('Villupuram'),
  ('Cuddalore'),
  ('Nagapattinam'),
  ('Krishnagiri'),
  ('Dharmapuri'),
  ('Namakkal'),
  ('Karur');
