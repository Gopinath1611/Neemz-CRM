# Sales & Marketing → Reports (Lead Generation)

A new Reports area under Sales & Marketing that follows money and leads end to end: ad spend → leads → appointments booked → people who actually showed up → treatments started → revenue collected.

## What you get

**Sidebar**: new expandable `Reports` group under Sales & Marketing with two entries:
- `Lead Generation Reports` (`/reports/lead-generation`) — fully working
- `Lead Awareness Reports` (`/reports/lead-awareness`) — clean "Coming soon" page

**Top KPI row** (respects the date filter): Total Ad Spend, Total Leads, Appointments Booked (+% of leads), Clinic Visits (+% of appointments), Treatments Converted (+% of visits), Blended CPL, ROAS (multiple and %), Marketing ROI %.

**Campaign master table**: one row per campaign with platform badge (Meta / Google / Web / Offline), campaign name and active dates, ad spend, leads, CPL, appointments booked with conversion %, booked by (telecaller or online/self-booked), clinic visits with footfall %, treatments started, treating doctors, revenue, ROAS.

**Filters**: date range (Today / This Week / This Month / Custom), platform, treating doctor, telecaller/staff, and a search box for campaign or source. Table scrolls sideways on phones.

**Ad spend entry**: a small screen inside the report where marketing spend is entered per campaign per month (platform, campaign name, period, amount). Without this, per-campaign cost and ROAS cannot exist — nothing in the system records it today.

**Match confidence note**: leads are followed to visits and bills by mobile number, since nothing links them directly today. The report shows how many leads could not be matched, so the numbers stay checkable.

## Data mapping (technical)

Sources, all read-only except the new spend table:
- `leads` — `source` (Meta Ads / Facebook Ads / Offline Camp), `meta_form_name` (the actual campaign name for Meta), `created_at`, `assigned_to_name`, `city`.
- `appointments` — booked count, `booked_by_name`, `created_from`, `checkin_time` (footfall), `doctor`. Note: `lead_id` is present but populated in 0 of 2,823 rows, so it cannot be used.
- `patients` — bridge from lead phone to clinical records (last-10-digit normalised match).
- `billings` + `billing_items` — treatments started and revenue; invoice-net apportioned to line items, same method already used in Finance.
- `campaigns` + `screening_leads` — offline camp rows, spend from `actual_cost`/`estimated_cost`.
- `expenses` where category is `marketing_expenses` — used for total ad spend fallback and to reconcile against entered campaign spend.

**Campaign grouping**: Meta/Facebook leads group by `meta_form_name` (falling back to source when absent); website/SEO leads group by `source`; offline groups by `campaigns.name`.

**New table** `marketing_ad_spend`: platform, campaign_name, period_start, period_end, amount, notes, created_by. RLS: marketing/admin roles manage, authenticated read — via the existing `has_role`/marketing helper functions, with GRANTs. Spend joins to campaign rows by platform + case-insensitive campaign name; unmatched spend appears in an "Unattributed spend" row so the blended total always reconciles.

**Files**
- New `src/pages/reports/LeadGenerationReports.tsx`, `src/pages/reports/LeadAwarenessReports.tsx`
- New `src/components/reports/AdSpendManager.tsx`
- Edit `src/components/CRMLayout.tsx` (sidebar group), `src/App.tsx` (two routes)
- Reuse `AdvancedDateRangeFilter`, `TablePagination`, existing paginated fetch helper (Supabase 1,000-row cap must be paged past for leads/appointments/billing_items)

All funnel maths lives in `useMemo` from the fetched rows. No changes to existing tables, triggers, Finance calculations, or any other module.

## Steps
1. Migration: create `marketing_ad_spend` with grants, RLS and update trigger.
2. Build the report page: data fetching (paged), funnel memo, KPI row, master table, filters, pagination.
3. Build the ad-spend entry dialog/table inside the report.
4. Add the Lead Awareness placeholder page.
5. Sidebar group + routes.
6. Verify: typecheck, then check the page in the browser at desktop and mobile widths, confirming totals reconcile against the marketing expense total.
