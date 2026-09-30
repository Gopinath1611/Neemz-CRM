ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS inventory_items_is_favorite_idx
  ON public.inventory_items (is_favorite) WHERE is_favorite = true;