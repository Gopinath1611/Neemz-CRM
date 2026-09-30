# Meta WhatsApp Templates — Audit Report

Doc Version: v1.0 · Generated: 2026-07-29 (UTC) · Mode: **Read-only** (no code / DB / template / env changes)

Scope: Meta-approved WhatsApp templates used by the Dental CRM, how they are stored, mapped to CRM triggers, assembled by the edge function, sent to Meta, and how delivery status is tracked.

Data sources: `src/lib/whatsappSender.ts`, `src/components/workflow/*`, `src/components/appointments/AppointmentForm.tsx`, `src/pages/ClinicWorkflow.tsx`, `src/pages/WhatsAppAPI.tsx`, all `supabase/functions/whatsapp-*` and `whatsapp-upsert-*` functions, DB tables `whatsapp_templates` / `whatsapp_messages` / `whatsapp_threads`, and one live `whatsapp-send-message` log capture.

---

## 1. Approved Templates List

Rows below combine the registry (`TEMPLATE_REGISTRY` in `src/lib/whatsappSender.ts`), the `whatsapp_templates` DB rows, and the `whatsapp-upsert-*` edge functions (source of truth for Meta spec).

| Internal Key (registry) | Meta Template Name | Language | Category | DB Status | Header | Body Params | Footer | Buttons | URL Var | Upsert Fn |
|---|---|---|---|---|---|---|---|---|---|---|
| `welcome` | `drneemz_welcome` | en | MARKETING | APPROVED | IMAGE (stored `header_media_url`) | 1 | — | — | — | (external) |
| `appointment_confirmation` | `appointment_confirmation` | en | (unset in DB) | (null) | none | (unknown) | — | — | — | — |
| `appointment_booking_confirmation` | `app_booking_confirm_v2` | en | UTILITY | (null) | TEXT `Appointment Booked!` (0 vars) | 5 | Smile Confident With Roots | PHONE `Call Now` +917448560350; URL `Get Location` (static maps URL) | none | `whatsapp-upsert-app-booking-confirm` |
| `patient_welcome_flex` | `fl_checkin_welcome` | en_US | (unset) | (null) | none | 3 (strict) | — | — | — | — |
| `payment_invoice` | `fl_invoice_ready` | en | UTILITY | (null) | TEXT `Invoice Generated` | 4 | Smile Confident With Roots | URL `Download Invoice PDF` → `patient-doc/{{1}}` | `{{1}}` = invoice doc token | `whatsapp-upsert-fl-invoice-ready-fl` |
| `prescription_share` | `fl_prescription_ready` | en | UTILITY | (null) | TEXT `Prescription Ready` | 3 | Smile Confident With Roots | URL `Download Prescription PDF` → `patient-doc/{{1}}` | `{{1}}` = prescription doc token | `whatsapp-upsert-fl-prescription-download-fl` |
| `diagnostic_order` | `patient_lab_referral` | en_US | (unset) | (null) | none | 5 (strict via `patient_lab_referral`) | — | — | — | — |
| `google_review_request` | `fl_checkout_google_review` | en | MARKETING | (null) | TEXT `Thank You for Visiting` | 1 | Smile Confident With Roots | URL `Google Review` (static Google review URL); PHONE `Call Now` +917448560350 | none (static) | `whatsapp-upsert-google-review-request` |
| — (create-only, not in registry) | `inv_down_v2` | en_US | UTILITY | (null) | none | 4 | Smile Confident with Roots | URL `Download Invoice` → `patient-doc/{{1}}` | `{{1}}` = invoice token | `whatsapp-upsert-inv-down-v2` |
| — (legacy, not in registry) | `invoice_sharing` | en_US | UTILITY | (spec only) | none | 4 | Smile Confident with Roots | URL `Download Invoice`, PHONE `Call Clinic` | `{{1}}` | `whatsapp-upsert-invoice-template` |
| — (legacy, not in registry) | `prescription_download_v3` | en_US | UTILITY | (in DB row) | none | 1 | Smile Confident with Roots | URL `Download Prescription` → `patient-doc/{{1}}` | `{{1}}` | `whatsapp-upsert-prescription-template` |
| — (legacy, not in registry) | `appointment_booking_confirmation` | en | UTILITY | (in DB row) | IMAGE (or TEXT fallback) | 5 | Smile Confident with Roots | URL `View Location`, PHONE `Call Now`, URL `Visit Website` | none | `whatsapp-upsert-appointment-template` |
| Marketing (DB-only) | `grandma_dental_implant`, `men_dental_implant`, `implant_treatment`, `invisaligner_treatment` | en | MARKETING | APPROVED | IMAGE (`header_media_url`) | 1 | — | — | — | — |
| DB rows without spec | `app_booking_confirm`, `appointment_booking_confirm`, `checkout_v3`, `google_review_checkout`, `google_review_request`, `patient_birthday_wish` | mixed | (null) | (null) | unknown | unknown | — | — | — | — |

