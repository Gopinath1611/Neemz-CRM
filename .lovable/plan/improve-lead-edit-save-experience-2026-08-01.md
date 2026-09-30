# Improve Lead Edit Save Experience

Changes are confined to the lead detail dialog (`src/components/pipeline/OpportunityDetail.tsx`). The underlying update call (`saveLeadData`) stays exactly as it is today.

## Behaviour after Save Changes

- Click Save Changes → run the existing save.
- On success: toast "Lead updated successfully.", close the dialog automatically, and refresh the Pipeline list (the existing query invalidation plus `onLeadUpdated` already drives this, so the updated row shows new values right away).
- On failure: dialog stays open, the real error message from the backend is shown in a destructive toast, and all field state is preserved (no reset, no close).

## Unsaved-changes guard on close

Today closing the dialog silently auto-saves. Replace that with an explicit guard:

- Track whether any editable field (notes, city, stage/status, priority, treatment types) differs from the loaded lead values.
- Close (X) or click outside with unsaved changes → confirmation dialog: "You have unsaved changes. Do you want to discard them?" with **Continue Editing** (stays open, keeps edits) and **Discard Changes** (closes without saving).
- No unsaved changes → close immediately, as now.

## Technical notes

- `handleSave` gets the success path: toast + `onOpenChange(false)`.
- `handleDialogClose` no longer calls `saveLeadData`; it compares current edit state to the lead snapshot and either closes or opens an `AlertDialog` confirmation.
- Inline auto-save on stage and priority dropdowns is unchanged, and those saves reset the dirty baseline so they don't trigger a false unsaved-changes prompt.
- No schema, query, or pipeline-page logic changes.
