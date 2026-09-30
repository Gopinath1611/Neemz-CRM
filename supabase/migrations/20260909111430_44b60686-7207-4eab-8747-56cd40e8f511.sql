-- Recompute collected, 90-day-windowed referral revenue for one patient
CREATE OR REPLACE FUNCTION public.recompute_referral_revenue(_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral record;
  v_total numeric;
BEGIN
  IF _patient_id IS NULL THEN RETURN; END IF;

  FOR v_referral IN
    SELECT id, created_at FROM public.referrals WHERE referred_patient_id = _patient_id
  LOOP
    SELECT COALESCE(SUM(bp.amount), 0) INTO v_total
      FROM public.billing_payments bp
      JOIN public.billings b ON b.id = bp.billing_id
     WHERE b.patient_id = _patient_id
       AND bp.payment_date >= v_referral.created_at - interval '1 day'
       AND bp.payment_date <= v_referral.created_at + interval '90 days';

    UPDATE public.referrals
       SET revenue_generated = v_total,
           status = CASE WHEN v_total > 0 THEN 'converted' ELSE status END,
           converted_at = CASE WHEN v_total > 0 AND converted_at IS NULL THEN now() ELSE converted_at END
     WHERE id = v_referral.id;
  END LOOP;
END;
$$;

-- Billings trigger: keep the patient link path, recompute from collected payments
CREATE OR REPLACE FUNCTION public.sync_referral_from_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Backfill any unlinked referral for this patient using the phone number
  UPDATE public.referrals r
     SET referred_patient_id = NEW.patient_id
   WHERE r.referred_patient_id IS NULL
     AND public.normalize_phone_last10(r.referred_phone) IS NOT NULL
     AND public.normalize_phone_last10(r.referred_phone) = (
       SELECT public.normalize_phone_last10(p.phone) FROM public.patients p WHERE p.id = NEW.patient_id
     );

  PERFORM public.recompute_referral_revenue(NEW.patient_id);
  RETURN NEW;
END;
$$;

-- Payments trigger: collected money drives the figure
CREATE OR REPLACE FUNCTION public.sync_referral_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_billing uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.billing_id ELSE NEW.billing_id END;
  v_patient uuid;
BEGIN
  SELECT patient_id INTO v_patient FROM public.billings WHERE id = v_billing;
  PERFORM public.recompute_referral_revenue(v_patient);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_referral_from_payment ON public.billing_payments;
CREATE TRIGGER trg_sync_referral_from_payment
AFTER INSERT OR UPDATE OF amount, payment_date OR DELETE ON public.billing_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_referral_from_payment();