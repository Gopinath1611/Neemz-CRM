# Local SEO — Real keyword panel + data-grounded AI suggestions

## What I found

1. **How "Top Pages in Google" gets its data** — The daily sync asks Search Console for the
   same 28-day period twice: once grouped by page, once grouped by search term. So the search
   terms are **already being fetched** (top 100), plus the previous 28 days so position changes
   can be compared.
2. **Permission** — The connection reads Search Console with read-only access to the verified
   property `https://drneemz.com/`. That same access already covers search terms; the sync
   returns real terms today, so nothing new needs granting.
3. **Caching / freshness** — Nothing is fetched from Google on page load. Each sync saves one
   snapshot row and the page shows only the newest one. A scheduled sync runs once a day
   (noon UTC), and the Refresh button runs it on demand.

The gap is presentation, not data: the existing "Google Rankings" card shows only term,
clicks, impressions and position — no CTR, no sorting, no way to spot near-miss keywords.
And AI suggestions are generated from a trimmed payload without CTR emphasis, so they read
generic.

## What I'll change

**1. Replace "Google Rankings" with a proper "Top Ranking Keywords" panel**
- Table columns: Keyword, Avg. position, Clicks, Impressions, CTR, and the change vs the
  previous 28 days.
- Sort toggle: by Clicks (default) or Impressions.
- Small tags on rows that matter: "Page 2 — close to page 1" for positions 11–20, and
  "Low CTR" when impressions are high but CTR is well below the site average.
- Shows the exact date window and property already displayed in the header.

**2. Make AI suggestions cite real numbers**
- Send the full keyword list (term, position, clicks, impressions, CTR) plus site averages
  to the suggestion step, and instruct it that every suggestion must name the actual keyword
  and its real position/impressions/CTR — no generic advice.
- Before the AI runs, compute the deterministic opportunity sets (page-2 near misses,
  high-impression low-CTR, zero-click high-impression terms) and pass those in so the
  suggestions are anchored to facts rather than the model's guesswork.
- If the AI step is unavailable, the panel falls back to those computed opportunity lines,
  which are still real numbers rather than templates.

**3. No other behaviour changes**
- Read-only Search Console usage, same property, same window, same schedule.
- No crawl/index changes, no touching WhatsApp, Pipeline, Expenses or any other module.

## Technical notes

- `supabase/functions/local-seo-sync/index.ts`: keep the existing `dimensions: ["query"]`
  call; add computed `opportunities` to the snapshot payload and widen the AI prompt/payload.
  Requires redeploying this one function.
- `src/pages/LocalSEO.tsx`: rewrite the rankings card as the keyword table with sort state and
  derived badges; render suggestions from `ai_suggestions`, falling back to
  `opportunities` when empty.
- Snapshot rows store JSON, so no schema migration is needed; older snapshots simply have no
  `opportunities` key and fall back cleanly.
- Verification: run Refresh, confirm keyword rows show real CTR/position and that each
  suggestion references a keyword present in the table.
