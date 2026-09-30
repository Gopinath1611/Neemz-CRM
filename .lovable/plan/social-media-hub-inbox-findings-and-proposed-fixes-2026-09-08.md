# Social Media Hub → Inbox: findings and proposed fixes

## What I found (live check, nothing changed)

I ran the Inbox's own live pull just now. It succeeded, with no errors, and returned **19 items total**.

**1. The sync is working — it is not failing silently.**
The Meta connection is healthy: all required permissions are granted, no errors returned. What came back:

| Source | Items |
| --- | --- |
| Instagram comments/mentions | 15 |
| Facebook messages (DMs) | 4 |
| Facebook posts/comments | 0 |
| Instagram DMs | 0 |
| YouTube | 0 |

**2. The "every 25s" label is wrong.** The Inbox actually re-pulls every **120 seconds** (and instantly when new activity arrives by push, and when you switch back to the tab). So the wording under the header is inaccurate, but the sync itself is live.

**3. Sorting is correct — newest first.** Items are ordered by their real timestamp, newest at top. The newest Instagram comments are 1–4 days old and they do appear at the top when the type filter is "All Types".

**4. The real cause of "only old conversations": the Messages filter.**
With type = **Messages**, only Facebook DMs exist — and there are only 4 of them, dated 22 Jul, 25 Jul, 1 Aug and 8 Aug. That is exactly the "31 days ago / 45 days ago / 48 days ago" list. Those are genuinely the most recent direct messages Meta returns; there are no newer DMs. Instagram DMs came back empty. All the recent activity (1–4 days ago) is **comments**, which the Messages filter hides.

**5. "19 pending" counts everything, not the filtered view.** It is the count of all 19 items not yet marked replied — comments included — so it looks like there is hidden new activity when the Messages filter is on. Nothing is being excluded by permissions or by a date range.

**6. One genuinely missing recent item.** A comment from 7 Sep (Tamil, "எனக்கு பல்லு மாத்தணும்") arrived by push and is stored, but the live pull does not return it, because the pull only looks at the newest 15 posts/media and reads comments from those. Stored push activity is never re-read on reload, so anything that arrives by push disappears from the list after a refresh. There are 44 such stored comments.

**7. Volume caps (no date cutoff).** Newest 15 Facebook posts, newest 15 Instagram media, 20 Facebook conversations, up to 50 Instagram conversations. No pagination or "load more" in the list. No date-range filter anywhere.

## Proposed fixes

1. **Correct the sync label** — say "auto-refreshes every 2 minutes · instant on new activity" instead of "every 25s".
2. **Make the badges filter-aware** — show unread/pending counts for what is currently visible, with the overall total alongside (e.g. "19 pending · 0 in this view"), so the badge stops contradicting the list.
3. **Show stored push activity in the list** — merge saved activity (the 44 stored comments, including the 7 Sep one) with the live pull, de-duplicated, so recent items no longer vanish on refresh.
4. **Empty-state clarity** — when a filter yields only old items or none, say which filter is narrowing it and offer a one-click "show all types".

Optional, only if you want it: a "Load more" control to reach beyond the newest 15 posts / 20 conversations.

## Technical notes

- Data source: `social-inbox` edge function (Graph API v19.0) + `social_messages` table for pushed webhook rows.
- Sort already happens server-side on `rawTime` descending; client preserves it.
- Poll interval lives in `UnifiedInbox.tsx` (120000 ms) — label text is the mismatch, not the timer.
- Items 1, 2 and 4 are display-only. Item 3 adds a read of `social_messages` in the client; no writes, no changes to tokens, scopes, the Meta connection, or any other module.
