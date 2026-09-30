UPDATE public.prescriptions p
SET doctor = tp.doctor
FROM public.treatment_plans tp
WHERE tp.checkin_id = p.checkin_id
  AND tp.doctor IS NOT NULL
  AND btrim(tp.doctor) <> ''
  AND (p.doctor IS NULL OR btrim(p.doctor) = '' OR p.doctor = 'Dr. Neemz' OR p.doctor = 'Dr Neemz');