Notes:
- DB `whatsapp_templates` has only 7 columns (`id, name, status, category, language, body, header_media_url`). Header format, footer, buttons and URL patterns are **not** persisted in DB — the source of truth is (a) the upsert edge functions in this repo and (b) Meta itself (fetched live by `whatsapp-send-message` before every send).
- Only 5 rows have a non-null `status` in DB (all APPROVED, all marketing). Everything else has `status: null` in DB — approval status is resolved live from Meta at send time.

---

## 2. Database Storage Structure

Tables (columns / types verified via `information_schema`):

- `whatsapp_templates` — `id uuid, name text, status text, category text, language text, body text, header_media_url text, created_at, updated_at`.
  - Populated by `sync-whatsapp-templates` / `whatsapp-templates-sync` / `whatsapp-list-templates` off Meta.
  - `header_media_url` is used by `whatsapp-send-message` when a header of format IMAGE/VIDEO/DOCUMENT is required and the caller did not pass `headerImageUrl/Video/Document`.
  - No `is_active` column — presence of row + Meta-side APPROVED status is the effective active flag.
- `whatsapp_messages` — outbound + inbound message log: `id, thread_id, wa_message_id, direction, text, payload jsonb, received_at, created_at, status, status_updated_at, error jsonb, is_read`. `payload.request.source` distinguishes `single_send` vs workflow-driven sends.
- `whatsapp_threads` — `id, wa_phone (unique), display_name, last_message, last_message_at, unread_count, created_at, updated_at, deleted_at`.
- `whatsapp_campaigns` — `id, name, message_template, campaign_type, target_segment, total_recipients, sent_count, delivered_count, read_count, response_count, status, scheduled_at, sent_at, created_at`.

Representative DB rows (redacted):
```
name=drneemz_welcome, status=APPROVED, category=MARKETING, language=en,
header_media_url=https://…/clinic-assets/whatsapp/drneemz-welcome.jpg, body=null
name=fl_invoice_ready, status=null, category=null, language=en, header_media_url=null, body=null
name=grandma_dental_implant, status=APPROVED, category=MARKETING, language=en,
body="Dear {{1}}, Dental Implant treatment …", header_media_url=https://…/grandma-dental-implant.png
```

---

## 3. Variable Mapping

Per template (from caller code + upsert BODY_TEXT):

- `app_booking_confirm_v2` (5 vars, TEXT header, no header vars): `{{1}}=Patient`, `{{2}}=Date`, `{{3}}=Time`, `{{4}}=Treatment`, `{{5}}=Doctor`. Callers: `AppointmentForm.tsx:573/884/1143`, `BookAppointmentStep.tsx:243`.
- `fl_checkin_welcome` (3 vars): `{{1}}=First name`, `{{2}}=?`, `{{3}}=?` (BODY not in DB — verified only by `STRICT_BODY_PARAM_COUNTS=3`). Callers: `AppointmentForm.tsx:571`, `ClinicWorkflow.tsx:3494`.
- `fl_invoice_ready` (4 vars + URL button `{{1}}`): `{{1}}=Patient`, `{{2}}=Treatment (dental-only, "Dental Treatment" fallback)`, `{{3}}=Amount (₹…)`, `{{4}}=Invoice No`. Button `{{1}}=invoicePdfPath (patient-doc token)`. Callers: `PaymentStep.tsx:749`, `BillingDetailDialog.tsx:639`.
- `fl_prescription_ready` (3 vars + URL button `{{1}}`): `{{1}}=Patient`, `{{2}}=Doctor (no "Dr" prefix)`, `{{3}}=Date`. Button `{{1}}=prescriptionPdfPath`. Caller: `PaymentStep.tsx:805`.
- `fl_checkout_google_review` (1 var, static URL button): `{{1}}=First name`. Caller: `ClinicWorkflow.tsx:3003`.
- `patient_lab_referral` (5 vars): `{{1}}=Patient`, `{{2}}=Category`, `{{3}}=Partner (lab/scan center)`, `{{4}}=Tests list`, `{{5}}=Clinic name`. Caller: `DiagnosticsStep.tsx:316`.
- `drneemz_welcome` — 1 body var + IMAGE header served from `header_media_url`.
- `treatment_document` — registered key but binding commented out; caller (`TreatmentSummary.tsx:281`) falls through to wa.me fallback.
- `appointment_confirmation` — registered but no upsert function tracked in-repo; body param count unknown from repo.

