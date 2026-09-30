# Local SEO & Google — Real Data-ஆ மாற்ற தேவையான Configuration

இப்போது `src/pages/LocalSEO.tsx` முழுக்க hardcoded. Real data-க்கு 3 external source தேவை. உங்க கிட்ட இருந்து தேவைப்படுவது (settings/config) கீழே.

## 1. நீங்க செய்ய வேண்டியவை (one-time setup)

**A. Google Search Console (keyword rankings, impressions, clicks)**
- Site published URL-க்கு GSC property verify ஆகணும் (meta tag verification — நான் code-ல் சேர்த்து, publish பண்ணிட்டு verify பண்ணிக்கொள்வேன்).
- Google account-ஐ connector மூலம் connect பண்ணணும் (chat-ல் connect card வரும்).
- இதுல கிடைப்பது: real query positions, impressions, clicks, top pages. "dentist in salem #3" மாதிரி numbers இதிலிருந்து வரும்.

**B. Google Business Profile (profile views, calls, direction requests, reviews, rating)**
- Google Business Profile-ல் clinic listing உங்க Google account-க்கு owner/manager access-ல் இருக்கணும்.
- Business Profile API access தேவை (Google Cloud project + API enable + OAuth). இது Google approval process — சில நாள் ஆகலாம்.
- இது இல்லாதவரை Views/Calls/Directions metrics காட்ட முடியாது.

**C. Keyword volume / competitor / trending searches**
- Semrush connect பண்ணினா keyword volume, difficulty, competitor visibility real-ஆ வரும்.
- இல்லைனா trending searches section-ஐ GSC top queries-லிருந்து மட்டும் காட்டுவோம்.

## 2. நான் build பண்ணுவது

- `local_seo_snapshots` table (backend) — daily snapshot cache; page இதிலிருந்து படிக்கும் (API-ஐ ஒவ்வொரு load-க்கும் அழைக்காது).
- `local-seo-sync` edge function — GSC (+ GBP/Semrush கிடைத்தால்) data fetch பண்ணி snapshot save பண்ணும்; daily schedule.
- `LocalSEO.tsx` refactor — snapshot-ல் இருந்து rankings, impressions, clicks, position trend, top pages காட்டும்; loading/empty state-உடன்.
- SEO checklist score — mock சராசரி மாற்றி, உண்மையான page checks (title, meta description, canonical, sitemap, robots, mobile, JSON-LD, alt text) + GSC indexing status-ல் இருந்து compute ஆகும்.
- AI suggestions — hardcoded text மாற்றி, snapshot data-ஐ vaithu Lovable AI மூலம் generate.
- எந்த section-க்கு data இல்லையோ அது "Not connected" ஆ காட்டும் — fake number காட்டாது.

## 3. Phase ஆக பிரிப்பு (recommended)

| Phase | வேலை | தேவை |
|---|---|---|
| 1 | GSC connect + verify + rankings/clicks/impressions/top pages real | Google account connect (உடனே முடியும்) |
| 2 | SEO checklist real checks + AI suggestions | எதுவும் தேவையில்லை |
| 3 | GBP metrics (views/calls/directions/reviews) | Business Profile API access |
| 4 | Keyword volume/competitors | Semrush connect |

Phase 1 + 2-ஐ இப்பவே முடிக்கலாம் — அதுவே page-ல் பெரும்பாலான numbers-ஐ real ஆக்கிடும்.

## Technical notes

- GSC calls: connector gateway (`/webmasters/v3/sites`, `searchAnalytics/query`) — edge function-ல் மட்டும், browser-ல் இல்லை.
- Verified property resolve பண்ணி, multiple match ஆனா உங்ககிட்ட கேட்டு select பண்ண வைப்போம்.
- Snapshot table-ல் RLS + GRANT; authenticated staff read, service_role write.
- GBP/Semrush secrets connector மூலம் மட்டும்; code-ல் key hardcode இல்லை.
