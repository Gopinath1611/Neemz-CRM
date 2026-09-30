import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Users, CalendarCheck, UserCheck, X, RefreshCw, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from "recharts";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
const FY_MONTH_LABELS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const FY_MONTH_NUMS = [4,5,6,7,8,9,10,11,12,1,2,3];

function getRange(period: Period, anchor: Date) {
  switch (period) {
    case "daily": return { start: startOfDay(anchor), end: endOfDay(anchor) };
    case "weekly": return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) };
    case "monthly": return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "quarterly": return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    case "yearly": return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }
}
function shiftAnchor(period: Period, anchor: Date, dir: 1 | -1) {
  switch (period) {
    case "daily": return addDays(anchor, dir);
    case "weekly": return addWeeks(anchor, dir);
    case "monthly": return addMonths(anchor, dir);
    case "quarterly": return addQuarters(anchor, dir);
    case "yearly": return addYears(anchor, dir);
  }
}
function formatAnchorLabel(period: Period, anchor: Date) {
  switch (period) {
    case "daily": return format(anchor, "EEE, dd MMM yyyy");
    case "weekly": {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      return `${format(s, "dd MMM")} – ${format(e, "dd MMM yyyy")}`;
    }
    case "monthly": return format(anchor, "MMMM yyyy");
    case "quarterly": return `Q${getQuarter(anchor)} ${format(anchor, "yyyy")}`;
    case "yearly": return format(anchor, "yyyy");
  }
}

const COLORS = ["hsl(var(--primary))", "hsl(217 91% 60%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)", "hsl(0 84% 60%)", "hsl(173 58% 39%)", "hsl(45 93% 47%)"];

