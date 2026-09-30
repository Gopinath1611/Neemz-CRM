-- Public, narrow read of a QR-enabled camp
CREATE OR REPLACE FUNCTION public.camp_public_info(p_campaign_id uuid)
RETURNS TABLE (name text, camp_code text, campaign_type text, qr_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.name, c.camp_code, c.campaign_type, c.qr_enabled
    FROM public.campaigns c
   WHERE c.id = p_campaign_id
     AND c.qr_enabled = true
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.camp_public_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.camp_public_info(uuid) TO anon, authenticated;

-- Public self-registration for a QR-enabled camp
CREATE OR REPLACE FUNCTION public.camp_self_register(
  p_campaign_id uuid,
  p_participant_name text,
  p_mobile text,
  p_email text DEFAULT NULL,
  p_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_dental_concern text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_name text := trim(coalesce(p_participant_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g');
  v_code text;
BEGIN
  SELECT qr_enabled INTO v_enabled FROM public.campaigns WHERE id = p_campaign_id;
  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'CAMP_NOT_FOUND';
  END IF;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'QR_DISABLED';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  v_mobile := right(v_mobile, 10);
  IF v_mobile !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'INVALID_MOBILE';
  END IF;

  IF p_age IS NOT NULL AND (p_age < 1 OR p_age > 120) THEN
    RAISE EXCEPTION 'INVALID_AGE';
  END IF;

  IF p_gender IS NOT NULL AND lower(p_gender) NOT IN ('male','female','other') THEN
    RAISE EXCEPTION 'INVALID_GENDER';
  END IF;

  -- Duplicate guard: same mobile + same camp returns the existing code
  SELECT unique_code INTO v_code
    FROM public.screening_leads
   WHERE campaign_id = p_campaign_id
     AND right(regexp_replace(coalesce(mobile,''), '[^0-9]', '', 'g'), 10) = v_mobile
   ORDER BY created_at
   LIMIT 1;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  INSERT INTO public.screening_leads (
    campaign_id, participant_name, mobile, email, age, gender, dental_concern, source
  ) VALUES (
    p_campaign_id,
    v_name,
    v_mobile,
    NULLIF(trim(coalesce(p_email, '')), ''),
    p_age,
    lower(NULLIF(trim(coalesce(p_gender, '')), '')),
    NULLIF(trim(coalesce(p_dental_concern, '')), ''),
    'qr'
  )
  RETURNING unique_code INTO v_code;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.camp_self_register(uuid, text, text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.camp_self_register(uuid, text, text, text, integer, text, text) TO anon, authenticated;