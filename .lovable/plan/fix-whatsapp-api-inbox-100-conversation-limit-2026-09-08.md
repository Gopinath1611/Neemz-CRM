# Fix WhatsApp API Inbox 100-Conversation Limit

## Problem
The Inbox tab conversation list fetches `whatsapp_threads` with a hard `.limit(100)` (WhatsAppAPI.tsx `loadWhatsAppInbox`, line ~1267). The database holds 1,620 active threads (0 deleted), so ~1,520 conversations are unreachable. The "All" badge shows only the loaded count, and search filters only the 100 loaded threads. No pagination or "load more" exists.

## Fix (display/query layer only — no schema or data changes)

1. **Paginated thread loading**
   - Change `loadWhatsAppInbox` to fetch threads in pages of 100, ordered by `last_message_at` descending, using `.range(from, to)`.
   - Keep the first 100 loaded on initial load (current behavior unchanged).
   - Add a **"Load more conversations"** button at the bottom of the conversation list, shown only while more threads remain, with a loading spinner while fetching. Each click appends the next 100.

2. **Real total in the "All" badge**
   - Fetch the true total once per load with a cheap `count` query (`select id, { count: "exact", head: true }`) on `whatsapp_threads`.
   - Badge shows the loaded count vs. total when they differ (e.g. "All · 200 of 1,620"); otherwise the plain count as today.

3. **Message previews for newly loaded pages**
   - Reuse the existing per-page preview fetch (`whatsapp_messages` for the page's thread ids, newest first, capped) and merge into state instead of replacing, so already-loaded threads keep their previews and realtime updates.

4. **Realtime unchanged**
   - The existing `postgres_changes` subscription on `whatsapp_threads`/`whatsapp_messages` continues to refresh; new inbound threads still appear at the top. Loading more pages does not reset scroll position.

## Out of scope
- No changes to sending, dedupe, quota, templates, billing/pricing, or the pipeline stage guard.
- No schema, RLS, or data changes.
- Server-side search across all 1,620 threads (search still covers loaded threads; can be a follow-up if wanted).

## Verification
- Open WhatsApp API → Inbox: confirm "All" shows the real total (1,620), click "Load more" repeatedly and confirm older conversations appear and the list grows toward the full total.
- Open a newly loaded older conversation and confirm its messages load.
- Confirm no console errors and that unread badges still update in realtime.
