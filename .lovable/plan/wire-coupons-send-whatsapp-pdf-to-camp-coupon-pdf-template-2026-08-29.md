# Wire Coupons "Send WhatsApp PDF" to camp_coupon_pdf template

Send the approved `camp_coupon_pdf` Meta template when the "Send WhatsApp PDF" button is clicked on a coupon row in Sales & Marketing → Offline Campaigns → Coupons & Offers. No new Edge Function or database columns — reuse existing infrastructure.

## Verified current state

- The button calls `sendCouponPdfWhatsApp` in `src/pages/OfflineCampaigns.tsx`, which generates the coupon PDF (via existing `generateCouponPdfUrl`), then sends it as a **free-form document message** — this is exactly why delivery fails outside the 24-hour window (Meta error 131047).
- The project already has a standard template-send path: `sendClinicWhatsApp` in `src/lib/whatsappSender.ts` → `whatsapp-send-message` Edge Function.
- The Edge Function already handles document-header templates: it accepts `headerDocumentUrl` (or falls back to `whatsapp_templates.header_media_url`) and dynamically resolves the template definition from Meta. No backend changes needed.
- Each coupon's real PDF is already generated and uploaded to storage per send, so its public URL is used as the template's document header — the Meta approval sample PDF is not reused.
- The coupon row + linked screening lead + campaign already contain all 5 variables; no new columns.

## Changes

### 1. `src/lib/whatsappSender.ts` (registry entries only)
- Add to `TEMPLATE_REGISTRY`: `camp_coupon_pdf: { name: "camp_coupon_pdf", lang: "en", header: "document" }` (language code will be confirmed against the approved template; adjusted if Meta shows `en_US`).
- Add `camp_coupon_pdf: 5` to `STRICT_BODY_PARAM_COUNTS` so all 5 variables are validated before sending.

### 2. `src/pages/OfflineCampaigns.tsx` — `sendCouponPdfWhatsApp` only
- Keep the existing PDF generation (per-coupon real PDF → storage public URL).
- Replace the free-form `type: "document"` send (and the 24-hour window pre-check, which no longer applies to template messages) with a call to `sendClinicWhatsApp`:
  - `to` = lead's mobile (existing `91` normalization)
  - `templateKey: "camp_coupon_pdf"`
  - `bodyParams`: `{{1}}` = participant name, `{{2}}` = coupon code, `{{3}}` = camp name (campaign name, fallback institution name), `{{4}}` = offer type + discount (e.g. "Discount + 20% OFF"), `{{5}}` = expiry date (dd MMM yyyy)
  - `headerDocumentUrl` = the generated coupon PDF public URL
- Keep the existing button loading state ("Sending..."), keep the success/error toasts, keep the `sent_via_whatsapp` / `whatsapp_sent_at` update on success, and keep the short delivery-status polling so Meta rejections surface as real error toasts (not false positives).
- No changes to table layout, columns, or the Redeem button.

## Prerequisite / verification

The template `camp_coupon_pdf` must be APPROVED in the Meta WhatsApp Business account. The Edge Function validates this against Meta at send time and will return a clear error if it isn't approved; I'll test one real send after the change and report the result.

## Out of scope

No other tabs, pages, or routes. No new Edge Functions, tables, or columns. No changes to "Issue & Send" (wa.me) flow or the Redeem action.
