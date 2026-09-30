import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarIcon, ChevronLeft, ChevronRight, Download, Filter, Columns3, GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfDay, endOfDay, isAfter,
} from "date-fns";

/**
 * READ-ONLY Attendance Summary Report.
 * Same data sources + status model as My Team Attendance
 * (employees / attendance_logs / employee_shifts / holidays / leave_requests). No writes.
 */

const STATUS_LEGEND = [
  { code: "P", label: "Present", color: "bg-green-500 text-white" },
  { code: "A", label: "Absent", color: "bg-red-500 text-white" },
  { code: "L", label: "Late Entry", color: "bg-amber-500 text-white" },
  { code: "DO", label: "Day Off / Week Off", color: "bg-gray-400 text-white" },
  { code: "H", label: "Holiday", color: "bg-teal-500 text-white" },
  { code: "1/2 P", label: "Half Day", color: "bg-blue-500 text-white" },
  { code: "OT", label: "OT / Overtime", color: "bg-purple-500 text-white" },
  { code: "—", label: "Pending / No record", color: "bg-muted text-muted-foreground" },
];
const colorFor = (code: string) =>
  STATUS_LEGEND.find((s) => s.code === code)?.color || "bg-muted text-muted-foreground";

const codeFor = (log: any | null, isWeekOff: boolean, isHoliday: boolean, isFuture: boolean) => {
  if (isFuture) return "";
  if (!log) {
    if (isHoliday) return "H";
    return isWeekOff ? "DO" : "—";
  }
  if (log.overtime_hours > 0) return "OT";
  if (log.status === "late") return "L";
  if (log.status === "half_day") return "1/2 P";
  if (log.status === "leave") return "DO";
  if (log.status === "absent") return "A";
  return "P";
};

const PAGE_SIZES = [10, 25, 50, 100];

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");

const PAID_LEAVE_TYPES = ["casual", "sick", "earned", "privilege", "paid", "cl", "sl", "el", "pl"];
const isPaidLeaveType = (t?: string | null) => {
  const v = (t || "").toLowerCase();
  if (!v) return true;
  if (v.includes("unpaid") || v.includes("lop") || v.includes("loss of pay")) return false;
  return PAID_LEAVE_TYPES.some((p) => v.includes(p)) || true;
};

