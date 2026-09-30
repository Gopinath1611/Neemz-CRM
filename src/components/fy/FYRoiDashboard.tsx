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
import { formatINR } from "@/lib/fyProjection";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter,
} from "date-fns";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line,
} from "recharts";

export type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface FYRoiCategory {
  /** Stable key — must match the value stored in the targets table category field (e.g. platform / treatment / camp_type). */
  key: string;
  /** Display label in cards & charts. */
  label: string;
}

/**
 * Per-category aggregated actuals for a given range.
 * Any subset of fields can be returned — missing ones are treated as 0.
 */
export interface RangeActuals {
  /** Spend / cost incurred in the range (₹). */
  spend?: Record<string, number>;
  /** Revenue earned (₹). */
  revenue?: Record<string, number>;
  /** Lead / participant count. */
  leads?: Record<string, number>;
  /** Converted / closed count. */
  conversions?: Record<string, number>;
}

export type RangeActualsFetcher = (
  start: Date,
  end: Date,
  categories: FYRoiCategory[],
) => Promise<RangeActuals>;

export type MonthlyActualsFetcher = (
  fy: string,
  categories: FYRoiCategory[],
) => Promise<{
  spend: Record<number, Record<string, number>>;
  revenue: Record<number, Record<string, number>>;
  leads?: Record<number, Record<string, number>>;
  conversions?: Record<number, Record<string, number>>;
}>;

export interface FYRoiDashboardProps {
  rows: any[];
  fy: string;
  categoryField: string;
  spendField: string;
  revenueField: string;
  leadsField?: string;
  conversionsField?: string;
  categories: FYRoiCategory[];
  primaryMetricLabel?: string;
  fetchRangeActuals: RangeActualsFetcher;
  fetchMonthlyActuals: MonthlyActualsFetcher;
  /** When true, show a category filter dropdown that scopes Target vs Achieved cards & per-category charts. */
  enableCategoryFilter?: boolean;
  /** Label for the category filter (e.g. "Treatment", "Platform"). */
  categoryFilterLabel?: string;
}

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

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
  "hsl(var(--ring))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--secondary))",
  "#f59e0b",
  "#10b981",
];

