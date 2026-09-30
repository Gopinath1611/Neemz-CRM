import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";
import { MessageCircle, PenLine, Phone, Printer } from "lucide-react";

interface SurgeryConsentPatient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

interface SurgeryConsentFormProps {
  patient: SurgeryConsentPatient | null;
  date: string;
  onDateChange: (date: string) => void;
  signature: string;
  onAddSignature: () => void;
}

type Procedure = "Surgical Extraction" | "Disimpaction" | "Alveoloplasty";

const procedures: Procedure[] = ["Surgical Extraction", "Disimpaction", "Alveoloplasty"];

const risks = [
  {
    title: "Swelling & Pain",
    english: "Post-operative swelling, pain, and discomfort. Medicines prescribed if needed along with several days of rest.",
    tamilTitle: "வீக்கம் மற்றும் வலி",
    tamil: "சிகிச்சைக்குப் பின் சில நாட்கள் வீக்கம், வலி மற்றும் அசௌகரியம் ஏற்படலாம். தேவைப்பட்டால் மருந்துகள் பரிந்துரைக்கப்படும் மற்றும் ஓய்வு தேவைப்படும்.",
  },
  {
    title: "Medication & Anesthesia Reactions",
    english: "Allergic or unexpected adverse reactions to medications or anesthesia, which may rarely require additional medical care.",
    tamilTitle: "மருந்து மற்றும் மயக்க மருந்து ஒவ்வாமை",
    tamil: "உட்கொள்ளும் மருந்துகள் அல்லது மயக்க மருந்துகளினால் ஒவ்வாமை ஏற்படின் கூடுதல் சிகிச்சை தேவைப்படலாம்.",
  },
  {
    title: "Sutures (Stitches) Care",
    english: "Sutures may be placed to support gum healing and help control bleeding. They will be assessed during follow-up and safely removed by the dentist, if required, depending on the healing process.",
    tamilTitle: "தையல் (Sutures) போடுதல்",
    tamil: "ஈறுகள் சீராகக் குணமடையவும், இரத்தப்போக்கைக் கட்டுப்படுத்தவும் தையல்கள் (Sutures) போடப்படலாம். குணமடையும் நிலையைப் பொறுத்து, அடுத்தடுத்த பரிசோதனையின் போது அவை பல் மருத்துவரால் பாதுகாப்பாக மதிப்பீடு செய்யப்பட்டு, தேவையான போது அகற்றப்படும்.",
  },
  {
    title: "Prolonged Bleeding",
    english: "Continuous or heavy bleeding may occasionally occur, requiring pressure packs or additional clinical care.",
    tamilTitle: "நீண்ட இரத்தப்போக்கு",
    tamil: "சில நேரங்களில் அதிக இரத்தப்போக்கு அல்லது இரத்தக் கசிவு ஏற்படலாம்; இதனை நிறுத்த அழுத்தக் கட்டு அல்லது சிகிச்சை தேவைப்படலாம்.",
  },
  {
    title: "Adjacent Teeth / Restorations",
    english: "Potential risk of slight loosening, chipping, or dislodgement of adjacent teeth, crowns, or dental fillings.",
    tamilTitle: "அருகிலுள்ள பற்கள் / அடைப்புகள் சேதம்",
    tamil: "பல் எடுக்கும் போது அருகிலுள்ள பற்கள், உறைகள் (Crowns) அல்லது பல் அடைப்புகள் தளர்வடையவோ அல்லது சேதமடையவோ வாய்ப்புள்ளது.",
  },
  {
    title: "Infection & Healing",
    english: "Localized infection or delayed healing (dry socket) requiring antiseptic socket care and medicines prescribed if needed.",
    tamilTitle: "தொற்று மற்றும் காயம் ஆற தாமதம்",
    tamil: "பல் எடுத்த இடத்தில் தொற்று அல்லது காயம் ஆற தாமதம் ஏற்படலாம்; இதற்கு சிகிச்சை மற்றும் தேவைப்பட்டால் மருந்துகள் வழங்கப்படும்.",
  },
  {
    title: "Retained Root Fragment",
    english: "A decision to leave a minute root tip when its removal risks severe damage to adjacent nerves or maxillary sinus.",
    tamilTitle: "வேர்த்துண்டு தாடையில் தங்குதல்",
    tamil: "ஆழமான சிறிய வேர்த்துண்டை எடுப்பது நரம்புக்கோ அல்லது சைனஸிற்கோ அதிக ஆபத்து எனில், அது பாதுகாப்பாக தாடையிலேயே விடப்படலாம்.",
  },
  {
    title: "Jaw Bone Fracture",
    english: "A rare crack or fracture of the jaw bone that may occur only during complicated, deeply impacted tooth extractions.",
    tamilTitle: "தாடை எலும்பு முறிவு",
    tamil: "மிகவும் கடினமான அல்லது ஆழமாகப் புதைந்துள்ள பல்லை எடுக்கும் போது மிக அரிதாக தாடை எலும்பு முறிவு ஏற்படலாம்.",
  },
  {
    title: "Nerve Sensory Disturbances",
    english: "Nerve irritation causing temporary numbness in lip, chin, cheek, gums, or tongue (rarely permanent).",
    tamilTitle: "நரம்பு மரத்துப்போதல்",
    tamil: "நரம்பு அழுத்தத்தால் உதடு, நாக்கு, ஈறு அல்லது கன்னத்தில் உணர்வின்மை / மரத்துப்போதல் ஏற்படலாம் (அரிதாக நிரந்தரம்).",
  },
  {
    title: "Unforeseen Conditions",
    english: "Authorization for DR. NEEMZ DENTISTRY surgeons to use professional judgment to perform necessary modified procedures.",
    tamilTitle: "எதிர்பாராத மாற்றங்கள்",
    tamil: "சிகிச்சையின் போது எதிர்பாராத நிலை ஏற்பட்டால், நலம் கருதி தேவையான மாற்றங்களைச் செய்ய மருத்துவருக்கு முழு அனுமதி அளிக்கிறேன்.",
  },
];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character] ?? character));

