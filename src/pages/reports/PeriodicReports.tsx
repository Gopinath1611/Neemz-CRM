import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, RotateCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DayWiseAnalysisTab from "@/components/reports/DayWiseAnalysisTab";
import HourlyAnalysisTab from "@/components/reports/HourlyAnalysisTab";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { cn } from "@/lib/utils";
import {
  buildEmployeeSummary,
  buildSummary,
  formatReportDuration,
  isIncomingCall,
  isMissedCall,
  isOutgoingCall,
  isRejectedCall,
  type EmployeeSummaryRow,
  type ReportCallRow,
} from "@/lib/periodicReportMetrics";

const ROW_CAP = 50_000;
const PAGE_SIZE = 1_000;
const COLUMNS =
  "id, call_type, status, duration_seconds, started_at, ended_at, phone, normalized_phone, notes, telecaller_id";

const CALL_TYPES = ["Incoming", "Outgoing", "Missed", "Rejected"] as const;
type CallType = (typeof CALL_TYPES)[number];

type DurationMode = "any" | "gt" | "lt" | "between";
type TimeMode = "any" | "after" | "before" | "between";

interface Filters {
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  employeeIds: string[];
  callTypes: CallType[];
  durationMode: DurationMode;
  durationA: string;
  durationB: string;
  timeMode: TimeMode;
  timeA: string;
  timeB: string;
}

const indiaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const defaultFilters = (): Filters => ({
  fromDate: indiaToday(),
  fromTime: "00:00",
  toDate: indiaToday(),
  toTime: "23:59",
  employeeIds: [],
  callTypes: [],
  durationMode: "any",
  durationA: "",
  durationB: "",
  timeMode: "any",
  timeA: "",
  timeB: "",
});

const istInstant = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const istLabel = (iso: string | null, opts: Intl.DateTimeFormatOptions) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", ...opts }).format(new Date(iso)) : "—";
const istMinutes = (iso: string | null) => {
  if (!iso) return -1;
  const [h, m] = istLabel(iso, { hour: "2-digit", minute: "2-digit", hour12: false }).split(":");
  return Number(h) * 60 + Number(m);
};
const timeToMinutes = (value: string) => {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m || 0);
};

const rangeLabel = (f: Filters) =>
  `${istLabel(istInstant(f.fromDate, f.fromTime).toISOString(), { day: "2-digit", month: "short", year: "numeric" })} ${f.fromTime} — ${istLabel(istInstant(f.toDate, f.toTime).toISOString(), { day: "2-digit", month: "short", year: "numeric" })} ${f.toTime}`;

interface FetchResult {
  calls: ReportCallRow[];
  capped: boolean;
  names: Map<string, { name: string; number: string }>;
}

