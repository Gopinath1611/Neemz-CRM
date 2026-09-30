ALTER TABLE public.medicines
ADD COLUMN IF NOT EXISTS dosage text;

UPDATE public.medicines
SET dosage = trim((regexp_match(name, '(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|drops|drop|tablet|tab|capsule|cap|sachet))', 'i'))[1])
WHERE (dosage IS NULL OR btrim(dosage) = '')
  AND name ~* '(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|drops|drop|tablet|tab|capsule|cap|sachet))';