import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  AttendanceRecord,
  formatClock,
  formatHoursShort,
  LATE_GRACE_MINUTES,
} from "@/hooks/useMyAttendance";

const EMPTY = "—";

/** Same worked-seconds derivation used by My Attendance */
const recSeconds = (r: AttendanceRecord) => {
  if (r.worked_seconds) return r.worked_seconds;
  if (r.hours_worked) return Math.round(r.hours_worked * 3600);
  if (r.check_in_at && r.check_out_at) {
    return Math.floor(
      (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 1000,
    );
  }
  if (r.check_in_at && r.date === format(new Date(), "yyyy-MM-dd")) {
    return Math.floor((Date.now() - new Date(r.check_in_at).getTime()) / 1000);
  }
  return 0;
};

const shiftMinutes = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

const minutesOfDay = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

const diffLabel = (mins: number | null) =>
  mins && mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : EMPTY;

const HEADERS = [
  "Employee Id", "Employee Name", "Location", "Department", "Date", "Shift",
  "Early Entry", "Late Entry", "Early Exit", "Late Exit", "Net Hours",
  "First In", "Last Out", "Total In-Time", "Total Out-Time",
];

type Row = Record<(typeof HEADERS)[number], string>;

export default function EntryExitReport({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("attendance_logs")
        .select(
          "id, employee_id, date, branch_id, check_in, check_out, check_in_at, check_out_at, worked_seconds, hours_worked, status, late_entry, manual_entry",
        )
        .order("date", { ascending: false });
      if (fromDate) q = q.gte("date", fromDate);
      if (toDate) q = q.lte("date", toDate);
      const { data: logs, error } = await q;
      if (error) throw error;
      const recs = (logs ?? []) as (AttendanceRecord & { branch_id: string | null })[];

      const [{ data: emps }, { data: branches }, { data: shifts }] = await Promise.all([
        supabase.from("employees").select("id, employee_code, first_name, last_name, department, address"),
        supabase.from("branches").select("id, name"),
        supabase
          .from("employee_shifts")
          .select("employee_id, shift_name, start_time, end_time, effective_from")
          .order("effective_from", { ascending: false }),
      ]);

      const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
      const branchMap = new Map((branches ?? []).map((b: any) => [b.id, b.name]));
      const shiftMap = new Map<string, any>();
      (shifts ?? []).forEach((s: any) => {
        if (!shiftMap.has(s.employee_id)) shiftMap.set(s.employee_id, s);
      });

      const built: Row[] = recs.map((r) => {
        const e: any = empMap.get(r.employee_id);
        const sh = shiftMap.get(r.employee_id);
        const start = shiftMinutes(sh?.start_time ?? "09:00:00");
        const end = shiftMinutes(sh?.end_time ?? "18:00:00");
        const inMin = minutesOfDay(r.check_in_at);
        const outMin = minutesOfDay(r.check_out_at);
        const secs = recSeconds(r);
        const shiftSpan =
          start != null && end != null ? Math.max(0, end - start) * 60 : 0;
        const outTime = shiftSpan && secs ? Math.max(0, shiftSpan - secs) : 0;

        return {
          "Employee Id": e?.employee_code || EMPTY,
          "Employee Name":
            e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || EMPTY : EMPTY,
          Location: (r.branch_id && branchMap.get(r.branch_id)) || e?.address || EMPTY,
          Department: e?.department || EMPTY,
          Date: format(parseISO(r.date), "dd MMM yyyy"),
          Shift: sh?.shift_name || "General",
          "Early Entry":
            inMin != null && start != null ? diffLabel(start - inMin) : EMPTY,
          "Late Entry":
            inMin != null && start != null
              ? diffLabel(inMin - start - LATE_GRACE_MINUTES > 0 ? inMin - start : 0)
              : EMPTY,
          "Early Exit":
            outMin != null && end != null ? diffLabel(end - outMin) : EMPTY,
          "Late Exit":
            outMin != null && end != null ? diffLabel(outMin - end) : EMPTY,
          "Net Hours": secs ? formatHoursShort(secs) : EMPTY,
          "First In": formatClock(r.check_in_at),
          "Last Out": formatClock(r.check_out_at),
          "Total In-Time": secs ? formatHoursShort(secs) : EMPTY,
          "Total Out-Time": outTime ? formatHoursShort(outTime) : EMPTY,
        };
      });

      setRows(built);
      toast.success(`Loaded ${built.length} record(s)`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const exportData = (kind: "csv" | "excel" | "pdf") => {
    if (!rows?.length) {
      toast.error("Generate the report first");
      return;
    }
    const body = rows.map((r) => HEADERS.map((h) => r[h]));
    if (kind === "pdf") {
      const html = `<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:12px">
        <thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<h3>Entry &amp; Exit Report</h3>${html}`);
        w.document.close();
        w.print();
      }
      return;
    }
    const csv = [HEADERS, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], {
      type: kind === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `entry-exit-report.${kind === "excel" ? "xls" : "csv"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 pt-4">
        <Button size="sm" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportData("csv")}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportData("excel")}>
          <Download className="h-3 w-3 mr-1" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportData("pdf")}>
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {HEADERS.map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows && (
              <TableRow>
                <TableCell colSpan={HEADERS.length} className="text-center text-sm text-muted-foreground py-8">
                  Apply filters and click <strong>Generate Report</strong> to load data
                </TableCell>
              </TableRow>
            )}
            {rows?.length === 0 && (
              <TableRow>
                <TableCell colSpan={HEADERS.length} className="text-center text-sm text-muted-foreground py-8">
                  No attendance records for the selected period
                </TableCell>
              </TableRow>
            )}
            {rows?.map((r, i) => (
              <TableRow key={i}>
                {HEADERS.map((h) => (
                  <TableCell key={h} className="whitespace-nowrap text-sm">{r[h]}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
