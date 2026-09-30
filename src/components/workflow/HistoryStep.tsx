import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Calendar, IndianRupee, Clock, Stethoscope, AlertCircle, FlaskConical, Pill, Activity, Camera, ImageIcon, Play } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import BillingDetailDialog from "./BillingDetailDialog";
import FindingsTimeline from "./FindingsTimeline";

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  patient_code?: number | null;
}

interface HistoryStepProps {
  renderQuickPatientSearch: () => JSX.Element;
  selectedPatient: Patient | null;
}

interface VisitRecord {
  id: string;
  checkin_time: string;
  checkout_time: string | null;
  status: string;
  doctor?: string;
}

interface TreatmentRecord {
  id: string;
  treatment_type: string;
  status: string;
  estimated_cost: number | null;
  created_at: string;
  tooth_number: number | null;
  doctor?: string;
  plan_id?: string;
}

interface BillingRecord {
  id: string;
  total_amount: number;
  amount_paid: number | null;
  payment_status: string;
  created_at: string;
  payment_method: string | null;
  invoice_number: string | null;
  discount_amount: number | null;
  discount_percent: number | null;
  subtotal: number;
  tax_amount: number | null;
  notes: string | null;
  patient_id: string;
  checkin_id: string | null;
  plan_id: string | null;
}

interface LabOrderRecord {
  id: string;
  lab_name: string;
  work_type: string;
  material: string | null;
  shade: string | null;
  tooth_number: string | null;
  rate: number | null;
  status: string;
  sent_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  created_at: string;
}

interface PrescriptionRecord {
  id: string;
  checkin_id: string | null;
  doctor: string | null;
  diagnosis: string | null;
  notes: string | null;
  created_at: string;
  items: Array<{
    id: string;
    medicine_name: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
  }>;
}

interface VitalsRecord {
  id: string;
  checkin_id: string | null;
  recorded_at: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  temperature: number | null;
  weight: number | null;
  height: number | null;
  spo2: number | null;
  blood_sugar: number | null;
  notes: string | null;
}

const dedupeLatestByKey = <T,>(records: T[], getKey: (record: T) => string) => {
  const latestByKey = new Map<string, T>();
  records.forEach((record) => {
    const key = getKey(record);
    if (!latestByKey.has(key)) latestByKey.set(key, record);
  });
  return Array.from(latestByKey.values());
};

