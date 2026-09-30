
-- =========================================================
-- Fix A + B: DB-level pharmacy stock deduction & reversal
-- =========================================================

-- Helper: deduct inventory for a paid bill (idempotent via marker in notes)
CREATE OR REPLACE FUNCTION public.deduct_inventory_for_bill(_billing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker text := '[auto:bill-deduct:' || _billing_id::text || ']';
  v_already boolean;
  v_item record;
  v_inv_id uuid;
  v_current_qty int;
  v_min_lvl int;
  v_new_qty int;
  v_new_status text;
BEGIN
  -- Idempotency guard
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_transactions
     WHERE notes LIKE '%' || v_marker || '%'
       AND type = 'stock_out'
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
    -- Resolve inventory_item_id: medicines.inventory_item_id by name first, then inventory_items.name
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
$$;

-- Helper: restock inventory for a reversed bill (idempotent, only if deducted before)
CREATE OR REPLACE FUNCTION public.restock_inventory_for_bill(_billing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker_out text := '[auto:bill-deduct:' || _billing_id::text || ']';
  v_marker_in  text := '[auto:bill-restock:' || _billing_id::text || ']';
  v_already boolean;
  v_deducted boolean;
  v_txn record;
  v_current_qty int;
  v_min_lvl int;
  v_new_qty int;
  v_new_status text;
BEGIN
  -- Already restocked?
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_transactions
     WHERE notes LIKE '%' || v_marker_in || '%'
       AND type = 'stock_in'
  ) INTO v_already;
  IF v_already THEN RETURN; END IF;

  -- Was it deducted?
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_transactions
     WHERE notes LIKE '%' || v_marker_out || '%'
       AND type = 'stock_out'
  ) INTO v_deducted;
  IF NOT v_deducted THEN RETURN; END IF;

  FOR v_txn IN
    SELECT item_id, quantity
      FROM public.inventory_transactions
     WHERE notes LIKE '%' || v_marker_out || '%'
       AND type = 'stock_out'
  LOOP
    SELECT quantity, coalesce(min_stock_level, 0)
      INTO v_current_qty, v_min_lvl
      FROM public.inventory_items WHERE id = v_txn.item_id;

    v_new_qty := coalesce(v_current_qty, 0) + v_txn.quantity;
    v_new_status := CASE
      WHEN v_new_qty = 0 THEN 'out_of_stock'
      WHEN v_new_qty <= v_min_lvl THEN 'low_stock'
      ELSE 'in_stock'
    END;

    UPDATE public.inventory_items
       SET quantity = v_new_qty, status = v_new_status, updated_at = now()
     WHERE id = v_txn.item_id;

    INSERT INTO public.inventory_transactions (item_id, type, quantity, notes)
    VALUES (v_txn.item_id, 'stock_in', v_txn.quantity,
            'Bill reversal (Bill: ' || _billing_id::text || ') ' || v_marker_in);
  END LOOP;
END;
$$;

-- Trigger function on billings: deduct on paid, restock on cancel/void/refund
CREATE OR REPLACE FUNCTION public.handle_billing_status_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text := lower(coalesce(OLD.payment_status, ''));
  v_new text := lower(coalesce(NEW.payment_status, ''));
BEGIN
  -- Paid transition -> deduct
  IF v_new = 'paid' AND v_old <> 'paid' THEN
    PERFORM public.deduct_inventory_for_bill(NEW.id);
  END IF;

  -- Reversal transitions -> restock
  IF v_new IN ('cancelled','void','voided','refunded')
     AND v_old NOT IN ('cancelled','void','voided','refunded') THEN
    PERFORM public.restock_inventory_for_bill(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_billing_status_inventory ON public.billings;
CREATE TRIGGER trg_handle_billing_status_inventory
AFTER UPDATE OF payment_status ON public.billings
FOR EACH ROW
EXECUTE FUNCTION public.handle_billing_status_inventory();

-- Also cover inserts that are born 'paid' (rare, but possible)
CREATE OR REPLACE FUNCTION public.handle_billing_insert_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.payment_status,'')) = 'paid' THEN
    PERFORM public.deduct_inventory_for_bill(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_billing_insert_inventory ON public.billings;
CREATE TRIGGER trg_handle_billing_insert_inventory
AFTER INSERT ON public.billings
FOR EACH ROW
EXECUTE FUNCTION public.handle_billing_insert_inventory();
