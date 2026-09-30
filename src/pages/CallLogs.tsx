import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Ban,
  CalendarIcon,
  Clock,
  Download,
  Play,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RotateCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { cn } from "@/lib/utils";
import {
  METRIC_DEFS,
  formatDuration,
  isIncoming,
  isMissed,
  isOutgoing,
  isRejected,
  type MetricTone,
} from "@/lib/callLogMetrics";

type CallRow = {
  id: string;
  call_type: string;
  callyzer_log_id?: string | null;
  callyzer_environment?: string | null;
  duration_seconds: number;
  ended_at: string | null;
  lead_id: string | null;
  normalized_phone: string | null;
  notes: string | null;
  patient_id: string | null;
  phone: string | null;
  started_at: string | null;
  status: string;
  telecaller_id: string | null;
};

type DisplayCall = CallRow & {
  callerName: string;
  staffName: string;
  leadStage: string | null;
  source: string;
};

type SummaryPreset = "today" | "yesterday" | "last-7" | "last-30" | "custom";

type DatePreset = "today" | "yesterday" | "week" | "last-week" | "month" | "custom";

const CALL_TYPE_OPTIONS = ["Incoming", "Outgoing", "Missed", "Rejected"] as const;
type CallTypeFilter = (typeof CALL_TYPE_OPTIONS)[number];

const EXPORT_CAP = 50_000;
const EXPORT_WARN = 45_000;
const EXPORT_PAGE = 1_000;

const toneClasses: Record<MetricTone, { tile: string; icon: string }> = {
  neutral: { tile: "bg-muted/40", icon: "bg-muted text-muted-foreground" },
  primary: { tile: "bg-primary/5 border-primary/15", icon: "bg-primary/10 text-primary" },
  success: { tile: "bg-success/5 border-success/15", icon: "bg-success/10 text-success" },
  info: { tile: "bg-info/5 border-info/15", icon: "bg-info/10 text-info" },
  warning: { tile: "bg-warning/5 border-warning/15", icon: "bg-warning/10 text-warning" },
  destructive: { tile: "bg-destructive/5 border-destructive/15", icon: "bg-destructive/10 text-destructive" },
};

const getIndiaDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const toIndiaMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`);
const shiftDateKey = (date: string, days: number) => {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};
const formatDateKey = (date: string) => format(new Date(`${date}T12:00:00Z`), "dd MMM yyyy");

const SUMMARY_PRESET_LABELS: Record<SummaryPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7": "Last 7 Days",
  "last-30": "Last 30 Days",
  custom: "Custom Range",
};

const resolveSummaryRange = (
  preset: SummaryPreset,
  customFrom: Date | undefined,
  customTo: Date | undefined,
): { start: string; end: string; title: string; label: string } => {
  const todayDate = getIndiaDate();
  const dayBounds = (date: string) => ({
    start: toIndiaMidnight(date).toISOString(),
    end: toIndiaMidnight(shiftDateKey(date, 1)).toISOString(),
  });

  switch (preset) {
    case "yesterday": {
      const d = shiftDateKey(todayDate, -1);
      return { ...dayBounds(d), title: "Yesterday", label: `Yesterday (${formatDateKey(d)})` };
    }
    case "last-7": {
      const start = shiftDateKey(todayDate, -6);
      return {
        start: toIndiaMidnight(start).toISOString(),
        end: dayBounds(todayDate).end,
        title: "Last 7 Days",
        label: `Last 7 Days (${formatDateKey(start)} - ${formatDateKey(todayDate)})`,
      };
    }
    case "last-30": {
      const start = shiftDateKey(todayDate, -29);
      return {
        start: toIndiaMidnight(start).toISOString(),
        end: dayBounds(todayDate).end,
        title: "Last 30 Days",
        label: `Last 30 Days (${formatDateKey(start)} - ${formatDateKey(todayDate)})`,
      };
    }
    case "custom": {
      const from = customFrom ?? new Date();
      const to = customTo ?? from;
      const fromKey = format(from, "yyyy-MM-dd");
      const toKey = format(to, "yyyy-MM-dd");
      return {
        start: toIndiaMidnight(fromKey).toISOString(),
        end: toIndiaMidnight(shiftDateKey(toKey, 1)).toISOString(),
        title: "Custom range",
        label: `${format(from, "dd MMM yyyy")} - ${format(to, "dd MMM yyyy")}`,
      };
    }
    default:
      return { ...dayBounds(todayDate), title: "Today", label: `Today (${formatDateKey(todayDate)})` };
  }
};

const resolveDateRange = (
  preset: DatePreset,
  customFrom: Date | undefined,
  customTo: Date | undefined,
): { start: string; end: string; label: string } => {
  const todayDate = getIndiaDate();
  const dayBounds = (date: string) => ({
    start: toIndiaMidnight(date).toISOString(),
    end: toIndiaMidnight(shiftDateKey(date, 1)).toISOString(),
  });
  const indiaCalendarDate = new Date(`${todayDate}T00:00:00Z`);
  const daysSinceMonday = (indiaCalendarDate.getUTCDay() + 6) % 7;
  const thisMondayDate = shiftDateKey(todayDate, -daysSinceMonday);

  switch (preset) {
    case "yesterday": {
      const d = shiftDateKey(todayDate, -1);
      return { ...dayBounds(d), label: `Yesterday (${formatDateKey(d)})` };
    }
    case "week":
      return { start: toIndiaMidnight(thisMondayDate).toISOString(), end: dayBounds(todayDate).end, label: "This week" };
    case "last-week": {
      const start = shiftDateKey(thisMondayDate, -7);
      return { start: toIndiaMidnight(start).toISOString(), end: toIndiaMidnight(thisMondayDate).toISOString(), label: "Last week" };
    }
    case "month": {
      const first = `${todayDate.slice(0, 7)}-01`;
      return { start: toIndiaMidnight(first).toISOString(), end: dayBounds(todayDate).end, label: "This month" };
    }
    case "custom": {
      const from = customFrom ?? new Date();
      const to = customTo ?? from;
      const fromKey = format(from, "yyyy-MM-dd");
      const toKey = format(to, "yyyy-MM-dd");
      return {
        start: toIndiaMidnight(fromKey).toISOString(),
        end: toIndiaMidnight(shiftDateKey(toKey, 1)).toISOString(),
        label: `${format(from, "dd MMM yyyy")} - ${format(to, "dd MMM yyyy")}`,
      };
    }
    default:
      return { ...dayBounds(todayDate), label: `Today (${formatDateKey(todayDate)})` };
  }
};

const LIST_COLUMNS =
  "id, call_type, callyzer_log_id, callyzer_environment, duration_seconds, ended_at, lead_id, normalized_phone, notes, patient_id, phone, started_at, status, telecaller_id";

const resolveDisplay = async (rows: CallRow[]): Promise<DisplayCall[]> => {
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((id): id is string => Boolean(id)))];
  const patientIds = [...new Set(rows.map((row) => row.patient_id).filter((id): id is string => Boolean(id)))];
  const staffIds = [...new Set(rows.map((row) => row.telecaller_id).filter((id): id is string => Boolean(id)))];

  const [leadsResult, patientsResult, staffResult] = await Promise.all([
    leadIds.length
      ? supabase.from("leads").select("id, name, status, source").in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    patientIds.length
      ? supabase.from("patients").select("id, first_name, last_name").in("id", patientIds)
      : Promise.resolve({ data: [], error: null }),
    staffIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = leadsResult.error ?? patientsResult.error ?? staffResult.error;
  if (relatedError) throw relatedError;

  const leads = new Map((leadsResult.data ?? []).map((lead) => [lead.id, lead]));
  const patientNames = new Map(
    (patientsResult.data ?? []).map((patient) => [
      patient.id,
      `${patient.first_name} ${patient.last_name}`.trim(),
    ]),
  );
  const staffNames = new Map((staffResult.data ?? []).map((staff) => [staff.id, staff.full_name]));

  return rows.map((row) => {
    const lead = row.lead_id ? leads.get(row.lead_id) : undefined;
    return {
      ...row,
      callerName: lead?.name ?? (row.patient_id ? patientNames.get(row.patient_id) : undefined) ?? "Unknown",
      staffName: (row.telecaller_id ? staffNames.get(row.telecaller_id) : undefined) ?? "Unassigned",
      leadStage: lead?.status ?? null,
      source: row.callyzer_environment ? `Callyzer (${row.callyzer_environment})` : "Android sync",
    };
  });
};

/** Paginated fetch for any date range (summary card + list share the same fetch). */
const fetchPeriodCalls = async (start: string, end: string): Promise<DisplayCall[]> => {
  const rows: CallRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("call_logs")
      .select(LIST_COLUMNS)
      .gte("started_at", start)
      .lt("started_at", end)
      .order("started_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as CallRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return resolveDisplay(rows);
};

/** Server-side list fetch: date range + telecaller + call type applied in the query. */
const fetchListCalls = async (opts: {
  start: string;
  end: string;
  telecallerIds: string[];
  callTypes: CallTypeFilter[];
}): Promise<DisplayCall[]> => {
  let query = supabase
    .from("call_logs")
    .select(LIST_COLUMNS)
    .gte("started_at", opts.start)
    .lt("started_at", opts.end)
    .order("started_at", { ascending: false });

  if (opts.telecallerIds.length > 0) query = query.in("telecaller_id", opts.telecallerIds);
  if (opts.callTypes.length > 0) {
    const ors: string[] = [];
    for (const type of opts.callTypes) {
      const t = type.toLowerCase();
      if (t === "missed" || t === "rejected") {
        ors.push(`call_type.eq.${t}`, `status.eq.${t}`);
      } else {
        ors.push(`call_type.eq.${t}`);
      }
    }
    query = query.or(ors.join(","));
  }

  const { data, error } = await query.limit(EXPORT_CAP);
  if (error) throw error;
  return resolveDisplay((data ?? []) as CallRow[]);
};

const matchesSearch = (call: DisplayCall, query: string) =>
  [call.callerName, call.phone, call.normalized_phone, call.notes, call.staffName]
    .some((value) => value?.toLocaleLowerCase().includes(query));

const matchesCallType = (call: DisplayCall, types: CallTypeFilter[]) => {
  if (types.length === 0) return true;
  return types.some((type) => {
    switch (type) {
      case "Incoming": return isIncoming(call);
      case "Outgoing": return isOutgoing(call);
      case "Missed": return isMissed(call);
      case "Rejected": return isRejected(call);
    }
  });
};

const csvCell = (value: string | number | null | undefined) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const SummaryPanel = ({
  range,
  calls,
  loading,
  activeMetric,
  onTileClick,
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  range: { title: string; label: string };
  calls: DisplayCall[];
  loading: boolean;
  activeMetric: string | null;
  onTileClick: (metric: string | null) => void;
  preset: SummaryPreset;
  onPresetChange: (preset: SummaryPreset) => void;
  customFrom: Date | undefined;
  customTo: Date | undefined;
  onCustomFromChange: (d: Date | undefined) => void;
  onCustomToChange: (d: Date | undefined) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Card className="shadow-card">
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-lg font-bold font-display">Call Summary</h2>
            <span className="text-[11px] text-muted-foreground">{range.label}</span>
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-start font-normal">
                <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
                {range.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 min-w-[520px]" align="end">
              <div className="flex">
                <div className="w-40 border-r p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Select</p>
                  {(Object.keys(SUMMARY_PRESET_LABELS) as SummaryPreset[]).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={preset === p ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start text-sm"
                      onClick={() => {
                        onPresetChange(p);
                        if (p !== "custom") setOpen(false);
                      }}
                    >
                      {SUMMARY_PRESET_LABELS[p]}
                    </Button>
                  ))}
                </div>
                <div className="p-3 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {preset === "custom" ? "Custom Range" : "Calendar"}
                  </p>
                  <Calendar
                    mode="range"
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={(selected) => {
                      onCustomFromChange(selected?.from);
                      onCustomToChange(selected?.to);
                      if (selected?.from && selected?.to) {
                        onPresetChange("custom");
                        setOpen(false);
                      }
                    }}
                    numberOfMonths={1}
                    initialFocus
                    className={cn("p-0 pointer-events-auto")}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {(loading ? Array.from({ length: 13 }) : METRIC_DEFS).map((def, index) => {
            if (loading) return <Skeleton key={index} className="h-[76px] rounded-lg" />;
            const item = def as (typeof METRIC_DEFS)[number];
            const Icon = item.icon;
            const isActive = activeMetric === item.label;
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => onTileClick(isActive ? null : item.label)}
                className={cn(
                  "flex min-h-[76px] min-w-0 flex-col justify-center rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  toneClasses[item.tone].tile,
                  isActive && "ring-2 ring-primary border-primary/40",
                )}
              >
                <p className="break-words text-xl font-bold font-display leading-none">{item.value(calls)}</p>
                <div className={cn("mt-2 flex min-w-0 items-start gap-1.5 text-[11px] leading-tight", toneClasses[item.tone].icon.split(" ").at(-1))}>
                  <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-words">{item.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  "last-week": "Last week",
  month: "This month",
  custom: "Custom range",
};

const CallLogs = () => {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin" as never);
  const queryClient = useQueryClient();
  const [refreshingRecording, setRefreshingRecording] = useState<string | null>(null);

  // Summary card (single unified range picker, default Today)
  const [summaryPreset, setSummaryPreset] = useState<SummaryPreset>("today");
  const [summaryFrom, setSummaryFrom] = useState<Date | undefined>();
  const [summaryTo, setSummaryTo] = useState<Date | undefined>();
  const [activeMetric, setActiveMetric] = useState<string | null>(null);

  // List filters
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [telecallerIds, setTelecallerIds] = useState<string[]>([]);
  const [callTypes, setCallTypes] = useState<CallTypeFilter[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const metricByHash: Record<string, string> = {
      "#never-attended": "Never Attended",
      "#not-pickup-by-client": "Not Pickup by Client",
      "#client-reports": "Unique Clients",
    };
    setActiveMetric(metricByHash[location.hash] ?? null);
    setSummaryPreset("today");
    setSummaryFrom(undefined);
    setSummaryTo(undefined);
    setDatePreset("today");
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setPage(1);
  }, [location.hash]);

  const summaryRange = useMemo(
    () => resolveSummaryRange(summaryPreset, summaryFrom, summaryTo),
    [summaryPreset, summaryFrom, summaryTo],
  );

  const { data: summaryCalls = [], isLoading, error } = useQuery({
    queryKey: ["call-logs", "summary", summaryRange.start, summaryRange.end],
    queryFn: () => fetchPeriodCalls(summaryRange.start, summaryRange.end),
    refetchInterval: 60_000,
  });

  // List fetch. With an active tile, use the summary's own rows so tile count = list count.
  const tileDef = activeMetric ? METRIC_DEFS.find((d) => d.label === activeMetric) ?? null : null;
  const listRange = useMemo(
    () => (tileDef
      ? { start: summaryRange.start, end: summaryRange.end, label: summaryRange.label }
      : resolveDateRange(datePreset, customFrom, customTo)),
    [tileDef, summaryRange, datePreset, customFrom, customTo],
  );

  const tileCalls = useMemo((): DisplayCall[] | null => {
    if (!tileDef) return null;
    return tileDef.rows(summaryCalls) as DisplayCall[];
  }, [tileDef, summaryCalls]);

  const needsServerList = !tileCalls;
  const { data: serverCalls = [], isLoading: listLoading, error: listError } = useQuery({
    queryKey: ["call-logs", "list", listRange.start, listRange.end, telecallerIds, callTypes],
    enabled: needsServerList,
    refetchInterval: 60_000,
    queryFn: () =>
      fetchListCalls({ start: listRange.start, end: listRange.end, telecallerIds, callTypes }),
  });

  const baseListCalls = tileCalls ?? serverCalls;

  const filteredCalls = useMemo(() => {
    let rows = baseListCalls;
    if (tileCalls) {
      if (telecallerIds.length > 0) rows = rows.filter((c) => c.telecaller_id && telecallerIds.includes(c.telecaller_id));
      rows = rows.filter((c) => matchesCallType(c, callTypes));
    }
    const query = search.trim().toLocaleLowerCase();
    if (query) rows = rows.filter((c) => matchesSearch(c, query));
    return rows;
  }, [baseListCalls, tileCalls, telecallerIds, callTypes, search]);

  const pagedCalls = usePagedSlice(filteredCalls, page, pageSize);

  const { data: telecallerOptions = [] } = useQuery({
    queryKey: ["call-logs", "telecaller-options"],
    queryFn: async () => {
      const { data, error: idsError } = await supabase
        .from("call_logs")
        .select("telecaller_id")
        .not("telecaller_id", "is", null);
      if (idsError) throw idsError;
      const ids = [...new Set((data ?? []).map((row) => row.telecaller_id as string))];
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: staff, error: staffError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (staffError) throw staffError;
      return (staff ?? [])
        .map((s) => ({ id: s.id, name: s.full_name ?? "Unknown" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Callyzer recordings are admin-only and live in their own table (never call_logs.recording_path).
  const { data: recordings = {} } = useQuery({
    queryKey: ["callyzer-recordings", isAdmin, summaryRange.start],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error: recError } = await supabase
        .from("callyzer_call_recordings")
        .select("call_log_id, recording_url");
      if (recError) return {} as Record<string, string>;
      return Object.fromEntries(
        (data ?? []).map((r) => [r.call_log_id, r.recording_url]),
      ) as Record<string, string>;
    },
  });

  const refreshRecording = async (callLogId: string) => {
    setRefreshingRecording(callLogId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/callyzer-recording-refresh`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ callLogId }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Could not refresh the recording link");
        return;
      }
      toast.success("Recording link refreshed");
      queryClient.invalidateQueries({ queryKey: ["callyzer-recordings"] });
    } finally {
      setRefreshingRecording(null);
    }
  };

  const hasFilters =
    search.trim() !== "" ||
    telecallerIds.length > 0 ||
    callTypes.length > 0 ||
    activeMetric !== null ||
    datePreset !== "today";

  const clearAll = () => {
    setSearch("");
    setTelecallerIds([]);
    setCallTypes([]);
    setActiveMetric(null);
    setDatePreset("today");
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setPage(1);
  };

  const exportCsv = async () => {
    const count = filteredCalls.length;
    if (count === 0) {
      toast.error("Nothing to export for the current filters");
      return;
    }
    if (count >= EXPORT_WARN) {
      const proceed = window.confirm(
        `${count.toLocaleString()} rows match — close to the ${EXPORT_CAP.toLocaleString()} row export cap. Export anyway?`,
      );
      if (!proceed) return;
    }
    setExporting(true);
    try {
      const rows = filteredCalls.slice(0, EXPORT_CAP);
      const header = ["Date", "Time (IST)", "Telecaller", "Client name", "Phone", "Call type", "Duration", "Lead stage", "Remarks", "Source"];
      const lines = rows.map((call) => {
        const d = call.started_at ? new Date(call.started_at) : null;
        return [
          csvCell(d ? format(d, "yyyy-MM-dd") : ""),
          csvCell(d ? format(d, "hh:mm a") : ""),
          csvCell(call.staffName),
          csvCell(call.callerName),
          csvCell(call.phone ?? ""),
          csvCell(call.call_type),
          csvCell(formatDuration(call.duration_seconds, true)),
          csvCell(call.leadStage ?? ""),
          csvCell(call.notes ?? ""),
          csvCell(call.source),
        ].join(",");
      });
      const bom = "﻿";
      const blob = new Blob([bom + header.join(",") + "\n" + lines.join("\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `call-logs-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length.toLocaleString()} call logs`);
    } finally {
      setExporting(false);
    }
  };

  const dateLabel =
    datePreset === "custom" && (customFrom || customTo)
      ? resolveDateRange("custom", customFrom, customTo).label
      : DATE_PRESET_LABELS[datePreset];

  const toggleInList = <T,>(list: T[], value: T, setter: (v: T[]) => void) =>
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const filterControls = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date range</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={datePreset === preset ? "secondary" : "outline"}
              onClick={() => { setDatePreset(preset); setActiveMetric(null); setPage(1); }}
            >
              {DATE_PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>
        {datePreset === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-start font-normal">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {customFrom || customTo ? dateLabel : "Pick dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: customFrom, to: customTo }}
                onSelect={(range) => {
                  setCustomFrom(range?.from);
                  setCustomTo(range?.to);
                  setPage(1);
                }}
                numberOfMonths={1}
                initialFocus
                className={cn("p-0 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {isAdmin && telecallerOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Telecaller</p>
          <div className="flex flex-wrap gap-2">
            {telecallerOptions.map(({ id, name }) => (
              <label key={id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox
                  checked={telecallerIds.includes(id)}
                  onCheckedChange={() => { toggleInList(telecallerIds, id, setTelecallerIds); setPage(1); }}
                />
                {name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Call type</p>
        <div className="flex flex-wrap gap-2">
          {CALL_TYPE_OPTIONS.map((type) => (
            <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={callTypes.includes(type)}
                onCheckedChange={() => { toggleInList(callTypes, type, setCallTypes); setPage(1); }}
              />
              {type}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (datePreset !== "today") activeChips.push({ label: dateLabel, onRemove: () => setDatePreset("today") });
  if (activeMetric) {
    activeChips.push({ label: `${summaryRange.title} > ${activeMetric}`, onRemove: () => setActiveMetric(null) });
  }
  for (const id of telecallerIds) {
    const name = telecallerOptions.find((t) => t.id === id)?.name ?? "Telecaller";
    activeChips.push({ label: name, onRemove: () => setTelecallerIds(telecallerIds.filter((v) => v !== id)) });
  }
  for (const type of callTypes) {
    activeChips.push({ label: type, onRemove: () => setCallTypes(callTypes.filter((v) => v !== type)) });
  }

  const effectiveError = error ?? listError;
  const effectiveLoading = isLoading || (needsServerList && listLoading);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 animate-fade-up">
      <section aria-label="Call statistics by period">
        <SummaryPanel
          range={summaryRange}
          calls={summaryCalls}
          loading={isLoading}
          activeMetric={activeMetric}
          onTileClick={(metric) => { setActiveMetric(metric); setPage(1); }}
          preset={summaryPreset}
          onPresetChange={(preset) => { setSummaryPreset(preset); if (preset !== "custom") { setSummaryFrom(undefined); setSummaryTo(undefined); } setPage(1); }}
          customFrom={summaryFrom}
          customTo={summaryTo}
          onCustomFromChange={setSummaryFrom}
          onCustomToChange={setSummaryTo}
        />
      </section>

      <section aria-labelledby="call-logs-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="call-logs-heading" className="text-xl font-bold font-display">Call Logs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Track all telecaller activities</p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportCsv()}
              disabled={exporting || filteredCalls.length === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              {exporting ? "Exporting..." : `Export CSV (${filteredCalls.length.toLocaleString()})`}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Search call logs"
              placeholder="Search name, phone or remarks..."
              className="bg-card pl-9"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </div>

          {/* Desktop inline filters toggle */}
          <div className="hidden md:block">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                  Filters
                  {activeChips.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5">{activeChips.length}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                {filterControls}
              </PopoverContent>
            </Popover>
          </div>

          {/* Mobile filter sheet */}
          <div className="md:hidden">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                  Filters
                  {activeChips.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5">{activeChips.length}</Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{filterControls}</div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className="gap-1 pr-1">
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove filter ${chip.label}`}
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={chip.onRemove}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        )}

        {tileDef?.representative && (
          <p className="text-xs text-muted-foreground">
            {tileDef.label === "Unique Clients"
              ? "Showing the latest call per client."
              : "Showing the first and last call of the period."}
          </p>
        )}

        {effectiveError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Call logs could not be loaded</AlertTitle>
            <AlertDescription>Please refresh the page and try again.</AlertDescription>
          </Alert>
        ) : effectiveLoading ? (
          <Card className="shadow-card"><CardContent className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
          </CardContent></Card>
        ) : filteredCalls.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex min-h-36 flex-col items-center justify-center p-6 text-center">
              <Phone className="mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">{hasFilters ? "No calls match the current filters" : "No calls recorded for this period"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasFilters ? "Try widening the date range or clearing a filter." : "Synced call activity will appear here."}
              </p>
              {hasFilters && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearAll}>
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-card">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {pagedCalls.map((call) => {
                  const callKind = isRejected(call) ? "rejected" : isMissed(call) ? "missed" : isOutgoing(call) ? "outgoing" : "incoming";
                  const config = {
                    incoming: { label: "Incoming", icon: PhoneIncoming, className: "bg-success/10 text-success border-success/20" },
                    outgoing: { label: "Outgoing", icon: PhoneOutgoing, className: "bg-info/10 text-info border-info/20" },
                    missed: { label: "Missed", icon: PhoneMissed, className: "bg-destructive/10 text-destructive border-destructive/20" },
                    rejected: { label: "Rejected", icon: Ban, className: "bg-destructive/10 text-destructive border-destructive/20" },
                  }[callKind];
                  const Icon = config.icon;
                  const callDate = call.started_at ? new Date(call.started_at) : null;

                  return (
                    <article key={call.id} className="p-4 transition-colors hover:bg-secondary/30">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 md:grid-cols-[auto_minmax(10rem,1.1fr)_minmax(12rem,1.6fr)_auto_auto] md:items-center">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", config.className)}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold">{call.callerName}</p>
                            <Badge variant="outline" className={cn("text-[10px]", config.className)}>{config.label}</Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{call.phone || "Phone unavailable"}</p>
                        </div>

                        <div className="text-right md:order-4">
                          <p className="flex items-center justify-end gap-1 text-xs font-medium">
                            <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            {formatDuration(call.duration_seconds, true)}
                          </p>
                          <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                            {callDate ? `${format(callDate, "dd MMM")}, ${format(callDate, "h:mm a")}` : "—"}
                          </p>
                        </div>

                        <p className="col-span-2 col-start-2 line-clamp-2 text-xs text-muted-foreground md:col-span-1 md:col-start-auto md:line-clamp-1">
                          {call.notes || "No remarks added"}
                        </p>

                        <div className="col-span-2 col-start-2 flex items-center gap-1.5 md:col-span-1 md:col-start-auto md:order-5 md:justify-end">
                          <Badge variant="secondary" className="max-w-full text-[10px]">
                            <span className="truncate">{call.staffName}</span>
                          </Badge>
                          {isAdmin && recordings[call.id] && (
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              aria-label="Play call recording"
                            >
                              <a href={recordings[call.id]} target="_blank" rel="noreferrer">
                                <Play className="h-3 w-3" aria-hidden="true" />
                              </a>
                            </Button>
                          )}
                          {isAdmin && call.callyzer_log_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              aria-label="Refresh recording link"
                              disabled={refreshingRecording === call.id}
                              onClick={() => void refreshRecording(call.id)}
                            >
                              <RotateCw
                                className={cn("h-3 w-3", refreshingRecording === call.id && "animate-spin")}
                                aria-hidden="true"
                              />
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={filteredCalls.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[25, 50, 100]}
                label="calls"
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
};

export default CallLogs;
