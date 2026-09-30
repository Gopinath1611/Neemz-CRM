# Connect Google Search Console to Local SEO (real rankings + top pages)

The backend already has the full Search Console code path: `supabase/functions/local-seo-sync/index.ts` resolves a verified property, queries `searchAnalytics` for queries and pages, and stores results in `local_seo_snapshots`. The page reads that snapshot. The only missing piece is an authorised Google connection — no Search Console connection exists in this workspace today, which is why `sources.gsc` is false and the page shows "No ranking data".

## 1. Auth approach — OAuth, via the Lovable Google Search Console connector

Search Console has no API-key option. The realistic choices:

| Option | Verdict |
|---|---|
| Lovable GSC connector (managed OAuth) | Recommended. One in-chat sign-in with the Google account that already owns the property; tokens refreshed automatically by the gateway. |
| Own Google Cloud OAuth app | Same result, but you'd create a Cloud project, consent screen, client ID/secret, and hand-roll refresh logic. Unnecessary. |
| Service account | Needs the service-account email added as a Search Console user on the property; extra step, no benefit here. |

So: connect once through the connector card, using the Google account that has access to `https://drneemz.com/`.

## 2. Where credentials live

Nothing in frontend code. After connecting, `LOVABLE_API_KEY` and `GOOGLE_SEARCH_CONSOLE_API_KEY` exist only as backend secrets and are read with `Deno.env.get` inside `local-seo-sync`. All Google calls go through the connector gateway from the edge function; the browser only reads the cached snapshot table from the database. This is already how the function is written.

## 3. Which property to query

Confirmed direction: query the public clinic site, not the CRM.

- Set `LOCAL_SEO_SITE_URL` to `https://drneemz.com/`, so property resolution matches the already-verified GSC property (either `https://drneemz.com/` URL-prefix or `sc-domain:drneemz.com`).
- The function lists verified properties at runtime and matches on this target; if several verified properties cover it, it returns `selection_required` and you pick one in the UI (no default guess).
- Side effect to accept: the on-page SEO checklist in the same function scans `LOCAL_SEO_SITE_URL`. Switching to drneemz.com means the checklist audits the clinic site (which is what actually matters for SEO), not the CRM. Open question below if you want them split.

## 4. Data scope

Read-only, exactly what the page renders:

- `searchAnalytics/query` with `dimensions: ["query"]` — keywords, position, clicks, impressions, CTR, plus a prior-period query for the position delta.
- `searchAnalytics/query` with `dimensions: ["page"]` — top pages.
- `GET /webmasters/v3/sites` — verified-property resolution.

No sitemap submission, no URL-inspection, no write or management scopes. Scope needed: `webmasters.readonly`.

## 5. Effort and risks

Effort: small — roughly connect + one config value + a redeploy and a Refresh run. No schema changes, no page rewrite.

Risks:
- **Token expiry** — handled by the gateway's automatic refresh. If the Google account's grant is revoked or the password/2FA changes, calls fail with 401 and the person who connected the account must reconnect.
- **Access loss** — if that Google account loses Search Console permission on drneemz.com, calls return 403; the page will show the GSC error text rather than fake numbers.
- **Rate limits** — trivial volume (3 calls per refresh), but refresh is manual today; a daily schedule can be added later if wanted.
- **Data lag** — Search Console data lags ~2-3 days; the function already queries a 3-to-31-day-back window, so "today" will never appear.
- **Low-volume gaps** — Google omits very low-volume queries, so some keywords you expect may be absent. That is Google's behaviour, not a bug.

## Technical steps once approved

1. Open the Google Search Console connector card and link the account that owns drneemz.com.
2. Store `LOCAL_SEO_SITE_URL = https://drneemz.com/` as a backend secret.
3. Redeploy `local-seo-sync`, run it once, handle `selection_required` if multiple properties match, and persist the chosen property.
4. Verify the page shows real rankings/top pages and that `sources.gsc` is true.

## Open questions

1. Is the verified property in GSC the URL-prefix `https://drneemz.com/` or the Domain property `drneemz.com`? Either works — just confirms what to expect during resolution.
2. Do you want the on-page SEO checklist to also switch to drneemz.com (recommended), or keep auditing the CRM URL while only rankings come from drneemz.com? The latter needs a second config value.
3. Should the refresh stay manual (button on the page), or run automatically once a day?