Static values inside body/footer/buttons (never dynamic): clinic name "Dr Neemz Dentistry Pvt Ltd", footer "Smile Confident With Roots" / "Smile Confident with Roots" (case inconsistency across templates), clinic phone `+917448560350`, static Google Maps URL, static Google review URL.

---

## 4. URL Button Audit

| Template | Button Text | Base URL | Dynamic Portion | URL Var Index | Runtime Source |
|---|---|---|---|---|---|
| `fl_invoice_ready` | Download Invoice PDF | `https://<project-ref>.supabase.co/functions/v1/patient-doc/` | `{{1}}` | 0 | `invoicePdfPath` from `PaymentStep`/`BillingDetailDialog` (patient-doc token, edge function `patient-doc`) |
| `fl_prescription_ready` | Download Prescription PDF | `.../patient-doc/` | `{{1}}` | 0 | `prescriptionPdfPath` from `PaymentStep` |
| `inv_down_v2` | Download Invoice | `.../patient-doc/` | `{{1}}` | 0 | Not called from registry (spec-only) |
| `invoice_sharing` | Download Invoice | `.../patient-doc/` | `{{1}}` | 0 | Legacy; not called from registry |
| `prescription_download_v3` | Download Prescription | `.../patient-doc/` | `{{1}}` | 0 | Legacy; not called from registry |
| `app_booking_confirm_v2` | Get Location | `https://maps.google.com/?cid=2181232041685824549` | none (static) | — | — |
| `fl_checkout_google_review` | Google Review | `https://search.google.com/local/writereview?placeid=…` | none | — | — |
| `appointment_booking_confirmation` (legacy) | View Location / Visit Website | Static Google Maps & `drneemz.com` | none | — | — |

All dynamic URL button parameters are supplied via `buttonUrlParams: [<token>]` and forwarded as `sub_type=url, index=0, parameters=[{type:"text", text:<token>}]` by `whatsapp-send-message`.

---

## 5. CRM Mapping

| Module / Screen | Internal Key | Meta Name | Trigger Event | Edge Function | Payload Builder |
|---|---|---|---|---|---|
| Check-in (Clinic Workflow) | `patient_welcome_flex` | `fl_checkin_welcome` | Patient check-in / re-checkin | `whatsapp-send-message` | `ClinicWorkflow.tsx:3494` |
| Appointment scheduler | `appointment_booking_confirmation` | `app_booking_confirm_v2` | Appointment created/edited | `whatsapp-send-message` | `AppointmentForm.tsx:573/884/1143`, `BookAppointmentStep.tsx:243` |
| Onboarding (from Appt form) | `patient_welcome_flex` | `fl_checkin_welcome` | New patient created via appointment | `whatsapp-send-message` | `AppointmentForm.tsx:571` |
| Diagnostics (X-Ray / Blood) | `diagnostic_order` | `patient_lab_referral` | Diagnostic order raised | `whatsapp-send-message` | `DiagnosticsStep.tsx:316` |
| Billing / Payment step | `payment_invoice` | `fl_invoice_ready` | Invoice generated & shared | `whatsapp-send-message` | `PaymentStep.tsx:749`, `BillingDetailDialog.tsx:639` |
| Prescription (Payment/Checkout) | `prescription_share` | `fl_prescription_ready` | Prescription generated | `whatsapp-send-message` | `PaymentStep.tsx:805` |
| Checkout — Google review | `google_review_request` | `fl_checkout_google_review` | Patient checkout complete | `whatsapp-send-message` | `ClinicWorkflow.tsx:3003` |
| Treatment Summary | `treatment_document` | (unbound) | Treatment plan share | wa.me fallback | `TreatmentSummary.tsx:281` |
| WhatsApp module — Single Send / Quick Campaign | (any approved template) | Meta list | Manual send | `whatsapp-send-message` (`source:"single_send"`) | `WhatsAppAPI.tsx` |
| Workflow Editor — WhatsApp Message action | (selected at runtime) | Meta list | Workflow node execution | `whatsapp-send-message` | `WorkflowEditor.tsx` |

