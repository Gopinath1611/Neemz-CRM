# Why "Messages Sent" says 2 but the Meta quota counter says 1

## Fix #3 status: already done

The recommended alignment is in place. Both figures now count outbound rows with no
`wa_message_id` condition, so no row is excluded for a missing message ID. That part of the
audit needs no further work.

## The real cause: two different days

The two numbers cover different 24-hour windows.

- "Messages Sent" follows the page's date filter ("Today"), which is your local day —
  starting midnight India time.
- "Sent Messages (Meta quota day)" deliberately uses a UTC day, because Meta resets the
  daily messaging limit at midnight UTC (5:30 AM India time).

Today's two outbound messages:

```text
message 1  -> 08 Sep 00:20 India time  = 07 Sep 18:50 UTC   (yesterday for Meta)
message 2  -> 08 Sep 05:30 India time  = 08 Sep 00:00 UTC   (today for Meta)
```

Both have a message ID. So "Today" (India) = 2, and Meta's quota day = 1. Both numbers are
correct for what they measure; only the labelling makes them look contradictory.

## Proposed change (presentation only)

1. Rename the quota card to "Sent Messages (Meta quota day, UTC)" and show the exact window
   under it, e.g. "08 Sep 05:30 - 09 Sep 05:29 IST".
2. Add a short note when the two figures differ: "Differs from Messages Sent because Meta's
   quota day starts at 5:30 AM IST."
3. Leave both counting rules unchanged — the quota card must stay on UTC to match Meta's
   actual limit, and the dashboard card must stay on your selected date range.

## Technical notes

- File: `src/pages/WhatsAppAPI.tsx`. The `whatsapp-sent-counters` query (~line 2058) already
  computes `today` from an explicit `Date.UTC(...)` boundary and applies no `wa_message_id`
  filter; `inboxStats` (~line 2081) uses the same table and filter set over the selected range.
- Only the card label/description around line 5336 and a small helper for the formatted UTC
  window are edited. No query or counting logic changes.
