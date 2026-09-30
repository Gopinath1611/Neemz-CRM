# Google Reviews tab for Google My Business (Connected Platforms)

## What exists today
- The Overview / Content / Details tabs on Connected Platforms are one shared tab bar used by every non-Meta platform (Google Analytics, Ads, YouTube, LinkedIn, GMB). Their data comes from the `platform-insights` function.
- No backend code talks to the Google Business Profile API yet. There is no review cache, and the app does not store a Place ID for the clinic.

## Approach
Use the **Google Business Profile connector**, signed in as drneemzdentistry@gmail.com (the owner account). This gives the full review feed, including reviewer photos and owner replies. The Places API only returns 5 reviews, so it is not used.

Note: Google has to approve Business Profile API access for the connection. If Google refuses access (403), the tab will show Google's exact message and no fake data.

## Steps
1. **Connect**: link the Google Business Profile connection to the project through a connect card.
2. **Pick the location**: read the accounts and locations, then choose the one named "Dr Neemz Dentistry, Salem". If several match, ask you to choose. Save its account and location IDs in a settings row.
3. **New table `google_business_reviews`** (additive and isolated): review_id (unique), account_id, location_id, reviewer_name, reviewer_photo_url, star_rating (1–5), comment, create_time, update_time, reply_comment, reply_update_time, synced_at. Plus a small `google_business_review_sync` row for location IDs, last sync time, last error, total count and average rating.
   - Grants and RLS: signed-in staff can read; only the backend (service role) can write.
4. **Edge function `gbp-reviews-sync`** (admin or marketing staff only):
   - Calls `GET /my_business/v4/accounts/{a}/locations/{l}/reviews?pageSize=50` and follows nextPageToken through all pages (about 894 reviews, roughly 18 calls).
   - Upserts rows by review_id, so running it again never creates duplicates.
   - Saves Google's averageRating and totalReviewCount.
   - Retries reads only, with backoff on 429/5xx (max 3 tries). Other errors return Google's status and message.
5. **UI (GMB only)**: add a 4th tab, "Google Reviews". It shows only when the GMB platform is active; other platforms keep their 3-tab bar.
   - Summary header: average rating, total reviews, and a 5→1 star breakdown worked out from the saved reviews.
   - Filters: rating (All, 5★ to 1★), text search, and sort by Newest, Oldest, Highest or Lowest. Filtering runs on the database side, 20 per page.
   - Review cards: photo (or initials if none), name, stars, date in IST, comment, and the owner reply if there is one.
   - "Refresh Reviews" button runs the sync, shows a loading state, and can't be clicked twice. It shows the last-synced time.
   - The tab reads from the cache. It only calls Google when you press Refresh or when the cache is empty.

## Constraints kept
- Overview, Content and Details stay as they are, with the same logic and metrics. The new tab is its own component with its own queries.
- The Meta, Instagram, Facebook, YouTube, GA, Ads and LinkedIn cards are not touched.
- No changes to the patients, appointments, billing, quality control or review_requests tables.
- Read-only: replying to reviews is not part of this change.

## Technical details
- New files: `src/components/connected/GoogleReviewsTab.tsx` and `supabase/functions/gbp-reviews-sync/index.ts`.
- One change in `ConnectedPlatforms.tsx`: when `activeTab === "google_my_business"`, add the tab (grid-cols-4) and its TabsContent.
- Gateway: `https://connector-gateway.lovable.dev/google_business_profile/...`, called with `LOVABLE_API_KEY` and `GOOGLE_BUSINESS_PROFILE_API_KEY`, from the server only.
- starRating enum (FIVE…ONE) is mapped to 5…1.
- The migration will be shown to you before it is applied.
