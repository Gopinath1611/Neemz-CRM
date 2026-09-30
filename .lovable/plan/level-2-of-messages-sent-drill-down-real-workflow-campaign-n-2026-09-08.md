# Level 2 of "Messages Sent" drill-down → real workflow / campaign names

Scope: the WhatsApp API page's "Messages Sent — Drill Down" panel and the
read-only aggregate behind it. Nothing about sending, dedupe, quota, the
Workflow list or the Workflow Builder changes.

## What the data says today

- Every send path now records the workflow at send time: workflow sends write
  `workflow_id`, `workflow_run_id`, `stage_from/to` and a `send_context` that
  includes the workflow name; campaign coupons write `campaign_id`; inbox
  replies and single sends write a "manual" label with no workflow.
- That attribution went live today, so it applies to messages from now on.
- Older messages carry no `workflow_id`. In the last 5 days, 7,228 of 7,337
  outbound messages only say the sender label "workflow" plus the template
  name — the workflow name itself is not stored on the message.
- The execution log table (`workflow_runs`) does hold the workflow, the
  contact's phone number, the step text ("WhatsApp template sent → …") and the
  timestamp. That is the same source the Execution Logs screen displays.

## Level 2 grouping after the change

Level 1 (Area), Level 3 (Template + stage) and Level 4 (individual messages)
stay exactly as they are. Only the Level 2 key changes:

1. Workflow sends → grouped by the real workflow name, e.g. "RCT Campaign
   13.06.2026", "Dental Implant 01/09/2026" — identical to the Workflow list
   and Execution Logs. Deleted/renamed workflows fall back to the name stored
   on the message itself.
2. Campaign sends → grouped by the campaign name.
3. No workflow and no campaign → a single "Manual / Single Send" group. No
   guessing, no forced mapping.
4. Messages that predate attribution and cannot be matched → "Workflow
   automation (name not recorded)", kept separate and honest.

### Recovering names for older messages

For the older "workflow" messages, match each message to its execution-log
entry on phone number + template name + a send time within a couple of minutes
of the logged step. Matched rows show the real workflow name with a small
"Matched from execution log" note so it's clear the name came from the log, not
from the message. Anything that doesn't match stays in the "name not recorded"
group. Counts never change — only the grouping label does, so the running total
still ties back to "Messages Sent".

If you'd rather not have any log-matched names at all, say so and I'll leave all
older messages in the "name not recorded" group.

## Technical detail

- Extend the existing aggregate function `whatsapp_send_breakdown` with a
  `source_kind` ('workflow' | 'campaign' | 'manual' | 'unknown_workflow') and a
  resolved `workflow_name` that prefers `workflows.name`, then
  `send_context->>'workflow_name'`, then the execution-log match
  (`workflow_runs` joined on normalised phone + template in `step` +
  `created_at` within a 2-minute window, nearest match wins).
- The match is done inside the aggregate, so it is one round trip; the
  window is already capped and the panel only queries when opened.
- `WhatsAppSentDrillDown.tsx`: replace the Level 2 grouping key/label helpers
  (`sourceKeyOf` / `sourceLabelOf`) with the new fields and add the
  "Manual / Single Send" and "Matched from execution log" labels. Level 3/4
  filters continue to key off `workflow_id` / `campaign_id` and are unchanged.
- No changes to any send function, dedupe guard, quota calculation, or the
  Workflow Builder.
