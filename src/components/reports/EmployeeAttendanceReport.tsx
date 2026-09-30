import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, ChevronLeft, ChevronRight, Download, Filter } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfDay, endOfDay, isAfter,
} from "date-fns";

/**
 * READ-ONLY Employee Attendance Report matrix.
 * Consumes the same data sources + status model as My Team Attendance
 * (employees / attendance_logs / employee_shifts). No writes.
 */

// Same status model / colors as My Team Attendance
const STATUS_LEGEND = [
  { code: "P", label: "Present", color: "bg-green-500 text-white" },
  { code: "A", label: "Absent", color: "bg-red-500 text-white" },
  { code: "L", label: "Late Entry", color: "bg-amber-500 text-white" },
  { code: "DO", label: "Day Off / Week Off", color: "bg-gray-400 text-white" },
  { code: "1/2 P", label: "Half Day", color: "bg-blue-500 text-white" },
  { code: "OT", label: "OT / Overtime", color: "bg-purple-500 text-white" },
  { code: "M", label: "Manual Entry", color: "bg-orange-500 text-white" },
  { code: "—", label: "Pending / No record", color: "bg-muted text-muted-foreground" },
];
const colorFor = (code: string) =>
  STATUS_LEGEND.find((s) => s.code === code)?.color || "bg-muted text-muted-foreground";

