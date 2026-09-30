# Pipeline "Appointment Booked" without a real appointment

## Investigation findings (read-only, nothing changed)

**1. How many leads are affected?**

- Leads currently at stage "Appointment Booked": **313**
- Of those, **243** do have at least one appointment on record
- **70 leads sit at "Appointment Booked" with zero appointments** (all 70 are inside the Pipeline date window, i.e. all currently visible)

Matching rule used: a lead is linked to an appointment when a patient record shares the lead's phone number (last 10 digits) and that patient has an appointment row. This is exactly the rule the lead's Appointments tab uses.

Most recent examples (all owned by Shakin Saleem S):

| Lead | Phone | Created |
| --- | --- | --- |
| Yamuna | +91 90420 72654 | 07 Sep 2026 |
| K Karthikeyan | +91 90873 14424 | 07 Sep 2026 |
| vasudevan ramya | +91 96775 22639 | 07 Sep 2026 |
| Antony | +91 99439 43999 | 06 Sep 2026 |
| Bala Krishnan | +91 84895 13505 | 05 Sep 2026 |
| சுரேஷ் | +91 74187 59074 | 04 Sep 2026 |
| Sofia | +91 89402 82249 | 03 Sep 2026 |
| Lawrance Simon | +91 95668 15815 | 02 Sep 2026 |
| Sivasakthi | +91 99629 82943 | 01 Sep 2026 |
| kalaiarasan | +91 94869 09165 | 01 Sep 2026 |

(Yamuna confirmed: stage "Appointment Booked", no appointment record. A second, older "yamuna" lead exists at stage New Lead — unrelated.)

**2. Does the dropdown allow free manual selection? — Yes, confirmed.**

- In the lead detail panel, the Stage dropdown lists every stage including "Appointment Booked", and picking it saves immediately (auto-save, no confirmation, no appointment check).
- The same free move also exists on the Pipeline board/list row menu ("Move to → Appointment Booked").
- Booking through "Book Appointment" does create the appointment and set the stage — so that path is correct; the shortcut is the problem.

## Proposed fix (only after you approve)

1. **Block manual selection of "Appointment Booked"** in the lead detail Stage dropdown and in the Pipeline row "Move to" menu — the option is shown disabled with a hint: "Set automatically when you book an appointment".
2. **Keep an override for corrections.** If the user is an admin, the option stays selectable but shows a confirmation first: "This lead has no appointment on record — are you sure?" Confirming saves as today and the activity log notes it was a manual override.
3. **Allow leaving the stage freely.** Moving a lead *out* of "Appointment Booked" (e.g. to Reschedule or Lost) stays unrestricted.
4. **No data changes.** The 70 existing leads keep their current stage; nothing is bulk-edited or deleted.
5. Optionally, in the lead's Appointments tab, show a small warning line when the stage says booked but no appointment exists, with a "Book Appointment" button — so staff can fix it correctly.

## Technical notes

- Files touched: `src/components/pipeline/OpportunityDetail.tsx` (Stage `Select` + `handleStageChange` guard, appointment-presence check already available via `appointments` state) and `src/pages/Pipeline.tsx` (two "Move to" dropdown menus, stage id `booked`).
- Appointment presence for a lead is derived through `patients.phone` → `appointments.patient_id`; for the Pipeline row menu the guard simply blocks/confirms without a lookup (admin confirm covers correction).
- No changes to WhatsApp/messaging, dedupe, quota, or booking logic.
