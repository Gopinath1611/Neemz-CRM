import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from "recharts";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

const CATEGORIES: { key: string; label: string; targetField: string; matchers: string[] }[] = [
  { key: "new", label: "New Patients", targetField: "new_patient_target", matchers: ["new", "walk"] },
  { key: "recall", label: "Recall Patients", targetField: "recall_patient_target", matchers: ["recall"] },
  { key: "walk_in", label: "Walk-Ins", targetField: "walk_in_target", matchers: ["walk"] },
  { key: "referral", label: "Referrals", targetField: "referral_target", matchers: ["referral", "refer"] },
  { key: "ad", label: "Ad Patients", targetField: "ad_patient_target", matchers: ["ad", "google", "meta"] },
  { key: "social", label: "Social Media Patients", targetField: "social_media_patient_target", matchers: ["social", "instagram", "facebook", "youtube"] },
  { key: "camp", label: "Offline Camp Patients", targetField: "offline_camp_patient_target", matchers: ["camp", "offline", "school", "college", "corporate"] },
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

function matchCategory(source: string | null | undefined): string | null {
  if (!source) return "walk_in";
  const s = source.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.key === "new") continue;
    if (c.matchers.some(m => s.includes(m))) return c.key;
  }
  return "walk_in";
}

export default function FYClinicPatient() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const patient = useFYTable("fy_patient_targets", fy);
  const [achieved, setAchieved] = useState<Record<string, number>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const { data } = await supabase
        .from("patients")
        .select("id, source, created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());
      if (cancelled) return;
      const counts: Record<string, number> = { new: 0, recall: 0, walk_in: 0, referral: 0, ad: 0, social: 0, camp: 0 };
      (data ?? []).forEach((p: any) => {
        counts.new += 1;
        const c = matchCategory(p.source);
        if (c && c !== "new") counts[c] = (counts[c] ?? 0) + 1;
      });
      setAchieved(counts);
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  const periodTargets = useMemo(() => {
    const result: Record<string, number> = {};
    const rows = patient.rows ?? [];
    const month = anchor.getMonth() + 1;
    const year = anchor.getFullYear();
    const monthRows = rows.filter((r: any) => r.month === month);
    const sumField = (rs: any[], f: string) => rs.reduce((s, r) => s + Number(r[f] ?? 0), 0);
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
    CATEGORIES.forEach(c => {
      const total = sumField(useRows, c.targetField);
      result[c.key] = Math.round(total / divisor);
    });
    return result;
  }, [patient.rows, period, anchor]);

  if (!patient.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🧑 Patient Target" description="Target vs Achieved — auto-tracked from clinic check-ins" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from patient registrations
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
            {CATEGORIES.map(c => {
              const target = periodTargets[c.key] ?? 0;
              const ach = achieved[c.key] ?? 0;
              const pct = target > 0 ? Math.min(100, Math.round((ach / target) * 100)) : 0;
              const status = target === 0 ? "—" : ach >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              return (
                <div key={c.key} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{c.label}</span>
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
          {loadingAch && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      <FYMonthlySummary fy={fy} rows={patient.rows} />

      <Card>
        <CardHeader><CardTitle>Manage Patient Targets</CardTitle><CardDescription>Set monthly targets per source. Achievements track automatically from clinic check-ins.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_patient_targets" fy={fy} rows={patient.rows} onChanged={patient.reload}
            title="Monthly Patient Targets"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "new_patient_target", label: "New Patients", type: "number" },
              { key: "recall_patient_target", label: "Recall", type: "number" },
              { key: "walk_in_target", label: "Walk-Ins", type: "number" },
              { key: "referral_target", label: "Referrals", type: "number" },
              { key: "ad_patient_target", label: "Ad Patients", type: "number" },
              { key: "social_media_patient_target", label: "Social Media", type: "number" },
              { key: "offline_camp_patient_target", label: "Offline Camp", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

const FY_MONTH_LABELS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const FY_MONTH_NUMS = [4,5,6,7,8,9,10,11,12,1,2,3];

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

function FYMonthlySummary({ fy, rows }: { fy: string; rows: any[] }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, Record<string, number>>>({});
  const [genderByMonth, setGenderByMonth] = useState<Record<number, { male: number; female: number; other: number }>>({});
  const [ageByMonth, setAgeByMonth] = useState<Record<number, { kids: number; adult: number; senior: number }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const { data } = await supabase
        .from("patients")
        .select("id, source, gender, date_of_birth, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (cancelled) return;
      const map: Record<number, Record<string, number>> = {};
      const gMap: Record<number, { male: number; female: number; other: number }> = {};
      const aMap: Record<number, { kids: number; adult: number; senior: number }> = {};
      FY_MONTH_NUMS.forEach(m => {
        map[m] = { new: 0, recall: 0, walk_in: 0, referral: 0, ad: 0, social: 0, camp: 0 };
        gMap[m] = { male: 0, female: 0, other: 0 };
        aMap[m] = { kids: 0, adult: 0, senior: 0 };
      });
      (data ?? []).forEach((p: any) => {
        const created = new Date(p.created_at);
        const m = created.getMonth() + 1;
        if (!map[m]) return;
        map[m].new += 1;
        const c = matchCategory(p.source);
        if (c && c !== "new") map[m][c] = (map[m][c] ?? 0) + 1;
        const g = (p.gender ?? "").toString().toLowerCase();
        if (g === "male" || g === "m") gMap[m].male += 1;
        else if (g === "female" || g === "f") gMap[m].female += 1;
        else gMap[m].other += 1;
        const bucket = ageBucket(p.date_of_birth, created);
        if (bucket) aMap[m][bucket] += 1;
      });
      setAchByMonth(map);
      setGenderByMonth(gMap);
      setAgeByMonth(aMap);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    FY_MONTH_NUMS.forEach(m => {
      const r = (rows ?? []).find((x: any) => x.month === m);
      const t: Record<string, number> = {};
      CATEGORIES.forEach(c => { t[c.key] = Number(r?.[c.targetField] ?? 0); });
      map[m] = t;
    });
    return map;
  }, [rows]);

  const perfData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? {};
    const a = achByMonth[m] ?? {};
    const target = (t.new ?? 0);
    const achieved = (a.new ?? 0);
    return { month: FY_MONTH_LABELS[i], target, achieved, pct: target ? Math.round((achieved / target) * 100) : 0 };
  }), [targetsByMonth, achByMonth]);

  const sourceData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const a = achByMonth[m] ?? {};
    const obj: any = { month: FY_MONTH_LABELS[i] };
    CATEGORIES.filter(c => c.key !== "new").forEach(c => { obj[c.key] = a[c.key] ?? 0; });
    return obj;
  }), [achByMonth]);

  const bestMonth = useMemo(() => {
    let best = perfData[0];
    perfData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [perfData]);

  const topSource = useMemo(() => {
    const totals: Record<string, number> = {};
    CATEGORIES.filter(c => c.key !== "new").forEach(c => { totals[c.key] = 0; });
    Object.values(achByMonth).forEach(m => { Object.entries(m).forEach(([k, v]) => { if (k !== "new" && totals[k] !== undefined) totals[k] += v; }); });
    let topKey = ""; let topVal = 0;
    Object.entries(totals).forEach(([k, v]) => { if (v > topVal) { topVal = v; topKey = k; } });
    const cat = CATEGORIES.find(c => c.key === topKey);
    return { label: cat?.label ?? "—", value: topVal };
  }, [achByMonth]);

  const totalAchieved = useMemo(() => Object.values(achByMonth).reduce((s, m) => s + (m.new ?? 0), 0), [achByMonth]);
  const totalTarget = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + (m.new ?? 0), 0), [targetsByMonth]);
  const overallPct = totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0;

  const genderData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const g = genderByMonth[m] ?? { male: 0, female: 0, other: 0 };
    return { month: FY_MONTH_LABELS[i], male: g.male, female: g.female, other: g.other };
  }), [genderByMonth]);

  const ageData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const a = ageByMonth[m] ?? { kids: 0, adult: 0, senior: 0 };
    return { month: FY_MONTH_LABELS[i], kids: a.kids, adult: a.adult, senior: a.senior };
  }), [ageByMonth]);

  const genderTotals = useMemo(() => {
    const t = { male: 0, female: 0, other: 0 };
    Object.values(genderByMonth).forEach(g => { t.male += g.male; t.female += g.female; t.other += g.other; });
    const total = t.male + t.female + t.other;
    const top = t.male >= t.female ? "Male" : "Female";
    return { ...t, total, top };
  }, [genderByMonth]);

  const ageTotals = useMemo(() => {
    const t = { kids: 0, adult: 0, senior: 0 };
    Object.values(ageByMonth).forEach(a => { t.kids += a.kids; t.adult += a.adult; t.senior += a.senior; });
    const entries: [string, number][] = [["Kids (0-17)", t.kids], ["Adult (18-59)", t.adult], ["Senior (60+)", t.senior]];
    entries.sort((a, b) => b[1] - a[1]);
    return { ...t, top: entries[0]?.[0] ?? "—", topVal: entries[0]?.[1] ?? 0 };
  }, [ageByMonth]);

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
          <CardHeader className="pb-2"><CardDescription>Top Lead Source</CardDescription><CardTitle className="text-2xl truncate">{topSource.label}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {topSource.value} patients FY</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Performance — Target vs Achieved</CardTitle>
          <CardDescription>Which month performed best in patient acquisition</CardDescription>
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
          <CardTitle>Lead Source Breakdown by Month</CardTitle>
          <CardDescription>Which source brings the most patients each month</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CATEGORIES.filter(c => c.key !== "new").map((c, i) => (
                <Bar key={c.key} dataKey={c.key} stackId="src" fill={chartColors[i % chartColors.length]} name={c.label} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gender Breakdown by Month</CardTitle>
            <CardDescription>Top performing: <span className="text-primary font-medium">{genderTotals.top}</span> · M {genderTotals.male} · F {genderTotals.female}{genderTotals.other ? ` · Other ${genderTotals.other}` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={genderData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="male" fill="hsl(var(--primary))" name="Male" radius={[4,4,0,0]} />
                <Bar dataKey="female" fill="hsl(var(--accent))" name="Female" radius={[4,4,0,0]} />
                <Bar dataKey="other" fill="hsl(var(--muted-foreground))" name="Other" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Age Category Breakdown by Month</CardTitle>
            <CardDescription>Top bracket: <span className="text-primary font-medium">{ageTotals.top}</span> ({ageTotals.topVal}) · Kids {ageTotals.kids} · Adult {ageTotals.adult} · Senior {ageTotals.senior}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="kids" stackId="age" fill="#f59e0b" name="Kids (0-17)" />
                <Bar dataKey="adult" stackId="age" fill="hsl(var(--primary))" name="Adult (18-59)" />
                <Bar dataKey="senior" stackId="age" fill="hsl(var(--destructive))" name="Senior (60+)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
