# Call Logs “Today” Redesign

## Goal
Redesign `/call-logs` using the Callyzer screenshot only as a layout reference, while preserving the app’s existing colors, typography, cards, and mobile navigation behavior. Replace the current sample values with real call activity from the existing call-log data.

## Current State Confirmed
- `/call-logs` currently shows four hardcoded summary cards and six sample call rows.
- The existing `call_logs` data already stores call type, status, phone, duration, timestamps, notes, assigned telecaller, and lead/patient links.
- No call rows currently exist in the connected database, so the redesigned screen will initially show zero metrics and a clear empty list until the Android call-sync supplies records.
- This work does not require a database or schema change.

## Implementation

### 1. Real “Today” data
- Load calls for the current India-local calendar day from `call_logs`, newest first.
- Resolve the caller name from the linked lead or patient, falling back to “Unknown”.
- Resolve the assigned staff name from the telecaller profile, falling back to “Unassigned”.
- Use the stored notes, phone, timestamps, duration, call type, and status directly.
- Include loading, query-error, and no-call states without showing fabricated records.

### 2. Highlighted top metrics
Create a compact 2×2 grid for:
- Total Calls
- Incoming
- Outgoing
- Missed

Each tile will use a large bold value, a small semantic icon, and a clear label on a softly tinted app-themed background.

### 3. Remaining Today metrics
Place the remaining metrics in a compact two-column grid:
- Call Duration
- Incoming Duration
- Outgoing Duration
- Rejected
- Never Attended
- Not Pickup by Client
- Unique Clients
- Working Hours
- Connected Calls

Metric rules:
- Durations: sum `duration_seconds`, formatted as hours/minutes/seconds.
- Rejected: rejected call type/status.
- Never Attended: incoming calls left missed/unanswered.
- Not Pickup by Client: outgoing calls ending missed/failed without a connected duration.
- Unique Clients: distinct normalized phone numbers, falling back to the stored phone.
- Working Hours: elapsed time from the first call start to the last call end/start today.
- Connected Calls: completed calls with a positive duration.

The metric mapping will avoid double-counting inside totals; a missing value will display `0` or `—` as appropriate.

### 4. Call Logs list
Below the stats, add:
- “Call Logs” heading and “Track all telecaller activities” subtitle.
- Search input with “Search call logs...” placeholder.
- Search across caller name, phone, notes, and assigned staff.
- One row per call with caller name, color-coded call-type badge, phone, notes, duration, date/time, and assigned staff tag.
- Incoming uses success styling, outgoing uses the app’s primary/info styling, and missed/rejected uses destructive styling.

### 5. Responsive behavior
- Keep the two-column metric grids on narrow mobile screens, with stable tile heights and no text overlap.
- Stack each call row into a readable mobile hierarchy while retaining all requested information; use a denser single-row layout on larger screens.
- Allow long notes and names to wrap or truncate safely, without horizontal page overflow.
- Preserve semantic design tokens and the existing app font system rather than copying Callyzer’s colors.

## Validation
- Verify real-data calculations and empty-state behavior.
- Test search and all visible status treatments.
- Check the page at mobile and desktop widths, including long names, notes, and durations.
- Confirm no console errors and no horizontal overflow.
