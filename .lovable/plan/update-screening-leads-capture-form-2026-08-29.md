# Update Screening Leads Capture Form

## Goal
Make minimal, targeted UI changes to the **Capture Lead / Screening Leads** form inside **Sales & Marketing → Offline Campaigns → Screening Leads** tab only.

## Scope
- Only `src/pages/OfflineCampaigns.tsx` will be edited.
- Only the lead capture/edit dialog form fields are affected.
- No database schema changes, no other tabs, no other modules.

## Changes

### 1. Chief Complaint → Dropdown + conditional "Other" text
- Replace the current free-text `Input` for **Chief Complaint** with a single-select `Select` dropdown.
- Options: `Toothache`, `Bleeding Gums`, `Sensitivity`, `Bad Breath`, `Broken/Chipped Tooth`, `Cavity`, `Swelling`, `Routine Checkup`, `Other`.
- When **Other** is selected, render a small free-text `Input` directly below the dropdown with placeholder "Specify chief complaint".
- Store the final value in the existing `chief_complaint` field:
  - For predefined options: store the option text.
  - For Other: store the custom text entered (or a fallback like `Other` if left blank).
- On edit load: if the saved `chief_complaint` value does not match any predefined option, pre-select `Other` and populate the custom text input with the saved value.

### 2. Screening Findings — unchanged
- Keep the existing `Textarea` exactly as-is (free text, same label, same rows).

### 3. Recommended Treatment — remove
- Remove the **Recommended Treatment** text input field from the form entirely.
- Keep the **Treatment Tags** multi-select chip section unchanged below it.
- The `recommended_treatment` DB column will simply be left unused in this form (no schema change). Existing references outside this form (e.g., coupon WhatsApp message fallback) remain untouched.

## Implementation Notes
- Reuse existing shadcn components already imported (`Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Input`, `Label`, `Textarea`).
- Add local state for the conditional "Other" text input (e.g., `chiefComplaintOther`) inside the component.
- Update the `leadForm` `onValueChange` handlers only for `chief_complaint`.
- Preserve existing spacing, light theme, and styling.
- No validation logic changes beyond the dropdown behavior.

## Verification
- Open the Screening Leads tab and click **Capture Lead**.
- Confirm Chief Complaint is a dropdown with all 9 options.
- Select **Other** and verify the specify input appears.
- Confirm Screening Findings is still a textarea.
- Confirm Recommended Treatment field is gone and Treatment Tags chips remain.
- Save a lead with a predefined option and one with Other, then edit each to confirm correct load state.
