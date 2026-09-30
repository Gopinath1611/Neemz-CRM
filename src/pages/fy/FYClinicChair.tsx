import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

const METRICS: { key: string; label: string; targetField: string }[] = [
  { key: "chairs", label: "Total Chairs", targetField: "total_chairs" },
  { key: "working_days", label: "Working Days", targetField: "working_days" },
  { key: "hours_per_day", label: "Hours / Day", targetField: "working_hours_per_day" },
  { key: "available_hours", label: "Available Chair-Hours", targetField: "available_hours" },
  { key: "patient_load", label: "Patient Load", targetField: "expected_patient_load" },
  { key: "utilization", label: "Utilization %", targetField: "target_utilization_percent" },
  { key: "revenue_per_chair", label: "Revenue / Chair", targetField: "expected_revenue_per_chair" },
];

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

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export default function FYClinicChair() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const chair = useFYTable("chair_utilization_projection", fy);
  const [achieved, setAchieved] = useState<Record<string, number>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const startStr = format(range.start, "yyyy-MM-dd");
      const endStr = format(range.end, "yyyy-MM-dd");
      const [apptsRes, billsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, appointment_date, start_time, end_time, status, patient_id")
          .gte("appointment_date", startStr)
          .lte("appointment_date", endStr),
        supabase
          .from("billings")
          .select("total_amount, created_at")
          .gte("created_at", range.start.toISOString())
          .lte("created_at", range.end.toISOString()),
      ]);
      if (cancelled) return;

      const appts = apptsRes.data ?? [];
      const bills = billsRes.data ?? [];
      const uniqueDates = new Set<string>();
      const uniquePatients = new Set<string>();
      let totalChairMinutes = 0;
      appts.forEach((a: any) => {
        if (a.appointment_date) uniqueDates.add(a.appointment_date);
        if (a.patient_id) uniquePatients.add(a.patient_id);
        const sm = timeToMinutes(a.start_time);
        const em = timeToMinutes(a.end_time);
        if (sm !== null && em !== null && em > sm) totalChairMinutes += em - sm;
      });
      const occupiedHours = totalChairMinutes / 60;
      const totalRevenue = bills.reduce((s: number, b: any) => s + Number(b.total_amount ?? 0), 0);

      // Estimate revenue/chair using the latest known total_chairs target if available
      const latestRow = (chair.rows ?? [])[0];
      const totalChairs = Number(latestRow?.total_chairs ?? 1) || 1;
      const revenuePerChair = totalRevenue / totalChairs;

      setAchieved({
        chairs: totalChairs,
        working_days: uniqueDates.size,
        hours_per_day: uniqueDates.size > 0 ? Math.round((occupiedHours / uniqueDates.size) * 10) / 10 : 0,
        available_hours: Math.round(occupiedHours * 10) / 10,
        patient_load: uniquePatients.size,
        utilization: 0, // computed below relative to target
        revenue_per_chair: Math.round(revenuePerChair),
      });
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime(), chair.rows]);

  const periodTargets = useMemo(() => {
    const result: Record<string, number> = {};
    const rows = chair.rows ?? [];
    const month = anchor.getMonth() + 1;
    const year = anchor.getFullYear();
    const monthRows = rows.filter((r: any) => r.month === month);
    const sumField = (rs: any[], f: string) => rs.reduce((s, r) => s + Number(r[f] ?? 0), 0);
    const avgField = (rs: any[], f: string) => rs.length ? sumField(rs, f) / rs.length : 0;
    let useRows: any[] = monthRows;
    let divisor = 1;
    if (period === "daily") {
      useRows = monthRows;
      divisor = new Date(year, month, 0).getDate();
    } else if (period === "weekly") {
      useRows = monthRows;
      divisor = 4;
    } else if (period === "quarterly") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      useRows = rows.filter((r: any) => r.month >= qStart && r.month < qStart + 3);
    } else if (period === "yearly") {
      useRows = rows;
    }
    METRICS.forEach(m => {
      // average per-month metrics, sum cumulative ones
      if (m.key === "chairs" || m.key === "hours_per_day" || m.key === "utilization") {
        result[m.key] = Math.round(avgField(useRows, m.targetField));
      } else {
        const total = sumField(useRows, m.targetField);
        result[m.key] = Math.round(total / divisor);
      }
    });
    return result;
  }, [chair.rows, period, anchor]);

  // compute utilization% achieved = available_hours / (chairs * working_days * hours/day)
  const utilizationAch = useMemo(() => {
    const chairs = achieved.chairs || 1;
    const days = achieved.working_days || 0;
    const hpd = (periodTargets.hours_per_day || 8);
    const capacity = chairs * days * hpd;
    if (!capacity) return 0;
    return Math.round((achieved.available_hours / capacity) * 100);
  }, [achieved, periodTargets]);

  if (!chair.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🪑 Chair Utilization" description="Target vs Achieved — auto-tracked from appointments & billings" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from appointments
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
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}>
              <ChevronLeft size={16} />
            </Button>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 min-w-[220px] justify-start font-medium")}>
                  <CalendarIcon size={14} className="mr-2 opacity-70" />
                  {formatAnchorLabel(period, anchor)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={anchor}
                  onSelect={(d) => { if (d) { setAnchor(d); setCalOpen(false); } }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setAnchor(new Date())}>Today</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {METRICS.map(m => {
              const target = periodTargets[m.key] ?? 0;
              const ach = m.key === "utilization" ? utilizationAch : (achieved[m.key] ?? 0);
              const pct = target > 0 ? Math.min(100, Math.round((ach / target) * 100)) : 0;
              const status = target === 0 ? "—" : ach >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              const fmtVal = (v: number) => m.key === "revenue_per_chair" ? `₹${v.toLocaleString()}` : m.key === "utilization" ? `${v}%` : v;
              return (
                <div key={m.key} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{m.label}</span>
                    <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{fmtVal(ach)}</span>
                    <span className="text-sm text-muted-foreground">/ {fmtVal(target)} target</span>
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

      <FYChairMonthlySummary fy={fy} rows={chair.rows} />

      <Card>
        <CardHeader><CardTitle>Manage Chair Utilization Targets</CardTitle><CardDescription>Plan chair-wise utilization & throughput per month.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="chair_utilization_projection" fy={fy} rows={chair.rows} onChanged={chair.reload}
            title="Monthly Chair Targets"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "total_chairs", label: "Total Chairs", type: "number" },
              { key: "working_days", label: "Working Days", type: "number" },
              { key: "working_hours_per_day", label: "Hours/Day", type: "number" },
              { key: "target_utilization_percent", label: "Utilization %", type: "number" },
              { key: "expected_patient_load", label: "Patient Load", type: "number" },
              { key: "expected_revenue_per_chair", label: "Revenue/Chair", type: "currency" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

const FY_MONTH_LABELS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const FY_MONTH_NUMS = [4,5,6,7,8,9,10,11,12,1,2,3];

function FYChairMonthlySummary({ fy, rows }: { fy: string; rows: any[] }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, { hours: number; days: number; patients: number; revenue: number }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const [apptsRes, billsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("appointment_date, start_time, end_time, patient_id")
          .gte("appointment_date", format(start, "yyyy-MM-dd"))
          .lte("appointment_date", format(end, "yyyy-MM-dd")),
        supabase
          .from("billings")
          .select("total_amount, created_at")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
      ]);
      if (cancelled) return;

      const map: Record<number, { hours: number; days: number; patients: number; revenue: number; _dates: Set<string>; _patients: Set<string> }> = {} as any;
      FY_MONTH_NUMS.forEach(m => { map[m] = { hours: 0, days: 0, patients: 0, revenue: 0, _dates: new Set(), _patients: new Set() } as any; });

      (apptsRes.data ?? []).forEach((a: any) => {
        const d = new Date(a.appointment_date);
        const m = d.getMonth() + 1;
        if (!map[m]) return;
        map[m]._dates.add(a.appointment_date);
        if (a.patient_id) map[m]._patients.add(a.patient_id);
        const sm = timeToMinutes(a.start_time);
        const em = timeToMinutes(a.end_time);
        if (sm !== null && em !== null && em > sm) map[m].hours += (em - sm) / 60;
      });
      (billsRes.data ?? []).forEach((b: any) => {
        const m = new Date(b.created_at).getMonth() + 1;
        if (!map[m]) return;
        map[m].revenue += Number(b.total_amount ?? 0);
      });

      const final: Record<number, { hours: number; days: number; patients: number; revenue: number }> = {};
      FY_MONTH_NUMS.forEach(m => {
        final[m] = {
          hours: Math.round(map[m].hours * 10) / 10,
          days: map[m]._dates.size,
          patients: map[m]._patients.size,
          revenue: Math.round(map[m].revenue),
        };
      });
      setAchByMonth(final);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, any> = {};
    FY_MONTH_NUMS.forEach(m => {
      const r = (rows ?? []).find((x: any) => x.month === m);
      map[m] = {
        chairs: Number(r?.total_chairs ?? 0),
        working_days: Number(r?.working_days ?? 0),
        hours_per_day: Number(r?.working_hours_per_day ?? 0),
        available_hours: Number(r?.available_hours ?? (r ? Number(r.total_chairs ?? 0) * Number(r.working_days ?? 0) * Number(r.working_hours_per_day ?? 0) : 0)),
        patient_load: Number(r?.expected_patient_load ?? 0),
        revenue: Number(r?.expected_revenue_per_chair ?? 0) * Number(r?.total_chairs ?? 0),
      };
    });
    return map;
  }, [rows]);

  const hoursData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.available_hours ?? 0,
    achieved: achByMonth[m]?.hours ?? 0,
    pct: (targetsByMonth[m]?.available_hours ?? 0) > 0 ? Math.round(((achByMonth[m]?.hours ?? 0) / targetsByMonth[m].available_hours) * 100) : 0,
  })), [targetsByMonth, achByMonth]);

  const patientData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.patient_load ?? 0,
    achieved: achByMonth[m]?.patients ?? 0,
  })), [targetsByMonth, achByMonth]);

  const revenueData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.revenue ?? 0,
    achieved: achByMonth[m]?.revenue ?? 0,
  })), [targetsByMonth, achByMonth]);

  const utilData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? {};
    const capacity = (t.chairs || 0) * (t.working_days || 0) * (t.hours_per_day || 0);
    const ach = achByMonth[m]?.hours ?? 0;
    const utilization = capacity > 0 ? Math.round((ach / capacity) * 100) : 0;
    return { month: FY_MONTH_LABELS[i], utilization, target: Number(t?.target_utilization_percent ?? rows?.find((r: any) => r.month === m)?.target_utilization_percent ?? 0) };
  }), [targetsByMonth, achByMonth, rows]);

  const totalAchHours = useMemo(() => hoursData.reduce((s, d) => s + d.achieved, 0), [hoursData]);
  const totalTargetHours = useMemo(() => hoursData.reduce((s, d) => s + d.target, 0), [hoursData]);
  const overallPct = totalTargetHours ? Math.round((totalAchHours / totalTargetHours) * 100) : 0;
  const bestMonth = useMemo(() => {
    let best = hoursData[0];
    hoursData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [hoursData]);
  const totalPatients = useMemo(() => patientData.reduce((s, d) => s + d.achieved, 0), [patientData]);
  const totalRevenue = useMemo(() => revenueData.reduce((s, d) => s + d.achieved, 0), [revenueData]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Chair-Hours Used</CardDescription><CardTitle className="text-3xl">{Math.round(totalAchHours)}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Target size={12} /> of {Math.round(totalTargetHours)} target hrs</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Overall Utilization</CardDescription><CardTitle className="text-3xl">{overallPct}%</CardTitle></CardHeader>
          <CardContent><Progress value={Math.min(100, overallPct)} className="h-2" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Best Performing Month</CardDescription><CardTitle className="text-3xl">{bestMonth?.month ?? "—"}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {bestMonth?.pct ?? 0}% chair utilization</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Patient Load</CardDescription><CardTitle className="text-3xl">{totalPatients}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> ₹{totalRevenue.toLocaleString()} revenue</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Chair-Hours — Target vs Achieved</CardTitle>
          <CardDescription>How many chair-hours were actually utilized vs planned</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hoursData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="target" fill="hsl(var(--muted))" name="Target Hours" radius={[4,4,0,0]} />
              <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved Hours" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Utilization %</CardTitle>
          <CardDescription>Chair utilization percentage achieved per month vs target</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={utilData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} unit="%" />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="target" fill="hsl(var(--muted))" name="Target %" radius={[4,4,0,0]} />
              <Bar dataKey="utilization" fill="#f59e0b" name="Achieved %" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Load by Month</CardTitle>
            <CardDescription>Patients seen per month vs target</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={patientData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="target" fill="hsl(var(--muted))" name="Target" radius={[4,4,0,0]} />
                <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue per Chair by Month</CardTitle>
            <CardDescription>Total revenue achieved vs target (₹)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => `₹${Number(v).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="target" fill="hsl(var(--muted))" name="Target" radius={[4,4,0,0]} />
                <Bar dataKey="achieved" fill="hsl(var(--accent))" name="Achieved" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