// Identical mapping rules to My Team Attendance, only display labels differ (WO→DO, HD→1/2 P)
const codeFor = (log: any | null, isWeekOff: boolean, isFuture: boolean) => {
  if (isFuture) return "";
  if (!log) return isWeekOff ? "DO" : "—";
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

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function EmployeeAttendanceReport({ fromDate, toDate }: Props) {
  const [from, setFrom] = useState<Date>(startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(endOfMonth(new Date()));
  const [employees, setEmployees] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [jobTitleFilter, setJobTitleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  // Respect the report module's global date filter when provided
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
      const [emps, lg, sh] = await Promise.all([
        supabase.from("employees")
          .select("id, first_name, last_name, employee_code, department, designation, extra_details")
          .eq("status", "active").order("first_name"),
        supabase.from("attendance_logs").select("*").gte("date", start).lte("date", end),
        supabase.from("employee_shifts").select("employee_id, weekly_off_days, effective_from")
          .order("effective_from", { ascending: false }),
      ]);
      if (cancelled) return;
      setEmployees(emps.data || []);
      setLogs(lg.data || []);
      const map: Record<string, number[]> = {};
      sh.data?.forEach((s: any) => { if (!map[s.employee_id]) map[s.employee_id] = s.weekly_off_days || [0]; });
      setShifts(map);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [from, to]);

  const days = useMemo(() => {
    if (isAfter(from, to)) return [];
    return eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) });
  }, [from, to]);

  const logMap = useMemo(() => {
    const m: Record<string, any> = {};
    // Same aggregation as My Team Attendance: one row per employee/date (unique key)
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, safePage * pageSize);

  const today = new Date();

  // ---- Exports (read-only; built from the already-loaded report dataset) ----
  const buildRows = () => {
    const header = ["Employee ID", "Employee Name", "Department", "Job Title", "Band",
      ...days.map((d) => format(d, "EEE MMM dd"))];
    const body = filtered.map((e) => {
      const woDays = shifts[e.id] || [0];
      return [
        e.employee_code || "—",
        `${e.first_name} ${e.last_name || ""}`.trim(),
        e.department || "—",
        e.designation || "—",
        e.extra_details?.band || "—",
        ...days.map((d) => codeFor(logMap[`${e.id}_${format(d, "yyyy-MM-dd")}`] || null, woDays.includes(d.getDay()), d > today) || "—"),
      ];
    });
    return [header, ...body];
  };

  const rangeLabel = `${format(from, "d MMM yyyy")} - ${format(to, "d MMM yyyy")}`;

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
    if (kind === "csv") {
      download(csv, `employee-attendance-${format(from, "yyyyMMdd")}.csv`, "text/csv;charset=utf-8;");
    } else {
      download(csv, `employee-attendance-${format(from, "yyyyMMdd")}.xls`, "application/vnd.ms-excel");
    }
    toast.success(`Employee Attendance Report exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const rows = buildRows();
    const html = `<html><head><title>Employee Attendance Report</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}p{font-size:11px;color:#555}
      table{border-collapse:collapse;font-size:9px}td,th{border:1px solid #ccc;padding:3px 5px;text-align:center}
      th:nth-child(-n+5),td:nth-child(-n+5){text-align:left}
      </style></head><body><h1>Employee Attendance Report</h1><p>${rangeLabel}</p><table>
      <thead><tr>${rows[0].map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to export PDF"); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
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
          Select a date range and click <strong>Generate Report</strong> to load attendance.
        </div>
      ) : (
      <div className="space-y-4">

      {/* Top toolbar */}
      <div className="rounded-lg bg-primary text-primary-foreground px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(from, "d MMM yyyy")} - {format(to, "d MMM yyyy")}
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
          <div className="flex items-center gap-1 text-primary-foreground">
            <Filter className="h-4 w-4" />
          </div>
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
              {["Employee ID", "Employee Name", "Department", "Job Title", "Band"].map((h, i) => (
                <th key={h}
                  className={cn(
                    "sticky z-20 bg-muted px-3 py-2 text-left font-medium border-r whitespace-nowrap",
                    i === 0 && "left-0",
                    i === 1 && "left-[100px]",
                  )}
                  style={i > 1 ? undefined : { minWidth: i === 0 ? 100 : 200 }}
                >{h}</th>
              ))}
              {days.map((d) => (
                <th key={d.toISOString()} className="px-2 py-2 text-center font-medium border-r whitespace-nowrap min-w-[70px]">
                  <div>{format(d, "EEE")}</div>
                  <div className="text-muted-foreground">{format(d, "MMM dd")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((e) => {
              const woDays = shifts[e.id] || [0];
              const name = `${e.first_name} ${e.last_name || ""}`.trim();
              const band = e.extra_details?.band || "—";
              return (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2 border-r whitespace-nowrap" style={{ minWidth: 100 }}>
                    {e.employee_code || "—"}
                  </td>
                  <td className="sticky left-[100px] z-10 bg-background px-3 py-2 border-r whitespace-nowrap" style={{ minWidth: 200 }}>
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold">
                        {initials(name)}
                      </span>
                      <span className="font-medium">{name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 border-r whitespace-nowrap">{e.department || "—"}</td>
                  <td className="px-3 py-2 border-r whitespace-nowrap">{e.designation || "—"}</td>
                  <td className="px-3 py-2 border-r whitespace-nowrap">{band}</td>
                  {days.map((d) => {
                    const key = `${e.id}_${format(d, "yyyy-MM-dd")}`;
                    const log = logMap[key] || null;
                    const code = codeFor(log, woDays.includes(d.getDay()), d > today);
                    const workedOnOff = !!log && woDays.includes(d.getDay());
                    return (
                      <td key={key} className="px-2 py-2 text-center border-r">
                        {code ? (
                          <span className={cn(
                            "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            colorFor(code),
                            workedOnOff && "ring-2 ring-purple-400",
                          )}
                            title={log?.notes || undefined}
                          >
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
              <tr><td colSpan={5 + days.length} className="text-center py-8 text-muted-foreground">No employees match the filters.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={5 + days.length} className="text-center py-8 text-muted-foreground">Loading attendance…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Status Indicators:</span>
        {STATUS_LEGEND.map((s) => (
          <span key={s.code} className="flex items-center gap-1">
            <span className={cn("inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold", s.color)}>{s.code}</span>
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 rounded ring-2 ring-purple-400" /> Worked on Day Off / Holiday
        </span>
      </div>
      </div>
      )}
    </div>
  );
}

