-- Map attendance leave codes -> leave_balances.leave_type labels
CREATE OR REPLACE FUNCTION public.attendance_leave_type(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(coalesce(_status, '')))
    WHEN 'cl' THEN 'Casual Leave'
    WHEN 'sl' THEN 'Sick Leave'
    WHEN 'el' THEN 'Earned Leave'
    WHEN 'lv' THEN 'Casual Leave'
    WHEN 'leave' THEN 'Casual Leave'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.apply_attendance_leave_balance(
  _employee_id uuid,
  _date date,
  _leave_type text,
  _delta numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM _date)::int;
  v_alloc numeric;
  v_used numeric;
  v_new numeric;
BEGIN
  IF _leave_type IS NULL OR _delta = 0 THEN RETURN; END IF;

  -- Lock (or create) the balance row to serialise concurrent edits
  SELECT allocated, used INTO v_alloc, v_used
    FROM public.leave_balances
   WHERE employee_id = _employee_id AND year = v_year AND leave_type = _leave_type
   FOR UPDATE;

  IF NOT FOUND THEN
    IF _delta < 0 THEN RETURN; END IF;
    INSERT INTO public.leave_balances (employee_id, year, leave_type, allocated, used)
    VALUES (_employee_id, v_year, _leave_type, 0, 0)
    ON CONFLICT (employee_id, year, leave_type) DO NOTHING;
    SELECT allocated, used INTO v_alloc, v_used
      FROM public.leave_balances
     WHERE employee_id = _employee_id AND year = v_year AND leave_type = _leave_type
     FOR UPDATE;
  END IF;

  v_new := GREATEST(0, round(coalesce(v_used, 0) + _delta, 2));

  IF _delta > 0 AND coalesce(v_alloc, 0) > 0 AND v_new > v_alloc THEN
    RAISE EXCEPTION 'Insufficient % balance: % of % day(s) already used',
      _leave_type, coalesce(v_used, 0), v_alloc;
  END IF;

  UPDATE public.leave_balances
     SET used = v_new, updated_at = now()
   WHERE employee_id = _employee_id AND year = v_year AND leave_type = _leave_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_attendance_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_type text;
  v_new_type text;
  v_old_units numeric;
  v_new_units numeric;
BEGIN
  -- Rows generated from an approved leave request are already reflected in the
  -- balances by the leave module; skip them to avoid double counting.
  IF coalesce(NEW.notes, '') LIKE '%[auto:leave%' THEN
    RETURN NEW;
  END IF;

  v_new_type := public.attendance_leave_type(NEW.status);
  v_new_units := CASE WHEN v_new_type IS NULL THEN 0
                      WHEN lower(coalesce(NEW.status,'')) = 'half_day' THEN 0.5
                      ELSE 1 END;

  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.notes, '') NOT LIKE '%[auto:leave%' THEN
      v_old_type := public.attendance_leave_type(OLD.status);
    END IF;
    v_old_units := CASE WHEN v_old_type IS NULL THEN 0 ELSE 1 END;

    IF v_old_type IS NOT DISTINCT FROM v_new_type THEN
      IF v_new_type IS NOT NULL AND v_new_units <> v_old_units THEN
        PERFORM public.apply_attendance_leave_balance(
          NEW.employee_id, NEW.date, v_new_type, v_new_units - v_old_units);
      END IF;
      RETURN NEW;
    END IF;

    IF v_old_type IS NOT NULL THEN
      PERFORM public.apply_attendance_leave_balance(
        OLD.employee_id, OLD.date, v_old_type, -v_old_units);
    END IF;
  END IF;

  IF v_new_type IS NOT NULL THEN
    PERFORM public.apply_attendance_leave_balance(
      NEW.employee_id, NEW.date, v_new_type, v_new_units);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_attendance_leave_balance ON public.attendance_logs;
CREATE TRIGGER trg_sync_attendance_leave_balance
AFTER INSERT OR UPDATE OF status, notes ON public.attendance_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_leave_balance();

-- Restore the day when a leave attendance row is deleted outright
CREATE OR REPLACE FUNCTION public.sync_attendance_leave_balance_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF coalesce(OLD.notes, '') LIKE '%[auto:leave%' THEN RETURN OLD; END IF;
  v_type := public.attendance_leave_type(OLD.status);
  IF v_type IS NOT NULL THEN
    PERFORM public.apply_attendance_leave_balance(OLD.employee_id, OLD.date, v_type, -1);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_attendance_leave_balance_del ON public.attendance_logs;
CREATE TRIGGER trg_sync_attendance_leave_balance_del
AFTER DELETE ON public.attendance_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_leave_balance_delete();