import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Target, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY, formatINR } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, getQuarter } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

const PLATFORMS: { key: string; label: string; matchers: string[] }[] = [
  { key: "meta_ads", label: "Meta Ads", matchers: ["meta", "facebook", "instagram", "fb", "ig"] },
  { key: "google_ads", label: "Google Ads", matchers: ["google"] },
  { key: "youtube_ads", label: "YouTube Ads", matchers: ["youtube", "yt"] },
  { key: "linkedin_ads", label: "LinkedIn Ads", matchers: ["linkedin"] },
];

function matchPlatform(source: string | null | undefined): string | null {
  if (!source) return null;
  const s = source.toLowerCase();
  for (const p of PLATFORMS) if (p.matchers.some(m => s.includes(m))) return p.key;
  return null;
}

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

export default function FYMarketingAds() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const ads = useFYTable("fy_ad_targets", fy);

  const [achLeads, setAchLeads] = useState<Record<string, number>>({});
  const [achRevenue, setAchRevenue] = useState<Record<string, number>>({});
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const { data } = await supabase
        .from("leads")
        .select("id, source, status, estimated_value, created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());
      if (cancelled) return;
      const leads: Record<string, number> = {};
      const rev: Record<string, number> = {};
      PLATFORMS.forEach(p => { leads[p.key] = 0; rev[p.key] = 0; });
      (data ?? []).forEach((l: any) => {
        const k = matchPlatform(l.source);
        if (!k) return;
        leads[k] += 1;
        if ((l.status ?? "").toString().toLowerCase().includes("convert")) {
          rev[k] += Number(l.estimated_value ?? 0);
        }
      });
      setAchLeads(leads);
      setAchRevenue(rev);
      setLoadingAch(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  const periodTargets = useMemo(() => {
    const rows = ads.rows ?? [];
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

    const result: Record<string, { budget: number; leads: number; cpl: number; roas: number }> = {};
    PLATFORMS.forEach(p => { result[p.key] = { budget: 0, leads: 0, cpl: 0, roas: 0 }; });
    useRows.forEach((r: any) => {
      const k = (r.platform ?? "").toString();
      if (!result[k]) return;
      result[k].budget += Number(r.budget ?? 0);
      result[k].leads += Number(r.lead_target ?? 0);
      result[k].cpl = Math.max(result[k].cpl, Number(r.cpl_target ?? 0));
      result[k].roas = Math.max(result[k].roas, Number(r.roas_target ?? 0));
    });
    PLATFORMS.forEach(p => {
      result[p.key].budget = Math.round(result[p.key].budget / divisor);
      result[p.key].leads = Math.round(result[p.key].leads / divisor);
    });
    return result;
  }, [ads.rows, period, anchor]);

  if (!ads.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="📣 Ad Target" description="Paid ads — Target vs Achieved (auto-tracked from leads)" fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from incoming leads
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
            {PLATFORMS.map(p => {
              const t = periodTargets[p.key];
              const ach = achLeads[p.key] ?? 0;
              const target = t.leads;
              const pct = target > 0 ? Math.min(100, Math.round((ach / target) * 100)) : 0;
              const status = target === 0 ? "—" : ach >= target ? "achieved" : pct >= 80 ? "on-track" : "behind";
              const variant = status === "achieved" ? "default" : status === "on-track" ? "secondary" : status === "behind" ? "destructive" : "outline";
              return (
                <div key={p.key} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{p.label}</span>
                    <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{ach}</span>
                    <span className="text-sm text-muted-foreground">/ {target} leads</span>
                    <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>Budget: {formatINR(t.budget)}</span>
                    <span>CPL≤ {formatINR(t.cpl)}</span>
                    <span>ROAS≥ {t.roas}x</span>
                  </div>
                </div>
              );
            })}
          </div>
          {loadingAch && <p className="text-xs text-muted-foreground mt-3">Refreshing achievements…</p>}
        </CardContent>
      </Card>

      <FYAdsMonthlySummary fy={fy} rows={ads.rows} />

      <Card>
        <CardHeader><CardTitle>Paid Ads Targets</CardTitle><CardDescription>Plan Meta/Google/YouTube/LinkedIn ad spend & outcomes.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_ad_targets" fy={fy} rows={ads.rows} onChanged={ads.reload}
            title="Paid Ads Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "platform", label: "Platform", type: "select", manageableKey: "ad_platforms", options: [
                { value: "meta_ads", label: "Meta Ads" }, { value: "google_ads", label: "Google Ads" },
                { value: "youtube_ads", label: "YouTube Ads" }, { value: "linkedin_ads", label: "LinkedIn Ads" },
                { value: "other", label: "Other" }] },
              { key: "campaign", label: "Campaign", type: "select", manageableKey: "ad_campaigns", options: [
                { value: "leads_campaign", label: "Leads Campaign" },
                { value: "hiring_campaign", label: "Hiring Campaign" },
                { value: "awareness_campaign", label: "Awareness Campaign" }] },
              { key: "treatment", label: "Treatment", type: "treatment_select" },
              { key: "budget", label: "Budget", type: "currency" },
              { key: "lead_target", label: "Leads", type: "number" },
              { key: "cpl_target", label: "CPL Target", type: "currency" },
              { key: "roas_target", label: "ROAS", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FYAdsMonthlySummary({ fy, rows }: { fy: string; rows: any[] }) {
  const [leadsByMonth, setLeadsByMonth] = useState<Record<number, Record<string, number>>>({});
  const [revByMonth, setRevByMonth] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const { data } = await supabase
        .from("leads")
        .select("id, source, status, estimated_value, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (cancelled) return;
      const lMap: Record<number, Record<string, number>> = {};
      const rMap: Record<number, Record<string, number>> = {};
      FY_MONTH_NUMS.forEach(m => {
        const z: Record<string, number> = {};
        PLATFORMS.forEach(p => { z[p.key] = 0; });
        lMap[m] = { ...z };
        rMap[m] = { ...z };
      });
      (data ?? []).forEach((l: any) => {
        const m = new Date(l.created_at).getMonth() + 1;
        const k = matchPlatform(l.source);
        if (!k || !lMap[m]) return;
        lMap[m][k] += 1;
        if ((l.status ?? "").toString().toLowerCase().includes("convert")) {
          rMap[m][k] += Number(l.estimated_value ?? 0);
        }
      });
      setLeadsByMonth(lMap);
      setRevByMonth(rMap);
    }
    load();
    return () => { cancelled = true; };
  }, [fy]);

  // Targets aggregated per month (sum across all rows in that month)
  const targetsByMonth = useMemo(() => {
    const map: Record<number, { budget: number; leads: number }> = {};
    FY_MONTH_NUMS.forEach(m => { map[m] = { budget: 0, leads: 0 }; });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      map[r.month].budget += Number(r.budget ?? 0);
      map[r.month].leads += Number(r.lead_target ?? 0);
    });
    return map;
  }, [rows]);

  const perfData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const t = targetsByMonth[m] ?? { budget: 0, leads: 0 };
    const ach = Object.values(leadsByMonth[m] ?? {}).reduce((s, v) => s + v, 0);
    return { month: FY_MONTH_LABELS[i], target: t.leads, achieved: ach, pct: t.leads ? Math.round((ach / t.leads) * 100) : 0 };
  }), [targetsByMonth, leadsByMonth]);

  const platformData = useMemo(() => FY_MONTH_NUMS.map((m, i) => {
    const obj: any = { month: FY_MONTH_LABELS[i] };
    PLATFORMS.forEach(p => { obj[p.key] = leadsByMonth[m]?.[p.key] ?? 0; });
    return obj;
  }), [leadsByMonth]);

  // Campaign breakdown (from target rows × actual platform leads, allocated proportionally)
  const campaignData = useMemo(() => {
    const totals: Record<string, number> = {};
    (rows ?? []).forEach((r: any) => {
      const c = (r.campaign ?? "—").toString();
      totals[c] = (totals[c] ?? 0) + Number(r.lead_target ?? 0);
    });
    return Object.entries(totals).map(([k, v]) => ({ campaign: k.replace(/_/g, " "), target: v }));
  }, [rows]);

  // Treatment breakdown from targets
  const treatmentData = useMemo(() => {
    const totals: Record<string, { budget: number; leads: number }> = {};
    (rows ?? []).forEach((r: any) => {
      const t = (r.treatment ?? "—").toString();
      if (!totals[t]) totals[t] = { budget: 0, leads: 0 };
      totals[t].budget += Number(r.budget ?? 0);
      totals[t].leads += Number(r.lead_target ?? 0);
    });
    return Object.entries(totals).map(([k, v]) => ({ treatment: k, budget: v.budget, leads: v.leads }));
  }, [rows]);

  const totalAchieved = useMemo(() => Object.values(leadsByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [leadsByMonth]);
  const totalTarget = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.leads, 0), [targetsByMonth]);
  const totalBudget = useMemo(() => Object.values(targetsByMonth).reduce((s, m) => s + m.budget, 0), [targetsByMonth]);
  const totalRevenue = useMemo(() => Object.values(revByMonth).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0), [revByMonth]);
  const overallPct = totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const actualROAS = totalBudget ? +(totalRevenue / totalBudget).toFixed(2) : 0;

  const bestMonth = useMemo(() => {
    let best = perfData[0];
    perfData.forEach(d => { if (d.pct > (best?.pct ?? 0)) best = d; });
    return best;
  }, [perfData]);

  const topPlatform = useMemo(() => {
    const totals: Record<string, number> = {};
    PLATFORMS.forEach(p => { totals[p.key] = 0; });
    Object.values(leadsByMonth).forEach(m => Object.entries(m).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + v; }));
    let topKey = ""; let topVal = 0;
    Object.entries(totals).forEach(([k, v]) => { if (v > topVal) { topVal = v; topKey = k; } });
    return { label: PLATFORMS.find(p => p.key === topKey)?.label ?? "—", value: topVal };
  }, [leadsByMonth]);

  const chartColors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--ring))"];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>FY Total Leads Achieved</CardDescription><CardTitle className="text-3xl">{totalAchieved}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><Target size={12} /> of {totalTarget} target ({overallPct}%)</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Ad Budget</CardDescription><CardTitle className="text-2xl">{formatINR(totalBudget)}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><IndianRupee size={12} /> Revenue: {formatINR(totalRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Actual ROAS</CardDescription><CardTitle className="text-3xl">{actualROAS}x</CardTitle></CardHeader>
          <CardContent><Progress value={Math.min(100, actualROAS * 20)} className="h-2" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Top Platform</CardDescription><CardTitle className="text-2xl truncate">{topPlatform.label}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} className="text-primary" /> {topPlatform.value} leads FY</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Performance — Target vs Achieved Leads</CardTitle>
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
              <Bar dataKey="target" fill="hsl(var(--muted))" name="Target Leads" radius={[4,4,0,0]} />
              <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved Leads" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Breakdown by Month</CardTitle>
          <CardDescription>Which ad platform brought the most leads each month</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={platformData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {PLATFORMS.map((p, i) => (
                <Bar key={p.key} dataKey={p.key} stackId="plat" fill={chartColors[i % chartColors.length]} name={p.label} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaign-wise Lead Targets</CardTitle>
            <CardDescription>Target leads per campaign across the FY</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignData.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No campaign targets yet.</div> :
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={campaignData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="campaign" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="target" fill="hsl(var(--primary))" name="Target Leads" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Treatment-wise Ad Spend & Leads</CardTitle>
            <CardDescription>How budget is allocated across treatments</CardDescription>
          </CardHeader>
          <CardContent>
            {treatmentData.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No treatment targets yet.</div> :
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={treatmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="treatment" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-15} textAnchor="end" height={60} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="budget" fill="hsl(var(--primary))" name="Budget (₹)" radius={[4,4,0,0]} />
                <Bar yAxisId="right" dataKey="leads" fill="hsl(var(--accent))" name="Lead Target" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
