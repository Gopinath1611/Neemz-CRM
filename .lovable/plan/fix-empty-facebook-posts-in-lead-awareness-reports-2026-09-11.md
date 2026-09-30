# Fix empty Facebook posts in Lead Awareness Reports

## What the check showed

A live read of the Facebook page just now returned:

- Page name, picture, category and 741 followers — fine
- Post count: 25 — so the posts do exist and are reachable
- Post list: empty

So it is not "no posts". The page's post *count* request succeeds while the request that asks for post details (message, likes, comments, shares, view/reach numbers) comes back with nothing. That pattern means one of the requested detail pieces is rejected by Facebook for this connection, and the whole detail request fails together instead of returning the posts.

## The fix

Make the post fetch ask in stages instead of all-at-once, so one rejected detail cannot wipe out the whole list:

1. Ask for the basics first: post text, date, link. If this works we always have the post list.
2. Then ask for likes / comments / shares counts. If Facebook refuses, keep the posts and leave those at 0.
3. Then ask for reach / views per post. If refused, keep the posts and show reach as 0.
4. If the newer post endpoint returns nothing at all, retry once with the page's plain feed endpoint.
5. Record the exact reason Facebook gave, and show it on the page as a small note next to Facebook (for example "posts loaded, view counts unavailable for this connection") instead of silently showing nothing.

After this, pressing "Sync channels" should list the Facebook posts, with whatever engagement numbers the connection is allowed to return.

## If Facebook still refuses everything

Then it is a permission on the connection, not the code. In that case the note on the page will name it, and the page will need to be re-authorised with post-reading access. You can still record Facebook content by hand with "Add entry" in the meantime.

## Technical notes

- Only `supabase/functions/awareness-sync/index.ts` changes (staged `published_posts` requests, `/feed` fallback, per-platform error captured into the response).
- `src/pages/reports/LeadAwarenessReports.tsx` gets a small per-channel warning line fed by the sync response.
- No database, schema, token, scope or other module changes. Instagram and YouTube sync behaviour stays exactly as is.
