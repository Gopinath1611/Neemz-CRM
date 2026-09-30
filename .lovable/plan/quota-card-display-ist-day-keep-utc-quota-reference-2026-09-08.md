# Quota card: display IST day, keep UTC quota reference

## What you asked

- The "Sent Messages" card and the quota card should follow the same India-local day (midnight to midnight IST), so the two numbers match and there is no day-boundary confusion.
- Meta's real quota still resets at midnight UTC (5:30 AM IST). That stays visible as a small note so throttling never surprises you.

## Change (one file: `src/pages/WhatsAppAPI.tsx`)

1. **Counters query (`whatsapp-sent-counters`, ~line 2058)** — add one more count:
   - `todayLocal`: outbound messages since the start of the viewer's local calendar day (`new Date(y, m, d)` → local midnight to now).
   - Existing `today` (explicit UTC day) and `month` (UTC month) are untouched — nothing in the counting rules changes.

2. **Quota card (~lines 5340–5370)** — display relabelled:
   - Main number: `sentToday` now reads from `todayLocal` (falls back to `ah?.sentToday` as before), badge changes to "TODAY (IST)", label becomes "Sent Messages (Today, IST day)".
   - This makes it agree with the "Messages Sent" card whenever the dashboard filter is "Today", since both then measure the same local day. The old "Differs from Messages Sent…" mismatch note is removed — with matching windows it can no longer fire spuriously.
   - Meta-quota reference note (always shown, small text):
     - "Meta quota day (resets 5:30 AM IST): **{utcCount} / {limit}** used"
     - Window line keeps showing the exact UTC window, e.g. "08 Sep 05:30 – 09 Sep 05:29 local".
   - The progress bar and "Remaining" figure are computed from the **UTC** count, not the IST display count — because Meta throttles on its UTC day. The IST number is presentation only.

## What does NOT change

- No query counts are filtered differently; no `wa_message_id` condition anywhere.
- The UTC counter (`sentCounters.today`) stays in the code and feeds the quota/remaining calculation, so the number Meta actually enforces is still tracked exactly.
- No other card, tab, or export is touched.

## Technical notes

- Local midnight is derived from the browser clock; the clinic is in IST so local day = IST day.
- `quotaWindow` helper is reused unchanged; only which counter feeds the headline vs. the note changes.
- Verify with `bunx tsgo --noEmit -p tsconfig.app.json`, then a Playwright screenshot of the Account tab confirming: headline = local-day count, note line shows UTC count/limit and the 5:30 AM reset hint.
