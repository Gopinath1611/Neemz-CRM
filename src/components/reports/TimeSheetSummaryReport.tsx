import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks,
} from "date-fns";

/**
 * READ-ONLY Time Sheet Summary report.
 * Aggregates employees + attendance_logs (no writes, no schema changes).
 */

type PeriodKey = "this_week" | "last_week" | "this_month" | "last_month";

const PERIODS: { key: PeriodKey; label: string; range: () => { start: Date; end: Date } }[] = [
  { key: "this_week", label: "This Week", range: () => ({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { key: "last_week", label: "Last Week", range: () => ({ start: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), end: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }) }) },
  { key: "this_month", label: "This Month", range: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
  { key: "last_month", label: "Last Month", range: () => ({ start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }) },
];

const PRESENT_STATUSES = new Set(["present", "late", "week_off", "weekoff", "weekly_off", "holiday", "leave", "on_duty", "pending"]);
const HALF_STATUSES = new Set(["half_day", "halfday", "half-day"]);
const ABSENT_STATUSES = new Set(["absent", "lop", "loss_of_pay", "unpaid_leave"]);

interface SummaryRow {
  employeeId: string;
  name: string;
  code: string;
  daysPresent: number;
  totalHours: number;
  present: number;
  halfDay: number;
  absent: number;
  late: number;
}

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function TimeSheetSummaryReport({ fromDate, toDate }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Custom range from the module-level filter bar overrides the preset
  const customRange = fromDate && toDate ? { start: new Date(fromDate), end: new Date(toDate) } : null;

  const activeRange = useMemo(() => {
    if (customRange) return customRange;
    return PERIODS.find((p) => p.key === period)!.range();
  }, [period, fromDate, toDate]);

  const rangeLabel = `${format(activeRange.start, "d MMM yyyy")} - ${format(activeRange.end, "d MMM yyyy")}`;

  const generate = async () => {
    setLoading(true);
    const start = format(activeRange.start, "yyyy-MM-dd");
    const end = format(activeRange.end, "yyyy-MM-dd");
    const [emps, lg] = await Promise.all([
      supabase.from("employees")
        .select("id, first_name, last_name, employee_code")
        .eq("status", "active").order("first_name"),
      supabase.from("attendance_logs")
        .select("employee_id, date, status, hours_worked, worked_seconds, late_entry")
        .gte("date", start).lte("date", end),
    ]);
    if (emps.error) { toast.error(emps.error.message); setLoading(false); return; }
    if (lg.error) { toast.error(lg.error.message); setLoading(false); return; }

    const logsByEmployee = new Map<string, any[]>();
    for (const log of lg.data ?? []) {
      const arr = logsByEmployee.get(log.employee_id) ?? [];
      arr.push(log);
      logsByEmployee.set(log.employee_id, arr);
    }

    const summary: SummaryRow[] = (emps.data ?? []).map((emp: any) => {
      const logs = logsByEmployee.get(emp.id) ?? [];
      // Collapse to one log per day (first wins — logs are unique per employee/date)
      const byDate = new Map<string, any>();
      for (const l of logs) if (!byDate.has(l.date)) byDate.set(l.date, l);

      let present = 0, halfDay = 0, absent = 0, late = 0, totalHours = 0;
      for (const log of byDate.values()) {
        const s = (log.status || "").toLowerCase().trim();
        const isLate = s === "late" || log.late_entry === true;
        if (HALF_STATUSES.has(s)) halfDay += 1;
        else if (ABSENT_STATUSES.has(s)) absent += 1;
        else if (PRESENT_STATUSES.has(s) || s === "") present += 1;
        else present += 1; // unknown statuses count as present
        if (isLate && !ABSENT_STATUSES.has(s)) late += 1;

        const secs = Number(log.worked_seconds || 0);
        const hrs = secs > 0 ? secs / 3600 : Number(log.hours_worked || 0);
        totalHours += hrs;
      }

      return {
        employeeId: emp.id,
        name: `${emp.first_name} ${emp.last_name || ""}`.trim(),
        code: emp.employee_code || "—",
        daysPresent: present + halfDay * 0.5,
        totalHours: Math.round(totalHours * 10) / 10,
        present,
        halfDay,
        absent,
        late,
      };
    });

    setRows(summary);
    setGenerated(true);
    setLoading(false);
    toast.success(`Time sheet summary generated for ${rangeLabel}`);
  };

  // Re-generate automatically when the period changes after first generation
  useEffect(() => {
    if (generated) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, fromDate, toDate]);

  const downloadCSV = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const header = ["Employee ID", "Employee Name", "Total Days Present", "Total Hours Worked", "Present", "Half Day", "Absent", "Late Entries"];
    const body = rows.map((r) => [
      r.code, r.name, r.daysPresent, r.totalHours, r.present, r.halfDay, r.absent, r.late,
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-sheet-summary-${format(activeRange.start, "yyyyMMdd")}-${format(activeRange.end, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Time Sheet Summary exported as CSV");
  };

  return (
    <div className="space-y-4 pt-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)} disabled={!!customRange}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={downloadCSV}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{rangeLabel}</span>
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background py-10 text-center text-sm text-muted-foreground">
          Select a period and click <strong>Generate Report</strong> to load the time sheet summary.
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead className="text-right">Total Days Present</TableHead>
                <TableHead className="text-right">Total Hours Worked</TableHead>
                <TableHead>Status Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.code}</div>
                  </TableCell>
                  <TableCell className="text-right">{r.daysPresent}</TableCell>
                  <TableCell className="text-right">{r.totalHours.toFixed(1)} hrs</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">P: {r.present}</Badge>
                      {r.halfDay > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">HD: {r.halfDay}</Badge>}
                      {r.absent > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">A: {r.absent}</Badge>}
                      {r.late > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Late: {r.late}</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                    No employees found for this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
