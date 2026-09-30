# Audit: Download Reports for Sales & Marketing

## What exists today

`/download-reports` (Clinic) is a single page with one shared date filter and a grid of cards. Each card is a small config entry (label, description, table, date column, column mapping) plus View / Excel / PDF buttons, a shared preview dialog, and a "Download All (Excel)" workbook. Adding new report cards means adding config entries — no changes to the existing Clinic cards or their calculations.

`/finance/download-reports` already exists as its own page, so a separate Sales & Marketing page follows the established convention.

## Audit table

| Sales & Marketing menu | Data it would export | Reuses existing pattern | Extra filter needed | Export today |
|---|---|---|---|---|
| Pipeline (Lead Management) | Flat lead list: code, name, phone, email, city, source, campaign/form, stage, rating, owner, created, last contact | Yes | Stage, Source, Owner | Yes — Excel/CSV on the page |
| Follow-ups | Lead, phone, owner, due date, type, status, outcome, notes | Yes | Status | No |
| Appointments (S&M view) | Same appointment data as the Clinic Appointments card | Card already exists in Clinic reports — skip to avoid duplication | — | Via Clinic reports |
| Call Logs | Date/time, caller, lead/patient, direction, duration, disposition, notes, recording present | Yes | Direction, Disposition | No |
| Contacts | Name, phone, email, location, source, treatment interest | Yes (same source as Pipeline, contact-shaped columns) | Source | No |
| Offline Campaigns — Institutions | Name, type, district, contact person, phone, status, camps held | Yes | — | No |
| Offline Campaigns — Campaigns | Camp code, name, type, institution, dates, estimated/actual cost, leads, conversions | Yes | Campaign type | No |
| Offline Campaigns — Screening Leads | Name, phone, age, gender, complaint, examined by, camp, status, pushed-to-CRM flag | Yes | Campaign, Status | No |
| Offline Campaigns — Coupons | Coupon code, camp, patient, discount, issued/expiry, redeemed date, status | Yes | Campaign, Status | No |
| Offline Campaigns — Camp Follow-ups | Screening lead, phone, due date, channel, status, outcome | Yes | Campaign | No |
| Offline Campaigns — Corporate Partners | Partner, type, contact, agreement dates, status, employees covered | Yes | — | No |
| Offline Campaigns — CEO Dashboard / ROI Calculator | Chart & KPI-only views | No clean row export — export the underlying Campaigns rows with cost, leads, conversions and ROI per campaign | Campaign type | No |
| Referrals | Referrer, phone, referred patient, date, status, revenue attributed | Yes | Status | No |
| Reviews | Patient, phone, request sent date, channel, review received, rating, platform | Yes | Received / not received | No |
| WhatsApp | Campaign-level and message-level rows: campaign, template, recipients, sent, delivered, failed, cost estimate | Yes (two cards: Campaigns, Message Log) | Campaign, Status | Partly — drill-down views only, no file export |
| Lead Automation — Automation Hub / Workflow | Workflow name, trigger, steps, runs, contacts entered, last run | Yes (flattened run summary, not the visual builder) | — | No |
| Lead Automation — Email / SMS / IVR | Campaign name, audience size, sent, status, date | Yes | Channel | No |
| Lead Awareness — Connected Platforms | Platform, connection status, last sync, account name | Live status board, low report value — recommend skipping | — | No |
| Lead Awareness — Social Media / Content Calendar | Post title, platform, scheduled date, stage, publish date, reach, engagement | Yes | Platform, Stage | Yes — Calendar CSV import/export |
| Lead Awareness — Local SEO | Snapshot date, score, keyword, position, clicks, impressions, CTR | Yes | — | No |
| Reports — Lead Generation | Campaign funnel rows: platform, campaign, spend, leads, appointments, visits, treatments, revenue, CPL, ROAS | Chart/KPI-heavy page; export the campaign master table as rows | Platform, Doctor, Staff | No |
| Reports — Lead Awareness | Channel, content, views, engagement, spend | Same — export the content rows | Platform | No |

## Recommendation

**Separate page** at `/sales-marketing/download-reports`, added under Reports → Sales & Marketing Reports. Reasons: 20+ new cards would overwhelm the Clinic page, Sales & Marketing needs its own filter row (platform, campaign, stage) that Clinic reports don't have, and Finance already sets this precedent. This also guarantees the Clinic page file is not edited at all.

## Confirmation on safety

Nothing in the Clinic module changes: no edits to `src/pages/DownloadReports.tsx`, no change to any Clinic card, calculation, query or layout. No Sales & Marketing page's behaviour, UI or logic changes — the new page only reads existing tables. No schema changes.

## Technical notes

- New page `src/pages/reports/SalesMarketingDownloadReports.tsx`, mirroring the Clinic page's report-definition array, shared date filter, `ReportPreviewDialog`, XLSX/jsPDF writers and "Download All (Excel)".
- Shared filter row: date range (reusing `DateRangeFilter`) plus optional Platform / Campaign / Stage selects that only apply to the cards that declare them.
- Reads only: `leads`, `follow_ups`, `call_logs`, `campaigns`, `institutions`, `screening_leads`, `campaign_coupons`, `campaign_followups`, `corporate_partnerships`, `referrals`, `review_requests`, `whatsapp_campaigns`, `whatsapp_messages`, `workflows`/`workflow_runs`, `content_calendar`, `awareness_content`, `local_seo_snapshots`, `marketing_ad_spend`.
- Paged reads for tables above 1,000 rows (leads, appointments, whatsapp_messages).
- Wiring: one route in `src/App.tsx`, one menu entry in `CRMLayout.tsx` under Reports → Sales & Marketing Reports, plus route access in `roleAccess.ts`.

## Build steps (after approval)

1. Create the new page with report definitions for the "Yes" rows above.
2. Add the shared platform/campaign/stage filters and per-card applicability.
3. Add paged fetching for large tables.
4. Route + menu + role access wiring.
5. Verify: typecheck, then open the page and spot-check View / Excel / PDF on Pipeline, Screening Leads and WhatsApp cards; confirm the Clinic page renders unchanged.
