import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Stethoscope, UserCog, Users, ClipboardList, TrendingUp, Clock, RefreshCw } from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, differenceInMinutes } from "date-fns";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { DatePreset, resolveDateRange } from "@/components/common/DateRangeFilter";

type Preset = DatePreset;

const fetchData = async () => {
  const [appts, items, plans, patients] = await Promise.all([
    supabase.from("appointments").select("id, patient_id, doctor, assistant, type, status, appointment_date, created_at, checkin_time, checkout_time, start_time, end_time, patients(first_name, last_name, phone, patient_code)"),
    supabase.from("treatment_plan_items").select("id, plan_id, treatment_type, doctor, assistant, status, completed_at, created_at"),
    supabase.from("treatment_plans").select("id, patient_id, doctor"),
    supabase.from("patients").select("id, first_name, last_name, phone"),
  ]);
  return {
    appointments: appts.data || [],
    items: items.data || [],
    plans: plans.data || [],
    patients: patients.data || [],
  };
};

const inRange = (d: any, from: Date | null, to: Date | null) => {
  if (!d) return true;
  if (!from && !to) return true;
  const t = new Date(d).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
};

// Compute appointment duration in minutes from checkin/checkout or start/end times
const apptMinutes = (a: any): number => {
  const parse = (t: string) => {
    if (!t) return null;
    const [h, m, s] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0) + Math.floor((s || 0) / 60);
  };
  const ci = parse(a.checkin_time);
  const co = parse(a.checkout_time);
  if (ci != null && co != null && co > ci) return co - ci;
  const st = parse(a.start_time);
  const et = parse(a.end_time);
  if (st != null && et != null && et > st) return et - st;
  // Fallback: assume 30min per appointment if no time data
  return 30;
};

