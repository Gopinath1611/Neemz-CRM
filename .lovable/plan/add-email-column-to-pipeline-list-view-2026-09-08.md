# Add Email Column to Pipeline List View

## What we will do
Add a read-only "Email" column to the Pipeline list view, positioned immediately after the "Phone" column and before the "Location" column. The column will read from `leads.email`. When a lead has no email value, display an em dash (—) instead of leaving the cell blank.

## Why this placement
Email and phone are both contact-info fields, so grouping them together keeps the list scannable and matches the user's explicit request.

## Implementation details
- File: `src/pages/Pipeline.tsx`
- In the `TableHeader` row, insert a new `<TableHead>Email</TableHead>` between the existing Phone and Location headers.
- In the `TableBody` row, insert a new `<TableCell>` that renders `lead.email || "—"` between the Phone and Location cells.
- Update the `colSpan` of the empty-state row (`No leads found`) from `15` / `14` to `16` / `15` to account for the extra column.
- No changes to filters, sorting, exports, lead creation, imports, sync, or any other module.

## Verification
- TypeScript typecheck must pass.
- Browser preview should show the Email column between Phone and Location.
- Leads with no email should render "—".
