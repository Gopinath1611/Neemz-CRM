import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Grace Period Non-Compliance Report.
 * Aggregates the same attendance data used by My Team Attendance
 * (attendance_logs + employee_shifts + employees) into a monthly
 * non-compliance summary. No writes, no schema changes.
 */

const DASH = "—";
const GRACE_ALLOWANCE = 2; // free occurrences per metric per month
const DEDUCTION_PER_FAILURE = 0.25; // day(s)

const COLUMNS = [
  "Employee id", "Employee name",
  "Late entries (count)", "Late entries (dates)",
  "Early exit (count)", "Early exit (dates)",
  "Less working hours (count)", "Less working hours (dates)",
  "No. of grace period policy failures", "Total deductions",
];

const toMinutes = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const dayLabel = (d: number) => `${d} Day(s)`;

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function GracePeriodReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => (fromDate ? startOfMonth(parseISO(fromDate)) : startOfMonth(new Date())));
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // filters
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [onlyFailures, setOnlyFailures] = useState("all");
  const [departments, setDepartments] = useState<string[]>([]);

  const start = format(startOfMonth(month), "yyyy-MM-dd");
  const end = format(endOfMonth(month), "yyyy-MM-dd");

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [logs, emps, shifts] = await Promise.all([
        supabase.from("attendance_logs").select("*").gte("date", start).lte("date", end),
        supabase.from("employees")
          .select("id, first_name, last_name, employee_code, department, designation")
          .eq("status", "active").order("first_name"),
        supabase.from("employee_shifts")
          .select("employee_id, shift_name, start_time, end_time, effective_from")
          .order("effective_from", { ascending: false }),
      ]);
      if (cancelled) return;

      const shiftByEmp: Record<string, any> = {};
      (shifts.data || []).forEach((s: any) => { if (!shiftByEmp[s.employee_id]) shiftByEmp[s.employee_id] = s; });

      const logsByEmp: Record<string, any[]> = {};
      (logs.data || []).forEach((l: any) => {
        (logsByEmp[l.employee_id] ||= []).push(l);
      });

      const built = (emps.data || []).map((e: any) => {
        const shift = shiftByEmp[e.id];
        const shiftStart = toMinutes(shift?.start_time) ?? 9 * 60;
        const shiftEnd = toMinutes(shift?.end_time) ?? 18 * 60;
        const expectedHours = Math.max(1, (shiftEnd - shiftStart) / 60);

        const late: string[] = [];
        const early: string[] = [];
        const less: string[] = [];

        (logsByEmp[e.id] || [])
          .sort((a, b) => a.date.localeCompare(b.date))
          .forEach((l: any) => {
            if (l.status === "leave" || l.status === "absent") return;
            const label = format(parseISO(l.date), "dd MMM");
            const inMin = toMinutes(l.check_in);
            const outMin = toMinutes(l.check_out);
            if (l.late_entry || l.status === "late" || (inMin !== null && inMin > shiftStart)) late.push(label);
            if (outMin !== null && outMin < shiftEnd) early.push(label);
            const worked = l.hours_worked ?? (l.worked_seconds ? l.worked_seconds / 3600 : null);
            if (worked !== null && worked < expectedHours) less.push(label);
          });

        const failures =
          Math.max(0, late.length - GRACE_ALLOWANCE) +
          Math.max(0, early.length - GRACE_ALLOWANCE) +
          Math.max(0, less.length - GRACE_ALLOWANCE);

        return {
          id: e.id,
          employeeId: e.employee_code || DASH,
          name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || DASH,
          department: e.department || DASH,
          shiftName: shift?.shift_name || DASH,
          late, early, less,
          failures,
          deduction: failures * DEDUCTION_PER_FAILURE,
        };
      });

      setDepartments(Array.from(new Set(built.map((r) => r.department).filter((d) => d !== DASH))));
      setRows(built);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated, start, end]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (search && !`${r.employeeId} ${r.name}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (department !== "all" && r.department !== department) return false;
    if (onlyFailures === "failures" && r.failures === 0) return false;
    if (onlyFailures === "compliant" && r.failures > 0) return false;
    return true;
  }), [rows, search, department, onlyFailures]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const table = useMemo(() => filtered.map((r) => [
    r.employeeId, r.name,
    r.late.length, r.late.join(", ") || DASH,
    r.early.length, r.early.join(", ") || DASH,
    r.less.length, r.less.join(", ") || DASH,
    r.failures, dayLabel(r.deduction),
  ]), [filtered]);

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportDelimited = (kind: "csv" | "excel") => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const csv = [COLUMNS, ...table]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download(
      csv,
      `grace-period-noncompliance-${format(month, "yyyy-MM")}.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Report exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const html = `<html><head><title>Grace Period Non-Compliance Report</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}p{font-size:11px;color:#555}
      table{border-collapse:collapse;font-size:9px;width:100%}td,th{border:1px solid #ccc;padding:3px 5px;text-align:left}
      </style></head><body><h1>Grace Period Non-Compliance Report</h1><p>${format(month, "MMMM yyyy")}</p><table>
      <thead><tr>${COLUMNS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${table.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to export PDF"); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { setGenerated(true); setPage(1); }}>Generate Report</Button>
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
          Select filters and click <strong>Generate Report</strong> to load data
        </div>
      ) : (
        <div className="space-y-2">
          {/* Blue control bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-primary px-3 py-2 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search employee"
                  className="h-8 w-44 pl-7 bg-background text-foreground"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-8 gap-1">
                    <Filter className="h-3.5 w-3.5" /> Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    <Select value={department} onValueChange={(v) => { setDepartment(v); setPage(1); }}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Compliance</Label>
                    <Select value={onlyFailures} onValueChange={(v) => { setOnlyFailures(v); setPage(1); }}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        <SelectItem value="failures">Only policy failures</SelectItem>
                        <SelectItem value="compliant">Only compliant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="rounded-b-md border overflow-x-auto bg-background">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th rowSpan={2} className="p-2 text-left sticky left-0 bg-muted/60 min-w-[220px]">Employee</th>
                  <th rowSpan={2} className="p-2 text-left whitespace-nowrap">Employee id</th>
                  <th colSpan={2} className="p-2 text-center border-l">Late entries</th>
                  <th colSpan={2} className="p-2 text-center border-l">Early exit</th>
                  <th colSpan={2} className="p-2 text-center border-l">Less working hours</th>
                  <th rowSpan={2} className="p-2 text-center border-l whitespace-nowrap">No. of grace period<br />policy failures</th>
                  <th rowSpan={2} className="p-2 text-center border-l whitespace-nowrap">Total deductions</th>
                </tr>
                <tr className="bg-muted/40">
                  <th className="p-2 text-center border-l">Count</th>
                  <th className="p-2 text-left">Date(s)</th>
                  <th className="p-2 text-center border-l">Count</th>
                  <th className="p-2 text-left">Date(s)</th>
                  <th className="p-2 text-center border-l">Count</th>
                  <th className="p-2 text-left">Date(s)</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 align-top">
                    <td className="p-2 sticky left-0 bg-background border-r">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {initials(r.name)}
                        </span>
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground">{r.department} • {r.shiftName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.employeeId}</td>
                    <td className="p-2 text-center border-l font-medium">{r.late.length}</td>
                    <td className="p-2 max-w-[180px]">{r.late.join(", ") || DASH}</td>
                    <td className="p-2 text-center border-l font-medium">{r.early.length}</td>
                    <td className="p-2 max-w-[180px]">{r.early.join(", ") || DASH}</td>
                    <td className="p-2 text-center border-l font-medium">{r.less.length}</td>
                    <td className="p-2 max-w-[180px]">{r.less.join(", ") || DASH}</td>
                    <td className="p-2 text-center border-l">
                      <Badge variant={r.failures > 0 ? "destructive" : "outline"} className="text-[10px]">{r.failures}</Badge>
                    </td>
                    <td className="p-2 text-center border-l whitespace-nowrap font-medium">{dayLabel(r.deduction)}</td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No records for {format(month, "MMMM yyyy")}.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Loading attendance data…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              label="employees"
            />
          )}

          <p className="text-[10px] text-muted-foreground">
            Grace policy: first {GRACE_ALLOWANCE} occurrences per metric per month are waived; each additional
            occurrence deducts {DEDUCTION_PER_FAILURE} Day(s).
          </p>
        </div>
      )}
    </div>
  );
}