---

## 6. Automation Mapping

Trigger event → template fired:

- Patient Registration (from Appointment form) → `fl_checkin_welcome` (`AppointmentForm.tsx:571`).
- Appointment Booking → `app_booking_confirm_v2` (`AppointmentForm.tsx:884` reschedule; `:1143` new; `BookAppointmentStep.tsx:243` workflow).
- Check-in / Re-checkin (workflow) → `fl_checkin_welcome` (`ClinicWorkflow.tsx:3494`).
- Diagnostic Order raised → `patient_lab_referral` (`DiagnosticsStep.tsx:319`).
- Billing / Invoice generated → `fl_invoice_ready` (`PaymentStep.tsx:746`, `BillingDetailDialog.tsx:635`).
- Prescription generated → `fl_prescription_ready` (`PaymentStep.tsx:801`).
- Checkout / Google Review request → `fl_checkout_google_review` (`ClinicWorkflow.tsx:3000`).
- Treatment Completion / Doc share → falls back to `wa.me` (no template bound).
- Meta Lead Webhook → `meta-lead-webhook` (does **not** send WhatsApp; only updates workflow counters).
- Workflow WhatsApp Node → runtime-selected template via `WorkflowEditor.tsx`.

No scheduled/cron job sends WhatsApp today; every send is user-initiated or workflow-node driven.

---

## 7. Edge Function Mapping

| Function | Purpose | Templates Touched | Notable Builders |
|---|---|---|---|
| `whatsapp-send-message` | Outbound send (template / text / media). Live-fetches Meta template, resolves language (exact → DB hint → base language → first approved), validates body/header/button counts, assembles Meta payload. | ALL approved templates | `strictBodyParamCounts` map, header component builder (TEXT/IMAGE/VIDEO/DOCUMENT), URL button param assembly (`sub_type:url, index, parameters`), maps error codes 131026/132001/131042 to friendly text |
| `whatsapp-create-template` | Generic template creation to Meta | Ad-hoc | Body components + optional TEXT header + optional footer + example values |
| `whatsapp-list-templates` | List templates from Meta | All | Also stores/syncs `name/language` back to DB on send-time resolution |
| `whatsapp-templates-sync`, `sync-whatsapp-templates` | Bulk sync Meta → `whatsapp_templates` | All | Persists status/category/language/body/header_media_url |
| `whatsapp-upsert-app-booking-confirm` | Create/update `app_booking_confirm_v2` on Meta | 1 | HEADER TEXT + BODY(5) + FOOTER + BUTTONS(PHONE, URL static) |
| `whatsapp-upsert-fl-invoice-ready-fl` | Create/update `fl_invoice_ready` | 1 | HEADER TEXT + BODY(4) + FOOTER + BUTTONS(URL `patient-doc/{{1}}`) |
| `whatsapp-upsert-fl-prescription-download-fl` | Create/update `fl_prescription_ready` | 1 | HEADER TEXT + BODY(3) + FOOTER + BUTTONS(URL `patient-doc/{{1}}`) |
| `whatsapp-upsert-google-review-request` | Create/update `fl_checkout_google_review` | 1 | HEADER TEXT + BODY(1) + FOOTER + BUTTONS(URL static + PHONE) |
| `whatsapp-upsert-inv-down-v2` | Create/update `inv_down_v2` | 1 | No header + BODY(4) + FOOTER + BUTTONS(URL `patient-doc/{{1}}`) |
| `whatsapp-upsert-appointment-template` | Create/update legacy `appointment_booking_confirmation` | 1 | HEADER IMAGE/TEXT + BODY(5) + FOOTER + BUTTONS(URL, PHONE, URL) |
| `whatsapp-upsert-invoice-template` | Create/update legacy `invoice_sharing` | 1 | BODY(4) + FOOTER + BUTTONS(URL, PHONE) |
| `whatsapp-upsert-prescription-template` | Create/update legacy `prescription_download_v3` | 1 | BODY(1) + FOOTER + BUTTONS(URL) |
| `whatsapp-delete-template` | Delete on Meta | — | — |
| `whatsapp-webhook` | Inbound + status callbacks (verify_jwt=false) | — | Updates `whatsapp_messages.status`/`error` by `wa_message_id`; resolves media URL via Graph; upserts `whatsapp_threads` |
| `whatsapp-media` | Proxy media by `media_id` to browser | — | — |
| `whatsapp-diagnostic`, `whatsapp-token-audit`, `whatsapp-live-insights` | Support / dashboards | — | — |

