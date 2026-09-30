# Fix WhatsApp Webhook signature_mismatch — App Secret Alignment

## Diagnosis (confirmed)

- `whatsapp-webhook` verifies `X-Hub-Signature-256` (HMAC-SHA256 of raw body) against env secret `WHATSAPP_APP_SECRET` only. No App ID is hardcoded in the verification path.
- Token/WABA side is built around Meta App **1436600324896173** ("Denzo" system user, WABA `1303942691475826`, PNID `777081605497413`) — per `whatsapp-token-audit`.
- `connected_apps` WhatsApp row stores only the API token; no App ID/Secret recorded. Meta (FB & IG) row has App ID `7448560350`, no secret.
- Webhook logs show `signature_mismatch` on every genuine Meta event, continuing through 07:15 UTC today. No real Meta event has passed verification.
- Root cause: the App Secret saved as `WHATSAPP_APP_SECRET` belongs to a different Meta app than the one where the webhook callback is subscribed.

## Plan

### Step 1 — Identify the app that signs the webhooks (user action, guided)
In Meta App Dashboard, for each candidate app ('Dr Neemz Dentistry WA' and the Denzo app 1436600324896173): check **Webhooks → WhatsApp Business Account → which app has our callback URL subscribed**. That app's **App Secret** (App Settings → Basic) is the value the webhook must hold.

### Step 2 — Update the backend secret
Open the secure secret form for `WHATSAPP_APP_SECRET` so the correct App Secret can be pasted (encrypted at rest, never displayed in chat). Redeploy happens automatically.

### Step 3 — Harden the webhook for the transition (code change)
Extend `verifySignature` in `supabase/functions/whatsapp-webhook/index.ts` to also accept a secondary secret `WHATSAPP_APP_SECRET_SECONDARY` (optional env var), so events signed by either app are accepted while both apps exist. Also record the App ID on the `connected_apps` WhatsApp row metadata for future diagnostics.

### Step 4 — Verify end-to-end
1. Watch `whatsapp-webhook` logs — genuine Meta events should stop showing `signature_mismatch`.
2. Send a real message via WhatsApp Single Send; confirm it transitions Accepted → Sent → Delivered in Recent Sends.
3. Confirm `connected_apps.metadata.last_status_event_at` advances (proves status pipeline is live).

## Technical details
- Files touched: `supabase/functions/whatsapp-webhook/index.ts` (verifySignature candidate list), one `connected_apps` metadata update.
- No schema changes. No RLS changes.
- Secret updated via the secure form tool — value never appears in chat or code.
