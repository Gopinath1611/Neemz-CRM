# Social Media Inbox: sync latency & diagnostics

## How the inbox updates today (verified)

- Each refresh runs two calls in parallel: the live Meta pull (`social-inbox` function) and a read of stored webhook activity from the last 60 days.
- Updates arrive three ways: instantly when a Meta webhook writes a new row (live subscription, with the new item shown immediately), a slow safety poll every 2 minutes while the tab is visible, and once whenever you switch back to the tab.
- So the inbox is not "polling only" — webhook pushes are instant; the 2-minute timer is only a backup for platforms without webhooks (YouTube).
- Nothing currently measures how long a sync takes.

## What will be added (display only)

1. Timing on every sync
   - Start a timer when a sync begins, stop it when both calls return, and record: start time, duration in milliseconds, and outcome (Success / Rate-limited / Failed).
   - Measure the Meta pull and the stored-activity read separately, so it's visible whether a slow sync is Meta's side or our own database.

2. Latency badge next to "Last synced"
   - Line becomes e.g. `Last synced 3:13:22 PM (took 840ms) · Healthy · auto-refreshes every 2 minutes · instant on new activity`.
   - Colour-coded: under 2s Healthy, 2–4s Slow, over 4s Bottleneck warning, plus a distinct Rate-limited state when Meta returns its request-limit error.
   - Hovering the badge shows the split: `Meta pull 780ms · stored activity 60ms`, and the last few syncs' durations.

3. Live timer while refreshing
   - Clicking refresh keeps the spinner and shows a running counter (e.g. `syncing 1.2s…`) so long calls are obvious instead of looking stuck.
   - Refresh button tooltip shows the last round-trip latency.

4. Source-of-delay clarity
   - A small diagnostics line states which layer last updated the list: `last update via webhook push` vs `last update via scheduled sync`, so a delay can be attributed to Meta's API or to the webhook/database layer.

## Guardrails

- Only `src/components/social/UnifiedInbox.tsx` changes; presentation and timing measurement only.
- No changes to the `social-inbox` function, the Meta webhook, tokens, permissions, poll interval behaviour, or any other module.
- Existing rate-limit detection helper is reused for the Rate-limited state.
