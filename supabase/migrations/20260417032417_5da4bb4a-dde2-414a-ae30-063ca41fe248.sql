ALTER TABLE public.campaign_coupons 
ADD COLUMN IF NOT EXISTS coupon_code text,
ADD COLUMN IF NOT EXISTS sent_via_whatsapp boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamp with time zone;