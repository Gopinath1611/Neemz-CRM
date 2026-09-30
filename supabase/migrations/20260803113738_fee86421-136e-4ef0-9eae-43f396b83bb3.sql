CREATE OR REPLACE FUNCTION public.deduct_inventory_for_bill(_billing_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marker text := '[auto:bill-deduct:' || _billing_id::text || ']';
  v_legacy text := 'Bill: ' || _billing_id::text;
  v_already boolean;
  v_item record;
  v_inv_id uuid;
  v_current_qty int;
  v_min_lvl int;
  v_new_qty int;
  v_new_status text;
BEGIN
  -- Idempotency guard: any prior stock_out for this bill (new marker OR legacy
  -- client-written note) means the deduction already happened.
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_transactions
     WHERE type = 'stock_out'
       AND (notes LIKE '%' || v_marker || '%' OR notes LIKE '%' || v_legacy || '%')
  ) INTO v_already;
  IF v_already THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT bi.description, bi.quantity
      FROM public.billing_items bi
     WHERE bi.billing_id = _billing_id
       AND bi.treatment_type = 'Medicine'
  LOOP
    v_inv_id := NULL;
    SELECT m.inventory_item_id INTO v_inv_id
      FROM public.medicines m
     WHERE lower(trim(m.name)) = lower(trim(split_part(coalesce(v_item.description,''), ' (', 1)))
     LIMIT 1;

    IF v_inv_id IS NULL THEN
      SELECT ii.id INTO v_inv_id
        FROM public.inventory_items ii
       WHERE lower(trim(ii.name)) = lower(trim(split_part(coalesce(v_item.description,''), ' (', 1)))
         AND coalesce(ii.is_active, true) = true
       LIMIT 1;
    END IF;

    IF v_inv_id IS NULL OR coalesce(v_item.quantity, 0) <= 0 THEN
      CONTINUE;
    END IF;

    SELECT quantity, coalesce(min_stock_level, 0)
      INTO v_current_qty, v_min_lvl
      FROM public.inventory_items WHERE id = v_inv_id;

    v_new_qty := GREATEST(0, coalesce(v_current_qty, 0) - v_item.quantity);
    v_new_status := CASE
      WHEN v_new_qty = 0 THEN 'out_of_stock'
      WHEN v_new_qty <= v_min_lvl THEN 'low_stock'
      ELSE 'in_stock'
    END;

    UPDATE public.inventory_items
       SET quantity = v_new_qty, status = v_new_status, updated_at = now()
     WHERE id = v_inv_id;

    INSERT INTO public.inventory_transactions (item_id, type, quantity, notes)
    VALUES (v_inv_id, 'stock_out', v_item.quantity,
            'Pharmacy bill paid (Bill: ' || _billing_id::text || ') ' || v_marker);
  END LOOP;
END;
$function$;