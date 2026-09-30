
-- Function: when a treatment plan item is completed, increment matching employee target's achieved_value
CREATE OR REPLACE FUNCTION public.sync_treatment_to_employee_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor text;
  v_emp_id uuid;
  v_treatment text;
  v_target record;
  v_new_achieved numeric;
  v_new_status text;
  v_increment numeric := 1;
  v_was_completed boolean := false;
BEGIN
  -- Determine if this is a fresh completion event
  IF TG_OP = 'INSERT' THEN
    v_was_completed := (NEW.status = 'completed');
  ELSIF TG_OP = 'UPDATE' THEN
    v_was_completed := (NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed');
  END IF;

  IF NOT v_was_completed THEN
    RETURN NEW;
  END IF;

  -- Resolve doctor name: prefer item.doctor, fallback to plan.doctor
  v_doctor := NEW.doctor;
  IF v_doctor IS NULL OR v_doctor = '' THEN
    SELECT doctor INTO v_doctor FROM public.treatment_plans WHERE id = NEW.plan_id;
  END IF;
  IF v_doctor IS NULL OR v_doctor = '' THEN
    RETURN NEW;
  END IF;

  -- Find matching employee by name (first_name + ' ' + last_name OR first_name match)
  SELECT id INTO v_emp_id FROM public.employees
   WHERE status = 'active'
     AND (
       lower(trim(first_name || ' ' || last_name)) = lower(trim(v_doctor))
       OR lower(trim(first_name)) = lower(trim(replace(v_doctor, 'Dr.', '')))
       OR lower(trim(first_name)) = lower(trim(replace(v_doctor, 'Dr ', '')))
     )
   LIMIT 1;

  IF v_emp_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_treatment := NEW.treatment_type;
  IF v_treatment IS NULL OR v_treatment = '' THEN
    RETURN NEW;
  END IF;

  -- Update all active targets for this employee + metric covering today
  FOR v_target IN
    SELECT * FROM public.employee_targets
     WHERE employee_id = v_emp_id
       AND lower(trim(metric_name)) = lower(trim(v_treatment))
       AND CURRENT_DATE BETWEEN period_start AND period_end
       AND status <> 'achieved'
  LOOP
    v_new_achieved := COALESCE(v_target.achieved_value, 0) + v_increment;
    IF v_new_achieved >= v_target.target_value THEN
      v_new_status := CASE WHEN v_new_achieved > v_target.target_value THEN 'exceeded' ELSE 'achieved' END;
    ELSE
      v_new_status := 'in_progress';
    END IF;
    UPDATE public.employee_targets
       SET achieved_value = v_new_achieved,
           status = v_new_status,
           updated_at = now()
     WHERE id = v_target.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_treatment_to_target ON public.treatment_plan_items;
CREATE TRIGGER trg_sync_treatment_to_target
AFTER INSERT OR UPDATE OF status ON public.treatment_plan_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_treatment_to_employee_target();


-- Function: when an appointment is marked completed, increment "Consultation" / type metric
CREATE OR REPLACE FUNCTION public.sync_appointment_to_employee_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor text;
  v_emp_id uuid;
  v_target record;
  v_new_achieved numeric;
  v_new_status text;
  v_metric_candidates text[];
  v_was_completed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_was_completed := (NEW.status = 'completed');
  ELSIF TG_OP = 'UPDATE' THEN
    v_was_completed := (NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed');
  END IF;

  IF NOT v_was_completed THEN
    RETURN NEW;
  END IF;

  v_doctor := NEW.doctor;
  IF v_doctor IS NULL OR v_doctor = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_emp_id FROM public.employees
   WHERE status = 'active'
     AND (
       lower(trim(first_name || ' ' || last_name)) = lower(trim(v_doctor))
       OR lower(trim(first_name)) = lower(trim(replace(v_doctor, 'Dr.', '')))
       OR lower(trim(first_name)) = lower(trim(replace(v_doctor, 'Dr ', '')))
     )
   LIMIT 1;

  IF v_emp_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build candidate metric names: Consultation, Per Day Pt Handled, plus appointment.type label
  v_metric_candidates := ARRAY[
    'consultation',
    'consultations handled',
    'per day pt handled',
    'per day patients handled',
    lower(trim(COALESCE(NEW.type, '')))
  ];

  FOR v_target IN
    SELECT * FROM public.employee_targets
     WHERE employee_id = v_emp_id
       AND lower(trim(metric_name)) = ANY(v_metric_candidates)
       AND CURRENT_DATE BETWEEN period_start AND period_end
       AND status <> 'achieved'
  LOOP
    v_new_achieved := COALESCE(v_target.achieved_value, 0) + 1;
    IF v_new_achieved >= v_target.target_value THEN
      v_new_status := CASE WHEN v_new_achieved > v_target.target_value THEN 'exceeded' ELSE 'achieved' END;
    ELSE
      v_new_status := 'in_progress';
    END IF;
    UPDATE public.employee_targets
       SET achieved_value = v_new_achieved,
           status = v_new_status,
           updated_at = now()
     WHERE id = v_target.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_to_target ON public.appointments;
CREATE TRIGGER trg_sync_appointment_to_target
AFTER INSERT OR UPDATE OF status ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_appointment_to_employee_target();
