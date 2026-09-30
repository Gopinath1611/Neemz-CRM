import { useRef, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mergeSelectOptions, useClinicMasters, withCurrentOption } from "@/hooks/useClinicMasters";
import { toast } from "@/hooks/use-toast";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";
import SurgeryConsentForm from "@/components/workflow/SurgeryConsentForm";
import {
  ClipboardList, FileText, Shield, Building2, Send, HeartPulse,
  Plus, Trash2, Printer, Save, X, PenLine, MessageCircle, Phone
} from "lucide-react";

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  patient_code?: number | null;
  address?: string | null;
}

interface TreatmentSummaryProps {
  selectedPatient: Patient | null;
  renderQuickPatientSearch: () => JSX.Element;
}

const treatmentTypes = [
  "Cleaning / Scaling", "Root Canal (RCT)", "Crown", "Bridge", "Extraction",
  "Filling - Composite", "Filling - GIC", "Filling - Amalgam", "Implant",
  "Denture - Complete", "Denture - Partial", "Teeth Whitening / Bleaching",
  "Braces / Orthodontic", "Aligner", "Veneer", "Inlay / Onlay",
  "Gum Treatment / Periodontal", "Pulpotomy", "Pulpectomy", "Sealant",
  "Fluoride Application", "X-Ray / RVG", "OPG", "CBCT", "Consultation",
  "Re-cementation", "Post & Core", "Surgical Extraction", "Bone Graft",
  "Sinus Lift", "TMJ Treatment", "Splinting", "Night Guard", "Other"
];

const toothNumbers = Array.from({ length: 32 }, (_, i) => String(i + 1));

const insuranceCompanies = [
  "Star Health", "HDFC ERGO", "ICICI Lombard", "Bajaj Allianz", "New India Assurance",
  "National Insurance", "Oriental Insurance", "United India Insurance", "SBI General",
  "Tata AIG", "Niva Bupa", "Care Health", "ManipalCigna", "Aditya Birla Health", "Other"
];

const postTreatmentTemplates: Record<string, { dos: string[]; donts: string[] }> = {
  "Cleaning / Scaling": {
    dos: ["Brush twice daily with soft bristled toothbrush", "Use mouthwash as prescribed", "Floss daily", "Drink plenty of water", "Eat soft foods for 24 hours"],
    donts: ["Don't eat or drink for 30 minutes after treatment", "Avoid very hot or cold foods for 24 hours", "Don't smoke for 48 hours", "Avoid hard or sticky foods for 24 hours"]
  },
  "Root Canal (RCT)": {
    dos: ["Take prescribed medications on time", "Eat on the opposite side", "Keep the temporary filling intact", "Use warm salt water rinse after 24 hours", "Return for crown placement as scheduled"],
    donts: ["Don't chew on the treated side until crown is placed", "Avoid hard, sticky, or crunchy foods", "Don't skip any medication", "Don't ignore any swelling or severe pain", "Avoid smoking"]
  },
  "Extraction": {
    dos: ["Bite on gauze pad for 30-45 minutes", "Apply ice pack on cheek (10 min on, 10 min off)", "Eat soft, cold foods", "Take medicines as prescribed", "Rest for 24 hours"],
    donts: ["Don't spit forcefully for 24 hours", "Don't use straw for drinking", "Don't smoke for 72 hours", "Avoid hot foods and beverages for 24 hours", "Don't touch the wound with tongue or fingers"]
  },
  "Filling - Composite": {
    dos: ["Maintain regular oral hygiene", "Eat soft foods for initial 24 hours", "Use prescribed mouthwash"],
    donts: ["Avoid chewing on treated side for 2 hours", "Avoid very hard foods on the filled tooth", "Don't consume staining foods for 48 hours"]
  },
  "Crown": {
    dos: ["Brush and floss around the crown carefully", "Eat soft foods initially", "Report any discomfort or looseness immediately"],
    donts: ["Don't eat sticky or hard foods on the crown", "Avoid chewing ice", "Don't pull floss out from sides — slide it out gently"]
  },
  "Implant": {
    dos: ["Take all prescribed antibiotics", "Apply ice pack for swelling", "Eat soft diet for 2 weeks", "Rinse with prescribed mouthwash after 24 hours", "Keep follow-up appointments"],
    donts: ["Don't touch or disturb the implant site", "Don't smoke for at least 2 weeks", "Avoid strenuous exercise for 48 hours", "Don't eat hard foods near implant area", "Don't use alcohol-based mouthwash"]
  },
  "Braces / Orthodontic": {
    dos: ["Brush after every meal", "Use orthodontic wax for discomfort", "Eat soft foods", "Keep all adjustment appointments"],
    donts: ["Don't eat hard, sticky, or chewy foods", "Don't bite into whole fruits — cut them first", "Don't skip wearing elastics if prescribed", "Avoid carbonated drinks"]
  },
  "Teeth Whitening / Bleaching": {
    dos: ["Maintain oral hygiene", "Use sensitivity toothpaste if needed", "Eat white-colored foods for 48 hours"],
    donts: ["Avoid tea, coffee, red wine for 48 hours", "Don't smoke", "Avoid colored/acidic foods and drinks", "Don't use coloured mouthwash for 48 hours"]
  },
};

