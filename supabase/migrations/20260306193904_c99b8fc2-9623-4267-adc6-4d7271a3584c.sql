
-- Function: when a purchase_item is inserted, find or create the inventory_item and increase stock
CREATE OR REPLACE FUNCTION public.handle_purchase_inventory_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory_id uuid;
  v_supplier text;
BEGIN
  -- Get supplier name from the purchase
  SELECT supplier_name INTO v_supplier FROM public.purchases WHERE id = NEW.purchase_id;

  -- Try to find existing inventory item by name (case-insensitive)
  SELECT id INTO v_inventory_id
  FROM public.inventory_items
  WHERE lower(name) = lower(NEW.item_name)
  LIMIT 1;

  -- If not found, create a new inventory item
  IF v_inventory_id IS NULL THEN
    INSERT INTO public.inventory_items (name, quantity, unit, cost_price, supplier, status)
    VALUES (NEW.item_name, NEW.quantity, NEW.unit, NEW.unit_price, v_supplier, 
            CASE WHEN NEW.quantity > 5 THEN 'in_stock' ELSE 'low_stock' END)
    RETURNING id INTO v_inventory_id;
  ELSE
    -- Update existing inventory: increase quantity, update cost price and supplier
    UPDATE public.inventory_items
    SET quantity = quantity + NEW.quantity,
        cost_price = NEW.unit_price,
        supplier = v_supplier,
        updated_at = now()
    WHERE id = v_inventory_id;
  END IF;

  -- Link the purchase item to inventory
  UPDATE public.purchase_items
  SET inventory_item_id = v_inventory_id
  WHERE id = NEW.id;

  -- Record the inventory transaction
  INSERT INTO public.inventory_transactions (item_id, type, quantity, notes)
  VALUES (v_inventory_id, 'purchase', NEW.quantity, 
          'Purchase from ' || v_supplier || COALESCE(' (Inv: ' || (SELECT invoice_number FROM public.purchases WHERE id = NEW.purchase_id) || ')', ''));

  RETURN NEW;
END;
$$;

-- Trigger on purchase_items insert
CREATE TRIGGER trigger_purchase_inventory_update
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_purchase_inventory_update();
