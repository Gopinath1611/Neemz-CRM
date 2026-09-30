ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS drawer_date date;

ALTER TABLE public.deposits
  ADD CONSTRAINT deposits_source_check CHECK (source IN ('direct','cash_drawer'));

CREATE INDEX IF NOT EXISTS deposits_source_drawer_date_idx
  ON public.deposits (source, drawer_date);