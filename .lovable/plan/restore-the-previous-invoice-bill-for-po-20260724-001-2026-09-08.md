# Restore the previous Invoice Bill for PO-20260724-001

## What I found (read-only)

1. **Nothing was deleted.** Uploading a replacement only writes a brand-new file and re-points the purchase record at it. The old file is still sitting in storage, untouched, under its own path.
2. **Both files exist:**
   - Current (uploaded today, 8 Sep 08:02, 187 KB JPEG): `1000275160.jpeg`
   - Previous (uploaded 24 Jul 13:28, 163 KB JPEG, same minute the purchase was created): `WhatsApp_Image_2026-07-24_at_6.53.02_PM_1_.jpeg`
   The old file is referenced by no other purchase, so it is orphaned and safe to re-point.
3. **Fully recoverable.** No restore is needed from backups.

## Proposed action

Point the purchase's Invoice Bill back to the previous file — a one-row pointer change, nothing uploaded or deleted:

- Set `purchases.invoice_file_url` for PO-20260724-001 back to
  `2026/25e4b2f8-e856-4746-a194-35d1096c4aa4-WhatsApp_Image_2026-07-24_at_6.53.02_PM_1_.jpeg`
- The today's file stays in storage (still recoverable if you change your mind); I will note its path so we can swap back.
- Then verify: open the purchase's invoice view and the linked expense receipt preview and confirm the July document renders.

## Notes

- Data-only change on one row; no schema, storage, trigger, permission, or code change.
- The Purchases screen has no "previous versions" UI today. If you want that as a follow-up (keeping a history of replaced invoice files with a Restore button), say so and I'll plan it separately.
