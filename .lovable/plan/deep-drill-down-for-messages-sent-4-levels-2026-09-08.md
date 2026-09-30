# Deep drill-down for "Messages Sent" (4 levels)

Goal: expand the shallow category popover into a nested breakdown
Category → Workflow/Campaign → Pipeline stage → Message type → Count,
with a running total that always ties back to the headline number.

## 1. What the send log actually stores today

Verified against the live database (last 40 days, 23,648 outbound rows).

Each outbound row in `whatsapp_messages` has: `id, thread_id, wa_message_id,
direction, text, payload, created_at, status, error_code, error_message,
sent_at, delivered_at, read_at`. Inside `payload.request` the only keys that
ever appear are: `messaging_product, to, type, source, template, text, image,
document, video`.

So today we can reliably derive:

- **Recipient phone** — `payload.request.to`
- **Template name** — `payload.request.template.name` (this is what the
  current category buckets are inferred from)
- **Coarse origin** — `payload.request.source`: `workflow` 22,111,
  `null` 892 (older/clinic sends), `single_send` 8, `camp_coupon_pdf` 4

What is **missing entirely** (never written, so 100% NULL):

| Needed for | Field | Status |
| --- | --- | --- |
| Level 2 workflow name/ID | `workflow_id`, `workflow_run_id` | missing |
| Level 2 campaign name/ID | `campaign_id` | missing (only `camp_coupon_pdf` hints) |
| Level 2 pipeline stage | `stage_from` / `stage_to` | missing |
| Level 3 appointment mapping | `appointment_id` | missing |
| Level 3 / dedupe | `lead_id`, `patient_id` | missing |
| Level 4 module attribution | `module` (clinic / marketing / bot / manual) | missing |

`workflow_runs` (`workflow_id, contact_name, contact_phone, step,
meta_lead_id, created_at`) is the only existing bridge, and it links only by
phone + rough timestamp — not by message ID.

## 2. Can every message be traced 1:1?

**Going forward: yes.** Every send funnels through the single edge function
`whatsapp-send-message`, so if callers pass context and the function persists
it, each row gets exact attribution.

**Historically: no.** For the 23k+ existing rows we can only infer:
workflow-vs-clinic from `source`, category from template name, and a
best-effort workflow match by phone+time against `workflow_runs`. Appointment
and pipeline-stage attribution for past rows is not recoverable. The plan
therefore shows full 4-level depth for messages sent **after** the change, and
degrades gracefully to "Unattributed" for older rows (clearly labelled, never
silently dropped, so totals still tie).

Remaining ambiguity even after the change: a lead who is also a patient can
appear under both a marketing workflow and a clinic send — those are genuinely
two different messages, so no double counting, but the same person appears in
two branches. The tree shows unique-recipient counts per node to make this
readable.

## 3. Proposed schema change

One migration on `whatsapp_messages`, all nullable, no backfill required:

```
send_context jsonb            -- raw context as passed by the caller
module text                   -- 'clinic' | 'marketing' | 'bot' | 'manual' | 'system'
workflow_id uuid              -- FK-free, references workflows.id
workflow_run_id uuid
campaign_id uuid
stage_from text
stage_to text
message_kind text             -- 'booking' | 'reminder' | 'reschedule' | 'cancellation' | 'followup' | 'checkin' | 'checkout' | 'prescription' | 'invoice' | 'review' | 'other'
appointment_id uuid
lead_id uuid
patient_id uuid
```

Plus indexes on `(created_at, module)`, `(created_at, workflow_id)`,
`(created_at, appointment_id)`.

RLS/grants: same policies as existing `whatsapp_messages` columns (no new
table, so no new grants needed).

`whatsapp-send-message` gains an optional `context` object on its request body
and writes those columns on insert; `message_kind` falls back to being derived
from the template name when the caller omits it, so nothing regresses. Callers
updated to pass context: workflow executor, campaign sender, clinic
check-in/check-out/prescription/invoice senders, appointment reminders, bot
auto-reply, manual single send.

## 4. UI

Replace the flat popover with a **drill-in sheet** (bottom sheet on mobile,
side sheet on desktop) instead of a 4-deep tree — a 4-level tree is unusable
at 485px wide.

- Header pinned: `Messages Sent — 2 / 2,000 quota (0.1%)` with the selected
  window, and a Clinic / Marketing / Bot / Manual split shown as a stacked bar
  with count + % of quota (Level 4).
- Body: one level at a time, breadcrumb at top. Tap a category row → workflow
  / campaign rows → pipeline stage rows → message-type rows. Each row shows
  count, unique recipients, and share of parent.
- Every level ends with a pinned footer `Subtotal = parent count`, so the
  numbers visibly reconcile at each step.
- On appointment branches, a "Duplicates" strip flags any appointment/lead
  with more than one message in the window (Level 3 early-warning).
- Desktop keeps the same sheet but shows the first two levels side by side.
- Existing popover stays as a quick glance with a "Full breakdown" link.

## 5. Performance

- Today's volume is ~1–3k rows/day; a month is ~25k. The current popover
  already pages 1,000 rows at a time up to 30,000 client-side — workable but
  wasteful.
- Plan: aggregate server-side with a `security definer` SQL function
  `whatsapp_send_breakdown(_from timestamptz, _to timestamptz)` returning
  grouped counts per (module, category, workflow_id, campaign_id, stage_to,
  message_kind) plus unique-recipient counts. One round trip, a few hundred
  rows for a full month, no client paging.
- The sheet is lazy: it only queries when opened, cached 60s.
- For ranges longer than 31 days the sheet asks to narrow, rather than
  streaming a huge aggregate.

## 6. Build order

1. Migration adding the attribution columns + indexes.
2. `whatsapp-send-message` accepts and persists `context`; derive
   `message_kind`/`module` fallbacks from template name and `source`.
3. Update all callers to pass real context.
4. SQL aggregate function for the breakdown.
5. New drill-in sheet component, wired to the "Messages Sent" card.
6. Verify totals tie: sheet grand total === "Messages Sent" card for Today,
   7-day and 30-day windows, including the "Unattributed" bucket.
