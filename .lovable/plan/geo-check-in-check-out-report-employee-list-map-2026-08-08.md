# Geo Check-in / Check-out Report — Employee List + Map

Update only the HRMS → Reports → Geo Check-in / Check-out Report entry. One new component file plus a small conditional render line in the reports page.

## Layout

Two panels inside the existing report card:

```text
------------------------------------------------------
| [search]  Generate | CSV | Excel | PDF             |
------------------------------------------------------
| EMPLOYEE LIST (fixed ~320px) | MAP (fills rest)    |
| Emp021 Gopinath S            |   marker + details  |
| System Admin · 9 to 5:30     |   card              |
------------------------------------------------------
```

- No employee selected → map panel shows a map icon and "Select an employee to view in map".
- Selected row highlighted; map centers on that employee's coordinates.

## Employee list

Built from existing attendance data for the selected date range: only employees with an `attendance_logs` row in range. Each row shows avatar initials, Employee ID, Name, Job Title (designation), and Shift (from the existing employee shift data, "—" when absent). Client-side search by name or employee ID.

## Map

OpenStreetMap embed in an iframe (no new package, no API key), centered on the coordinates with a marker. Check-in and check-out coordinates are shown as separate selectable pins when both exist.

## Coordinate priority

1. Actual GPS already stored on the attendance row (`check_in_lat/lng`, `check_out_lat/lng`) — labelled "Actual check-in / check-out GPS".
2. Otherwise the employee's assigned geo-fence from the existing Geo Fencing records (matched by assigned employee, then department, then location) — labelled "Configured geo-fence".
3. No fabricated coordinates. Messages: "No geo location assigned" when no fence matches, "Location coordinates unavailable" when the fence has no lat/lng.

## Details card

Under/next to the map, only fields present in the data: employee name, employee ID, geo-fence name, latitude, longitude, radius, check-in time, check-out time, location — plus the source label above.

## Exports

Generate / CSV / Excel / PDF stay, wired to the same list dataset: Employee ID, Name, Job Title, Shift, Date, Check-in, Check-out, Latitude, Longitude, Source, Geo Fence, Radius.

## Technical notes

- New file: `src/components/reports/GeoCheckinCheckoutReport.tsx`.
- `src/pages/reports/HRMSReports.tsx`: add one conditional branch for `report.id === "geo-checkin-checkout"`, mirroring the existing `entry-exit` branch and passing `fromDate` / `toDate`. Existing date inputs and filter button stay as-is.
- Reads only existing tables (`attendance_logs`, `employees`, `employee_shifts`, `geofence_zones`). No schema changes, no migrations, no writes, no other files touched.
