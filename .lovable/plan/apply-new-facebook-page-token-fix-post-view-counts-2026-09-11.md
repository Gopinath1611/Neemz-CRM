# Apply New Facebook Page Token + Fix Post View Counts

You generated a new long-lived Page Access Token for Dr Neemz Dentistry (Page `109620181969864`, expires 10 Nov 2026) with `read_insights`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`.

## Steps

1. **Replace the stored token** — save the new value as `META_PAGE_ACCESS_TOKEN`, replacing the old one. Nothing is written into source files. WhatsApp, Instagram and ad-account secrets stay untouched.
2. **Fix the view-count request** in the awareness sync: ask each post for its insights individually (`/{post-id}/insights?metric=post_impressions,post_impressions_unique`) instead of one batched call, which Meta rejected with "must be a valid insights metric". Engagement counts (likes / comments / shares) stay as they are — the new permission should unlock them without code changes.
3. **Redeploy** the awareness sync function.
4. **Run one sync** and verify: likes / comments / shares are real numbers, reach / views are real numbers, and the "Last sync notes" warning is gone.
5. **Report back** in the same format as before: page name, followers, total posts, page views, engagements, likes / comments.

## If Meta still withholds insights

Some Page-level insight metrics need the app out of Development mode or Page Public Content Access approved. If that is still the blocker, posts and engagement will work and the report will name the exact remaining limitation instead of showing silent zeros.

## Security note

The token was pasted directly in chat. Once it is confirmed working, regenerate it in Meta so this pasted copy can no longer be used.

## No changes to

Database schema, Instagram / YouTube / WhatsApp connections, or any calculation.
