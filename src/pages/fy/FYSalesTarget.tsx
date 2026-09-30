import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Target, Users, IndianRupee, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY, formatINR } from "@/lib/fyProjection";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from "recharts";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

const FY_MONTH_LABELS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const FY_MONTH_NUMS = [4,5,6,7,8,9,10,11,12,1,2,3];

const SOURCE_OPTIONS = [
  { value: "google", label: "Google" },
  { value: "meta", label: "Meta (FB/Insta)" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "camp", label: "Camp" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Other" },
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

export default function FYSalesTarget() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const sales = useFYTable("fy_sales_targets", fy);
  const { treatmentOptions } = useClinicMasters();

  const [achTotal, setAchTotal] = useState(0);
  const [achQualified, setAchQualified] = useState(0);
  const [achConverted, setAchConverted] = useState(0);
  const [achRevenue, setAchRevenue] = useState(0);
  const [bySource, setBySource] = useState<Record<string, number>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, status, source, estimated_value, lead_score, created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());
      if (cancelled) return;
      const leads = leadsData ?? [];
      let total = leads.length;
      let qualified = 0, converted = 0, revenue = 0;
      const srcMap: Record<string, number> = {};
      leads.forEach((l: any) => {
        const st = (l.status ?? "").toLowerCase();
        const sc = Number(l.lead_score ?? 0);
        if (sc >= 60 || ["qualified","contacted","converted","closed"].some(x => st.includes(x))) qualified += 1;
        if (st.includes("convert") || st.includes("closed") || st === "won") {
          converted += 1;
          revenue += Number(l.estimated_value ?? 0);
        }
        const src = (l.source ?? "other").toString().toLowerCase().replace(/\s+/g, "_");
        srcMap[src] = (srcMap[src] ?? 0) + 1;
      });
      setAchTotal(total);
      setAchQualified(qualified);
      setAchConverted(converted);
      setAchRevenue(revenue);
      setBySource(srcMap);
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  const periodTargets = useMemo(() => {
    const rows = sales.rows ?? [];
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

    const agg = { total: 0, qualified: 0, converted: 0, opp: 0, revenue: 0 };
    useRows.forEach((r: any) => {
      agg.total += Number(r.total_lead_target ?? 0);
      agg.qualified += Number(r.qualified_lead_target ?? 0);
      agg.converted += Number(r.converted_target ?? r.closures_target ?? 0);
      agg.opp += Number(r.opportunity_value_target ?? 0);
      agg.revenue += Number(r.closed_revenue_target ?? 0);
    });
    return {
      total: Math.round(agg.total / divisor),
      qualified: Math.round(agg.qualified / divisor),
      converted: Math.round(agg.converted / divisor),
      opp: Math.round(agg.opp / divisor),
      revenue: Math.round(agg.revenue / divisor),
    };
  }, [sales.rows, period, anchor]);

  if (!sales.branchId) return <NoBranchCard />;

  const kpis = [
    { label: "Total Leads", icon: Users, ach: achTotal, target: periodTargets.total, color: "text-blue-600" },
    { label: "Qualified", icon: Target, ach: achQualified, target: periodTargets.qualified, color: "text-amber-600" },
    { label: "Converted", icon: TrendingUp, ach: achConverted, target: periodTargets.converted, color: "text-green-600" },
    { label: "Closed Revenue", icon: IndianRupee, ach: achRevenue, target: periodTargets.revenue, color: "text-purple-600", currency: true },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="💰 Sales Target" description="Lead pipeline, qualification, conversion & revenue — auto-tracked from leads" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from Leads
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
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map(k => {
              const pct = k.target > 0 ? Math.min(100, Math.round((k.ach / k.target) * 100)) : 0;
              const status = k.target === 0 ? "—" : k.ach >= k.target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              const Icon = k.icon;
              return (
                <div key={k.label} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm flex items-center gap-2"><Icon className={cn("h-4 w-4", k.color)} />{k.label}</span>
                    <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{k.currency ? formatINR(k.ach) : k.ach}</span>
                    <span className="text-xs text-muted-foreground">/ {k.currency ? formatINR(k.target) : k.target}</span>
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

      <FYSalesMonthlySummary fy={fy} rows={sales.rows} bySource={bySource} />

      <Card>
        <CardHeader><CardTitle>Sales Targets</CardTitle><CardDescription>Plan monthly lead, qualification, conversion & revenue targets per campaign / source / treatment.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_sales_targets" fy={fy} rows={sales.rows} onChanged={sales.reload}
            title="Sales Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "campaign", label: "Campaign", type: "select", manageableKey: "sales_campaigns", options: [
                { value: "lead_generation", label: "Lead Generation" },
                { value: "hiring", label: "Hiring Campaign" },
                { value: "awareness", label: "Awareness" },
                { value: "promotional", label: "Promotional Offer" },
              ]},
              { key: "source", label: "Source", type: "select", manageableKey: "sales_sources", options: SOURCE_OPTIONS },
              { key: "treatment", label: "Treatment", type: "treatment_select" },
              { key: "total_lead_target", label: "Total Leads", type: "number" },
              { key: "qualified_lead_target", label: "Qualified Leads", type: "number" },
              { key: "converted_target", label: "Converted", type: "number" },
              { key: "conversion_rate_target", label: "Conversion %", type: "number" },
              { key: "opportunity_value_target", label: "Opp. Value", type: "currency" },
              { key: "closed_revenue_target", label: "Closed Revenue", type: "currency" },
              { key: "responsible_person", label: "Responsible", type: "text" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FYSalesMonthlySummary({ fy, rows, bySource }: { fy: string; rows: any[]; bySource: Record<string, number> }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, { total: number; qualified: number; converted: number; revenue: number }>>({});
  const [sourceByMonth, setSourceByMonth] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const { data } = await supabase
        .from("leads")
        .select("id, status, source, estimated_value, lead_score, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (cancelled) return;
      const init: Record<number, { total: number; qualified: number; converted: number; revenue: number }> = {};
      const sInit: Record<number, Record<string, number>> = {};
      FY_MONTH_NUMS.forEach(m => { init[m] = { total: 0, qualified: 0, converted: 0, revenue: 0 }; sInit[m] = {}; });
      (data ?? []).forEach((l: any) => {
        const m = new Date(l.created_at).getMonth() + 1;
        if (!init[m]) return;
        init[m].total += 1;
        const st = (l.status ?? "").toLowerCase();
        const sc = Number(l.lead_score ?? 0);
        if (sc >= 60 || ["qualified","contacted","converted","closed"].some(x => st.includes(x))) init[m].qualified += 1;
        if (st.includes("convert") || st.includes("closed") || st === "won") {
          init[m].converted += 1;
          init[m].revenue += Number(l.estimated_value ?? 0);
        }
        const src = (l.source ?? "other").toString().toLowerCase().replace(/\s+/g, "_");
        sInit[m][src] = (sInit[m][src] ?? 0) + 1;
      });
      setAchByMonth(init);
      setSourceByMonth(sInit);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, { total: number; qualified: number; converted: number; opp: number; revenue: number }> = {};
    FY_MONTH_NUMS.forEach(m => { map[m] = { total: 0, qualified: 0, converted: 0, opp: 0, revenue: 0 }; });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      map[r.month].total += Number(r.total_lead_target ?? 0);
      map[r.month].qualified += Number(r.qualified_lead_target ?? 0);
      map[r.month].converted += Number(r.converted_target ?? r.closures_target ?? 0);
      map[r.month].opp += Number(r.opportunity_value_target ?? 0);
      map[r.month].revenue += Number(r.closed_revenue_target ?? 0);
    });
    return map;
  }, [rows]);

  const leadPerf = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.total ?? 0,
    achieved: achByMonth[m]?.total ?? 0,
  })), [targetsByMonth, achByMonth]);

  const funnelData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    totalT: targetsByMonth[m]?.total ?? 0,
    totalA: achByMonth[m]?.total ?? 0,
    qualT: targetsByMonth[m]?.qualified ?? 0,
    qualA: achByMonth[m]?.qualified ?? 0,
    convT: targetsByMonth[m]?.converted ?? 0,
    convA: achByMonth[m]?.converted ?? 0,
  })), [targetsByMonth, achByMonth]);

  const revenuePerf = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.revenue ?? 0,
    achieved: achByMonth[m]?.revenue ?? 0,
    opportunity: targetsByMonth[m]?.opp ?? 0,
  })), [targetsByMonth, achByMonth]);

  const allSources = useMemo(() => {
    const s = new Set<string>();
    Object.values(sourceByMonth).forEach(o => Object.keys(o).forEach(k => s.add(k)));
    Object.keys(bySource).forEach(k => s.add(k));
    return Array.from(s);
  }, [sourceByMonth, bySource]);

  const sourceData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const obj: any = { month: FY_MONTH_LABELS[i] };
    allSources.forEach(s => { obj[s] = sourceByMonth[m]?.[s] ?? 0; });
    return obj;
  }), [sourceByMonth, allSources]);

  const SOURCE_COLORS = ["hsl(var(--primary))", "hsl(217 91% 60%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)", "hsl(0 84% 60%)", "hsl(173 58% 39%)", "hsl(45 93% 47%)"];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Lead Performance</CardTitle><CardDescription>Target vs achieved leads</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={leadPerf}>
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
        <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle><CardDescription>Total → Qualified → Converted</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="totalA" fill="hsl(217 91% 60%)" name="Total" />
              <Bar dataKey="qualA" fill="hsl(38 92% 50%)" name="Qualified" />
              <Bar dataKey="convA" fill="hsl(142 71% 45%)" name="Converted" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Source Breakdown</CardTitle><CardDescription>Achieved leads by source per month</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {allSources.map((s, i) => (
                <Bar key={s} dataKey={s} stackId="src" fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} name={s} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Revenue & Opportunity</CardTitle><CardDescription>Target revenue, achieved revenue & opportunity value</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={revenuePerf}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v/100000).toFixed(1)}L`} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatINR(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" name="Revenue Target" strokeWidth={2} />
              <Line type="monotone" dataKey="achieved" stroke="hsl(142 71% 45%)" name="Revenue Achieved" strokeWidth={2} />
              <Line type="monotone" dataKey="opportunity" stroke="hsl(280 65% 60%)" name="Opportunity" strokeWidth={2} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
