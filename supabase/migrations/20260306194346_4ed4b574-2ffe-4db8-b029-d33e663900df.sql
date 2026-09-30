
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
  SELECT supplier_name INTO v_supplier FROM public.purchases WHERE id = NEW.purchase_id;

  SELECT id INTO v_inventory_id
  FROM public.inventory_items
  WHERE lower(name) = lower(NEW.item_name)
  LIMIT 1;

  IF v_inventory_id IS NULL THEN
    INSERT INTO public.inventory_items (name, quantity, unit, cost_price, supplier, status)
    VALUES (NEW.item_name, NEW.quantity, NEW.unit, NEW.unit_price, v_supplier, 
            CASE WHEN NEW.quantity > 5 THEN 'in_stock' ELSE 'low_stock' END)
    RETURNING id INTO v_inventory_id;
  ELSE
    UPDATE public.inventory_items
    SET quantity = quantity + NEW.quantity,
        cost_price = NEW.unit_price,
        supplier = v_supplier,
        updated_at = now()
    WHERE id = v_inventory_id;
  END IF;

  UPDATE public.purchase_items
  SET inventory_item_id = v_inventory_id
  WHERE id = NEW.id;

  INSERT INTO public.inventory_transactions (item_id, type, quantity, notes)
  VALUES (v_inventory_id, 'stock_in', NEW.quantity, 
          'Purchase from ' || v_supplier || COALESCE(' (Inv: ' || (SELECT invoice_number FROM public.purchases WHERE id = NEW.purchase_id) || ')', ''));

  RETURN NEW;
END;
$$;
