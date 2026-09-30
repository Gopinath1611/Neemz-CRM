import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Clock, Search, Stethoscope, ArrowRight, AlertCircle, CalendarIcon, Users, Activity, UserCog, Trash2 } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { formatPatientCode } from "@/lib/patientCode";
import { resolveStage, formatStageLabel } from "@/lib/treatmentStages";

import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

interface PendingPatient {
  patient_id: string;
  patient_name: string;
  patient_code: number | null;
  phone: string | null;
  doctor: string | null;
  last_visit: string | null;
  pending_count: number;
  treatments: string[];
}

type DatePreset = "all" | "today" | "week" | "month" | "custom";

const PendingTreatments = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PendingPatient[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [treatmentFilter, setTreatmentFilter] = useState<string>("all");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const deletePatients = async (patientIds: string[]) => {
    if (patientIds.length === 0) return;
    setDeleting(true);
    try {
      const { data: plans, error: pErr } = await supabase
        .from("treatment_plans")
        .select("id")
        .in("patient_id", patientIds);
      if (pErr) throw pErr;
      const planIds = (plans || []).map((p: any) => p.id);
      if (planIds.length > 0) {
        const { error: dErr } = await supabase
          .from("treatment_plan_items")
          .delete()
          .in("plan_id", planIds)
          .eq("status", "pending");
        if (dErr) throw dErr;
      }
      toast.success(`Removed pending treatments for ${patientIds.length} patient(s)`);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("treatment_plan_items")
      .select(`
        id, treatment_type, tooth_number, doctor, status, created_at,
        treatment_plans!inner (
          id, patient_id, doctor, updated_at,
          patients!inner ( id, first_name, last_name, phone, patient_code )
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const byPatient = new Map<string, { patient: any; items: any[]; plans: any[] }>();
    (data || []).forEach((it: any) => {
      const plan = it.treatment_plans;
      const p = plan?.patients;
      if (!p) return;
      const entry = byPatient.get(p.id) || { patient: p, items: [], plans: [] };
      entry.items.push(it);
      entry.plans.push(plan);
      byPatient.set(p.id, entry);
    });

    const result: PendingPatient[] = [];
    byPatient.forEach(({ patient: p, items, plans }) => {
      const pendingItems = items.filter((it) => it.status === "pending");
      if (pendingItems.length === 0) return;

      // Read-only display: for multi-stage treatments show only the NEXT actionable
      // stage (earliest pending stage) and flag the treatment as In Progress when
      // earlier stages are already completed. Completed stages are never listed.
      const uniq = new Map<string, string>();
      const stageBuckets = new Map<string, { stageIndex: number; label: string; tooth: string; treatmentKey: string }>();
      pendingItems.forEach((it) => {
        const match = resolveStage(it.treatment_type);
        const tooth = it.tooth_number ? String(it.tooth_number) : "";
        if (match && !match.treatmentLevel) {
          const bucketKey = `${match.treatment.key}|${tooth}`;
          const existing = stageBuckets.get(bucketKey);
          if (!existing || match.stageIndex < existing.stageIndex) {
            stageBuckets.set(bucketKey, {
              stageIndex: match.stageIndex,
              label: `${match.treatment.label} — ${formatStageLabel(it.treatment_type)}`,
              tooth,
              treatmentKey: match.treatment.key,
            });
          }
          return;
        }
        const key = `${(it.treatment_type || "").toLowerCase()}|${tooth}`;
        const label = it.treatment_type + (tooth ? ` (${tooth})` : "");
        if (!uniq.has(key)) uniq.set(key, label);
      });

      stageBuckets.forEach((bucket, bucketKey) => {
        const anyCompleted = items.some((it) => {
          if (it.status !== "completed") return false;
          const m = resolveStage(it.treatment_type);
          const tooth = it.tooth_number ? String(it.tooth_number) : "";
          return m && !m.treatmentLevel && m.treatment.key === bucket.treatmentKey && tooth === bucket.tooth;
        });
        const suffix = bucket.tooth ? ` (${bucket.tooth})` : "";
        uniq.set(bucketKey, `${bucket.label}${suffix}${anyCompleted ? " · In Progress" : ""}`);
      });


      const lastVisit = plans
        .map((pl) => pl.updated_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;

      const doctor = pendingItems[0]?.doctor || plans[0]?.doctor || null;

      result.push({
        patient_id: p.id,
        patient_name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        patient_code: p.patient_code ?? null,
        phone: p.phone,
        doctor,
        last_visit: lastVisit,
        pending_count: uniq.size,
        treatments: Array.from(uniq.values()),
      });
    });

    // Latest pending first (most recent last visit at top)
    setRows(result.sort((a, b) => (b.last_visit || "").localeCompare(a.last_visit || "")));
    setLoading(false);
  };

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: endOfDay(now) };
      case "week": return { from: startOfWeek(now), to: endOfWeek(now) };
      case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
      case "custom":
        if (customFrom && customTo) return { from: startOfDay(customFrom), to: endOfDay(customTo) };
        return null;
      default: return null;
    }
  }, [datePreset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (dateRange && r.last_visit) {
        if (!isWithinInterval(new Date(r.last_visit), { start: dateRange.from, end: dateRange.to })) return false;
      } else if (dateRange && !r.last_visit) {
        return false;
      }
      if (treatmentFilter !== "all") {
        const has = r.treatments.some((t) => t.replace(/\s*\(.*\)$/, "").trim().toLowerCase() === treatmentFilter.toLowerCase());
        if (!has) return false;
      }
      if (doctorFilter !== "all") {
        if ((r.doctor || "Unassigned") !== doctorFilter) return false;
      }
      if (!q) return true;
      return (
        r.patient_name.toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        formatPatientCode(r.patient_code).toLowerCase().includes(q) ||
        r.treatments.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [rows, search, dateRange, treatmentFilter, doctorFilter]);

  const treatmentOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.treatments.forEach((t) => {
      const name = t.replace(/\s*\(.*\)$/, "").trim();
      if (name) set.add(name);
    }));
    return Array.from(set).sort();
  }, [rows]);

  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.doctor || "Unassigned"));
    return Array.from(set).sort();
  }, [rows]);

  const agingDays = (iso: string | null) => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  };

  const pagedFiltered = usePagedSlice(filtered, page, pageSize);
  const totalPending = filtered.reduce((s, r) => s + r.pending_count, 0);

  // Top treatments breakdown - count distinct patients per treatment (not per tooth)
  const topTreatments = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const seen = new Set<string>();
      r.treatments.forEach((t) => {
        const key = t.replace(/\s*\(.*\)$/, "").trim() || "Unknown";
        if (seen.has(key)) return;
        seen.add(key);
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  // Top doctors breakdown
  const topDoctors = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const d = r.doctor || "Unassigned";
      map.set(d, (map.get(d) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Clock className="text-warning" /> Pending Treatments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Patients with treatments marked as pending in the workflow.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, treatment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {datePreset === "custom" && (
            <>
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 justify-start gap-2", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon size={14} />
                    {customFrom ? format(customFrom, "dd MMM yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customFrom}
                    onSelect={(d) => {
                      setCustomFrom(d);
                      setFromOpen(false);
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 justify-start gap-2", !customTo && "text-muted-foreground")}>
                    <CalendarIcon size={14} />
                    {customTo ? format(customTo, "dd MMM yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customTo}
                    onSelect={(d) => {
                      setCustomTo(d);
                      setToOpen(false);
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </>
          )}
          <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Treatment" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All Treatments</SelectItem>
              {treatmentOptions.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={doctorFilter} onValueChange={setDoctorFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Doctor" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All Doctors</SelectItem>
              {doctorOptions.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Dashboard - 3 mini cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Users size={14} /> Pending Patients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{filtered.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalPending} treatment(s) pending in total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Activity size={14} /> Top Pending Treatments
            </CardTitle>
            <p className="text-xs text-muted-foreground">Patients per Treatment</p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {topTreatments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data</p>
            ) : (
              topTreatments.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{name}</span>
                  <Badge variant="secondary" className="font-mono">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <UserCog size={14} /> Pending by Doctor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {topDoctors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data</p>
            ) : (
              topDoctors.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{name}</span>
                  <Badge variant="secondary" className="font-mono">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-lg">All Pending Patients</CardTitle>
          {selected.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-1" disabled={deleting}>
                  <Trash2 size={14} /> Delete Selected ({selected.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete pending treatments?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all pending treatment items for {selected.size} selected patient(s). This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deletePatients(Array.from(selected))}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertCircle className="mx-auto mb-2" />
              <p className="text-sm">No pending treatments found.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pagedFiltered.length > 0 && pagedFiltered.every((r) => selected.has(r.patient_id))}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) pagedFiltered.forEach((r) => next.add(r.patient_id));
                          else pagedFiltered.forEach((r) => next.delete(r.patient_id));
                          setSelected(next);
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-28">Aging</TableHead>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Pending Treatments</TableHead>
                    <TableHead className="text-center">Visited</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedFiltered.map((r, idx) => {
                    const days = agingDays(r.last_visit);
                    const ageBadge =
                      days === null
                        ? { cls: "bg-muted text-muted-foreground", label: "—" }
                        : days >= 30
                        ? { cls: "bg-destructive text-destructive-foreground", label: `${days}d` }
                        : days >= 14
                        ? { cls: "bg-warning text-warning-foreground", label: `${days}d` }
                        : { cls: "bg-secondary text-secondary-foreground", label: `${days}d` };
                    return (
                      <TableRow key={r.patient_id} data-state={selected.has(r.patient_id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.patient_id)}
                            onCheckedChange={(c) => {
                              const next = new Set(selected);
                              if (c) next.add(r.patient_id);
                              else next.delete(r.patient_id);
                              setSelected(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(page - 1) * pageSize + idx + 1}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-mono", ageBadge.cls)}>{ageBadge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{formatPatientCode(r.patient_code)}</TableCell>
                        <TableCell className="font-medium">{r.patient_name || "—"}</TableCell>
                        <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                        <TableCell className="text-sm">{r.doctor || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {r.treatments.slice(0, 4).map((t, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">{t}</Badge>
                            ))}
                            {r.treatments.length > 4 && (
                              <Badge variant="outline" className="text-xs">+{r.treatments.length - 4}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">{r.pending_count}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.last_visit ? format(new Date(r.last_visit), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => {
                                const dateStr = r.last_visit ? format(new Date(r.last_visit), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
                                navigate(`/clinic-workflow/${r.patient_id}?step=treatment_plan&date=${dateStr}`);
                              }}
                            >
                              <Stethoscope size={14} /> Open Workflow <ArrowRight size={12} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deleting}>
                                  <Trash2 size={14} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete pending treatments?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove all pending treatment items for {r.patient_name || "this patient"}? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deletePatients([r.patient_id])}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="patients" />
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingTreatments;
