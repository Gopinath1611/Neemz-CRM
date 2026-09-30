
-- Patient Check-ins
CREATE TABLE public.patient_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  checkin_time timestamp with time zone NOT NULL DEFAULT now(),
  checkout_time timestamp with time zone,
  status text NOT NULL DEFAULT 'checked_in',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Patient Vitals
CREATE TABLE public.patient_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE CASCADE NOT NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  pulse_rate integer,
  temperature numeric,
  weight numeric,
  height numeric,
  spo2 integer,
  blood_sugar numeric,
  notes text,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Dental Charts
CREATE TABLE public.dental_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE CASCADE,
  chart_type text NOT NULL DEFAULT 'adult',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Dental Chart Entries (per tooth)
CREATE TABLE public.dental_chart_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid REFERENCES public.dental_charts(id) ON DELETE CASCADE NOT NULL,
  tooth_number integer NOT NULL,
  condition text NOT NULL DEFAULT 'healthy',
  treatment_needed text,
  notes text,
  surface text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Treatment Plans
CREATE TABLE public.treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE CASCADE,
  chart_id uuid REFERENCES public.dental_charts(id),
  doctor text DEFAULT 'Dr. Neemz',
  status text NOT NULL DEFAULT 'planned',
  total_estimated_cost numeric DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Treatment Plan Items
CREATE TABLE public.treatment_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.treatment_plans(id) ON DELETE CASCADE NOT NULL,
  tooth_number integer,
  treatment_type text NOT NULL,
  description text,
  estimated_cost numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  priority text DEFAULT 'normal',
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Clinical Photos (X-ray, 3D scans, etc.)
CREATE TABLE public.clinical_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE CASCADE,
  photo_type text NOT NULL DEFAULT 'xray',
  file_path text NOT NULL,
  file_name text,
  tooth_number integer,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Billings
CREATE TABLE public.billings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.treatment_plans(id),
  invoice_number text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  payment_method text DEFAULT 'cash',
  payment_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Billing Items
CREATE TABLE public.billing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id uuid REFERENCES public.billings(id) ON DELETE CASCADE NOT NULL,
  treatment_type text NOT NULL,
  description text,
  tooth_number integer,
  quantity integer DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Prescriptions
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  checkin_id uuid REFERENCES public.patient_checkins(id) ON DELETE CASCADE,
  doctor text DEFAULT 'Dr. Neemz',
  diagnosis text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Prescription Items
CREATE TABLE public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE CASCADE NOT NULL,
  medicine_name text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.patient_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dental_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dental_chart_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to patient_checkins" ON public.patient_checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to patient_vitals" ON public.patient_vitals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to dental_charts" ON public.dental_charts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to dental_chart_entries" ON public.dental_chart_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to treatment_plans" ON public.treatment_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to treatment_plan_items" ON public.treatment_plan_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to clinical_photos" ON public.clinical_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to billings" ON public.billings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to billing_items" ON public.billing_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to prescriptions" ON public.prescriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to prescription_items" ON public.prescription_items FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for clinical photos
INSERT INTO storage.buckets (id, name, public) VALUES ('clinical-photos', 'clinical-photos', true);
CREATE POLICY "Public access to clinical photos" ON storage.objects FOR ALL USING (bucket_id = 'clinical-photos') WITH CHECK (bucket_id = 'clinical-photos');
