# Captured Photos Gallery Below Live Camera

Scope: only the live camera capture in Treatment & Clinical Photos. Upload files, video recorder, the existing Saved Photos gallery, and storage/schema stay unchanged.

## Current behaviour
Capture uploads each shot straight away with no preview step. The upload stops silently when there is no active check-in, and it never checks whether saving the photo record worked. So a photo can seem "captured" but never show up.

## What staff will see
- A **Captured Photos (X)** section right under the Capture / Close Camera buttons, shown while the camera is open.
- Each shot appears at once as a thumbnail card with a time badge and three buttons:
  - **Preview**: opens a larger view.
  - **Delete**: removes that shot (for a retake).
  - **Save to Patient Record**: uploads it, marks it as "Saved", and adds it to the existing Saved Photos gallery.
- A **Save All** button saves every unsaved shot at once.
- With no shots yet, a message reads: "No photos captured yet. Click 'Capture Photo' to take shots."
- The camera stays open and keeps the selected camera between shots, so staff can take many angles in a row.
- After each shot, a "Photo captured successfully" message appears.
- If the camera picture isn't ready yet, a message reads: "Camera frame not ready. Please wait a second and try again."
- Saving shows a clear error if it fails, including when there is no active check-in. It no longer fails silently.
- When the camera closes with unsaved shots, staff are asked to confirm before those shots are thrown away.

## Technical section
- `src/pages/ClinicWorkflow.tsx` only.
- New local state `capturedShots: {id, blob, url (createObjectURL), takenAt, saved, saving}[]`.
- `captureFromWebcam`:
  - Check that `videoWidth`/`videoHeight` are not 0 and show the warning if they are.
  - Draw the frame to a canvas, then `toBlob` at jpeg 0.9, then append a shot.
  - Add debug `console.log` lines for canvas size, blob size and shot count.
  - The stream is never stopped.
- Save to Patient Record: reuse `handleUploadPhoto(file, "clinical", "", "")`.
  - Make it return success/failure.
  - Add error toasts for a missing patient or check-in and for a failed record insert.
  - Mark the shot as saved and refresh the gallery.
- Revoke object URLs on delete, on close, and when the page unmounts.
- Preview uses the existing Dialog. Only semantic tokens are used.
