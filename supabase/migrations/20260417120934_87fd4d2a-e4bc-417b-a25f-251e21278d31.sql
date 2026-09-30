ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_date date;

CREATE OR REPLACE FUNCTION public.set_purchase_delivery_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_status = 'delivered' AND (OLD.delivery_status IS DISTINCT FROM 'delivered') AND NEW.delivery_date IS NULL THEN
    NEW.delivery_date := CURRENT_DATE;
  END IF;
  IF NEW.delivery_status <> 'delivered' THEN
    NEW.delivery_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchases_delivery_date ON public.purchases;
CREATE TRIGGER trg_purchases_delivery_date
BEFORE INSERT OR UPDATE OF delivery_status ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.set_purchase_delivery_date();