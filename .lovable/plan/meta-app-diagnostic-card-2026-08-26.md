# Meta App Diagnostic Card

Goal: instantly show which Meta app is actually powering the Unified Inbox, so permission fixes go to the right app in the Meta Developer console.

## What you'll see

A compact diagnostic card at the top of the Social Media → Unified Inbox (and reachable from Connected Platforms) showing:

- **Currently Active App: [App Name] (App ID: [ID])**
- Token type (User / Page / System User), token owner name, expiry, and validity
- Granted vs missing permissions, highlighting `pages_messaging` and `instagram_manage_messages`
- Which stored credential is feeding it (page ID / IG account configured in the backend), so you can confirm the app matches the one in your developer dashboard
- A refresh button; nothing is written to the database

## How it works

New edge function `meta-app-diagnostic`:

1. Reads the active `META_PAGE_ACCESS_TOKEN` secret (same one the inbox uses).
2. Calls Graph `debug_token` with the token inspecting itself → returns `app_id`, `application` (app name), `type`, `expires_at`, `is_valid`, `scopes`, `user_id`.
3. Calls `/{app_id}?fields=id,name` for an authoritative app name (falls back to the `application` field if that call is not permitted).
4. Calls `/me/permissions` to list granted scopes and compute missing required scopes.
5. Returns a masked token fingerprint only (first 6 + last 4 chars) plus which related secrets/config values are present — never the full token.

New UI component `src/components/social/MetaAppDiagnosticCard.tsx` invokes that function and renders the card. It is mounted in `UnifiedInbox.tsx` above the existing permissions banner, and the existing banner is left as-is.

## Technical notes

- Files added: `supabase/functions/meta-app-diagnostic/index.ts`, `src/components/social/MetaAppDiagnosticCard.tsx`
- Files touched: `src/components/social/UnifiedInbox.tsx` (one import + one component mount)
- No schema changes, no new tables, no changes to `social-inbox` / `social-reply` logic
- CORS headers on all responses; errors returned as readable messages rather than raw Graph payloads
- Secrets are never echoed — only presence flags and a masked prefix/suffix
