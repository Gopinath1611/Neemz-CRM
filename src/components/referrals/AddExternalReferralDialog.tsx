import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useClinicMasters } from "@/hooks/useClinicMasters";

type Category = "scan_center" | "blood_test";

const CATEGORY_LABEL: Record<string, string> = {
  scan_center: "Scan Center",
  blood_test: "Blood Test",
};

interface PatientOption {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  patient_code: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
  onViewExisting: (order: any) => void;
}

const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

const dayBounds = (isoDate: string) => {
  const from = new Date(`${isoDate}T00:00:00`);
  const to = new Date(`${isoDate}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
};

// Referral date is stored on created_at (existing schema). Keep clock time so
// same-day ordering stays natural.
const referralTimestamp = (isoDate: string) => {
  const now = new Date();
  const d = new Date(`${isoDate}T00:00:00`);
  if (isoDate === todayISO()) return now.toISOString();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

const patientLabel = (p: PatientOption) =>
  `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed";

export default function AddExternalReferralDialog({ open, onOpenChange, onCreated, onViewExisting }: Props) {
  const { doctorOptions } = useClinicMasters();

  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [patient, setPatient] = useState<PatientOption | null>(null);

  const [category, setCategory] = useState<Category>("scan_center");
  const [partner, setPartner] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const [doctor, setDoctor] = useState("");
  const [referralDate, setReferralDate] = useState(todayISO());
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");

  const [scanCenters, setScanCenters] = useState<{ id: string; name: string }[]>([]);
  const [bloodLabs, setBloodLabs] = useState<{ id: string; name: string }[]>([]);
  const [scanTests, setScanTests] = useState<{ id: string; name: string }[]>([]);
  const [bloodTests, setBloodTests] = useState<{ id: string; name: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [duplicates, setDuplicates] = useState<any[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setPatient(null);
    setPatientQuery("");
    setCategory("scan_center");
    setPartner("");
    setTests([]);
    setDoctor("");
    setReferralDate(todayISO());
    setCommission("");
    setNotes("");
    setErrors({});
    setDuplicates(null);
  };

  useEffect(() => {
    if (!open) return;
    reset();
    (async () => {
      const [scRes, blRes, stRes, btRes] = await Promise.all([
        supabase.from("scan_centers").select("id, name").eq("is_active", true).order("name"),
        supabase.from("blood_labs").select("id, name").eq("is_active", true).order("name"),
        supabase.from("scan_tests").select("id, name").eq("is_active", true).order("name"),
        supabase.from("blood_tests").select("id, name").eq("is_active", true).order("name"),
      ]);
      setScanCenters((scRes.data ?? []) as any);
      setBloodLabs((blRes.data ?? []) as any);
      setScanTests((stRes.data ?? []) as any);
      setBloodTests((btRes.data ?? []) as any);
    })();
  }, [open]);

  // Debounced patient search against the existing Patient Database.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setPatientLoading(true);
      let query = supabase
        .from("patients")
        .select("id, first_name, last_name, phone, patient_code")
        .order("created_at", { ascending: false })
        .limit(30);
      const q = patientQuery.trim();
      if (q) {
        const filters = [
          `first_name.ilike.%${q}%`,
          `last_name.ilike.%${q}%`,
          `phone.ilike.%${q}%`,
        ];
        // patient_code is numeric — only match it for numeric queries
        if (/^\d+$/.test(q)) filters.push(`patient_code.eq.${q}`);
        query = query.or(filters.join(","));
      }
      const { data } = await query;
      if (!cancelled) {
        setPatients((data ?? []) as any);
        setPatientLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [patientQuery, open]);

  const availableTests = useMemo(() => {
    const raw = category === "blood_test" ? bloodTests : scanTests;
    const seen = new Set<string>();
    return raw.filter((t) => {
      const key = (t.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [category, scanTests, bloodTests]);

  const partnerList = category === "blood_test" ? bloodLabs : scanCenters;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!patient) e.patient = "Select a patient from the Patient Database.";
    if (!category) e.category = "Category is required.";
    if (!partner) e.partner = "Partner is required.";
    if (tests.length === 0) e.tests = "Select at least one test.";
    if (!referralDate) e.date = "Referral date is required.";
    const amount = Number(commission);
    if (commission.trim() === "" || !Number.isFinite(amount)) e.commission = "Enter a valid amount.";
    else if (amount < 0) e.commission = "Amount cannot be negative.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const findDuplicates = async () => {
    if (!patient) return [];
    const { from, to } = dayBounds(referralDate);
    const partnerColumn = category === "blood_test" ? "blood_lab" : "scan_center";
    const { data, error } = await supabase
      .from("diagnostic_orders")
      .select("*")
      .eq("patient_id", patient.id)
      .eq("category", category)
      .eq(partnerColumn, partner)
      .gte("created_at", from)
      .lte("created_at", to);
    if (error) throw error;
    const wanted = new Set(tests.map((t) => t.trim().toLowerCase()));
    return (data ?? []).filter((row: any) => {
      const rowTests = Array.isArray(row.tests) ? row.tests : [];
      return rowTests.some((t: any) => wanted.has(String(t).trim().toLowerCase()));
    });
  };

  const insertReferral = async () => {
    if (!patient) return;
    const payload = {
      patient_id: patient.id,
      category,
      scan_center: category === "scan_center" ? partner : null,
      blood_lab: category === "blood_test" ? partner : null,
      tests,
      doctor: doctor || null,
      notes: notes.trim() || null,
      cost: Number(commission),
      status: "ordered",
      source: "manual",
      created_at: referralTimestamp(referralDate),
    };
    const { error } = await supabase.from("diagnostic_orders").insert(payload as any);
    if (error) throw error;
  };

  const handleSave = async (force = false) => {
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (!force) {
        const dupes = await findDuplicates();
        if (dupes.length > 0) {
          setDuplicates(dupes);
          return;
        }
      } else {
        // Re-check right before insert so nothing was created in the meantime
        // without the user knowing; user already confirmed, so we only log.
        await findDuplicates().catch(() => []);
      }
      await insertReferral();
      toast({ title: "Referral added", description: "Manual external referral created." });
      setDuplicates(null);
      onOpenChange(false);
      await onCreated();
    } catch (err: any) {
      toast({
        title: "Could not create referral",
        description: err?.message || "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleViewExisting = (row: any) => {
    setDuplicates(null);
    onOpenChange(false);
    onViewExisting(row);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add External Referral</DialogTitle>
            <DialogDescription>
              Manually record a referral to an existing Scan Center or Blood Lab partner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Patient */}
            <div className="space-y-1.5">
              <Label className="text-xs">Patient *</Label>
              <Popover open={patientOpen} onOpenChange={setPatientOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className={patient ? "" : "text-muted-foreground"}>
                      {patient
                        ? `${patientLabel(patient)}${patient.patient_code ? ` · ${patient.patient_code}` : ""}`
                        : "Search existing patient..."}
                    </span>
                    <ChevronsUpDown size={14} className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(32rem,90vw)] p-0" align="start">
                  <div className="relative border-b">
                    <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                      placeholder="Name, phone or patient code..."
                      className="border-0 pl-8 focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {patientLoading && (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Searching...
                      </div>
                    )}
                    {!patientLoading && patients.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No patients found.</div>
                    )}
                    {patients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPatient(p);
                          setPatientOpen(false);
                          setErrors((e) => ({ ...e, patient: "" }));
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <Check size={14} className={patient?.id === p.id ? "opacity-100" : "opacity-0"} />
                        <span className="flex-1 min-w-0">
                          <span className="font-medium">{patientLabel(p)}</span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {[p.patient_code, p.phone].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {errors.patient && <p className="text-xs text-destructive">{errors.patient}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs">Category *</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v as Category);
                    setPartner("");
                    setTests([]);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scan_center">Scan Center</SelectItem>
                    <SelectItem value="blood_test">Blood Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Partner */}
              <div className="space-y-1.5">
                <Label className="text-xs">{category === "blood_test" ? "Blood Lab" : "Scan Center"} *</Label>
                <Select value={partner} onValueChange={(v) => { setPartner(v); setErrors((e) => ({ ...e, partner: "" })); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={partnerList.length ? "Select partner" : "Add partners in Settings"} />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerList.map((p) => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.partner && <p className="text-xs text-destructive">{errors.partner}</p>}
              </div>

              {/* Doctor */}
              <div className="space-y-1.5">
                <Label className="text-xs">Doctor</Label>
                <Select value={doctor} onValueChange={setDoctor}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctorOptions.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Referral date */}
              <div className="space-y-1.5">
                <Label className="text-xs">Referral Date *</Label>
                <Input
                  type="date"
                  value={referralDate}
                  onChange={(e) => { setReferralDate(e.target.value); setErrors((x) => ({ ...x, date: "" })); }}
                />
                {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
              </div>

              {/* Commission */}
              <div className="space-y-1.5">
                <Label className="text-xs">Commission Amount (₹) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={commission}
                  onChange={(e) => { setCommission(e.target.value); setErrors((x) => ({ ...x, commission: "" })); }}
                  placeholder="0"
                />
                {errors.commission && <p className="text-xs text-destructive">{errors.commission}</p>}
              </div>
            </div>

            {/* Tests */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tests *</Label>
              {availableTests.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tests available. Add them in Clinic Settings.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto rounded-md border p-2 bg-muted/20">
                  {availableTests.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={tests.includes(t.name)}
                        onCheckedChange={() => {
                          setTests((prev) =>
                            prev.includes(t.name) ? prev.filter((x) => x !== t.name) : [...prev, t.name]
                          );
                          setErrors((e) => ({ ...e, tests: "" }));
                        }}
                      />
                      <span className="truncate" title={t.name}>{t.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.tests && <p className="text-xs text-destructive">{errors.tests}</p>}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => handleSave(false)} disabled={submitting}>
              {submitting && <Loader2 size={14} className="mr-1 animate-spin" />}
              {submitting ? "Saving..." : "Add Referral"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate warning */}
      <Dialog open={!!duplicates} onOpenChange={(o) => { if (!o && !submitting) setDuplicates(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle size={18} /> Possible Duplicate Referral
            </DialogTitle>
            <DialogDescription>
              This patient already has an external referral for the same partner and test on the selected date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {(duplicates ?? []).map((row) => (
              <div key={row.id} className="rounded-md border p-3 text-sm space-y-1.5">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div><span className="text-xs text-muted-foreground">Patient</span><div>{patient ? patientLabel(patient) : "-"}</div></div>
                  <div><span className="text-xs text-muted-foreground">Category</span><div>{CATEGORY_LABEL[row.category] || row.category}</div></div>
                  <div><span className="text-xs text-muted-foreground">Partner</span><div>{row.scan_center || row.blood_lab || "-"}</div></div>
                  <div><span className="text-xs text-muted-foreground">Doctor</span><div>{row.doctor || "-"}</div></div>
                  <div><span className="text-xs text-muted-foreground">Referral Date</span><div>{new Date(row.created_at).toLocaleDateString()}</div></div>
                  <div><span className="text-xs text-muted-foreground">Commission</span><div>₹{Number(row.cost || 0).toLocaleString()}</div></div>
                  <div><span className="text-xs text-muted-foreground">Status</span><div><Badge variant="secondary">{row.status || "ordered"}</Badge></div></div>
                  <div><span className="text-xs text-muted-foreground">Source</span><div><Badge variant="outline">{row.source === "manual" ? "Manual" : "Workflow"}</Badge></div></div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Tests</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(Array.isArray(row.tests) ? row.tests : []).map((t: string) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleViewExisting(row)}>View Existing</Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicates(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => handleSave(true)} disabled={submitting}>
              {submitting && <Loader2 size={14} className="mr-1 animate-spin" />}
              Create Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
