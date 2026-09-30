# QR Registrations Auto-Appear in Screening Leads ("Registered" → Screened)

Minimal, additive changes only. No refactors, no other tabs or modules touched.

## 1. Database migration

- Add `screened boolean not null default false` to `screening_leads`.
- Backfill `screened = true` where `interested_in_visit = true` OR `converted_to_patient = true`. All other rows stay `false`.
- Update `camp_self_register()` to insert `screened = false` explicitly on every QR registration.
- Enable Realtime for the table (`ALTER PUBLICATION supabase_realtime ADD TABLE public.screening_leads`) so INSERT events reach the page.

Existing `interested_in_visit` / `converted_to_patient` / coupon logic is untouched.

## 2. "Registered" filter option

In the Screening Leads status dropdown, add one new option `Registered`. Its match rule: `screened === false && source === 'qr'`. The four existing options and their derived-status logic stay byte-identical — the new branch is added alongside them.

## 3. Doctor edit flow

In the existing `saveLead` handler (the pencil-icon Edit Lead form), when updating an existing lead and the payload has a doctor name, at least one treatment tag, or `interested_in_visit = true`, include `screened: true` in the same update call. No new button, no new handler.

## 4. Real-time list updates (Screening Leads tab only)

- One Supabase Realtime channel in a `useEffect` in `OfflineCampaigns.tsx`, subscribed to `postgres_changes` INSERT on `screening_leads`.
- On insert: prepend the new row to the existing `screeningLeads` state (skip if the id already exists, so no duplicates after a manual refresh). Existing filters keep applying as-is — a row that doesn't match the active filter simply won't be visible.
- Mark newly arrived ids in a small `Set` and give those rows a short CSS highlight that fades out (Tailwind transition + timeout to clear the mark). No new library.
- Clean up with `supabase.removeChannel(channel)` on unmount.

## Out of scope (explicitly unchanged)

`CampQRTab.tsx` "Registered" count, CEO Dashboard, Institutions, Campaigns, Coupons, Follow-ups, Analytics, Corporate, ROI tabs, and every other module.

## Technical notes

- Files: one migration, plus `src/pages/OfflineCampaigns.tsx` (filter option, save payload, realtime effect, row highlight class).
- The `ScreeningLead` type in that file gets `screened?: boolean` added.
- Realtime INSERTs are delivered subject to RLS on `screening_leads`, so only staff who can already read the rows will receive them.