const normalizePaymentMethod = (method: string | null | undefined) =>
  String(method || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");

const getPaymentDedupeKey = (txn: any) => {
  const paidAt = txn.payment_date ? new Date(txn.payment_date) : null;
  const paidMinute = paidAt && !Number.isNaN(paidAt.getTime())
    ? paidAt.toISOString().slice(0, 16)
    : "no-date";
  const amountInPaise = Math.round(Number(txn.amount || 0) * 100);

  return [
    txn.billing_id || "no-bill",
    paidMinute,
    amountInPaise,
    normalizePaymentMethod(txn.payment_method),
    String(txn.notes || "").trim().toLowerCase(),
  ].join("|");
};

const dedupePaymentTransactions = (transactions: any[]) => {
  const uniqueTxns = new Map<string, any>();

  transactions.forEach((txn) => {
    const key = getPaymentDedupeKey(txn);
    const existing = uniqueTxns.get(key);
    const txnTime = txn.created_at ? new Date(txn.created_at).getTime() : new Date(txn.payment_date || 0).getTime();
    const existingTime = existing?.created_at ? new Date(existing.created_at).getTime() : new Date(existing?.payment_date || 0).getTime();

    if (!existing || txnTime < existingTime) {
      uniqueTxns.set(key, txn);
    }
  });

  return Array.from(uniqueTxns.values()).sort((a, b) => {
    const paidDiff = new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime();
    if (paidDiff !== 0) return paidDiff;
    return String(b.id).localeCompare(String(a.id));
  });
};

interface FindingRecord {
  id: string;
  chart_id: string;
  tooth_number: number | null;
  condition: string | null;
  treatment_needed: string | null;
  surface: string | null;
  notes: string | null;
  visit_date: string;
}

interface PhotoRecord {
  id: string;
  checkin_id: string | null;
  file_path: string;
  file_name: string | null;
  photo_type: string;
  tooth_number: number | null;
  notes: string | null;
  created_at: string;
}

interface DiagnosticRecord {
  id: string;
  test_type: string;
  test_name: string | null;
  lab_name: string | null;
  status: string;
  cost: number | null;
  ordered_date: string | null;
  result_date: string | null;
  report_url: string | null;
  notes: string | null;
  created_at: string;
}

const HistoryStep = ({ renderQuickPatientSearch, selectedPatient }: HistoryStepProps) => {
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [vitalsList, setVitalsList] = useState<VitalsRecord[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [consultNotesByDate, setConsultNotesByDate] = useState<Record<string, string>>({});
  const [consultNoteEntries, setConsultNoteEntries] = useState<{ id: string; date: string; notes: string; doctor?: string }[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticRecord[]>([]);
  const [paymentTxns, setPaymentTxns] = useState<any[]>([]);
  const [photoPreview, setPhotoPreview] = useState<PhotoRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<BillingRecord | null>(null);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionRecord | null>(null);
  const [prescriptionDialogOpen, setPrescriptionDialogOpen] = useState(false);
  const [dateViewOpen, setDateViewOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [vitalsDetailOpen, setVitalsDetailOpen] = useState(false);
  const [selectedVitals, setSelectedVitals] = useState<VitalsRecord | null>(null);
  const [findingsDateView, setFindingsDateView] = useState<string | null>(null);
  const [treatmentsDateView, setTreatmentsDateView] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [dateGallery, setDateGallery] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPatient) {
      setVisits([]);
      setTreatments([]);
      setBillings([]);
      setLabOrders([]);
      setPrescriptions([]);
      setVitalsList([]);
      setFindings([]);
      setPhotos([]);
      setDiagnostics([]);
      return;
    }
    fetchHistory(selectedPatient.id);
  }, [selectedPatient]);

  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const getPhotoUrl = (filePath: string) => photoUrls[filePath] || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paths = (photos as any[]).map((p) => p.file_path).filter(Boolean);
      if (paths.length === 0) { setPhotoUrls({}); return; }
      const entries = await Promise.all(
        paths.map(async (path: string) => {
          const { data } = await supabase.storage.from("clinical-photos").createSignedUrl(path, 60 * 60 * 24);
          return [path, data?.signedUrl || ""] as const;
        })
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      entries.forEach(([k, v]) => { if (v) map[k] = v; });
      setPhotoUrls(map);
    })();
    return () => { cancelled = true; };
  }, [photos]);

  const fetchHistory = async (patientId: string) => {
    setLoading(true);

    // Fetch treatment plans first (has doctor + checkin_id)
    const plansRes = await supabase
      .from("treatment_plans")
      .select("id, doctor, checkin_id")
      .eq("patient_id", patientId);
    const plans = plansRes.data || [];

    // Map checkin_id → doctor
    const checkinDoctorMap: Record<string, string> = {};
    plans.forEach((p) => {
      if (p.checkin_id && p.doctor) checkinDoctorMap[p.checkin_id] = p.doctor;
    });

    // Map plan_id → doctor
    const planDoctorMap: Record<string, string> = {};
    plans.forEach((p) => {
      if (p.doctor) planDoctorMap[p.id] = p.doctor;
    });

    const planCheckinMap: Record<string, string> = {};
    plans.forEach((p) => {
      if (p.checkin_id) planCheckinMap[p.id] = p.checkin_id;
    });

    const planIds = plans.map((p) => p.id);

    // Also fetch appointments for doctor info on visits without treatment plans
    const [visitsRes, treatmentsRes, billingsRes, appointmentsRes, labOrdersRes, prescriptionsRes] = await Promise.all([
      supabase
        .from("patient_checkins")
        .select("id, checkin_time, checkout_time, status")
        .eq("patient_id", patientId)
        .order("checkin_time", { ascending: false }),
      planIds.length > 0
        ? supabase
            .from("treatment_plan_items")
            .select("id, treatment_type, status, estimated_cost, created_at, tooth_number, plan_id")
            .in("plan_id", planIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("billings")
        .select("id, total_amount, amount_paid, payment_status, created_at, payment_method, invoice_number, discount_amount, discount_percent, subtotal, tax_amount, notes, patient_id, checkin_id, plan_id")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("appointment_date, doctor")
        .eq("patient_id", patientId),
      supabase
        .from("lab_orders")
        .select("id, lab_name, work_type, material, shade, tooth_number, rate, status, sent_date, expected_delivery_date, actual_delivery_date, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("prescriptions")
        .select("id, checkin_id, doctor, diagnosis, notes, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
    ]);

    // Fetch prescription items for the loaded prescriptions
    const prescriptionList = dedupeLatestByKey(
      ((prescriptionsRes.data as any[]) || []) as PrescriptionRecord[],
      (p) => p.checkin_id || p.id,
    );
    const prescriptionIds = prescriptionList.map((p) => p.id);
    let itemsByPrescription: Record<string, any[]> = {};
    if (prescriptionIds.length > 0) {
      const itemsRes = await supabase
        .from("prescription_items")
        .select("id, prescription_id, medicine_name, dosage, frequency, duration, instructions")
        .in("prescription_id", prescriptionIds);
      (itemsRes.data || []).forEach((it: any) => {
        if (!itemsByPrescription[it.prescription_id]) itemsByPrescription[it.prescription_id] = [];
        itemsByPrescription[it.prescription_id].push(it);
      });
    }
    const enrichedPrescriptions: PrescriptionRecord[] = prescriptionList.map((p) => ({
      ...p,
      items: itemsByPrescription[p.id] || [],
    }));

    // Build date → doctor map from appointments. The appointment-level doctor
    // reflects who actually saw the patient that day (selected at booking /
    // check-in), and is the source of truth for History. Completed /
    // checked-in appointments take priority over generic bookings on same date.
    const dateDoctorMap: Record<string, string> = {};
    const appointmentRows = (appointmentsRes.data || []) as any[];
    appointmentRows.forEach((a) => {
      if (a.doctor) dateDoctorMap[a.appointment_date] = a.doctor;
    });
    appointmentRows.forEach((a) => {
      if (a.doctor && ["completed", "checked_in", "in_progress"].includes(a.status)) {
        dateDoctorMap[a.appointment_date] = a.doctor;
      }
    });

    // Enrich visits with doctor — prefer the appointment doctor for that day
    // (who actually saw the patient), fall back to the treatment plan doctor.
    const enrichedVisits = ((visitsRes.data as VisitRecord[]) || []).map((v) => {
      const visitDate = format(new Date(v.checkin_time), "yyyy-MM-dd");
      return {
        ...v,
        doctor: dateDoctorMap[visitDate] || checkinDoctorMap[v.id] || undefined,
      };
    });

    // Map checkin_id → visit date so treatments can resolve the appointment doctor.
    const checkinDateMap: Record<string, string> = {};
    ((visitsRes.data as VisitRecord[]) || []).forEach((v) => {
      checkinDateMap[v.id] = format(new Date(v.checkin_time), "yyyy-MM-dd");
    });

    // Enrich + dedupe treatments so repeated save/update on the same visit plan
    // does not show duplicate history rows.
    // Exclude "upcoming" rows from the procedures list — those represent planned
    // future treatments, not historical procedures. They surface separately only
    // when an appointment was actually booked for them.
    const treatmentRows = ((treatmentsRes.data as any[]) || [])
      .filter((t) => t.status !== "upcoming")
      .map((t) => {
        const checkinId = planCheckinMap[t.plan_id];
        const visitDate = checkinId ? checkinDateMap[checkinId] : undefined;
        const appointmentDoctor = visitDate ? dateDoctorMap[visitDate] : undefined;
        return {
          ...t,
          doctor: appointmentDoctor || planDoctorMap[t.plan_id] || undefined,
        };
      });

    const latestTreatmentByKey = new Map<string, TreatmentRecord>();
    treatmentRows.forEach((t) => {
      const dedupeKey = [
        planCheckinMap[t.plan_id] || t.plan_id || "no-plan",
        t.treatment_type || "",
        t.tooth_number ?? "no-tooth",
      ].join("::");

      if (!latestTreatmentByKey.has(dedupeKey)) {
        latestTreatmentByKey.set(dedupeKey, t);
      }
    });

    const enrichedTreatments = Array.from(latestTreatmentByKey.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setVisits(enrichedVisits);
    setTreatments(enrichedTreatments);
    setBillings((billingsRes.data as BillingRecord[]) || []);

    // Fetch individual payment transactions (each partial/full payment with its own date)
    const { data: payTxns } = await supabase
      .from("billing_payments")
      .select("id, billing_id, payment_date, amount, payment_method, notes, created_at")
      .eq("patient_id", patientId)
      .order("payment_date", { ascending: false });
    setPaymentTxns(dedupePaymentTransactions(payTxns || []));
    setLabOrders((labOrdersRes.data as LabOrderRecord[]) || []);
    setPrescriptions(enrichedPrescriptions);

    // Fetch vitals, dental chart findings, clinical photos and diagnostics
    const checkinIds = enrichedVisits.map((v) => v.id);
    const [vitalsRes, chartsRes, photosRes, diagRes] = await Promise.all([
      checkinIds.length > 0
        ? supabase
            .from("patient_vitals")
            .select("id, checkin_id, recorded_at, blood_pressure_systolic, blood_pressure_diastolic, pulse_rate, temperature, weight, height, spo2, blood_sugar, notes")
            .in("checkin_id", checkinIds)
            .order("recorded_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("dental_charts")
        .select("id, checkin_id, created_at, notes")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("clinical_photos")
        .select("id, checkin_id, file_path, file_name, photo_type, tooth_number, notes, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("diagnostic_orders" as any)
        .select("id, test_type, test_name, lab_name, status, cost, ordered_date, result_date, report_url, notes, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
    ]);

    setVitalsList(
      dedupeLatestByKey((((vitalsRes.data as any[]) || []) as VitalsRecord[]), (v) => v.checkin_id || v.id)
    );
    setPhotos(((photosRes.data as any[]) || []) as PhotoRecord[]);
    setDiagnostics(((diagRes.data as any[]) || []) as DiagnosticRecord[]);

    const charts = (chartsRes.data as any[]) || [];
    const chartIds = charts.map((c) => c.id);
    const chartDateMap: Record<string, string> = {};
    const notesByDate: Record<string, string> = {};
    charts.forEach((c) => {
      chartDateMap[c.id] = c.created_at;
      if (c.created_at) {
        const d = format(new Date(c.created_at), "yyyy-MM-dd");
        const note = (c.notes || "").trim();
        if (note) {
          notesByDate[d] = notesByDate[d] ? `${notesByDate[d]}\n${note}` : note;
        } else if (!(d in notesByDate)) {
          notesByDate[d] = "";
        }
      }
    });
    setConsultNotesByDate(notesByDate);

    // Per-visit consultation notes (each visit stays its own dated entry)
    const visitDoctorMap: Record<string, string | undefined> = {};
    enrichedVisits.forEach((v) => { visitDoctorMap[v.id] = v.doctor; });

    // The consulting doctor recorded at consultation-save time is the most
    // accurate attribution for that visit's notes; fall back to the visit doctor.
    const consultDoctorByCheckin: Record<string, string> = {};
    if (checkinIds.length > 0) {
      const { data: findingDoctorRows } = await supabase
        .from("consultation_findings")
        .select("checkin_id, doctor, recorded_at")
        .eq("patient_id", patientId)
        .order("recorded_at", { ascending: false });
      ((findingDoctorRows as any[]) || []).forEach((r) => {
        if (r.checkin_id && r.doctor && !consultDoctorByCheckin[r.checkin_id]) {
          consultDoctorByCheckin[r.checkin_id] = r.doctor;
        }
      });
    }

    setConsultNoteEntries(
      charts
        .filter((c) => (c.notes || "").trim())
        .map((c) => ({
          id: c.id,
          date: c.created_at,
          notes: (c.notes || "").trim(),
          doctor: c.checkin_id
            ? consultDoctorByCheckin[c.checkin_id] || visitDoctorMap[c.checkin_id]
            : undefined,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );

    if (chartIds.length > 0) {
      const { data: entryRows } = await supabase
        .from("dental_chart_entries")
        .select("id, chart_id, tooth_number, condition, treatment_needed, surface, notes")
        .in("chart_id", chartIds);
      const enrichedFindings: FindingRecord[] = ((entryRows as any[]) || []).map((e: any) => ({
        ...e,
        visit_date: chartDateMap[e.chart_id] || "",
      }));
      const dedupedFindings = dedupeLatestByKey(enrichedFindings, (f) => `${f.chart_id}::${f.tooth_number ?? "no-tooth"}::${f.condition || ""}::${f.treatment_needed || ""}::${f.surface || ""}`);
      dedupedFindings.sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
      setFindings(dedupedFindings);
    } else {
      setFindings([]);
    }

    setLoading(false);
  };

  const totalBilled = billings.reduce((s, b) => s + (b.total_amount || 0), 0);
  const totalPaid = billings.reduce((s, b) => s + (b.amount_paid || 0), 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <History size={20} /> Patient History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {renderQuickPatientSearch()}

        {!selectedPatient && (
          <div className="text-center py-12 text-muted-foreground">
            <History size={48} className="mx-auto mb-3 opacity-40" />
            <p>Search and select a patient to view their complete history</p>
          </div>
        )}

        {selectedPatient && loading && (
          <div className="text-center py-8 text-muted-foreground">Loading history...</div>
        )}

        {selectedPatient && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <Calendar size={20} className="mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{visits.length}</p>
                <p className="text-xs text-muted-foreground">Total Visits</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <Stethoscope size={20} className="mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{treatments.length}</p>
                <p className="text-xs text-muted-foreground">Treatments</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <IndianRupee size={20} className="mx-auto mb-1 text-accent" />
                <p className="text-2xl font-bold">₹{totalPaid.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Paid</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${outstanding > 0 ? "bg-destructive/10" : "bg-secondary/50"}`}>
                <AlertCircle size={20} className={`mx-auto mb-1 ${outstanding > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                <p className={`text-2xl font-bold ${outstanding > 0 ? "text-destructive" : ""}`}>₹{outstanding.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Outstanding</p>
              </div>
            </div>



            {/* Visit History */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Clock size={16} /> Visit History</h3>
              {visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visits recorded</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Check-in Time</TableHead>
                        <TableHead>Check-out Time</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visits.map((v, i) => {
                        const inT = new Date(v.checkin_time);
                        const outT = v.checkout_time ? new Date(v.checkout_time) : null;
                        const isCheckedOut = v.status === "checked_out" && !!outT;
                        const rawDur = outT ? Math.round((outT.getTime() - inT.getTime()) / 60000) : null;
                        const durMin = rawDur !== null && rawDur > 0 ? rawDur : null;
                        const durStr = durMin !== null
                          ? (durMin >= 60 ? `${Math.floor(durMin / 60)}h ${durMin % 60}m` : `${durMin}m`)
                          : "—";
                        return (
                          <TableRow key={v.id}>
                            <TableCell className="text-xs">{visits.length - i}</TableCell>
                            <TableCell className="text-xs font-medium">{format(inT, "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-xs font-medium">{v.doctor || "—"}</TableCell>
                            <TableCell className="text-xs">{format(inT, "hh:mm a")}</TableCell>
                            <TableCell className="text-xs">{isCheckedOut ? format(outT!, "hh:mm a") : "—"}</TableCell>
                            <TableCell className="text-xs">{isCheckedOut ? durStr : "—"}</TableCell>
                            <TableCell>
                              <Badge variant={isCheckedOut ? "secondary" : "default"} className="text-[10px] capitalize">
                                {isCheckedOut ? "Checked Out" : "Checked In"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Treatment Procedure History (date-wise list) */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Stethoscope size={16} /> Treatment Procedures (Date-wise)</h3>
              {treatments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No treatments recorded</p>
              ) : (() => {
                const grouped: Record<string, TreatmentRecord[]> = {};
                treatments.forEach((t) => {
                  const d = format(new Date(t.created_at), "yyyy-MM-dd");
                  (grouped[d] = grouped[d] || []).push(t);
                });
                const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
                return (
                  <div className="rounded-md border max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Doctor</TableHead>
                          <TableHead>Teeth</TableHead>
                          <TableHead>Procedures</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dates.map((d, i) => {
                          const items = grouped[d];
                          const doctors = Array.from(new Set(items.map((t) => t.doctor).filter(Boolean))).join(", ");
                          const teeth = Array.from(new Set(items.map((t) => t.tooth_number).filter((x) => x != null))).join(", ");
                          const cost = items.reduce((s, t) => s + (t.estimated_cost || 0), 0);
                          return (
                            <TableRow key={d}>
                              <TableCell className="text-xs">{dates.length - i}</TableCell>
                              <TableCell className="text-xs font-medium">{format(new Date(d), "dd MMM yyyy")}</TableCell>
                              <TableCell className="text-xs">{doctors || "—"}</TableCell>
                              <TableCell className="text-xs">{teeth || "—"}</TableCell>
                              <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px]">{items.length} procedure{items.length !== 1 ? "s" : ""}</Badge></TableCell>
                              <TableCell className="text-xs">₹{cost.toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setTreatmentsDateView(d)}>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </div>

            {/* Vitals, Chief Complaint, Past Dental & Medical History */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Activity size={16} /> Vitals, Complaint & Medical History</h3>
              {vitalsList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No records</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vitalsList.map((v) => {
                        let parsed: any = null;
                        try { parsed = v.notes ? JSON.parse(v.notes) : null; } catch {}
                        const cc = parsed?.chiefComplaints?.length ? parsed.chiefComplaints.join(", ") : "";
                        const ccFull = [cc, parsed?.otherComplaint].filter(Boolean).join(", ");
                        const mhObj = parsed?.medicalHistory && typeof parsed.medicalHistory === "object" ? parsed.medicalHistory : null;
                        const mhYes = mhObj ? Object.entries(mhObj).filter(([, v]) => v === "yes").map(([k]) => k) : (Array.isArray(parsed?.medicalHistory) ? parsed.medicalHistory : []);
                        const mh = mhYes.length ? `${mhYes.length} medical` : "";
                        const pd = parsed?.pastDentalNotes ? "dental hx" : "";
                        const bp = v.blood_pressure_systolic && v.blood_pressure_diastolic ? `BP ${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : "";
                        const summary = [ccFull || (parsed?.additionalNotes ?? ""), bp, pd, mh].filter(Boolean).join(" • ") || "—";
                        return (
                          <TableRow key={v.id}>
                            <TableCell className="text-xs font-medium whitespace-nowrap">{format(new Date(v.recorded_at), "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-xs max-w-[420px] truncate" title={summary}>{summary}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => { setSelectedVitals(v); setVitalsDetailOpen(true); }}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" /> View
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Findings Lifecycle Timeline (immutable audit log) */}
            <div>
              <FindingsTimeline patientId={selectedPatient?.id ?? null} />
            </div>

            {/* Consultation Findings History (date-wise list) */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Stethoscope size={16} /> Consultation Findings (Date-wise)</h3>
              {findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No findings recorded</p>
              ) : (() => {
                const grouped: Record<string, FindingRecord[]> = {};
                findings.forEach((f) => {
                  if (!f.visit_date) return;
                  const d = format(new Date(f.visit_date), "yyyy-MM-dd");
                  (grouped[d] = grouped[d] || []).push(f);
                });
                const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
                return (
                  <div className="rounded-md border max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Teeth</TableHead>
                          <TableHead>Findings</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dates.map((d, i) => {
                          const items = grouped[d];
                          const teethNums = Array.from(new Set(items.map((f) => f.tooth_number).filter((x) => x != null && x !== 0)));
                          const hasGeneral = items.some((f) => f.tooth_number === 0 || f.tooth_number == null);
                          const teeth = [...(hasGeneral ? ["General"] : []), ...teethNums].join(", ");
                          const note = (consultNotesByDate[d] || "").trim();
                          return (
                            <TableRow key={d}>
                              <TableCell className="text-xs">{dates.length - i}</TableCell>
                              <TableCell className="text-xs font-medium">{format(new Date(d), "dd MMM yyyy")}</TableCell>
                              <TableCell className="text-xs">{teeth || "—"}</TableCell>
                              <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px]">{items.length} finding{items.length !== 1 ? "s" : ""}</Badge></TableCell>
                              <TableCell className="text-xs max-w-[220px]" title={note || undefined}>
                                {note ? (
                                  <span className="truncate inline-block max-w-[220px] align-middle">{note}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">No Notes</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setFindingsDateView(d)}>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </div>

            {/* Consultation Notes History (per visit, most recent first) */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Stethoscope size={16} /> Consultation Notes (Visit-wise)</h3>
              {consultNoteEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No consultation notes recorded</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto divide-y">
                  {consultNoteEntries.map((n) => (
                    <div key={n.id} className="p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium">{format(new Date(n.date), "dd MMM yyyy, hh:mm a")}</span>
                        <Badge variant="secondary" className="text-[10px]">{n.doctor || "Doctor not recorded"}</Badge>
                      </div>
                      <p className="text-xs whitespace-pre-wrap text-muted-foreground">{n.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>



            {/* Clinical Photos & X-Rays History - grouped by date */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center gap-2"><Camera size={16} /> Clinical Photos & X-Rays</h3>
                {photos.length > 0 && (
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setGalleryOpen(true)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> View All ({photos.length})
                  </Button>
                )}
              </div>
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No photos uploaded</p>
              ) : (() => {
                const grouped: Record<string, PhotoRecord[]> = {};
                photos.forEach((p) => {
                  const d = format(new Date(p.created_at), "yyyy-MM-dd");
                  if (!grouped[d]) grouped[d] = [];
                  grouped[d].push(p);
                });
                const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
                return (
                  <div className="rounded-md border max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Files</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dates.map((d, i) => {
                          const items = grouped[d];
                          const types = Array.from(new Set(items.map((x) => x.photo_type)));
                          const notes = items.map((x) => x.notes).filter(Boolean).join(" • ");
                          return (
                            <TableRow key={d} className="cursor-pointer hover:bg-accent/50" onClick={() => setDateGallery(d)}>
                              <TableCell className="text-xs">{dates.length - i}</TableCell>
                              <TableCell className="text-xs font-medium">{format(new Date(d), "dd MMM yyyy")}</TableCell>
                              <TableCell className="text-xs">
                                <div className="flex flex-wrap gap-1">
                                  {types.map((t) => (
                                    <Badge key={t} variant="secondary" className="text-[10px] capitalize">{t}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{items.length} file{items.length !== 1 ? "s" : ""}</TableCell>
                              <TableCell className="text-xs truncate max-w-[220px]">{notes || "—"}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); setDateGallery(d); }}>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </div>

            {/* Diagnostics (X-Ray / Scan / Blood Test) History */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><FlaskConical size={16} /> Diagnostics History</h3>
              {diagnostics.length === 0 ? (
                <p className="text-sm text-muted-foreground">No diagnostic orders</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Test</TableHead>
                        <TableHead>Center</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Report</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diagnostics.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-xs font-medium">{format(new Date(d.ordered_date || d.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-xs capitalize">{(d.test_type || "").replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-xs">{d.test_name || "—"}</TableCell>
                          <TableCell className="text-xs">{d.lab_name || "—"}</TableCell>
                          <TableCell className="text-xs">₹{Number(d.cost || 0).toLocaleString()}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{d.status?.replace(/_/g, " ") || "—"}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {d.report_url ? (
                              <a href={d.report_url} target="_blank" rel="noreferrer" className="text-primary underline">View</a>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Lab History */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><FlaskConical size={16} /> Lab History</h3>
              {labOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lab orders recorded</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lab</TableHead>
                        <TableHead>Work Type</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Shade</TableHead>
                        <TableHead>Tooth</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labOrders.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs font-medium">{l.lab_name}</TableCell>
                          <TableCell className="text-xs capitalize">{(l.work_type || "").replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-xs">{l.material || "—"}</TableCell>
                          <TableCell className="text-xs">{l.shade || "—"}</TableCell>
                          <TableCell className="text-xs">{l.tooth_number || "—"}</TableCell>
                          <TableCell className="text-xs">₹{Number(l.rate || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{l.sent_date ? format(new Date(l.sent_date), "dd MMM yyyy") : "—"}</TableCell>
                          <TableCell className="text-xs">{l.actual_delivery_date ? format(new Date(l.actual_delivery_date), "dd MMM yyyy") : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={l.status === "delivered" ? "default" : "secondary"} className="text-[10px] capitalize">
                              {l.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Prescription / Medicine History */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Pill size={16} /> Prescription History</h3>
              {prescriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No prescriptions recorded</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Medication</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.map((p, i) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">{prescriptions.length - i}</TableCell>
                          <TableCell className="text-xs font-medium">{format(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-xs">{p.doctor || "—"}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="secondary" className="text-[10px]">
                              {p.items.length} medicine{p.items.length !== 1 ? "s" : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => { setSelectedPrescription(p); setPrescriptionDialogOpen(true); }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Billing History */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><IndianRupee size={16} /> Billing History</h3>
              {billings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No billing records</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billings.map((b, i) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => { setSelectedBilling(b); setBillingDialogOpen(true); }}
                        >
                          <TableCell className="text-xs">{billings.length - i}</TableCell>
                          <TableCell className="text-xs font-medium">{format(new Date(b.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-xs">{b.invoice_number || b.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs">₹{b.total_amount.toLocaleString()}</TableCell>
                          <TableCell className="text-xs">₹{(b.amount_paid || 0).toLocaleString()}</TableCell>
                          <TableCell className={`text-xs font-medium ${(b.total_amount - (b.amount_paid || 0)) > 0 ? "text-destructive" : ""}`}>
                            ₹{(b.total_amount - (b.amount_paid || 0)).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs capitalize">{b.payment_method || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={b.payment_status === "paid" ? "default" : "destructive"}
                              className="text-[10px] capitalize"
                            >
                              {b.payment_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Payment History — one row per actual payment transaction with its own date */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2"><IndianRupee size={16} /> Payment History</h3>
              {paymentTxns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment records</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Total Bill</TableHead>
                        <TableHead>Amount Paid</TableHead>
                        <TableHead>Balance After</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        // Compute running cumulative paid per bill in ascending order (date, id)
                        const ascOrder = [...paymentTxns].sort((a, b) => {
                          const ta = new Date(a.payment_date).getTime();
                          const tb = new Date(b.payment_date).getTime();
                          if (ta !== tb) return ta - tb;
                          return String(a.id).localeCompare(String(b.id));
                        });
                        const cumulativeByTxn = new Map<string, number>();
                        const runningByBill = new Map<string, number>();
                        ascOrder.forEach((t) => {
                          const prev = runningByBill.get(t.billing_id) || 0;
                          const next = prev + Number(t.amount || 0);
                          runningByBill.set(t.billing_id, next);
                          cumulativeByTxn.set(t.id, next);
                        });
                        return paymentTxns.map((p, i, arr) => {
                          const bill = billings.find((b) => b.id === p.billing_id);
                          const billTotal = Number(bill?.total_amount || 0);
                          const cumulativePaid = cumulativeByTxn.get(p.id) || 0;
                          const rawBalance = billTotal - cumulativePaid;
                          const balanceAfter = Math.max(0, rawBalance);
                          return (
                            <TableRow key={p.id} className="hover:bg-accent/50">
                              <TableCell className="text-xs">{arr.length - i}</TableCell>
                              <TableCell className="text-xs font-medium">{format(new Date(p.payment_date), "dd MMM yyyy, h:mm a")}</TableCell>
                              <TableCell className="text-xs">{bill?.invoice_number || p.billing_id.slice(0, 8)}</TableCell>
                              <TableCell className="text-xs capitalize">{p.payment_method || "—"}</TableCell>
                              <TableCell className="text-xs">₹{billTotal.toLocaleString()}</TableCell>
                              <TableCell className="text-xs font-semibold text-accent">₹{Number(p.amount || 0).toLocaleString()}</TableCell>
                              <TableCell className={`text-xs font-medium ${balanceAfter > 0 ? "text-destructive" : ""}`}>₹{balanceAfter.toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                {bill && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setSelectedBilling(bill); setBillingDialogOpen(true); }}
                                  >
                                    <Eye size={14} /> View
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}

        <BillingDetailDialog
          open={billingDialogOpen}
          onOpenChange={setBillingDialogOpen}
          billing={selectedBilling}
          patientName={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : ""}
          allBillings={billings}
          onRefresh={() => selectedPatient && fetchHistory(selectedPatient.id)}
        />

        <Dialog open={!!photoPreview} onOpenChange={(o) => !o && setPhotoPreview(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon size={18} /> {photoPreview?.photo_type}{photoPreview?.tooth_number ? ` • Tooth ${photoPreview.tooth_number}` : ""}
              </DialogTitle>
            </DialogHeader>
            {photoPreview && (
              <div className="space-y-2">
                {photoPreview.photo_type === "video" ? (
                  <video
                    src={getPhotoUrl(photoPreview.file_path)}
                    controls
                    controlsList="nodownload"
                    preload="metadata"
                    className="w-full max-h-[70vh] rounded-md bg-black"
                  />
                ) : (
                  <img src={getPhotoUrl(photoPreview.file_path)} alt={photoPreview.file_name || "photo"} className="w-full max-h-[70vh] object-contain rounded-md bg-black/5" />
                )}
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>{format(new Date(photoPreview.created_at), "dd MMM yyyy, hh:mm a")}</span>
                  {photoPreview.notes && <span className="truncate max-w-[60%]" title={photoPreview.notes}>{photoPreview.notes}</span>}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!dateGallery} onOpenChange={(o) => !o && setDateGallery(null)}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera size={18} /> Photos on {dateGallery ? format(new Date(dateGallery), "dd MMM yyyy") : ""}
              </DialogTitle>
            </DialogHeader>
            {dateGallery && (() => {
              const items = photos.filter((p) => format(new Date(p.created_at), "yyyy-MM-dd") === dateGallery);
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {items.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPhotoPreview(p)}
                      className="relative rounded-md border bg-muted overflow-hidden aspect-square hover:ring-2 hover:ring-primary text-left"
                    >
                      {p.photo_type === "video" ? (
                        <>
                          <video src={getPhotoUrl(p.file_path)} preload="metadata" muted playsInline className="w-full h-full object-cover bg-black" />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                              <Play size={18} className="text-white ml-0.5" fill="white" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <img src={getPhotoUrl(p.file_path)} alt={p.file_name || "photo"} loading="lazy" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-1 capitalize">
                        <div className="truncate font-medium">{p.photo_type}</div>
                        <div className="truncate opacity-80">{format(new Date(p.created_at), "hh:mm a")}</div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera size={18} /> All Clinical Photos & X-Rays ({photos.length})
              </DialogTitle>
            </DialogHeader>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No photos available</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPhotoPreview(p)}
                    className="relative rounded-md border bg-muted overflow-hidden aspect-square hover:ring-2 hover:ring-primary text-left"
                  >
                    {p.photo_type === "video" ? (
                      <>
                        <video src={getPhotoUrl(p.file_path)} preload="metadata" muted playsInline className="w-full h-full object-cover bg-black" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                            <Play size={18} className="text-white ml-0.5" fill="white" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img src={getPhotoUrl(p.file_path)} alt={p.file_name || "photo"} loading="lazy" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-1 capitalize">
                      <div className="truncate font-medium">{p.photo_type}{p.tooth_number ? ` • #${p.tooth_number}` : ""}</div>
                      <div className="truncate opacity-80">{format(new Date(p.created_at), "dd MMM yyyy")}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={prescriptionDialogOpen} onOpenChange={setPrescriptionDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill size={18} /> Prescription Details
              </DialogTitle>
            </DialogHeader>
            {selectedPrescription && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedPrescription.created_at), "dd MMM yyyy, hh:mm a")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Doctor</p>
                    <p className="font-medium">{selectedPrescription.doctor || "—"}</p>
                  </div>
                  {selectedPrescription.diagnosis && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Diagnosis</p>
                      <p className="font-medium">{selectedPrescription.diagnosis}</p>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Medicines ({selectedPrescription.items.length})</h4>
                  {selectedPrescription.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No medicines listed</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Medicine</TableHead>
                            <TableHead>Dosage</TableHead>
                            <TableHead>Frequency</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Instructions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedPrescription.items.map((it, idx) => (
                            <TableRow key={it.id}>
                              <TableCell className="text-xs">{idx + 1}</TableCell>
                              <TableCell className="text-xs font-medium">{it.medicine_name}</TableCell>
                              <TableCell className="text-xs">{it.dosage || "—"}</TableCell>
                              <TableCell className="text-xs">{it.frequency || "—"}</TableCell>
                              <TableCell className="text-xs">{it.duration ? `${it.duration} day${Number(it.duration) !== 1 ? "s" : ""}` : "—"}</TableCell>
                              <TableCell className="text-xs">{it.instructions || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {selectedPrescription.notes && (
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p>{selectedPrescription.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Date-wise full detail dialog (read-only) */}
        <Dialog open={dateViewOpen} onOpenChange={setDateViewOpen}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar size={18} /> Records on {selectedDate ? format(new Date(selectedDate), "dd MMM yyyy") : ""}
              </DialogTitle>
            </DialogHeader>
            {selectedDate && (() => {
              const matchDay = (iso: string | null | undefined) => !!iso && format(new Date(iso), "yyyy-MM-dd") === selectedDate;
              const dVisits = visits.filter((v) => matchDay(v.checkin_time));
              const dTreatments = treatments.filter((t) => matchDay(t.created_at));
              const dVitals = vitalsList.filter((v) => matchDay(v.recorded_at));
              const dFindings = findings.filter((f) => matchDay(f.visit_date));
              const dPhotos = photos.filter((p) => matchDay(p.created_at));
              const dDiag = diagnostics.filter((d) => matchDay(d.ordered_date || d.created_at));
              const dLabs = labOrders.filter((l) => matchDay(l.created_at));
              const dRx = prescriptions.filter((p) => matchDay(p.created_at));
              const dBills = billings.filter((b) => matchDay(b.created_at));

              const Section = ({ title, icon, empty, children }: any) => (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">{icon} {title}</h4>
                  {empty ? <p className="text-xs text-muted-foreground italic">No records</p> : children}
                </div>
              );

              return (
                <div className="space-y-5">
                  <Section title="Visits" icon={<Clock size={14} />} empty={dVisits.length === 0}>
                    <ul className="text-xs space-y-1">
                      {dVisits.map((v) => (
                        <li key={v.id}>• {format(new Date(v.checkin_time), "hh:mm a")} {v.doctor ? `— ${v.doctor}` : ""} <Badge variant="secondary" className="text-[10px] ml-1">{v.status}</Badge></li>
                      ))}
                    </ul>
                  </Section>

                  <Section title="Vitals & Complaints" icon={<Activity size={14} />} empty={dVitals.length === 0}>
                    {dVitals.map((v) => {
                      let complaints = "";
                      try {
                        const parsed = v.notes ? JSON.parse(v.notes) : null;
                        if (parsed?.chiefComplaints?.length) complaints = parsed.chiefComplaints.join(", ");
                        if (parsed?.otherComplaint) complaints += (complaints ? ", " : "") + parsed.otherComplaint;
                        if (!complaints && parsed?.additionalNotes) complaints = parsed.additionalNotes;
                      } catch { complaints = v.notes || ""; }
                      const bp = v.blood_pressure_systolic && v.blood_pressure_diastolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : "—";
                      return (
                        <div key={v.id} className="text-xs border rounded p-2 mb-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div><span className="text-muted-foreground">BP:</span> {bp}</div>
                          <div><span className="text-muted-foreground">Pulse:</span> {v.pulse_rate ?? "—"}</div>
                          <div><span className="text-muted-foreground">Temp:</span> {v.temperature ?? "—"}</div>
                          <div><span className="text-muted-foreground">SpO2:</span> {v.spo2 ?? "—"}</div>
                          <div><span className="text-muted-foreground">Sugar:</span> {v.blood_sugar ?? "—"}</div>
                          <div><span className="text-muted-foreground">Wt/Ht:</span> {v.weight ?? "—"}/{v.height ?? "—"}</div>
                          {complaints && <div className="col-span-full"><span className="text-muted-foreground">Complaints:</span> {complaints}</div>}
                        </div>
                      );
                    })}
                  </Section>

                  <Section title="Consultation Findings" icon={<Stethoscope size={14} />} empty={dFindings.length === 0}>
                    <Table>
                      <TableHeader><TableRow><TableHead>Tooth</TableHead><TableHead>Surface</TableHead><TableHead>Condition</TableHead><TableHead>Treatment Needed</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dFindings.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="text-xs">{f.tooth_number ?? "—"}</TableCell>
                            <TableCell className="text-xs">{f.surface || "—"}</TableCell>
                            <TableCell className="text-xs">{f.condition || "—"}</TableCell>
                            <TableCell className="text-xs">{f.treatment_needed || "—"}</TableCell>
                            <TableCell className="text-xs">{f.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Section>

                  <Section title="Treatments" icon={<Stethoscope size={14} />} empty={dTreatments.length === 0}>
                    <Table>
                      <TableHeader><TableRow><TableHead>Treatment</TableHead><TableHead>Tooth</TableHead><TableHead>Doctor</TableHead><TableHead>Cost</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dTreatments.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-xs">{t.treatment_type}</TableCell>
                            <TableCell className="text-xs">{t.tooth_number ?? "—"}</TableCell>
                            <TableCell className="text-xs">{t.doctor || "—"}</TableCell>
                            <TableCell className="text-xs">₹{(t.estimated_cost || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px] capitalize">{t.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Section>

                  <Section title="Clinical Photos & X-Rays" icon={<Camera size={14} />} empty={dPhotos.length === 0}>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {dPhotos.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPhotoPreview(p)}
                          className="relative rounded-md border bg-muted overflow-hidden aspect-square hover:ring-2 hover:ring-primary"
                        >
                          <img src={getPhotoUrl(p.file_path)} alt={p.file_name || "photo"} className="w-full h-full object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1 py-0.5 capitalize truncate">
                            {p.photo_type}{p.tooth_number ? ` • #${p.tooth_number}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="Diagnostics" icon={<FlaskConical size={14} />} empty={dDiag.length === 0}>
                    <Table>
                      <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Test</TableHead><TableHead>Center</TableHead><TableHead>Cost</TableHead><TableHead>Status</TableHead><TableHead>Report</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dDiag.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-xs capitalize">{(d.test_type || "").replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-xs">{d.test_name || "—"}</TableCell>
                            <TableCell className="text-xs">{d.lab_name || "—"}</TableCell>
                            <TableCell className="text-xs">₹{Number(d.cost || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px] capitalize">{d.status?.replace(/_/g, " ") || "—"}</Badge></TableCell>
                            <TableCell className="text-xs">{d.report_url ? <a href={d.report_url} target="_blank" rel="noreferrer" className="text-primary underline">View</a> : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Section>

                  <Section title="Lab Orders" icon={<FlaskConical size={14} />} empty={dLabs.length === 0}>
                    <Table>
                      <TableHeader><TableRow><TableHead>Lab</TableHead><TableHead>Work</TableHead><TableHead>Material</TableHead><TableHead>Tooth</TableHead><TableHead>Rate</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dLabs.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="text-xs">{l.lab_name}</TableCell>
                            <TableCell className="text-xs capitalize">{(l.work_type || "").replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-xs">{l.material || "—"}</TableCell>
                            <TableCell className="text-xs">{l.tooth_number || "—"}</TableCell>
                            <TableCell className="text-xs">₹{Number(l.rate || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px] capitalize">{l.status.replace(/_/g, " ")}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Section>

                  <Section title="Prescriptions" icon={<Pill size={14} />} empty={dRx.length === 0}>
                    {dRx.map((p) => (
                      <div key={p.id} className="border rounded p-2 mb-2">
                        <div className="text-xs mb-1"><span className="text-muted-foreground">Doctor:</span> {p.doctor || "—"} {p.diagnosis && <> • <span className="text-muted-foreground">Dx:</span> {p.diagnosis}</>}</div>
                        <Table>
                          <TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Dosage</TableHead><TableHead>Frequency</TableHead><TableHead>Duration</TableHead><TableHead>Instructions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {p.items.map((it) => (
                              <TableRow key={it.id}>
                                <TableCell className="text-xs font-medium">{it.medicine_name}</TableCell>
                                <TableCell className="text-xs">{it.dosage || "—"}</TableCell>
                                <TableCell className="text-xs">{it.frequency || "—"}</TableCell>
                                <TableCell className="text-xs">{it.duration ? `${it.duration} day${Number(it.duration) !== 1 ? "s" : ""}` : "—"}</TableCell>
                                <TableCell className="text-xs">{it.instructions || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </Section>

                  <Section title="Billing" icon={<IndianRupee size={14} />} empty={dBills.length === 0}>
                    <Table>
                      <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Balance</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dBills.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="text-xs">{b.invoice_number || b.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-xs">₹{b.total_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-xs">₹{(b.amount_paid || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-xs">₹{(b.total_amount - (b.amount_paid || 0)).toLocaleString()}</TableCell>
                            <TableCell className="text-xs capitalize">{b.payment_method || "—"}</TableCell>
                            <TableCell className="text-xs"><Badge variant={b.payment_status === "paid" ? "default" : "destructive"} className="text-[10px] capitalize">{b.payment_status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Section>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Vitals + Complaint + Medical History detail dialog */}
        <Dialog open={vitalsDetailOpen} onOpenChange={setVitalsDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity size={18} />
                Vitals, Complaint & Medical History
                {selectedVitals && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {format(new Date(selectedVitals.recorded_at), "dd MMM yyyy, hh:mm a")}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedVitals && (() => {
              const v = selectedVitals;
              let parsed: any = null;
              try { parsed = v.notes ? JSON.parse(v.notes) : null; } catch {}
              const cc: string[] = parsed?.chiefComplaints || [];
              const otherComplaint = parsed?.otherComplaint || "";
              const pastDental = parsed?.pastDentalNotes || "";
              const medical: string[] = parsed?.medicalHistory && typeof parsed.medicalHistory === "object" && !Array.isArray(parsed.medicalHistory)
                ? Object.entries(parsed.medicalHistory).filter(([, v]) => v === "yes").map(([k]) => k)
                : (Array.isArray(parsed?.medicalHistory) ? parsed.medicalHistory : []);
              const otherMedical = parsed?.otherMedicalNotes || "";
              const additional = parsed?.additionalNotes || "";
              const bp = v.blood_pressure_systolic && v.blood_pressure_diastolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg` : "—";
              return (
                <div className="space-y-4">
                  {/* Vitals */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Activity size={14} /> Vitals</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">BP</div><div className="font-medium">{bp}</div></div>
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">Pulse</div><div className="font-medium">{v.pulse_rate ?? "—"} bpm</div></div>
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">Temperature</div><div className="font-medium">{v.temperature ?? "—"} °F</div></div>
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">SpO₂</div><div className="font-medium">{v.spo2 ?? "—"} %</div></div>
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">Blood Sugar</div><div className="font-medium">{v.blood_sugar ?? "—"} mg/dL</div></div>
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">Weight</div><div className="font-medium">{v.weight ?? "—"} kg</div></div>
                      <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">Height</div><div className="font-medium">{v.height ?? "—"} cm</div></div>
                    </div>
                  </div>

                  {/* Chief Complaints */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Chief Complaints</h4>
                    {cc.length === 0 && !otherComplaint ? (
                      <p className="text-xs text-muted-foreground">No complaints recorded</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {cc.map((c) => <Badge key={c} variant="secondary" className="text-[11px]">{c}</Badge>)}
                        {otherComplaint && <Badge variant="outline" className="text-[11px]">Other: {otherComplaint}</Badge>}
                      </div>
                    )}
                  </div>

                  {/* Past Dental History */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Past Dental History</h4>
                    <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3">
                      {pastDental || <span className="text-muted-foreground">No past dental history recorded</span>}
                    </p>
                  </div>

                  {/* Past Medical History */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Past Medical History</h4>
                    {medical.length === 0 && !otherMedical ? (
                      <p className="text-xs text-muted-foreground">No medical history recorded</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {medical.map((m) => <Badge key={m} variant="secondary" className="text-[11px]">{m}</Badge>)}
                        </div>
                        {otherMedical && (
                          <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3">
                            <span className="font-medium">Other: </span>{otherMedical}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Additional Notes */}
                  {additional && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Additional Notes</h4>
                      <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3">{additional}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Findings date view dialog */}
        <Dialog open={!!findingsDateView} onOpenChange={(o) => !o && setFindingsDateView(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope size={18} /> Findings on {findingsDateView ? format(new Date(findingsDateView), "dd MMM yyyy") : ""}
              </DialogTitle>
            </DialogHeader>
            {findingsDateView && (
              <div className="mb-3">
                <h4 className="text-xs font-semibold mb-1 flex items-center gap-1"><Stethoscope size={12} /> Consultation Notes</h4>
                <div className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3">
                  {(consultNotesByDate[findingsDateView] || "").trim() || (
                    <span className="text-muted-foreground italic">No Notes</span>
                  )}
                </div>
              </div>
            )}
            {findingsDateView && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tooth</TableHead>
                    <TableHead>Surface</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Treatment Needed</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {findings.filter((f) => f.visit_date && format(new Date(f.visit_date), "yyyy-MM-dd") === findingsDateView).map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs font-medium">{f.tooth_number && f.tooth_number > 0 ? f.tooth_number : "General"}</TableCell>
                      <TableCell className="text-xs">{f.surface || "—"}</TableCell>
                      <TableCell className="text-xs">{f.condition || "—"}</TableCell>
                      <TableCell className="text-xs">{f.treatment_needed || "—"}</TableCell>
                      <TableCell className="text-xs">{f.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>

        {/* Treatments date view dialog */}
        <Dialog open={!!treatmentsDateView} onOpenChange={(o) => !o && setTreatmentsDateView(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope size={18} /> Treatments on {treatmentsDateView ? format(new Date(treatmentsDateView), "dd MMM yyyy") : ""}
              </DialogTitle>
            </DialogHeader>
            {treatmentsDateView && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tooth</TableHead>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treatments.filter((t) => format(new Date(t.created_at), "yyyy-MM-dd") === treatmentsDateView).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs font-medium">{t.tooth_number ?? "—"}</TableCell>
                      <TableCell className="text-xs">{t.treatment_type || "—"}</TableCell>
                      <TableCell className="text-xs">{t.doctor || "—"}</TableCell>
                      <TableCell className="text-xs">₹{(t.estimated_cost || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px] capitalize">{t.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default HistoryStep;
