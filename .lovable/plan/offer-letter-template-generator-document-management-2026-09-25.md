# Offer Letter Template & Generator (Document Management)

Only Document Management changes. Clinic, patient, billing, prescription and payroll are not touched.

## What you will see
- **Document Management > Categories:** the "Offer Letter" row gets a new "Configure / Generate" button. It opens a window with two tabs:
  1. **Template:** you can edit the default wording of each of the 7 clauses. Placeholders like `{candidate_name}` can be inserted with one click from a list. There are Save and "Reset to default" buttons.
  2. **Generate:** a form with Candidate Name, Designation, Department, Date of Offer, Validity Date, Date of Joining, Probation (3 or 6 months), Reporting Authority, Work Location, Shift Timings, Working Days, Notice Period and optional CTC / monthly package. The defaults from your brief are filled in already. Optionally, pick an existing employee to link the letter to.
- **Live A4 preview:** the header shows "DR. NEEMZ DENTISTRY PVT LTD", "Smile Confident with Roots | Salem, Tamil Nadu" and the clinic logo from Clinic Settings. Below that come the "OFFER LETTER" title, a candidate summary bar (Name | Position | Department | Date of Offer) and clauses 1–7 with your values filled in. At the bottom are signature lines for "Authorized Signatory (Employer)" and "Candidate Acceptance Signature & Date".
- **Print / Save PDF:** opens a clean A4 print of just the letter, without buttons or menus. This works the same way as the payslip print.
- **Save to Employee Documents:** creates a PDF of the letter and saves it to the chosen employee's documents under the "Offer Letter" category. It then appears in the Employee Documents list. This button is disabled until an employee is selected.

## Needs one small backend addition
The edited template has to be stored so every admin sees the same wording. This needs one new small table for offer letter templates, readable by staff and editable by admin/HR. No existing table changes.

## Technical details
- New files:
  - `src/components/documents/OfferLetterGeneratorModal.tsx` (tabs, form, template editor, actions)
  - `src/components/documents/OfferLetterPreview.tsx` (A4 markup plus print HTML builder)
  - `src/lib/offerLetterTemplate.ts` (default clauses and `{token}` replacement)
- Branding comes from the existing `fetchClinicBranding`. The name is forced to "Dr. Neemz Dentistry Pvt Ltd", the same approach as the payslip.
- Migration: `offer_letter_templates` (id, clauses jsonb, updated_by, updated_at), with grants, RLS (authenticated can select; `is_hr_or_admin` can insert/update) and a single-row upsert.
- The PDF is made with jsPDF + html2canvas, the tools the existing pdf helpers already use (to be confirmed at build time). It is uploaded to the `hr-documents` bucket at `<employee_id>/offer-letter-<timestamp>.pdf`, then an `employee_documents` row is inserted using the existing columns.
- `DocumentManagement.tsx`: add the button only, shown when the category name matches "Offer Letter". If that category doesn't exist yet, create it from Categories.
