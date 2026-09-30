# Auto-Save Captured Photos to Patient Record

Scope: only the live camera "Captured Photos" section in Treatment & Clinical Photos. Upload files, video, the Saved Photos gallery layout, storage and database stay unchanged.

## What staff will see
- Clicking **Capture Photo** adds the shot below the camera straight away with an "Uploading..." spinner, and saving starts on its own in the background.
- When saving works, the card shows a green **Saved** badge, a "Photo captured & saved to patient record" message appears, and the Saved Photos gallery refreshes.
- If saving fails (patient not checked in, network issue), an error message appears and the card shows a **Retry Save** button.
- The **Save** and **Save All** buttons are removed. **Preview** and **Delete** stay.
- **Delete** on a saved shot asks "Also remove this photo from the patient record?" If staff say yes, the photo is removed from the record and from storage. On an unsaved shot, Delete just removes it.
- Closing the camera asks for confirmation only if a shot is still uploading or failed to save.
- Staff can press Capture again and again. Each shot saves in the background without freezing the camera.

## Technical section
- `src/pages/ClinicWorkflow.tsx` only.
- Change `handleUploadPhoto` to take an optional `{ silent }` flag that skips the "Photo uploaded!" message, and to return the new record's `{ id, file_path }` (it will use `insert().select()`). Existing callers keep working.
- Add `recordId` / `filePath` / `failed` fields to each captured shot.
- `captureFromWebcam`: after adding the shot, call `saveShot(id)` without awaiting it. Each shot is saved separately, so fast captures run side by side.
- `saveShot`: on success show the combined message. On failure, set `failed: true` for Retry.
- Delete on a saved shot: after confirmation, remove the file from `clinical-photos` storage, delete the matching `clinical_photos` row, then call `fetchSavedPhotos()`.
- Close guard: ask only when a shot is saving or has `failed` set. Object URLs are still revoked on close.
- Use only semantic colour tokens (the "Saved" badge uses the existing success styling).
