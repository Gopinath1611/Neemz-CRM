export interface OfferClause { title: string; body: string }

export type LetterVars = Record<string, string>;
/** @deprecated kept for compatibility */
export type OfferVars = LetterVars;

export interface LetterField { k: string; label: string; type?: "text" | "date" | "select"; options?: string[]; required?: boolean }

export interface LetterConfig {
  kind: "offer" | "appointment" | "confirmation";
  title: string;            // printed heading
  docName: string;          // document name prefix
  templateKey: string;      // offer_letter_templates.template_key
  fields: LetterField[];
  defaults: LetterVars;
  clauses: OfferClause[];
  bar: { k: string; label: string }[];
  issueDateKey: string;
  signLeft: string;
  signRight: string;
  footerNote?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export const OFFER_CONFIG: LetterConfig = {
  kind: "offer",
  title: "OFFER LETTER",
  docName: "Offer Letter",
  templateKey: "default",
  fields: [
    { k: "candidate_name", label: "Candidate Full Name *", required: true },
    { k: "designation", label: "Position / Designation *", type: "select", required: true },
    { k: "department", label: "Department", type: "select" },
    { k: "date_of_offer", label: "Date of Offer", type: "date" },
    { k: "validity_date", label: "Offer Validity Date", type: "date" },
    { k: "date_of_joining", label: "Date of Joining", type: "date" },
    { k: "probation_months", label: "Probationary Period (months)", type: "select", options: ["1", "3", "6"] },
    { k: "reporting_authority", label: "Reporting Authority" },
    { k: "work_location", label: "Work Location" },
    { k: "shift_timings", label: "Shift Timings" },
    { k: "work_schedule", label: "Working Days" },
    { k: "notice_period", label: "Notice Period" },
    { k: "ctc", label: "Yearly CTC (optional)" },
  ],
  defaults: {
    candidate_name: "", designation: "", department: "", date_of_offer: today(), validity_date: "", date_of_joining: "",
    probation_months: "3",
    reporting_authority: "Digital Marketing Manager or designated administrative authority",
    work_location: "Salem Main Clinic (On-Site)",
    shift_timings: "09:30 AM to 06:30 PM",
    work_schedule: "Monday to Saturday (6-day work week)",
    notice_period: "30 days",
    ctc: "",
  },
  clauses: [
    { title: "Official Employment Offer", body: "Dear {candidate_name},\n\nWe are pleased to offer you the position of {designation} in the {department} department at Dr. Neemz Dentistry Pvt Ltd. This letter sets out the principal terms of your employment with us." },
    { title: "Corporate Overview", body: "Dr. Neemz Dentistry Pvt Ltd is a patient-first dental care organisation based in Salem, Tamil Nadu, committed to ethical, high-quality clinical care under the philosophy \"Smile Confident with Roots\"." },
    { title: "Appointment & Position Terms", body: "Designation: {designation}\nDepartment: {department}\nEmployment Type: Full-Time, Permanent\nReporting Authority: {reporting_authority}\nWork Location: {work_location}" },
    { title: "Schedule & Joining", body: "Date of Offer: {date_of_offer}\nOffer Valid Until: {validity_date}\nDate of Joining: {date_of_joining}\nWork Schedule: {work_schedule}\nShift Timings: {shift_timings}\nProbation Period: {probation_months} months" },
    { title: "Confidentiality & Governance", body: "You shall maintain strict confidentiality of all patient records, clinical data, business information and internal processes, during and after your employment, and comply with all company policies and codes of conduct." },
    { title: "Notice Period & Separation Terms", body: "Either party may terminate this employment by giving {notice_period} written notice, applicable both during probation and after confirmation." },
    { title: "Leave Policy & Compensation Framework", body: "Leave entitlements will follow the company leave policy in force. Your yearly CTC: {ctc}. Salary is subject to statutory deductions as applicable." },
  ],
  bar: [
    { k: "candidate_name", label: "Name" }, { k: "designation", label: "Position" },
    { k: "department", label: "Department" }, { k: "date_of_offer", label: "Date of Offer" },
  ],
  issueDateKey: "date_of_offer",
  signLeft: "Authorized Signatory (Employer)<br/>Dr. Neemz Dentistry Pvt Ltd",
  signRight: "Candidate Acceptance Signature &amp; Date",
};

export const APPOINTMENT_CONFIG: LetterConfig = {
  kind: "appointment",
  title: "APPOINTMENT ORDER",
  docName: "Appointment Order",
  templateKey: "appointment",
  fields: [
    { k: "candidate_name", label: "Candidate Full Name *", required: true },
    { k: "designation", label: "Position / Posting *", required: true },
    { k: "department", label: "Department", type: "select", options: ["Clinical", "Non Clinical", "Finance", "Management"] },
    { k: "order_no", label: "Appointment Order No (DND/AP/...)" },
    { k: "date_of_order", label: "Date of Order", type: "date" },
    { k: "effective_date", label: "Effective Date", type: "date" },
    { k: "employment_type", label: "Employment Type", type: "select", options: ["Full-Time Permanent", "Part-Time", "Contractual"] },
    { k: "probation_months", label: "Probationary Period (months)", type: "select", options: ["3", "6"] },
    { k: "reporting_authority", label: "Reporting Authority" },
    { k: "work_location", label: "Work Location" },
    { k: "employer_name", label: "Employer Signatory Name" },
    { k: "employer_designation", label: "Employer Designation" },
  ],
  defaults: {
    candidate_name: "", designation: "", department: "Non Clinical", order_no: "", date_of_order: today(), effective_date: "",
    employment_type: "Full-Time Permanent", probation_months: "3",
    reporting_authority: "", work_location: "Salem Main Clinic (On-Site)",
    employer_name: "Karthikeyan Nallathambi", employer_designation: "Chief Executive Officer (CEO)",
  },
  clauses: [
    { title: "Official Employment Confirmation", body: "DR. NEEMZ DENTISTRY PVT LTD hereby formally appoints {candidate_name} as {designation} under {department} Operations, recognizing the position as a key executive-support and organizational coordination function. The appointment is on a {employment_type} Employment basis, effective {effective_date}, subject to the organization's applicable employment terms, governance standards, policies, and performance framework." },
    { title: "About Us - Corporate Overview", body: "DR. NEEMZ DENTISTRY PVT LTD delivers compassionate, state-of-the-art care specializing in innovative dental implants and ortho-cosmetic treatments tailored to every unique smile and aesthetic goal. We build lasting relationships rooted in trust, patient comfort, and education, empowering future generations to take control of their long-term oral health. Our mission integrates oral healthcare excellence with environmental sustainability and community wellbeing." },
    { title: "Appointment Order Reference & Formal Transmittal", body: "Appointment Order No: DND/AP/{order_no}\nAppointment Order Date: {date_of_order}\nEffective Date: {effective_date}\n\nTo:\n{candidate_name}\n\nSUBJECT: APPOINTMENT AS {designation}\n\nDear {candidate_name}, With reference to the Offer Letter issued by DR. NEEMZ DENTISTRY PVT LTD and duly accepted by you, the organization hereby formally appoints you as {designation} under the {department} Operations function, effective {effective_date}. This Appointment Order constitutes the formal record of your appointment and shall be read together with the applicable Annexures A–H, which establish the detailed employment, operational, performance, compensation, governance and confidentiality frameworks applicable to your position." },
    { title: "Positional Terms", body: "A. DESIGNATION: You are appointed as {designation} at {work_location}.\nB. DEPARTMENT: Your position is formally classified under the {department} department.\nC. EMPLOYMENT TYPE: Your appointment is rendered on a {employment_type} Employment arrangement. Regarding your detailed functional key result areas and daily duties, you will be informed in Annexure A: Role and Responsibility Charter in detail.\nD. REPORTING AUTHORITY: You will report directly to the {reporting_authority}.\nE. WORK LOCATION: Your primary work location will be at the {work_location}. Your location may be reassigned based on operational requirements of DR. NEEMZ DENTISTRY PVT LTD.\nF. PROBATIONARY ASSESSMENT & EMPLOYMENT CONFIRMATION: You will undergo an initial probationary period of {probation_months} Months. Your performance, conduct, attendance, and adherence to organizational policies will be assessed during this period, and employment confirmation will be subject to successful completion of the probationary assessment." },
    { title: "Governing Employment Framework", body: "Annexure A — Roles & Responsibilities\nAnnexure B — SOP & Process Compliance\nAnnexure C — KPI & Performance Framework\nAnnexure D — Incentive Plan — If Applicable\nAnnexure E — Compensation & Benefits Schedule\nAnnexure F — Employment Terms & Governance Framework\nAnnexure G — Salary Structure & Component Ratio Framework\nAnnexure H — Confidentiality, Compliance & Corporate Standards (NDA)\n\n* These Annexures form the detailed framework applicable to your employment and shall be accessed through the controlled document repository provided by the organization." },
    { title: "Acceptance of Appointment", body: "By signing this Appointment Order, you acknowledge that:\n• You have received the formal Appointment Order. You acknowledge your appointment as {designation}.\n• You understand that your employment is governed by the applicable organizational framework.\n• You acknowledge access to the applicability and adherence to the Annexures A–H.\n• You agree to comply with the applicable organizational policies, SOPs, KPIs, confidentiality requirements and governance standards." },
    { title: "Authorization and Mutual Acceptance", body: "For DR. NEEMZ DENTISTRY PVT LTD\nEmployer: {employer_name}\nDesignation: {employer_designation}\n\nEmployee Acknowledgment\nI, {candidate_name}, acknowledge receipt of this Appointment Order and confirm my acceptance of the appointment as {designation} with DR. NEEMZ DENTISTRY PVT LTD, effective {effective_date}. I further acknowledge that the applicable Annexures A–H, together with the organization's controlled policies, SOPs, KPI framework and corporate standards, constitute the applicable employment framework." },
  ],
  bar: [
    { k: "candidate_name", label: "Candidate Name" }, { k: "designation", label: "Position Title" },
    { k: "department", label: "Department Title" }, { k: "date_of_order", label: "Date of Order" },
  ],
  issueDateKey: "date_of_order",
  signLeft: "Authorised Signatory<br/>Dr. Neemz Dentistry Pvt Ltd",
  signRight: "Candidate Signature &amp; Date",
};

export const CONFIRMATION_CONFIG: LetterConfig = {
  kind: "confirmation",
  title: "CONFIRMATION ORDER",
  docName: "Confirmation Order",
  templateKey: "confirmation",
  fields: [
    { k: "candidate_name", label: "Candidate / Employee Name *", required: true },
    { k: "designation", label: "Position Title / Designation *", required: true },
    { k: "department", label: "Department Title", type: "select", options: ["Clinical", "Non Clinical", "Finance", "Management"] },
    { k: "date_of_order", label: "Date of Order", type: "date" },
    { k: "probation_months", label: "Probation Duration (months)", type: "select", options: ["3", "6"] },
    { k: "effective_date", label: "Effective Date", type: "date" },
    { k: "order_no", label: "Confirmation Order No (e.g. DND/CO/2026/001)" },
    { k: "employer_name", label: "Employer Signatory Name" },
    { k: "employer_designation", label: "Employer Designation" },
  ],
  defaults: {
    candidate_name: "", designation: "", department: "Non Clinical", date_of_order: today(), probation_months: "3",
    effective_date: "", order_no: `DND/CO/${new Date().getFullYear()}/`,
    employer_name: "Karthikeyan Nallathambi", employer_designation: "Chief Executive Officer (CEO)",
  },
  clauses: [
    { title: "Official Employment Confirmation", body: "Dear {candidate_name}, Consequent to the successful completion of your {probation_months} month's probationary assessment and subsequent evaluation of your operational performance, leadership alignment, and institutional contributions, the Management of DR. NEEMZ DENTISTRY PVT. LTD. is pleased to officially confirm your employment as a Permanent Full-Time Employee in the position of {designation}, effective {effective_date}." },
    { title: "About Dr. Neemz Dentistry Pvt Ltd - Corporate Overview", body: "DR. NEEMZ DENTISTRY delivers compassionate, state-of-the-art care specializing in innovative dental implants and ortho-cosmetic treatments tailored to every unique smile and aesthetic goal. We build lasting relationships rooted in trust, patient comfort, and education, empowering future generations to take control of their long-term oral health. Our mission integrates oral healthcare excellence with environmental sustainability and community wellbeing." },
    { title: "Confirmation Order Reference and Formal Transmittal", body: "Confirmation Order No: {order_no}\nConfirmation Order Date: {date_of_order}\nEffective Date: {effective_date}\n\nTo:\n{candidate_name}\n\nSUBJECT: Official Order of Employment confirmation (PERMANENT CADRE)\nWith reference to the Appointment Order issued, we acknowledge your satisfactory completion of the probationary period and hereby confirm your employment under the Permanent Cadre, subject to the applicable Annexures, operational charters, and institutional policies. Your compensation shall be governed by the applicable organizational structure and terms in force, with any applicable changes communicated through the relevant Annexure." },
    { title: "Continuation of Employment Terms", body: "Except as specifically revised by this Confirmation Order, all other terms and conditions contained in the Appointment Order, applicable annexures, policies, SOPs, confidentiality obligations, and company rules shall continue to remain valid and binding." },
    { title: "Continuing Performance Expectations", body: "Confirmation of employment does not exempt the employee from continued performance evaluation, KPI achievement, conduct requirements, policy compliance, or disciplinary action as applicable under company policy." },
    { title: "Authorization and Mutual Acceptance", body: "FOR DR. NEEMZ DENTISTRY\nEmployer: {employer_name}\nDesignation: {employer_designation}\nDate: {date_of_order}\n\nEMPLOYEE ACKNOWLEDGMENT\nI, {candidate_name}, acknowledge receipt of this Confirmation Order and confirm my acceptance of the confirmed permanent status and revised remuneration structure with DR. NEEMZ DENTISTRY PVT. LTD.\nEmployee Name: {candidate_name}    Effective Date: {effective_date}" },
  ],
  bar: [
    { k: "candidate_name", label: "Candidate Name" }, { k: "designation", label: "Position Title" },
    { k: "department", label: "Department Title" }, { k: "date_of_order", label: "Date of Order" },
  ],
  issueDateKey: "date_of_order",
  signLeft: "Authorised Signatory<br/>Dr. Neemz Dentistry Pvt Ltd",
  signRight: "Candidate Signature &amp; Date",
};

const fmtDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};

export const displayVars = (v: LetterVars): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.keys(v).forEach((k) => {
    const raw = (v[k] || "").trim();
    out[k] = raw ? (k.includes("date") ? fmtDate(raw) : raw) : "__________";
  });
  if ("ctc" in v && !v.ctc.trim()) out.ctc = "As per the enclosed salary structure";
  return out;
};

export const fillTokens = (text: string, v: LetterVars) => {
  const d = displayVars(v);
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in d ? d[k] : m));
};

export const OFFER_BRAND = {
  name: "DR. NEEMZ DENTISTRY PVT LTD",
  tagline: "Smile Confident with Roots | Salem, Tamil Nadu",
};
