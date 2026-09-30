import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type Kind = "doctor" | "lab" | "pharma";

interface Props {
  kind: Kind;
  patient: { id: string; first_name: string; last_name: string } | null;
  checkinId: string | null;
  workflowDate: Date;
  onContinue: () => void;
  renderQuickPatientSearch?: () => React.ReactNode;
}

const HEADERS: Record<Kind, { title: string; next: string }> = {
  doctor: { title: "Doctor Treatment Quality Review", next: "Confirm & Proceed to Lab Quality" },
  lab: { title: "Lab Quality Verification", next: "Confirm & Proceed to Pharma Quality" },
  pharma: { title: "Pharmacy / Drug Dispensing Quality", next: "Confirm & Proceed to Checkout" },
};

const DOCTOR_ISSUES = [
  { value: "complaint", label: "Patient Complaint" },
  { value: "repeat_treatment", label: "Repeat Treatment" },
  { value: "poor_outcome", label: "Poor Outcome" },
  { value: "patient_dissatisfaction", label: "Patient Dissatisfaction" },
];

const PHARMA_REACTIONS = [
  { value: "allergy", label: "Allergy" },
  { value: "stomach_pain", label: "Stomach Pain" },
  { value: "no_effect", label: "No Effect" },
  { value: "side_effect", label: "Side Effect" },
  { value: "other", label: "Other" },
];

const LAB_ISSUES = [
  { value: "fit_issue", label: "Fit Issue" },
  { value: "shade_mismatch", label: "Shade Mismatch" },
  { value: "margin_issue", label: "Margin Issue" },
  { value: "delayed", label: "Delay" },
  { value: "other", label: "Other" },
];

const LAB_CHECKS = [
  { key: "fit", label: "Fit Issue", issue: "fit_issue" },
  { key: "shade", label: "Shade Mismatch", issue: "shade_mismatch" },
  { key: "margin", label: "Margin Issue", issue: "fit_issue" },
  { key: "delay", label: "Delay / Repeat Required", issue: "delayed" },
] as const;

const SeveritySelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="low">Low</SelectItem>
      <SelectItem value="medium">Medium</SelectItem>
      <SelectItem value="high">High</SelectItem>
      <SelectItem value="critical">Critical</SelectItem>
    </SelectContent>
  </Select>
);

