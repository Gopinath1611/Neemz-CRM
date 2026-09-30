import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Smile, Search, Users, AlertCircle, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import OrthoTreatmentStep from "@/components/workflow/OrthoTreatmentStep";
import BrandSelect from "@/components/ortho/BrandSelect";
import { formatPatientCode } from "@/lib/patientCode";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PatientLite {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  patient_code?: number | null;
}

interface OrthoCase {
  id: string;
  patient_id: string;
  case_code: string | null;
  doctor: string | null;
  status: string;
  appliance_type: string | null;
  appliance_brand: string | null;
  start_date: string | null;
  next_due_date: string | null;
  total_cost: number | null;
  estimated_months: number | null;
  created_at: string | null;
  visit_count?: number;
  patient?: PatientLite | null;
}

export default function OrthoTreatment() {
  const [tab, setTab] = useState<"cases" | "new">("cases");
  const [cases, setCases] = useState<OrthoCase[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [search, setSearch] = useState("");
  const [applianceFilter, setApplianceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const APPLIANCE_TYPES = [
    "Metal Braces",
    "Ceramic Braces",
    "Self-Ligating Braces",
    "Lingual Braces",
    "Clear Aligners",
    "Removable Appliance",
  ];

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);
    const { data } = await supabase
      .from("orthodontic_cases" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as any[]) || [];
    if (rows.length > 0) {
      const ids = Array.from(new Set(rows.map((r) => r.patient_id)));
      const caseIds = rows.map((r) => r.id);
      const [{ data: pats }, { data: visits }] = await Promise.all([
        supabase.from("patients").select("id, first_name, last_name, phone, patient_code").in("id", ids),
        supabase.from("orthodontic_visits" as any).select("case_id").in("case_id", caseIds),
      ]);
      const map = new Map((pats || []).map((p: any) => [p.id, p]));
      const visitCount = new Map<string, number>();
      ((visits as any[]) || []).forEach((v) => visitCount.set(v.case_id, (visitCount.get(v.case_id) || 0) + 1));
      setCases(rows.map((r) => ({ ...r, patient: map.get(r.patient_id) || null, visit_count: visitCount.get(r.id) || 0 })));
    } else {
      setCases([]);
    }
    setLoading(false);
  }

  async function searchPatients(q: string) {
    setPatientSearch(q);
    if (q.length < 2) return setPatients([]);
    const { data } = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, patient_code")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(10);
    setPatients((data as any) || []);
  }

  async function updateAppliance(caseId: string, value: string) {
    const newVal = value === "__none__" ? null : value;
    const { error } = await supabase.from("orthodontic_cases" as any).update({ appliance_type: newVal }).eq("id", caseId);
    if (error) { toast.error("Failed to update appliance"); return; }
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, appliance_type: newVal } : c));
    toast.success("Appliance updated");
  }

  async function updateBrand(caseId: string, value: string | null) {
    const { error } = await supabase.from("orthodontic_cases" as any).update({ appliance_brand: value }).eq("id", caseId);
    if (error) { toast.error("Failed to update brand"); return; }
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, appliance_brand: value } : c));
    toast.success("Brand updated");
  }

  async function toggleStatus(caseId: string, current: string) {
    const newStatus = current === "active" ? "inactive" : "active";
    const { error } = await supabase.from("orthodontic_cases" as any).update({ status: newStatus }).eq("id", caseId);
    if (error) { toast.error("Failed to update status"); return; }
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, status: newStatus } : c));
    toast.success(`Marked ${newStatus}`);
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    await supabase.from("orthodontic_visits" as any).delete().in("case_id", ids);
    const { error } = await supabase.from("orthodontic_cases" as any).delete().in("id", ids);
    setDeleting(false);
    if (error) { toast.error("Failed to delete: " + error.message); return; }
    toast.success(`Deleted ${ids.length} case${ids.length > 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    loadCases();
  }

  const filteredCases = useMemo(() => {
    const q = search.toLowerCase().trim();
    return cases.filter((c) => {
      if (applianceFilter === "unassigned") {
        if (c.appliance_type) return false;
      } else if (applianceFilter !== "all" && (c.appliance_type || "").toLowerCase() !== applianceFilter.toLowerCase()) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.case_code?.toLowerCase().includes(q) ||
        c.patient?.first_name?.toLowerCase().includes(q) ||
        c.patient?.last_name?.toLowerCase().includes(q) ||
        c.patient?.phone?.includes(q) ||
        c.appliance_type?.toLowerCase().includes(q)
      );
    });
  }, [cases, search, applianceFilter, statusFilter]);

  const pagedCases = usePagedSlice(filteredCases, page, pageSize);

  const applianceCounts = useMemo(() => {
    const map: Record<string, number> = { all: cases.length };
    APPLIANCE_TYPES.forEach((a) => {
      map[a] = cases.filter((c) => (c.appliance_type || "").toLowerCase() === a.toLowerCase()).length;
    });
    map["unassigned"] = cases.filter((c) => !c.appliance_type).length;
    return map;
  }, [cases]);

  const stats = useMemo(() => {
    const list = applianceFilter === "all" ? cases : cases.filter((c) => (c.appliance_type || "").toLowerCase() === applianceFilter.toLowerCase());
    const active = list.filter((c) => c.status === "active").length;
    const retention = list.filter((c) => c.status === "retention").length;
    const completed = list.filter((c) => c.status === "completed").length;
    const today = new Date();
    const dueSoon = list.filter((c) => {
      if (!c.next_due_date) return false;
      const d = differenceInDays(new Date(c.next_due_date), today);
      return d <= 7;
    }).length;
    return { total: list.length, active, retention, completed, dueSoon };
  }, [cases, applianceFilter]);

  // Setting label helper: aligners use "Tray", others "Visit"
  const settingLabel = (appliance: string | null) => {
    return (appliance || "").toLowerCase().includes("aligner") ? "Tray" : "Visit";
  };

  // Approx duration in months between start_date and now (for active cases) or last visit
  const approxDuration = (c: OrthoCase) => {
    if (!c.start_date) return null;
    const days = differenceInDays(new Date(), new Date(c.start_date));
    if (days < 0) return null;
    const months = Math.floor(days / 30);
    return months;
  };

  // Distribution: for current applianceFilter (or all), group by setting number
  const settingDistribution = useMemo(() => {
    const list = applianceFilter === "all" || applianceFilter === "unassigned"
      ? cases
      : cases.filter((c) => (c.appliance_type || "").toLowerCase() === applianceFilter.toLowerCase());
    const buckets = new Map<number, OrthoCase[]>();
    list.forEach((c) => {
      const n = c.visit_count || 0;
      if (!buckets.has(n)) buckets.set(n, []);
      buckets.get(n)!.push(c);
    });
    return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  }, [cases, applianceFilter]);


  // Detail view
  if (selectedPatient) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedPatient(null); loadCases(); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Ortho List
        </Button>
        <OrthoTreatmentStep
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.first_name} ${selectedPatient.last_name}`}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Smile className="h-6 w-6" /> Ortho Treatment</h1>
          <p className="text-sm text-muted-foreground">Standalone orthodontic case management — patient-wise diagnosis, plan, visits, payments & retention.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Cases" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="default" />
        <StatCard label="In Retention" value={stats.retention} tone="secondary" />
        <StatCard label="Completed" value={stats.completed} tone="outline" />
        <StatCard label="Due ≤ 7 days" value={stats.dueSoon} tone="destructive" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="cases">All Cases</TabsTrigger>
          <TabsTrigger value="new">+ New Ortho Case</TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="space-y-3">
          {/* Filters Row */}
          <Card>
            <CardContent className="pt-4 pb-3 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Appliance Type</label>
                <Select value={applianceFilter} onValueChange={setApplianceFilter}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types ({applianceCounts["all"] || 0})</SelectItem>
                    {APPLIANCE_TYPES.map((a) => (
                      <SelectItem key={a} value={a}>{a} ({applianceCounts[a] || 0})</SelectItem>
                    ))}
                    {applianceCounts["unassigned"] > 0 && (
                      <SelectItem value="unassigned">Unassigned ({applianceCounts["unassigned"]})</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["all", "active", "retention", "completed"].map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(applianceFilter !== "all" || statusFilter !== "all") && (
                <Button variant="ghost" size="sm" onClick={() => { setApplianceFilter("all"); setStatusFilter("all"); }}>
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Setting / Visit distribution */}
          {settingDistribution.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>
                    {applianceFilter === "all" ? "All Appliances" : applianceFilter} — Setting Distribution
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Hover a chip to see patient names
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="flex flex-wrap gap-2">
                  {settingDistribution.map(([n, list]) => {
                    const lbl = settingLabel(applianceFilter === "all" ? list[0]?.appliance_type ?? null : applianceFilter);
                    return (
                      <div
                        key={n}
                        className="px-3 py-1.5 rounded-md border bg-muted/30 text-xs flex items-center gap-2"
                        title={list.map((c) => c.patient ? `${c.patient.first_name} ${c.patient.last_name}` : "").filter(Boolean).join(", ")}
                      >
                        <span className="font-medium">{lbl} {n}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{list.length}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
                <span>
                  Ortho Cases
                  {applianceFilter !== "all" && <Badge className="ml-2" variant="secondary">{applianceFilter}</Badge>}
                </span>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" disabled={deleting}>
                          <Trash2 className="h-4 w-4 mr-1" /> Delete ({selectedIds.size})
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {selectedIds.size} ortho case{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the selected cases and all their visits. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <div className="relative w-72">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Search patient, code, appliance..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pagedCases.length > 0 && pagedCases.every((c) => selectedIds.has(c.id))}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedIds);
                          if (v) pagedCases.forEach((c) => next.add(c.id));
                          else pagedCases.forEach((c) => next.delete(c.id));
                          setSelectedIds(next);
                        }}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Case Code</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Appliance</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead title="Current visit / tray number">Setting</TableHead>
                    <TableHead>Approx Duration</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={14} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>}
                  {!loading && filteredCases.length === 0 && (
                    <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No ortho cases yet. Click <strong>+ New Ortho Case</strong> to begin.
                    </TableCell></TableRow>
                  )}
                  {pagedCases.map((c) => {
                    const dueDays = c.next_due_date ? differenceInDays(new Date(c.next_due_date), new Date()) : null;
                    return (
                      <TableRow key={c.id} data-state={selectedIds.has(c.id) ? "selected" : undefined}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedIds);
                              if (v) next.add(c.id); else next.delete(c.id);
                              setSelectedIds(next);
                            }}
                            aria-label="Select row"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs cursor-pointer" onClick={() => c.patient && setSelectedPatient(c.patient)}>{c.case_code || "—"}</TableCell>
                        <TableCell className="cursor-pointer" onClick={() => c.patient && setSelectedPatient(c.patient)}>
                          <div className="font-medium">{c.patient ? `${c.patient.first_name} ${c.patient.last_name}` : "—"}</div>
                          {c.patient?.patient_code && <div className="text-[10px] text-muted-foreground">{formatPatientCode(c.patient.patient_code)}</div>}
                        </TableCell>
                        <TableCell>{c.patient?.phone || "—"}</TableCell>
                        <TableCell>
                          {c.appliance_type ? (
                            <span className="text-sm">{c.appliance_type}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {c.appliance_brand ? (
                            <span className="text-sm">{c.appliance_brand}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">
                            {settingLabel(c.appliance_type)} {c.visit_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {(() => {
                            const m = approxDuration(c);
                            if (m === null) return <span className="text-muted-foreground">—</span>;
                            const est = c.estimated_months;
                            return (
                              <span>
                                {m} mo
                                {est ? <span className="text-muted-foreground"> / ~{est}</span> : null}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{c.doctor || "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Badge
                            variant={c.status === "active" ? "default" : c.status === "completed" ? "outline" : "secondary"}
                            className="cursor-pointer select-none capitalize"
                            onClick={() => toggleStatus(c.id, c.status)}
                            title="Click to toggle Active / Inactive"
                          >
                            {c.status === "active" ? "Active" : c.status === "inactive" ? "Inactive" : c.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.start_date || "—"}</TableCell>
                        <TableCell>
                          {c.next_due_date ? (
                            <span className={dueDays !== null && dueDays <= 7 ? "text-red-600 font-medium flex items-center gap-1" : ""}>
                              {dueDays !== null && dueDays <= 7 && <AlertCircle className="h-3 w-3" />}
                              {c.next_due_date}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => c.patient && setSelectedPatient(c.patient)}>Open →</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination page={page} pageSize={pageSize} total={filteredCases.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="cases" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Select Patient for Ortho Case</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search by name or phone..." value={patientSearch} onChange={(e) => searchPatients(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {patients.map((p) => (
                  <button key={p.id} className="w-full text-left p-3 border rounded hover:bg-muted/40 flex items-center justify-between" onClick={() => setSelectedPatient(p)}>
                    <div>
                      <div className="font-medium">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-muted-foreground">{p.phone || "No phone"} {p.patient_code && `· ${formatPatientCode(p.patient_code)}`}</div>
                    </div>
                    <Badge variant="outline">Open Ortho →</Badge>
                  </button>
                ))}
                {patientSearch.length >= 2 && patients.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">No patients found.</p>
                )}
                {patientSearch.length < 2 && (
                  <p className="text-center text-sm text-muted-foreground py-6">Type at least 2 characters to search.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "default" | "secondary" | "outline" | "destructive" }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${tone === "destructive" ? "text-red-600" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background text-foreground border-border hover:bg-muted"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
