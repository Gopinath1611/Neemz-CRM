# Fix: WhatsApp delivery status stuck at "Accepted"

## Root cause (verified)

**Meta's webhook status events are being rejected before they reach the database.** The `whatsapp-webhook` edge function verifies every POST with HMAC-SHA256 using the `WHATSAPP_APP_SECRET` backend secret. Live function logs show **every** incoming Meta POST rejected with `signature_mismatch` (06:27, 06:29, 06:32, 06:33 UTC today) — zero status events (`sent` / `delivered` / `read` / `failed`) have ever been processed. The stored secret does not match the App Secret of the Meta app sending the webhooks.

Everything downstream of the webhook is already correctly wired:
- `whatsapp-send-message` stores the outbound row with `wa_message_id` = Meta's wamid and initial status `accepted` (lines 927–963) — correct.
- The webhook matches status updates by `wa_message_id` (not phone/text) with rank-guarded, idempotent updates — correct.
- `whatsapp_messages.wa_message_id` has a UNIQUE constraint — duplicate events can't double-insert.
- `whatsapp_messages` is in the realtime publication and the Single Send UI subscribes to UPDATEs filtered by wamid — will light up automatically once webhook events flow.
- RLS: "Authenticated can manage whatsapp messages" (FOR ALL) — reads are allowed.

So the status chain breaks at exactly one link: **webhook signature verification**.

## Current status flow

```text
Single Send → whatsapp-send-message → Meta Cloud API
  → response wamid saved to whatsapp_messages (status = "accepted")   ✔ works
Meta → POST whatsapp-webhook (statuses[])
  → REJECTED 401 signature_mismatch                                   ✘ BROKEN
  → (never reaches) whatsapp_messages status update
  → (never reaches) realtime event → Recent Sends UI
```

## Proposed fix

### 1. Correct the app secret (requires your input)
The `WHATSAPP_APP_SECRET` secret must be replaced with the **App Secret** from the Meta App Dashboard (App Settings → Basic → App Secret) of the app that owns the webhook subscription. During implementation I'll ask you to paste it, then update the secret. It is never logged or displayed.

### 2. Schema additions (migration)
Add to `public.whatsapp_messages`: `error_code` (int), `error_message` (text), `sent_at`, `delivered_at`, `read_at` (timestamptz). `wa_message_id` already serves as the Meta message ID; no `meta_message_id` duplicate column needed.

### 3. Webhook hardening (`supabase/functions/whatsapp-webhook/index.ts`)
- On each status event, also write `sent_at` / `delivered_at` / `read_at` (from Meta's event timestamp) and extract `error_code` / `error_message` from `st.errors[0]` for failed events.
- Record webhook health: stamp `last_webhook_received_at` / `last_status_event_at` into the WhatsApp `connected_apps` row metadata on every valid POST.
- Keep existing signature check, rank guard, and 131026 blacklist logic untouched. Logs stay free of tokens/secrets.

### 4. UI surfacing (`src/pages/WhatsAppAPI.tsx` Single Send panel)
- Show a visible **"Webhook not receiving status events"** warning (with the reason, e.g. last rejection/never received) when a sent message sits at Accepted and no webhook status has been recorded recently — instead of silently implying progress.
- On Failed, show the mapped Meta error (code + message) from the new columns.

### 5. Verification after secret fix
Send a Single Send test message, watch `whatsapp-webhook` logs for `status updated`, and confirm Recent Sends advances Accepted → Sent → Delivered. If Meta still sends nothing, the remaining suspect is the Meta app's webhook subscription (must be subscribed to the `messages` field) — checked next.

## Affected files
- `supabase/functions/whatsapp-webhook/index.ts` — status timestamps, error fields, health stamp
- DB migration — new `whatsapp_messages` columns
- `src/pages/WhatsAppAPI.tsx` — webhook-health warning + failed error display
- Backend secret `WHATSAPP_APP_SECRET` — updated with the correct value you provide

## Out of scope
No changes to send logic, inbox, templates, campaigns, blacklist behavior, or RLS (all verified working).
