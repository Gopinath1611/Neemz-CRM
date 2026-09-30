# Add "House Keeping Quality" tab to Quality Control

## Answers to your three questions

**1. Which table backs the existing quality logs?**
Each category has its own separate table — there is no shared table:

| Tab | Table | Date field | Person field | Status values |
|---|---|---|---|---|
| Doctor Treatment | `doctor_quality_logs` | `review_date` | `doctor_name` | open / under_review / resolved / escalated |
| Lab Quality | `lab_quality_logs` | `reported_date` | `lab_name` | open / ... / resolved |
| Pharma / Drugs | `pharma_quality_logs` | reported date | drug/brand | open / ... / resolved |

All three use the same access rule: full access for any signed-in staff member (single "authenticated full access" policy). None of them has a `branch_id` column, so the new table will mirror the existing shape (no branch column) to stay consistent with the other three.

**2. Does the QC Dashboard combine all categories into one number?**
No. "QC Dashboard" in the sidebar simply opens the same Quality Control page (default Doctor tab) — there is no separate overview page and no combined total anywhere. So nothing rolls up, and no existing totals change. Adding Housekeeping cannot alter any existing number.

**3. Exact files touched**
New:
- `src/components/quality/HouseKeepingQuality.tsx` — the new tab (copy of the Doctor tab pattern, adapted)
- one migration creating `housekeeping_quality_logs`

Edited (minimal):
- `src/pages/QualityControl.tsx` — add the 4th tab button (grid becomes 4 columns) + tab content; subtitle updated to mention housekeeping
- `src/components/CRMLayout.tsx` — one new sidebar line "Housekeeping Quality" → `/quality-control#housekeeping`, after Pharma Quality

Nothing else. Doctor, Lab and Pharma tab files and tables are untouched.

## New table

`housekeeping_quality_logs`: id, area (zone), reported_by, issue_type, issue_description, severity (low/medium/high/critical, default medium), status (default open), reported_date (default today), resolved_date, action_taken, notes, created_at. Same access rule as the other three quality tables, plus the required grants. No existing table or policy is changed.

## New tab contents (same pattern as Doctor tab)

- **4 KPI cards** in the same style/order: Open Issues, Resolved, High/Critical, Total Logs
- **Bar chart** "Issues by Area / Zone" + **Pie chart** "Issue Types" — same components and colours as the Doctor tab, shown only when logs exist
- **Logs table**: Date, Area/Zone, Reported By, Issue Type, Severity, Status, Action (status dropdown inline, exactly like Doctor Quality)
- **"Log Issue" button** top-right of the table card, opening the same dialog pattern: Area/Zone, Reported By, Issue Type, Severity, Issue Description, Action Taken

Preset lists: Areas — Waiting Room, Reception, Operatory 1, Operatory 2, Sterilization Area, Restroom, Pharmacy, Lab Room, Staff Room, Corridor, Exterior (free text also allowed). Issue types — Cleanliness, Waste Disposal, Odor, Equipment Damage, Restocking, Pest Control, Linen/Uniform, Water/Plumbing.