export default function FYRoiDashboard({
  rows, fy,
  categoryField, spendField, revenueField, leadsField, conversionsField,
  categories,
  primaryMetricLabel = "Revenue",
  fetchRangeActuals, fetchMonthlyActuals,
  enableCategoryFilter = false,
  categoryFilterLabel = "Category",
}: FYRoiDashboardProps) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [actuals, setActuals] = useState<RangeActuals>({ spend: {}, revenue: {}, leads: {}, conversions: {} });
  const [loading, setLoading] = useState(false);
  const [filterKey, setFilterKey] = useState<string>("__all__");

  // When the available categories change, drop a stale filter selection.
  useEffect(() => {
    if (filterKey !== "__all__" && !categories.some(c => c.key === filterKey)) {
      setFilterKey("__all__");
    }
  }, [categories, filterKey]);

  const visibleCategories = useMemo(
    () => (filterKey === "__all__" ? categories : categories.filter(c => c.key === filterKey)),
    [categories, filterKey],
  );

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const a = await fetchRangeActuals(range.start, range.end, categories);
        if (!cancelled) setActuals(a ?? {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), fy]);

  // Compute period-scaled targets per category
  const periodTargets = useMemo(() => {
    const monthRows = (rows ?? []).filter((r: any) => r.month === anchor.getMonth() + 1);
    let useRows: any[] = monthRows;
    let divisor = 1;
    if (period === "daily") {
      divisor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    } else if (period === "weekly") {
      divisor = 4;
    } else if (period === "quarterly") {
      const m = anchor.getMonth() + 1;
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      useRows = (rows ?? []).filter((r: any) => r.month >= qStart && r.month < qStart + 3);
    } else if (period === "yearly") {
      useRows = rows ?? [];
    }
    const result: Record<string, { spend: number; revenue: number; leads: number; conversions: number }> = {};
    categories.forEach(c => { result[c.key] = { spend: 0, revenue: 0, leads: 0, conversions: 0 }; });
    useRows.forEach((r: any) => {
      const k = (r[categoryField] ?? "").toString();
      if (!result[k]) return;
      result[k].spend += Number(r[spendField] ?? 0);
      result[k].revenue += Number(r[revenueField] ?? 0);
      if (leadsField) result[k].leads += Number(r[leadsField] ?? 0);
      if (conversionsField) result[k].conversions += Number(r[conversionsField] ?? 0);
    });
    Object.keys(result).forEach(k => {
      result[k].spend = Math.round(result[k].spend / divisor);
      result[k].revenue = Math.round(result[k].revenue / divisor);
      result[k].leads = Math.round(result[k].leads / divisor);
      result[k].conversions = Math.round(result[k].conversions / divisor);
    });
    return result;
  }, [rows, anchor, period, categoryField, spendField, revenueField, leadsField, conversionsField, categories]);

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-tracked actuals
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
          <div className="flex items-center gap-2 flex-wrap">
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
            {enableCategoryFilter && categories.length > 0 && (
              <Select value={filterKey} onValueChange={setFilterKey}>
                <SelectTrigger className="h-9 w-56 ml-auto">
                  <SelectValue placeholder={`Filter by ${categoryFilterLabel}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All {categoryFilterLabel}s</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className={cn("grid gap-3", visibleCategories.length === 1 ? "md:grid-cols-1" : "md:grid-cols-2")}>
            {visibleCategories.map(c => {
              const t = periodTargets[c.key];
              const achRevenue = actuals.revenue?.[c.key] ?? 0;
              const achSpend = actuals.spend?.[c.key] ?? 0;
              const target = t.revenue;
              const pct = target > 0 ? Math.min(100, Math.round((achRevenue / target) * 100)) : 0;
              const status = target === 0 ? "—" : achRevenue >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              const targetROI = t.spend > 0 ? +(t.revenue / t.spend).toFixed(2) : 0;
              const actualROI = achSpend > 0 ? +(achRevenue / achSpend).toFixed(2) : 0;
              return (
                <div key={c.key} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{c.label}</span>
                    <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{formatINR(achRevenue)}</span>
                    <span className="text-sm text-muted-foreground">/ {formatINR(target)} {primaryMetricLabel.toLowerCase()}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>Spend: {formatINR(achSpend)} / {formatINR(t.spend)}</span>
                    <span>ROI {actualROI}x · target {targetROI}x</span>
                  </div>
                </div>
              );
            })}
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      <FYRoiMonthlySummary
        fy={fy}
        rows={rows}
        categoryField={categoryField}
        spendField={spendField}
        revenueField={revenueField}
        categories={categories}
        displayCategories={visibleCategories}
        primaryMetricLabel={primaryMetricLabel}
        fetchMonthlyActuals={fetchMonthlyActuals}
      />
    </>
  );
}

function FYRoiMonthlySummary({
  fy, rows, categoryField, spendField, revenueField, categories, displayCategories, primaryMetricLabel, fetchMonthlyActuals,
}: {
  fy: string;
  rows: any[];
  categoryField: string;
  spendField: string;
  revenueField: string;
  categories: FYRoiCategory[];
  displayCategories: FYRoiCategory[];
  primaryMetricLabel: string;
  fetchMonthlyActuals: MonthlyActualsFetcher;
}) {
  const [spendByMonth, setSpendByMonth] = useState<Record<number, Record<string, number>>>({});
  const [revByMonth, setRevByMonth] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const a = await fetchMonthlyActuals(fy, categories);
      if (cancelled) return;
      setSpendByMonth(a.spend ?? {});
      setRevByMonth(a.revenue ?? {});
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  // Targets aggregated per month
  const targetsByMonth = useMemo(() => {
    const map: Record<number, { spend: number; revenue: number; perCat: Record<string, { spend: number; revenue: number }> }> = {};
    FY_MONTH_NUMS.forEach(m => {
      const perCat: Record<string, { spend: number; revenue: number }> = {};
      categories.forEach(c => { perCat[c.key] = { spend: 0, revenue: 0 }; });
      map[m] = { spend: 0, revenue: 0, perCat };
    });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      const k = (r[categoryField] ?? "").toString();
      const s = Number(r[spendField] ?? 0);
      const v = Number(r[revenueField] ?? 0);
      map[r.month].spend += s;
      map[r.month].revenue += v;
      if (map[r.month].perCat[k]) {
        map[r.month].perCat[k].spend += s;
        map[r.month].perCat[k].revenue += v;
      }
    });
    return map;
  }, [rows, categories, categoryField, spendField, revenueField]);

  const perfData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const target = targetsByMonth[m]?.revenue ?? 0;
    const achieved = Object.values(revByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    return { month: FY_MONTH_LABELS[i], target, achieved, pct: target ? Math.round((achieved / target) * 100) : 0 };
  }), [targetsByMonth, revByMonth]);

  const categoryRevData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const obj: any = { month: FY_MONTH_LABELS[i] };
    displayCategories.forEach(c => { obj[c.key] = revByMonth[m]?.[c.key] ?? 0; });
    return obj;
  }), [revByMonth, displayCategories]);

  const spendRevenueData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const spend = Object.values(spendByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    const revenue = Object.values(revByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    return { month: FY_MONTH_LABELS[i], spend, revenue, roi: spend ? +(revenue / spend).toFixed(2) : 0 };
  }), [spendByMonth, revByMonth]);

  const totalAchievedRev = useMemo(() => Object.values(revByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [revByMonth]);
  const totalAchievedSpend = useMemo(() => Object.values(spendByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [spendByMonth]);
  const totalTargetRev = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.revenue, 0), [targetsByMonth]);
  const totalTargetSpend = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.spend, 0), [targetsByMonth]);
  const overallPct = totalTargetRev ? Math.round((totalAchievedRev / totalTargetRev) * 100) : 0;
  const actualROI = totalAchievedSpend ? +(totalAchievedRev / totalAchievedSpend).toFixed(2) : 0;

  const bestMonth = useMemo(() => {
    let best = perfData[0];
    perfData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [perfData]);

  const topCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    categories.forEach(c => { totals[c.key] = 0; });
    Object.values(revByMonth).forEach(m => Object.entries(m).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + v; }));
    let topKey = ""; let topVal = 0;
    Object.entries(totals).forEach(([k, v]) => { if (v > topVal) { topVal = v; topKey = k; } });
    return { label: categories.find(c => c.key === topKey)?.label ?? "—", value: topVal };
  }, [revByMonth, categories]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY {primaryMetricLabel} Achieved</CardDescription><CardTitle className="text-2xl">{formatINR(totalAchievedRev)}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Target size={12} /> of {formatINR(totalTargetRev)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Overall Achievement</CardDescription><CardTitle className="text-3xl">{overallPct}%</CardTitle></CardHeader>
          <CardContent><Progress value={Math.min(100, overallPct)} className="h-2" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Spend / ROI</CardDescription><CardTitle className="text-2xl">{actualROI}x</CardTitle></CardHeader>
          <CardContent><div className="text-xs text-muted-foreground">{formatINR(totalAchievedSpend)} spent · target {formatINR(totalTargetSpend)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Top {primaryMetricLabel} Source</CardDescription><CardTitle className="text-xl truncate">{topCategory.label}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {formatINR(topCategory.value)} FY</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly {primaryMetricLabel} — Target vs Achieved</CardTitle>
          <CardDescription>Best performing month: {bestMonth?.month ?? "—"} ({bestMonth?.pct ?? 0}%)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/100000).toFixed(0)}L`} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatINR(Number(v))} />
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
            <CardTitle>{primaryMetricLabel} by Category</CardTitle>
            <CardDescription>Stacked breakdown of monthly {primaryMetricLabel.toLowerCase()} per source</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryRevData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/100000).toFixed(0)}L`} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatINR(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {displayCategories.map((c, i) => (
                  <Bar key={c.key} dataKey={c.key} stackId="cat" fill={CHART_COLORS[i % CHART_COLORS.length]} name={c.label} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spend vs Revenue (ROI)</CardTitle>
            <CardDescription>Monthly cost vs return — overall ROI {actualROI}x</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={spendRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/100000).toFixed(0)}L`} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatINR(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="spend" stroke="hsl(var(--destructive))" name="Spend" strokeWidth={2} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" name="Revenue" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export { FY_MONTH_LABELS, FY_MONTH_NUMS };
