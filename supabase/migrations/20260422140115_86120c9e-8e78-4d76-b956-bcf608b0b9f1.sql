
-- Auto-link medicines to inventory items by name match (only where not already linked)
UPDATE public.medicines m
SET inventory_item_id = ii.id
FROM public.inventory_items ii
WHERE m.inventory_item_id IS NULL
  AND ii.is_active = true
  AND lower(trim(m.name)) = lower(trim(ii.name));
