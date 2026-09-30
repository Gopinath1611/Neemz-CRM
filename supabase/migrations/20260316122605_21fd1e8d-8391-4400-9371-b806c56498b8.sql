
CREATE TABLE public.clinic_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',
  google_review_link text DEFAULT '',
  logo_url text DEFAULT '',
  seal_url text DEFAULT '',
  show_pending_balance_on_invoice boolean DEFAULT false,
  appointment_reminder_auto boolean DEFAULT false,
  follow_up_reminder_auto boolean DEFAULT false,
  birthday_wishes boolean DEFAULT false,
  show_finance_obstacles boolean DEFAULT false,
  lab_order_updates_to_patient boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to clinic_settings" ON public.clinic_settings
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Insert a default row
INSERT INTO public.clinic_settings (clinic_name, phone, address, email, website)
VALUES ('Doctor Neets Dentistry', '+91 44 XXXX XXXX', 'Chennai, Tamil Nadu', 'info@neetsdentistry.com', 'www.neetsdentistry.com');