const displayDate = (date: string) => {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
};

const SurgeryConsentForm = ({ patient, date, onDateChange, signature, onAddSignature }: SurgeryConsentFormProps) => {
  const [opNumber, setOpNumber] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [selectedProcedures, setSelectedProcedures] = useState<Procedure[]>([]);
  const [toothNumber, setToothNumber] = useState("");
  const [oralSurgeon, setOralSurgeon] = useState("");
  const [witnessName, setWitnessName] = useState("");
  const [clinicalRegNumber, setClinicalRegNumber] = useState("");

  const patientName = patient ? `${patient.first_name} ${patient.last_name}`.trim() : "";

  const toggleProcedure = (procedure: Procedure, checked: boolean) => {
    setSelectedProcedures((current) => checked
      ? [...current.filter((item) => item !== procedure), procedure]
      : current.filter((item) => item !== procedure));
  };

  const textContent = useMemo(() => {
    const procedureText = selectedProcedures.length ? selectedProcedures.join(", ") : "—";
    return [
      "DR. NEEMZ DENTISTRY PVT LTD",
      "SURGERY CONSENT FORM / பல் அகற்றல் / அறுவை சிகிச்சை ஒப்புதல் படிவம்",
      `Patient Name: ${patientName || "—"}`,
      `OP / Reg. No: ${opNumber || "—"}`,
      `Age / Sex: ${age || "—"} / ${sex || "—"}`,
      `Date: ${displayDate(date)}`,
      `Proposed Procedure: ${procedureText}`,
      `Tooth #: ${toothNumber || "—"}`,
      `Oral Surgeon: ${oralSurgeon || "—"}`,
      "",
      "10 INHERENT SURGICAL RISKS & SIDE EFFECTS",
      ...risks.map((risk, index) => `${index + 1}. ${risk.title}: ${risk.english}\n   ${risk.tamilTitle}: ${risk.tamil}`),
      "",
      "UNDERSTANDING & NO GUARANTEE: The surgeon at DR. NEEMZ DENTISTRY PVT LTD has clearly explained the surgery, post-operative care, and alternatives. I understand that medical/dental surgery cannot carry a 100% unconditional guarantee. All my questions have been answered satisfactorily.",
      "புரிதல் & மாற்று வழிகள்: DR. NEEMZ DENTISTRY PVT LTD மருத்துவர் அளித்த அறுவை சிகிச்சை முறைகள், பின் பராமரிப்பு மற்றும் மாற்று சிகிச்சை வழிகளை நான் தெளிவாகப் புரிந்து கொண்டேன். மருத்துவ சிகிச்சையில் 100% முழு உத்தரவாதம் அளிக்க முடியாது என்பதை அறிவேன். எனது சந்தேகங்கள் தீர்க்கப்பட்டன.",
      "",
      "DECLARATION: I certify that all blanks were filled prior to signing. I understand English / தமிழ் and authorize DR. NEEMZ DENTISTRY to proceed with oral surgery and anesthesia.",
      "உறுதிமொழி: படிவத்தில் உள்ள அனைத்து விவரங்களும் கையொப்பமிடுவதற்கு முன்பே பூர்த்தி செய்யப்பட்டன. நான் இதை முழுமையாகப் புரிந்து கொண்டு, அறுவை சிகிச்சை மற்றும் மயக்க முறைக்கு முழு சம்மதம் அளிக்கிறேன்.",
      `Operating Surgeon: ${oralSurgeon || "—"}`,
      `Clinical Team Reg. No: ${clinicalRegNumber || "—"}`,
      `Clinical Witness: ${witnessName || "—"}`,
    ].join("\n");
  }, [age, clinicalRegNumber, date, opNumber, oralSurgeon, patientName, selectedProcedures, sex, toothNumber, witnessName]);

  const buildPrintHtml = () => {
    const procedureBox = (procedure: Procedure) => `${selectedProcedures.includes(procedure) ? "☑" : "☐"} ${procedure}`;
    const signatureHtml = signature
      ? signature.startsWith("data:")
        ? `<img src="${signature}" alt="Patient signature" class="signature-image" />`
        : `<div class="typed-signature">${escapeHtml(signature)}</div>`
      : "";
    const riskRows = risks.map((risk, index) => `
      <tr><td class="number">${index + 1}</td><td><b>${risk.title}:</b> ${risk.english}</td><td lang="ta"><b>${risk.tamilTitle}:</b> ${risk.tamil}</td></tr>`).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>Surgery Consent Form</title><style>
      @page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans Tamil",sans-serif;color:#111;margin:0;font-size:8.4px;line-height:1.2}.header{display:flex;justify-content:space-between;align-items:flex-start;background:#7cb342;padding:7px 9px}.clinic{font-size:18px;font-weight:800}.tagline{font-size:9px;margin-top:2px}.form-title{background:#fff;border:1px solid #5f902e;border-radius:4px;padding:4px 10px;text-align:center;font-weight:800;font-size:10px}.intro{border:1px solid #7cb342;border-top:0;padding:5px}.section-title{font-size:9px;font-weight:800;text-transform:uppercase;background:#7cb342;border:1px solid #7cb342;padding:4px;margin:4px 0 0}.grid{display:grid;border-left:1px solid #7cb342;border-top:1px solid #7cb342}.demographics{grid-template-columns:1.5fr .8fr .8fr .9fr}.procedures{grid-template-columns:1.4fr 1fr}.cell{min-height:33px;border-right:1px solid #7cb342;border-bottom:1px solid #7cb342;padding:4px}.cell{background:#f1f8e9}.label{font-weight:800;font-size:7.5px}.value{font-size:9px;margin-top:5px;min-height:10px}.risk-table{width:100%;border-collapse:collapse;margin:0}.risk-table th,.risk-table td{border:1px solid #7cb342;padding:3px;vertical-align:top;text-align:left}.risk-table th{text-align:center;background:#f1f8e9;font-size:7.3px}.risk-table td{font-size:7.4px;line-height:1.14}.risk-table .number{width:20px;text-align:center;font-weight:700}.bilingual{grid-template-columns:1fr 1fr}.bilingual .cell{min-height:auto}.signatures{display:grid;grid-template-columns:repeat(4,1fr);border-left:1px solid #7cb342}.signature{min-height:83px;border-right:1px solid #7cb342;border-bottom:1px solid #7cb342;padding:4px;display:flex;flex-direction:column}.signature-space{flex:1;border:1px dashed #7cb342;background:#fff;margin:5px 0;min-height:34px;display:flex;align-items:center;justify-content:center}.signature-image{max-width:100%;max-height:32px}.typed-signature{font-weight:700;font-style:italic;font-size:10px}.footer{font-size:7px;font-style:italic;font-weight:700;border:1px solid #7cb342;border-top:0;padding:3px}.print-footer{text-align:center;font-size:6.8px;font-weight:700;margin-top:8px}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>
      <header class="header"><div><div class="clinic">DR. NEEMZ DENTISTRY PVT LTD</div><div class="tagline">Smile Confident with Roots • Salem, Tamil Nadu</div></div><div class="form-title">SURGERY CONSENT FORM<br><span lang="ta">பல் அகற்றல் / அறுவை சிகிச்சை ஒப்புதல் படிவம்</span></div></header>
      <div class="intro"><b>DR. NEEMZ DENTISTRY PVT LTD SURGICAL CARE / எங்கள் நோக்கம்:</b> DR. NEEMZ DENTISTRY delivers compassionate, state-of-the-art surgical care specializing in innovative dental implants, minor oral surgery, and disimpactions. We build lasting relationships rooted in trust, patient comfort, and education. நோயாளிகளின் பாதுகாப்பு, வலி இல்லாத சிகிச்சை மற்றும் முழுமையான சுகாதாரம் எங்களது உறுதிமொழியாகும்.</div>
      <div class="section-title">1. PATIENT DEMOGRAPHICS & CLINICAL METADATA / நோயாளி மற்றும் சிகிச்சை விவரங்கள்</div>
      <div class="grid demographics"><div class="cell"><div class="label">PATIENT NAME / நோயாளியின் பெயர்:</div><div class="value">${escapeHtml(patientName)}</div></div><div class="cell"><div class="label">OP / REG. NO / பதிவெண்:</div><div class="value">${escapeHtml(opNumber)}</div></div><div class="cell"><div class="label">AGE / SEX / வயது / பாலினம்:</div><div class="value">${escapeHtml(age)} &nbsp; ${sex === "M" ? "☑ M ☐ F" : sex === "F" ? "☐ M ☑ F" : "☐ M ☐ F"}</div></div><div class="cell"><div class="label">DATE / தேதி (DD/MM/YYYY):</div><div class="value">${escapeHtml(displayDate(date))}</div></div></div>
      <div class="grid procedures"><div class="cell"><div class="label">PROPOSED PROCEDURE / சிகிச்சை முறை:</div><div class="value">${procedures.map(procedureBox).join(" &nbsp; ")} &nbsp; | &nbsp; Tooth #: ${escapeHtml(toothNumber)}</div></div><div class="cell"><div class="label">ORAL SURGEON / அறுவை சிகிச்சை சிறப்பு மருத்துவர்:</div><div class="value">${escapeHtml(oralSurgeon)}</div></div></div>
      <div class="section-title">2. 10 INHERENT SURGICAL RISKS & SIDE EFFECTS / 10 அறுவை சிகிச்சை பக்கவிளைவுகள் & அபாயங்கள்</div>
      <table class="risk-table"><thead><tr><th>#</th><th>ENGLISH EXPLANATION (SIMPLE & CLEAR)</th><th>TAMIL EXPLANATION / எளிய தமிழ் விளக்கம்</th></tr></thead><tbody>${riskRows}</tbody></table>
      <div class="section-title">3. BILINGUAL PATIENT UNDERSTANDING & COUNSELING / நோயாளி புரிதல் & மருத்துவர் விளக்கம்</div>
      <div class="grid bilingual"><div class="cell"><b>UNDERSTANDING & NO GUARANTEE:</b> The surgeon at <b>DR. NEEMZ DENTISTRY PVT LTD</b> has clearly explained the surgery, post-operative care, and alternatives. I understand that medical/dental surgery cannot carry a 100% unconditional guarantee. All my questions have been answered satisfactorily.</div><div class="cell" lang="ta"><b>புரிதல் & மாற்று வழிகள்:</b> DR. NEEMZ DENTISTRY PVT LTD மருத்துவர் அளித்த அறுவை சிகிச்சை முறைகள், பின் பராமரிப்பு மற்றும் மாற்று சிகிச்சை வழிகளை நான் தெளிவாகப் புரிந்து கொண்டேன். மருத்துவ சிகிச்சையில் 100% முழு உத்தரவாதம் அளிக்க முடியாது என்பதை அறிவேன். எனது சந்தேகங்கள் தீர்க்கப்பட்டன.</div></div>
      <div class="section-title">4. BILINGUAL PATIENT DECLARATION & CONSENT / நோயாளி உறுதிமொழி மற்றும் ஒப்புதல் கையொப்பம்</div>
      <div class="grid bilingual"><div class="cell"><b>DECLARATION:</b> I certify that all blanks were filled prior to signing. I understand English / தமிழ் and authorize <b>DR. NEEMZ DENTISTRY</b> to proceed with oral surgery and anesthesia.</div><div class="cell" lang="ta"><b>உறுதிமொழி:</b> படிவத்தில் உள்ள அனைத்து விவரங்களும் கையொப்பமிடுவதற்கு முன்பே பூர்த்தி செய்யப்பட்டன. நான் இதை முழுமையாகப் புரிந்து கொண்டு, அறுவை சிகிச்சை மற்றும் மயக்க முறைக்கு முழு சம்மதம் அளிக்கிறேன்.</div></div>
      <div class="signatures"><div class="signature"><b>PATIENT / GUARDIAN SIGNATURE</b><span lang="ta">நோயாளி / பாதுகாவலர் கையொப்பம்</span><div class="signature-space">${signatureHtml}</div><b>DATE / தேதி: ${escapeHtml(displayDate(date))}</b></div><div class="signature"><b>OPERATING SURGEON SIGNATURE</b><span lang="ta">அறுவை சிகிச்சை நிபுணர் கையொப்பம்</span><div class="signature-space"></div><b>${escapeHtml(oralSurgeon)}</b></div><div class="signature"><b>CLINICAL TEAM REG. NO</b><span lang="ta">மருத்துவக் குழு பதிவெண்</span><div class="signature-space"></div><b>${escapeHtml(clinicalRegNumber)}</b></div><div class="signature"><b>CLINICAL WITNESS & DATE</b><span lang="ta">சாட்சி கையொப்பம் மற்றும் தேதி</span><div class="signature-space"></div><b>${escapeHtml(witnessName)} · ${escapeHtml(displayDate(date))}</b></div></div>
      <div class="footer">* DR. NEEMZ DENTISTRY PVT LTD • Smile Confident with Roots • Salem, Tamil Nadu • Confidential Minor Oral Surgery Documentation.</div><div class="print-footer">DR. NEEMZ DENTISTRY PVT LTD • SALEM, TAMIL NADU • CLINICAL INFORMED CONSENT FORM • PAGE 1 OF 1</div>
    </body></html>`;
  };

  const printForm = () => {
    const printWindow = window.open("", "_blank", "width=900,height=900");
    if (!printWindow) {
      toast({ title: "Print window blocked", description: "Please allow pop-ups and try again.", variant: "destructive" });
      return;
    }
    printWindow.document.write(buildPrintHtml());
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  const sendWhatsApp = () => {
    if (!patient?.phone) {
      toast({ title: "No phone number", description: "Patient phone number is required.", variant: "destructive" });
      return;
    }
    void sendClinicWhatsApp({
      patient,
      templateKey: "treatment_document",
      bodyParams: [patient.first_name, "Surgery Consent Form"],
      fallbackText: textContent.substring(0, 4000),
      label: "Surgery Consent Form",
    });
  };

  const sendSms = () => {
    if (!patient?.phone) {
      toast({ title: "No phone number", description: "Patient phone number is required.", variant: "destructive" });
      return;
    }
    const phone = patient.phone.replace(/\D/g, "");
    window.open(`sms:${phone}?body=${encodeURIComponent(textContent.substring(0, 1500))}`, "_self");
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden border border-[#7cb342] bg-background text-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <header className="flex flex-col gap-3 bg-[#7cb342] text-[#111827] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-center sm:text-left">
            <h3 className="text-lg font-extrabold">DR. NEEMZ DENTISTRY PVT LTD</h3>
            <p className="text-xs font-medium">Smile Confident with Roots • Salem, Tamil Nadu</p>
          </div>
          <div className="rounded-md border border-[#5f902e] bg-background px-3 py-2 text-center text-xs font-bold">
            SURGERY CONSENT FORM
            <div lang="ta">பல் அகற்றல் / அறுவை சிகிச்சை ஒப்புதல் படிவம்</div>
          </div>
        </header>

        <p className="border-b border-[#7cb342] px-4 py-3 text-xs leading-relaxed">
          <b>DR. NEEMZ DENTISTRY PVT LTD SURGICAL CARE / எங்கள் நோக்கம்:</b> DR. NEEMZ DENTISTRY delivers compassionate, state-of-the-art surgical care specializing in innovative dental implants, minor oral surgery, and disimpactions. We build lasting relationships rooted in trust, patient comfort, and education. நோயாளிகளின் பாதுகாப்பு, வலி இல்லாத சிகிச்சை மற்றும் முழுமையான சுகாதாரம் எங்களது உறுதிமொழியாகும்.
        </p>

        <div className="bg-[#7cb342] px-3 py-2 text-xs font-extrabold uppercase text-[#111827]">1. PATIENT DEMOGRAPHICS & CLINICAL METADATA / நோயாளி மற்றும் சிகிச்சை விவரங்கள்</div>
        <div className="grid gap-3 border-b border-[#7cb342] bg-[#f1f8e9] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label className="text-xs font-bold">Patient Name / நோயாளியின் பெயர்</Label><Input value={patientName} readOnly className="mt-1 bg-muted" /></div>
          <div><Label className="text-xs font-bold">OP / Reg. No / பதிவெண்</Label><Input value={opNumber} onChange={(event) => setOpNumber(event.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs font-bold">Age / வயது</Label><Input value={age} onChange={(event) => setAge(event.target.value)} className="mt-1" inputMode="numeric" /></div>
          <div><Label className="text-xs font-bold">Date / தேதி</Label><Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="mt-1" /></div>
          <div className="sm:col-span-2"><Label className="text-xs font-bold">Sex / பாலினம்</Label><RadioGroup value={sex} onValueChange={setSex} className="mt-2 flex gap-5"><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="M" /> Male / ஆண்</label><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="F" /> Female / பெண்</label></RadioGroup></div>
        </div>

        <div className="grid gap-3 border-b border-[#7cb342] bg-[#f1f8e9] p-3 lg:grid-cols-2">
          <div>
            <Label className="text-xs font-bold">Proposed Procedure / சிகிச்சை முறை</Label>
            <div className="mt-2 flex flex-wrap gap-4">
              {procedures.map((procedure) => <label key={procedure} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedProcedures.includes(procedure)} onCheckedChange={(checked) => toggleProcedure(procedure, checked === true)} />{procedure}</label>)}
            </div>
            <div className="mt-3"><Label className="text-xs font-bold">Tooth #</Label><Input value={toothNumber} onChange={(event) => setToothNumber(event.target.value)} className="mt-1" /></div>
          </div>
          <div><Label className="text-xs font-bold">Oral Surgeon / அறுவை சிகிச்சை சிறப்பு மருத்துவர்</Label><Input value={oralSurgeon} onChange={(event) => setOralSurgeon(event.target.value)} className="mt-1" placeholder="Enter oral surgeon name" /></div>
        </div>

        <div className="bg-[#7cb342] px-3 py-2 text-xs font-extrabold uppercase text-[#111827]">2. 10 INHERENT SURGICAL RISKS & SIDE EFFECTS / 10 அறுவை சிகிச்சை பக்கவிளைவுகள் & அபாயங்கள்</div>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead><tr className="bg-[#f1f8e9]"><th className="w-10 border border-[#7cb342] p-2">#</th><th className="w-1/2 border border-[#7cb342] p-2 text-left">ENGLISH EXPLANATION (SIMPLE & CLEAR)</th><th className="w-1/2 border border-[#7cb342] p-2 text-left">TAMIL EXPLANATION / எளிய தமிழ் விளக்கம்</th></tr></thead>
            <tbody>{risks.map((risk, index) => <tr key={risk.title}><td className="border border-[#7cb342] p-2 text-center font-bold">{index + 1}</td><td className="border border-[#7cb342] p-2 align-top leading-relaxed"><b>{risk.title}:</b> {risk.english}</td><td className="border border-[#7cb342] p-2 align-top leading-relaxed" lang="ta"><b>{risk.tamilTitle}:</b> {risk.tamil}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="bg-[#7cb342] px-3 py-2 text-xs font-extrabold uppercase text-[#111827]">3. BILINGUAL PATIENT UNDERSTANDING & COUNSELING / நோயாளி புரிதல் & மருத்துவர் விளக்கம்</div>
        <div className="grid text-xs leading-relaxed sm:grid-cols-2"><p className="border border-[#7cb342] p-3"><b>UNDERSTANDING & NO GUARANTEE:</b> The surgeon at <b>DR. NEEMZ DENTISTRY PVT LTD</b> has clearly explained the surgery, post-operative care, and alternatives. I understand that medical/dental surgery cannot carry a 100% unconditional guarantee. All my questions have been answered satisfactorily.</p><p className="border border-[#7cb342] p-3" lang="ta"><b>புரிதல் & மாற்று வழிகள்:</b> DR. NEEMZ DENTISTRY PVT LTD மருத்துவர் அளித்த அறுவை சிகிச்சை முறைகள், பின் பராமரிப்பு மற்றும் மாற்று சிகிச்சை வழிகளை நான் தெளிவாகப் புரிந்து கொண்டேன். மருத்துவ சிகிச்சையில் 100% முழு உத்தரவாதம் அளிக்க முடியாது என்பதை அறிவேன். எனது சந்தேகங்கள் தீர்க்கப்பட்டன.</p></div>

        <div className="bg-[#7cb342] px-3 py-2 text-xs font-extrabold uppercase text-[#111827]">4. BILINGUAL PATIENT DECLARATION & CONSENT / நோயாளி உறுதிமொழி மற்றும் ஒப்புதல் கையொப்பம்</div>
        <div className="grid text-xs leading-relaxed sm:grid-cols-2"><p className="border border-[#7cb342] p-3"><b>DECLARATION:</b> I certify that all blanks were filled prior to signing. I understand English / தமிழ் and authorize <b>DR. NEEMZ DENTISTRY</b> to proceed with oral surgery and anesthesia.</p><p className="border border-[#7cb342] p-3" lang="ta"><b>உறுதிமொழி:</b> படிவத்தில் உள்ள அனைத்து விவரங்களும் கையொப்பமிடுவதற்கு முன்பே பூர்த்தி செய்யப்பட்டன. நான் இதை முழுமையாகப் புரிந்து கொண்டு, அறுவை சிகிச்சை மற்றும் மயக்க முறைக்கு முழு சம்மதம் அளிக்கிறேன்.</p></div>

        <div className="grid gap-px bg-[#7cb342] sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-h-36 flex-col bg-background p-3 text-xs"><b>PATIENT / GUARDIAN SIGNATURE</b><span lang="ta">நோயாளி / பாதுகாவலர் கையொப்பம்</span><div className="my-2 flex flex-1 items-center justify-center border border-dashed border-border">{signature ? signature.startsWith("data:") ? <img src={signature} alt="Patient signature" className="max-h-16 max-w-full" /> : <span className="font-semibold italic">{signature}</span> : null}</div><b>Date / தேதி: {displayDate(date)}</b></div>
          <div className="flex min-h-36 flex-col bg-background p-3 text-xs"><b>OPERATING SURGEON SIGNATURE</b><span lang="ta">அறுவை சிகிச்சை நிபுணர் கையொப்பம்</span><div className="my-2 flex-1 border border-dashed border-border" /><b>{oralSurgeon || "—"}</b></div>
          <div className="flex min-h-36 flex-col bg-background p-3 text-xs"><b>CLINICAL TEAM REG. NO</b><span lang="ta">மருத்துவக் குழு பதிவெண்</span><div className="my-2 flex-1" /><Input value={clinicalRegNumber} onChange={(event) => setClinicalRegNumber(event.target.value)} placeholder="Registration number" /></div>
          <div className="flex min-h-36 flex-col bg-background p-3 text-xs"><b>CLINICAL WITNESS & DATE</b><span lang="ta">சாட்சி கையொப்பம் மற்றும் தேதி</span><div className="my-2 flex-1 border border-dashed border-border" /><Input value={witnessName} onChange={(event) => setWitnessName(event.target.value)} placeholder="Witness name" /><b className="mt-2">Date / தேதி: {displayDate(date)}</b></div>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] font-semibold italic">* DR. NEEMZ DENTISTRY PVT LTD • Smile Confident with Roots • Salem, Tamil Nadu • Confidential Minor Oral Surgery Documentation.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onAddSignature}><PenLine size={14} className="mr-1" /> Add Signature</Button>
        <Button variant="outline" size="sm" onClick={printForm}><Printer size={14} className="mr-1" /> Print</Button>
        <Button variant="outline" size="sm" className="border-success/30 text-success hover:bg-success/10" onClick={sendWhatsApp}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
        <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10" onClick={sendSms}><Phone size={14} className="mr-1" /> SMS</Button>
      </div>
    </div>
  );
};

export default SurgeryConsentForm;