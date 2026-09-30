
-- Link expenses to purchases and auto-sync via triggers
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_purchase_id_unique
  ON public.expenses(purchase_id) WHERE purchase_id IS NOT NULL;

-- Seed Inventory Purchase category
INSERT INTO public.expense_categories (name, value, is_active, is_default)
SELECT 'Inventory Purchase', 'inventory_purchase', true, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories WHERE value = 'inventory_purchase'
);

-- Trigger: when purchase is paid, create/update expense; when unpaid, remove expense
CREATE OR REPLACE FUNCTION public.sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_desc text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Block delete when paid expense exists
    SELECT id INTO v_existing_id FROM public.expenses WHERE purchase_id = OLD.id LIMIT 1;
    IF v_existing_id IS NOT NULL AND OLD.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Cannot delete purchase % — a linked paid expense exists. Mark the purchase as unpaid (reversal) first.', OLD.id;
    END IF;
    DELETE FROM public.expenses WHERE purchase_id = OLD.id;
    RETURN OLD;
  END IF;

  v_desc := 'Inventory Purchase' ||
    CASE WHEN NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> ''
         THEN ' — Inv ' || NEW.invoice_number ELSE '' END ||
    CASE WHEN NEW.supplier_name IS NOT NULL AND NEW.supplier_name <> ''
         THEN ' (' || NEW.supplier_name || ')' ELSE '' END;

  SELECT id INTO v_existing_id FROM public.expenses WHERE purchase_id = NEW.id LIMIT 1;

  IF NEW.payment_status = 'paid' THEN
    IF v_existing_id IS NULL THEN
      INSERT INTO public.expenses (
        expense_date, category, subcategory, description, amount,
        payment_method, paid_to, receipt_number, notes, purchase_id
      ) VALUES (
        NEW.purchase_date, 'Inventory Purchase', NEW.supplier_type, v_desc, NEW.total_amount,
        COALESCE(NEW.payment_method, 'cash'), NEW.supplier_name, NEW.invoice_number,
        'Auto-created from Purchase ' || NEW.id::text, NEW.id
      );
    ELSE
      UPDATE public.expenses SET
        expense_date = NEW.purchase_date,
        subcategory = NEW.supplier_type,
        description = v_desc,
        amount = NEW.total_amount,
        payment_method = COALESCE(NEW.payment_method, 'cash'),
        paid_to = NEW.supplier_name,
        receipt_number = NEW.invoice_number,
        updated_at = now()
      WHERE id = v_existing_id;
    END IF;
  ELSE
    -- Not paid → remove any auto-created expense (reversal)
    IF v_existing_id IS NOT NULL THEN
      DELETE FROM public.expenses WHERE id = v_existing_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_purchase_to_expense_ins ON public.purchases;
DROP TRIGGER IF EXISTS trg_sync_purchase_to_expense_upd ON public.purchases;
DROP TRIGGER IF EXISTS trg_sync_purchase_to_expense_del ON public.purchases;

CREATE TRIGGER trg_sync_purchase_to_expense_ins
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_to_expense();

CREATE TRIGGER trg_sync_purchase_to_expense_upd
  AFTER UPDATE OF payment_status, total_amount, purchase_date, supplier_name, invoice_number, payment_method, supplier_type
  ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_to_expense();

CREATE TRIGGER trg_sync_purchase_to_expense_del
  BEFORE DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_to_expense();

-- Backfill: create expenses for existing paid purchases without one
INSERT INTO public.expenses (
  expense_date, category, subcategory, description, amount,
  payment_method, paid_to, receipt_number, notes, purchase_id
)
SELECT
  p.purchase_date,
  'Inventory Purchase',
  p.supplier_type,
  'Inventory Purchase' ||
    CASE WHEN p.invoice_number IS NOT NULL AND p.invoice_number <> ''
         THEN ' — Inv ' || p.invoice_number ELSE '' END ||
    CASE WHEN p.supplier_name IS NOT NULL AND p.supplier_name <> ''
         THEN ' (' || p.supplier_name || ')' ELSE '' END,
  p.total_amount,
  COALESCE(p.payment_method, 'cash'),
  p.supplier_name,
  p.invoice_number,
  'Auto-created from Purchase ' || p.id::text,
  p.id
FROM public.purchases p
WHERE p.payment_status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.purchase_id = p.id);
