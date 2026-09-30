# Intraoral Camera & Multi-Device Selector (Treatment & Clinical Photos)

Scope: only the live webcam capture in Clinic Workflow's Treatment & Clinical Photos section. Video recorder, upload logic, storage and schema stay unchanged.

## What staff will see
- A "Select Camera" dropdown directly above the live preview listing every connected camera (e.g. "Intraoral USB Camera", "Integrated Webcam").
- The last chosen camera is remembered on that computer and picked automatically next time.
- Plugging in or unplugging the USB intraoral camera updates the list instantly; if the active camera is unplugged, it switches to another available camera with a notice.
- Switching cameras swaps the live preview without closing the camera window.
- Capture never freezes the preview; a short "Capturing..." lock prevents double-clicks.

## Behaviour details
1. Device list: enumerate `videoinput` devices after permission is granted (so real labels appear). Labels: use the device label; if it contains words like "intraoral", "USB", "dental", "endoscope", show "Intraoral USB Camera – <label>"; built-in ones show "Integrated Webcam – <label>"; unnamed ones "Camera 1/2...".
2. Remember: save selected device ID in localStorage (`clinic_camera_device_id`); if that ID is no longer present, fall back to the first camera.
3. Hot-plug: listen to `devicechange`, refresh the list, restart the stream only if the active device disappeared.
4. Stream request order (fallback chain):
   - exact deviceId + ideal 1280x720 @30fps with min 640x480 @15fps
   - exact deviceId with no resolution limits
   - any camera (`video: true`)
   Stop the previous stream's tracks before starting a new one.
5. Anti-freeze capture: capture via canvas from the current frame after checking `videoWidth > 0` and track `readyState === "live"`; if the track ended/muted, auto-restart the stream once and show a message. Stream never stopped by capture.
6. Clear errors: not found / permission denied / camera busy (in use by another app) messages.
7. Cleanup: stop tracks and remove the listener when the camera window closes or the page unmounts.

## Technical section
- File: `src/pages/ClinicWorkflow.tsx` only (`startWebcam`, `captureFromWebcam`, `stopWebcam`, webcam preview JSX). Possibly extract a small `useCameraDevices` hook in `src/hooks/`.
- Uses existing shadcn `Select`; semantic tokens only.
- No database, storage, or other-step changes.
