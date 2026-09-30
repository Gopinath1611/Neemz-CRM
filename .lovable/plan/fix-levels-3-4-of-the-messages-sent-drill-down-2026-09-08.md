# Fix Levels 3 & 4 of the "Messages Sent" drill-down

Scope: the drill-down panel and the read-only aggregate behind it. No change to
sending, dedupe, quota or the Workflow Builder.

## Bug 1 — Level 3 counts a message that Level 4 does not list

Confirmed by reading both sides. Level 3 comes from the aggregate
`whatsapp_send_breakdown`; Level 4 runs a separate hand-written table query.
The two use different rules, so rows can be counted and not listed:

| Level 3 (aggregate) | Level 4 (row list) | Effect |
| --- | --- | --- |
| includes rows whose direction is not "in" (includes empty direction) | requires direction exactly "out" | messages with no direction saved are counted, never listed |
| derives the area (clinic / marketing / manual) from the old sender label when the column is empty | filters on the stored column, or requires it to be empty | derived rows vanish |
| derives the message type from the template name when the column is empty | filters on the stored column | same |
| accepts a workflow recovered from the execution log | filters on the stored workflow column only | log-matched groups list nothing |
| groups the whole window | lists only the latest 300, then filters by template in the browser | template rows drop out of the 300 window |

`fl_checkout_google_review` hits several of these at once (stored area/type
empty, workflow recovered from the log), which is why it shows 1 delivered and
"No messages found."

**Fix:** add a read-only database function `whatsapp_send_messages(...)` that
reuses the *same* CTE logic as `whatsapp_send_breakdown` and returns the
individual rows for one Level 3 group (area, template, message type, stage,
workflow, campaign). Level 4 calls that instead of building its own query, so
by construction it lists exactly the rows Level 3 counted. Paging is on the
function (500 per page with a "show more"), and the panel shows
`listed X of Y counted` so any gap is visible instead of silent.

## Bug 2 — new sends look "Estimated"

Two separate causes.

1. Panel logic: a Level 2 group's "Estimated / Matched from execution log" tag
   is taken from the *first* row in the group. A workflow that has both older
   log-matched messages and new directly-attributed ones therefore shows the
   whole group as estimated. Fix: count matched vs directly-attributed rows per
   group and tag only what is actually matched — a group with any direct rows
   reads "Attributed at send time", and a mixed group reads
   e.g. "1,102 attributed · 4 recovered from log". Levels 3 and 4 get the same
   per-row treatment, so a fresh message is never labelled estimated.
2. Data check first: in the last 3 days, all 2,681 automation messages still
   have no workflow stored — the last automation send was 00:00 today, before
   the attribution change went out. Before changing the panel I will fire one
   controlled workflow send and confirm the stored workflow, run, stage and
   context are written; if anything is missing, I fix the recording in the
   workflow runner (recording only — no change to whether or to whom anything
   is sent). Once stored attribution is present, the log-matching path is
   skipped for those rows automatically.

## Enhancement — recipient identity at Level 4

Each Level 4 row gains the recipient's name above the phone number, resolved
the way the Inbox does it: the contact name on the message thread, then the
linked lead or patient name, falling back to the phone number alone when no
name is known. Name and phone come back from the new row function in the same
round trip. No change to Level 1–3 grouping.

## Order of work

1. Verify send-time attribution on a live send (Bug 2, data side).
2. Add `whatsapp_send_messages` and repoint Level 4 to it (Bug 1).
3. Verify tie-out: for Today, 7-day and 30-day windows, every Level 3 row's
   count equals the number of rows the function returns — including
   `fl_checkout_google_review` and the Unattributed branch.
4. Fix the estimated/matched tagging per group and per row (Bug 2, UI side).
5. Add recipient name + phone to Level 4, then re-verify step 3.

## Technical notes

- New function: `whatsapp_send_messages(_from, _to, _module, _category,
  _template, _kind, _stage, _workflow, _campaign, _limit, _offset)`,
  `security definer`, `stable`, `SELECT`-only, same derivation CTEs as
  `whatsapp_send_breakdown` (shared by copying the CTE block, no behaviour
  drift allowed), returning id, created_at, status, error_code, error_message,
  text, recipient phone, recipient name, and whether the workflow was matched
  from the log. `GRANT EXECUTE ... TO authenticated`.
- `whatsapp_send_breakdown` gains `direct_attributed` and `log_matched` counts
  per group; existing columns and totals stay identical.
- `WhatsAppSentDrillDown.tsx`: Level 4 query swapped to the RPC, per-group
  attribution tags, recipient line, "listed X of Y counted" footer.
- Untouched: `whatsapp-send-message`, dedupe guard, quota maths,
  Workflow Builder, Levels 1–3 grouping keys.
