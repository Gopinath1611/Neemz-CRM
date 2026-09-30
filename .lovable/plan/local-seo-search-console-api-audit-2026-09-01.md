# Local SEO — Search Console API audit

## Exact request being sent today

Auth: service-account JWT (scope `webmasters.readonly`), direct to
`https://www.googleapis.com/webmasters/v3`.

Property resolution: `GET /sites`, filtered to verified properties covering
`LOCAL_SEO_SITE_URL` (`https://drneemz.com/`). The latest snapshot rows confirm the
property actually queried is the **URL-prefix** `https://drneemz.com/` — not a
`sc-domain:` domain property.

Three POSTs to `/sites/https%3A%2F%2Fdrneemz.com%2F/searchAnalytics/query`:

```json
{ "startDate": "2026-08-01", "endDate": "2026-08-29", "rowLimit": 25, "dimensions": ["query"] }
{ "startDate": "2026-08-01", "endDate": "2026-08-29", "rowLimit": 25, "dimensions": ["page"] }
{ "startDate": "2026-07-04", "endDate": "2026-07-31", "rowLimit": 25, "dimensions": ["query"] }
```

Nothing else is sent: no `type`/`searchType`, no `dimensionFilterGroups`, no
`dataState`, no `aggregationType`, no `startRow`.

## Answers to the five checks

1. **Property**: URL-prefix `https://drneemz.com/`. This excludes `http://`,
   `www.`, and any subdomain traffic. A domain property would be broader.
2. **searchType**: not sent. Google's API defaults `type` to `web`, so results are
   web-only — but the Search Console UI defaults to **All** search types, so UI
   totals will legitimately read higher. Nothing is explicitly pinned.
3. **Timezone**: dates are computed from UTC (`isoDaysAgo` uses `getUTCDate`).
   Search Console days are America/Los_Angeles, so the window can be shifted by
   one day. The window is also 29 days (today−31 → today−3), not GSC's 28-day
   default period.
4. **Device/country filter**: confirmed none — no `dimensionFilterGroups` anywhere
   in the function, and no extra dimensions beyond `query` / `page`.
5. **Freshness**: each `local-seo-sync` invocation hits Google live; there is no
   response cache. However the page reads only the newest
   `local_seo_snapshots` row and there is no scheduled sync, so what you see is as
   old as the last manual Refresh. Also `dataState` is unset (= `final`), so the
   last ~2 days of fresh data are excluded by Google.

## One extra accuracy problem found

`totals` (clicks 57, impressions 1487, CTR 3.8%, avg position 15.1) are summed from
the **top 25 query rows only**, not from a site-level query. Real site totals will
be higher, and avg position is an unweighted mean of 25 rows rather than
impression-weighted. This is the most likely reason the dashboard numbers don't
match Search Console.

## Proposed fixes (if you approve)

1. Send `type: "web"` explicitly, and `dataState: "all"` so recent days are included.
2. Compute dates in `America/Los_Angeles` and use a true 28-day window
   (end = PT today − 3, start = end − 27).
3. Add a fourth dimensionless query to get real site totals (clicks, impressions,
   CTR, impression-weighted average position) instead of summing top-25 rows.
4. Raise `rowLimit` for queries/pages (e.g. 100) so the lists aren't truncated.
5. Surface the queried property, date window and search type in the page header so
   the numbers are self-explanatory when compared against Search Console.
6. Optional: add a daily scheduled sync so the snapshot isn't stale between manual
   Refresh clicks.
7. Optional: also verify a `sc-domain:drneemz.com` property if you want www/http
   traffic included.

No code changes made yet — this is a read-only audit.