Auth model: all outbound functions require Supabase auth (`verify_jwt=true`); WABA id + access token resolved from `connected_apps` (`platform=WhatsApp Business API/API`), falling back to env `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_BUSINESS_ACCOUNT_ID`. Phone number id defaults to `777081605497413`.

---

## 8. Payload Structure

General shape sent to Meta (`POST https://graph.facebook.com/v23.0/{phoneNumberId}/messages`):

```json
{
  "messaging_product": "whatsapp",
  "to": "<E.164 without '+'>",
  "type": "template",
  "template": {
    "name": "<resolvedTemplateName>",
    "language": { "code": "<resolvedLanguage>" },
    "components": [
      { "type": "header",  "parameters": [ ... ] },
      { "type": "body",    "parameters": [ { "type": "text", "text": "..." }, ... ] },
      { "type": "button",  "sub_type": "url", "index": "0", "parameters": [ { "type": "text", "text": "<token>" } ] }
    ]
  }
}
```

Live capture (2026-07-29 06:35 UTC, `app_booking_confirm_v2`):
```json
{"messaging_product":"whatsapp","to":"91XXXXXXXXXX","type":"template",
 "template":{"name":"app_booking_confirm_v2","language":{"code":"en"},
  "components":[{"type":"body","parameters":[
   {"type":"text","text":"Sekar"},{"type":"text","text":"30 Jul 2026"},
   {"type":"text","text":"10:00 AM"},{"type":"text","text":"Consultation"},
   {"type":"text","text":"Dr.Vithyas Sree"}]}]}}
```
Edge log confirmed `expectedBodyParams=5, suppliedBodyParams=5, urlButtonIndexes=[]` — PASS.

Per-template expected payload:

- `fl_invoice_ready` — components: BODY(4 text params) + BUTTON sub_type=url index=0 params=[{invoiceToken}]. No header params (TEXT header has 0 vars).
- `fl_prescription_ready` — components: BODY(3) + BUTTON url index=0 params=[{prescriptionToken}]. No header params.
- `app_booking_confirm_v2` — components: BODY(5). No header params. Buttons are static (PHONE + static URL) → no `button` component in outbound.
- `fl_checkout_google_review` — components: BODY(1). No header params. Buttons static → no `button` component.
- `fl_checkin_welcome` — components: BODY(3). No header, no buttons.
- `patient_lab_referral` — components: BODY(5). No header, no buttons.
- `drneemz_welcome` — components: HEADER(image with `link: header_media_url`) + BODY(1).

`whatsapp-send-message` validates before sending:
- Header format vs supplied `headerParams`/`headerImageUrl`/`headerVideoUrl`/`headerDocumentUrl` (+ DB `header_media_url` fallback).
- Body param count equals template vars, or `strictBodyParamCounts[name]` if listed.
- URL button param count equals the number of URL vars in the button component.

Registry vs edge strict counts — both files agree on: `app_booking_confirm_v2=5`, `fl_invoice_ready=4`, `fl_prescription_ready=3`, `fl_checkin_welcome=3` (registry only), `fl_checkout_google_review=1` (registry only), `patient_lab_referral=5` (registry only), `prescription_download_v3=1`, `inv_down_v2=4`, `invoice_sharing=4`.

---

## 9. Delivery Tracking

