-- 1. Guard column
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;

-- Existing rows already affected inventory under the old rule
UPDATE public.purchase_items SET stock_applied = true WHERE stock_applied = false;

-- 2. Helper: apply or reverse stock for a single purchase item
CREATE OR REPLACE FUNCTION public.apply_purchase_item_stock(_item_id uuid, _apply boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  it record;
  v_supplier text;
  v_invoice text;
  v_inventory_id uuid;
BEGIN
  SELECT * INTO it FROM public.purchase_items WHERE id = _item_id;
  IF it.id IS NULL THEN RETURN; END IF;

  IF _apply AND it.stock_applied THEN RETURN; END IF;
  IF NOT _apply AND NOT it.stock_applied THEN RETURN; END IF;

  SELECT supplier_name, invoice_number INTO v_supplier, v_invoice
  FROM public.purchases WHERE id = it.purchase_id;

  v_inventory_id := it.inventory_item_id;
  IF v_inventory_id IS NULL THEN
    SELECT id INTO v_inventory_id
    FROM public.inventory_items
    WHERE lower(name) = lower(it.item_name)
    LIMIT 1;
  END IF;

  IF v_inventory_id IS NULL THEN
    IF NOT _apply THEN RETURN; END IF;
    INSERT INTO public.inventory_items (name, quantity, unit, cost_price, supplier, status)
    VALUES (it.item_name, 0, it.unit, it.unit_price, v_supplier, 'low_stock')
    RETURNING id INTO v_inventory_id;
    UPDATE public.purchase_items SET inventory_item_id = v_inventory_id WHERE id = it.id;
  END IF;

  IF _apply THEN
    UPDATE public.inventory_items
    SET quantity = COALESCE(quantity, 0) + it.quantity,
        cost_price = it.unit_price,
        supplier = COALESCE(v_supplier, supplier),
        status = CASE WHEN (COALESCE(quantity, 0) + it.quantity) > 5 THEN 'in_stock' ELSE 'low_stock' END,
        updated_at = now()
    WHERE id = v_inventory_id;

    INSERT INTO public.inventory_transactions (item_id, type, quantity, notes)
    VALUES (v_inventory_id, 'stock_in', it.quantity,
            'Purchase delivered from ' || COALESCE(v_supplier, 'supplier')
            || COALESCE(' (Inv: ' || v_invoice || ')', ''));

    UPDATE public.purchase_items SET stock_applied = true WHERE id = it.id;
  ELSE
    UPDATE public.inventory_items
    SET quantity = GREATEST(COALESCE(quantity, 0) - it.quantity, 0),
        status = CASE WHEN GREATEST(COALESCE(quantity, 0) - it.quantity, 0) > 5 THEN 'in_stock' ELSE 'low_stock' END,
        updated_at = now()
    WHERE id = v_inventory_id;

    INSERT INTO public.inventory_transactions (item_id, type, quantity, notes)
    VALUES (v_inventory_id, 'stock_out', it.quantity,
            'Purchase delivery reversed — ' || COALESCE(v_supplier, 'supplier')
            || COALESCE(' (Inv: ' || v_invoice || ')', ''));

    UPDATE public.purchase_items SET stock_applied = false WHERE id = it.id;
  END IF;
END;
$$;

-- 3. On purchase item insert: link/create catalogue row, apply stock only when delivered
CREATE OR REPLACE FUNCTION public.handle_purchase_inventory_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory_id uuid;
  v_supplier text;
  v_delivery text;
BEGIN
  SELECT supplier_name, delivery_status INTO v_supplier, v_delivery
  FROM public.purchases WHERE id = NEW.purchase_id;

  SELECT id INTO v_inventory_id
  FROM public.inventory_items
  WHERE lower(name) = lower(NEW.item_name)
  LIMIT 1;

  IF v_inventory_id IS NULL THEN
    INSERT INTO public.inventory_items (name, quantity, unit, cost_price, supplier, status)
    VALUES (NEW.item_name, 0, NEW.unit, NEW.unit_price, v_supplier, 'low_stock')
    RETURNING id INTO v_inventory_id;
  END IF;

  UPDATE public.purchase_items
  SET inventory_item_id = v_inventory_id
  WHERE id = NEW.id;

  IF v_delivery = 'delivered' THEN
    PERFORM public.apply_purchase_item_stock(NEW.id, true);
  END IF;

  RETURN NEW;
END;
$$;

-- 4. On purchase delivery status change: apply or reverse all its items
CREATE OR REPLACE FUNCTION public.handle_purchase_delivery_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.delivery_status = 'delivered' THEN
      FOR r IN SELECT id FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
        PERFORM public.apply_purchase_item_stock(r.id, false);
      END LOOP;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.delivery_status = 'delivered' AND COALESCE(OLD.delivery_status, '') <> 'delivered' THEN
    FOR r IN SELECT id FROM public.purchase_items WHERE purchase_id = NEW.id LOOP
      PERFORM public.apply_purchase_item_stock(r.id, true);
    END LOOP;
  ELSIF NEW.delivery_status <> 'delivered' AND OLD.delivery_status = 'delivered' THEN
    FOR r IN SELECT id FROM public.purchase_items WHERE purchase_id = NEW.id LOOP
      PERFORM public.apply_purchase_item_stock(r.id, false);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_delivery_stock_upd ON public.purchases;
CREATE TRIGGER trg_purchase_delivery_stock_upd
  AFTER UPDATE OF delivery_status ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_delivery_stock();

DROP TRIGGER IF EXISTS trg_purchase_delivery_stock_del ON public.purchases;
CREATE TRIGGER trg_purchase_delivery_stock_del
  BEFORE DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_delivery_stock();