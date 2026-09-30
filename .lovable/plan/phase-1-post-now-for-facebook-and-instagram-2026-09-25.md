# Phase 1: "Post Now" for Facebook and Instagram

## What you'll get
- "Post Now" really publishes to your Facebook Page and Instagram Business account.
- Each platform gets its own honest result message. For example "Published to Facebook", or "Instagram failed: login expired (Meta error 190)".
- While a post is being published, the button shows "Publishing…" and can't be clicked again.
- Caption is required. Instagram also requires a photo or video.
- YouTube, LinkedIn and X show a "Coming soon" tag and can't be selected.
- Every post and each platform's result is saved (pending, published or failed, the live post ID, and the error).
- Not included yet: Schedule Post. It will say "Coming soon" until Phase 2. Save as Draft will actually save the post.

## 1. Database (shown to you before applying)
`social_posts`:
- id, created_by, caption, hashtags, link_url, post_type, media (a list of {url, type}), platforms, scheduled_at
- status: draft, publishing, published, partial or failed
- created_at, updated_at

`social_post_targets`, one row per platform for each post:
- id, post_id (links to the post and is deleted with it), platform (facebook or instagram)
- status: pending, published or failed
- external_post_id, permalink, error_code, error_message, attempted_at, published_at

Access and safety:
- Marketing admins (the existing marketing-admin check) and the creator can read their posts.
- Only the publishing function can write the results.
- The usual access grants, row-level security and updated_at trigger are included.

## 2. The publishing function `social-publish`
It runs these steps in order:
1. Checks that the person is signed in and is a marketing admin or the creator.
2. Checks what was sent: the post ID and a list of platforms.
3. Loads the post and the Meta login from `connected_apps` (Meta/Facebook row). Using that login, it looks up the Page ID, the Page's own access key and the linked Instagram Business ID. If any of these is missing, it returns a clear error.
4. **Facebook:**
   - Text or link only: posts to the Page feed.
   - One image: posts to the Page photos.
   - Several images: uploads each one without publishing, then posts them together to the feed.
   - Video or Reel: posts to the Page videos.
5. **Instagram:**
   - One image: creates the photo, then publishes it.
   - Carousel (2–10 items): creates each child item, then the carousel, then publishes it.
   - Video or Reel: creates the Reel, checks every 3 seconds until it's ready (up to about 90 seconds), then publishes it.
   - Story: uploads the story photo or video.
   - Afterwards it fetches the link to the live post.
6. Saves the result for each platform. Meta's exact error message and code are kept, and error 190 is shown as "Meta login expired – reconnect in Connected Platforms". Then it updates the overall post status and sends back the result for each platform.

## 3. Post tab changes (PostCreator only)
- YouTube, LinkedIn and X tiles are greyed out with a "Coming soon" tag.
- **Checks before sending:**
  - At least one platform and a caption.
  - Instagram needs media.
  - Carousel needs 2–10 images.
  - Video/Reel needs one video.
  - Story needs one photo or video.
  - The caption stays within Instagram's 2,200 characters.
  - Uploads must be finished first.
- **Post Now:**
  - Saves the post.
  - Runs `social-publish`.
  - Shows one message per platform, success or failure with the exact reason.
  - Clears the form when every platform succeeded.
- The button shows a spinner and stays disabled while publishing.
- Save as Draft saves the post with the "draft" status.

## Not changed
- Inbox, replies, insights and Connected Platforms.
- Other modules and the stored logins.
- There are no new secrets. The saved Meta login is used.

## Risks to check when you test
- The Meta login needs these permissions: `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`. If publishing fails with a permission error, reconnect Meta with them.
- Media must be publicly reachable. The current `social-media` storage folder is public, so this should be fine.
- I will not post anything myself. You'll do the first real "Post Now" test.