- **Message id storage** — `whatsapp_messages.wa_message_id` written by `whatsapp-send-message` on success (`sendJson.messages[0].id`).
- **Status states observed in DB** (`SELECT status, COUNT(*)`): `read: 296, failed: 73, delivered: 35, null: 32, accepted: 5, sent: 2`.
- **Status update flow** — Meta → `POST /whatsapp-webhook` (JWT off) → for each `statuses[]`, `UPDATE whatsapp_messages SET status=<sent|delivered|read|failed>, status_updated_at=now(), error=st.errors WHERE wa_message_id=st.id`.
- **Error surfacing** — `error` jsonb stores Meta error array. Frontend (`WhatsAppAPI.tsx`) maps codes 131026 (undeliverable), 132001 (template param/language mismatch), 131042 (business config) to tooltips. Single-Send dashboard filters by `payload.request.source = 'single_send'`.
- **Inbound** — messages persisted with `direction:"in"`, thread upserted by `wa_phone`; unread counter increments; media resolved via Graph and served through `whatsapp-media`.
- **Webhook verification** — GET path checks `hub.verify_token` against env `WHATSAPP_VERIFY_TOKEN`.

---

## 10. Observations (no fixes applied)

The following are read-only findings. Nothing was modified.

1. `whatsapp_templates` table stores only 7 columns. Header format, footer text, buttons, URL patterns, and body-var counts are **not** persisted. Every send round-trips Meta to fetch components live. Latency and reliability depend on Meta availability.
2. Most non-marketing rows in `whatsapp_templates` have `status=null, category=null, body=null` — the sync path clearly does not upsert full Meta components. Approval status is effectively re-derived at send time by `whatsapp-send-message`.
3. Registry (`src/lib/whatsappSender.ts`) references `treatment_document` and `google_review_request` as internal keys, but the binding for `treatment_document` is commented out and `google_review_request` is bound to Meta name `fl_checkout_google_review`. The DB also has a stale row named `google_review_request` that is not used by any caller.
4. Registry entry `appointment_confirmation` points to a Meta template of the same name that is not present in DB and has no `whatsapp-upsert-*` function in this repo. Its body param count is unknown to the local `STRICT_BODY_PARAM_COUNTS` map.
5. Footer text is inconsistent across upsert functions: `Smile Confident With Roots` (invoice-ready-fl, prescription-download-fl, app-booking-confirm, google-review) vs `Smile Confident with Roots` (inv-down-v2, invoice-sharing, prescription-download-v3, appointment-booking-confirmation). Both are approved by Meta but present as different visual text.
6. Legacy vs current templates coexist: `invoice_sharing`/`inv_down_v2` vs `fl_invoice_ready`; `prescription_download_v3` vs `fl_prescription_ready`; `appointment_booking_confirmation` vs `app_booking_confirm_v2`. Only the `fl_*` and `app_booking_confirm_v2` variants are wired to callers via the registry.
7. Registry entry `patient_welcome_flex → fl_checkin_welcome` requires 3 body params (`STRICT_BODY_PARAM_COUNTS.fl_checkin_welcome=3`), but callers at `AppointmentForm.tsx:571` and `ClinicWorkflow.tsx:3494` — parameter contents are worth re-verifying against the Meta-approved body text, which is not stored locally.
8. Legacy edge function `whatsapp-create-template` uses Graph `v22.0`; all other edge functions use `v23.0`.
9. Redundant sync functions exist: `whatsapp-list-templates`, `whatsapp-templates-sync`, `sync-whatsapp-templates`. Each writes to `whatsapp_templates` with slightly different column coverage — no single source of truth for the DB shape.
10. No template covers the "Treatment Completion" event referenced in the audit brief — `TreatmentSummary.tsx:281` currently falls back to a wa.me link.
11. DB rows `app_booking_confirm`, `appointment_booking_confirm`, `checkout_v3`, `google_review_checkout`, `patient_birthday_wish` exist with all null metadata columns and no callers reference them.

### Recommended follow-ups (bullets only — not executed)

- Persist full component structure (header format/text, footer, buttons, URL patterns, body param count) into `whatsapp_templates` so `whatsapp-send-message` can skip the Meta round-trip for validation.
- Unify footer casing across upsert functions.
- Retire legacy templates (`appointment_booking_confirmation`, `invoice_sharing`, `prescription_download_v3`, `inv_down_v2`) or drop their upsert functions to reduce drift.
- Add a treatment-completion template and bind `treatment_document`.
- Collapse the three sync edge functions into one canonical syncer.
- Add a body param map keyed by Meta template name that documents the meaning of each `{{n}}` (invaluable when a template is re-approved with reordered variables).

_This document is read-only. No files, DB rows, edge functions, or Meta templates were changed._
