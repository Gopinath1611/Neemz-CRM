WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        billing_id,
        date_trunc('minute', payment_date AT TIME ZONE 'UTC'),
        round(amount::numeric, 2),
        lower(trim(coalesce(payment_method, ''))),
        lower(trim(coalesce(notes, '')))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.billing_payments
)
DELETE FROM public.billing_payments bp
USING ranked r
WHERE bp.id = r.id
  AND r.rn > 1;

ALTER TABLE public.billing_payments
ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE OR REPLACE FUNCTION public.build_billing_payment_dedupe_key(
  _billing_id uuid,
  _payment_date timestamptz,
  _amount numeric,
  _payment_method text,
  _notes text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT concat_ws(
    '|',
    _billing_id::text,
    to_char(date_trunc('minute', _payment_date AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI'),
    round(coalesce(_amount, 0)::numeric, 2)::text,
    lower(trim(coalesce(_payment_method, ''))),
    lower(trim(coalesce(_notes, '')))
  )
$$;

UPDATE public.billing_payments
SET dedupe_key = public.build_billing_payment_dedupe_key(
  billing_id,
  payment_date,
  amount,
  payment_method,
  notes
);

CREATE OR REPLACE FUNCTION public.set_billing_payment_dedupe_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dedupe_key := public.build_billing_payment_dedupe_key(
    NEW.billing_id,
    NEW.payment_date,
    NEW.amount,
    NEW.payment_method,
    NEW.notes
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_billing_payment_dedupe_key ON public.billing_payments;
CREATE TRIGGER set_billing_payment_dedupe_key
  BEFORE INSERT OR UPDATE OF billing_id, payment_date, amount, payment_method, notes
  ON public.billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_billing_payment_dedupe_key();

CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_dedupe_key_idx
ON public.billing_payments (dedupe_key);