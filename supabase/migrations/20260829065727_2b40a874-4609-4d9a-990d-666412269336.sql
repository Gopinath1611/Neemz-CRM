ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS doctor_type text,
  ADD COLUMN IF NOT EXISTS guest_doctor_name text,
  ADD COLUMN IF NOT EXISTS guest_doctor_contact text,
  ADD COLUMN IF NOT EXISTS guest_doctor_specialization text,
  ADD COLUMN IF NOT EXISTS assistant_type text,
  ADD COLUMN IF NOT EXISTS guest_assistant_name text,
  ADD COLUMN IF NOT EXISTS guest_assistant_contact text,
  ADD COLUMN IF NOT EXISTS coordinator_contact text;