const hhmm = (mins: number) => {
  if (!mins || mins <= 0) return "00:00";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const timeOf = (ts?: string | null) => (ts ? format(new Date(ts), "HH:mm") : "—");

// Summary column definitions (order = display order, reorderable in the column modal)
const SUMMARY_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
  { key: "employee_id", label: "Employee id", width: 110, sticky: true },
  { key: "employee_name", label: "Employee name", width: 200, sticky: true },
  { key: "pay_period", label: "Pay period", width: 150 },
  { key: "working_days", label: "Number of working day(s)", width: 150 },
  { key: "day_offs", label: "Number of day off(s)", width: 140 },
  { key: "holidays", label: "Number of holiday(s)", width: 140 },
  { key: "present_days", label: "Number of present day(s)", width: 160 },
  { key: "paid_leaves", label: "Number of paid leaves", width: 150 },
  { key: "unpaid_leaves", label: "Number of unpaid leaves", width: 160 },
  { key: "absent_days", label: "Number of absent day(s)", width: 155 },
  { key: "total_in", label: "Total in-time", width: 120 },
  { key: "total_out", label: "Total out-time", width: 120 },
  { key: "net_hours", label: "Net hours", width: 110 },
  { key: "net_ot", label: "Net overtime working hours", width: 175 },
  { key: "net_less", label: "Net less working hours", width: 160 },
  { key: "payable_days", label: "Number of payable day(s)", width: 160 },
  { key: "payable_hourly", label: "Number of payable day(s) of hourly shifts", width: 220 },
  { key: "lop_days", label: "Total LOP day(s)", width: 130 },
];

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function AttendanceSummaryReport({ fromDate, toDate }: Props) {
  const [from, setFrom] = useState<Date>(startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(endOfMonth(new Date()));
  const [employees, setEmployees] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Record<string, any>>({});
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [jobTitleFilter, setJobTitleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [colOpen, setColOpen] = useState(false);
  const [colOrder, setColOrder] = useState<string[]>(SUMMARY_COLUMNS.map((c) => c.key));
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, true])),
  );
  const [showDayWise, setShowDayWise] = useState(true);
  const [dragKey, setDragKey] = useState<string | null>(null);

  useEffect(() => {
    if (fromDate) setFrom(startOfDay(new Date(fromDate)));
    if (toDate) setTo(endOfDay(new Date(toDate)));
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const start = format(from, "yyyy-MM-dd");
      const end = format(to, "yyyy-MM-dd");
      const [emps, lg, sh, hol, lv] = await Promise.all([
        supabase.from("employees")
          .select("id, first_name, last_name, employee_code, department, designation, extra_details")
          .eq("status", "active").order("first_name"),
        supabase.from("attendance_logs").select("*").gte("date", start).lte("date", end),
        supabase.from("employee_shifts")
          .select("employee_id, weekly_off_days, effective_from, shift_start, shift_end")
          .order("effective_from", { ascending: false }),
        supabase.from("holidays").select("holiday_date").gte("holiday_date", start).lte("holiday_date", end),
        supabase.from("leave_requests").select("employee_id, leave_type, days, start_date, end_date, status")
          .lte("start_date", end).gte("end_date", start),
      ]);
      if (cancelled) return;
      setEmployees(emps.data || []);
      setLogs(lg.data || []);
      const map: Record<string, any> = {};
      sh.data?.forEach((s: any) => { if (!map[s.employee_id]) map[s.employee_id] = s; });
      setShifts(map);
      setHolidayDates(new Set((hol.data || []).map((h: any) => h.holiday_date)));
      setLeaves((lv.data || []).filter((l: any) => (l.status || "").toLowerCase() === "approved"));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated, from, to]);

  const days = useMemo(() => {
    if (isAfter(from, to)) return [];
    return eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) });
  }, [from, to]);

  const logMap = useMemo(() => {
    const m: Record<string, any> = {};
    logs.forEach((l) => { m[`${l.employee_id}_${l.date}`] = l; });
    return m;
  }, [logs]);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter(Boolean))) as string[],
    [employees],
  );
  const jobTitles = useMemo(
    () => Array.from(new Set(employees.map((e) => e.designation).filter(Boolean))) as string[],
    [employees],
  );

  const filtered = useMemo(() => employees.filter((e) => {
    const name = `${e.employee_code || ""} ${e.first_name} ${e.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (departmentFilter !== "all" && e.department !== departmentFilter) return false;
    if (jobTitleFilter !== "all" && e.designation !== jobTitleFilter) return false;
    return true;
  }), [employees, search, departmentFilter, jobTitleFilter]);

  const today = new Date();
  const payPeriod = `${format(from, "d MMM yyyy")} - ${format(to, "d MMM yyyy")}`;

  // ---- Per-employee summary aggregation (read-only) ----
  const summaries = useMemo(() => {
    const out: Record<string, any> = {};
    filtered.forEach((e) => {
      const sh = shifts[e.id];
      const woDays: number[] = sh?.weekly_off_days || [0];
      let dayOffs = 0, holidays = 0, workingDays = 0, present = 0, absent = 0, half = 0;
      let workedMins = 0, otMins = 0, firstIn = "", lastOut = "";
      days.forEach((d) => {
        const ds = format(d, "yyyy-MM-dd");
        const isFuture = d > today;
        const isHol = holidayDates.has(ds);
        const isWO = woDays.includes(d.getDay());
        const log = logMap[`${e.id}_${ds}`] || null;
        if (isHol) holidays += 1;
        else if (isWO) dayOffs += 1;
        else if (!isFuture) workingDays += 1;
        if (!log) {
          if (!isFuture && !isHol && !isWO) absent += 1;
          return;
        }
        if (log.status === "half_day") { half += 1; present += 0.5; }
        else if (log.status === "absent") absent += 1;
        else if (log.status !== "leave") present += 1;
        const mins = log.worked_seconds ? log.worked_seconds / 60 : (log.hours_worked || 0) * 60;
        workedMins += mins;
        otMins += (log.overtime_hours || 0) * 60;
        if (log.check_in_time && !firstIn) firstIn = timeOf(log.check_in_time);
        if (log.check_out_time) lastOut = timeOf(log.check_out_time);
      });
      const empLeaves = leaves.filter((l) => l.employee_id === e.id);
      let paidLeaves = 0, unpaidLeaves = 0;
      empLeaves.forEach((l) => {
        const d = Number(l.days) || 0;
        if (isPaidLeaveType(l.leave_type)) paidLeaves += d; else unpaidLeaves += d;
      });
      const expectedMins = workingDays * 8 * 60;
      const lessMins = Math.max(0, expectedMins - workedMins);
      const payable = present + paidLeaves + dayOffs + holidays;
      out[e.id] = {
        pay_period: payPeriod,
        working_days: workingDays,
        day_offs: dayOffs,
        holidays,
        present_days: present,
        paid_leaves: paidLeaves,
        unpaid_leaves: unpaidLeaves,
        absent_days: absent,
        total_in: firstIn || "—",
        total_out: lastOut || "—",
        net_hours: hhmm(workedMins),
        net_ot: hhmm(otMins),
        net_less: hhmm(lessMins),
        payable_days: Number(payable.toFixed(2)),
        payable_hourly: sh?.shift_start ? Number((workedMins / (8 * 60)).toFixed(2)) : 0,
        lop_days: Number((absent + unpaidLeaves).toFixed(2)),
        half_days: half,
      };
    });
    return out;
  }, [filtered, days, logMap, shifts, holidayDates, leaves, payPeriod]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, safePage * pageSize);

  const orderedCols = useMemo(
    () => colOrder
      .map((k) => SUMMARY_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && visible[c.key]),
    [colOrder, visible],
  );

  const cellValue = (e: any, key: string) => {
    const s = summaries[e.id] || {};
    switch (key) {
      case "employee_id": return e.employee_code || "—";
      case "employee_name": return `${e.first_name} ${e.last_name || ""}`.trim();
      default: return s[key] ?? "—";
    }
  };

  // ---- Exports ----
  const buildRows = () => {
    const header = [
      ...orderedCols.map((c) => c.label),
      ...(showDayWise ? days.map((d) => format(d, "EEE MMM dd")) : []),
    ];
    const body = filtered.map((e) => {
      const woDays: number[] = shifts[e.id]?.weekly_off_days || [0];
      return [
        ...orderedCols.map((c) => String(cellValue(e, c.key))),
        ...(showDayWise ? days.map((d) => {
          const ds = format(d, "yyyy-MM-dd");
          return codeFor(logMap[`${e.id}_${ds}`] || null, woDays.includes(d.getDay()), holidayDates.has(ds), d > today) || "—";
        }) : []),
      ];
    });
    return [header, ...body];
  };

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportDelimited = (kind: "csv" | "excel") => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const rows = buildRows();
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const base = `attendance-summary-${format(from, "yyyyMMdd")}`;
    if (kind === "csv") download(csv, `${base}.csv`, "text/csv;charset=utf-8;");
    else download(csv, `${base}.xls`, "application/vnd.ms-excel");
    toast.success(`Attendance Summary Report exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const rows = buildRows();
    const html = `<html><head><title>Attendance Summary Report</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}p{font-size:11px;color:#555}
      table{border-collapse:collapse;font-size:8px}td,th{border:1px solid #ccc;padding:3px 4px;text-align:center}
      th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}
      </style></head><body><h1>Attendance Summary Report</h1><p>${payPeriod}</p><table>
      <thead><tr>${rows[0].map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to export PDF"); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  // ---- Column modal drag reorder ----
  const onDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    setColOrder((prev) => {
      const next = prev.filter((k) => k !== dragKey);
      next.splice(next.indexOf(targetKey), 0, dragKey);
      return next;
    });
    setDragKey(null);
  };

  return (
    <div className="space-y-4 pt-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { setGenerated(true); setPage(1); }}>
          Generate Report
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportDelimited("csv")}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportDelimited("excel")}>
          <Download className="h-3 w-3 mr-1" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={exportPDF}>
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background py-10 text-center text-sm text-muted-foreground">
          Select a pay period and click <strong>Generate Report</strong> to load the attendance summary.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="rounded-lg bg-primary text-primary-foreground px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {payPeriod}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div>
                      <p className="text-xs font-medium mb-1 text-muted-foreground">From</p>
                      <Calendar mode="single" selected={from}
                        onSelect={(d) => { if (d) { setFrom(startOfDay(d)); setPage(1); } }}
                        className={cn("p-2 pointer-events-auto")} />
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-1 text-muted-foreground">To</p>
                      <Calendar mode="single" selected={to}
                        onSelect={(d) => { if (d) { setTo(endOfDay(d)); setPage(1); } }}
                        className={cn("p-2 pointer-events-auto")} />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setFrom(startOfMonth(new Date())); setTo(endOfMonth(new Date())); setPage(1);
                    }}>Current month</Button>
                  </div>
                </PopoverContent>
              </Popover>
              <span className="text-xs opacity-90">{days.length} days</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4" />
              <Input
                placeholder="Search employee…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 w-40 bg-background text-foreground"
              />
              <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 bg-background text-foreground"><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={jobTitleFilter} onValueChange={(v) => { setJobTitleFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 bg-background text-foreground"><SelectValue placeholder="Job Title" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Job Titles</SelectItem>
                  {jobTitles.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" className="gap-1" onClick={() => setColOpen(true)}>
                <Columns3 className="h-4 w-4" /> Columns
              </Button>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-20 bg-background text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs">{rangeStart}-{rangeEnd} of {filtered.length}</span>
              <Button variant="secondary" size="icon" className="h-8 w-8" disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="secondary" size="icon" className="h-8 w-8" disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Matrix */}
          <div className="rounded-md border bg-background overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  {orderedCols.map((c, i) => (
                    <th key={c.key}
                      className={cn(
                        "bg-muted px-3 py-2 text-left font-medium border-r whitespace-nowrap align-bottom",
                        c.sticky && i < 2 && "sticky z-20",
                        c.sticky && i === 0 && "left-0",
                        c.sticky && i === 1 && "left-[110px]",
                      )}
                      style={{ minWidth: c.width }}
                    >{c.label}</th>
                  ))}
                  {showDayWise && days.map((d) => (
                    <th key={d.toISOString()} className="px-2 py-2 text-center font-medium border-r whitespace-nowrap min-w-[70px]">
                      <div>{format(d, "EEE")}</div>
                      <div className="text-muted-foreground">{format(d, "MMM dd")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e) => {
                  const woDays: number[] = shifts[e.id]?.weekly_off_days || [0];
                  const name = `${e.first_name} ${e.last_name || ""}`.trim();
                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/30">
                      {orderedCols.map((c, i) => (
                        <td key={c.key}
                          className={cn(
                            "px-3 py-2 border-r whitespace-nowrap",
                            c.sticky && i < 2 && "sticky z-10 bg-background",
                            c.sticky && i === 0 && "left-0",
                            c.sticky && i === 1 && "left-[110px]",
                          )}
                          style={{ minWidth: c.width }}
                        >
                          {c.key === "employee_name" ? (
                            <div className="flex items-center gap-2">
                              <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold">
                                {initials(name)}
                              </span>
                              <span className="font-medium">{name}</span>
                            </div>
                          ) : String(cellValue(e, c.key))}
                        </td>
                      ))}
                      {showDayWise && days.map((d) => {
                        const ds = format(d, "yyyy-MM-dd");
                        const log = logMap[`${e.id}_${ds}`] || null;
                        const code = codeFor(log, woDays.includes(d.getDay()), holidayDates.has(ds), d > today);
                        const workedOnOff = !!log && woDays.includes(d.getDay());
                        return (
                          <td key={ds} className="px-2 py-2 text-center border-r">
                            {code ? (
                              <span className={cn(
                                "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                colorFor(code),
                                workedOnOff && "ring-2 ring-purple-400",
                              )} title={log?.notes || undefined}>
                                {code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {!loading && paged.length === 0 && (
                  <tr><td colSpan={orderedCols.length + (showDayWise ? days.length : 0)} className="text-center py-8 text-muted-foreground">
                    No employees match the filters.
                  </td></tr>
                )}
                {loading && (
                  <tr><td colSpan={orderedCols.length + (showDayWise ? days.length : 0)} className="text-center py-8 text-muted-foreground">
                    Loading attendance summary…
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Status Indicators:</span>
            {STATUS_LEGEND.map((s) => (
              <span key={s.code} className="flex items-center gap-1">
                <span className={cn("inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold", s.color)}>
                  {s.code}
                </span>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Column visibility modal */}
      <Dialog open={colOpen} onOpenChange={setColOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose columns</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto space-y-1 pr-1">
            {colOrder.map((key) => {
              const col = SUMMARY_COLUMNS.find((c) => c.key === key)!;
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setDragKey(key)}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => onDrop(key)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 bg-background cursor-grab",
                    dragKey === key && "opacity-50",
                  )}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Checkbox
                    id={`col-${key}`}
                    checked={visible[key]}
                    onCheckedChange={(v) => setVisible((p) => ({ ...p, [key]: !!v }))}
                  />
                  <label htmlFor={`col-${key}`} className="text-sm cursor-pointer">{col.label}</label>
                </div>
              );
            })}
            <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 bg-muted/30">
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <Checkbox id="col-daywise" checked={showDayWise} onCheckedChange={(v) => setShowDayWise(!!v)} />
              <label htmlFor="col-daywise" className="text-sm cursor-pointer">Day-wise details (per-date columns)</label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setVisible(Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, true])));
              setColOrder(SUMMARY_COLUMNS.map((c) => c.key));
              setShowDayWise(true);
            }}>Reset</Button>
            <Button size="sm" onClick={() => setColOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
