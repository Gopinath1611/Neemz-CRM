# Plan: "QR" Column in Campaigns Table

## Goal
Add a compact "QR" column to the **Campaigns** table (Offline Campaigns → Campaigns tab) that reuses the existing Camp QR logic: enable/disable toggle, View QR modal, and registered count.

## Answer to your question
**No new database columns or migrations are required.** Everything needed already exists:
- `campaigns.qr_enabled` and `campaigns.camp_code` are already fetched (the Campaigns tab queries `select("*")`).
- The registered count comes from `screening_leads` (`source = 'qr'`, grouped by `campaign_id`) — the Campaigns tab **already fetches all screening leads**, so the count can be computed client-side with **zero new queries**.

## Changes (single file: `src/pages/OfflineCampaigns.tsx`, plus one small extraction)

1. **Extract the "View QR" dialog into a shared component** (`src/components/campaigns/CampQRViewDialog.tsx`):
   - Move the existing QR dialog (QRCodeCanvas + camp code + open/download/print) out of `CampQRTab.tsx` into this shared component.
   - `CampQRTab.tsx` is updated only to use the shared dialog — its UI, behavior, and logic stay identical.

2. **Add the "QR" column** in the Campaigns table, placed after "Status", before "Actions":
   - `Switch` bound to `qr_enabled`; toggling runs the same update: `supabase.from("campaigns").update({ qr_enabled })` then `fetchAll()` (same as CampQRTab).
   - Small QR icon button (disabled when QR off) that opens the shared View QR dialog for that campaign.
   - Muted registered count (`Users` icon + number) derived from the already-loaded `screeningLeads` (filter `source === "qr"` and matching `campaign_id`).

3. **Layout adjustments** to keep the table compact:
   - Slightly reduce one or two percentage widths / bump `min-w` (e.g. 1150px → ~1230px) so the new column fits in one row without crowding; no changes to existing columns' content, order, badges, or theme.

## What stays untouched
- The Camp QR tab continues working exactly as-is (only internally shares the dialog component).
- No changes to other tabs, pages, routes, data-fetching logic, or the database.

## Verification
- TypeScript check passes.
- Browser check: toggle QR on/off in the Campaigns table, confirm it reflects in the Camp QR tab; open View QR modal from the table; confirm registered counts match the Camp QR tab.
