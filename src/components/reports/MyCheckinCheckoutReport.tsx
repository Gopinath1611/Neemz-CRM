import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  AttendanceRecord,
  formatClock,
  formatHoursShort,
} from "@/hooks/useMyAttendance";

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

const statusLabel = (r: AttendanceRecord) => {
  if (!r.check_in_at) return r.status ? r.status.replace(/_/g, " ") : "Absent";
  if (r.late_entry) return "Late entry";
  return r.check_out_at ? "Present" : "In progress";
};

type Row = {
  date: string;
  day: string;
  status: string;
  firstIn: string;
  lastOut: string;
  total: string;
};

export default function MyCheckinCheckoutReport({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!emp) {
      setLoading(false);
      setRows([]);
      toast.error("Your login is not linked to an employee record.");
      return;
    }
    let q = supabase
      .from("attendance_logs")
      .select(
        "id, employee_id, date, check_in, check_out, check_in_at, check_out_at, worked_seconds, hours_worked, status, late_entry, manual_entry",
      )
      .eq("employee_id", emp.id)
      .order("date", { ascending: false });
    if (fromDate) q = q.gte("date", fromDate);
    if (toDate) q = q.lte("date", toDate);
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const recs = (data as AttendanceRecord[]) ?? [];
    setRows(
      recs.map((r) => {
        const secs = recSeconds(r);
        return {
          date: format(parseISO(r.date), "dd MMM yyyy"),
          day: format(parseISO(r.date), "EEEE"),
          status: statusLabel(r),
          firstIn: formatClock(r.check_in_at),
          lastOut: formatClock(r.check_out_at),
          total: secs ? formatHoursShort(secs) : "—",
        };
      }),
    );
    toast.success(`Loaded ${recs.length} record(s)`);
  };

  const exportData = (kind: "csv" | "excel" | "pdf") => {
    if (!rows?.length) {
      toast.error("Generate the report first");
      return;
    }
    const header = ["Date", "Day", "Status", "First in", "Last out", "Total in-time"];
    const body = rows.map((r) => [r.date, r.day, r.status, r.firstIn, r.lastOut, r.total]);
    if (kind === "pdf") {
      const html = `<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">
        <thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<h3>My Check-in / Check-out Report</h3>${html}`);
        w.document.close();
        w.print();
      }
      return;
    }
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], {
      type: kind === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `my-checkin-checkout-report.${kind === "excel" ? "xls" : "csv"}`;
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

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>First in</TableHead>
              <TableHead>Last out</TableHead>
              <TableHead>Total in-time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  Apply filters and click <strong>Generate Report</strong> to load data
                </TableCell>
              </TableRow>
            )}
            {rows?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No attendance records for the selected period
                </TableCell>
              </TableRow>
            )}
            {rows?.map((r, i) => (
              <TableRow key={`${r.date}-${i}`}>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.day}</TableCell>
                <TableCell className="capitalize">{r.status}</TableCell>
                <TableCell>{r.firstIn}</TableCell>
                <TableCell>{r.lastOut}</TableCell>
                <TableCell>{r.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
