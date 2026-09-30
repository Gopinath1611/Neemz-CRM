# HRMS Inbox

## Build
- Add an expandable **Inbox** item directly after **Home** in the existing HRMS sidebar, using the current nested-menu styling and three links: Leaves, Comp off request, and Expenses & reimbursements.
- Add one small reusable Inbox page component and three routes, each with its requested title, the shared My requests / Awaiting approval / Completed tabs, and a centered empty state only.
- Keep every view static and responsive: no data fetching, mock rows, approvals, authentication changes, or backend work.

## Technical details
- Reuse the existing sidebar navigation renderer, semantic design tokens, Button/Tabs/Card patterns, and Lucide icons.
- Grant the three routes the same universal authenticated HRMS visibility as the existing personal HRMS pages.
- Verify the sidebar expansion, all three routes, tab switching, empty states, responsive layout, and current build status.
