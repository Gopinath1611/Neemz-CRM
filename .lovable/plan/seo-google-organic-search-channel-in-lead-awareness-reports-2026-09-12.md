# SEO (Google Organic Search) channel in Lead Awareness Reports

## Good news first: nothing to do in Google Cloud

Google Search Console is already connected to this project and is already
being used by the Local SEO page (real data: "dentist in salem" at position
1.9, etc.). The same connection can feed the Lead Awareness report.

So the answers to your three pre-build questions:

1. **Google Cloud steps needed from you: none.** No new project, no API
   enablement, no service account, no extra Search Console user. The existing
   connection already reads the verified `drneemz.com` property.
2. **Secrets you need to paste: none.** The credentials the sync will use are
   already stored and are never logged or shown. (The code also keeps its
   existing optional service-account path, so if you ever want to switch to a
   service account later, nothing needs rewriting.)
3. **Search Console lag is real** — Google publishes search data roughly 2 to 3
   days behind. The SEO card will carry a small note saying the last 2-3 days
   are not counted yet, and for a period with no rows yet it shows the same
   "cannot send numbers yet" wording other channels use instead of a zero.

## What gets added

An **SEO (Google Search)** card in Channel Performance showing, for the
selected period:

- Impressions (search appearances)
- Clicks
- Average CTR
- Average position
- Top 5 search queries, listed in the Content Performance table

It refreshes from the existing **Sync channels** button together with
Instagram, Facebook and YouTube — no separate button, no manual entry.

## Technical approach

**No schema changes.** Both existing tables are already channel-agnostic:

- `awareness_snapshots` gets one `platform = 'seo'` row per sync day:
  `impressions`, `reach` = clicks, `engagements` = clicks,
  `content_count` = number of queries, and CTR / average position / date
  window stored in the existing `raw` JSONB column.
- `awareness_content` gets the top queries as `platform = 'seo'` rows
  (`content_format = 'article'`, `external_id = 'query:<keyword>'`,
  `impressions`, `reach` = clicks, `data_source = 'platform'`), so they flow
  into the existing content table, filters and search unchanged.

**Sync function** — add an `seo()` step inside the existing
`supabase/functions/awareness-sync/index.ts` (same file, same auth check, same
`Promise.all` fan-out, same errors/notices envelope). It reuses the property
resolution and Search Analytics call pattern already proven in
`local-seo-sync`: resolve the verified property from the account, then query
site-level totals plus the `query` dimension for the requested window. The
report passes its selected `from`/`to` dates in the invoke body; the function
clamps the end date to 3 days ago to respect Google's lag, and reports a
notice when it clamps.

**Report changes** (`LeadAwarenessReports.tsx`):

- add `seo` to the platform list, label "SEO (Google Search)", label style,
  and to `LIVE_PLATFORMS` so it is not marked "manual"
- the SEO card renders SEO-specific rows (Impressions, Clicks, CTR, Avg
  position) instead of Reach/Engagement, reading CTR and position from the
  snapshot `raw`
- pass the selected date range into the sync invoke
- empty period -> existing "cannot send numbers yet" wording plus the lag note

## Guardrails honoured

- Instagram / Facebook / YouTube sync logic, other channel cards, filters and
  all KPI calculations stay untouched.
- No new tables or columns.
- Credentials stay in secrets; never logged, never returned to the browser.
