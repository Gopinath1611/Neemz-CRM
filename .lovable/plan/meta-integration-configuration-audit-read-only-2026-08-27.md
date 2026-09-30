# Meta Integration Configuration Audit (Read-Only)

Live-verified via the `meta-app-diagnostic` edge function (checked 2026-08-27 06:26 UTC) plus code inspection. No code was modified.

## Configured Identifiers

| Identifier | Value | Source |
|---|---|---|
| **Meta App ID** | `1436600324896173` (name: "Dr Neemz CRM") | Verified live; also hardcoded in `supabase/functions/whatsapp-token-audit/index.ts` |
| **Facebook Page ID** (`META_PAGE_ID`) | `109620181969864` (name: "Dr Neemz Dentistry") | Secret + verified via Graph API page lookup |
| **Instagram Business Account ID** (`INSTAGRAM_BUSINESS_ACCOUNT_ID`) | `17841449936208773` | Secret + linked to the Page above |
| **Ad Account ID** (`META_AD_ACCOUNT_ID`) | Set (value encrypted) | Secret, used by `meta-ads` |
| **Token owner** | System User ID `122108640080628438` | `debug_token` via diagnostic |
| **Token type** | `SYSTEM_USER`, never expires, currently valid | Stored as `META_PAGE_ACCESS_TOKEN`; fallback `WHATSAPP_ACCESS_TOKEN` in `meta-ads` |

## Secret Inventory (names only, values encrypted)

`META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_AD_ACCOUNT_ID`, `META_VERIFY_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET(_SECONDARY)`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`

Note: `META_APP_ID` is referenced in `whatsapp-upsert-appointment-template` but is **not** set as a secret — the App ID only lives in the token itself and the hardcoded value in `whatsapp-token-audit`.

## How the Credentials Flow

- `meta-lead-webhook` / `meta-leads-sync` / `meta-ads` read `META_PAGE_ACCESS_TOKEN` + `META_PAGE_ID`, then exchange for the Page Access Token of "Dr Neemz Dentistry" via `_shared/metaPageToken.ts` (resolver hits `{pageId}`, then `/me/accounts`, then business discovery).
- Webhook verification uses `META_VERIFY_TOKEN` (`instagram-webhook`, `whatsapp-webhook`); signature checks use `WHATSAPP_APP_SECRET`.
- `connected_apps` DB table holds no real Meta tokens — only locally-stored login labels (Google, YouTube, an old "Instagram Graph API" row with app_id `7448560350`, marked disconnected).

## Granted Permissions (live)

pages_show_list, pages_messaging, pages_read_engagement, pages_manage_ads, ads_read, ads_management, business_management, instagram_basic, instagram_manage_messages, instagram_manage_comments, instagram_manage_insights, instagram_content_publish, instagram_manage_contents, whatsapp_business_management, whatsapp_business_messaging, whatsapp_business_manage_events, public_profile, manage_app_solution

## Key Finding

**`leads_retrieval` is NOT in the granted permission list.** This confirms the earlier blocker: the `leadgen` webhook subscription fails with `(#200) ... permissions needed: leads_retrieval`, and lead sync relies entirely on the 10-minute `lead-sync-cron` polling worker. To enable instant lead delivery, grant `leads_retrieval` to the System User token for app "Dr Neemz CRM" (App ID `1436600324896173`), then re-run the `meta-webhook-subscribe` POST.

Also observed during the audit: the Graph API is currently returning `(#4) Application request limit reached` on some calls — transient rate limiting on the app.

## Next Step (requires your action in Meta)

1. In Meta Business settings, grant the `leads_retrieval` permission to the System User / app `1436600324896173`.
2. Once granted, I will re-subscribe the `leadgen` webhook field and verify instant lead delivery end-to-end.
