# WhatsApp Campaign — real audience from Patients and Leads

Wire the "Create WhatsApp Campaign" modal (WhatsApp API page → Campaigns tab) to real contacts, so the segment dropdown builds an actual audience and the recipient count is calculated instead of typed. This step saves the campaign as a draft with its audience — no messages are sent yet.

## What the user gets

1. **Real segments** in the Segment dropdown:
   - All Registered Patients (3,313 patients, 2,712 unique valid mobiles today)
   - All Pipeline Leads / Contacts (1,864 leads, 1,857 unique)
   - By Treatment Type — pick a treatment; matches patients via their treatment plan items and leads via their interested treatment
   - Inactive Patients (no visit in the last 6 months — 1,829 today)
   - Custom list (pre-seeded from Patient Database or Contacts, see below)
2. **Auto-calculated Recipients**, read-only, showing e.g. `Recipients: 2,712` plus a small line: `2,740 contacts · 21 invalid · 7 duplicates removed · 12 not on WhatsApp`.
3. **Approved template only** — the free-text message box becomes a read-only preview of the chosen approved template. Save is blocked without one.
4. **Daily cap awareness** — audiences over the 1,000/day tier limit show a warning: "1,712 contacts exceed today's 1,000-message limit; sending will need more than one day." Saving is still allowed (draft only).
5. **Send to WhatsApp Campaign** action on Patient Database and Contacts: select rows → button opens the campaign modal with those numbers as a Custom list.

## Deduplication and validity rules

Applied when the audience is built, in this order:
- Normalise each phone to digits, Indian numbers to `91XXXXXXXXXX` (reuses `normalizeWhatsAppPhone`).
- Drop blank / invalid-format numbers (existing `isValidWhatsAppFormat`).
- Deduplicate on the last 10 digits, so the same person from both patients and leads counts once.
- Drop numbers already flagged as not on WhatsApp (`whatsapp_blocked_numbers` and past error `131026`), reusing the existing checker in bulk.

## Technical notes

- Files changed: `src/pages/WhatsAppAPI.tsx` (campaign modal + audience logic), a new `src/lib/whatsappAudience.ts` (segment definitions, queries, dedupe), `src/pages/PatientDatabase.tsx` and `src/pages/Contacts.tsx` (selection + "Send to WhatsApp Campaign" action only).
- Audience queries page through Supabase in 1,000-row chunks (same pattern already used in Contacts/Pipeline) so nothing is silently truncated.
- Segment definitions:
  - patients: `patients.phone`
  - leads: `leads.phone`
  - treatment: `treatment_plans` → `treatment_plan_items.treatment_type` for patients; `leads.treatment_interest` for leads
  - inactive: patients with no `appointments.appointment_date` in the last 6 months
- Storage on `whatsapp_campaigns` uses existing columns only — `target_segment` holds a compact descriptor (e.g. `patients:all`, `treatment:Root Canal`, `custom:47`), `total_recipients` holds the computed count, `message_template` the approved template body. **No schema changes, no migrations.**
- Custom lists are handed over in memory (page state / navigation state), not persisted, so no new table is needed.
- Number checking is batched (200 per query) to keep the dedupe query count low.

## Explicitly out of scope

- No actual broadcast sending, queueing, or batching this round (draft only).
- No changes to `whatsapp-send-message`, the webhook, dedupe on the workflow side, the quota card, Workflow Builder, or the pipeline stage guard.
- No changes to how patients or leads are created, imported, or synced.
