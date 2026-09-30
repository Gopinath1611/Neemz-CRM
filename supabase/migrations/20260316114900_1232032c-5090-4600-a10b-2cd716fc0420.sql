
ALTER TABLE public.doctors
ADD COLUMN IF NOT EXISTS send_schedule_whatsapp boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS send_schedule_sms boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS appointment_type text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS schedule_frequency text DEFAULT 'everyday',
ADD COLUMN IF NOT EXISTS custom_duration text DEFAULT NULL;
