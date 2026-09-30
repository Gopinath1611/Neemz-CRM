# Replace Facebook Page Access Token & Verify Sync

## Goal
Install the newly pasted Facebook Page Access Token (Dr Neemz Dentistry, Page ID 109620181969864) as `META_PAGE_ACCESS_TOKEN` and confirm real engagement + view numbers in Lead Awareness Reports.

## Context
- The per-post insights fix (`post_impressions`, `post_impressions_unique`, one request per post) is already deployed in `awareness-sync`.
- The previous pasted token failed Meta validation ("access token could not be decrypted") — mangled during copy.
- No code changes needed this round; token swap + verification only.

## Steps

1. **Save the token**
   - Delete the old `META_PAGE_ACCESS_TOKEN` secret value and store the newly provided token. The token is never echoed or logged.

2. **Run one authenticated sync**
   - Invoke `awareness-sync` (authenticated) so the Facebook stage runs with the new token.

3. **Verify results**
   - Read-only check via `platform-insights` and/or `awareness_content` aggregates.
   - Report: page name, followers, total posts, page views, engagements, likes/comments, reach/views.
   - Confirm whether the "Last sync notes" warning on `/reports/lead-awareness` disappears.

4. **If the token is rejected again**
   - Report the exact Meta error and stop — no repeated attempts; ask the user to re-copy from Graph API Explorer's Access Token box.

## Guardrails
- No schema changes, no changes to Instagram/YouTube/WhatsApp connections, no calculation changes.
- Security note: the token was pasted in chat — after verification succeeds, regenerate it in Meta and update the secret again for safety.

## Verification
- Sync returns non-zero likes/comments/shares and reach/views for Facebook posts.
- Lead Awareness Reports page shows real numbers; "Last sync notes" warning cleared.
