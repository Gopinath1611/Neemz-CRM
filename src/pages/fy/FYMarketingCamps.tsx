import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Target, IndianRupee, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY, formatINR } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

const CAMP_TYPES: { key: string; label: string }[] = [
  { key: "school", label: "School" },
  { key: "college", label: "College" },
  { key: "corporate", label: "Corporate" },
  { key: "community", label: "Community" },
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

const FY_MONTH_LABELS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const FY_MONTH_NUMS = [4,5,6,7,8,9,10,11,12,1,2,3];

export default function FYMarketingCamps() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const camps = useFYTable("fy_offline_camp_targets", fy);

  const [achCamps, setAchCamps] = useState<Record<string, number>>({});
  const [achScreenings, setAchScreenings] = useState<Record<string, number>>({});
  const [achConversions, setAchConversions] = useState<Record<string, number>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const { data: campsData } = await supabase
        .from("campaigns")
        .select("id, campaign_type, expected_participants, campaign_date, created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());
      const { data: leadsData } = await supabase
        .from("screening_leads" as any)
        .select("id, campaign_id, status, created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());
      if (cancelled) return;

      const cMap: Record<string, number> = {};
      const sMap: Record<string, number> = {};
      const conv: Record<string, number> = {};
      CAMP_TYPES.forEach(t => { cMap[t.key] = 0; sMap[t.key] = 0; conv[t.key] = 0; });

      const campTypeById: Record<string, string> = {};
      (campsData ?? []).forEach((c: any) => {
        const t = (c.campaign_type ?? "").toString().toLowerCase();
        if (cMap[t] === undefined) return;
        campTypeById[c.id] = t;
        cMap[t] += 1;
      });
      (leadsData ?? []).forEach((l: any) => {
        const t = campTypeById[l.campaign_id];
        if (!t) return;
        sMap[t] += 1;
        if ((l.status ?? "").toString().toLowerCase().includes("convert")) conv[t] += 1;
      });
      setAchCamps(cMap);
      setAchScreenings(sMap);
      setAchConversions(conv);
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  const periodTargets = useMemo(() => {
    const rows = camps.rows ?? [];
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

    const result: Record<string, { camps: number; screenings: number; conversions: number; budget: number; revenue: number }> = {};
    CAMP_TYPES.forEach(t => { result[t.key] = { camps: 0, screenings: 0, conversions: 0, budget: 0, revenue: 0 }; });
    useRows.forEach((r: any) => {
      const k = (r.camp_type ?? "").toString();
      if (!result[k]) return;
      result[k].camps += Number(r.camps_planned ?? 0);
      result[k].screenings += Number(r.expected_screenings ?? 0);
      result[k].conversions += Number(r.expected_conversions ?? 0);
      result[k].budget += Number(r.budget ?? 0);
      result[k].revenue += Number(r.expected_revenue ?? 0);
    });
    CAMP_TYPES.forEach(t => {
      result[t.key].camps = Math.round(result[t.key].camps / divisor);
      result[t.key].screenings = Math.round(result[t.key].screenings / divisor);
      result[t.key].conversions = Math.round(result[t.key].conversions / divisor);
      result[t.key].budget = Math.round(result[t.key].budget / divisor);
      result[t.key].revenue = Math.round(result[t.key].revenue / divisor);
    });
    return result;
  }, [camps.rows, period, anchor]);

  if (!camps.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🏕️ Offline Camp Target" description="Camps, screenings, conversions & revenue — auto-tracked from offline campaigns" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from camp activity
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
          <div className="grid gap-3 md:grid-cols-2">
            {CAMP_TYPES.map(t => {
              const tgt = periodTargets[t.key];
              const ach = achCamps[t.key] ?? 0;
              const target = tgt.camps;
              const pct = target > 0 ? Math.min(100, Math.round((ach / target) * 100)) : 0;
              const status = target === 0 ? "—" : ach >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              return (
                <div key={t.key} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{t.label}</span>
                    <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{ach}</span>
                    <span className="text-sm text-muted-foreground">/ {target} camps</span>
                    <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>Screenings: {achScreenings[t.key] ?? 0}/{tgt.screenings}</span>
                    <span>Conv: {achConversions[t.key] ?? 0}/{tgt.conversions}</span>
                    <span>Budget: {formatINR(tgt.budget)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {loadingAch && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      <FYCampsMonthlySummary fy={fy} rows={camps.rows} />

      <Card>
        <CardHeader><CardTitle>Offline Camp Targets</CardTitle><CardDescription>Plan school/college/corporate camps.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_offline_camp_targets" fy={fy} rows={camps.rows} onChanged={camps.reload}
            title="Offline Camp Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "camp_type", label: "Camp Type", type: "select", manageableKey: "camp_types", options: [
                { value: "school", label: "School" }, { value: "college", label: "College" },
                { value: "corporate", label: "Corporate" }, { value: "community", label: "Community" }] },
              { key: "camps_planned", label: "Camps Planned", type: "number" },
              { key: "expected_screenings", label: "Screenings", type: "number" },
              { key: "expected_conversions", label: "Conversions", type: "number" },
              { key: "budget", label: "Budget", type: "currency" },
              { key: "expected_revenue", label: "Expected Revenue", type: "currency" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FYCampsMonthlySummary({ fy, rows }: { fy: string; rows: any[] }) {
  const [campsByMonth, setCampsByMonth] = useState<Record<number, Record<string, number>>>({});
  const [screeningsByMonth, setScreeningsByMonth] = useState<Record<number, Record<string, number>>>({});
  const [conversionsByMonth, setConversionsByMonth] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const { data: campsData } = await supabase
        .from("campaigns")
        .select("id, campaign_type, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      const { data: leadsData } = await supabase
        .from("screening_leads" as any)
        .select("id, campaign_id, status, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (cancelled) return;

      const init = () => {
        const m: Record<number, Record<string, number>> = {};
        FY_MONTH_NUMS.forEach(mo => {
          const z: Record<string, number> = {};
          CAMP_TYPES.forEach(p => { z[p.key] = 0; });
          m[mo] = { ...z };
        });
        return m;
      };
      const cMap = init();
      const sMap = init();
      const conv = init();
      const campMeta: Record<string, { type: string }> = {};

      (campsData ?? []).forEach((c: any) => {
        const m = new Date(c.created_at).getMonth() + 1;
        const t = (c.campaign_type ?? "").toString().toLowerCase();
        if (!cMap[m] || cMap[m][t] === undefined) return;
        campMeta[c.id] = { type: t };
        cMap[m][t] += 1;
      });
      (leadsData ?? []).forEach((l: any) => {
        const meta = campMeta[l.campaign_id];
        if (!meta) return;
        const m = new Date(l.created_at).getMonth() + 1;
        if (!sMap[m] || sMap[m][meta.type] === undefined) return;
        sMap[m][meta.type] += 1;
        if ((l.status ?? "").toString().toLowerCase().includes("convert")) conv[m][meta.type] += 1;
      });

      setCampsByMonth(cMap);
      setScreeningsByMonth(sMap);
      setConversionsByMonth(conv);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, { camps: number; screenings: number; conversions: number; budget: number; revenue: number }> = {};
    FY_MONTH_NUMS.forEach(m => { map[m] = { camps: 0, screenings: 0, conversions: 0, budget: 0, revenue: 0 }; });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      map[r.month].camps += Number(r.camps_planned ?? 0);
      map[r.month].screenings += Number(r.expected_screenings ?? 0);
      map[r.month].conversions += Number(r.expected_conversions ?? 0);
      map[r.month].budget += Number(r.budget ?? 0);
      map[r.month].revenue += Number(r.expected_revenue ?? 0);
    });
    return map;
  }, [rows]);

  const perfData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? { camps: 0 };
    const ach = Object.values(campsByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    return { month: FY_MONTH_LABELS[i], target: t.camps, achieved: ach, pct: t.camps ? Math.round((ach / t.camps) * 100) : 0 };
  }), [targetsByMonth, campsByMonth]);

  const typeData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const obj: any = { month: FY_MONTH_LABELS[i] };
    CAMP_TYPES.forEach(p => { obj[p.key] = campsByMonth[m]?.[p.key] ?? 0; });
    return obj;
  }), [campsByMonth]);

  const funnelData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? { screenings: 0, conversions: 0 };
    const sAch = Object.values(screeningsByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    const cAch = Object.values(conversionsByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    return { month: FY_MONTH_LABELS[i], screeningsTarget: t.screenings, screeningsAch: sAch, conversionsTarget: t.conversions, conversionsAch: cAch };
  }), [targetsByMonth, screeningsByMonth, conversionsByMonth]);

  const revenueData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? { budget: 0, revenue: 0 };
    return { month: FY_MONTH_LABELS[i], budget: t.budget, revenue: t.revenue };
  }), [targetsByMonth]);

  const totalAchieved = useMemo(() => Object.values(campsByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [campsByMonth]);
  const totalTarget = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.camps, 0), [targetsByMonth]);
  const totalScreeningsAch = useMemo(() => Object.values(screeningsByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [screeningsByMonth]);
  const totalScreeningsTgt = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.screenings, 0), [targetsByMonth]);
  const totalConvAch = useMemo(() => Object.values(conversionsByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [conversionsByMonth]);
  const totalBudget = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.budget, 0), [targetsByMonth]);
  const totalRevenue = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.revenue, 0), [targetsByMonth]);
  const overallPct = totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const expectedROI = totalBudget ? +(totalRevenue / totalBudget).toFixed(2) : 0;

  const bestMonth = useMemo(() => {
    let best = perfData[0];
    perfData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [perfData]);

  const topType = useMemo(() => {
    const totals: Record<string, number> = {};
    CAMP_TYPES.forEach(p => { totals[p.key] = 0; });
    Object.values(campsByMonth).forEach(m => Object.entries(m).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + v; }));
    let topKey = ""; let topVal = 0;
    Object.entries(totals).forEach(([k, v]) => { if (v > topVal) { topVal = v; topKey = k; } });
    return { label: CAMP_TYPES.find(p => p.key === topKey)?.label ?? "—", value: topVal };
  }, [campsByMonth]);

  const chartColors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--ring))"];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Total Camps Achieved</CardDescription><CardTitle className="text-3xl">{totalAchieved}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Target size={12} /> of {totalTarget} target ({overallPct}%)</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Screenings Achieved</CardDescription><CardTitle className="text-2xl">{totalScreeningsAch.toLocaleString()}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Users size={12} /> of {totalScreeningsTgt.toLocaleString()} target</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Camp Budget</CardDescription><CardTitle className="text-2xl">{formatINR(totalBudget)}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><IndianRupee size={12} /> Expected: {formatINR(totalRevenue)} ({expectedROI}x)</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Top Camp Type</CardDescription><CardTitle className="text-2xl truncate">{topType.label}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {topType.value} camps · {totalConvAch} conversions</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Performance — Target vs Achieved Camps</CardTitle>
          <CardDescription>Best performing month: <span className="text-primary font-medium">{bestMonth?.month ?? "—"}</span> ({bestMonth?.pct ?? 0}%)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="target" fill="hsl(var(--muted))" name="Target Camps" radius={[4,4,0,0]} />
              <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved Camps" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Camp Type Breakdown by Month</CardTitle>
          <CardDescription>Which camp type was most active each month</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={typeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CAMP_TYPES.map((p, i) => (
                <Bar key={p.key} dataKey={p.key} stackId="ct" fill={chartColors[i % chartColors.length]} name={p.label} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Screenings & Conversions Funnel</CardTitle>
            <CardDescription>Target vs achieved across the FY</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="screeningsTarget" fill="hsl(var(--muted))" name="Screenings Target" radius={[4,4,0,0]} />
                <Bar dataKey="screeningsAch" fill="hsl(var(--primary))" name="Screenings Achieved" radius={[4,4,0,0]} />
                <Bar dataKey="conversionsTarget" fill="hsl(var(--accent))" name="Conversions Target" radius={[4,4,0,0]} />
                <Bar dataKey="conversionsAch" fill="hsl(var(--destructive))" name="Conversions Achieved" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget vs Expected Revenue</CardTitle>
            <CardDescription>Monthly camp spend vs revenue projection</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatINR(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="budget" fill="hsl(var(--muted))" name="Budget" radius={[4,4,0,0]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Expected Revenue" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
