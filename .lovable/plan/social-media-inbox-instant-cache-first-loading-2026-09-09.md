# Social Media Inbox: instant (cache-first) loading

## Goal
Open the Inbox instantly from saved data, and let the live Meta pull happen quietly in the background instead of holding up the screen.

## What changes

### 1. Cache-first render
- On open, the list is painted from two instant sources: the last saved snapshot of the inbox (kept in the browser) and the stored activity rows already in our database. No blocking wait on Meta.
- The full-screen loading state is removed. If there is nothing cached at all (first ever visit), a light inline "loading conversations…" line shows while the first pull runs.
- Every completed sync saves a fresh snapshot (capped, most recent items) so the next open is immediate.
- Background sync updates the list silently — no spinner over the content, no list jump; the existing sync line in the header shows the timing/health as it does today.

### 2. Live Meta pull only on demand
- Remove the 2-minute background poll and the "refetch on tab switch" behaviour.
- The live Meta pull runs on: first mount (in the background, after the cached list is on screen), the manual Refresh button, and after sending a reply (as today).
- New messages continue to arrive instantly via Meta webhooks → stored rows → realtime push, which is unchanged.
- Trade-off worth knowing: comments/DMs that Meta does not push by webhook will only appear after a manual Refresh. If that turns out to be a problem, a long, low-frequency background sync can be added back.

### 3. Paged initial load with infinite scroll
- Stored activity loads the newest 25 rows first instead of 60 days at once.
- Scrolling to the bottom of the conversation list loads the next 25, with a small "loading older…" row; stops when there are no more.
- Date-range, platform, type, unread and pending filters keep working on what is loaded; a filter that reaches the end of the loaded set triggers the next page automatically.

## Out of scope
No changes to Meta connection, tokens, scopes, webhook functions, the `social-inbox` edge function, reply sending, or any other module. Display and data-fetching layer only.

## Technical notes
- Single file: `src/components/social/UnifiedInbox.tsx`.
- Snapshot cache: `localStorage` key alongside the existing read/replied keys; store items + saved-at time, cap ~200 items, tolerate parse failures by ignoring the cache.
- Split the current single `loadInbox` into:
  - `loadStored(page)` — `social_messages` select with `.range()` (25 per page), newest first.
  - `syncMeta()` — `supabase.functions.invoke("social-inbox")`, merged into state with the existing `dedupeKey` de-duplication and newest-first sort; keeps the current latency instrumentation (`recordSync`, meta/stored timings, health badge).
- Remove the `setInterval(…, 120000)` poll and the `visibilitychange` listener; keep the realtime channel `unified-inbox-live` and its 150 ms debounce nudge (nudge refreshes stored rows only, not the Meta pull).
- Infinite scroll via an `IntersectionObserver` sentinel at the end of the existing `ScrollArea` list.
