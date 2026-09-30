import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Phone, PhoneCall, CalendarCheck, Stethoscope, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
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

export default function FYPRETarget() {
  const [fy, setFY] = useState(getCurrentFY());
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const pre = useFYTable("fy_pre_targets" as any, fy);

  const [ach, setAch] = useState({ totalCalls: 0, newCalls: 0, followupCalls: 0, oldLeads: 0, oldFollowupCalls: 0, appointments: 0, converted: 0, treatments: 0 });
  const [loadingAch, setLoadingAch] = useState(false);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingAch(true);
      const startISO = range.start.toISOString();
      const endISO = range.end.toISOString();

      const [callsRes, leadsRes, followRes, apptRes, checkinRes] = await Promise.all([
        (supabase as any).from("call_logs").select("id, call_type, lead_id, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("leads").select("id, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("follow_ups").select("id, created_at, due_date").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("appointments").select("id, status, appointment_date, source, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("patient_checkins").select("id, created_at").gte("created_at", startISO).lte("created_at", endISO),
      ]);

      if (cancelled) return;

      const calls = callsRes.data ?? [];
      const leads = leadsRes.data ?? [];
      const follows = followRes.data ?? [];
      const appts = apptRes.data ?? [];
      const checkins = checkinRes.data ?? [];

      // Heuristics from available data
      const newCalls = calls.filter((c: any) => {
        const t = (c.call_type ?? "").toLowerCase();
        return t.includes("new") || t === "outbound" || t === "" ;
      }).length;
      const followupCalls = calls.filter((c: any) => (c.call_type ?? "").toLowerCase().includes("follow")).length;
      const oldLeads = leads.length === 0 ? 0 : Math.max(0, leads.length - newCalls);
      const oldFollowupCalls = follows.length;
      const appointments = appts.length;
      const converted = checkins.length;
      const treatments = appts.filter((a: any) => (a.status ?? "").toLowerCase() === "completed").length;

      setAch({
        totalCalls: calls.length,
        newCalls,
        followupCalls,
        oldLeads,
        oldFollowupCalls,
        appointments,
        converted,
        treatments,
      });
      setLoadingAch(false);
    }
    load().catch(() => setLoadingAch(false));
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  const periodTargets = useMemo(() => {
    const rows = pre.rows ?? [];
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

    const agg = { totalCalls: 0, newCalls: 0, followupCalls: 0, oldLeads: 0, oldFollowupCalls: 0, appointments: 0, converted: 0, treatments: 0 };
    useRows.forEach((r: any) => {
      agg.totalCalls += Number(r.total_calls_target ?? 0);
      agg.newCalls += Number(r.new_calls_target ?? 0);
      agg.followupCalls += Number(r.followup_calls_target ?? 0);
      agg.oldLeads += Number(r.old_leads_target ?? 0);
      agg.oldFollowupCalls += Number(r.old_followup_calls_target ?? 0);
      agg.appointments += Number(r.appointments_booked_target ?? 0);
      agg.converted += Number(r.clinic_converted_target ?? 0);
      agg.treatments += Number(r.treatment_taken_target ?? 0);
    });
    const out: any = {};
    Object.entries(agg).forEach(([k, v]) => { out[k] = Math.round(v / divisor); });
    return out as typeof agg;
  }, [pre.rows, period, anchor]);

  if (!pre.branchId) return <NoBranchCard />;

  const kpis = [
    { key: "totalCalls", label: "Total Calls", icon: Phone, color: "text-blue-600" },
    { key: "newCalls", label: "New Calls", icon: PhoneCall, color: "text-cyan-600" },
    { key: "followupCalls", label: "Follow-up Calls", icon: PhoneCall, color: "text-amber-600" },
    { key: "oldLeads", label: "Old Leads", icon: Phone, color: "text-orange-600" },
    { key: "oldFollowupCalls", label: "Old F/U Calls", icon: PhoneCall, color: "text-yellow-700" },
    { key: "appointments", label: "Appointments Booked", icon: CalendarCheck, color: "text-indigo-600" },
    { key: "converted", label: "Clinic Converted", icon: UserCheck, color: "text-green-600" },
    { key: "treatments", label: "Treatment Taken", icon: Stethoscope, color: "text-purple-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="📞 PRE Target" description="Patient Relationship Executive — calls, conversions, treatments. Auto-tracked." fy={fy} onFYChange={setFY} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Target vs Achieved</CardTitle>
              <CardDescription>
                {format(range.start, "dd MMM yyyy")} – {format(range.end, "dd MMM yyyy")} · auto-updated from Calls, Leads, Appointments & Check-ins
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
              const target = (periodTargets as any)[k.key] ?? 0;
              const achieved = (ach as any)[k.key] ?? 0;
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

      <FYPREMonthlyCharts fy={fy} rows={pre.rows} />

      <Card>
        <CardHeader><CardTitle>PRE Targets</CardTitle><CardDescription>Plan monthly call volumes, follow-ups, appointments & conversion targets per executive.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table={"fy_pre_targets" as any} fy={fy} rows={pre.rows} onChanged={pre.reload}
            title="PRE Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "pre_name", label: "PRE Name", type: "select", manageableKey: "pre_executives", options: [] },
              { key: "total_calls_target", label: "Total Calls", type: "number" },
              { key: "new_calls_target", label: "New Calls", type: "number" },
              { key: "followup_calls_target", label: "F/U Calls", type: "number" },
              { key: "old_leads_target", label: "Old Leads", type: "number" },
              { key: "old_followup_calls_target", label: "Old F/U Calls", type: "number" },
              { key: "appointments_booked_target", label: "Appt Booked", type: "number" },
              { key: "clinic_converted_target", label: "Clinic Converted", type: "number" },
              { key: "treatment_taken_target", label: "Treatment Taken", type: "number" },
              { key: "responsible_person", label: "Responsible", type: "text" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FYPREMonthlyCharts({ fy, rows }: { fy: string; rows: any[] }) {
  const [achByMonth, setAchByMonth] = useState<Record<number, any>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startYear = parseInt(fy.split("-")[0], 10);
      const start = new Date(startYear, 3, 1);
      const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [callsRes, leadsRes, followRes, apptRes, checkinRes] = await Promise.all([
        (supabase as any).from("call_logs").select("id, call_type, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("leads").select("id, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("follow_ups").select("id, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("appointments").select("id, status, created_at").gte("created_at", startISO).lte("created_at", endISO),
        (supabase as any).from("patient_checkins").select("id, created_at").gte("created_at", startISO).lte("created_at", endISO),
      ]);
      if (cancelled) return;

      const init: Record<number, any> = {};
      FY_MONTH_NUMS.forEach(m => { init[m] = { totalCalls: 0, newCalls: 0, followupCalls: 0, oldLeads: 0, oldFollowupCalls: 0, appointments: 0, converted: 0, treatments: 0 }; });

      (callsRes.data ?? []).forEach((c: any) => {
        const m = new Date(c.created_at).getMonth() + 1;
        if (!init[m]) return;
        init[m].totalCalls += 1;
        const t = (c.call_type ?? "").toLowerCase();
        if (t.includes("follow")) init[m].followupCalls += 1;
        else init[m].newCalls += 1;
      });
      (leadsRes.data ?? []).forEach((l: any) => {
        const m = new Date(l.created_at).getMonth() + 1;
        if (init[m]) init[m].oldLeads += 1;
      });
      (followRes.data ?? []).forEach((f: any) => {
        const m = new Date(f.created_at).getMonth() + 1;
        if (init[m]) init[m].oldFollowupCalls += 1;
      });
      (apptRes.data ?? []).forEach((a: any) => {
        const m = new Date(a.created_at).getMonth() + 1;
        if (!init[m]) return;
        init[m].appointments += 1;
        if ((a.status ?? "").toLowerCase() === "completed") init[m].treatments += 1;
      });
      (checkinRes.data ?? []).forEach((c: any) => {
        const m = new Date(c.created_at).getMonth() + 1;
        if (init[m]) init[m].converted += 1;
      });
      setAchByMonth(init);
    }
    load().catch(() => {});
    return () => { cancelled = true; };
  }, [fy]);

  const targetsByMonth = useMemo(() => {
    const map: Record<number, any> = {};
    FY_MONTH_NUMS.forEach(m => { map[m] = { totalCalls: 0, newCalls: 0, followupCalls: 0, oldLeads: 0, oldFollowupCalls: 0, appointments: 0, converted: 0, treatments: 0 }; });
    (rows ?? []).forEach((r: any) => {
      if (!map[r.month]) return;
      map[r.month].totalCalls += Number(r.total_calls_target ?? 0);
      map[r.month].newCalls += Number(r.new_calls_target ?? 0);
      map[r.month].followupCalls += Number(r.followup_calls_target ?? 0);
      map[r.month].oldLeads += Number(r.old_leads_target ?? 0);
      map[r.month].oldFollowupCalls += Number(r.old_followup_calls_target ?? 0);
      map[r.month].appointments += Number(r.appointments_booked_target ?? 0);
      map[r.month].converted += Number(r.clinic_converted_target ?? 0);
      map[r.month].treatments += Number(r.treatment_taken_target ?? 0);
    });
    return map;
  }, [rows]);

  const callsData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.totalCalls ?? 0,
    achieved: achByMonth[m]?.totalCalls ?? 0,
  })), [targetsByMonth, achByMonth]);

  const callBreakdown = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    "New Calls": achByMonth[m]?.newCalls ?? 0,
    "F/U Calls": achByMonth[m]?.followupCalls ?? 0,
    "Old F/U": achByMonth[m]?.oldFollowupCalls ?? 0,
  })), [achByMonth]);

  const funnelData = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    Calls: achByMonth[m]?.totalCalls ?? 0,
    Appt: achByMonth[m]?.appointments ?? 0,
    Converted: achByMonth[m]?.converted ?? 0,
    Treatment: achByMonth[m]?.treatments ?? 0,
  })), [achByMonth]);

  const treatmentLine = useMemo(() => FY_MONTH_NUMS.map((m, i) => ({
    month: FY_MONTH_LABELS[i],
    target: targetsByMonth[m]?.treatments ?? 0,
    achieved: achByMonth[m]?.treatments ?? 0,
  })), [targetsByMonth, achByMonth]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Calls Performance</CardTitle><CardDescription>Target vs achieved total calls</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={callsData}>
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
        <CardHeader><CardTitle className="text-base">Call Type Breakdown</CardTitle><CardDescription>New vs follow-up calls per month</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={callBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="New Calls" stackId="c" fill="hsl(217 91% 60%)" />
              <Bar dataKey="F/U Calls" stackId="c" fill="hsl(38 92% 50%)" />
              <Bar dataKey="Old F/U" stackId="c" fill="hsl(280 65% 60%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle><CardDescription>Calls → Appointments → Converted → Treatment</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Calls" fill="hsl(217 91% 60%)" />
              <Bar dataKey="Appt" fill="hsl(38 92% 50%)" />
              <Bar dataKey="Converted" fill="hsl(142 71% 45%)" />
              <Bar dataKey="Treatment" fill="hsl(280 65% 60%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Treatment Taken Trend</CardTitle><CardDescription>Target vs achieved treatments per month</CardDescription></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={treatmentLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" name="Target" strokeWidth={2} />
              <Line type="monotone" dataKey="achieved" stroke="hsl(142 71% 45%)" name="Achieved" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
