# Follow-ups Tab UI Enhancement

## Goal
Polish the existing Follow-up Timeline inside Sales & Marketing → Offline Campaigns → Follow-ups (`src/pages/OfflineCampaigns.tsx`) with client-side filters and visual status cues. No schema changes, no new files, no changes to other tabs or data logic.

## Changes

### 1. Filter bar above the timeline
Add a compact filter row inside the `TabsContent value="followups"` block, above the timeline list:

- **Search input** — placeholder "Search patient name...", filters by `lead.participant_name`.
- **Campaign/Institution dropdown** — options built from existing `campaigns` and `institutions` arrays already loaded in this file. Option value maps to `fu.campaign_id` (campaigns carry their institution name). Default "All".
- **Status dropdown** — options: All, Sent, Pending. Filters on `fu.status`.
- All filters combine with AND logic and apply instantly on already-loaded `followups` state.

New state variables:
- `followupSearch` (string)
- `followupCampaignFilter` (string, default `"all"`)
- `followupStatusFilter` (string, default `"all"`)

Use existing `Input` and `Select` components already imported in the file.

### 2. Timeline row visual polish
For each rendered follow-up row:

- **Pending rows**: add a light amber/yellow background tint (e.g., `bg-yellow-50/60` or `bg-amber-50`) and keep the amber dot.
- **Sent rows**: keep current `bg-muted/50` base, slightly mute the sub-line timestamp text (already `text-muted-foreground`), and use blue/gray dot.
- **Patient name**: bold primary text (already `font-medium`; keep or slightly emphasize).
- **Institution/campaign name**: render as muted secondary text (`text-muted-foreground`, smaller size), matching the Campaigns tab pattern where the secondary line is de-emphasized.
- **Mark Sent button**: show only when `fu.status === "pending"`, using the existing button and click handler unchanged.

### 3. Dot color consistency
Keep the existing dot color logic but ensure the color matches the row status:
- `sent` → blue dot
- `pending` → amber dot
- other statuses (e.g., `completed`) → green dot (existing fallback)

### 4. What stays untouched
- Data fetching (`fetchAll`) and the `campaign_followups` query.
- The optimistic "Mark Sent" update logic and Supabase sync.
- Other tabs, dialogs, CRUD handlers, and routes.
- Existing theme, spacing, and fonts.

## Implementation Notes
- Filter computation should be pure client-side, derived from `followups`, `screeningLeads`, and `campaigns` already in state.
- Use `useMemo` or inline filtering inside the render; no new network calls.
- No new components; inline the filter bar directly in the Follow-ups tab JSX.
