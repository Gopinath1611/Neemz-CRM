# Surgery Consent Form in Treatment Summary

## Scope
Add a second consent template inside Clinic Workflow → Treatment Summary & Documents → Consent. The existing Treatment Consent Form remains the default and keeps its current fields and actions unchanged.

## Implementation
- Add a template selector with:
  - Treatment Consent Form
  - Surgery Consent Form
- Build the Surgery Consent Form as a dedicated frontend-only component used only by the Consent tab.
- Keep all surgery-only values in local screen state, reset naturally when the page/session is reopened, and make no database or schema changes.
- Auto-fill only Patient Name and Date. Keep OP/Reg No, Age, Sex, procedure choice, Tooth #, Oral Surgeon, Witness name, and Clinical Team Reg. No manually editable.
- Reproduce the attached one-page bilingual form structure:
  - centered clinic heading and tagline
  - demographics and clinical metadata table
  - exact 10-row English/Tamil surgical-risk table
  - bilingual understanding/counseling section
  - bilingual declaration section
  - four requested signature/details areas
  - confidentiality footer
- Use the existing Add Signature dialog for the patient/guardian signature. Show the manually entered surgeon and witness names in their respective signature blocks.
- Reuse the existing Print, WhatsApp, and SMS actions, but feed them the live surgery-form values through a surgery-specific printable/text representation so unsaved input values are included correctly.
- Do not show a persistence action for surgery-only fields; the existing Treatment Consent Form and its Save behavior remain unchanged.

## Validation
- Confirm the selector defaults to Treatment Consent Form and the existing form is unchanged.
- Switch to Surgery Consent Form and verify Patient Name and Date auto-fill.
- Fill every manual field, choose sex and procedure options, add a signature, and verify the on-screen form updates.
- Verify print output includes the bilingual content, current field values, selected options, signature, and footer in a clean one-page-style layout.
- Verify WhatsApp and SMS content reflects the currently entered surgery values.
- Check desktop and mobile layouts, including horizontal containment of the risk table.
- Confirm no other tabs, queue, pages, backend, schema, or stored records changed.
