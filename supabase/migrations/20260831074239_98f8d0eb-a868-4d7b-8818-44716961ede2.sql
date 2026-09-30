-- 1) Per-campaign atomic counter for QR unique codes
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS lead_seq integer NOT NULL DEFAULT 0;

-- Seed counter from existing leads
UPDATE public.campaigns c
   SET lead_seq = GREATEST(c.lead_seq, s.mx)
  FROM (
    SELECT campaign_id,
           COALESCE(MAX(CAST(SUBSTRING(unique_code FROM '[0-9]+$') AS int)), 0) AS mx
      FROM public.screening_leads
     WHERE unique_code IS NOT NULL AND unique_code ~ '[0-9]+$'
     GROUP BY campaign_id
  ) s
 WHERE s.campaign_id = c.id;

-- 2) Race-safe unique_code generation
CREATE OR REPLACE FUNCTION public.generate_lead_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  c_code text;
  next_num int;
BEGIN
  IF NEW.unique_code IS NULL OR NEW.unique_code = '' THEN
    IF NEW.campaign_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Atomic increment: serializes concurrent inserts per campaign row
    UPDATE public.campaigns
       SET lead_seq = lead_seq + 1
     WHERE id = NEW.campaign_id
    RETURNING camp_code, lead_seq INTO c_code, next_num;

    IF next_num IS NULL THEN
      RETURN NEW;
    END IF;

    IF c_code IS NULL OR c_code = '' THEN
      c_code := 'CMP' || SUBSTRING(NEW.campaign_id::text, 1, 4);
    END IF;

    NEW.unique_code := c_code || '-' || LPAD(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Duplicate mobile guard at DB level for QR rows
CREATE UNIQUE INDEX IF NOT EXISTS screening_leads_qr_campaign_mobile_uidx
  ON public.screening_leads (campaign_id, mobile)
  WHERE source = 'qr';

-- 4) Handle unique violation gracefully in public registration
CREATE OR REPLACE FUNCTION public.camp_self_register(p_campaign_id uuid, p_participant_name text, p_mobile text, p_email text DEFAULT NULL::text, p_age integer DEFAULT NULL::integer, p_gender text DEFAULT NULL::text, p_dental_concern text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Fast path duplicate guard: same mobile + same camp returns the existing code
  SELECT unique_code INTO v_code
    FROM public.screening_leads
   WHERE campaign_id = p_campaign_id
     AND right(regexp_replace(coalesce(mobile,''), '[^0-9]', '', 'g'), 10) = v_mobile
   ORDER BY created_at
   LIMIT 1;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  BEGIN
    INSERT INTO public.screening_leads (
      campaign_id, participant_name, mobile, email, age, gender, dental_concern, source, screened
    ) VALUES (
      p_campaign_id,
      v_name,
      v_mobile,
      NULLIF(trim(coalesce(p_email, '')), ''),
      p_age,
      lower(NULLIF(trim(coalesce(p_gender, '')), '')),
      NULLIF(trim(coalesce(p_dental_concern, '')), ''),
      'qr',
      false
    )
    RETURNING unique_code INTO v_code;
  EXCEPTION WHEN unique_violation THEN
    SELECT unique_code INTO v_code
      FROM public.screening_leads
     WHERE campaign_id = p_campaign_id
       AND right(regexp_replace(coalesce(mobile,''), '[^0-9]', '', 'g'), 10) = v_mobile
     ORDER BY created_at
     LIMIT 1;
  END;

  RETURN v_code;
END;
$function$;