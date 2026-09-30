# Plan: Guest/External Doctor & Assistant support in Offline Campaigns

Scope: ONLY the "Create Campaign" form dialog and the "Campaigns" tab table in `src/pages/OfflineCampaigns.tsx`, plus one minimal nullable-column migration on the `campaigns` table. No other tabs, pages, or routes touched.

## 1. Database migration (nullable fields only, no renames/drops)

New columns on `public.campaigns`, all nullable, no defaults needed:

- `doctor_type` text (`'clinic'` | `'guest'`)
- `guest_doctor_name` text
- `guest_doctor_contact` text
- `guest_doctor_specialization` text
- `assistant_type` text (`'clinic'` | `'guest'`)
- `guest_assistant_name` text
- `guest_assistant_contact` text
- `coordinator_contact` text

Migration presented for approval via the standard migration flow before code ships. Existing columns (`doctor_assigned`, `assistant_assigned`, `coordinator_assigned`) stay untouched — clinic selections continue writing to them.

## 2. "Create Campaign" / Edit form dialog (in OfflineCampaigns.tsx)

**Doctor section** — add a compact toggle above the current dropdown:
- Radio/toggle: "Clinic Doctor" | "Guest Doctor" (default: Clinic).
- Clinic → existing `doctor_assigned` dropdown unchanged.
- Guest → hide dropdown; show text inputs: Doctor Name (required if guest), Contact Number, Specialization (optional).

**Assistant section** — same pattern:
- Toggle: "Clinic Staff" | "External Assistant" (default: Clinic).
- Clinic Staff → existing `assistant_assigned` dropdown unchanged.
- External → text inputs: Assistant Name, Contact Number.

**Coordinator** — add optional "Camp Coordinator Contact Number" text input next to/below the existing Coordinator field.

Edit flow: when opening Edit, `doctor_type`/`assistant_type` prefill from the row (defaulting to `clinic` when null), so legacy campaigns open unchanged. The `...` menu logic itself is untouched — only the form state loading/saving gains the new fields.

## 3. Campaigns table (same tab, no layout changes)

- Keep the exact column order, row padding, and existing status badge colors from the current table (Campaign / Institution / Date / Participants / Est. Cost / Actual Cost / Doctor / Status / Actions).
- **Doctor cell**: shows the doctor name (`doctor_assigned` for clinic, `guest_doctor_name` for guest) with a small badge beside it — `Clinic` (blue `Badge`) or `Guest` (orange `Badge`). Badge omitted when no doctor set.
- **Assistant**: not added as a new table column (avoid overflow as instructed); the assistant info is shown compactly under the Doctor cell as secondary muted text with the same Clinic/Guest badge only if it fits cleanly — otherwise left to the Edit dialog only. (Default: keep table as-is, assistant visible in Edit dialog.)

## Technical details

- File edited: `src/pages/OfflineCampaigns.tsx` only (Campaign interface + camp form state defaults + dialog JSX for doctor/assistant/coordinator sections + table Doctor cell).
- `Campaign` interface extended with the 8 new nullable fields.
- New campaigns initialize `doctor_type: "clinic"`, `assistant_type: "clinic"` in the Create form defaults.
- Save path: insert/update payload gains the new fields; when type = clinic, guest fields are set to null (and vice versa) to avoid stale data.
- Status badge colors, checklist progress, leads badge, and the `...` Edit/Delete dropdown remain exactly as they are.