const defaultConsentText = `I, the undersigned patient / legal guardian, hereby consent to the dental treatment recommended by the treating dentist at Dr Neemz Dentistry, Salem.

I acknowledge that:
1. The nature and purpose of the proposed treatment has been explained to me.
2. The potential risks, benefits, and alternatives have been discussed.
3. I have had the opportunity to ask questions and all my questions have been answered satisfactorily.
4. I understand that no guarantee has been made regarding the outcome of the treatment.
5. I consent to the administration of local anesthesia and/or sedation as deemed necessary.
6. I agree to follow post-treatment instructions provided by the clinic.

I voluntarily consent to proceed with the recommended dental treatment.`;

const clinicInfo = {
  name: "Dr Neemz Dentistry",
  address: "Salem, Tamil Nadu",
  phone: "",
  tagline: "Advanced Dental Care"
};

const TreatmentSummary = ({ selectedPatient, renderQuickPatientSearch }: TreatmentSummaryProps) => {
  const [activeTab, setActiveTab] = useState("general");
  const { treatmentOptions } = useClinicMasters();
  const postCareTreatmentOptions = mergeSelectOptions(
    treatmentOptions,
    Object.keys(postTreatmentTemplates).map((treatment) => ({ value: treatment, label: treatment })),
  );

  // General Summary
  const [generalDate, setGeneralDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generalSummary, setGeneralSummary] = useState("");

  // Treatment Summary Plan
  const [planDate, setPlanDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [planDiagnosis, setPlanDiagnosis] = useState("");
  const [planRows, setPlanRows] = useState<{ tooth: string; treatment: string; cost: string; quantity: string; duration: string }[]>([
    { tooth: "", treatment: "", cost: "", quantity: "1", duration: "" }
  ]);
  const [planNotes, setPlanNotes] = useState(
    "This is a personalized treatment estimate based on the current oral health condition and discussed goals. The treatment duration and cost may vary depending on individual response and observations required. By signing below, I agree to the treatment plan including the estimated cost and schedule, and I acknowledge that I have had all my questions answered."
  );
  const [planSignature, setPlanSignature] = useState("");

  // Consent Form
  const [consentDate, setConsentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [consentText, setConsentText] = useState(defaultConsentText);
  const [consentSignature, setConsentSignature] = useState("");
  const [consentTemplate, setConsentTemplate] = useState<"treatment" | "surgery">("treatment");
  const [surgeryConsentDate, setSurgeryConsentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [surgeryConsentSignature, setSurgeryConsentSignature] = useState("");

  // Insurance Claim Form
  const [insDate, setInsDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [insDiagnosis, setInsDiagnosis] = useState("");
  const [insProcedure, setInsProcedure] = useState("");
  const [insCompany, setInsCompany] = useState("");
  const [insPolicyNumber, setInsPolicyNumber] = useState("");
  const [insTotalAmount, setInsTotalAmount] = useState("");
  const [insInsuranceAmount, setInsInsuranceAmount] = useState("");
  const [insPatientAmount, setInsPatientAmount] = useState("");
  const [insSummary, setInsSummary] = useState("");

  // Referral Letter
  const [refDate, setRefDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [refHospitalName, setRefHospitalName] = useState("");
  const [refDoctorName, setRefDoctorName] = useState("");
  const [refSpecialization, setRefSpecialization] = useState("");
  const [refHospitalAddress, setRefHospitalAddress] = useState("");
  const [refHospitalPhone, setRefHospitalPhone] = useState("");
  const [refReason, setRefReason] = useState("");
  const [refDiagnosis, setRefDiagnosis] = useState("");
  const [refTreatmentFindings, setRefTreatmentFindings] = useState("");
  const [refSignature, setRefSignature] = useState("");

  // Post Treatment Care
  const [careDate, setCareDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [careTreatment, setCareTreatment] = useState("");
  const [careDos, setCareDos] = useState<string[]>([]);
  const [careDonts, setCareDonts] = useState<string[]>([]);
  const [careCustomDo, setCareCustomDo] = useState("");
  const [careCustomDont, setCareCustomDont] = useState("");

  // Signature Dialog
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureTarget, setSignatureTarget] = useState<string>("");
  const [signatureInput, setSignatureInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const openSignature = (target: string) => {
    setSignatureTarget(target);
    setSignatureInput("");
    setShowSignatureDialog(true);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    const sigData = canvas ? canvas.toDataURL() : signatureInput;
    if (signatureTarget === "plan") setPlanSignature(sigData || signatureInput);
    if (signatureTarget === "consent") setConsentSignature(sigData || signatureInput);
    if (signatureTarget === "surgery-consent") setSurgeryConsentSignature(sigData || signatureInput);
    if (signatureTarget === "referral") setRefSignature(sigData || signatureInput);
    setShowSignatureDialog(false);
    toast({ title: "Signature saved!" });
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleCareTemplateSelect = (treatment: string) => {
    setCareTreatment(treatment);
    const tmpl = postTreatmentTemplates[treatment];
    if (tmpl) {
      setCareDos([...tmpl.dos]);
      setCareDonts([...tmpl.donts]);
    } else {
      setCareDos([]);
      setCareDonts([]);
    }
  };

  const addPlanRow = () => setPlanRows([...planRows, { tooth: "", treatment: "", cost: "", quantity: "1", duration: "" }]);
  const removePlanRow = (i: number) => setPlanRows(planRows.filter((_, idx) => idx !== i));

  const printSection = async (sectionId: string, title: string) => {
    const content = document.getElementById(sectionId);
    if (!content) return;
    const { openBrandedPrintWindow } = await import("@/lib/clinicBranding");
    const extraStyles = `
      h2 { color: #1e3a5f; font-size: 16px; margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
      th { background: #f1f5f9; font-weight: bold; }
      .label { color: #666; font-size: 12px; }
      .value { font-weight: 600; }
      .notes-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 12px 0; font-size: 13px; line-height: 1.6; }
      .signature-area { margin-top: 30px; display: flex; justify-content: space-between; }
      .signature-area div { text-align: center; }
      .signature-line { border-top: 1px solid #333; width: 200px; margin-top: 40px; padding-top: 4px; font-size: 12px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; font-size: 13px; }
      .do-list, .dont-list { padding-left: 20px; }
      .do-list li { color: #16a34a; margin-bottom: 4px; }
      .dont-list li { color: #dc2626; margin-bottom: 4px; }
    `;
    await openBrandedPrintWindow({ title, bodyHtml: content.innerHTML, extraStyles });
  };

  const handleSave = (section: string) => {
    toast({ title: `${section} saved successfully!` });
  };

  const getSectionTextContent = (sectionId: string): string => {
    const el = document.getElementById(sectionId);
    if (!el) return "";
    return el.innerText || el.textContent || "";
  };

  const sendViaWhatsApp = (sectionId: string, title: string) => {
    if (!selectedPatient?.phone) {
      toast({ title: "No phone number", description: "Patient phone number is required.", variant: "destructive" });
      return;
    }
    const text = `*${clinicInfo.name} - ${title}*\n\nPatient: ${selectedPatient.first_name} ${selectedPatient.last_name}\n\n${getSectionTextContent(sectionId)}`.substring(0, 4000);
    void sendClinicWhatsApp({
      patient: selectedPatient,
      templateKey: "treatment_document",
      bodyParams: [selectedPatient.first_name, title],
      fallbackText: text,
      label: title,
    });
  };

  const sendViaSMS = (sectionId: string, title: string) => {
    if (!selectedPatient?.phone) {
      toast({ title: "No phone number", description: "Patient phone number is required.", variant: "destructive" });
      return;
    }
    const phone = selectedPatient.phone.replace(/\D/g, "");
    const text = `${clinicInfo.name} - ${title}\n\nPatient: ${selectedPatient.first_name} ${selectedPatient.last_name}\n\n${getSectionTextContent(sectionId)}`;
    const truncated = text.substring(0, 1500);
    window.open(`sms:${phone}?body=${encodeURIComponent(truncated)}`, "_self");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <ClipboardList size={20} /> Treatment Summary & Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 workflow-scaled-text">
        {renderQuickPatientSearch()}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 lg:grid-cols-6 h-auto">
            <TabsTrigger value="general" className="text-sm gap-1.5"><FileText size={14} /> General</TabsTrigger>
            <TabsTrigger value="plan" className="text-sm gap-1.5"><ClipboardList size={14} /> Plan</TabsTrigger>
            <TabsTrigger value="consent" className="text-sm gap-1.5"><Shield size={14} /> Consent</TabsTrigger>
            <TabsTrigger value="insurance" className="text-sm gap-1.5"><Building2 size={14} /> Insurance</TabsTrigger>
            <TabsTrigger value="referral" className="text-sm gap-1.5"><Send size={14} /> Referral</TabsTrigger>
            <TabsTrigger value="care" className="text-sm gap-1.5"><HeartPulse size={14} /> Post Care</TabsTrigger>
          </TabsList>

          {/* ==================== GENERAL SUMMARY ==================== */}
          <TabsContent value="general" className="space-y-4">
            <div id="print-general">
              <h3 className="font-semibold text-base">General Treatment Summary</h3>
              <div>
                <Label className="text-sm">Date</Label>
                <Input type="date" value={generalDate} onChange={(e) => setGeneralDate(e.target.value)} className="w-48" />
              </div>
              <div>
                <Label className="text-sm">Summary</Label>
                <Textarea
                  value={generalSummary}
                  onChange={(e) => setGeneralSummary(e.target.value)}
                  placeholder="Write a general treatment summary for this visit..."
                  rows={8}
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => printSection("print-general", "General Treatment Summary")}><Printer size={14} className="mr-1" /> Print</Button>
              <Button size="sm" onClick={() => handleSave("General Summary")}><Save size={14} className="mr-1" /> Save</Button>
              <Button variant="outline" size="sm" className="border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => sendViaWhatsApp("print-general", "General Treatment Summary")}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
              <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => sendViaSMS("print-general", "General Treatment Summary")}><Phone size={14} className="mr-1" /> SMS</Button>
            </div>
          </TabsContent>

          {/* ==================== TREATMENT SUMMARY PLAN ==================== */}
          <TabsContent value="plan" className="space-y-4">
            <div id="print-plan">
              <h3 className="font-semibold text-sm">Treatment Summary Plan</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Patient</Label>
                  <Input value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : ""} readOnly className="bg-muted" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Diagnosis</Label>
                <Textarea value={planDiagnosis} onChange={(e) => setPlanDiagnosis(e.target.value)} placeholder="Enter diagnosis..." rows={2} />
              </div>

              <div className="space-y-2 mt-3">
                <Label className="text-xs font-semibold">Recommended Treatment Plan</Label>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 w-10">S.No</th>
                        <th className="border p-2">Tooth</th>
                        <th className="border p-2">Treatment</th>
                        <th className="border p-2 w-24">Cost (₹)</th>
                        <th className="border p-2 w-16">Qty</th>
                        <th className="border p-2 w-28">Duration</th>
                        <th className="border p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {planRows.map((row, i) => (
                        <tr key={i}>
                          <td className="border p-1.5 text-center">{i + 1}</td>
                          <td className="border p-1">
                            <Select value={row.tooth} onValueChange={(v) => { const n = [...planRows]; n[i].tooth = v; setPlanRows(n); }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tooth" /></SelectTrigger>
                              <SelectContent>{toothNumbers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="border p-1">
                            <Select value={row.treatment} onValueChange={(v) => { const n = [...planRows]; n[i].treatment = v; setPlanRows(n); }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Treatment" /></SelectTrigger>
                              <SelectContent>{withCurrentOption(treatmentOptions, row.treatment, row.treatment).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="border p-1"><Input className="h-8 text-xs" type="number" placeholder="0" value={row.cost} onChange={(e) => { const n = [...planRows]; n[i].cost = e.target.value; setPlanRows(n); }} /></td>
                          <td className="border p-1"><Input className="h-8 text-xs" type="number" placeholder="1" value={row.quantity} onChange={(e) => { const n = [...planRows]; n[i].quantity = e.target.value; setPlanRows(n); }} /></td>
                          <td className="border p-1"><Input className="h-8 text-xs" placeholder="e.g. 2 weeks" value={row.duration} onChange={(e) => { const n = [...planRows]; n[i].duration = e.target.value; setPlanRows(n); }} /></td>
                          <td className="border p-1 text-center">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removePlanRow(i)}><Trash2 size={12} /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addPlanRow}><Plus size={12} className="mr-1" /> Add Row</Button>
                  <div className="ml-auto text-sm font-semibold">
                    Total: <span className="text-primary">₹{planRows.reduce((s, r) => s + (parseFloat(r.cost) || 0) * (parseInt(r.quantity) || 1), 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <Label className="text-xs">Notes / Disclaimer</Label>
                <Textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} rows={4} />
              </div>

              {planSignature && (
                <div className="mt-2 p-2 border rounded text-xs">
                  <span className="text-muted-foreground">Signature:</span>
                  {planSignature.startsWith("data:") ? (
                    <img src={planSignature} alt="Signature" className="h-12 mt-1" />
                  ) : (
                    <p className="font-semibold italic mt-1">{planSignature}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openSignature("plan")}><PenLine size={14} className="mr-1" /> Add Signature</Button>
              <Button variant="outline" size="sm" onClick={() => printSection("print-plan", "Treatment Summary Plan")}><Printer size={14} className="mr-1" /> Print</Button>
              <Button size="sm" onClick={() => handleSave("Treatment Plan")}><Save size={14} className="mr-1" /> Save</Button>
              <Button variant="outline" size="sm" className="border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => sendViaWhatsApp("print-plan", "Treatment Summary Plan")}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
              <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => sendViaSMS("print-plan", "Treatment Summary Plan")}><Phone size={14} className="mr-1" /> SMS</Button>
            </div>
          </TabsContent>

          {/* ==================== CONSENT FORM ==================== */}
          <TabsContent value="consent" className="space-y-4">
            <div className="max-w-sm">
              <Label className="text-xs">Consent Template</Label>
              <Select value={consentTemplate} onValueChange={(value: "treatment" | "surgery") => setConsentTemplate(value)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="treatment">Treatment Consent Form</SelectItem>
                  <SelectItem value="surgery">Surgery Consent Form</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {consentTemplate === "treatment" ? (
              <>
                <div id="print-consent">
                  <h3 className="font-semibold text-sm">Treatment Consent Form</h3>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={consentDate} onChange={(e) => setConsentDate(e.target.value)} className="w-48" />
                  </div>
                  <div>
                    <Label className="text-xs">Patient Name</Label>
                    <Input value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : ""} readOnly className="bg-muted" />
                  </div>
                  <div>
                    <Label className="text-xs">Consent Text</Label>
                    <Textarea value={consentText} onChange={(e) => setConsentText(e.target.value)} rows={12} className="text-xs leading-relaxed" />
                  </div>

                  {consentSignature && (
                    <div className="mt-2 p-2 border rounded text-xs">
                      <span className="text-muted-foreground">Patient Signature:</span>
                      {consentSignature.startsWith("data:") ? (
                        <img src={consentSignature} alt="Signature" className="h-12 mt-1" />
                      ) : (
                        <p className="font-semibold italic mt-1">{consentSignature}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => openSignature("consent")}><PenLine size={14} className="mr-1" /> Add Signature</Button>
                  <Button variant="outline" size="sm" onClick={() => printSection("print-consent", "Consent Form")}><Printer size={14} className="mr-1" /> Print</Button>
                  <Button size="sm" onClick={() => handleSave("Consent Form")}><Save size={14} className="mr-1" /> Save</Button>
                  <Button variant="outline" size="sm" className="border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => sendViaWhatsApp("print-consent", "Consent Form")}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
                  <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => sendViaSMS("print-consent", "Consent Form")}><Phone size={14} className="mr-1" /> SMS</Button>
                </div>
              </>
            ) : (
              <SurgeryConsentForm
                patient={selectedPatient}
                date={surgeryConsentDate}
                onDateChange={setSurgeryConsentDate}
                signature={surgeryConsentSignature}
                onAddSignature={() => openSignature("surgery-consent")}
              />
            )}
          </TabsContent>

          {/* ==================== INSURANCE CLAIM FORM ==================== */}
          <TabsContent value="insurance" className="space-y-4">
            <div id="print-insurance">
              <h3 className="font-semibold text-sm">Insurance Claim Form</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={insDate} onChange={(e) => setInsDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Patient</Label>
                  <Input value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : ""} readOnly className="bg-muted" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Insurance Company</Label>
                <Select value={insCompany} onValueChange={setInsCompany}>
                  <SelectTrigger><SelectValue placeholder="Select Insurance Company" /></SelectTrigger>
                  <SelectContent>{insuranceCompanies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Policy Number</Label>
                <Input value={insPolicyNumber} onChange={(e) => setInsPolicyNumber(e.target.value)} placeholder="Policy number" />
              </div>
              <div>
                <Label className="text-xs">Diagnosis</Label>
                <Textarea value={insDiagnosis} onChange={(e) => setInsDiagnosis(e.target.value)} placeholder="Diagnosis..." rows={2} />
              </div>
              <div>
                <Label className="text-xs">Procedure</Label>
                <Textarea value={insProcedure} onChange={(e) => setInsProcedure(e.target.value)} placeholder="Procedure performed..." rows={2} />
              </div>
              <div>
                <Label className="text-xs">Clinical Summary</Label>
                <Textarea value={insSummary} onChange={(e) => setInsSummary(e.target.value)} placeholder="Summary for insurance claim..." rows={3} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Total Amount (₹)</Label>
                  <Input type="number" value={insTotalAmount} onChange={(e) => setInsTotalAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Insurance Amount (₹)</Label>
                  <Input type="number" value={insInsuranceAmount} onChange={(e) => setInsInsuranceAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Patient Amount (₹)</Label>
                  <Input type="number" value={insPatientAmount} onChange={(e) => setInsPatientAmount(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => printSection("print-insurance", "Insurance Claim Form")}><Printer size={14} className="mr-1" /> Print</Button>
              <Button size="sm" onClick={() => handleSave("Insurance Claim")}><Save size={14} className="mr-1" /> Save</Button>
              <Button variant="outline" size="sm" className="border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => sendViaWhatsApp("print-insurance", "Insurance Claim Form")}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
              <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => sendViaSMS("print-insurance", "Insurance Claim Form")}><Phone size={14} className="mr-1" /> SMS</Button>
            </div>
          </TabsContent>

          {/* ==================== REFERRAL LETTER ==================== */}
          <TabsContent value="referral" className="space-y-4">
            <div id="print-referral">
              <h3 className="font-semibold text-sm">Referral Letter</h3>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="w-48" />
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg space-y-3 mt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Refer To</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Hospital / Clinic Name</Label>
                    <Input value={refHospitalName} onChange={(e) => setRefHospitalName(e.target.value)} placeholder="Hospital name" />
                  </div>
                  <div>
                    <Label className="text-xs">Specialist Doctor Name</Label>
                    <Input value={refDoctorName} onChange={(e) => setRefDoctorName(e.target.value)} placeholder="Doctor name" />
                  </div>
                  <div>
                    <Label className="text-xs">Specialization</Label>
                    <Input value={refSpecialization} onChange={(e) => setRefSpecialization(e.target.value)} placeholder="e.g. Oral Surgeon" />
                  </div>
                  <div>
                    <Label className="text-xs">Hospital Phone</Label>
                    <Input value={refHospitalPhone} onChange={(e) => setRefHospitalPhone(e.target.value)} placeholder="Phone number" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Hospital Address</Label>
                    <Input value={refHospitalAddress} onChange={(e) => setRefHospitalAddress(e.target.value)} placeholder="Full address" />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason for Referral</Label>
                <Textarea value={refReason} onChange={(e) => setRefReason(e.target.value)} placeholder="Reason for referring this patient..." rows={2} />
              </div>
              <div>
                <Label className="text-xs">Current Diagnosis</Label>
                <Textarea value={refDiagnosis} onChange={(e) => setRefDiagnosis(e.target.value)} placeholder="Current diagnosis..." rows={2} />
              </div>
              <div>
                <Label className="text-xs">Treatment & Findings Summary</Label>
                <Textarea value={refTreatmentFindings} onChange={(e) => setRefTreatmentFindings(e.target.value)} placeholder="Summary of treatments done and clinical findings..." rows={3} />
              </div>

              {refSignature && (
                <div className="mt-2 p-2 border rounded text-xs">
                  <span className="text-muted-foreground">Doctor Signature:</span>
                  {refSignature.startsWith("data:") ? (
                    <img src={refSignature} alt="Signature" className="h-12 mt-1" />
                  ) : (
                    <p className="font-semibold italic mt-1">{refSignature}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openSignature("referral")}><PenLine size={14} className="mr-1" /> Add Signature</Button>
              <Button variant="outline" size="sm" onClick={() => printSection("print-referral", "Referral Letter")}><Printer size={14} className="mr-1" /> Print</Button>
              <Button size="sm" onClick={() => handleSave("Referral Letter")}><Save size={14} className="mr-1" /> Save</Button>
              <Button variant="outline" size="sm" className="border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => sendViaWhatsApp("print-referral", "Referral Letter")}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
              <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => sendViaSMS("print-referral", "Referral Letter")}><Phone size={14} className="mr-1" /> SMS</Button>
            </div>
          </TabsContent>

          {/* ==================== POST TREATMENT CARE ==================== */}
          <TabsContent value="care" className="space-y-4">
            <div id="print-care">
              <h3 className="font-semibold text-sm">Post Treatment Care Instructions</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={careDate} onChange={(e) => setCareDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Select Treatment</Label>
                  <Select value={careTreatment} onValueChange={handleCareTemplateSelect}>
                    <SelectTrigger><SelectValue placeholder="Select treatment type" /></SelectTrigger>
                    <SelectContent>
                      {postCareTreatmentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {careTreatment && (
                <div className="space-y-4 mt-3">
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                    <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-2">✅ DO's</p>
                    <div className="space-y-1.5">
                      {careDos.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs flex-1 text-green-800 dark:text-green-300">• {d}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setCareDos(careDos.filter((_, idx) => idx !== i))}><Trash2 size={10} /></Button>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <Input className="h-7 text-xs" placeholder="Add custom do..." value={careCustomDo} onChange={(e) => setCareCustomDo(e.target.value)} />
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { if (careCustomDo) { setCareDos([...careDos, careCustomDo]); setCareCustomDo(""); } }}><Plus size={10} /></Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                    <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-2">❌ DON'Ts</p>
                    <div className="space-y-1.5">
                      {careDonts.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs flex-1 text-red-800 dark:text-red-300">• {d}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setCareDonts(careDonts.filter((_, idx) => idx !== i))}><Trash2 size={10} /></Button>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <Input className="h-7 text-xs" placeholder="Add custom don't..." value={careCustomDont} onChange={(e) => setCareCustomDont(e.target.value)} />
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { if (careCustomDont) { setCareDonts([...careDonts, careCustomDont]); setCareCustomDont(""); } }}><Plus size={10} /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => printSection("print-care", "Post Treatment Care")}><Printer size={14} className="mr-1" /> Print</Button>
              <Button size="sm" onClick={() => handleSave("Post Treatment Care")}><Save size={14} className="mr-1" /> Save</Button>
              <Button variant="outline" size="sm" className="border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => sendViaWhatsApp("print-care", "Post Treatment Care")}><MessageCircle size={14} className="mr-1" /> WhatsApp</Button>
              <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => sendViaSMS("print-care", "Post Treatment Care")}><Phone size={14} className="mr-1" /> SMS</Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Signature Dialog */}
        <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2"><PenLine size={18} /> Add Signature</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Type your name (as signature)</Label>
                <Input value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)} placeholder="Full name" />
              </div>
              <div className="text-center text-xs text-muted-foreground">— or draw below —</div>
              <div className="border rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={150}
                  className="w-full bg-white cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearCanvas}>Clear</Button>
                <Button size="sm" className="ml-auto" onClick={saveSignature}><Save size={14} className="mr-1" /> Save Signature</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default TreatmentSummary;
