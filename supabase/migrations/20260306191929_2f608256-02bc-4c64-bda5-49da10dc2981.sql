
CREATE TABLE public.lab_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  checkin_id UUID REFERENCES public.patient_checkins(id),
  lab_name TEXT NOT NULL,
  lab_phone TEXT,
  work_type TEXT NOT NULL DEFAULT 'crown',
  material TEXT,
  shade TEXT,
  tooth_number INTEGER,
  description TEXT,
  rate NUMERIC DEFAULT 0,
  sent_date DATE DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'sent',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to lab_orders" ON public.lab_orders
  FOR ALL USING (true) WITH CHECK (true);
