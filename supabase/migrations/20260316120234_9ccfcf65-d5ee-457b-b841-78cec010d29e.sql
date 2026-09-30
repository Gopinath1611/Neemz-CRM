
-- Change morning/afternoon/evening/night from boolean to text for dosage values (-, ½, 1)
ALTER TABLE public.medicines ALTER COLUMN morning TYPE text USING CASE WHEN morning THEN '1' ELSE '-' END;
ALTER TABLE public.medicines ALTER COLUMN afternoon TYPE text USING CASE WHEN afternoon THEN '1' ELSE '-' END;
ALTER TABLE public.medicines ALTER COLUMN evening TYPE text USING CASE WHEN evening THEN '1' ELSE '-' END;
ALTER TABLE public.medicines ALTER COLUMN night TYPE text USING CASE WHEN night THEN '1' ELSE '-' END;

-- Set defaults
ALTER TABLE public.medicines ALTER COLUMN morning SET DEFAULT '-';
ALTER TABLE public.medicines ALTER COLUMN afternoon SET DEFAULT '-';
ALTER TABLE public.medicines ALTER COLUMN evening SET DEFAULT '-';
ALTER TABLE public.medicines ALTER COLUMN night SET DEFAULT '-';

-- Change before_food/after_food from boolean to text for custom instructions
ALTER TABLE public.medicines ALTER COLUMN before_food TYPE text USING CASE WHEN before_food THEN 'Before Food' ELSE '' END;
ALTER TABLE public.medicines ALTER COLUMN after_food TYPE text USING CASE WHEN after_food THEN 'After Food' ELSE '' END;

-- Rename to food_instruction (single field) - drop old columns and add new
ALTER TABLE public.medicines ADD COLUMN food_instruction text DEFAULT 'After Food';

-- Update food_instruction from old data
UPDATE public.medicines SET food_instruction = CASE 
  WHEN before_food = 'Before Food' AND after_food = 'After Food' THEN 'Before Food'
  WHEN before_food = 'Before Food' THEN 'Before Food'
  WHEN after_food = 'After Food' THEN 'After Food'
  ELSE 'After Food'
END;

-- Drop old columns
ALTER TABLE public.medicines DROP COLUMN before_food;
ALTER TABLE public.medicines DROP COLUMN after_food;

-- Add inventory link
ALTER TABLE public.medicines ADD COLUMN inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL;
