# Fix `can_register_patient` EXECUTE grant

## What happened
The last patients-table fix added a new RLS INSERT policy on `public.patients`:

```
"Booking staff can add patients" FOR INSERT
  TO authenticated
  WITH CHECK (can_register_patient(auth.uid()))
```

The helper function `public.can_register_patient(uuid)` correctly restricts registration to admin, duty_doctor, dental_assistant, receptionist, DRE, and telecaller. However, it was created without an `EXECUTE` grant for the `authenticated` role. Because RLS policies run with the privileges of the calling role, any signed-in user hitting that policy gets:

```
permission denied for function can_register_patient
```

This blocks the INSERT before the function's internal role check can even run.

## Evidence from the database
- `public.can_register_patient(uuid)` exists and is `SECURITY DEFINER`.
- Its ACL is:
  ```
  {postgres=X/postgres, service_role=X/postgres, sandbox_exec_kumtrpubuupvwgbwsqix=X/postgres}
  ```
  There is **no `authenticated=X/postgres`** entry.
- Comparable helpers used in RLS policies (`has_role`, `is_clinical_user`) **do** have `authenticated=X/postgres`, which is why those policies work.

## Fix
Add one migration with a single GRANT:

```sql
GRANT EXECUTE ON FUNCTION public.can_register_patient(uuid) TO authenticated;
```

No other permissions, policies, or role lists change. The function's internal logic still controls who may register a patient.

## Verification steps
1. After the migration, re-query `pg_proc.proacl` and confirm `authenticated=X/postgres` is present for `can_register_patient`.
2. End-to-end test: sign into the preview as **Shakin Saleem S (telecaller)** and attempt Book Appointment for a new lead/patient. Confirm the appointment is created without the permission error.
3. Regression check: sign in as a user who is **not** in the allowed role list (e.g. digital marketing manager) and confirm booking still correctly fails at the RLS level (not the function-execute level).

## Out of scope
- No changes to the "Appointment Booked" stage-guard dropdown (already working).
- No changes to WhatsApp/messaging, dedupe, quota, or Workflow Builder.
- No bulk edits to existing leads or appointments.
