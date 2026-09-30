# Visual dental chart in Findings Timeline

## Scope
- Change only the Findings Timeline presentation in Patient History.
- Keep its existing live chart/lifecycle data, dates, doctors, status events, and ordering unchanged.
- Leave Consultation's editable dental chart and every other history/workflow section untouched.

## Implementation
1. Extract the existing Consultation tooth renderer and its condition labels/colors into a reusable read-only compact chart component without changing the current Consultation chart behavior or appearance.
2. Group timeline findings by consultation visit date and doctor, then render one compact adult/child FDI chart per dated visit.
3. Highlight only teeth affected during that visit using the same Consultation condition colors and tooth imagery; healthy/unaffected teeth remain neutral.
4. Add read-only hover/click tooltips showing tooth number and all findings for that tooth.
5. Retain a compact text summary and existing chronological lifecycle events beneath each visit chart, including full-mouth findings that cannot map to one tooth.
6. Keep the chart horizontally contained on narrow screens so the page itself does not overflow.

## Verification
- Open Patient History for a real patient and confirm each dated visit has one compact chart.
- Confirm highlighted teeth, finding labels, dates, doctors, and status events match the existing timeline data.
- Confirm clicking a tooth cannot edit anything and Consultation remains editable and visually unchanged.
