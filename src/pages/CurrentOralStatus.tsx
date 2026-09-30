import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format, differenceInDays, differenceInYears } from "date-fns";
import {
  ArrowLeft, Smile, Search, Printer, Activity, Stethoscope,
  ClipboardList, Pill, Image as ImageIcon, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  fetchOpenFindings, OpenFinding, FindingStatus,
  STATUS_COLOR, STATUS_LABEL,
} from "@/lib/findingsLifecycle";
import FindingsTimeline from "@/components/workflow/FindingsTimeline";

type FilterKey = "all" | "active" | "continuing" | "monitoring" | "resolved" | "recurred";

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  patient_code: number | null;
  phone: string | null;
  phone_country_code: string | null;
  gender: string | null;
  date_of_birth: string | null;
}

const STATUS_TO_FILTER: Record<FindingStatus, FilterKey> = {
  active: "active",
  continuing: "continuing",
  monitoring: "monitoring",
  resolved: "resolved",
  recurred: "recurred",
  reopened: "recurred",
  closed: "resolved",
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "continuing", label: "Under Treatment" },
  { key: "monitoring", label: "Monitoring" },
  { key: "resolved", label: "Resolved" },
  { key: "recurred", label: "Recurred" },
];

const sb = supabase as any;

const CurrentOralStatus = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [findings, setFindings] = useState<OpenFinding[]>([]);
  const [lastVisit, setLastVisit] = useState<{ date: string; doctor: string | null } | null>(null);
  const [nextAppt, setNextAppt] = useState<{ date: string; time: string | null; doctor: string | null } | null>(null);
  const [assignedDoctor, setAssignedDoctor] = useState<string | null>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [chartEntries, setChartEntries] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Patient picker list
  useEffect(() => {
    if (patientId) return;
    sb.from("patients")
      .select("id, first_name, last_name, patient_code, phone, phone_country_code, gender, date_of_birth")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }: any) => setAllPatients(data || []));
  }, [patientId]);

  // Load patient bundle
  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    (async () => {
      const [
        pRes, findingsList, apptRes, plansRes, rxRes, photosRes, chartsRes, consRes,
      ] = await Promise.all([
        sb.from("patients").select("id, first_name, last_name, patient_code, phone, phone_country_code, gender, date_of_birth").eq("id", patientId).maybeSingle(),
        fetchOpenFindings(patientId),
        sb.from("appointments").select("appointment_date, start_time, doctor, status, type, notes").eq("patient_id", patientId).order("appointment_date", { ascending: false }),
        sb.from("treatment_plans").select("id, doctor, diagnosis, created_at, treatment_plan_items(id, tooth_number, treatment_type, description, estimated_cost, status, priority, completed_at, created_at)").eq("patient_id", patientId).order("created_at", { ascending: false }),
        sb.from("prescriptions").select("id, doctor, diagnosis, notes, created_at, prescription_items(medicine_name, dosage, frequency, duration, instructions)").eq("patient_id", patientId).order("created_at", { ascending: false }),
        sb.from("clinical_photos").select("id, photo_type, file_path, file_name, tooth_number, notes, created_at").eq("patient_id", patientId).order("created_at", { ascending: false }),
        sb.from("dental_charts").select("id, chart_type, notes, created_at, dental_chart_entries(tooth_number, surface, condition, treatment_needed, notes)").eq("patient_id", patientId).order("created_at", { ascending: false }),
        sb.from("patient_checkins").select("id, status, notes, created_at").eq("patient_id", patientId).order("created_at", { ascending: false }),
      ]);

      setPatient(pRes.data || null);
      setFindings(findingsList);

      const appts = apptRes.data || [];
      const today = new Date().toISOString().slice(0, 10);
      const past = appts.filter((a: any) => a.appointment_date <= today && a.status === "completed");
      const future = appts.filter((a: any) => a.appointment_date >= today && a.status !== "cancelled" && a.status !== "completed");
      setLastVisit(past[0] ? { date: past[0].appointment_date, doctor: past[0].doctor } : null);
      const upcoming = future.sort((a: any, b: any) => a.appointment_date.localeCompare(b.appointment_date))[0];
      setNextAppt(upcoming ? { date: upcoming.appointment_date, time: upcoming.start_time, doctor: upcoming.doctor } : null);
      setAssignedDoctor(past[0]?.doctor || findingsList[0]?.doctor || upcoming?.doctor || null);

      const plans = (plansRes.data || []) as any[];
      const tx: any[] = [];
      plans.forEach((pl) => (pl.treatment_plan_items || []).forEach((it: any) => tx.push({ ...it, _plan_doctor: pl.doctor, _plan_diagnosis: pl.diagnosis })));
      setTreatments(tx);

      setPrescriptions(rxRes.data || []);
      setPhotos(photosRes.data || []);

      const ce: any[] = [];
      (chartsRes.data || []).forEach((c: any) => (c.dental_chart_entries || []).forEach((e: any) => ce.push({ ...e, _chart_date: c.created_at, _chart_type: c.chart_type })));
      setChartEntries(ce);

      setConsultations(consRes.data || []);
      setLoading(false);
    })();
  }, [patientId]);

  const counts = useMemo(() => {
    const c = { active: 0, continuing: 0, monitoring: 0, resolved: 0, recurred: 0, total: findings.length };
    findings.forEach((f) => {
      const k = STATUS_TO_FILTER[f.latest_status];
      if (k !== "all") (c as any)[k] += 1;
    });
    return c;
  }, [findings]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return findings.filter((f) => {
      if (filter !== "all" && STATUS_TO_FILTER[f.latest_status] !== filter) return false;
      if (!q) return true;
      return [
        String(f.tooth_number ?? ""),
        f.condition, f.diagnosis ?? "", f.treatment_needed ?? "", f.doctor ?? "", f.notes ?? "",
      ].some((s) => s.toLowerCase().includes(q));
    });
  }, [findings, filter, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, OpenFinding[]>();
    visible.forEach((f) => {
      const k = f.tooth_number != null ? String(f.tooth_number) : "general";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    });
    return Array.from(m.entries()).sort(([a], [b]) => {
      if (a === "general") return 1;
      if (b === "general") return -1;
      return Number(a) - Number(b);
    });
  }, [visible]);

  const indicators = useMemo(() => {
    const out: { label: string; tone: "amber" | "blue" | "green" | "red" }[] = [];
    if (nextAppt) out.push({ label: `Upcoming: ${format(new Date(nextAppt.date), "dd MMM yyyy")}`, tone: "blue" });
    const openCount = findings.filter((f) => !["resolved", "closed"].includes(f.latest_status)).length;
    if (findings.length === 0) out.push({ label: "No clinical findings recorded", tone: "green" });
    else if (openCount === 0) out.push({ label: "Treatment Completed", tone: "green" });
    else out.push({ label: "No Active Findings", tone: "green" });
    const needsFollow = findings.some((f) => ["active", "continuing", "recurred", "reopened"].includes(f.latest_status) && differenceInDays(new Date(), new Date(f.last_event_date)) > 14);
    if (needsFollow) out.push({ label: "Requires Follow-up", tone: "amber" });
    // remove "No Active Findings" if there are active
    return out.filter((x) => !(x.label === "No Active Findings" && openCount === 0));
  }, [findings, nextAppt]);

  const age = patient?.date_of_birth ? differenceInYears(new Date(), new Date(patient.date_of_birth)) : null;

  // ---------- Picker ----------
  if (!patientId) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <h1 className="text-xl font-display font-semibold flex items-center gap-2">
          <Smile size={20} /> Current Oral Status Lookup
        </h1>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Select a patient</CardTitle></CardHeader>
          <CardContent>
            <Command className="rounded-md border">
              <CommandInput placeholder="Search by name or patient code…" />
              <CommandList className="max-h-[400px]">
                <CommandEmpty>No patients found.</CommandEmpty>
                <CommandGroup>
                  {allPatients.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.first_name} ${p.last_name} PT${p.patient_code ?? ""} ${p.phone ?? ""}`}
                      onSelect={() => navigate(`/current-oral-status/${p.id}`)}
                    >
                      <User size={14} className="mr-2 text-muted-foreground" />
                      <span className="font-medium">{p.first_name} {p.last_name}</span>
                      {p.patient_code != null && <span className="ml-2 text-xs text-muted-foreground">PT{p.patient_code}</span>}
                      {p.phone && <span className="ml-auto text-xs text-muted-foreground">{p.phone}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Loaded ----------
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl print:max-w-full">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/patient-database"><ArrowLeft size={14} /> Back</Link>
        </Button>
        <h1 className="text-xl font-display font-semibold flex items-center gap-2">
          <Smile size={20} /> Current Oral Status
        </h1>
        <div className="ml-auto flex gap-2">
          <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => {
                if (allPatients.length === 0) {
                  sb.from("patients").select("id, first_name, last_name, patient_code, phone, phone_country_code, gender, date_of_birth").order("created_at", { ascending: false }).limit(500).then(({ data }: any) => setAllPatients(data || []));
                }
              }}>
                <User size={14} /> Change patient
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px]">
              <SheetHeader><SheetTitle>Select patient</SheetTitle></SheetHeader>
              <Command className="rounded-md border mt-4">
                <CommandInput placeholder="Search…" />
                <CommandList className="max-h-[70vh]">
                  <CommandEmpty>No patients.</CommandEmpty>
                  <CommandGroup>
                    {allPatients.map((p) => (
                      <CommandItem key={p.id} value={`${p.first_name} ${p.last_name} PT${p.patient_code ?? ""}`}
                        onSelect={() => { setPickerOpen(false); navigate(`/current-oral-status/${p.id}`); }}>
                        <span className="font-medium">{p.first_name} {p.last_name}</span>
                        {p.patient_code != null && <span className="ml-2 text-xs text-muted-foreground">PT{p.patient_code}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !patient ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Patient not found.</CardContent></Card>
      ) : (
        <>
          {/* 1. Patient Summary */}
          <Card>
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Patient</div>
                <div className="font-semibold">{patient.first_name} {patient.last_name}</div>
                {patient.patient_code != null && <div className="text-xs text-muted-foreground">PT{patient.patient_code}</div>}
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Age / Gender</div>
                <div>{age != null ? `${age} yrs` : "—"} {patient.gender ? `· ${patient.gender}` : ""}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Mobile</div>
                <div>{patient.phone_country_code || ""} {patient.phone || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Assigned Doctor</div>
                <div>{assignedDoctor || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Last Visit</div>
                <div>{lastVisit ? format(new Date(lastVisit.date), "dd MMM yyyy") : "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Next Appointment</div>
                <div>{nextAppt ? `${format(new Date(nextAppt.date), "dd MMM yyyy")}${nextAppt.time ? ` · ${nextAppt.time.slice(0,5)}` : ""}` : "—"}</div>
              </div>
              <div className="col-span-2 md:col-span-2 flex flex-wrap gap-1.5 items-center">
                {indicators.map((i, idx) => (
                  <Badge key={idx} variant="outline" className={
                    i.tone === "amber" ? "bg-amber-100 text-amber-800 border-amber-300" :
                    i.tone === "blue" ? "bg-blue-100 text-blue-800 border-blue-300" :
                    i.tone === "green" ? "bg-green-100 text-green-800 border-green-300" :
                    "bg-rose-100 text-rose-800 border-rose-300"
                  }>{i.label}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 2. Status summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {[
              { key: "active" as FilterKey, label: "Active", value: counts.active, cls: "bg-amber-50 border-amber-200 text-amber-900" },
              { key: "continuing" as FilterKey, label: "Under Treatment", value: counts.continuing, cls: "bg-blue-50 border-blue-200 text-blue-900" },
              { key: "monitoring" as FilterKey, label: "Monitoring", value: counts.monitoring, cls: "bg-purple-50 border-purple-200 text-purple-900" },
              { key: "resolved" as FilterKey, label: "Resolved", value: counts.resolved, cls: "bg-green-50 border-green-200 text-green-900" },
              { key: "recurred" as FilterKey, label: "Recurred", value: counts.recurred, cls: "bg-rose-50 border-rose-200 text-rose-900" },
              { key: "all" as FilterKey, label: "Total Findings", value: counts.total, cls: "bg-slate-50 border-slate-200 text-slate-900" },
            ].map((t) => (
              <button key={t.label} onClick={() => setFilter(t.key)}
                className={`rounded-md border p-3 text-left transition hover:shadow-sm ${t.cls} ${filter === t.key ? "ring-2 ring-offset-1 ring-primary/40" : ""}`}>
                <div className="text-2xl font-bold leading-none">{t.value}</div>
                <div className="text-[11px] uppercase mt-1 font-medium">{t.label}</div>
              </button>
            ))}
          </div>

          {/* 3. Filters + search */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"}
                  onClick={() => setFilter(f.key)}>{f.label}</Button>
              ))}
            </div>
            <div className="relative ml-auto w-full md:w-72">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tooth / finding / doctor…" className="pl-7 h-9" />
            </div>
          </div>

          {/* 4. Current Findings */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity size={16} /> Current Oral Findings</CardTitle></CardHeader>
            <CardContent>
              {grouped.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No findings match.</p>
              ) : (
                <div className="space-y-3">
                  {grouped.map(([tooth, rows]) => (
                    <div key={tooth} className="rounded-md border">
                      <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">
                        {tooth === "general" ? "Full Mouth / General" : `Tooth #${tooth}`}
                        <span className="ml-2 font-normal text-muted-foreground">({rows.length})</span>
                      </div>
                      <div className="divide-y">
                        {rows.map((f) => {
                          const daysSince = differenceInDays(new Date(), new Date(f.last_event_date));
                          return (
                            <div key={f.id} className="p-3 grid md:grid-cols-12 gap-2 text-xs">
                              <div className="md:col-span-3">
                                <div className="font-semibold text-sm">{f.condition}</div>
                                {f.diagnosis && <div className="text-muted-foreground">Dx: {f.diagnosis}</div>}
                                {f.surface && <div className="text-muted-foreground">Surface: {f.surface}</div>}
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-[10px] uppercase text-muted-foreground">Treatment</div>
                                <div>{f.treatment_needed || "—"}</div>
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-[10px] uppercase text-muted-foreground">Status</div>
                                <Badge variant="outline" className={STATUS_COLOR[f.latest_status]}>{STATUS_LABEL[f.latest_status]}</Badge>
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-[10px] uppercase text-muted-foreground">Doctor</div>
                                <div>{f.doctor || "—"}</div>
                              </div>
                              <div className="md:col-span-3">
                                <div className="text-[10px] uppercase text-muted-foreground">Dates</div>
                                <div>First: {format(new Date(f.recorded_at), "dd MMM yyyy")}</div>
                                <div>Updated: {format(new Date(f.last_event_date), "dd MMM yyyy")}
                                  {daysSince > 30 && <span className="ml-1 text-amber-700">· {daysSince}d ago</span>}
                                </div>
                              </div>
                              {f.notes && <div className="md:col-span-12 text-muted-foreground italic">"{f.notes}"</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5. Timeline */}
          <FindingsTimeline patientId={patientId ?? null} title="Complete Clinical Timeline" />

          {/* 6. Quick Actions */}
          <Card className="print:hidden">
            <CardHeader className="pb-2"><CardTitle className="text-base">Quick Actions (Read-only)</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <QuickPanel title="Consultation History" icon={<Stethoscope size={14} />}>
                {consultations.length === 0 ? <Empty /> : consultations.map((c) => (
                  <div key={c.id} className="rounded border p-2 text-xs">
                    <div className="flex justify-between"><span className="font-semibold">{c.status || "Check-in"}</span><span className="text-muted-foreground">{format(new Date(c.created_at), "dd MMM yyyy")}</span></div>
                    {c.notes && <div className="text-muted-foreground italic">"{c.notes}"</div>}
                  </div>
                ))}
              </QuickPanel>

              <QuickPanel title="Dental Chart" icon={<Smile size={14} />}>
                {chartEntries.length === 0 ? <Empty /> : chartEntries.map((e, i) => (
                  <div key={i} className="rounded border p-2 text-xs flex flex-wrap gap-2">
                    <Badge variant="outline">#{e.tooth_number}</Badge>
                    <span className="font-medium">{e.condition}</span>
                    {e.surface && <span className="text-muted-foreground">{e.surface}</span>}
                    {e.treatment_needed && <span className="text-muted-foreground">→ {e.treatment_needed}</span>}
                    <span className="ml-auto text-[10px] text-muted-foreground">{format(new Date(e._chart_date), "dd MMM yyyy")}</span>
                  </div>
                ))}
              </QuickPanel>

              <QuickPanel title="Treatment History" icon={<ClipboardList size={14} />}>
                {treatments.length === 0 ? <Empty /> : treatments.map((t) => (
                  <div key={t.id} className="rounded border p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-semibold">{t.treatment_type}{t.tooth_number ? ` · #${t.tooth_number}` : ""}</span>
                      <Badge variant="outline" className={t.status === "completed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>{t.status}</Badge>
                    </div>
                    {t.description && <div className="text-muted-foreground">{t.description}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {t._plan_doctor || "—"} · {format(new Date(t.created_at), "dd MMM yyyy")}
                      {t.completed_at ? ` · Done ${format(new Date(t.completed_at), "dd MMM yyyy")}` : ""}
                    </div>
                  </div>
                ))}
              </QuickPanel>

              <QuickPanel title="Prescriptions" icon={<Pill size={14} />}>
                {prescriptions.length === 0 ? <Empty /> : prescriptions.map((rx: any) => (
                  <div key={rx.id} className="rounded border p-2 text-xs">
                    <div className="flex justify-between"><span className="font-semibold">{rx.doctor || "—"}</span><span className="text-muted-foreground">{format(new Date(rx.created_at), "dd MMM yyyy")}</span></div>
                    {rx.diagnosis && <div>Dx: {rx.diagnosis}</div>}
                    <ul className="mt-1 list-disc ml-4 text-muted-foreground">
                      {(rx.prescription_items || []).map((m: any, i: number) => (
                        <li key={i}>{m.medicine_name} {m.dosage ? `· ${m.dosage}` : ""} {m.frequency ? `· ${m.frequency}` : ""} {m.duration ? `· ${m.duration}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </QuickPanel>

              <QuickPanel title="X-Ray / Clinical Photos" icon={<ImageIcon size={14} />}>
                {photos.length === 0 ? <Empty /> : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {photos.map((p) => (
                      <div key={p.id} className="rounded border p-2 text-xs">
                        <div className="font-medium">{p.photo_type || "Photo"}</div>
                        {p.tooth_number && <div className="text-muted-foreground">#{p.tooth_number}</div>}
                        <div className="text-[10px] text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy")}</div>
                        <div className="text-[10px] truncate text-muted-foreground" title={p.file_name}>{p.file_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </QuickPanel>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const Empty = () => <p className="text-xs text-muted-foreground italic">No records.</p>;

const QuickPanel = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="outline" size="sm">{icon} {title}</Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-[500px] sm:max-w-[500px] overflow-y-auto">
      <SheetHeader><SheetTitle className="flex items-center gap-2">{icon} {title}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-2">{children}</div>
    </SheetContent>
  </Sheet>
);

export default CurrentOralStatus;
