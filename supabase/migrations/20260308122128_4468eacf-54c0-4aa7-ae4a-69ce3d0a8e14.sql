
-- Add auto-increment patient_code to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_code SERIAL;

-- Add checkin_time and checkout_time to appointments table
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS checkin_time TIME WITHOUT TIME ZONE DEFAULT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS checkout_time TIME WITHOUT TIME ZONE DEFAULT NULL;
