# Estimated Pricing Breakdown (WhatsApp → Billing & Pricing)

## What I found

1. **Template categories** — the `whatsapp_templates` table has a `category` column, but only 5 of 22 rows are filled (all `MARKETING`); the other 17 are empty. Meta *does* return the category live: the templates sync already requests `name,status,category,language,components` from Meta. So category is available, just not saved for most templates.
2. **Message volume** — every outbound message log stores the template name it was sent with, so volume per template (and therefore per category) is already countable. Month-to-date example: `fl_checkout_google_review` 7,326, `app_booking_confirm_v2` 79, `fl_invoice_ready` 15, `camp_coupon_pdf` 1. This uses the same log table behind the "Messages Sent" drill-down.
3. Today the Pricing Breakdown section simply prints "Billing data unavailable" because Meta returns no verified pricing for this account.

## What will be built

**1. Fill in the missing categories**
Save the category Meta already reports for every template when the template list is refreshed, so each template is tagged Marketing / Utility / Authentication / Service.

**2. Admin-only rate entry**
A small "WhatsApp conversation rates" panel (visible to admins only) where the clinic types Meta's current per-category rate for their region — Marketing, Utility, Authentication, Service — plus the currency. Entered once, editable any time. Values are stored in the backend so everyone sees the same rates.

**3. Estimated Pricing Breakdown**
The section shows, for the current month: messages sent per category × entered rate = estimated cost per category, with a total at the bottom. Messages whose template category is still unknown are listed in their own "Uncategorised" row with no cost, so the numbers stay honest and always add up to the total messages sent.

**4. Clear labelling**
A banner reading "Estimated — based on your entered rates and message volume, not verified by Meta", and the "Open Meta Payment Settings" button stays for the real bill. If no rates have been entered yet, the section prompts the admin to enter them instead of showing zeros.

If Meta ever does return verified pricing, that verified table is shown as it is today and the estimate appears beneath it.

## Technical notes

- New table `whatsapp_pricing_rates` (category, rate numeric, currency, updated_at) with GRANTs; RLS: read for `authenticated`, insert/update restricted to `has_role(auth.uid(),'admin')`.
- Aggregation: single read of `whatsapp_messages` (direction `out`, `created_at >= date_trunc('month')`), grouped by template name from `payload.request.template.name` (fallback `payload.template.name`), joined to `whatsapp_templates.category` — same extraction helper used by the drill-down.
- `whatsapp-list-templates` upserts `category`/`status` into `whatsapp_templates` on sync (read-from-Meta only; no send-path change).
- UI changes confined to the billing tab block in `src/pages/WhatsAppAPI.tsx` (~lines 5655-5736) plus a new rates editor component.
- No changes to sending, dedupe, quota accounting, or the pipeline stage guard.
