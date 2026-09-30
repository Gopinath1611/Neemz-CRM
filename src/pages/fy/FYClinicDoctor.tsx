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
import { getCurrentFY, formatINR } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter,
} from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

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

function normalizeDoctor(name?: string | null) {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/^dr\.?\s+/i, "");
}

export default function FYClinicDoctor() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const doctor = useFYTable("fy_doctor_targets", fy);
  const { doctorOptions, treatmentOptions } = useClinicMasters();

  // achieved per (doctor|treatment) for the selected period
  const [achieved, setAchieved] = useState<Record<string, { count: number; revenue: number }>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      // Pull completed treatment items in range with their billing revenue
      const { data: items } = await (supabase as any)
        .from("treatment_plan_items")
        .select("doctor, treatment_type, estimated_cost, completed_at, created_at, plan_id")
        .eq("status", "completed");
      if (cancelled) return;
      const map: Record<string, { count: number; revenue: number }> = {};
      (items ?? []).forEach((it: any) => {
        const when = new Date(it.completed_at ?? it.created_at);
        if (isNaN(when.getTime())) return;
        if (when < range.start || when > range.end) return;
        const key = `${normalizeDoctor(it.doctor)}|${(it.treatment_type ?? "").trim().toLowerCase()}`;
        if (!map[key]) map[key] = { count: 0, revenue: 0 };
        map[key].count += 1;
        map[key].revenue += Number(it.estimated_cost ?? 0);
      });
      setAchieved(map);
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  // Build per-period targets list grouped by doctor/treatment
  const periodTargetRows = useMemo(() => {
    const rows = doctor.rows ?? [];
    const month = anchor.getMonth() + 1;
    let useRows: any[] = rows.filter((r: any) => r.month === month);
    let divisor = 1;
    const year = anchor.getFullYear();
    if (period === "daily") { divisor = new Date(year, month, 0).getDate(); }
    else if (period === "weekly") { divisor = 4; }
    else if (period === "quarterly") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      useRows = rows.filter((r: any) => r.month >= qStart && r.month < qStart + 3);
    } else if (period === "yearly") {
      useRows = rows;
    }
    // group by doctor + treatment
    const grouped: Record<string, { doctor_name: string; treatment_type: string; patient_target: number; case_target: number; revenue_target: number; utilization_target: number }> = {};
    useRows.forEach((r: any) => {
      const key = `${normalizeDoctor(r.doctor_name)}|${(r.treatment_type ?? "").trim().toLowerCase()}`;
      if (!grouped[key]) grouped[key] = { doctor_name: r.doctor_name ?? "—", treatment_type: r.treatment_type ?? "—", patient_target: 0, case_target: 0, revenue_target: 0, utilization_target: 0 };
      grouped[key].patient_target += Number(r.patient_target ?? 0);
      grouped[key].case_target += Number(r.case_target ?? 0);
      grouped[key].revenue_target += Number(r.revenue_target ?? 0);
      grouped[key].utilization_target = Math.max(grouped[key].utilization_target, Number(r.utilization_target ?? 0));
    });
    return Object.entries(grouped).map(([key, v]) => ({
      key,
      ...v,
      patient_target: Math.round(v.patient_target / divisor),
      case_target: Math.round(v.case_target / divisor),
      revenue_target: Math.round(v.revenue_target / divisor),
    }));
  }, [doctor.rows, period, anchor]);

  if (!doctor.branchId) return <NoBranchCard />;

  const doctorSelectOptions = doctorOptions.length ? doctorOptions : [{ value: "—", label: "Add doctors in Settings → Clinic → Doctors" }];
  const treatmentSelectOptions = treatmentOptions.length ? treatmentOptions : [{ value: "—", label: "Add treatments in Settings → Clinic → Treatments" }];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="👨‍⚕️ Doctor Target" description="Doctor + Treatment-wise targets — auto-tracked from completed treatments" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from completed treatment items
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
                <Calendar mode="single" selected={anchor} onSelect={(d) => { if (d) { setAnchor(d); setCalOpen(false); } }} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setAnchor(new Date())}>Today</Button>
          </div>
        </CardHeader>
        <CardContent>
          {periodTargetRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No targets set for this period. Add doctor + treatment targets below.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {periodTargetRows.map(r => {
                const ach = achieved[r.key] ?? { count: 0, revenue: 0 };
                const pct = r.case_target > 0 ? Math.min(100, Math.round((ach.count / r.case_target) * 100)) : 0;
                const status = r.case_target === 0 ? "—" : ach.count >= r.case_target ? "achieved" : pct >= 80 ? "on-track" : "behind";
                const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
                return (
                  <div key={r.key} className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{r.doctor_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.treatment_type}</div>
                      </div>
                      <Badge variant={variant as any} className="text-[10px] shrink-0">{status}</Badge>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{ach.count}</span>
                      <span className="text-sm text-muted-foreground">/ {r.case_target} cases</span>
                      <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
                      <div>Revenue: <span className="font-medium text-foreground">{formatINR(ach.revenue)}</span> / {formatINR(r.revenue_target)}</div>
                      <div>Util Target: <span className="font-medium text-foreground">{r.utilization_target}%</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {loadingAch && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      <FYDoctorMonthlySummary fy={fy} rows={doctor.rows} />

      <Card>
        <CardHeader>
          <CardTitle>Manage Doctor Targets</CardTitle>
          <CardDescription>Set monthly targets per doctor + treatment. Doctors & treatments come from Settings → Clinic.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_doctor_targets" fy={fy} rows={doctor.rows} onChanged={doctor.reload}
            title="Doctor + Treatment Targets"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "doctor_name", label: "Doctor", type: "select", options: doctorSelectOptions, required: true, placeholder: "Select doctor" },
              { key: "treatment_type", label: "Treatment", type: "select", options: treatmentSelectOptions, required: true, placeholder: "Select treatment" },
              { key: "patient_target", label: "Patients", type: "number" },
              { key: "case_target", label: "Cases", type: "number" },
              { key: "revenue_target", label: "Revenue", type: "currency" },
              { key: "utilization_target", label: "Utilization %", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ageBucket(dob: string | null | undefined, refDate: Date): "kids" | "adult" | "senior" | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = refDate.getFullYear() - d.getFullYear();
  const m = refDate.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < d.getDate())) age--;
  if (age < 0) return null;
  if (age <= 17) return "kids";
  if (age <= 59) return "adult";
  return "senior";
}

function FYDoctorMonthlySummary({ fy, rows }: { fy: string; rows: any[] }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, Record<string, { count: number; revenue: number }>>>({});
  const [doctorGender, setDoctorGender] = useState<Record<string, { male: number; female: number; other: number }>>({});
  const [doctorAge, setDoctorAge] = useState<Record<string, { kids: number; adult: number; senior: number }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const { data } = await (supabase as any)
        .from("treatment_plan_items")
        .select("doctor, treatment_type, estimated_cost, completed_at, created_at, plan_id, treatment_plans(patient_id, patients(gender, date_of_birth))")
        .eq("status", "completed");
      if (cancelled) return;
      const map: Record<number, Record<string, { count: number; revenue: number }>> = {};
      const gMap: Record<string, { male: number; female: number; other: number }> = {};
      const aMap: Record<string, { kids: number; adult: number; senior: number }> = {};
      FY_MONTH_NUMS.forEach(m => { map[m] = {}; });
      (data ?? []).forEach((it: any) => {
        const d = new Date(it.completed_at ?? it.created_at);
        if (isNaN(d.getTime())) return;
        if (d < start || d > end) return;
        const m = d.getMonth() + 1;
        if (!map[m]) return;
        const docKey = normalizeDoctor(it.doctor) || "—";
        const key = `${docKey}|${(it.treatment_type ?? "").trim().toLowerCase()}`;
        if (!map[m][key]) map[m][key] = { count: 0, revenue: 0 };
        map[m][key].count += 1;
        map[m][key].revenue += Number(it.estimated_cost ?? 0);
        const patient = it.treatment_plans?.patients;
        if (patient) {
          if (!gMap[docKey]) gMap[docKey] = { male: 0, female: 0, other: 0 };
          const g = (patient.gender ?? "").toString().toLowerCase();
          if (g === "male" || g === "m") gMap[docKey].male += 1;
          else if (g === "female" || g === "f") gMap[docKey].female += 1;
          else gMap[docKey].other += 1;
          if (!aMap[docKey]) aMap[docKey] = { kids: 0, adult: 0, senior: 0 };
          const bucket = ageBucket(patient.date_of_birth, d);
          if (bucket) aMap[docKey][bucket] += 1;
        }
      });
      setAchByMonth(map);
      setDoctorGender(gMap);
      setDoctorAge(aMap);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  // Targets aggregated by month (sum of all doctor+treatment combos)
  const targetTotalsByMonth = useMemo(() => {
    const map: Record<number, { cases: number; revenue: number }> = {};
    FY_MONTH_NUMS.forEach(m => { map[m] = { cases: 0, revenue: 0 }; });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      map[r.month].cases += Number(r.case_target ?? 0);
      map[r.month].revenue += Number(r.revenue_target ?? 0);
    });
    return map;
  }, [rows]);

  const achTotalsByMonth = useMemo(() => {
    const map: Record<number, { count: number; revenue: number }> = {};
    FY_MONTH_NUMS.forEach(m => {
      const monthMap = achByMonth[m] ?? {};
      let count = 0; let revenue = 0;
      Object.values(monthMap).forEach(v => { count += v.count; revenue += v.revenue; });
      map[m] = { count, revenue };
    });
    return map;
  }, [achByMonth]);

  const perfData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetTotalsByMonth[m] ?? { cases: 0, revenue: 0 };
    const a = achTotalsByMonth[m] ?? { count: 0, revenue: 0 };
    return {
      month: FY_MONTH_LABELS[i],
      target: t.cases,
      achieved: a.count,
      revenueTarget: t.revenue,
      revenueAchieved: a.revenue,
      pct: t.cases ? Math.round((a.count / t.cases) * 100) : 0,
    };
  }), [targetTotalsByMonth, achTotalsByMonth]);

  // Per-doctor totals across FY
  const doctorTotals = useMemo(() => {
    const map: Record<string, { doctor: string; count: number; revenue: number }> = {};
    Object.values(achByMonth).forEach(monthMap => {
      Object.entries(monthMap).forEach(([key, v]) => {
        const docKey = key.split("|")[0] || "—";
        if (!map[docKey]) map[docKey] = { doctor: docKey || "—", count: 0, revenue: 0 };
        map[docKey].count += v.count;
        map[docKey].revenue += v.revenue;
      });
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [achByMonth]);

  // Per-treatment totals across FY
  const treatmentTotals = useMemo(() => {
    const map: Record<string, { treatment: string; count: number; revenue: number }> = {};
    Object.values(achByMonth).forEach(monthMap => {
      Object.entries(monthMap).forEach(([key, v]) => {
        const tx = key.split("|")[1] || "—";
        if (!map[tx]) map[tx] = { treatment: tx, count: 0, revenue: 0 };
        map[tx].count += v.count;
        map[tx].revenue += v.revenue;
      });
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [achByMonth]);

  const totalTargetCases = useMemo(() => Object.values(targetTotalsByMonth).reduce((s, m) => s + m.cases, 0), [targetTotalsByMonth]);
  const totalAchCases = useMemo(() => Object.values(achTotalsByMonth).reduce((s, m) => s + m.count, 0), [achTotalsByMonth]);
  const totalAchRevenue = useMemo(() => Object.values(achTotalsByMonth).reduce((s, m) => s + m.revenue, 0), [achTotalsByMonth]);
  const overallPct = totalTargetCases ? Math.round((totalAchCases / totalTargetCases) * 100) : 0;
  const bestMonth = useMemo(() => {
    let best = perfData[0];
    perfData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [perfData]);
  const topDoctor = doctorTotals[0];
  const topTreatment = treatmentTotals[0];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Total Cases Achieved</CardDescription><CardTitle className="text-3xl">{totalAchCases}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Target size={12} /> of {totalTargetCases} target</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Overall Achievement</CardDescription><CardTitle className="text-3xl">{overallPct}%</CardTitle></CardHeader>
          <CardContent><Progress value={Math.min(100, overallPct)} className="h-2" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Best Performing Month</CardDescription><CardTitle className="text-3xl">{bestMonth?.month ?? "—"}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {bestMonth?.pct ?? 0}% achieved</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Revenue Achieved</CardDescription><CardTitle className="text-2xl truncate">{formatINR(totalAchRevenue)}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> across all doctors</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Performance — Cases Target vs Achieved</CardTitle>
          <CardDescription>Aggregated across all doctors & treatments</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perfData}>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Doctors</CardTitle>
            <CardDescription>Top: <span className="text-primary font-medium capitalize">{topDoctor?.doctor ?? "—"}</span> · {topDoctor?.count ?? 0} cases · {formatINR(topDoctor?.revenue ?? 0)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={doctorTotals.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="doctor" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" name="Cases" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing Treatments</CardTitle>
            <CardDescription>Top: <span className="text-primary font-medium capitalize">{topTreatment?.treatment ?? "—"}</span> · {topTreatment?.count ?? 0} cases · {formatINR(topTreatment?.revenue ?? 0)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={treatmentTotals.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="treatment" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--accent))" name="Cases" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <DoctorDemographicsCharts doctorGender={doctorGender} doctorAge={doctorAge} />
    </>
  );
}

function DoctorDemographicsCharts({
  doctorGender,
  doctorAge,
}: {
  doctorGender: Record<string, { male: number; female: number; other: number }>;
  doctorAge: Record<string, { kids: number; adult: number; senior: number }>;
}) {
  const genderData = useMemo(() => {
    return Object.entries(doctorGender)
      .map(([doctor, g]) => ({ doctor, male: g.male, female: g.female, other: g.other, total: g.male + g.female + g.other }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [doctorGender]);

  const ageData = useMemo(() => {
    return Object.entries(doctorAge)
      .map(([doctor, a]) => ({ doctor, kids: a.kids, adult: a.adult, senior: a.senior, total: a.kids + a.adult + a.senior }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [doctorAge]);

  const topMaleDoc = useMemo(() => [...genderData].sort((a, b) => b.male - a.male)[0], [genderData]);
  const topFemaleDoc = useMemo(() => [...genderData].sort((a, b) => b.female - a.female)[0], [genderData]);
  const topKidsDoc = useMemo(() => [...ageData].sort((a, b) => b.kids - a.kids)[0], [ageData]);
  const topAdultDoc = useMemo(() => [...ageData].sort((a, b) => b.adult - a.adult)[0], [ageData]);
  const topSeniorDoc = useMemo(() => [...ageData].sort((a, b) => b.senior - a.senior)[0], [ageData]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Doctor × Gender Breakdown</CardTitle>
          <CardDescription>
            Top Male: <span className="text-primary font-medium capitalize">{topMaleDoc?.doctor ?? "—"}</span> ({topMaleDoc?.male ?? 0}) · Top Female: <span className="text-primary font-medium capitalize">{topFemaleDoc?.doctor ?? "—"}</span> ({topFemaleDoc?.female ?? 0})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {genderData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No completed treatments with patient data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={genderData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="doctor" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="male" stackId="g" fill="hsl(var(--primary))" name="Male" />
                <Bar dataKey="female" stackId="g" fill="hsl(var(--accent))" name="Female" />
                <Bar dataKey="other" stackId="g" fill="hsl(var(--muted-foreground))" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctor × Age Category Breakdown</CardTitle>
          <CardDescription>
            Top Kids: <span className="text-primary font-medium capitalize">{topKidsDoc?.doctor ?? "—"}</span> ({topKidsDoc?.kids ?? 0}) · Top Adult: <span className="text-primary font-medium capitalize">{topAdultDoc?.doctor ?? "—"}</span> ({topAdultDoc?.adult ?? 0}) · Top Senior: <span className="text-primary font-medium capitalize">{topSeniorDoc?.doctor ?? "—"}</span> ({topSeniorDoc?.senior ?? 0})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ageData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No completed treatments with patient DOB yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="doctor" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="kids" stackId="a" fill="#f59e0b" name="Kids (0-17)" />
                <Bar dataKey="adult" stackId="a" fill="hsl(var(--primary))" name="Adult (18-59)" />
                <Bar dataKey="senior" stackId="a" fill="hsl(var(--destructive))" name="Senior (60+)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