export default function FYTreatmentTarget() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const tt = useFYTable("fy_treatment_targets" as any, fy);
  const { treatmentOptions } = useClinicMasters();

  const [achByTreatment, setAchByTreatment] = useState<Record<string, any>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const startISO = range.start.toISOString();
      const endISO = range.end.toISOString();

      const [leadsRes, apptRes, planItemsRes] = await Promise.all([
        (supabase as any).from("leads").select("id, treatment_interest, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("appointments").select("id, type, status, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("treatment_plan_items").select("id, treatment_type, status, created_at").gte("created_at", startISO).lte("created_at", endISO),
      ]);

      if (cancelled) return;

      const map: Record<string, any> = {};
      const norm = (s: string) => (s ?? "").toString().trim().toLowerCase();
      const get = (t: string) => {
        if (!map[t]) map[t] = { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 };
        return map[t];
      };

      (leadsRes.data ?? []).forEach((l: any) => {
        const t = norm(l.treatment_interest);
        if (t) get(t).leads += 1;
      });
      (apptRes.data ?? []).forEach((a: any) => {
        const t = norm(a.type);
        if (!t) return;
        const bucket = get(t);
        bucket.appointments += 1;
        const st = norm(a.status);
        if (st === "completed" || st === "checked_in" || st === "checked-in") bucket.checkins += 1;
        if (st === "no_show" || st === "no-show" || st === "noshow") bucket.noShow += 1;
        if (st === "rescheduled" || st === "reschedule") bucket.reschedule += 1;
      });
      (planItemsRes.data ?? []).forEach((p: any) => {
        const t = norm(p.treatment_type);
        if (!t) return;
        if (norm(p.status) === "completed") get(t).treatmentDone += 1;
      });

      setAchByTreatment(map);
      setLoadingAch(false);
    }
    load().catch(() => setLoadingAch(false));
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  const periodTargetsByTreatment = useMemo(() => {
    const rows = tt.rows ?? [];
    const month = anchor.getMonth() + 1;
    const year = anchor.getFullYear();
    const monthRows = rows.filter((r: any) => r.month === month);
    let useRows: any[] = monthRows;
    let divisor = 1;
    if (period === "daily") { useRows = monthRows; divisor = new Date(year, month, 0).getDate(); }
    else if (period === "weekly") { useRows = monthRows; divisor = 4; }
    else if (period === "quarterly") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      useRows = rows.filter((r: any) => r.month >= qStart && r.month < qStart + 3);
    } else if (period === "yearly") useRows = rows;

    const map: Record<string, any> = {};
    useRows.forEach((r: any) => {
      const t = (r.treatment ?? "").toString().trim().toLowerCase();
      if (!t) return;
      if (!map[t]) map[t] = { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0, label: r.treatment };
      map[t].leads += Number(r.leads_target ?? 0);
      map[t].appointments += Number(r.appointments_booked_target ?? 0);
      map[t].checkins += Number(r.checkins_target ?? 0);
      map[t].noShow += Number(r.no_show_target ?? 0);
      map[t].reschedule += Number(r.reschedule_target ?? 0);
      map[t].treatmentDone += Number(r.treatment_done_target ?? 0);
    });
    Object.keys(map).forEach(k => {
      ["leads","appointments","checkins","noShow","reschedule","treatmentDone"].forEach(f => {
        map[k][f] = Math.round(map[k][f] / divisor);
      });
    });
    return map;
  }, [tt.rows, period, anchor]);

  // Aggregate KPIs across all treatments
  const totals = useMemo(() => {
    const t = { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 };
    Object.values(achByTreatment).forEach((v: any) => {
      t.leads += v.leads; t.appointments += v.appointments; t.checkins += v.checkins;
      t.noShow += v.noShow; t.reschedule += v.reschedule; t.treatmentDone += v.treatmentDone;
    });
    return t;
  }, [achByTreatment]);

  const totalTargets = useMemo(() => {
    const t = { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 };
    Object.values(periodTargetsByTreatment).forEach((v: any) => {
      t.leads += v.leads; t.appointments += v.appointments; t.checkins += v.checkins;
      t.noShow += v.noShow; t.reschedule += v.reschedule; t.treatmentDone += v.treatmentDone;
    });
    return t;
  }, [periodTargetsByTreatment]);

  if (!tt.branchId) return <NoBranchCard />;

  const kpis = [
    { key: "leads", label: "Leads", icon: Users, color: "text-blue-600" },
    { key: "appointments", label: "Appt Booked", icon: CalendarCheck, color: "text-indigo-600" },
    { key: "checkins", label: "Check-ins", icon: UserCheck, color: "text-green-600" },
    { key: "noShow", label: "No Show", icon: X, color: "text-red-600" },
    { key: "reschedule", label: "Rescheduled", icon: RefreshCw, color: "text-amber-600" },
    { key: "treatmentDone", label: "Treatment Done", icon: Stethoscope, color: "text-purple-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🦷 Treatment-wise Target" description="Per-treatment lead → appointment → check-in → treatment done funnel" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved (All Treatments)</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from Leads, Appointments & Treatment Plans
              </CardDescription>
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}><ChevronLeft size={16} /></Button>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 min-w-[220px] justify-start font-medium")}>
                  <CalendarIcon size={14} className="mr-2 opacity-70" />
                  {formatAnchorLabel(period, anchor)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={anchor} onSelect={(d) => { if (d) { setAnchor(d); setCalOpen(false); } }} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}><ChevronRight size={16} /></Button>
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setAnchor(new Date())}>Today</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {kpis.map(k => {
              const target = (totalTargets as any)[k.key] ?? 0;
              const achieved = (totals as any)[k.key] ?? 0;
              const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
              const status = target === 0 ? "—" : achieved >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              const Icon = k.icon;
              return (
                <div key={k.key} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm flex items-center gap-2"><Icon className={cn("h-4 w-4", k.color)} />{k.label}</span>
                    <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{achieved}</span>
                    <span className="text-xs text-muted-foreground">/ {target}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </div>
          {loadingAch && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      {/* Per-treatment cards */}
      <Card>
        <CardHeader><CardTitle className="text-base">Per Treatment Breakdown</CardTitle><CardDescription>Target vs achieved for each treatment in selected period</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.keys({ ...periodTargetsByTreatment, ...achByTreatment }).map(tKey => {
              const tgt = periodTargetsByTreatment[tKey] ?? { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 };
              const ach = achByTreatment[tKey] ?? { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 };
              const label = (periodTargetsByTreatment[tKey]?.label) || tKey;
              const donePct = tgt.treatmentDone > 0 ? Math.min(100, Math.round((ach.treatmentDone / tgt.treatmentDone) * 100)) : 0;
              return (
                <div key={tKey} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm capitalize">{label}</span>
                    <Badge variant="outline" className="text-[10px]">{donePct}%</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Leads</span><span className="text-right">{ach.leads} / {tgt.leads}</span>
                    <span className="text-muted-foreground">Appt</span><span className="text-right">{ach.appointments} / {tgt.appointments}</span>
                    <span className="text-muted-foreground">Check-ins</span><span className="text-right">{ach.checkins} / {tgt.checkins}</span>
                    <span className="text-muted-foreground">No Show</span><span className="text-right">{ach.noShow} / {tgt.noShow}</span>
                    <span className="text-muted-foreground">Resched.</span><span className="text-right">{ach.reschedule} / {tgt.reschedule}</span>
                    <span className="text-muted-foreground font-medium">Done</span><span className="text-right font-medium">{ach.treatmentDone} / {tgt.treatmentDone}</span>
                  </div>
                  <Progress value={donePct} className="h-1.5" />
                </div>
              );
            })}
            {Object.keys({ ...periodTargetsByTreatment, ...achByTreatment }).length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-6">No targets set or activity yet for this period.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <FYTreatmentMonthlyCharts fy={fy} rows={tt.rows} />

      <Card>
        <CardHeader><CardTitle>Treatment Targets</CardTitle><CardDescription>Plan monthly leads, appointments, check-ins, no-shows, reschedules & treatment-done targets per treatment.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table={"fy_treatment_targets" as any} fy={fy} rows={tt.rows} onChanged={tt.reload}
            title="Treatment Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "treatment", label: "Treatment", type: "treatment_select" },
              { key: "leads_target", label: "Leads", type: "number" },
              { key: "appointments_booked_target", label: "Appt Booked", type: "number" },
              { key: "checkins_target", label: "Check-ins", type: "number" },
              { key: "no_show_target", label: "No Show", type: "number" },
              { key: "reschedule_target", label: "Rescheduled", type: "number" },
              { key: "treatment_done_target", label: "Treatment Done", type: "number" },
              { key: "responsible_person", label: "Responsible", type: "text" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FYTreatmentMonthlyCharts({ fy, rows }: { fy: string; rows: any[] }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, any>>({});
  const [byTreatmentMonth, setByTreatmentMonth] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [leadsRes, apptRes, planItemsRes] = await Promise.all([
        (supabase as any).from("leads").select("id, treatment_interest, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("appointments").select("id, type, status, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("treatment_plan_items").select("id, treatment_type, status, created_at").gte("created_at", startISO).lte("created_at", endISO),
      ]);
      if (cancelled) return;

      const init: Record<number, any> = {};
      const tInit: Record<number, Record<string, number>> = {};
      FY_MONTH_NUMS.forEach(m => { init[m] = { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 }; tInit[m] = {}; });

      const norm = (s: string) => (s ?? "").toString().trim().toLowerCase();

      (leadsRes.data ?? []).forEach((l: any) => {
        const m = new Date(l.created_at).getMonth() + 1;
        if (!init[m]) return;
        init[m].leads += 1;
        const t = norm(l.treatment_interest);
        if (t) tInit[m][t] = (tInit[m][t] ?? 0) + 1;
      });
      (apptRes.data ?? []).forEach((a: any) => {
        const m = new Date(a.created_at).getMonth() + 1;
        if (!init[m]) return;
        init[m].appointments += 1;
        const st = norm(a.status);
        if (st === "completed" || st === "checked_in") init[m].checkins += 1;
        if (st === "no_show" || st === "noshow") init[m].noShow += 1;
        if (st === "rescheduled") init[m].reschedule += 1;
      });
      (planItemsRes.data ?? []).forEach((p: any) => {
        const m = new Date(p.created_at).getMonth() + 1;
        if (!init[m]) return;
        if (norm(p.status) === "completed") init[m].treatmentDone += 1;
      });

      setAchByMonth(init);
      setByTreatmentMonth(tInit);
    }
    load().catch(() => {});
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, any> = {};
    FY_MONTH_NUMS.forEach(m => { map[m] = { leads: 0, appointments: 0, checkins: 0, noShow: 0, reschedule: 0, treatmentDone: 0 }; });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      map[r.month].leads += Number(r.leads_target ?? 0);
      map[r.month].appointments += Number(r.appointments_booked_target ?? 0);
      map[r.month].checkins += Number(r.checkins_target ?? 0);
      map[r.month].noShow += Number(r.no_show_target ?? 0);
      map[r.month].reschedule += Number(r.reschedule_target ?? 0);
      map[r.month].treatmentDone += Number(r.treatment_done_target ?? 0);
    });
    return map;
  }, [rows]);

  const leadsData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.leads ?? 0,
    achieved: achByMonth[m]?.leads ?? 0,
  })), [targetsByMonth, achByMonth]);

  const funnelData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    Leads: achByMonth[m]?.leads ?? 0,
    Appt: achByMonth[m]?.appointments ?? 0,
    Checkin: achByMonth[m]?.checkins ?? 0,
    Done: achByMonth[m]?.treatmentDone ?? 0,
  })), [achByMonth]);

  const noShowData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    "No Show": achByMonth[m]?.noShow ?? 0,
    "Rescheduled": achByMonth[m]?.reschedule ?? 0,
  })), [achByMonth]);

  const allTreatments = useMemo(() => {
    const s = new Set<string>();
    Object.values(byTreatmentMonth).forEach(o => Object.keys(o).forEach(k => s.add(k)));
    return Array.from(s).slice(0, 8);
  }, [byTreatmentMonth]);

  const treatmentBreakdown = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const obj: any = { month: FY_MONTH_LABELS[i] };
    allTreatments.forEach(t => { obj[t] = byTreatmentMonth[m]?.[t] ?? 0; });
    return obj;
  }), [byTreatmentMonth, allTreatments]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Leads</CardTitle><CardDescription>Target vs achieved leads (all treatments)</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={leadsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="target" fill="hsl(var(--muted-foreground))" name="Target" />
              <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Funnel</CardTitle><CardDescription>Leads → Appt → Check-in → Done</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Leads" fill="hsl(217 91% 60%)" />
              <Bar dataKey="Appt" fill="hsl(38 92% 50%)" />
              <Bar dataKey="Checkin" fill="hsl(142 71% 45%)" />
              <Bar dataKey="Done" fill="hsl(280 65% 60%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Treatment Lead Breakdown</CardTitle><CardDescription>Leads by treatment type per month</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={treatmentBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {allTreatments.map((t, i) => (
                <Bar key={t} dataKey={t} stackId="t" fill={COLORS[i % COLORS.length]} name={t} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">No-Show & Reschedule Trend</CardTitle><CardDescription>Lost vs rescheduled appointments</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={noShowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="No Show" stroke="hsl(0 84% 60%)" strokeWidth={2} />
              <Line type="monotone" dataKey="Rescheduled" stroke="hsl(38 92% 50%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
