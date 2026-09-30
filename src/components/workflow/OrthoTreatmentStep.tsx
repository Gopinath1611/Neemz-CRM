import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload, Camera, AlertCircle, CheckCircle2, Smile, Wrench, CalendarIcon, IndianRupee, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, differenceInDays } from "date-fns";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import BrandSelect from "@/components/ortho/BrandSelect";
import OrthoRecordsUploader from "@/components/ortho/OrthoRecordsUploader";

interface Props {
  patientId: string;
  patientName: string;
}

const APPLIANCE_TYPES = [
  "Metal Braces",
  "Ceramic Braces",
  "Self-Ligating Braces",
  "Clear Aligners",
  "Functional Appliance",
  "Surgical Orthodontics",
];

const PHASES = [
  "Bonding",
  "Archwire Sequence",
  "Space Closure",
  "Finishing",
  "Debonding",
  "Retention",
];

const PROCEDURE_OPTIONS = [
  "Bracket Bonding",
  "Wire Change",
  "Elastics Placement",
  "Power Chain",
  "Mini Implant Placement",
  "Extraction",
  "IPR (Stripping)",
  "Bracket Repositioning",
  "Debonding",
  "Retainer Delivery",
  "Review",
];

const RECORDS_FIELDS: { key: string; label: string }[] = [
  { key: "opg", label: "OPG" },
  { key: "cephalogram", label: "Cephalogram" },
  { key: "intraoral_photos", label: "Intraoral Photos" },
  { key: "extraoral_photos", label: "Extraoral Photos" },
  { key: "study_models", label: "Study Models" },
  { key: "cbct", label: "CBCT" },
];

const DEFAULT_CASE = {
  doctor: "",
  status: "active",
  start_date: format(new Date(), "yyyy-MM-dd"),
  estimated_months: "",
  molar_relation: "",
  canine_relation: "",
  overjet: "",
  overbite: "",
  midline_deviation: "",
  crowding: "",
  spacing: "",
  growth_pattern: "",
  records: { opg: false, cephalogram: false, intraoral_photos: false, extraoral_photos: false, study_models: false, cbct: false } as Record<string, boolean>,
  appliance_type: "",
  appliance_brand: "",
  extraction_plan: "",
  mini_implant_plan: "",
  treatment_notes: "",
  wire_sequence: [] as string[],
  retainer_type: "",
  retention_review_schedule: "",
  retention_started_at: "",
  total_cost: "",
  installment_amount: "",
  installment_frequency: "monthly",
  next_due_date: "",
  notes: "",
};

