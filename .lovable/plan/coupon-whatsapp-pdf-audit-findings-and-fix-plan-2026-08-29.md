# Coupon WhatsApp PDF — audit findings and fix plan

## What the audit found (verified)

1. **The API call is real, not mocked.** The Coupons action calls the `whatsapp-send-message` backend function, which POSTs to the Meta Graph API (`/messages`, type `document`, public PDF link). Rows are being written to the message log with `source = camp_coupon_pdf`.

2. **Number formatting is correct.** `919080216558` — digits only, `91` prefixed, no `+`. Not the problem.

3. **The real cause: no open 24-hour window.** Meta *accepts* the request (HTTP 200, message id returned) and then rejects delivery asynchronously. Delivery webhooks for the three coupon attempts today (10:26, 10:28, 10:29 UTC) all came back:

   ```text
   status: failed
   code 131047 — Re-engagement message
   "Message failed to send because more than 24 hours have passed
    since the customer last replied to this number."
   ```

   The recipient's last inbound message was 22 Aug. Free-form / media messages are only allowed inside 24 hours of a customer reply. Earlier successful sends to this number were **approved templates**, which is why they delivered.

4. **Why the toast lied.** The code only checks Meta's synchronous acceptance. Since 131047 arrives later via webhook, the UI had already claimed "Delivered".

## Fix plan

### A. Stop the false positive (immediate)
- Change the success toast wording from "Delivered to +91…" to "Queued with WhatsApp — delivery confirmation pending", and stop marking the coupon as sent until a `sent`/`delivered` webhook status arrives (fall back to showing "Failed" when status becomes `failed`).
- Surface Meta's error code, subcode and trace id in a destructive toast plus `console.error` when the send is rejected, including the async webhook failure (poll the message row briefly after send, or read its status on refresh) so 131047-type failures show as failures.

### B. Make coupon delivery actually work
- Add a 24-hour-window precheck in the coupon handler: look up the latest inbound message for that number. If it is older than 24 hours, do not attempt a free-form document send — tell the user plainly that WhatsApp requires an approved template outside the 24h window.
- Route coupon delivery through an approved **template with a DOCUMENT header** (there is currently no coupon/document template registered — one must be created and approved in Meta, e.g. `camp_coupon_pdf` with a document header + body params for name, coupon code, camp, offer, expiry). Once approved, register it in `src/lib/whatsappSender.ts` (`TEMPLATE_REGISTRY` + body-param count) and have the Coupons action send via template with the PDF URL as the header document, keeping the current raw-document path only as the in-window fast path.

### C. Optional hardening
- Verify the generated PDF URL is publicly reachable (HEAD check) before dispatch, and report a clear error if the storage object is not public.

## Technical notes
- Files touched: `src/pages/OfflineCampaigns.tsx` (`sendCouponPdfWhatsApp`), `src/lib/whatsappSender.ts` (template registration), possibly `supabase/functions/whatsapp-send-message/index.ts` for returning the resolved message id/status consistently.
- No schema change needed: `whatsapp_messages.status` / `status_updated_at` already carry webhook outcomes, and `campaign_coupons.sent_via_whatsapp` / `whatsapp_sent_at` already exist.

## Decision needed
Template creation and Meta approval is required for out-of-window coupon delivery — I can prepare the template payload and the code path, but approval happens on Meta's side and can take time. Confirm whether to proceed with A + B (template path) or only A + the window precheck for now.
