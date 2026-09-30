# WhatsApp Message Count Audit — findings and fix plan

Read-only audit. Nothing was changed.

## 1. Source of truth

There is only **one** message store: `whatsapp_messages` (outbound rows have `direction = 'out'`). The dashboard's five cards each run a separate `count(exact)` on that one table for the selected date range — no union of multiple log tables, no double counting.

| Source | Rows | Range | Counted in dashboard |
| --- | --- | --- | --- |
| `whatsapp_messages` (out) | 24,089 | 09 Jul – 08 Sep 2026 | once, per status |
| `whatsapp_messages` (in) | 544 | 09 Jul – 08 Sep 2026 | once, as "Responses" |
| `whatsapp_campaigns` | separate; only used by the Account tab health card | — | not in the five cards |
| `workflow_runs` | audit log of workflow steps, no message counts | — | not counted |

Meta Cloud API is not queried for counts; the dashboard is entirely internal.

## 2. Why Sent ≠ Delivered + Failed

For 7 Sep (UTC) the database says: total out **2,657**, delivered+read **1,024**, read **730**, failed **1,586**. Your screenshot matches this exactly.

2,657 − 1,024 − 1,586 = **47** messages still sitting in intermediate statuses `sent` / `accepted` (Meta accepted them but never sent a delivery or failure webhook). So there is no aggregation bug here — the funnel simply does not add up because in-flight statuses are not shown on any card.

## 3. Per-source breakdown (all time, outbound)

| Source (`payload.request.source`) | Total | Delivered/Read | Failed | Range |
| --- | --- | --- | --- | --- |
| `workflow` (automation) | 22,422 | 4,598 | 17,474 | 31 Jul – 08 Sep |
| null (single send / older sends) | 1,655 | 997 | 625 | 09 Jul – 07 Sep |
| `single_send` | 8 | 3 | 4 | Aug |
| `camp_coupon_pdf` | 4 | 0 | 4 | 29 Aug |

**93% of all traffic comes from workflow automation**, and 78% of that fails.

## 4. Duplicate detection — the real problem

7 Sep: **2,657 messages to only 688 unique phone numbers** (3.9× duplication). 5 Sep: **4,561 messages to the same 688 numbers** (6.6×).

Hourly shape on 7 Sep: 07:00 → 1,307 msgs / 655 numbers; 09:00 → 653; 11:00 → 655. Three near-identical blasts of the same list, same template `fl_checkout_google_review`. Individual numbers received it 4–5 times within four hours.

**Root cause found in code:** `src/pages/WorkflowBuilder.tsx` → `backfillRuns()` (lines ~200–248), which runs automatically on every page open (`useEffect` → `handleSync`, line 346).

```
leads          .in(meta_form_id, activeForms).limit(2000)
workflow_runs  .select(...).limit(10000)   // <-- Data API hard-caps this at 1000 rows
```

`workflow_runs` currently holds far more than 1,000 rows in the window, so the "already processed" set is truncated to 1,000 — almost every lead looks unprocessed, and the page fires `workflow-execute` for up to 2,000 leads. Each visit to the Workflow Builder page re-sends the whole list. Three visits on 7 Sep = the three hourly blasts.

This is the same bug that was already fixed in the backend cron (`lead-sync-cron`, which now uses candidate-scoped paginated lookups and reported `workflows_fired: 0` on its last run). The frontend copy was never fixed. The cron is also bounded to 50 leads per run, so it cannot produce 655-message bursts — the page can.

## 5. Daily limit mismatch

`sentToday` on the Account tab is **not "today"** — it reuses the dashboard's date-range filter (`src/pages/WhatsAppAPI.tsx` line 5180, fed by the `whatsapp-sent-counters` query at line 2051). Pick Week/Month and the "Sent Today / 2,000" comparison silently compares a multi-day total against a one-day quota. Two further mismatches:

- The counters query filters `wa_message_id is not null`; the "Messages Sent" card does not — the two numbers can differ.
- Day boundaries use the browser's local time (IST) while the data is stored in UTC, so a 5½-hour slice always lands on the wrong side of a day edge.

Meta did not allow an overflow: the 2,657 figure is one UTC day of internal rows, and 1,586 of them were rejected — 1,336 with error **131049** (Meta throttling for ecosystem health), 208 with **131026** (not a WhatsApp user), 42 with **130472** (user in a Meta experiment). Those rejections are exactly what over-sending looks like.

## 6. Recommended fixes (not applied)

1. **Stop the duplicate blasts (critical).** Remove the automatic `backfillRuns()` on page open, and rewrite its dedupe to the candidate-scoped paginated approach already used in `lead-sync-cron`, with a hard per-run cap. Leave lead catch-up to the cron only.
2. **Add a real send-dedupe key.** Block a send when the same (phone, template) already has a successful outbound row inside a configurable window (e.g. 24h), checked inside `whatsapp-send-message` so every caller is covered.
3. **Fix the Account tab counters.** Compute "Sent Today" from an explicit UTC day window independent of the dashboard filter, and align the `wa_message_id` filter with the "Messages Sent" card. Relabel the card when a multi-day range is selected.
4. **Show the funnel gap.** Add a "Pending" figure (`sent` + `accepted`) so Sent = Delivered + Failed + Pending is visibly consistent.
5. **Optional cleanup.** 131026 numbers are already blacklisted; consider auto-pausing a workflow when its failure rate in a run exceeds a threshold.

Say which of these you want and I'll implement them.
