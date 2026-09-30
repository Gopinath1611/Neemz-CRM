ALTER TABLE public.lab_orders
ALTER COLUMN tooth_number TYPE text
USING tooth_number::text;

ALTER TABLE public.billing_items
ALTER COLUMN tooth_number TYPE text
USING tooth_number::text;

UPDATE public.lab_orders
SET tooth_number = trim(substring(description from 'Teeth:\s*([0-9,\s]+)'))
WHERE description ~ 'Teeth:\s*[0-9]';

UPDATE public.billing_items
SET tooth_number = trim(substring(description from 'Teeth:\s*([0-9,\s]+)'))
WHERE description ~ 'Teeth:\s*[0-9]';