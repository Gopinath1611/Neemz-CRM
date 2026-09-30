# Read-Only Findings — Geo Check-in / Check-out Report (Gopinath S, 08 Aug 2026)

## Data verified in attendance_logs (08 Aug 2026)

Query on `attendance_logs` for `date = '2026-08-08'` returned exactly **1 record**, and it belongs to Gopinath S (employee `5f0c1b48-…f1aa85`):

| Field | Value |
| --- | --- |
| Records found for Gopinath S | 1 |
| check_in / check_in_at | 10:04:44 / 2026-08-08 04:34:44 UTC |
| check_out / check_out_at | null (not checked out) |
| check_in_lat | null |
| check_in_lng | null |
| check_out_lat | null |
| check_out_lng | null |
| manual_entry | false |
| status | present |

No GPS values exist for this record, so there are no actual coordinate values to report.

## What the report is currently displaying

It is showing **configured Geo Fence coordinates**, not actual attendance GPS.

Gopinath S is listed in `applicable_employees` of the zone "Backend Office Salem " (lat 11.664644, lng 78.148315, radius 200m), so the report resolves that zone and labels the source "Configured geo-fence".

## Why actual GPS was not used

Not a report bug — the coordinates were never recorded at check-in:

- `src/components/reports/GeoCheckinCheckoutReport.tsx` does select `check_in_lat/lng` and `check_out_lat/lng` and prefers them (lines 100-115, 184-198). They are null, so it falls through to the zone fallback.
- The check-in path actually used by this employee is `src/hooks/useMyAttendance.ts` (HRMS → My Attendance). Its check-in payload (around lines 206-227) writes only `check_in_at`, `date`, `status`, `late_entry` — it never calls `navigator.geolocation` and never sets lat/lng. The check-out update (lines 247+) likewise omits coordinates.
- GPS capture exists only in the older `src/pages/Attendance.tsx` flow (lines 92-112, `getCurrentPosition` → `check_in_lat`), which was not the path used for this record.

## Exact current data flow of the report

1. `Generate Report` → query `attendance_logs` filtered by `date >= fromDate` and `date <= toDate`, ordered by date desc (no employee filter; all employees in range).
2. Three parallel lookups: `employees` (code, name, designation, department, extra_details.location), `employee_shifts` (latest by effective_from → shift name), `geofence_zones` (all rows).
3. For each log row, build an entry: employee metadata + `formatClock(check_in_at)` / `formatClock(check_out_at)` + raw lat/lng columns + `resolveZone(...)`.
4. `resolveZone` picks the first active zone (excluding rows listing the employee in `excluded_employees`) by priority: `applicable_employees` match → `applicable_departments` match → `applicable_locations` match → null.
5. Left panel lists entries (initials avatar, code, name, designation · shift), filtered by the search box on name/code.
6. On selection, coordinate priority: check-in GPS → check-out GPS → configured zone lat/lng → "No geo location assigned" / "Location coordinates unavailable". Chosen coordinates feed an OpenStreetMap embed iframe plus the detail card, and the same priority is applied in CSV/Excel/PDF export rows.

No changes were made to code, UI, or data.