export default function OrthoTreatmentStep({ patientId, patientName }: Props) {
  const [orthoCase, setOrthoCase] = useState<any>(null);
  const [form, setForm] = useState<any>(DEFAULT_CASE);
  const [visits, setVisits] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [wireInput, setWireInput] = useState("");
  const { doctorOptions } = useClinicMasters();

  // New visit
  const [newVisit, setNewVisit] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    phase: "",
    procedures: [] as string[],
    wire_used: "",
    notes: "",
    next_visit_date: "",
    doctor: "",
  });

  // New payment
  const [newPayment, setNewPayment] = useState({
    due_date: format(new Date(), "yyyy-MM-dd"),
    amount: "",
    paid_amount: "",
    paid_date: "",
    status: "pending",
    payment_method: "",
    notes: "",
  });

  useEffect(() => {
    if (patientId) loadCase();
  }, [patientId]);

  async function loadCase() {
    setLoading(true);
    const { data: caseDataRaw } = await supabase
      .from("orthodontic_cases" as any)
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const caseData: any = caseDataRaw;

    if (caseData) {
      setOrthoCase(caseData);
      setForm({
        ...DEFAULT_CASE,
        ...caseData,
        records: caseData.records || DEFAULT_CASE.records,
        wire_sequence: Array.isArray(caseData.wire_sequence) ? caseData.wire_sequence : [],
        estimated_months: caseData.estimated_months ?? "",
        total_cost: caseData.total_cost ?? "",
        installment_amount: caseData.installment_amount ?? "",
        next_due_date: caseData.next_due_date ?? "",
        retention_started_at: caseData.retention_started_at ?? "",
      });
      await loadRelated(caseData.id);
    } else {
      setOrthoCase(null);
      setForm(DEFAULT_CASE);
      setVisits([]);
      setPayments([]);
      setPhotos([]);
    }
    setLoading(false);
  }

  async function loadRelated(caseId: string) {
    const [v, p, ph] = await Promise.all([
      supabase.from("orthodontic_visits" as any).select("*").eq("case_id", caseId).order("visit_date", { ascending: false }),
      supabase.from("orthodontic_payments" as any).select("*").eq("case_id", caseId).order("due_date", { ascending: true }),
      supabase.from("orthodontic_photos" as any).select("*").eq("case_id", caseId).order("photo_date", { ascending: false }),
    ]);
    setVisits(v.data || []);
    setPayments(p.data || []);
    // Resolve signed URLs for photos (bucket is private). Supports both stored path and legacy public URL.
    const rawPhotos = (ph.data || []) as any[];
    const resolved = await Promise.all(rawPhotos.map(async (photo: any) => {
      const stored: string = photo.photo_url || "";
      let path = stored;
      const marker = "/clinical-photos/";
      const idx = stored.indexOf(marker);
      if (idx !== -1) path = stored.substring(idx + marker.length).split("?")[0];
      const { data: signed } = await supabase.storage.from("clinical-photos").createSignedUrl(path, 60 * 60 * 24);
      return { ...photo, photo_url: signed?.signedUrl || stored };
    }));
    setPhotos(resolved);
  }

  async function saveCase() {
    const payload: any = {
      patient_id: patientId,
      doctor: form.doctor,
      status: form.status,
      start_date: form.start_date || null,
      estimated_months: form.estimated_months ? parseInt(form.estimated_months) : null,
      molar_relation: form.molar_relation,
      canine_relation: form.canine_relation,
      overjet: form.overjet,
      overbite: form.overbite,
      midline_deviation: form.midline_deviation,
      crowding: form.crowding,
      spacing: form.spacing,
      growth_pattern: form.growth_pattern,
      records: form.records,
      appliance_type: form.appliance_type,
      appliance_brand: form.appliance_brand || null,
      extraction_plan: form.extraction_plan,
      mini_implant_plan: form.mini_implant_plan,
      treatment_notes: form.treatment_notes,
      wire_sequence: form.wire_sequence,
      retainer_type: form.retainer_type,
      retention_review_schedule: form.retention_review_schedule,
      retention_started_at: form.retention_started_at || null,
      total_cost: form.total_cost ? parseFloat(form.total_cost) : 0,
      installment_amount: form.installment_amount ? parseFloat(form.installment_amount) : 0,
      installment_frequency: form.installment_frequency,
      next_due_date: form.next_due_date || null,
      notes: form.notes,
    };

    if (orthoCase?.id) {
      const { error } = await supabase.from("orthodontic_cases" as any).update(payload).eq("id", orthoCase.id);
      if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
      toast({ title: "Ortho case updated" });
    } else {
      payload.case_code = `ORTHO-${Date.now().toString().slice(-6)}`;
      const { data, error } = await supabase.from("orthodontic_cases" as any).insert(payload).select().single();
      if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setOrthoCase(data);
      toast({ title: "Ortho case created" });
    }
    loadCase();
  }

  function addWire() {
    if (!wireInput.trim()) return;
    setForm((f: any) => ({ ...f, wire_sequence: [...(f.wire_sequence || []), wireInput.trim()] }));
    setWireInput("");
  }

  function removeWire(idx: number) {
    setForm((f: any) => ({ ...f, wire_sequence: f.wire_sequence.filter((_: any, i: number) => i !== idx) }));
  }

  async function addVisit() {
    if (!orthoCase?.id) return toast({ title: "Save case first", variant: "destructive" });
    const { error } = await supabase.from("orthodontic_visits" as any).insert({
      case_id: orthoCase.id,
      visit_date: newVisit.visit_date,
      phase: newVisit.phase,
      procedures: newVisit.procedures,
      wire_used: newVisit.wire_used,
      notes: newVisit.notes,
      next_visit_date: newVisit.next_visit_date || null,
      doctor: newVisit.doctor || form.doctor,
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });

    // Auto-sync case's next_due_date when a next visit is scheduled
    if (newVisit.next_visit_date) {
      await supabase.from("orthodontic_cases" as any)
        .update({ next_due_date: newVisit.next_visit_date })
        .eq("id", orthoCase.id);
      setForm((prev: any) => ({ ...prev, next_due_date: newVisit.next_visit_date }));
      setOrthoCase((prev: any) => prev ? { ...prev, next_due_date: newVisit.next_visit_date } : prev);
    }

    toast({ title: "Visit logged" });
    setNewVisit({ visit_date: format(new Date(), "yyyy-MM-dd"), phase: "", procedures: [], wire_used: "", notes: "", next_visit_date: "", doctor: "" });
    loadRelated(orthoCase.id);
  }

  async function deleteVisit(id: string) {
    await supabase.from("orthodontic_visits" as any).delete().eq("id", id);
    loadRelated(orthoCase.id);
  }

  async function addPayment() {
    if (!orthoCase?.id) return toast({ title: "Save case first", variant: "destructive" });
    if (!newPayment.amount) return toast({ title: "Amount required", variant: "destructive" });
    const paid = parseFloat(newPayment.paid_amount || "0");
    const amt = parseFloat(newPayment.amount);
    const status = paid >= amt ? "paid" : paid > 0 ? "partial" : "pending";
    const { error } = await supabase.from("orthodontic_payments" as any).insert({
      case_id: orthoCase.id,
      due_date: newPayment.due_date,
      amount: amt,
      paid_amount: paid,
      paid_date: newPayment.paid_date || null,
      status,
      payment_method: newPayment.payment_method,
      notes: newPayment.notes,
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setNewPayment({ due_date: format(new Date(), "yyyy-MM-dd"), amount: "", paid_amount: "", paid_date: "", status: "pending", payment_method: "", notes: "" });
    loadRelated(orthoCase.id);
  }

  async function markPaid(p: any) {
    await supabase.from("orthodontic_payments" as any).update({
      paid_amount: p.amount,
      paid_date: format(new Date(), "yyyy-MM-dd"),
      status: "paid",
    }).eq("id", p.id);
    loadRelated(orthoCase.id);
  }

  async function deletePayment(id: string) {
    await supabase.from("orthodontic_payments" as any).delete().eq("id", id);
    loadRelated(orthoCase.id);
  }

  async function uploadPhoto(file: File, phase: string, caption: string, visitId: string) {
    if (!orthoCase?.id) return toast({ title: "Save case first", variant: "destructive" });
    const path = `ortho/${orthoCase.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("clinical-photos").upload(path, file);
    if (upErr) return toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
    const visit = visits.find((v) => v.id === visitId);
    // Store only the storage path — signed URLs are generated at read time.
    await supabase.from("orthodontic_photos" as any).insert({
      case_id: orthoCase.id,
      photo_url: path,
      photo_date: visit?.visit_date || format(new Date(), "yyyy-MM-dd"),
      phase: phase || visit?.phase || null,
      caption,
      visit_id: visitId || null,
    });
    loadRelated(orthoCase.id);
  }

  async function deletePhoto(id: string) {
    await supabase.from("orthodontic_photos" as any).delete().eq("id", id);
    loadRelated(orthoCase.id);
  }

  const dueAlerts = useMemo(() => {
    const today = new Date();
    return payments.filter((p) => p.status !== "paid").map((p) => ({
      ...p,
      daysUntil: differenceInDays(new Date(p.due_date), today),
    }));
  }, [payments]);

  const totalPaid = payments.reduce((s, p) => s + Number(p.paid_amount || 0), 0);
  const totalDue = (Number(form.total_cost) || 0) - totalPaid;

  if (!patientId) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground">Select a patient to start ortho treatment.</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Smile className="h-5 w-5" /> Orthodontic Treatment — {patientName}</CardTitle>
            {orthoCase?.case_code && <p className="text-xs text-muted-foreground mt-1">Case: {orthoCase.case_code} · Started {orthoCase.start_date}</p>}
          </div>
          <div className="flex items-center gap-2">
            {orthoCase && <Badge variant={form.status === "active" ? "default" : "secondary"}>{form.status}</Badge>}
            <Button onClick={saveCase} disabled={loading}>{orthoCase ? "Update Case" : "Create Case"}</Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="diagnosis">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="plan">Treatment Plan</TabsTrigger>
          <TabsTrigger value="visits">Visits ({visits.length})</TabsTrigger>
          <TabsTrigger value="wires">Wire Sequence</TabsTrigger>
          <TabsTrigger value="payments">Payments {dueAlerts.filter(a => a.daysUntil <= 7).length > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{dueAlerts.filter(a => a.daysUntil <= 7).length}</Badge>}</TabsTrigger>
          <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* DIAGNOSIS */}
        <TabsContent value="diagnosis">
          <Card><CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Doctor">
              <Select value={form.doctor || ""} onValueChange={(v) => setForm({ ...form, doctor: v })}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctorOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estimated Treatment (months)"><Input type="number" value={form.estimated_months} onChange={(e) => setForm({ ...form, estimated_months: e.target.value })} /></Field>
            <Field label="Molar Relation">
              <Select value={form.molar_relation} onValueChange={(v) => setForm({ ...form, molar_relation: v })}>
                <SelectTrigger><SelectValue placeholder="Class I / II / III" /></SelectTrigger>
                <SelectContent><SelectItem value="Class I">Class I</SelectItem><SelectItem value="Class II Div 1">Class II Div 1</SelectItem><SelectItem value="Class II Div 2">Class II Div 2</SelectItem><SelectItem value="Class III">Class III</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Canine Relation">
              <Select value={form.canine_relation} onValueChange={(v) => setForm({ ...form, canine_relation: v })}>
                <SelectTrigger><SelectValue placeholder="Class I / II / III" /></SelectTrigger>
                <SelectContent><SelectItem value="Class I">Class I</SelectItem><SelectItem value="Class II">Class II</SelectItem><SelectItem value="Class III">Class III</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Overjet (mm)"><Input value={form.overjet} onChange={(e) => setForm({ ...form, overjet: e.target.value })} placeholder="e.g. 3 mm" /></Field>
            <Field label="Overbite (mm/%)"><Input value={form.overbite} onChange={(e) => setForm({ ...form, overbite: e.target.value })} placeholder="e.g. 30%" /></Field>
            <Field label="Midline Deviation"><Input value={form.midline_deviation} onChange={(e) => setForm({ ...form, midline_deviation: e.target.value })} placeholder="e.g. 1mm to right" /></Field>
            <Field label="Crowding"><Input value={form.crowding} onChange={(e) => setForm({ ...form, crowding: e.target.value })} placeholder="Upper / Lower mm" /></Field>
            <Field label="Spacing"><Input value={form.spacing} onChange={(e) => setForm({ ...form, spacing: e.target.value })} /></Field>
            <Field label="Growth Pattern">
              <Select value={form.growth_pattern} onValueChange={(v) => setForm({ ...form, growth_pattern: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="Horizontal">Horizontal</SelectItem><SelectItem value="Average">Average</SelectItem><SelectItem value="Vertical">Vertical</SelectItem></SelectContent>
              </Select>
            </Field>
          </CardContent></Card>
        </TabsContent>

        {/* RECORDS */}
        <TabsContent value="records">
          <Card><CardContent className="pt-6 space-y-5">
            <div>
              <h4 className="text-sm font-medium mb-2">Records Checklist</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {RECORDS_FIELDS.map((r) => (
                  <label key={r.key} className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={!!form.records[r.key]} onCheckedChange={(v) => setForm({ ...form, records: { ...form.records, [r.key]: !!v } })} />
                    <span className="text-sm">{r.label}</span>
                    {form.records[r.key] && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />}
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <OrthoRecordsUploader
                caseId={orthoCase?.id || ""}
                patientId={patientId}
                patientName={patientName}
                patientPhone={orthoCase?.patient?.phone || null}
              />
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* PLAN */}
        <TabsContent value="plan">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Appliance Type">
                <Select value={form.appliance_type} onValueChange={(v) => setForm({ ...form, appliance_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select appliance" /></SelectTrigger>
                  <SelectContent>{APPLIANCE_TYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={`Brand${form.appliance_type ? ` (${form.appliance_type})` : ""}`}>
                <BrandSelect
                  value={form.appliance_brand}
                  onChange={(v) => setForm({ ...form, appliance_brand: v || "" })}
                  placeholder="Select brand"
                />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="on_hold">On Hold</SelectItem><SelectItem value="retention">Retention</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Extraction Plan"><Textarea rows={2} value={form.extraction_plan} onChange={(e) => setForm({ ...form, extraction_plan: e.target.value })} placeholder="e.g. 14, 24, 34, 44" /></Field>
              <Field label="Mini Implant (TAD) Plan"><Textarea rows={2} value={form.mini_implant_plan} onChange={(e) => setForm({ ...form, mini_implant_plan: e.target.value })} placeholder="Sites, size" /></Field>
            </div>
            <Field label="Treatment Notes"><Textarea rows={3} value={form.treatment_notes} onChange={(e) => setForm({ ...form, treatment_notes: e.target.value })} /></Field>
          </CardContent></Card>
        </TabsContent>

        {/* VISITS */}
        <TabsContent value="visits">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded-lg bg-muted/30">
              <Field label="Visit Date"><Input type="date" value={newVisit.visit_date} onChange={(e) => setNewVisit({ ...newVisit, visit_date: e.target.value })} /></Field>
              <Field label="Phase">
                <Select value={newVisit.phase} onValueChange={(v) => setNewVisit({ ...newVisit, phase: v })}>
                  <SelectTrigger><SelectValue placeholder="Phase" /></SelectTrigger>
                  <SelectContent>{PHASES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Wire Used"><Input value={newVisit.wire_used} onChange={(e) => setNewVisit({ ...newVisit, wire_used: e.target.value })} placeholder="e.g. 016 NiTi" /></Field>
              <div className="md:col-span-3">
                <Label className="text-xs">Procedures</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PROCEDURE_OPTIONS.map((p) => {
                    const on = newVisit.procedures.includes(p);
                    return (
                      <button key={p} type="button" onClick={() => setNewVisit({ ...newVisit, procedures: on ? newVisit.procedures.filter(x => x !== p) : [...newVisit.procedures, p] })}
                        className={`text-xs px-2 py-1 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Notes"><Input value={newVisit.notes} onChange={(e) => setNewVisit({ ...newVisit, notes: e.target.value })} /></Field>
              <Field label="Next Visit"><Input type="date" value={newVisit.next_visit_date} onChange={(e) => setNewVisit({ ...newVisit, next_visit_date: e.target.value })} /></Field>
              <div className="flex items-end"><Button onClick={addVisit} className="w-full"><Plus className="h-4 w-4 mr-1" />Log Visit</Button></div>
            </div>

            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Phase</TableHead><TableHead>Procedures</TableHead><TableHead>Wire</TableHead><TableHead>Next</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {visits.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No visits logged yet</TableCell></TableRow>}
                {visits.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.visit_date}</TableCell>
                    <TableCell><Badge variant="outline">{v.phase || "—"}</Badge></TableCell>
                    <TableCell className="text-xs">{(v.procedures || []).join(", ") || "—"}</TableCell>
                    <TableCell>{v.wire_used || "—"}</TableCell>
                    <TableCell>{v.next_visit_date || "—"}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteVisit(v.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* WIRE SEQUENCE */}
        <TabsContent value="wires">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="flex gap-2">
              <Input value={wireInput} onChange={(e) => setWireInput(e.target.value)} placeholder="e.g. 014 NiTi → 016 NiTi → 016x22 NiTi" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addWire())} />
              <Button onClick={addWire}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2">
              {form.wire_sequence.length === 0 && <p className="text-sm text-muted-foreground">No wires planned. Add the planned wire sequence.</p>}
              {form.wire_sequence.map((w: string, i: number) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded">
                  <Badge variant="outline">{i + 1}</Badge>
                  <span className="flex-1 text-sm">{w}</span>
                  <Button size="icon" variant="ghost" onClick={() => removeWire(i)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground"><Wrench className="h-3 w-3 inline" /> Save the case to persist the wire sequence.</p>
          </CardContent></Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Total Cost (₹)"><Input type="number" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} /></Field>
              <Field label="Installment (₹)"><Input type="number" value={form.installment_amount} onChange={(e) => setForm({ ...form, installment_amount: e.target.value })} /></Field>
              <Field label="Frequency">
                <Select value={form.installment_frequency} onValueChange={(v) => setForm({ ...form, installment_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Next Due Date"><Input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} /></Field>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 border rounded bg-muted/30">
              <div><p className="text-xs text-muted-foreground">Total Cost</p><p className="text-lg font-semibold">₹{Number(form.total_cost || 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-semibold text-green-600">₹{totalPaid.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Balance</p><p className="text-lg font-semibold text-red-600">₹{totalDue.toLocaleString()}</p></div>
            </div>

            {dueAlerts.filter(a => a.daysUntil <= 7 && a.daysUntil >= -30).length > 0 && (
              <div className="p-3 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded">
                <p className="text-sm font-medium flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" /> Due Alerts</p>
                {dueAlerts.filter(a => a.daysUntil <= 7 && a.daysUntil >= -30).map(a => (
                  <p key={a.id} className="text-xs mt-1">₹{a.amount} due {a.daysUntil < 0 ? `${Math.abs(a.daysUntil)} days overdue` : a.daysUntil === 0 ? "today" : `in ${a.daysUntil} days`} ({a.due_date})</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 border rounded">
              <Input type="date" value={newPayment.due_date} onChange={(e) => setNewPayment({ ...newPayment, due_date: e.target.value })} />
              <Input type="number" placeholder="Amount" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} />
              <Input type="number" placeholder="Paid" value={newPayment.paid_amount} onChange={(e) => setNewPayment({ ...newPayment, paid_amount: e.target.value })} />
              <Input placeholder="Method" value={newPayment.payment_method} onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })} />
              <Input placeholder="Notes" value={newPayment.notes} onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })} />
              <Button onClick={addPayment}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>

            <Table>
              <TableHeader><TableRow><TableHead>Due</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead><TableHead>Method</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {payments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No installments yet</TableCell></TableRow>}
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.due_date}</TableCell>
                    <TableCell>₹{Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell>₹{Number(p.paid_amount).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={p.status === "paid" ? "default" : p.status === "partial" ? "secondary" : "outline"}>{p.status}</Badge></TableCell>
                    <TableCell>{p.payment_method || "—"}</TableCell>
                    <TableCell className="flex gap-1">
                      {p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid(p)}>Mark Paid</Button>}
                      <Button size="icon" variant="ghost" onClick={() => deletePayment(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* PHOTOS */}
        <TabsContent value="photos">
          <Card><CardContent className="pt-6 space-y-4">
            <PhotoUpload onUpload={uploadPhoto} disabled={!orthoCase?.id} visits={visits} />
            <PhotosListView photos={photos} visits={visits} onDelete={deletePhoto} />
          </CardContent></Card>
        </TabsContent>

        {/* RETENTION */}
        <TabsContent value="retention">
          <Card><CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Retainer Type">
              <Select value={form.retainer_type} onValueChange={(v) => setForm({ ...form, retainer_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hawley">Hawley</SelectItem>
                  <SelectItem value="Essix (Clear)">Essix (Clear)</SelectItem>
                  <SelectItem value="Fixed Lingual">Fixed Lingual</SelectItem>
                  <SelectItem value="Begg Wraparound">Begg Wraparound</SelectItem>
                  <SelectItem value="VFR">VFR</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Retention Started On"><Input type="date" value={form.retention_started_at} onChange={(e) => setForm({ ...form, retention_started_at: e.target.value })} /></Field>
            <Field label="Review Schedule">
              <Select value={form.retention_review_schedule} onValueChange={(v) => setForm({ ...form, retention_review_schedule: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 month">Every 1 month</SelectItem>
                  <SelectItem value="3 months">Every 3 months</SelectItem>
                  <SelectItem value="6 months">Every 6 months</SelectItem>
                  <SelectItem value="12 months">Every 12 months</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Retention Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </CardContent></Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline">
          <Card><CardContent className="pt-6">
            <div className="space-y-3">
              {visits.length === 0 && photos.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Timeline will appear as visits and photos are added.</p>}
              {[
                ...visits.map(v => ({ type: "visit", date: v.visit_date, data: v })),
                ...photos.map(p => ({ type: "photo", date: p.photo_date, data: p })),
                ...payments.filter(p => p.paid_date).map(p => ({ type: "payment", date: p.paid_date, data: p })),
              ].sort((a, b) => (a.date < b.date ? 1 : -1)).map((item, i) => (
                <div key={i} className="flex gap-3 border-l-2 border-primary pl-3 pb-3">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                    {item.type === "visit" && (
                      <p className="text-sm"><Badge variant="outline" className="mr-2">Visit · {item.data.phase}</Badge>{(item.data.procedures || []).join(", ")}</p>
                    )}
                    {item.type === "photo" && (
                      <div className="flex items-center gap-2"><Badge variant="secondary">Photo</Badge><img src={item.data.photo_url} className="h-12 w-12 object-cover rounded" />{item.data.caption}</div>
                    )}
                    {item.type === "payment" && (
                      <p className="text-sm"><Badge className="mr-2">Payment</Badge>₹{Number(item.data.paid_amount).toLocaleString()} received</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PhotoUpload({ onUpload, disabled, visits }: { onUpload: (f: File, phase: string, caption: string, visitId: string) => void; disabled: boolean; visits: any[] }) {
  const [phase, setPhase] = useState("");
  const [caption, setCaption] = useState("");
  const [visitId, setVisitId] = useState("");
  const visitsAsc = useMemo(() => [...visits].sort((a, b) => (a.visit_date < b.visit_date ? -1 : 1)), [visits]);
  const visitNum = (id: string) => visitsAsc.findIndex((v) => v.id === id) + 1;
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 border rounded">
      <Select value={visitId} onValueChange={(v) => {
        setVisitId(v);
        const vv = visits.find((x) => x.id === v);
        if (vv?.phase) setPhase(vv.phase);
      }}>
        <SelectTrigger><SelectValue placeholder="Visit" /></SelectTrigger>
        <SelectContent>
          {visitsAsc.length === 0 && <SelectItem value="__none" disabled>No visits yet</SelectItem>}
          {visitsAsc.map((v) => (
            <SelectItem key={v.id} value={v.id}>Visit #{visitNum(v.id)} · {v.visit_date}{v.phase ? ` · ${v.phase}` : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={phase} onValueChange={setPhase}>
        <SelectTrigger><SelectValue placeholder="Phase" /></SelectTrigger>
        <SelectContent>{PHASES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
      </Select>
      <Input placeholder="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <div className="md:col-span-2">
        <label className={`flex items-center justify-center gap-2 p-2 border-2 border-dashed rounded cursor-pointer hover:bg-muted/40 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload className="h-4 w-4" /> <span className="text-sm">Upload progress photo(s)</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
            const files = Array.from(e.target.files || []);
            files.forEach((f) => onUpload(f, phase, caption, visitId));
            if (files.length) setCaption("");
            e.target.value = "";
          }} />
        </label>
      </div>
    </div>
  );
}

function PhotosListView({ photos, visits, onDelete }: { photos: any[]; visits: any[]; onDelete: (id: string) => void }) {
  const [viewing, setViewing] = useState<{ title: string; photos: any[] } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const visitsAsc = useMemo(() => [...visits].sort((a, b) => (a.visit_date < b.visit_date ? -1 : 1)), [visits]);
  const visitNum = (id?: string | null) => id ? visitsAsc.findIndex((v) => v.id === id) + 1 : 0;

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; visit?: any; visit_no: number; date: string; phase: string; photos: any[] }>();
    for (const p of photos) {
      const v = p.visit_id ? visits.find((vv) => vv.id === p.visit_id) : null;
      const key = p.visit_id || `nov-${p.photo_date}-${p.phase || ""}`;
      const date = v?.visit_date || p.photo_date;
      const phase = p.phase || v?.phase || "—";
      if (!map.has(key)) {
        map.set(key, { key, visit: v, visit_no: visitNum(p.visit_id), date, phase, photos: [] });
      }
      map.get(key)!.photos.push(p);
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [photos, visits, visitsAsc]);

  if (photos.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">No progress photos yet</p>;
  }

  return (
    <>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Visit</TableHead>
              <TableHead className="w-32">Date</TableHead>
              <TableHead>Phase</TableHead>
              <TableHead>Captions</TableHead>
              <TableHead className="w-24 text-center">Photos</TableHead>
              <TableHead className="w-32 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const captions = Array.from(new Set(g.photos.map((p) => p.caption).filter(Boolean))).join(", ");
              return (
                <TableRow key={g.key}>
                  <TableCell>{g.visit_no ? <Badge variant="outline">#{g.visit_no}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{g.date}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{g.phase}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]" title={captions}>{captions || "—"}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <img src={g.photos[0].photo_url} className="h-8 w-8 object-cover rounded" alt="" />
                      <span className="text-xs font-medium">{g.photos.length}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setViewing({ title: `Visit ${g.visit_no ? "#" + g.visit_no + " · " : ""}${g.date} · ${g.phase}`, photos: g.photos })}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{viewing?.title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[70vh] overflow-auto">
            {viewing?.photos.map((p) => (
              <div key={p.id} className="border rounded overflow-hidden group relative">
                <img src={p.photo_url} alt={p.caption || "ortho"} className="w-full h-40 object-cover cursor-zoom-in" onClick={() => setLightbox(p.photo_url)} />
                <div className="p-2 text-xs">
                  <p className="font-medium">{p.photo_date}</p>
                  {p.phase && <Badge variant="outline" className="text-[10px] mt-1">{p.phase}</Badge>}
                  {p.caption && <p className="text-muted-foreground mt-1 truncate" title={p.caption}>{p.caption}</p>}
                </div>
                <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { onDelete(p.id); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl p-2">
          {lightbox && <img src={lightbox} alt="" className="w-full max-h-[85vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