const fmtHrs = (mins: number) => {
  if (!mins) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

const ProductivityReport = () => {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [selected, setSelected] = useState<{ kind: "doctor" | "assistant"; name: string } | null>(null);
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["productivity-report"],
    queryFn: fetchData,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });
  const [, forceTick] = useState(0);
  // re-render every 30s so the "x seconds ago" label stays fresh
  useEffect(() => {
    const i = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const { from, to } = useMemo(() => resolveDateRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const raw = data || { appointments: [], items: [], plans: [], patients: [] };
  const patientMap = useMemo(() => {
    const m: Record<string, any> = {};
    raw.patients.forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [raw.patients]);
  const planDoctorMap = useMemo(() => {
    const m: Record<string, string> = {};
    raw.plans.forEach((p: any) => { m[p.id] = p.doctor || ""; });
    return m;
  }, [raw.plans]);
  const planPatientMap = useMemo(() => {
    const m: Record<string, string> = {};
    raw.plans.forEach((p: any) => { m[p.id] = p.patient_id || ""; });
    return m;
  }, [raw.plans]);

  const appts = useMemo(
    () => raw.appointments.filter((a: any) => inRange(a.appointment_date || a.created_at, from, to)),
    [raw.appointments, from, to]
  );
  const items = useMemo(
    () => raw.items.filter((i: any) => inRange(i.completed_at || i.created_at, from, to)),
    [raw.items, from, to]
  );

  // Build per-name aggregation
  const buildStats = (kind: "doctor" | "assistant") => {
    const stats: Record<string, {
      name: string;
      patients: Set<string>;
      appointments: number;
      treatments: number;
      totalMinutes: number;
      dailyMinutes: Record<string, number>; // date -> minutes
      treatmentBreakdown: Record<string, number>;
      treatmentMinutes: Record<string, number>; // treatment_type -> minutes
      apptList: any[];
      itemList: any[];
    }> = {};

    const ensure = (name: string) => {
      if (!name) return null;
      if (!stats[name]) stats[name] = {
        name, patients: new Set(), appointments: 0, treatments: 0,
        totalMinutes: 0, dailyMinutes: {},
        treatmentBreakdown: {}, treatmentMinutes: {},
        apptList: [], itemList: [],
      };
      return stats[name];
    };

    // Index appointments by patient+date for treatment-time attribution
    const apptByPatientDate: Record<string, any[]> = {};

    appts.forEach((a: any) => {
      const name = (kind === "doctor" ? a.doctor : a.assistant) || "";
      const s = ensure(name);
      const mins = apptMinutes(a);
      const dateKey = a.appointment_date ? format(new Date(a.appointment_date), "yyyy-MM-dd") : "";
      if (a.patient_id && dateKey) {
        const k = `${a.patient_id}|${dateKey}`;
        (apptByPatientDate[k] ||= []).push(a);
      }
      if (!s) return;
      s.appointments++;
      s.totalMinutes += mins;
      if (dateKey) s.dailyMinutes[dateKey] = (s.dailyMinutes[dateKey] || 0) + mins;
      if (a.patient_id) s.patients.add(a.patient_id);
      s.apptList.push(a);
    });

    // Group items by patient+date so we can split appt minutes evenly across them
    const itemGroups: Record<string, any[]> = {};
    items.forEach((i: any) => {
      const pid = planPatientMap[i.plan_id];
      const dateKey = i.completed_at ? format(new Date(i.completed_at), "yyyy-MM-dd") : "";
      if (pid && dateKey) {
        (itemGroups[`${pid}|${dateKey}`] ||= []).push(i);
      }
    });

    items.forEach((i: any) => {
      let name = (kind === "doctor" ? i.doctor : i.assistant) || "";
      if (kind === "doctor" && !name) name = planDoctorMap[i.plan_id] || "";
      const s = ensure(name);
      if (!s) return;
      s.treatments++;
      const t = i.treatment_type || "Other";
      s.treatmentBreakdown[t] = (s.treatmentBreakdown[t] || 0) + 1;
      const pid = planPatientMap[i.plan_id];
      if (pid) s.patients.add(pid);
      s.itemList.push(i);

      // Attribute time per treatment: use appt for that patient+date, split across items
      const dateKey = i.completed_at ? format(new Date(i.completed_at), "yyyy-MM-dd") : "";
      if (pid && dateKey) {
        const groupKey = `${pid}|${dateKey}`;
        const apptsForDay = apptByPatientDate[groupKey] || [];
        const totalDayMins = apptsForDay.reduce((sum, a) => sum + apptMinutes(a), 0);
        const itemCount = (itemGroups[groupKey] || []).length || 1;
        const perItem = totalDayMins > 0 ? Math.round(totalDayMins / itemCount) : 30; // 30min default
        s.treatmentMinutes[t] = (s.treatmentMinutes[t] || 0) + perItem;
      } else {
        s.treatmentMinutes[t] = (s.treatmentMinutes[t] || 0) + 30;
      }
    });

    return Object.values(stats).sort((a, b) => b.totalMinutes - a.totalMinutes);
  };

  const doctorStats = useMemo(() => buildStats("doctor"), [appts, items, planDoctorMap, planPatientMap]);
  const assistantStats = useMemo(() => buildStats("assistant"), [appts, items, planDoctorMap, planPatientMap]);

  const selectedStats = selected
    ? (selected.kind === "doctor" ? doctorStats : assistantStats).find(s => s.name === selected.name)
    : null;

  const renderCards = (list: ReturnType<typeof buildStats>, kind: "doctor" | "assistant") => {
    if (list.length === 0) {
      return <div className="text-center py-12 text-sm text-muted-foreground">No data for this period</div>;
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map(s => {
          const topTreatments = Object.entries(s.treatmentBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 3);
          return (
            <Card
              key={s.name}
              className="cursor-pointer hover:shadow-lg hover:border-primary/40 transition-all"
              onClick={() => setSelected({ kind, name: s.name })}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  {kind === "doctor"
                    ? <Stethoscope size={16} className="text-primary" />
                    : <UserCog size={16} className="text-accent" />}
                  {s.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
                    <div className="text-lg font-bold flex items-center justify-center gap-1">
                      <Clock size={14} className="text-primary" />{fmtHrs(s.totalMinutes)}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">Productive Hours</div>
                  </div>
                  <div className="p-2 rounded-md bg-secondary/40">
                    <div className="text-lg font-bold">
                      {Object.keys(s.dailyMinutes).length > 0
                        ? fmtHrs(Math.round(s.totalMinutes / Object.keys(s.dailyMinutes).length))
                        : "0h"}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">Avg / Day</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-md bg-secondary/40">
                    <div className="text-base font-bold">{s.patients.size}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Patients</div>
                  </div>
                  <div className="p-2 rounded-md bg-secondary/40">
                    <div className="text-base font-bold">{s.appointments}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Appts</div>
                  </div>
                  <div className="p-2 rounded-md bg-secondary/40">
                    <div className="text-base font-bold">{s.treatments}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Treatments</div>
                  </div>
                </div>
                {topTreatments.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase text-muted-foreground">Top Treatments</div>
                    <div className="flex flex-wrap gap-1">
                      {topTreatments.map(([t, c]) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t} · {c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-full text-xs">View Details →</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            Productivity Report <Activity size={20} className="text-primary" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Doctor & Dental Assistant performance overview</p>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isFetching ? "bg-success animate-ping" : "bg-success/50"}`}></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span className="text-success font-medium">Live</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {isFetching ? "Refreshing…" : dataUpdatedAt ? `Updated ${formatAgo(dataUpdatedAt)}` : "—"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Auto-refresh 15s</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
        <SmartDateFilter
          preset={preset}
          onPresetChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading...</div>
      ) : (
        <Tabs defaultValue="doctor">
          <TabsList>
            <TabsTrigger value="doctor" className="text-xs gap-1.5"><Stethoscope size={14} /> Doctors</TabsTrigger>
            <TabsTrigger value="assistant" className="text-xs gap-1.5"><UserCog size={14} /> Dental Assistants</TabsTrigger>
          </TabsList>
          <TabsContent value="doctor" className="mt-4">{renderCards(doctorStats, "doctor")}</TabsContent>
          <TabsContent value="assistant" className="mt-4">{renderCards(assistantStats, "assistant")}</TabsContent>
        </Tabs>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.kind === "doctor"
                ? <Stethoscope size={18} className="text-primary" />
                : <UserCog size={18} className="text-accent" />}
              {selected?.name} — Detailed Report
            </DialogTitle>
          </DialogHeader>

          {selectedStats && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4 text-center">
                  <Clock size={18} className="mx-auto text-primary mb-1" />
                  <div className="text-2xl font-bold">{fmtHrs(selectedStats.totalMinutes)}</div>
                  <div className="text-xs text-muted-foreground">Total Productive Hours</div>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <Users size={18} className="mx-auto text-primary mb-1" />
                  <div className="text-2xl font-bold">{selectedStats.patients.size}</div>
                  <div className="text-xs text-muted-foreground">Unique Patients</div>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <ClipboardList size={18} className="mx-auto text-accent mb-1" />
                  <div className="text-2xl font-bold">{selectedStats.appointments}</div>
                  <div className="text-xs text-muted-foreground">Appointments</div>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <TrendingUp size={18} className="mx-auto text-success mb-1" />
                  <div className="text-2xl font-bold">{selectedStats.treatments}</div>
                  <div className="text-xs text-muted-foreground">Treatments Done</div>
                </CardContent></Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock size={14} /> Daily Productive Hours</CardTitle></CardHeader>
                <CardContent>
                  {Object.keys(selectedStats.dailyMinutes).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No appointment time data</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2">Date</th><th className="text-right">Hours</th></tr></thead>
                      <tbody>
                        {Object.entries(selectedStats.dailyMinutes).sort((a, b) => b[0].localeCompare(a[0])).map(([d, m]) => (
                          <tr key={d} className="border-b last:border-0">
                            <td className="py-2">{format(new Date(d), "dd MMM yyyy (EEE)")}</td>
                            <td className="text-right font-medium">{fmtHrs(m)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Treatment-wise Hours & Count</CardTitle></CardHeader>
                <CardContent>
                  {Object.keys(selectedStats.treatmentBreakdown).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No treatments in this period</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2">Treatment</th>
                        <th className="text-right">Count</th>
                        <th className="text-right">Hours</th>
                        <th className="text-right">Avg / Treatment</th>
                      </tr></thead>
                      <tbody>
                        {Object.entries(selectedStats.treatmentBreakdown).sort((a, b) => b[1] - a[1]).map(([t, c]) => {
                          const mins = selectedStats.treatmentMinutes[t] || 0;
                          return (
                            <tr key={t} className="border-b last:border-0">
                              <td className="py-2">{t}</td>
                              <td className="text-right font-medium">{c}</td>
                              <td className="text-right font-medium">{fmtHrs(mins)}</td>
                              <td className="text-right text-xs text-muted-foreground">{c > 0 ? fmtHrs(Math.round(mins / c)) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Appointments ({selectedStats.apptList.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {selectedStats.apptList.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-4">No appointments</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground bg-secondary/30">
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left">Patient</th>
                        <th className="text-left">Type</th>
                        <th className="text-left">Status</th>
                      </tr></thead>
                      <tbody>
                        {selectedStats.apptList.slice(0, 50).map((a: any) => {
                          const joinedPatient = Array.isArray(a.patients) ? a.patients[0] : a.patients;
                          const p = joinedPatient || patientMap[a.patient_id];
                          const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
                          return (
                            <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/20">
                              <td className="py-2 px-3 text-xs">{a.appointment_date ? format(new Date(a.appointment_date), "dd MMM yy") : ""}</td>
                              <td className="text-xs">{name}</td>
                              <td className="text-xs">{a.type || ""}</td>
                              <td className="text-xs">{a.status ? <Badge variant="outline" className="text-[10px]">{a.status}</Badge> : null}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductivityReport;
