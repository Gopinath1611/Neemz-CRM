REVOKE EXECUTE ON FUNCTION public.apply_purchase_item_stock(uuid, boolean) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_purchase_delivery_stock() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_purchase_inventory_update() FROM anon, authenticated, public;