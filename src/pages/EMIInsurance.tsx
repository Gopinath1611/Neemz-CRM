import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Shield, Plus, Upload, FileText, Trash2, Pencil, ArrowLeft, IndianRupee, TrendingUp, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, ExternalLink, Stethoscope, Eye, Search, RefreshCw, Save, X } from "lucide-react";
import { AdvancedDateRangeFilter } from "@/components/common/AdvancedDateRangeFilter";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { formatPatientCode } from "@/lib/patientCode";

type Lender = { id: string; name: string; type: string; default_interest_rate: number };
type Patient = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  patient_code?: string | number | null;
};
type Doc = { id: string; case_id: string; doc_type: string; file_url: string; file_name: string; uploaded_at: string };
type Case = {
  id: string; case_code: string; patient_id: string; case_type: string; status: string;
  pan_number?: string; aadhar_number?: string; credit_score?: number;
  treatment_cost: number; eligible_amount: number; approved_amount: number;
  down_payment: number; tenure_months: number; interest_rate: number;
  emi_amount: number; total_interest: number; total_payable: number;
  lender_id?: string; lender_name?: string;
  insurance_company?: string; policy_number?: string; claim_amount: number;
  approved_claim_amount: number; claim_status?: string; documents_sent: any;
  notes?: string; doctor?: string; treatment_name?: string; created_at: string;
  patient?: Patient;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  eligible: "bg-emerald-100 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
  active: "bg-amber-100 text-amber-700",
  completed: "bg-purple-100 text-purple-700",
};

const INSURANCE_DOCS = ["Pre-auth form", "Doctor's prescription", "Treatment plan", "Invoice / Bill", "Diagnostic reports", "Discharge summary", "ID proof"];

const getPatientName = (patient?: Patient | null) => {
  const name = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim();
  return name || "—";
};

const normalizePhone = (value?: string | null) => (value || "").replace(/\D/g, "");

const dedupePatients = (list: Patient[]) => {
  const map = new Map<string, Patient>();
  list.forEach((patient) => {
    if (!map.has(patient.id)) map.set(patient.id, patient);
  });
  return Array.from(map.values());
};

