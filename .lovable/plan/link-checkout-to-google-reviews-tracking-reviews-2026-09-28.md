# Link Checkout to Google Reviews tracking (/reviews)

## What exists today (verified)
- Table `review_requests` already exists: `patient_id, patient_name, phone, sent_at, review_received, rating, review_text, review_platform, reviewed_at, created_at`. It holds 1,889 rows (919 patients); only 5 are marked received.
- Checkout already writes to it: in Clinic Workflow, when "Send review" is ticked, checkout inserts a `review_requests` row and sends the WhatsApp template `fl_checkout_google_review` (in the background, without waiting).
- Problems:
  - About 142 rows are repeats (same patient, same day), from checking out more than once.
  - The row is saved even if the WhatsApp message fails.
  - Nothing links a row to the appointment.
  - Nothing tracks whether the link was clicked.
- `/reviews` already counts from real data, but only on screen, from the rows it loads. The average rating also divides by the wrong number.

## 1. Database (additive only, reuses `review_requests`)
Add nullable columns. Existing rows stay untouched.
- `appointment_id uuid` (links the request to the visit)
- `status text default 'sent'`: `sent | failed | clicked | submitted`
- `source text default 'manual'`: `checkout | manual`
- `delivery_error text`, `clicked_at timestamptz`, `tracking_token uuid default gen_random_uuid()`
- Duplicate guard: a partial unique index on `(patient_id, appointment_id)` where `appointment_id is not null`. For checkouts with no appointment, the app checks for an existing checkout row for the same patient on the same day before inserting.
- Backfill: set `status = 'submitted'` where `review_received = true`, and `'sent'` otherwise. Leave the 142 old duplicates in place (no deletes). `/reviews` can hide them with a "unique per patient-day" view.
- No other tables change.

## 2. Checkout trigger (the only change in Clinic Workflow)
Only the existing "Auto-send Google review" block in the checkout handler changes. Payment, the quality steps, the appointment update and the reset logic stay exactly as they are.
- Replace the insert with an upsert keyed on appointment (or the same-day check), with `source = 'checkout'`.
- Wait for the WhatsApp send result. On failure, set `status = 'failed'` and save `delivery_error`. Checkout still completes, and the toast says honestly whether the message was sent.
- Checking out again for the same visit reuses the existing row. No second WhatsApp message is sent.

## 3. Click / submission tracking
- **Link Clicked:** a new public backend function `review-redirect?t=<token>`. It sets `clicked_at` and `status = 'clicked'`, then redirects to the Google review link in Clinic Settings.
  - Limitation: the approved Meta template has a fixed button URL. Per-patient click tracking needs the template changed to a dynamic URL button, which requires Meta re-approval.
  - Until then, "clicked" is recorded only for SMS or fallback text links.
- **Review Submitted:** Google gives no callback, so staff still confirm it on `/reviews` by clicking the star rating. This sets `status = 'submitted'`, `review_received`, `rating` and `reviewed_at`.

## 4. /reviews page
- Stat cards come from database counts (not only the loaded rows):
  - Requests Sent = rows with status other than failed
  - Reviews Received = submitted
  - Avg Rating = average of rating where submitted
  - Conversion = received / sent x 100
- Table columns: Patient Name, Phone, Date Sent, Source, Status badge (Sent / Failed / Link Clicked / Review Submitted), and Rating.
  - Existing star buttons stay for unsubmitted rows.
  - Adds pagination and a date filter.
- Manual "Send Review Request" also sends the real WhatsApp template and saves `source = 'manual'`.
- The page updates automatically when a new checkout sends a request.

## Out of scope
The Quality Control module, other workflow steps, billing/payment/appointment logic and the QC tables are not touched. Nothing is dropped or deleted.

## Technical notes
- Migration: `ALTER TABLE ADD COLUMN` statements plus a partial unique index. RLS and grants are unchanged (the table already has 4 policies).
- Stat counts use `count: 'exact', head: true` queries, plus one rating query for the average.
- The redirect function has `verify_jwt = false`, looks up the row by `tracking_token`, and uses the service role key.
