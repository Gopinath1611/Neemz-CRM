# Plan: Referral Income Tracking in Finance

## Goal
Surface external referral earnings in Finance based on the existing referral status field — additive only, no refactors, no other modules touched.

## Data rule
- Source table: `diagnostic_orders` (the data behind the External Referrals page).
- Count `cost` as income ONLY when `status` is `report_received` or `reviewed`.
- `ordered`, `sample_collected`, and `cancelled` stay fully excluded.
- Transaction date = existing `created_at` (day-wise). No new date field.
- Status changes propagate automatically because both pages read the live table.

## Changes (2 files only)

### 1. `src/pages/Finance.tsx`
- Add a read-only query: `diagnostic_orders` → `id, status, cost, created_at`.
- Compute:
  - `qualifyingReferrals` — status in (report_received, reviewed) AND `created_at` inside the page's existing date-range filter (`inGlobalRange`). No new filter added.
  - `referralIncome` — sum of `cost` over those rows.
- Finance Dashboard cards:
  - New small card **"Referral Income"** showing `referralIncome` for the selected range.
  - Existing **"Total Collected"** card displays `totalCollectedAll + referralIncome`.
  - All other cards, layout, styling, and values unchanged.

### 2. `src/pages/CashDrawer.tsx`
- On day load, fetch that day's qualifying referral rows (`status IN report_received, reviewed`, `created_at` within the selected date).
- Render them as day-wise line items in a "Referral income on {date}" card using the same `Table` row format already used for the expenses list (Amount / Status / Time). No new UI pattern.

## Explicitly NOT changed
- External Referrals page UI and its status dropdown.
- Appointments, Clinic Workflow, Patient Database, Billing & Invoicing, navigation, routes.
- No new pages, tables, columns, or migrations.

## Verification
- TypeScript check passes.
- Toggle a referral from "Sample Collected" to "Report Received" and confirm the Finance card and Cash Drawer line item update on next load.
