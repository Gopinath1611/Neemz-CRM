# Fix the 3 failing on-page SEO checks

Goal: canonical tag, JSON-LD structured data, and sitemap.xml pass on the next Local SEO refresh (score 6/9 → 9/9).

## 1. Canonical tag

Add `<link rel="canonical" href="/" />` to the `<head>` in `index.html`. Relative href stays correct across preview and published domains.

## 2. Structured data (JSON-LD)

Add one `<script type="application/ld+json">` block to `index.html` describing the clinic as a `Dentist` / `LocalBusiness`: name (Dr Neemz Dentistry), description, address locality Salem / region Tamil Nadu / country IN, url, and `medicalSpecialty` Dentistry. No phone, email, geo coordinates, or opening hours are invented — those get added only if you supply them.

## 3. sitemap.xml

- Create `scripts/generate-sitemap.ts` writing `public/sitemap.xml` with `BASE_URL = https://dental-reach-flow.lovable.app`.
- Wire `predev` and `prebuild` scripts in `package.json` so it runs before dev and build.
- Entries: only public, crawlable routes. The app is a staff CRM behind auth, so the sitemap lists just the genuinely public ones (`/`, and the public camp registration route if it should be indexed — see question below). Internal/admin/authenticated routes and `*` are excluded.
- No `<lastmod>` values (no authoritative per-page timestamps exist).

## 4. Verify

- Confirm `/sitemap.xml` is served in preview.
- Run Local SEO → Refresh; the three checks should read 100% and the score 100%. Note: the checker fetches the **published** URL, so the sitemap and head tags only flip to green after publishing.

## Not in scope

Google Search Console connection, keyword rankings, top pages, GBP metrics, Semrush — unchanged. No robots.txt change (it already allows crawling). No visible page content changes.

## Open question

Should the public camp QR registration route be indexable in the sitemap, or homepage only? Default if unanswered: homepage only.
