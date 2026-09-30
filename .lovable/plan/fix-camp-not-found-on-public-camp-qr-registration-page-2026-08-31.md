# Fix: "Camp not found" on public Camp QR registration page

## What is actually happening

The camp exists and QR is enabled — `Infosys CSR Dental Camp` (`CRP001`, id ending `...0005`) is in the database with `qr_enabled = true`. So the data is fine.

The real cause is access permissions. The `campaigns` and `screening_leads` tables have only one policy each: full access for **logged-in** users (`authenticated`). Public (not logged in) visitors have no read policy on `campaigns`, so the lookup returns nothing and the page shows the generic "Camp not found" message. The same block would also stop the visitor's registration from saving into `screening_leads`.

In short: the QR page is meant for the public, but the backend currently only allows signed-in staff.

## Fix approach (secure, not "make tables public")

Instead of opening the whole `campaigns` table to the internet (that would leak costs, doctors, institution data) and `screening_leads` (personal data of every participant), expose only two narrow, server-side operations:

1. **`camp_public_info(campaign_id)`** — a security-definer database function that returns only `name`, `camp_code`, `campaign_type`, and only when `qr_enabled = true`. Nothing else. Execute permission granted to public visitors.
2. **`camp_self_register(...)`** — a security-definer function that validates the camp is QR-enabled, inserts the registration (`source = 'qr'`) with basic server-side validation (name length, 10-digit mobile, age range), and returns just the generated `unique_code`. Execute permission granted to public visitors. Includes a light anti-abuse guard: same mobile + same camp returns the existing code instead of creating duplicates.

Both tables keep their current locked-down RLS — no new anon read/write policies, no new grants on the tables themselves.

## Frontend change

`src/pages/CampRegister.tsx`:
- Replace the direct `campaigns` select with a call to `camp_public_info`.
- Replace the direct `screening_leads` insert with a call to `camp_self_register`.
- Improve the error copy: distinguish "This camp link is invalid" from "QR registration is not enabled for this camp yet", instead of always showing "Camp not found".

No other page, table, or module is touched. The Camp QR tab, camp code generation, and unique-ID generation keep working exactly as today.

## Verification

- Open `/camp-register/<campaign id>` in a fresh (logged-out) browser session: camp name + code should load and the form should submit, returning a `CRP001-001` style unique ID.
- The new registration should appear in Offline Campaigns → Screening Leads with source `qr`, and the Camp QR "Registered" count should increase.
- Confirm a logged-out visitor still cannot list campaigns or read other participants' data.
