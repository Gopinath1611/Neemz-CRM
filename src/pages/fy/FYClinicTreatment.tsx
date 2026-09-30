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

function genderKey(g: string | null | undefined): "male" | "female" | "other" {
  const v = (g ?? "").toString().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return "other";
}

export default function FYClinicTreatment() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const treatment = useFYTable("fy_treatment_targets", fy);
  const [treatmentOptions, setTreatmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [achieved, setAchieved] = useState<Record<string, number>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clinic_treatments")
        .select("name")
        .eq("is_active", true)
        .order("name");
      setTreatmentOptions((data ?? []).map((t: any) => ({ value: t.name, label: t.name })));
    })();
  }, []);

  // Period achieved counts — sourced from billed treatments (billing_items joined with paid billings)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const { data } = await supabase
        .from("billing_items")
        .select("treatment_type, quantity, billings!inner(payment_status, created_at)")
        .in("billings.payment_status", ["paid", "partial"])
        .gte("billings.created_at", range.start.toISOString())
        .lte("billings.created_at", range.end.toISOString());
      if (cancelled) return;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((t: any) => {
        const key = (t.treatment_type ?? "").trim();
        if (!key) return;
        counts[key] = (counts[key] ?? 0) + Number(t.quantity ?? 1);
      });
      setAchieved(counts);
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  // Targets aggregated for current period
  const periodTargets = useMemo(() => {
    const result: Record<string, number> = {};
    const rows = treatment.rows ?? [];
    const month = anchor.getMonth() + 1;
    const year = anchor.getFullYear();
    let useRows: any[] = rows.filter((r: any) => r.month === month);
    let divisor = 1;
    if (period === "daily") {
      divisor = new Date(year, month, 0).getDate();
    } else if (period === "weekly") {
      divisor = 4;
    } else if (period === "quarterly") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      useRows = rows.filter((r: any) => r.month >= qStart && r.month < qStart + 3);
    } else if (period === "yearly") {
      useRows = rows;
    }
    useRows.forEach((r: any) => {
      const name = (r.treatment_name ?? "").trim();
      if (!name) return;
      result[name] = (result[name] ?? 0) + Number(r.case_count_target ?? 0);
    });
    Object.keys(result).forEach(k => { result[k] = Math.round(result[k] / divisor); });
    return result;
  }, [treatment.rows, period, anchor]);

  const treatmentList = useMemo(() => {
    const set = new Set<string>();
    Object.keys(periodTargets).forEach(k => set.add(k));
    Object.keys(achieved).forEach(k => set.add(k));
    return Array.from(set).sort();
  }, [periodTargets, achieved]);

  if (!treatment.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🦷 Treatment Target" description="Target vs Achieved — auto-tracked from completed treatments" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from completed treatments
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
          {treatmentList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No treatment targets or completions found for this period.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {treatmentList.map(name => {
                const target = periodTargets[name] ?? 0;
                const ach = achieved[name] ?? 0;
                const pct = target > 0 ? Math.min(100, Math.round((ach / target) * 100)) : 0;
                const status = target === 0 ? "—" : ach >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
                const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
                return (
                  <div key={name} className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{name}</span>
                      <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{ach}</span>
                      <span className="text-sm text-muted-foreground">/ {target} target</span>
                      <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
          {loadingAch && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      <FYTreatmentSummary fy={fy} rows={treatment.rows} />

      <Card>
        <CardHeader><CardTitle>Manage Treatment Targets</CardTitle><CardDescription>Plan targets per treatment type. Treatments are pulled from Settings → Clinic → Treatments.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_treatment_targets" fy={fy} rows={treatment.rows} onChanged={treatment.reload}
            title="Treatment-wise Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "treatment_name", label: "Treatment", type: "select", required: true, options: treatmentOptions, placeholder: "Select treatment" },
              { key: "case_count_target", label: "Case Count", type: "number" },
              { key: "revenue_target", label: "Revenue", type: "currency" },
              { key: "avg_case_value", label: "Avg Case Value", type: "currency" },
              { key: "conversion_target", label: "Conversion %", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FYTreatmentSummary({ fy, rows }: { fy: string; rows: any[] }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, Record<string, number>>>({});
  const [genderByTreatment, setGenderByTreatment] = useState<Record<string, { male: number; female: number; other: number }>>({});
  const [ageByTreatment, setAgeByTreatment] = useState<Record<string, { kids: number; adult: number; senior: number }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const { data } = await supabase
        .from("billing_items")
        .select("treatment_type, quantity, billings!inner(payment_status, created_at, patients!inner(gender, date_of_birth))")
        .in("billings.payment_status", ["paid", "partial"])
        .gte("billings.created_at", start.toISOString())
        .lte("billings.created_at", end.toISOString());
      if (cancelled) return;
      const monthMap: Record<number, Record<string, number>> = {};
      const gMap: Record<string, { male: number; female: number; other: number }> = {};
      const aMap: Record<string, { kids: number; adult: number; senior: number }> = {};
      FY_MONTH_NUMS.forEach(m => { monthMap[m] = {}; });
      (data ?? []).forEach((t: any) => {
        const tname = (t.treatment_type ?? "").trim();
        const billedAt = t.billings?.created_at;
        if (!tname || !billedAt) return;
        const completed = new Date(billedAt);
        const m = completed.getMonth() + 1;
        const qty = Number(t.quantity ?? 1);
        if (monthMap[m]) {
          monthMap[m][tname] = (monthMap[m][tname] ?? 0) + qty;
        }
        const patient = t.billings?.patients;
        if (!gMap[tname]) gMap[tname] = { male: 0, female: 0, other: 0 };
        if (!aMap[tname]) aMap[tname] = { kids: 0, adult: 0, senior: 0 };
        if (patient) {
          gMap[tname][genderKey(patient.gender)] += qty;
          const bucket = ageBucket(patient.date_of_birth, completed);
          if (bucket) aMap[tname][bucket] += qty;
        }
      });
      setAchByMonth(monthMap);
      setGenderByTreatment(gMap);
      setAgeByTreatment(aMap);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    FY_MONTH_NUMS.forEach(m => {
      const monthRows = (rows ?? []).filter((r: any) => r.month === m);
      const t: Record<string, number> = {};
      monthRows.forEach((r: any) => {
        const name = (r.treatment_name ?? "").trim();
        if (!name) return;
        t[name] = (t[name] ?? 0) + Number(r.case_count_target ?? 0);
      });
      map[m] = t;
    });
    return map;
  }, [rows]);

  // Performance per month (totals)
  const perfData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? {};
    const a = achByMonth[m] ?? {};
    const target = Object.values(t).reduce((s: number, v: any) => s + Number(v ?? 0), 0);
    const achieved = Object.values(a).reduce((s: number, v: any) => s + Number(v ?? 0), 0);
    return { month: FY_MONTH_LABELS[i], target, achieved, pct: target ? Math.round((achieved / target) * 100) : 0 };
  }), [targetsByMonth, achByMonth]);

  // Treatment breakdown stacked per month (top 6 treatments by total)
  const allTreatments = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.values(achByMonth).forEach(m => Object.entries(m).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + (v as number); }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [achByMonth]);

  const topTreatments = useMemo(() => allTreatments.slice(0, 6), [allTreatments]);

  const treatmentMonthData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const a = achByMonth[m] ?? {};
    const obj: any = { month: FY_MONTH_LABELS[i] };
    topTreatments.forEach(tn => { obj[tn] = a[tn] ?? 0; });
    return obj;
  }), [achByMonth, topTreatments]);

  // Gender vs treatment data
  const genderTreatmentData = useMemo(() => topTreatments.map(tn => {
    const g = genderByTreatment[tn] ?? { male: 0, female: 0, other: 0 };
    return { treatment: tn, male: g.male, female: g.female, other: g.other };
  }), [topTreatments, genderByTreatment]);

  // Age vs treatment data
  const ageTreatmentData = useMemo(() => topTreatments.map(tn => {
    const a = ageByTreatment[tn] ?? { kids: 0, adult: 0, senior: 0 };
    return { treatment: tn, kids: a.kids, adult: a.adult, senior: a.senior };
  }), [topTreatments, ageByTreatment]);

  const bestMonth = useMemo(() => {
    let best = perfData[0];
    perfData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [perfData]);

  const topTreatment = useMemo(() => {
    return { name: allTreatments[0] ?? "—", value: allTreatments[0] ? Object.values(achByMonth).reduce((s, m) => s + (m[allTreatments[0]] ?? 0), 0) : 0 };
  }, [allTreatments, achByMonth]);

  const totalAchieved = useMemo(() => perfData.reduce((s, d) => s + d.achieved, 0), [perfData]);
  const totalTarget = useMemo(() => perfData.reduce((s, d) => s + d.target, 0), [perfData]);
  const overallPct = totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0;

  const chartColors = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))", "hsl(var(--ring))"];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Total Achieved</CardDescription><CardTitle className="text-3xl">{totalAchieved}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Target size={12} /> of {totalTarget} target</div></CardContent>
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
          <CardHeader className="pb-2"><CardDescription>Top Treatment</CardDescription><CardTitle className="text-2xl truncate">{topTreatment.name}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {topTreatment.value} cases FY</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Performance — Target vs Achieved</CardTitle>
          <CardDescription>Which month performed best in treatment delivery</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Treatment Breakdown by Month</CardTitle>
          <CardDescription>Top {topTreatments.length} treatments — which treatment dominates each month</CardDescription>
        </CardHeader>
        <CardContent>
          {topTreatments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed treatments yet for this FY.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={treatmentMonthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topTreatments.map((tn, i) => (
                  <Bar key={tn} dataKey={tn} stackId="tx" fill={chartColors[i % chartColors.length]} name={tn} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Treatment vs Gender</CardTitle>
            <CardDescription>Which gender takes which treatment more</CardDescription>
          </CardHeader>
          <CardContent>
            {topTreatments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={genderTreatmentData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis type="category" dataKey="treatment" stroke="hsl(var(--muted-foreground))" fontSize={11} width={110} />
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
            <CardTitle>Treatment vs Age Category</CardTitle>
            <CardDescription>
              Kids (0-17): {ageTreatmentData.reduce((s, d) => s + d.kids, 0)} · Adult (18-59): {ageTreatmentData.reduce((s, d) => s + d.adult, 0)} · Senior (60+): {ageTreatmentData.reduce((s, d) => s + d.senior, 0)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topTreatments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ageTreatmentData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis type="category" dataKey="treatment" stroke="hsl(var(--muted-foreground))" fontSize={11} width={110} />
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
    </>
  );
}
