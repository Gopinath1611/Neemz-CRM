# Periodic Reports vertical filter panel

## Changes
- Change only the **Periodic Reports** filter presentation from the current expanded horizontal card/bottom sheet into a compact right-aligned dropdown panel matching the Pipeline filter pattern.
- Keep the existing **Filters** toggle; clicking it opens or closes a scrollable, single-column panel.
- Stack every current field vertically with its existing label, options, values, enabled/disabled state, and behavior unchanged.
- Keep **Apply** and **Reset** together at the bottom; Apply continues to commit draft filters and close the panel, while Reset keeps its current reset behavior.
- Leave all report tabs, summaries, tables, exports, queries, calculations, and every other page untouched.

## Verification
- Confirm the panel opens to the right of the Filters button, fits the viewport, and scrolls internally when needed.
- Confirm all fields remain present and disabled “Not available yet” controls remain disabled.
- Confirm Apply, Reset, and toggle-close behavior work without changing report results logic.
