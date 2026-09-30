REVOKE ALL ON FUNCTION public.recompute_referral_revenue(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.sync_referral_from_payment() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.sync_referral_from_billing() FROM anon, authenticated, public;