-- Internal routines: no direct API execution (triggers still run them as owner)
REVOKE EXECUTE ON FUNCTION public.deduct_inventory_for_bill(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restock_inventory_for_bill(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_billing_insert_inventory() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_billing_status_inventory() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_employee_to_auth_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_workflow_contacts_for_form(text, text, text, text, text) FROM anon, authenticated;

-- Role helper used only inside RLS policies: anonymous callers have no use for it
REVOKE EXECUTE ON FUNCTION public.is_clinical_user(uuid) FROM anon;