const fetchCalls = async (f: Filters): Promise<FetchResult> => {
  const start = istInstant(f.fromDate, f.fromTime).toISOString();
  const end = new Date(istInstant(f.toDate, f.toTime).getTime() + 60_000).toISOString();
  const rows: ReportCallRow[] = [];
  let capped = false;

  for (let from = 0; from < ROW_CAP; from += PAGE_SIZE) {
    let query = supabase
      .from("call_logs")
      .select(COLUMNS)
      .gte("started_at", start)
      .lt("started_at", end)
      .order("started_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (f.employeeIds.length > 0) query = query.in("telecaller_id", f.employeeIds);

    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as ReportCallRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (rows.length >= ROW_CAP) {
      capped = true;
      break;
    }
  }

  // Client-side filters that have no stored column equivalent.
  let calls = rows;
  if (f.callTypes.length > 0) {
    const wanted = new Set(f.callTypes);
    calls = calls.filter(
      (c) =>
        (wanted.has("Incoming") && isIncomingCall(c)) ||
        (wanted.has("Outgoing") && isOutgoingCall(c)) ||
        (wanted.has("Missed") && isMissedCall(c)) ||
        (wanted.has("Rejected") && isRejectedCall(c)),
    );
  }
  if (f.durationMode !== "any") {
    const a = Number(f.durationA);
    const b = Number(f.durationB);
    calls = calls.filter((c) => {
      const d = c.duration_seconds || 0;
      if (f.durationMode === "gt") return Number.isFinite(a) && d > a;
      if (f.durationMode === "lt") return Number.isFinite(a) && d < a;
      return Number.isFinite(a) && Number.isFinite(b) && d >= a && d <= b;
    });
  }
  if (f.timeMode !== "any") {
    const a = f.timeA ? timeToMinutes(f.timeA) : null;
    const b = f.timeB ? timeToMinutes(f.timeB) : null;
    calls = calls.filter((c) => {
      const mins = istMinutes(c.started_at);
      if (mins < 0) return false;
      if (f.timeMode === "after") return a !== null && mins >= a;
      if (f.timeMode === "before") return a !== null && mins <= a;
      return a !== null && b !== null && mins >= a && mins <= b;
    });
  }

  const staffIds = [...new Set(calls.map((c) => c.telecaller_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, { name: string; number: string }>();
  if (staffIds.length > 0) {
    const [profilesRes, mappingRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", staffIds),
      supabase
        .from("callyzer_employee_mappings")
        .select("profile_id, callyzer_emp_number")
        .in("profile_id", staffIds),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    const numbers = new Map(
      (mappingRes.data ?? [])
        .filter((m) => m.profile_id)
        .map((m) => [m.profile_id as string, m.callyzer_emp_number]),
    );
    for (const p of profilesRes.data ?? []) {
      names.set(p.id, { name: p.full_name?.trim() || "Unnamed", number: numbers.get(p.id) ?? "—" });
    }
  }

  return { calls, capped, names };
};

const csvEscape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const TABS = [
  "Summary",
  "Day-wise Analysis",
  "Hourly Analysis",
] as const;

const DONUT_COLORS = {
  Incoming: "hsl(var(--success))",
  Outgoing: "hsl(var(--warning))",
  Missed: "hsl(var(--destructive))",
  Rejected: "hsl(var(--destructive) / 0.55)",
} as const;

const NotAvailable = () => (
  <Badge variant="outline" className="ml-2 text-[10px] font-normal text-muted-foreground">
    Not available yet
  </Badge>
);

export default function PeriodicReports() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin" as never);

  const [draft, setDraft] = useState<Filters>(defaultFilters);
  const [applied, setApplied] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<"off" | "60" | "300">("off");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["periodic-reports", applied],
    queryFn: () => fetchCalls(applied),
  });

  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (autoRefresh !== "off") {
      timer.current = window.setInterval(() => refetch(), Number(autoRefresh) * 1000);
    }
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [autoRefresh, refetch]);

  useEffect(() => {
    if (data?.capped) toast.warning("Too many calls in this range — narrow the range for exact numbers.");
  }, [data?.capped]);

  const calls = data?.calls ?? [];
  const summary = useMemo(() => buildSummary(calls), [calls]);
  const employeeRows = useMemo(
    () => buildEmployeeSummary(calls, data?.names ?? new Map()),
    [calls, data?.names],
  );
  const pagedEmployees = usePagedSlice(employeeRows, page, pageSize);

  const { data: employeeOptions = [] } = useQuery({
    queryKey: ["periodic-reports-employees", isAdmin],
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("active", true)
        .order("full_name");
      if (err) throw err;
      return (rows ?? []).map((r) => ({ id: r.id, name: r.full_name?.trim() || "Unnamed" }));
    },
  });

  const donutData = useMemo(
    () =>
      [
        { name: "Incoming", value: summary.incoming.calls },
        { name: "Outgoing", value: summary.outgoing.calls },
        { name: "Missed", value: summary.missed },
        { name: "Rejected", value: summary.rejected },
      ].filter((d) => d.value > 0),
    [summary],
  );

  const apply = () => {
    setApplied(draft);
    setPage(1);
    setShowFilters(false);
  };
  const reset = () => {
    const fresh = defaultFilters();
    setDraft(fresh);
    setApplied(fresh);
    setPage(1);
  };

  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const exportSummary = useCallback(() => {
    downloadCsv(`periodic-summary-${applied.fromDate}-to-${applied.toDate}.csv`, [
      ["Periodic Reports Summary", rangeLabel(applied)],
      [],
      ["Call Type", "Calls", "Duration"],
      ["Incoming", summary.incoming.calls, formatReportDuration(summary.incoming.duration)],
      ["Outgoing", summary.outgoing.calls, formatReportDuration(summary.outgoing.duration)],
      ["Missed", summary.missed, "-"],
      ["Rejected", summary.rejected, "-"],
      ["Total", summary.totalCalls, formatReportDuration(summary.totalDuration)],
      [],
      ["Never Attended", summary.neverAttended],
      ["Not Pickup by Client", summary.notPickup],
      ["Connected Calls", summary.connectedCalls],
      ["Unique Connected Calls", summary.uniqueConnectedCalls],
      ["Unique Clients", summary.uniqueClients],
      ["Working Hours", formatReportDuration(summary.workingSeconds)],
    ]);
  }, [applied, summary]);

  const exportEmployees = useCallback(() => {
    const header = [
      "Sr. No.", "Employee", "Employee Number", "Total Calls", "Total Duration", "Connected Calls",
      "Conn. Calls Duration", "Conn. Call Avg. Duration", "Working Hours", "Unique Clients",
      "Unique Conn. Calls", "Incoming Total Call", "Incoming Total Duration", "Incoming Connected Calls",
      "Incoming Conn. Calls Duration", "Incoming Conn. Calls Avg. Duration", "Outgoing Total Call",
      "Outgoing Total Duration", "Outgoing Connected Calls", "Outgoing Conn. Calls Duration",
      "Outgoing Conn. Calls Avg. Duration", "Missed", "Rejected", "Never Attended", "Not Pickup by Client",
    ];
    const body = employeeRows.map((r, i) => [
      i + 1, r.employeeName, r.employeeNumber, r.totalCalls, formatReportDuration(r.totalDuration),
      r.connectedCalls, formatReportDuration(r.connectedDuration), formatReportDuration(r.connectedAvg),
      formatReportDuration(r.workingSeconds), r.uniqueClients, r.uniqueConnectedCalls,
      r.incoming.calls, formatReportDuration(r.incoming.duration), r.incoming.connected,
      formatReportDuration(r.incoming.connectedDuration), formatReportDuration(r.incoming.connectedAvg),
      r.outgoing.calls, formatReportDuration(r.outgoing.duration), r.outgoing.connected,
      formatReportDuration(r.outgoing.connectedDuration), formatReportDuration(r.outgoing.connectedAvg),
      r.missed, r.rejected, r.neverAttended, r.notPickup,
    ]);
    downloadCsv(`periodic-employee-summary-${applied.fromDate}-to-${applied.toDate}.csv`, [header, ...body]);
  }, [applied, employeeRows]);

  const filterBody = (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter by</p>

      <div className="space-y-1.5">
        <Label>From Date &amp; Time</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <Input className="h-8 text-xs" type="date" value={draft.fromDate} onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })} />
          <Input className="h-8 text-xs" type="time" value={draft.fromTime} onChange={(e) => setDraft({ ...draft, fromTime: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>To Date &amp; Time</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <Input className="h-8 text-xs" type="date" value={draft.toDate} onChange={(e) => setDraft({ ...draft, toDate: e.target.value })} />
          <Input className="h-8 text-xs" type="time" value={draft.toTime} onChange={(e) => setDraft({ ...draft, toTime: e.target.value })} />
        </div>
      </div>

      {isAdmin && (
        <div className="space-y-1.5">
          <Label>Select Employees</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
            {employeeOptions.length === 0 && <p className="text-xs text-muted-foreground">No employees found.</p>}
            {employeeOptions.map((emp) => (
              <label key={emp.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.employeeIds.includes(emp.id)}
                  onCheckedChange={() => setDraft({ ...draft, employeeIds: toggleIn(draft.employeeIds, emp.id) })}
                />
                {emp.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Select Call Type</Label>
        <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
          {CALL_TYPES.map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={draft.callTypes.includes(type)}
                onCheckedChange={() => setDraft({ ...draft, callTypes: toggleIn(draft.callTypes, type) })}
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Select Duration (seconds)</Label>
        <div className="space-y-2">
          <Select value={draft.durationMode} onValueChange={(v) => setDraft({ ...draft, durationMode: v as DurationMode })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="gt">Greater than</SelectItem>
              <SelectItem value="lt">Less than</SelectItem>
              <SelectItem value="between">Between</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {draft.durationMode !== "any" && (
              <Input type="number" min={0} value={draft.durationA} placeholder="0" className="h-8 text-xs"
                onChange={(e) => setDraft({ ...draft, durationA: e.target.value })} />
            )}
            {draft.durationMode === "between" && (
              <Input type="number" min={0} value={draft.durationB} placeholder="60" className="h-8 text-xs"
                onChange={(e) => setDraft({ ...draft, durationB: e.target.value })} />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Select Call Time</Label>
        <div className="space-y-2">
          <Select value={draft.timeMode} onValueChange={(v) => setDraft({ ...draft, timeMode: v as TimeMode })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="after">After</SelectItem>
              <SelectItem value="before">Before</SelectItem>
              <SelectItem value="between">Between</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {draft.timeMode !== "any" && (
              <Input type="time" value={draft.timeA} className="h-8 text-xs"
                onChange={(e) => setDraft({ ...draft, timeA: e.target.value })} />
            )}
            {draft.timeMode === "between" && (
              <Input type="time" value={draft.timeB} className="h-8 text-xs"
                onChange={(e) => setDraft({ ...draft, timeB: e.target.value })} />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 opacity-60">
        <Label className="flex items-center">Select Employee Tags<NotAvailable /></Label>
        <Input disabled placeholder="—" className="h-8 text-xs" />
      </div>
      <div className="space-y-1.5 opacity-60">
        <Label className="flex items-center">Select Call Method<NotAvailable /></Label>
        <Input disabled placeholder="—" className="h-8 text-xs" />
      </div>
      <div className="space-y-1.5 opacity-60">
        <Label className="flex items-center">Ringing Time (Seconds)<NotAvailable /></Label>
        <Input disabled placeholder="—" className="h-8 text-xs" />
      </div>
      <div className="flex items-start gap-2 opacity-60">
        <Checkbox disabled />
        <span className="text-xs leading-5">Exclude numbers mentioned in Exclude Phone Numbers <NotAvailable /></span>
      </div>

      <div className="flex gap-2 border-t pt-3">
        <Button size="sm" className="flex-1" onClick={apply}>Apply</Button>
        <Button size="sm" className="flex-1" variant="outline" onClick={reset}>Reset</Button>
      </div>
    </div>
  );

  const callTypeTable = (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Call Type</th>
            <th className="px-3 py-2 text-right font-medium">Calls</th>
            <th className="px-3 py-2 text-right font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Incoming", summary.incoming.calls, formatReportDuration(summary.incoming.duration)],
            ["Outgoing", summary.outgoing.calls, formatReportDuration(summary.outgoing.duration)],
            ["Missed", summary.missed, "-"],
            ["Rejected", summary.rejected, "-"],
          ].map(([label, count, duration]) => (
            <tr key={label as string} className="border-t">
              <td className="px-3 py-2">{label}</td>
              <td className="px-3 py-2 text-right font-medium">{count}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{duration}</td>
            </tr>
          ))}
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right">{summary.totalCalls}</td>
            <td className="px-3 py-2 text-right">{formatReportDuration(summary.totalDuration)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const tiles = [
    { label: "Never Attended", value: summary.neverAttended },
    { label: "Not Pickup by Client", value: summary.notPickup },
    { label: "Connected Calls", value: summary.connectedCalls },
    { label: "Unique Connected Calls", value: summary.uniqueConnectedCalls },
    { label: "Unique Clients", value: summary.uniqueClients },
    { label: "Working Hours", value: formatReportDuration(summary.workingSeconds) },
  ];

  const empCell = "whitespace-nowrap px-3 py-2 text-right";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Periodic Reports</h1>
          <p className="text-sm text-muted-foreground">{rangeLabel(applied)} (IST)</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="mr-2 h-4 w-4" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="max-h-[min(70vh,640px)] w-[calc(100vw-2rem)] overflow-y-auto p-3 pointer-events-auto sm:w-80"
            >
              {filterBody}
            </PopoverContent>
          </Popover>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={exportSummary}>
                <Download className="mr-2 h-4 w-4" /> Export Summary
              </Button>
              <Button variant="outline" size="sm" onClick={exportEmployees}>
                <Download className="mr-2 h-4 w-4" /> Export Employees
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="Summary">
        <div className="overflow-x-auto">
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="whitespace-nowrap">{tab}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Placeholder tabs removed — only Summary, Day-wise Analysis and Hourly Analysis remain */}


        <TabsContent value="Hourly Analysis">
          <HourlyAnalysisTab calls={calls} names={data?.names ?? new Map()} />
        </TabsContent>

        <TabsContent value="Day-wise Analysis">
          <DayWiseAnalysisTab calls={calls} />
        </TabsContent>


        <TabsContent value="Summary" className="space-y-4">
          {isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not load the report</AlertTitle>
              <AlertDescription>
                {(error as Error)?.message ?? "Unknown error"}
                <Button variant="outline" size="sm" className="ml-3" onClick={() => refetch()}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
              <Skeleton className="h-72 w-full lg:col-span-3" />
            </div>
          ) : calls.length === 0 ? (
            <Card>
              <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                No calls found for this range or filters.
                <Button variant="outline" size="sm" onClick={reset}>Clear</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-base">Call Types</CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={autoRefresh} onValueChange={(v) => setAutoRefresh(v as typeof autoRefresh)}>
                        <SelectTrigger className="h-8 w-[104px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Auto: Off</SelectItem>
                          <SelectItem value="60">Every 1 min</SelectItem>
                          <SelectItem value="300">Every 5 min</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                        <span className="sr-only">Reload summary</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>{callTypeTable}</CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Key Metrics</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    {tiles.map((tile) => (
                      <div key={tile.label} className="rounded-md border bg-muted/30 p-3">
                        <p className="text-lg font-semibold">{tile.value}</p>
                        <p className="text-xs text-muted-foreground">{tile.label}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Calls by Type</CardTitle></CardHeader>
                  <CardContent className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={74}
                          paddingAngle={2}
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {donutData.map((entry) => (
                            <Cell key={entry.name} fill={DONUT_COLORS[entry.name as keyof typeof DONUT_COLORS]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={24} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Employee Summary</CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Show</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                      <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 25, 50].map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-w-full overflow-x-auto rounded-md border">
                    <table className="min-w-max text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th rowSpan={2} className="px-3 py-2 text-left">Sr. No.</th>
                          <th rowSpan={2} className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left">Employee</th>
                          <th rowSpan={2} className={empCell}>Total Calls</th>
                          <th rowSpan={2} className={empCell}>Total Duration</th>
                          <th rowSpan={2} className={empCell}>Connected Calls</th>
                          <th rowSpan={2} className={empCell}>Conn. Calls Duration</th>
                          <th rowSpan={2} className={empCell}>Conn. Call Avg. Duration</th>
                          <th rowSpan={2} className={empCell}>Working Hours</th>
                          <th rowSpan={2} className={empCell}>Unique Clients</th>
                          <th rowSpan={2} className={empCell}>Unique Conn. Calls</th>
                          <th colSpan={5} className="border-l px-3 py-2 text-center">Incoming</th>
                          <th colSpan={5} className="border-l px-3 py-2 text-center">Outgoing</th>
                          <th rowSpan={2} className={cn(empCell, "border-l")}>Missed</th>
                          <th rowSpan={2} className={empCell}>Rejected</th>
                          <th rowSpan={2} className={empCell}>Never Attended</th>
                          <th rowSpan={2} className={empCell}>Not Pickup by Client</th>
                        </tr>
                        <tr>
                          {["Total Call", "Total Duration", "Connected Calls", "Conn. Calls Duration", "Conn. Calls Avg. Duration"].map((h) => (
                            <th key={`in-${h}`} className={cn(empCell, h === "Total Call" && "border-l")}>{h}</th>
                          ))}
                          {["Total Call", "Total Duration", "Connected Calls", "Conn. Calls Duration", "Conn. Calls Avg. Duration"].map((h) => (
                            <th key={`out-${h}`} className={cn(empCell, h === "Total Call" && "border-l")}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedEmployees.map((row: EmployeeSummaryRow, index) => (
                          <tr key={row.employeeId} className="border-t">
                            <td className="px-3 py-2">{(page - 1) * pageSize + index + 1}</td>
                            <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2">
                              <p className="font-medium">{row.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{row.employeeNumber}</p>
                            </td>
                            <td className={empCell}>{row.totalCalls}</td>
                            <td className={empCell}>{formatReportDuration(row.totalDuration)}</td>
                            <td className={empCell}>{row.connectedCalls}</td>
                            <td className={empCell}>{formatReportDuration(row.connectedDuration)}</td>
                            <td className={empCell}>{formatReportDuration(row.connectedAvg)}</td>
                            <td className={empCell}>{formatReportDuration(row.workingSeconds)}</td>
                            <td className={empCell}>{row.uniqueClients}</td>
                            <td className={empCell}>{row.uniqueConnectedCalls}</td>
                            <td className={cn(empCell, "border-l")}>{row.incoming.calls}</td>
                            <td className={empCell}>{formatReportDuration(row.incoming.duration)}</td>
                            <td className={empCell}>{row.incoming.connected}</td>
                            <td className={empCell}>{formatReportDuration(row.incoming.connectedDuration)}</td>
                            <td className={empCell}>{formatReportDuration(row.incoming.connectedAvg)}</td>
                            <td className={cn(empCell, "border-l")}>{row.outgoing.calls}</td>
                            <td className={empCell}>{formatReportDuration(row.outgoing.duration)}</td>
                            <td className={empCell}>{row.outgoing.connected}</td>
                            <td className={empCell}>{formatReportDuration(row.outgoing.connectedDuration)}</td>
                            <td className={empCell}>{formatReportDuration(row.outgoing.connectedAvg)}</td>
                            <td className={cn(empCell, "border-l")}>{row.missed}</td>
                            <td className={empCell}>{row.rejected}</td>
                            <td className={empCell}>{row.neverAttended}</td>
                            <td className={empCell}>{row.notPickup}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={employeeRows.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    pageSizeOptions={[10, 25, 50]}
                    label="employees"
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
