# Patients table access blocking appointment booking — findings

## 1. What the rule on the patients table currently says

The patients table has four access rules:

| Action | Who is allowed |
|---|---|
| View | any signed-in staff |
| Add new patient | "clinical staff" only |
| Edit patient | "clinical staff" only |
| Delete patient | admin only |

"Clinical staff" is a fixed list: **admin, duty doctor, dental assistant, receptionist, DRE**. Nothing about branch or ownership is checked — it is purely a role list.

## 2. Why it fails for Shakin Saleem S

Shakin's account (shahin_s@drneemz.com) has exactly one role: **telecaller**. Telecaller is not in the clinical-staff list, so the moment the booking form tries to create a new patient record, the database refuses it — hence "new row violates row-level security policy for table 'patients'".

Note: appointments themselves are wide open to any signed-in staff, and the check-in record has the same clinical-only restriction as patients. So a telecaller can book for an *existing* patient but cannot create a *new* one.

## 3. Who else is affected

Anyone whose roles are outside the clinical list. On the current staff list that is:

- Shakin Saleem S — telecaller
- Janani B — telecaller
- Sameswaran S — digital marketing manager
- Sudha M — digital marketing executive
- 2 accounts with no role at all (ksarjun895@gmail.com, meiyarasu_s@drneemz.com) — these are blocked from almost everything

Receptionists, dental assistants, doctors, DRE and admins are unaffected — booking works for them today.

## 4. Link to the "Appointment Booked with no appointment" mismatch

Consistent with it, though not proven for every case. Today 68 leads sit at stage "Appointment Booked" with no matching appointment on record. The telecallers are exactly the people who work the pipeline and move leads to that stage, and they are exactly the people the database blocks from creating a patient. So "booking failed → set the stage by hand" is a very plausible cause. What I cannot confirm from data: only one of those leads carries an assignee name (Shakin Saleem S), the other 313 booked leads have no assignee recorded, so there is no audit trail tying each mismatch to a failed booking.

## Proposed fix (for your approval)

1. Add a "can register a patient" rule that includes the roles who legitimately book: **admin, duty doctor, dental assistant, receptionist, DRE (all current) + telecaller + digital marketing executive/manager**. Please confirm this list — my recommendation is to add **telecaller** only, since marketing staff don't normally sit at the front desk. Say the word if you want marketing included too.
2. Keep it a role list, not open access: view/edit/delete rules stay exactly as they are, and no unrestricted access is added. Branch scoping is not possible today because patient records carry no branch, so adding it would be a separate piece of work — flag if you want it.
3. Make the booking form show a clear message ("your role can't register new patients — ask reception") instead of the raw database error, so nobody silently works around it again.
4. Leave the 68 mismatched leads untouched, and leave the stage-change guard and WhatsApp modules untouched.

### Technical detail

- Blocking rule: `"Clinical staff can add patients"` INSERT policy with check `is_clinical_user(auth.uid())`; that helper covers admin, duty_doctor, dental_assistant, receptionist, dre.
- Fix would add a dedicated INSERT policy (or a new `can_register_patient(uuid)` security-definer helper) listing the approved roles, leaving `is_clinical_user` unchanged so other tables' behaviour is not affected.
- `patient_checkins` INSERT is also `is_clinical_user` — if telecallers should also check patients in, that table needs the same treatment; otherwise leave it.
