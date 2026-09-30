
-- Add camp_code and qr_enabled to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS camp_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS qr_enabled boolean NOT NULL DEFAULT false;

-- Extend screening_leads for QR self-registration
ALTER TABLE public.screening_leads
  ADD COLUMN IF NOT EXISTS unique_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS dental_concern text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS screened boolean NOT NULL DEFAULT false;

-- Auto-generate camp_code when qr_enabled is turned on
CREATE OR REPLACE FUNCTION public.generate_camp_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix text;
  next_num int;
BEGIN
  IF NEW.qr_enabled = true AND (NEW.camp_code IS NULL OR NEW.camp_code = '') THEN
    prefix := CASE NEW.campaign_type
      WHEN 'school' THEN 'SCH'
      WHEN 'college' THEN 'COL'
      WHEN 'corporate' THEN 'CRP'
      ELSE 'CMP'
    END;
    SELECT COALESCE(MAX(CAST(SUBSTRING(camp_code FROM '[0-9]+$') AS int)), 0) + 1
      INTO next_num
      FROM public.campaigns
     WHERE camp_code LIKE prefix || '%';
    NEW.camp_code := prefix || LPAD(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_camp_code ON public.campaigns;
CREATE TRIGGER trg_generate_camp_code
BEFORE INSERT OR UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.generate_camp_code();

-- Auto-generate unique_code per registration: <camp_code>-NNN
CREATE OR REPLACE FUNCTION public.generate_lead_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c_code text;
  next_num int;
BEGIN
  IF NEW.unique_code IS NULL OR NEW.unique_code = '' THEN
    SELECT camp_code INTO c_code FROM public.campaigns WHERE id = NEW.campaign_id;
    IF c_code IS NULL OR c_code = '' THEN
      c_code := 'CMP' || SUBSTRING(NEW.campaign_id::text, 1, 4);
    END IF;
    SELECT COALESCE(MAX(CAST(SUBSTRING(unique_code FROM '[0-9]+$') AS int)), 0) + 1
      INTO next_num
      FROM public.screening_leads
     WHERE campaign_id = NEW.campaign_id AND unique_code IS NOT NULL;
    NEW.unique_code := c_code || '-' || LPAD(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_lead_unique_code ON public.screening_leads;
CREATE TRIGGER trg_generate_lead_unique_code
BEFORE INSERT ON public.screening_leads
FOR EACH ROW EXECUTE FUNCTION public.generate_lead_unique_code();
