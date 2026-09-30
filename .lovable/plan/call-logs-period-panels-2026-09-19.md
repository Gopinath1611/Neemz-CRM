# Call Logs Period Panels

## Goal
Add matching Today, Yesterday, and Last Week metric panels above the existing Call Logs list. Reuse the existing 13 metric definitions exactly, without changing the list, search, access rules, or call-status logic.

## Periods and dates
- Calculate every range in India time (`Asia/Kolkata`).
- Today: current India-local calendar day.
- Yesterday: the immediately preceding India-local calendar day.
- Last Week: the previous completed calendar week, Monday through Sunday.
- Display labels as `dd MMM yyyy`; Last Week displays both endpoints as `dd to dd MMM yyyy` when they share a month, matching `07 to 13 Sep 2026`.

## Data loading
- Replace the Today-only loader with one paginated call-log fetch covering the earliest Last Week boundary through the end of Today.
- Keep the same selected columns, ordering, 1,000-row pagination, related lead/patient/staff name resolution, access scope, and 60-second refresh.
- Split that one result into Today, Yesterday, and Last Week in memory. This avoids per-panel and per-metric requests and refreshes all three panels together.
- The existing Call Logs list and search continue to use only the Today subset, preserving their present behavior.
- Per the selected decision, branch switching keeps the page’s current access scope because `call_logs` has no branch field; no schema or access-policy change will be made.

## Shared metric logic
- Extract the existing Today calculation into one shared function and run it unchanged for each period.
- Preserve the current definitions for incoming, outgoing, missed, rejected, never attended, not picked up, unique clients, working hours, and connected calls.
- Keep zero counts as `0` and zero/empty durations as `—`.
- Return all 13 metrics in this exact order:
  1. Total Calls | Call Duration
  2. Incoming | Incoming Duration
  3. Outgoing | Outgoing Duration
  4. Missed | Rejected
  5. Never Attended | Not Pickup by Client
  6. Unique Clients | Working Hours
  7. Connected Calls

## Panel layout
- Create one shared period-panel component used by Today, Yesterday, and Last Week.
- Each panel is a white app-themed card with the period heading and small grey date label.
- Inside, render compact light-grey metric tiles in a stable two-column grid; each tile has a bold value above an icon and label.
- Desktop: three equal panels side by side.
- Mobile and tablet: panels stack vertically; tiles remain two columns without overflow or text overlap.
- Use the existing semantic colors, typography, icons, card radius, and loading/error treatments.

## Validation
- Confirm the India-local period boundaries, including previous Monday–Sunday calculation.
- Confirm all three panels refresh from one query and use identical calculation rules.
- Confirm the existing Today call list and search remain unchanged.
- Check desktop, tablet, and mobile layouts for overflow and readable labels.
- Run the TypeScript check and verify the live page has no console errors.