const QualityCheckStep = ({ kind, patient, checkinId, workflowDate, onContinue, renderQuickPatientSearch }: Props) => {
  const [mode, setMode] = useState<"pass" | "issue">("pass");
  const [saving, setSaving] = useState(false);
  const [doctor, setDoctor] = useState("");
  const [treatment, setTreatment] = useState("");
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [issueType, setIssueType] = useState(kind === "pharma" ? "allergy" : "complaint");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [labChecks, setLabChecks] = useState<Record<string, boolean>>({});
  const [labOrderId, setLabOrderId] = useState<string>("");
  const [pharmaChecks, setPharmaChecks] = useState({ dosage: false, expiry: false });
  const [drugName, setDrugName] = useState("");
  const [toothNumber, setToothNumber] = useState("");
  const [labName, setLabName] = useState("");
  const [workType, setWorkType] = useState("");
  const [material, setMaterial] = useState("");
  const [labIssueType, setLabIssueType] = useState("fit_issue");
  const [isRepeat, setIsRepeat] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [batchNumber, setBatchNumber] = useState("");

  const patientName = patient ? `${patient.first_name} ${patient.last_name}`.trim() : "";
  const [qcPatientName, setQcPatientName] = useState(patientName);
  const dayStr = format(workflowDate, "yyyy-MM-dd");

  useEffect(() => {
    setMode("pass"); setDescription(""); setAction(""); setLabChecks({}); setToothNumber(""); setQcPatientName(patientName); setIsRepeat(false); setLabIssueType("fit_issue");
    if (!patient) return;
    let cancelled = false;
    (async () => {
      const start = `${dayStr}T00:00:00`;
      const end = `${dayStr}T23:59:59`;
      const [rxRes, loRes] = await Promise.all([
        supabase.from("prescriptions").select("id, doctor, diagnosis, checkin_id, created_at, prescription_items(*)")
          .eq("patient_id", patient.id).gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }),
        supabase.from("lab_orders").select("*").eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(20),
      ]);
      if (cancelled) return;
      const rx = (rxRes.data || []) as any[];
      const los = ((loRes.data || []) as any[]).filter((o) =>
        (checkinId && o.checkin_id === checkinId) || String(o.created_at || "").slice(0, 10) === dayStr || o.status !== "delivered");
      setLabOrders(los);
      setLabOrderId(los[0]?.id || "");
      setLabName(los[0]?.lab_name || "");
      setWorkType(los[0]?.work_type ? String(los[0].work_type).replace(/_/g, " ") : "");
      setMaterial(los[0]?.material || "");
      const meds = rx.flatMap((p) => p.prescription_items || []);
      setMedicines(meds);
      setDrugName(meds[0]?.medicine_name || "");
      setDoctor(rx[0]?.doctor || los[0]?.doctor || "");
      setTreatment(rx[0]?.diagnosis || (los[0]?.work_type ? String(los[0].work_type).replace(/_/g, " ") : ""));
    })();
    return () => { cancelled = true; };
  }, [patient?.id, checkinId, dayStr, kind]);

  const handleConfirm = async () => {
    if (!patient) return;
    if (mode === "pass") { onContinue(); return; }
    setSaving(true);
    try {
      if (kind === "doctor") {
        if (!doctor.trim() || !qcPatientName.trim() || !treatment.trim() || !description.trim()) throw new Error("Doctor name, patient name, treatment type and issue description are required");
        const d = workflowDate;
        const { error } = await supabase.from("doctor_quality_logs").insert({
          doctor_name: doctor.trim(), patient_id: patient.id, patient_name: qcPatientName.trim(),
          treatment_type: treatment.trim(), tooth_number: toothNumber ? Number(toothNumber) : null,
          issue_type: issueType, issue_description: description.trim(),
          severity, action_taken: action || null, status: "open", review_date: dayStr,
          review_month: d.getMonth() + 1, review_year: d.getFullYear(),
        } as any);
        if (error) throw error;
      } else if (kind === "lab") {
        if (!labName.trim() || !qcPatientName.trim() || !description.trim()) throw new Error("Lab name, patient name and issue description are required");
        const lo = labOrders.find((o) => o.id === labOrderId);
        const { error } = await supabase.from("lab_quality_logs").insert({
          lab_name: labName.trim(), lab_order_id: lo?.id || null, patient_name: qcPatientName.trim(),
          work_type: workType.trim() || null, material: material.trim() || null,
          issue_type: labIssueType, issue_description: description.trim(),
          is_repeat: isRepeat, severity, action_taken: action || null, status: "open", reported_date: dayStr,
        } as any);
        if (error) throw error;
      } else {
        if (!drugName.trim() || !qcPatientName.trim() || !description.trim()) throw new Error("Medicine name, patient name and reaction description are required");
        const { error } = await supabase.from("pharma_quality_logs").insert({
          drug_name: drugName.trim(), brand_name: brandName.trim() || null, batch_number: batchNumber.trim() || null,
          patient_name: qcPatientName.trim(), reaction_type: issueType,
          reaction_description: description.trim(), severity, doctor_name: doctor.trim() || null,
          action_taken: action || null, status: "reported",
        } as any);
        if (error) throw error;
      }
      toast({ title: "Quality issue logged" });
      onContinue();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const noLab = kind === "lab" && labOrders.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2"><ShieldCheck size={20} /> {HEADERS[kind].title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {renderQuickPatientSearch?.()}
        {!patient ? (
          <p className="text-muted-foreground text-center py-6">Select a patient to continue.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-lg bg-muted/40 border">
              <div><p className="text-xs text-muted-foreground">Patient</p><p className="font-semibold">{patientName}</p></div>
              <div><p className="text-xs text-muted-foreground">Treatment</p><p className="font-semibold">{treatment || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Doctor</p><p className="font-semibold">{doctor || "—"}</p></div>
            </div>

            {kind === "lab" && (noLab ? (
              <p className="text-sm p-3 rounded-lg border bg-muted/30">No lab work for this visit — you can pass this step.</p>
            ) : (
              <div className="space-y-2">
                <Label>Lab orders</Label>
                <div className="flex flex-wrap gap-2">
                  {labOrders.map((o) => (
                    <Badge key={o.id} variant={o.id === labOrderId ? "default" : "outline"} className="cursor-pointer" onClick={() => { setLabOrderId(o.id); setLabName(o.lab_name || ""); setWorkType(o.work_type ? String(o.work_type).replace(/_/g, " ") : ""); setMaterial(o.material || ""); }}>
                      {o.lab_name} · {String(o.work_type || "").replace(/_/g, " ")}{o.tooth_number ? ` (${o.tooth_number})` : ""} · {o.status}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}

            {kind === "pharma" && (
              <div className="space-y-2">
                <Label>Prescribed medicines (this visit)</Label>
                {medicines.length === 0 ? <p className="text-sm text-muted-foreground">No medicines prescribed today.</p> : (
                  <ul className="text-sm space-y-1">
                    {medicines.map((m) => <li key={m.id}>• <strong>{m.medicine_name}</strong> {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ")}</li>)}
                  </ul>
                )}
                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={pharmaChecks.dosage} onCheckedChange={(v) => setPharmaChecks((p) => ({ ...p, dosage: v === true }))} /> Correct dosage verified</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={pharmaChecks.expiry} onCheckedChange={(v) => setPharmaChecks((p) => ({ ...p, expiry: v === true }))} /> Expiry checked</label>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant={mode === "pass" ? "default" : "outline"} onClick={() => setMode("pass")}><CheckCircle2 size={16} className="mr-1" /> {noLab ? "Auto-pass" : "No Issues / Quality Passed"}</Button>
              {!noLab && <Button type="button" variant={mode === "issue" ? "destructive" : "outline"} onClick={() => setMode("issue")}><AlertTriangle size={16} className="mr-1" /> {kind === "pharma" ? "Flag Reaction / Allergy" : "Report Issue"}</Button>}
            </div>

            {mode === "issue" && !noLab && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                {kind === "doctor" && (<>
                  <div><Label>Doctor Name *</Label><Input value={doctor} onChange={(e) => setDoctor(e.target.value)} /></div>
                  <div><Label>Patient Name *</Label><Input value={qcPatientName} onChange={(e) => setQcPatientName(e.target.value)} /></div>
                  <div><Label>Treatment Type *</Label><Input value={treatment} onChange={(e) => setTreatment(e.target.value)} /></div>
                  <div><Label>Tooth # (optional)</Label><Input value={toothNumber} onChange={(e) => setToothNumber(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Tooth # (optional)" /></div>
                  <div><Label>Issue Type *</Label>
                    <Select value={issueType} onValueChange={setIssueType}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DOCTOR_ISSUES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
                  </div>
                </>)}
                {kind === "lab" && (<>
                  <div><Label>Lab Name *</Label><Input value={labName} onChange={(e) => setLabName(e.target.value)} /></div>
                  <div><Label>Patient Name *</Label><Input value={qcPatientName} onChange={(e) => setQcPatientName(e.target.value)} /></div>
                  <div><Label>Work Type</Label><Input value={workType} onChange={(e) => setWorkType(e.target.value)} placeholder="Work Type (crown, bridge...)" /></div>
                  <div><Label>Material</Label><Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. Zirconia, Ceramic, Metal" /></div>
                  <div><Label>Issue Type *</Label>
                    <Select value={labIssueType} onValueChange={setLabIssueType}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LAB_ISSUES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm self-end pb-2"><Checkbox checked={isRepeat} onCheckedChange={(v) => setIsRepeat(v === true)} /> This is a repeat case</label>
                </>)}
                {kind === "pharma" && (<>
                  <div><Label>Drug / Medicine Name *</Label><Input value={drugName} onChange={(e) => setDrugName(e.target.value)} list="qc-meds" />
                    <datalist id="qc-meds">{medicines.map((m) => <option key={m.id} value={m.medicine_name} />)}</datalist></div>
                  <div><Label>Brand Name</Label><Input value={brandName} onChange={(e) => setBrandName(e.target.value)} /></div>
                  <div><Label>Batch Number</Label><Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></div>
                  <div><Label>Patient Name *</Label><Input value={qcPatientName} onChange={(e) => setQcPatientName(e.target.value)} /></div>
                  <div><Label>Prescribing Doctor</Label><Input value={doctor} onChange={(e) => setDoctor(e.target.value)} /></div>
                  <div><Label>Reaction Type *</Label>
                    <Select value={issueType} onValueChange={setIssueType}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PHARMA_REACTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
                  </div>
                </>)}
                <div><Label>Severity{kind !== "pharma" ? " *" : ""}</Label><SeveritySelect value={severity} onChange={setSeverity} /></div>
                <div className="md:col-span-2"><Label>{kind === "pharma" ? "Reaction / Allergy Notes *" : kind === "doctor" || kind === "lab" ? "Issue Description *" : "Remarks"}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                <div className="md:col-span-2"><Label>Action Taken</Label><Textarea value={action} onChange={(e) => setAction(e.target.value)} /></div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onContinue} disabled={saving}>Skip</Button>
              <Button onClick={handleConfirm} disabled={saving} className="gradient-primary text-primary-foreground">
                {saving ? "Saving..." : HEADERS[kind].next} <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default QualityCheckStep;
