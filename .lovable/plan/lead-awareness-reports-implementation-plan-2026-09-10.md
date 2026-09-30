# Lead Awareness Reports — Implementation Plan

Goal: one page that shows how many people saw the clinic before becoming a lead — organic posts, reels, videos, GMB updates, offline activity — plus what was spent boosting them, with no dependence on agency screenshots.

## What already exists

- Connected accounts are recorded (Google Business, Google Analytics, GMB, Instagram, Meta, LinkedIn, YouTube, WhatsApp) — 9 rows, most marked connected. Only Instagram/Facebook/YouTube actually return numbers today.
- A live insights service already returns follower counts, reach/impressions and recent posts for Facebook, Instagram and YouTube.
- Social inbox stores incoming DMs and comments (56 rows) — usable as the "direct enquiries" signal.
- Content calendar holds 8 planned/published items (title, format, platform, date, caption, hashtags) — the natural backbone for the content table.
- Local search snapshots hold Google Search Console totals — usable for the search-visibility card.
- Ad Spend entry screen and its table exist but are empty; expenses hold marketing costs.
- Nothing stores public Google reviews or LinkedIn/Quora numbers.

## What gets built

### 1. Two new small storage areas
- **Awareness snapshots**: each sync saves per-platform follower count, reach, impressions and engagement for that day, so any date range can be reported later instead of only "last few posts".
- **Awareness content entries**: one row per piece of content — platform, format (Reel, Short, Post, Story, GMB update, Article/Q&A, Offline activation), title/caption, publish date, reach, impressions, likes, comments, shares, enquiries, follower gain, boost spend, and a flag for whether the numbers came from the platform or were typed in.

Live-pulled Instagram/Facebook/YouTube posts write into this second area automatically (matched on the platform's own post id so a re-sync updates instead of duplicating). LinkedIn, Quora, GMB updates and offline activations are added through a simple form on the page.

### 2. Boost spend per post
Boost spend is a field on each content entry, so every row shows either `₹ boosted` or `Organic`. Channel-level spend from the existing Ad Spend screen is still blended into the cost metrics, with post-level spend taking priority to avoid double counting.

### 3. Page layout (replaces the current Coming Soon view)
- **KPI row**: content published (with a Posts / Reels / Shorts split), total impressions, total reach, total engagements (likes + comments + shares + DMs), net new followers, total boost spend, blended CPM and cost per engagement.
- **Channel comparison**: one card per platform (Instagram, Facebook, YouTube, GMB, LinkedIn, Quora, Offline) showing content count, reach, engagement, follower change and spend. Not-yet-connected channels show a clear "not connected" state rather than zeros pretending to be data.
- **Content performance table**: platform + format badges, title/caption snippet, publish date, boost spend or Organic, reach/impressions, likes/comments/shares, enquiries, follower gain. Sortable by reach, paginated, horizontally scrollable on mobile.
- **Reviews panel**: present but showing "Google reviews not connected yet", per your choice.
- **Add entry** button and **Sync now** button in the header.

### 4. Filters
Date range (Today, This Week, This Month, This Year, Custom), platform, content format, and a search box matching title, caption, topic or hashtag. All filters combine and drive both the KPIs and the table.

## Technical notes

- New tables `awareness_snapshots` and `awareness_content` in the public schema, with grants for authenticated/service role, RLS restricted to marketing/admin roles for writes and authenticated reads, unique index on (platform, external_id) for de-duplication, and an updated_at trigger.
- A new edge function `awareness-sync` reuses the existing Meta/Instagram/YouTube token resolution from the current insights function, upserts posts and writes a daily snapshot. Called on demand from the page header; no cron in this first pass.
- The page reads both new tables plus `social_messages`, `marketing_ad_spend` and `content_calendar` with paginated reads (past the 1,000-row cap) and does every aggregation in memory with `useMemo`. No writes from the analytics path — writes happen only through the sync function and the manual entry form.
- DM/enquiry counts come from social inbox rows in the selected window, attributed to a post only where the platform provides that link; otherwise counted at channel level and labelled as such.
- Follower "spike" per post is derived from the day-over-day snapshot difference, shown as an indicative figure, not an exact attribution.
- No change to existing Finance, Lead Generation Reports, campaigns, expenses or any existing formula. Sidebar and route already exist.

## Honest limitations to surface in the UI

- Instagram/Facebook/YouTube return only their most recent posts, so history begins from the first sync.
- LinkedIn, Quora, GMB updates and offline activations are manual until those connections return data.
- Google reviews/ratings remain unavailable until the Google Business connection is confirmed working.
