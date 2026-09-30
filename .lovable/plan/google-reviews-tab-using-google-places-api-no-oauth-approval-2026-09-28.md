# Google Reviews tab using Google Places API (no OAuth approval)

## Why Places API
- The saved Google My Business row only holds a typed password. It has no Google token, so it can't be used.
- The Places API needs no Google approval and no sign-in. It can be live the same day.
- It uses the clinic's Place ID, which is already in the app: `ChIJbyDA0IjxqzsRJTRiOfxKRR4`.

## What it can show (Google's limits)
- Overall rating (for example 4.9) and total review count (for example 894). These are always current.
- **At most 5 reviews per fetch**, chosen by Google ("most relevant" or "newest"). There is no paging, so the full list of 894 reviews can't be pulled.
- To build up history over time, each Refresh saves any new reviews it sees. The list grows slowly, but it will never have all older reviews.
- No owner replies (Places doesn't return them).

## Steps
1. **Connect Google Maps Platform** through a connect card. Lovable's managed key works, so you don't need a key of your own.
2. **New table `google_place_reviews`** (only adds, touches nothing else): review id (unique), author name, author photo, star rating, text, publish time, Google Maps link, first-seen time. Plus one small `google_place_summary` row holding rating, total count, last sync time and last error.
   - Signed-in staff can read. Only the backend can write.
3. **Edge function `places-reviews-sync`** (admin or marketing staff only):
   - One call to `places/v1/places/{placeId}` with the field mask `rating,userRatingCount,reviews,googleMapsUri`, for both "relevant" and "newest" sort orders (2 calls per refresh).
   - Saves reviews by review id, so running it again never creates duplicates, and updates the summary row.
   - If Google refuses, it shows Google's exact status and message. No fake data.
4. **Google Reviews tab (Google My Business only)**, the 4th tab:
   - Header: big rating with stars, "894 reviews on Google", a "View all on Google" link and a "Write a review" link. There is also a note that only a sample of reviews is shown.
   - Review cards: photo, name, stars, date in IST and text, with filters for rating, search and sort.
   - A "Refresh" button shows the last sync time and is locked while running. The tab reads saved data and only calls Google on Refresh or when nothing is saved yet. This keeps costs low.

## Not changed
- Overview, Content and Details tabs, the other platform cards, and the review_requests, patients and billing tables.

## Later (optional)
- If you ever want all 894 reviews plus owner replies, the Business Profile API can be added once Google approves it. The same tab would then be switched over.

## Technical details
- Calls go server-side through the Google Maps gateway (`LOVABLE_API_KEY` + `GOOGLE_MAPS_API_KEY`). The Place ID comes from clinic_settings.google_review_link, falling back to the one above.
- The star breakdown is calculated from the saved sample and labelled as a sample.
- The migration will be shown to you before it is applied.
