# Read-only audit: Meta (Facebook & Instagram) webhook handling

No code or data was changed. Findings below come from reading the edge functions and querying the database.

## 1. Where webhooks arrive

`instagram-webhook` is the single Meta receiver (public, `verify_jwt = false` in `supabase/config.toml`).

- `GET` — handles Meta verification: compares `hub.verify_token` against the `META_VERIFY_TOKEN` secret and echoes `hub.challenge`, else 403.
- `POST` — parses JSON, decides platform from `body.object`: `page` -> `facebook`, anything else -> `instagram`.
- Uses the service-role client, so inserts bypass RLS.

Payload parsing per `entry`:

- `entry.messaging[]` (DMs / Page inbox): skips `message.is_echo` and any event where `sender.id` equals `META_PAGE_ID`; requires text or attachments; stores text or the literal `"[attachment]"`. Saved as `message_type = 'dm'`.
- `entry.changes[]` with `field = "comments"` (Instagram): sender taken from `value.from.username` or `value.from.id`, text from `value.text`. Saved as `message_type = 'comment'`.
- `entry.changes[]` with `field = "feed"`, `value.item = 'comment'`, `verb != 'remove'` (Facebook): skips page-authored comments, sender from `value.from.name`/`id`, text from `value.message`. Forced to `platform = 'facebook'`.
- Anything else (reactions, message edits, deletes, story replies, `feed` posts/likes) is silently dropped.

All rows are inserted in one batch; on insert error the function returns 500 (Meta will retry).

## 2. What gets stored

`public.social_messages` is the only destination table. Columns:

`id`, `platform` (default `instagram`), `sender_name`, `message`, `message_type` (default `dm`), `status`, `created_at`, `updated_at`.

- Realtime: table is in the `supabase_realtime` publication, with a trigger maintaining `updated_at`.
- RLS: one permissive policy — any authenticated user can read/write all rows.

Current data: exactly **1 row** — an Instagram test comment (`sender_name = 'test'`, `"This is an example."`, `status = 'new'`), inserted 2026-08-26 09:43 UTC, i.e. Meta's sample payload. No real DM or comment events have landed yet.

## 3. Gaps observed in the current storage model

- **No provider IDs.** The table has no `external_message_id`, `conversation_id`, `page_id`, or `sender_id` column, so events cannot be de-duplicated; a Meta retry of the same delivery inserts a duplicate row.
- **Sender identity is a display string.** `sender_name` holds an IG username, a FB display name, or a raw PSID depending on the event path — there is no stable per-contact key and no link to `leads`/`patients`.
- **Status vocabulary is inconsistent.** Webhook rows are written as `status = 'new'`, while the table default is `'unread'` and `SocialInbox.tsx` writes `'replied'` and treats `'unread'` as new. So webhook-created messages never render the "New" badge.
- **Direction is not recorded.** Outbound replies are inserted as ordinary rows and inferred as "ours" only from `status = 'replied'`, which is fragile.
- **No timestamp from Meta.** `created_at` is insert time, not the event's own timestamp, so ordering drifts on retries/backfills.
- **No raw payload retained**, so unparsed event types cannot be replayed after a parser fix.

## 4. How the UI consumes it

`UnifiedInbox.tsx` does **not** read `social_messages` as its message source. It calls the `social-inbox` edge function, which pulls live from the Meta Graph API (Page conversations, IG conversations with pagination, post comments, ratings, tags). The webhook table is used only as a **change signal**: a Realtime `INSERT` listener on `social_messages` triggers a debounced re-fetch, backed by a 120s safety poll. Replies go through `social-reply` (Graph API), not the table.

The older `SocialInbox.tsx` component is the only place that reads and writes `social_messages` directly, but that tab was removed from the Social Media Hub, so it is effectively dormant.

## Net summary

Webhook verification, platform detection, echo filtering, and Realtime signalling all work as intended. Message content is stored in a single flat, permissive table with no provider identifiers, no direction flag, no contact linkage, and an inconsistent status vocabulary — adequate as a "something arrived" trigger for the live Graph-API inbox, but not usable as a durable conversation store in its current shape.

No follow-up changes are included here; say the word if you want a remediation plan for any of the gaps above.
