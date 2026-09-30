
-- Add referred_patient_id to link the referred patient
ALTER TABLE public.referrals 
  ADD COLUMN IF NOT EXISTS referred_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_patient ON public.referrals(referrer_patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_patient ON public.referrals(referred_patient_id);

-- Trigger: when a billing is created/updated for a referred patient, auto-update revenue & status
CREATE OR REPLACE FUNCTION public.sync_referral_from_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id uuid;
  v_total numeric;
BEGIN
  -- Find a matching referral for this patient
  SELECT id INTO v_referral_id
    FROM public.referrals
   WHERE referred_patient_id = NEW.patient_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_referral_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum total billings for this patient
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total
    FROM public.billings
   WHERE patient_id = NEW.patient_id;

  UPDATE public.referrals
     SET revenue_generated = v_total,
         status = CASE WHEN v_total > 0 THEN 'converted' ELSE status END,
         converted_at = CASE WHEN v_total > 0 AND converted_at IS NULL THEN now() ELSE converted_at END
   WHERE id = v_referral_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_referral_from_billing ON public.billings;
CREATE TRIGGER trg_sync_referral_from_billing
AFTER INSERT OR UPDATE OF total_amount ON public.billings
FOR EACH ROW EXECUTE FUNCTION public.sync_referral_from_billing();
