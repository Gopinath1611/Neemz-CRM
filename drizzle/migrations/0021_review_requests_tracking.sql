ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS delivery_error text,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid();
UPDATE public.review_requests SET status = CASE WHEN review_received THEN 'submitted' ELSE 'sent' END;
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_patient_appt_uniq ON public.review_requests (patient_id, appointment_id) WHERE appointment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_token_uniq ON public.review_requests (tracking_token);