export default function EMIInsurance() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const focusPatientId = params.get("patient");
  const focusCaseId = params.get("case");

  const [cases, setCases] = useState<Case[]>([]);
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [treatments, setTreatments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState<"emi" | "insurance" | "all">("all");
  const [detailTab, setDetailTab] = useState<string>("application");
  const [viewMode, setViewMode] = useState<"view" | "edit">("edit");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Status-based edit lock — approved/cancelled are read-only regardless of UI mode
  const LOCKED_STATUSES = new Set(["approved", "cancelled"]);
  const isStatusLocked = (s?: string) => LOCKED_STATUSES.has((s || "").toLowerCase());

  const load = async () => {
    setLoading(true);
    const PATIENT_FIELDS = "id, first_name, last_name, phone, patient_code";
    const [{ data: cs }, { data: lds }, { data: pts }, { data: trs }] = await Promise.all([
      supabase.from("emi_insurance_cases" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("emi_lenders" as any).select("*").eq("is_active", true).order("name"),
      // Default list for the New Case picker only (it has its own server-side search)
      supabase.from("patients").select(PATIENT_FIELDS).order("first_name").limit(500),
      supabase.from("clinic_treatments").select("id, name").eq("is_active", true).order("name"),
    ]);

    // Resolve names strictly for the patient ids referenced by the loaded cases
    const caseIds = Array.from(new Set(((cs as any[]) || []).map((c) => c.patient_id).filter(Boolean)));
    const casePatients: any[] = [];
    for (let i = 0; i < caseIds.length; i += 200) {
      const chunk = caseIds.slice(i, i + 200);
      const { data } = await supabase.from("patients").select(PATIENT_FIELDS).in("id", chunk);
      if (data) casePatients.push(...(data as any[]));
    }

    const ptMap = new Map<string, any>();
    [...((pts as any[]) || []), ...casePatients].forEach((p) => ptMap.set(p.id, p));
    const enriched = ((cs as any[]) || []).map((c) => ({ ...c, patient: ptMap.get(c.patient_id) }));
    setCases(enriched as any);
    setLenders((lds as any) || []);
    setPatients(dedupePatients([...(((pts as any) || []) as Patient[]), ...(casePatients as Patient[])]));
    setTreatments((trs as any) || []);
    setLoading(false);


    if (focusCaseId) {
      const c = enriched.find((x: any) => x.id === focusCaseId);
      if (c) openCase(c as any);
    } else if (focusPatientId) {
      const c = enriched.find((x: any) => x.patient_id === focusPatientId);
      if (c) openCase(c as any);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("emi-insurance-cases-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "emi_insurance_cases" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openCase = async (c: Case, mode: "view" | "edit" = "edit") => {
    setActiveCase(c);
    setViewMode(mode);
    const { data } = await supabase.from("emi_insurance_documents" as any).select("*").eq("case_id", c.id).order("uploaded_at", { ascending: false });
    setDocs((data as any) || []);
  };

  const dateFilter = useDateRangeFilter("all");

  const filtered = useMemo(() => {
    let list = cases;
    if (tab !== "all") list = list.filter((c) => c.case_type === tab);
    const { from, to } = dateFilter.range;
    if (from) list = list.filter((c) => new Date(c.created_at) >= from);
    if (to) list = list.filter((c) => new Date(c.created_at) <= to);
    return list;
  }, [cases, tab, dateFilter.range]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const eligible = filtered.filter((c) => ["eligible", "approved", "active", "completed"].includes(c.status)).length;
    const pending = filtered.filter((c) => ["draft", "submitted"].includes(c.status)).length;
    const rejected = filtered.filter((c) => ["rejected", "cancelled"].includes(c.status)).length;
    const approvedAmount = filtered.reduce((s, c) => s + Number(c.approved_amount || c.approved_claim_amount || 0), 0);
    return { total, eligible, pending, rejected, approvedAmount };
  }, [filtered]);

  useEffect(() => { setPage(1); }, [tab, pageSize, dateFilter.preset, dateFilter.customFrom, dateFilter.customTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const deleteCaseById = async (id: string, code: string) => {
    if (!confirm(`Delete case ${code}?`)) return;
    const { error } = await supabase.from("emi_insurance_cases" as any).delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted", description: code });
    setCases((prev) => prev.filter((c) => c.id !== id));
  };

  const recalc = (cost: number, dp: number, tenure: number, rate: number) => {
    const principal = Math.max(cost - dp, 0);
    if (!tenure || tenure <= 0) return { emi: 0, totalInterest: 0, totalPayable: principal };
    const r = (Number(rate) || 0) / 100 / 12;
    let emi = principal / tenure;
    if (r > 0) emi = (principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
    const totalPayable = emi * tenure;
    return { emi: Math.round(emi * 100) / 100, totalInterest: Math.round((totalPayable - principal) * 100) / 100, totalPayable: Math.round(totalPayable * 100) / 100 };
  };

  const updateCase = async (patch: Partial<Case>) => {
    if (!activeCase) return;
    const merged: any = { ...activeCase, ...patch };
    if (merged.case_type === "emi") {
      const c = recalc(Number(merged.treatment_cost) || 0, Number(merged.down_payment) || 0, Number(merged.tenure_months) || 0, Number(merged.interest_rate) || 0);
      merged.emi_amount = c.emi;
      merged.total_interest = c.totalInterest;
      merged.total_payable = c.totalPayable;
    }
    setActiveCase(merged);
    const { error } = await supabase.from("emi_insurance_cases" as any).update({
      pan_number: merged.pan_number, aadhar_number: merged.aadhar_number, credit_score: merged.credit_score,
      treatment_cost: merged.treatment_cost, eligible_amount: merged.eligible_amount, approved_amount: merged.approved_amount,
      down_payment: merged.down_payment, tenure_months: merged.tenure_months, interest_rate: merged.interest_rate,
      emi_amount: merged.emi_amount, total_interest: merged.total_interest, total_payable: merged.total_payable,
      lender_id: merged.lender_id, lender_name: merged.lender_name, status: merged.status,
      insurance_company: merged.insurance_company, policy_number: merged.policy_number,
      claim_amount: merged.claim_amount, approved_claim_amount: merged.approved_claim_amount,
      claim_status: merged.claim_status, documents_sent: merged.documents_sent,
      notes: merged.notes, doctor: merged.doctor, treatment_name: merged.treatment_name,
    }).eq("id", activeCase.id);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setCases((prev) => prev.map((c) => (c.id === merged.id ? merged : c)));
  };

  const uploadDoc = async (docType: string, file: File) => {
    if (!activeCase) return;
    const path = `${activeCase.id}/${docType}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("emi-documents").upload(path, file);
    if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); return; }
    const { data: signed } = await supabase.storage.from("emi-documents").createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl || path;
    const { error } = await supabase.from("emi_insurance_documents" as any).insert({
      case_id: activeCase.id, doc_type: docType, file_url: url, file_name: file.name,
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Document uploaded", description: docType });
    openCase(activeCase, viewMode);
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await supabase.from("emi_insurance_documents" as any).delete().eq("id", id);
    if (activeCase) openCase(activeCase, viewMode);
  };

  const createCase = async (patientId: string, type: "emi" | "insurance") => {
    const { data, error } = await supabase.from("emi_insurance_cases" as any).insert({
      patient_id: patientId, case_type: type, status: "draft",
    }).select("*").single();
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Case created", description: (data as any).case_code });
    await load();
    openCase(data as any);
  };

  const deleteCase = async () => {
    if (!activeCase) return;
    if (!confirm(`Delete case ${activeCase.case_code}?`)) return;
    await supabase.from("emi_insurance_cases" as any).delete().eq("id", activeCase.id);
    setActiveCase(null);
    load();
  };

  // -------- DETAIL VIEW --------
  if (activeCase) {
    const c = activeCase;
    const isEmi = c.case_type === "emi";
    const filteredLenders = lenders.filter((l) => l.type === c.case_type);
    const docsSent: string[] = Array.isArray(c.documents_sent) ? c.documents_sent : [];
    const statusLocked = isStatusLocked(c.status);
    const readOnly = viewMode === "view" || statusLocked;

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
    const panError = c.pan_number && !panRegex.test(c.pan_number)
      ? "Enter a valid PAN Number (Example: ABCDE1234F)."
      : "";
    const aadharError = c.aadhar_number && !/^\d{12}$/.test(c.aadhar_number)
      ? "Aadhaar Number must contain exactly 12 digits."
      : "";
    const kycInvalid = !!panError || !!aadharError;

    // ---- EMI live calculation & validation ----
    const inrFmt = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const statusLower = (c.status || "").toLowerCase();
    const isApprovedStatus = statusLower === "approved";
    const emiReadOnly = readOnly || ["rejected", "cancelled"].includes(statusLower);

    const tCost = Number(c.treatment_cost) || 0;
    const dPay = Number(c.down_payment) || 0;
    const tenure = Number(c.tenure_months) || 0;
    const rate = Number(c.interest_rate) || 0;
    const loanAmount = Math.max(tCost - dPay, 0);
    const live = recalc(tCost, dPay, tenure, rate);

    const emiErrors: Record<string, string> = {};
    if (isEmi) {
      if (!c.lender_id) emiErrors.lender = "Select a lender / finance company.";
      if (!tCost || tCost <= 0) emiErrors.treatment_cost = "Treatment Cost must be greater than ₹0.";
      if (dPay < 0) emiErrors.down_payment = "Down Payment cannot be negative.";
      else if (dPay > tCost) emiErrors.down_payment = "Down Payment cannot exceed Treatment Cost.";
      if (!tenure) emiErrors.tenure = "Tenure is required.";
      else if (!Number.isInteger(tenure)) emiErrors.tenure = "Tenure must be a whole number of months.";
      else if (tenure < 3 || tenure > 60) emiErrors.tenure = "Tenure must be between 3 and 60 months.";
      if (!rate || rate <= 0) emiErrors.interest_rate = "Interest Rate is required.";
      if (c.eligible_amount && Number(c.eligible_amount) > tCost) emiErrors.eligible_amount = "Eligible Amount cannot exceed Treatment Cost.";
      if (isApprovedStatus && (!c.approved_amount || Number(c.approved_amount) <= 0)) emiErrors.approved_amount = "Approved Amount is required when status is Approved.";
      if (c.approved_amount && Number(c.approved_amount) > loanAmount) emiErrors.approved_amount = "Approved Amount cannot exceed Loan Amount.";
    }
    const emiInvalid = Object.keys(emiErrors).length > 0;

    const validateAndSave = async () => {
      const missing: string[] = [];
      if (detailTab === "application") {
        if (!c.pan_number) missing.push("PAN Number");
        if (!c.aadhar_number) missing.push("Aadhar Number");
        if (!c.treatment_name) missing.push("Treatment");
      } else if (detailTab === "emi") {
        // handled by emiErrors
      } else if (detailTab === "insurance") {
        if (!c.lender_id) missing.push("Insurance Company");
        if (!c.policy_number) missing.push("Policy Number");
        if (!c.claim_amount) missing.push("Claim Amount");
      }
      if (missing.length) {
        toast({ title: "Mandatory fields missing", description: missing.join(", "), variant: "destructive" });
        return;
      }
      if (detailTab === "application" && kycInvalid) {
        toast({ title: "Invalid KYC details", description: [panError, aadharError].filter(Boolean).join(" "), variant: "destructive" });
        return;
      }
      if (detailTab === "emi" && emiInvalid) {
        toast({ title: "Fix EMI validation errors", description: Object.values(emiErrors).join(" "), variant: "destructive" });
        return;
      }
      await updateCase({});
      toast({ title: "Saved", description: "Changes saved successfully" });
    };

    const cancelAndExit = () => setActiveCase(null);

    const saveDisabled =
      (detailTab === "application" && kycInvalid) ||
      (detailTab === "emi" && emiInvalid);

    const SaveCancelBar = () => readOnly ? null : (
      <div className="flex justify-end gap-2 pt-2 border-t mt-2">
        <Button variant="outline" onClick={cancelAndExit}><X size={14} className="mr-1" />Cancel</Button>
        <Button onClick={validateAndSave} disabled={saveDisabled}><Save size={14} className="mr-1" />Save</Button>
      </div>
    );



    const Req = () => <span className="text-destructive ml-0.5">*</span>;

    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveCase(null)}><ArrowLeft size={16} className="mr-1" />Back</Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {isEmi ? <CreditCard size={22} /> : <Shield size={22} />} {c.case_code}
                <Badge className={STATUS_COLORS[c.status] || ""}>{c.status}</Badge>
                {readOnly && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 flex items-center gap-1">
                    <Eye size={12} /> View Only{statusLocked ? ` (${c.status})` : ""}
                  </Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                Patient: <button className="text-primary underline" onClick={() => navigate(`/clinic-workflow?patient=${c.patient_id}`)}>{c.patient ? getPatientName(c.patient) : "Unknown Patient"}</button>
                {c.patient?.phone ? ` • ${c.patient.phone}` : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {readOnly && !statusLocked && (
              <Button variant="default" size="sm" onClick={() => setViewMode("edit")}>
                <Pencil size={14} className="mr-1" />Edit
              </Button>
            )}
            <Select value={c.status} onValueChange={(v) => updateCase({ status: v })} disabled={readOnly}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["draft", "submitted", "eligible", "rejected", "cancelled", "active", "completed"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!readOnly && (
              <Button variant="destructive" size="sm" onClick={deleteCase}><Trash2 size={14} className="mr-1" />Delete</Button>
            )}
          </div>
        </div>


        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList>
            <TabsTrigger value="application">KYC & Application</TabsTrigger>
            {isEmi ? <TabsTrigger value="emi">EMI Calculator</TabsTrigger> : <TabsTrigger value="insurance">Insurance Claim</TabsTrigger>}
            <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="application">
            <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0"><Card><CardContent className="pt-6 grid gap-4 md:grid-cols-2">
              <div>
                <Label>PAN Number<Req /></Label>
                <Input
                  value={c.pan_number || ""}
                  maxLength={10}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
                    setActiveCase({ ...c, pan_number: v });
                  }}
                  onBlur={(e) => updateCase({ pan_number: e.target.value.toUpperCase() })}
                  placeholder="ABCDE1234F"
                  aria-invalid={!!panError}
                />
                {panError && <p className="text-xs text-destructive mt-1">{panError}</p>}
              </div>
              <div>
                <Label>Aadhar Number<Req /></Label>
                <Input
                  value={c.aadhar_number || ""}
                  maxLength={12}
                  inputMode="numeric"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                    setActiveCase({ ...c, aadhar_number: v });
                  }}
                  onBlur={(e) => updateCase({ aadhar_number: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                  placeholder="123456789012"
                  aria-invalid={!!aadharError}
                />
                {aadharError && <p className="text-xs text-destructive mt-1">{aadharError}</p>}
              </div>

              <div><Label>Credit Score (CIBIL)</Label><Input type="number" value={c.credit_score || ""} onChange={(e) => setActiveCase({ ...c, credit_score: Number(e.target.value) })} onBlur={(e) => updateCase({ credit_score: Number(e.target.value) })} placeholder="750" /></div>
              <div><Label>Doctor</Label><Input value={c.doctor || ""} onChange={(e) => setActiveCase({ ...c, doctor: e.target.value })} onBlur={(e) => updateCase({ doctor: e.target.value })} /></div>
              <div className="md:col-span-2">
                <Label>Treatment<Req /></Label>
                <Select value={c.treatment_name || ""} onValueChange={(v) => updateCase({ treatment_name: v })}>
                  <SelectTrigger><SelectValue placeholder="Select treatment" /></SelectTrigger>
                  <SelectContent>
                    {treatments.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Notes</Label><Textarea value={c.notes || ""} onChange={(e) => setActiveCase({ ...c, notes: e.target.value })} onBlur={(e) => updateCase({ notes: e.target.value })} rows={3} /></div>
              <div className="md:col-span-2"><SaveCancelBar /></div>
            </CardContent></Card></fieldset>
          </TabsContent>

          {isEmi && (
            <TabsContent value="emi">
              <fieldset disabled={emiReadOnly} className="border-0 p-0 m-0 min-w-0"><Card><CardContent className="pt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Lender / Finance Co.<Req /></Label>
                    <Select value={c.lender_id || ""} onValueChange={(v) => {
                      const l = lenders.find((x) => x.id === v);
                      updateCase({ lender_id: v, lender_name: l?.name, interest_rate: c.interest_rate || l?.default_interest_rate || 0 });
                    }}>
                      <SelectTrigger aria-invalid={!!emiErrors.lender}><SelectValue placeholder="Select lender" /></SelectTrigger>
                      <SelectContent>
                        {filteredLenders.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name} ({l.default_interest_rate}%)</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {emiErrors.lender && <p className="text-xs text-destructive mt-1">{emiErrors.lender}</p>}
                  </div>
                  <div>
                    <Label>Treatment Cost (₹)<Req /></Label>
                    <Input type="number" min={0} step="0.01" value={c.treatment_cost ?? ""} aria-invalid={!!emiErrors.treatment_cost}
                      onChange={(e) => setActiveCase({ ...c, treatment_cost: e.target.value === "" ? 0 : Number(e.target.value) })}
                      onBlur={(e) => updateCase({ treatment_cost: Number(e.target.value) || 0 })} />
                    {emiErrors.treatment_cost && <p className="text-xs text-destructive mt-1">{emiErrors.treatment_cost}</p>}
                  </div>
                  <div>
                    <Label>Down Payment (₹)<Req /></Label>
                    <Input type="number" min={0} step="0.01" value={c.down_payment ?? 0} aria-invalid={!!emiErrors.down_payment}
                      onChange={(e) => setActiveCase({ ...c, down_payment: e.target.value === "" ? 0 : Number(e.target.value) })}
                      onBlur={(e) => updateCase({ down_payment: Number(e.target.value) || 0 })} />
                    {emiErrors.down_payment && <p className="text-xs text-destructive mt-1">{emiErrors.down_payment}</p>}
                  </div>
                  <div>
                    <Label>Tenure (months)<Req /></Label>
                    <Input type="number" min={3} max={60} step={1} value={c.tenure_months ?? ""} aria-invalid={!!emiErrors.tenure}
                      onChange={(e) => setActiveCase({ ...c, tenure_months: e.target.value === "" ? 0 : Math.floor(Number(e.target.value)) })}
                      onBlur={(e) => updateCase({ tenure_months: Math.floor(Number(e.target.value)) || 0 })} />
                    {emiErrors.tenure && <p className="text-xs text-destructive mt-1">{emiErrors.tenure}</p>}
                  </div>
                  <div>
                    <Label>Interest Rate (% p.a.)<Req /></Label>
                    <Input type="number" min={0} step="0.01" value={c.interest_rate ?? ""} aria-invalid={!!emiErrors.interest_rate}
                      onChange={(e) => setActiveCase({ ...c, interest_rate: e.target.value === "" ? 0 : Number(e.target.value) })}
                      onBlur={(e) => updateCase({ interest_rate: Number(e.target.value) || 0 })} />
                    {emiErrors.interest_rate && <p className="text-xs text-destructive mt-1">{emiErrors.interest_rate}</p>}
                  </div>
                  <div>
                    <Label>Eligible Amount (₹)</Label>
                    <Input type="number" min={0} step="0.01" value={c.eligible_amount ?? ""} aria-invalid={!!emiErrors.eligible_amount}
                      onChange={(e) => setActiveCase({ ...c, eligible_amount: e.target.value === "" ? 0 : Number(e.target.value) })}
                      onBlur={(e) => updateCase({ eligible_amount: Number(e.target.value) || 0 })} />
                    {emiErrors.eligible_amount && <p className="text-xs text-destructive mt-1">{emiErrors.eligible_amount}</p>}
                  </div>
                  <div>
                    <Label>Approved Amount (₹){isApprovedStatus && <Req />}</Label>
                    <Input type="number" min={0} step="0.01" value={c.approved_amount ?? ""} aria-invalid={!!emiErrors.approved_amount}
                      onChange={(e) => setActiveCase({ ...c, approved_amount: e.target.value === "" ? 0 : Number(e.target.value) })}
                      onBlur={(e) => updateCase({ approved_amount: Number(e.target.value) || 0 })} />
                    {emiErrors.approved_amount && <p className="text-xs text-destructive mt-1">{emiErrors.approved_amount}</p>}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 bg-muted/40 rounded-lg p-4">
                  <Stat label="Loan Amount" value={inrFmt(loanAmount)} />
                  <Stat label="Monthly EMI" value={inrFmt(Math.round(live.emi * 100) / 100)} />
                  <Stat label="Total Interest" value={inrFmt(live.totalInterest)} />
                  <Stat label="Total Payable" value={inrFmt(live.totalPayable)} />
                </div>
                <p className="text-xs text-muted-foreground">EMI is auto-calculated using the standard reducing-balance formula and refreshes on every change.</p>
                <SaveCancelBar />
              </CardContent></Card></fieldset>
            </TabsContent>

          )}

          {!isEmi && (
            <TabsContent value="insurance">
              <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0"><Card><CardContent className="pt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Insurance Company<Req /></Label>
                    <Select value={c.lender_id || ""} onValueChange={(v) => {
                      const l = lenders.find((x) => x.id === v);
                      updateCase({ lender_id: v, lender_name: l?.name, insurance_company: l?.name });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                      <SelectContent>
                        {filteredLenders.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Policy Number<Req /></Label><Input value={c.policy_number || ""} onChange={(e) => setActiveCase({ ...c, policy_number: e.target.value })} onBlur={(e) => updateCase({ policy_number: e.target.value })} /></div>
                  <div><Label>Treatment Cost (₹)</Label><Input type="number" value={c.treatment_cost || ""} onChange={(e) => setActiveCase({ ...c, treatment_cost: Number(e.target.value) })} onBlur={(e) => updateCase({ treatment_cost: Number(e.target.value) })} /></div>
                  <div><Label>Claim Amount (₹)<Req /></Label><Input type="number" value={c.claim_amount || ""} onChange={(e) => setActiveCase({ ...c, claim_amount: Number(e.target.value) })} onBlur={(e) => updateCase({ claim_amount: Number(e.target.value) })} /></div>
                  <div><Label>Approved Claim Amount (₹)</Label><Input type="number" value={c.approved_claim_amount || ""} onChange={(e) => setActiveCase({ ...c, approved_claim_amount: Number(e.target.value) })} onBlur={(e) => updateCase({ approved_claim_amount: Number(e.target.value) })} /></div>
                  <div>
                    <Label>Claim Status</Label>
                    <Select value={c.claim_status || ""} onValueChange={(v) => updateCase({ claim_status: v })}>
                      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        {["pending", "submitted", "approved", "partial", "rejected"].map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Documents Sent to Insurance</Label>
                  <div className="flex flex-wrap gap-2">
                    {INSURANCE_DOCS.map((d) => {
                      const checked = docsSent.includes(d);
                      return (
                        <Button key={d} type="button" variant={checked ? "default" : "outline"} size="sm" onClick={() => {
                          const next = checked ? docsSent.filter((x) => x !== d) : [...docsSent, d];
                          updateCase({ documents_sent: next });
                        }}>{checked ? "✓ " : ""}{d}</Button>
                      );
                    })}
                  </div>
                </div>
                <SaveCancelBar />
              </CardContent></Card></fieldset>
            </TabsContent>
          )}

          <TabsContent value="documents">
            <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0"><Card><CardContent className="pt-6 space-y-4">
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 border">
                <strong>Note:</strong> Accepted file types — PDF, JPG, PNG. Max file size — 5 MB. Recommended image quality — at least 800×600 px (clear, readable scan).
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {["PAN Card", "Aadhar Card", "Bank Statement", "Salary Slip", "Insurance Form", "Claim Form", "Other"].map((dt) => (
                  <div key={dt} className="border rounded-lg p-3 flex items-center justify-between">
                    <div className="text-sm font-medium">{dt}</div>
                    <Label className="cursor-pointer">
                      <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(dt, f); e.currentTarget.value = ""; }} />
                      <span className="inline-flex items-center gap-1 text-sm text-primary"><Upload size={14} />Upload</span>
                    </Label>
                  </div>
                ))}
              </div>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {docs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No documents yet</TableCell></TableRow>}
                    {docs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.doc_type}</TableCell>
                        <TableCell><a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><FileText size={14} />{d.file_name}</a></TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-100 text-emerald-700">Uploaded</Badge>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(d.uploaded_at).toLocaleString()}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => window.open(d.file_url, "_blank")} title="View"><Eye size={14} /></Button>
                          <Label className="inline-flex">
                            <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              await supabase.from("emi_insurance_documents" as any).delete().eq("id", d.id);
                              await uploadDoc(d.doc_type, f);
                              e.currentTarget.value = "";
                            }} />
                            <Button size="icon" variant="ghost" asChild title="Reupload"><span><RefreshCw size={14} /></span></Button>
                          </Label>
                          <Label className="inline-flex">
                            <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              await supabase.from("emi_insurance_documents" as any).delete().eq("id", d.id);
                              await uploadDoc(d.doc_type, f);
                              e.currentTarget.value = "";
                            }} />
                            <Button size="icon" variant="ghost" asChild title="Edit"><span><Pencil size={14} /></span></Button>
                          </Label>
                          <Button size="icon" variant="ghost" onClick={() => deleteDoc(d.id)} title="Delete"><Trash2 size={14} className="text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <SaveCancelBar />
            </CardContent></Card></fieldset>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // -------- LIST / DASHBOARD --------
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard size={22} /> EMI & Insurance</h1>
          <p className="text-sm text-muted-foreground">Patient financing & insurance claims</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AdvancedDateRangeFilter
            preset={dateFilter.preset}
            onPresetChange={dateFilter.setPreset}
            customFrom={dateFilter.customFrom}
            customTo={dateFilter.customTo}
            onCustomFromChange={dateFilter.setCustomFrom}
            onCustomToChange={dateFilter.setCustomTo}
            hideAll={false}
            showYear
            hideYesterday
          />
          <NewCaseButton patients={patients} onCreate={createCase} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Stat label="Total Cases" value={String(stats.total)} icon={<TrendingUp size={16} />} />
        <Stat label="Eligible / Approved" value={String(stats.eligible)} icon={<CheckCircle2 size={16} className="text-emerald-600" />} />
        <Stat label="Pending" value={String(stats.pending)} icon={<Clock size={16} className="text-amber-600" />} />
        <Stat label="Rejected / Cancelled" value={String(stats.rejected)} icon={<XCircle size={16} className="text-red-600" />} />
        <Stat label="Approved ₹" value={`₹${stats.approvedAmount.toLocaleString("en-IN")}`} icon={<IndianRupee size={16} />} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="emi">EMI</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Patient ID</TableHead>
            <TableHead>Patient Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Lender / Insurer</TableHead>
            <TableHead>Treatment</TableHead>
            <TableHead>Treatment Cost</TableHead>
            <TableHead>Approved</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No cases yet</TableCell></TableRow>}
            {pageRows.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/50">
                <TableCell className="font-mono cursor-pointer" onClick={() => openCase(c, "view")}>{c.case_code}</TableCell>
                <TableCell>
                  <button
                    className="text-primary underline font-mono text-xs inline-flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); navigate(`/clinic-workflow?patient=${c.patient_id}`); }}
                    title="Open in Clinic Workflow"
                  >
                    {formatPatientCode(c.patient?.patient_code) !== "—" ? formatPatientCode(c.patient?.patient_code) : c.patient_id.slice(0, 8)}
                    <ExternalLink size={11} />
                  </button>
                </TableCell>
                <TableCell className="cursor-pointer" onClick={() => openCase(c, "view")}>{c.patient ? getPatientName(c.patient) : "Unknown Patient"}</TableCell>
                <TableCell><Badge variant="outline">{c.case_type}</Badge></TableCell>
                <TableCell>{c.lender_name || c.insurance_company || "—"}</TableCell>
                <TableCell className="max-w-[180px] truncate" title={c.treatment_name || ""}>
                  {c.treatment_name ? (
                    <span className="inline-flex items-center gap-1"><Stethoscope size={12} className="text-muted-foreground" />{c.treatment_name}</span>
                  ) : "—"}
                </TableCell>
                <TableCell>₹{Number(c.treatment_cost || 0).toLocaleString("en-IN")}</TableCell>
                <TableCell>₹{Number(c.approved_amount || c.approved_claim_amount || 0).toLocaleString("en-IN")}</TableCell>
                <TableCell><Badge className={STATUS_COLORS[c.status] || ""}>{c.status}</Badge></TableCell>
                <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openCase(c, "view"); }} title="View (read-only)"><Eye size={14} /></Button>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openCase(c, "edit"); }} title={isStatusLocked(c.status) ? `Locked (${c.status}) — opens read-only` : "Edit"} disabled={isStatusLocked(c.status)}><Pencil size={14} className={isStatusLocked(c.status) ? "opacity-40" : ""} /></Button>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteCaseById(c.id, c.case_code); }} title="Delete"><Trash2 size={14} className="text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-2 p-3 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="ml-2">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={14} /></Button>
              <span className="text-sm px-2">Page {page} of {totalPages}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={14} /></Button>
              <Button size="sm" variant="outline" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>Last</Button>
            </div>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </CardContent></Card>
  );
}

function NewCaseButton({ patients, onCreate }: { patients: Patient[]; onCreate: (pid: string, type: "emi" | "insurance") => void }) {
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [type, setType] = useState<"emi" | "insurance">("emi");
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const normalizedQuery = normalizePhone(q);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);

      const digits = normalizePhone(term);
      const selectFields = "id, first_name, last_name, phone, patient_code";
      const tokens = term.split(/\s+/).map((token) => token.trim()).filter(Boolean).slice(0, 3);
      const requests: PromiseLike<{ data: Patient[] | null }>[] = [];

      tokens.forEach((token) => {
        requests.push(supabase.from("patients").select(selectFields).ilike("first_name", `%${token}%`).limit(10));
        requests.push(supabase.from("patients").select(selectFields).ilike("last_name", `%${token}%`).limit(10));
      });

      if (digits) {
        requests.push(supabase.from("patients").select(selectFields).ilike("phone", `%${digits}%`).limit(20));
      }

      if (/^\d+$/.test(term)) {
        requests.push(supabase.from("patients").select(selectFields).eq("patient_code", Number(term)).limit(10));
      }

      const responses = requests.length ? await Promise.all(requests) : [];
      if (cancelled) return;

      const merged = dedupePatients(responses.flatMap((response) => response.data || []));
      setSearchResults(merged);
      setSearchLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sourcePatients = q.trim() ? dedupePatients([...searchResults, ...patients]) : patients;
    if (!s) return patients.slice(0, 30);
    const matches = sourcePatients.filter((p) => {
      const patientName = getPatientName(p).toLowerCase();
      const phone = normalizePhone(p.phone);
      const patientCode = String(p.patient_code ?? "").toLowerCase();
      return patientName.includes(s) || phone.includes(normalizedQuery) || patientCode.includes(s) || p.id.toLowerCase().includes(s);
    });

    return matches
      .sort((a, b) => {
        const aPhone = normalizePhone(a.phone);
        const bPhone = normalizePhone(b.phone);
        const aExact = normalizedQuery.length >= 10 && aPhone === normalizedQuery;
        const bExact = normalizedQuery.length >= 10 && bPhone === normalizedQuery;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return getPatientName(a).localeCompare(getPatientName(b));
      })
      .slice(0, 30);
  }, [normalizedQuery, patients, q, searchResults]);

  useEffect(() => {
    if (!q.trim()) {
      setPid("");
      return;
    }

    if (filtered.length === 1) {
      setPid(filtered[0].id);
      return;
    }

    if (!filtered.some((patient) => patient.id === pid)) {
      setPid("");
    }
  }, [filtered, pid, q]);
  if (!open) return <Button onClick={() => setOpen(true)}><Plus size={16} className="mr-1" />New Case</Button>;
  return (
    <Card className="w-full md:w-[420px]"><CardContent className="pt-4 space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={type === "emi" ? "default" : "outline"} onClick={() => setType("emi")}>EMI</Button>
        <Button size="sm" variant={type === "insurance" ? "default" : "outline"} onClick={() => setType("insurance")}>Insurance</Button>
      </div>
      <PatientAutocomplete
        q={q}
        setQ={setQ}
        pid={pid}
        setPid={setPid}
        filtered={filtered}
        loading={searchLoading}
      />
      <div className="flex gap-2">
        <Button onClick={() => { if (pid) { onCreate(pid, type); setOpen(false); setPid(""); setQ(""); setSearchResults([]); } }} disabled={!pid}>Create</Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setPid(""); setQ(""); setSearchResults([]); }}>Cancel</Button>
      </div>
    </CardContent></Card>
  );
}

function PatientAutocomplete({
  q, setQ, pid, setPid, filtered, loading,
}: {
  q: string;
  setQ: (v: string) => void;
  pid: string;
  setPid: (v: string) => void;
  filtered: Patient[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = filtered.find((p) => p.id === pid);
  const displayValue = selected && !open
    ? `${getPatientName(selected)}${selected.patient_code ? ` • ${formatPatientCode(selected.patient_code)}` : ""}${selected.phone ? ` • ${selected.phone}` : ""}`
    : q;

  return (
    <div className="relative">
      <Input
        placeholder="Search by name, patient ID or mobile number"
        value={displayValue}
        onChange={(e) => {
          setQ(e.target.value);
          if (pid) setPid("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && q.trim() && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No patients found.</div>
          )}
          {!loading && filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                setPid(p.id);
                setQ("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <div className="font-medium">{getPatientName(p)}</div>
              <div className="text-xs text-muted-foreground">
                {p.patient_code ? formatPatientCode(p.patient_code) : p.id.slice(0, 8)}
                {p.phone ? ` • ${p.phone}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
