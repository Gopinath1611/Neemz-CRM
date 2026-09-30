import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface Props {
  fromDate?: string;
  toDate?: string;
}

type Row = {
  employee_id: string;
  employee_name: string;
  location: string;
  job_title: string;
  department: string;
  role: string;
  band: string;
  leave_year: string;
  co_approved: number;
  co_available: number;
  co_consumed: number;
  lop_accrued: number;
  lop_available: number;
  lop_consumed: number;
  lop_customized: number;
  lop_from_last_year: number;
  lop_to_next_year: number;
  lop_encashed: number;
};

const isLop = (t?: string | null) => {
  const v = (t || "").toLowerCase();
  return v.includes("lop") || v.includes("unpaid") || v.includes("loss of pay");
};
const isCompOff = (t?: string | null) => {
  const v = (t || "").toLowerCase();
  return v.includes("comp") && v.includes("off");
};

const HOURS_PER_DAY = 8;

export default function AvailableLeaveSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const year = (fromDate || new Date().toISOString()).slice(0, 4);
  const from = fromDate || `${year}-01-01`;
  const to = toDate || `${year}-12-31`;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: emps }, { data: leaves }, { data: compOffs }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_code, first_name, last_name, designation, department, employment_type, extra_details")
          .order("employee_code", { ascending: true }),
        supabase
          .from("leave_requests")
          .select("employee_id, leave_type, days, status, start_date"),
        supabase.from("comp_off_requests").select("*"),
      ]);

      const inRange = (d?: string | null) =>
        !d || (String(d).slice(0, 10) >= from && String(d).slice(0, 10) <= to);

      const built: Row[] = (emps || []).map((e: any) => {
        const extra = e.extra_details || {};
        const myLeaves = (leaves || []).filter(
          (l: any) => l.employee_id === e.id && inRange(l.start_date)
        );
        const approvedDays = (pred: (t: string | null) => boolean) =>
          myLeaves
            .filter((l: any) => pred(l.leave_type) && (l.status || "").toLowerCase() === "approved")
            .reduce((s: number, l: any) => s + (Number(l.days) || 0), 0);

        const myCo = (compOffs || []).filter(
          (c: any) => c.employee_id === e.id && inRange(c.work_date || c.created_at)
        );
        const coApprovedDays = myCo
          .filter((c: any) => (c.status || "").toLowerCase() === "approved")
          .reduce((s: number, c: any) => s + (Number(c.days) || 1), 0);
        const coConsumedDays = approvedDays(isCompOff);
        const coAvailableDays = Math.max(0, coApprovedDays - coConsumedDays);

        const lopConsumed = approvedDays(isLop);
        const leaveExtra = extra.leave || {};

        return {
          employee_id: e.employee_code || "—",
          employee_name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—",
          location: extra.location || extra.work_location || "—",
          job_title: e.designation || "—",
          department: e.department || "—",
          role: extra.role || e.designation || "—",
          band: extra.band || "—",
          leave_year: year,
          co_approved: coApprovedDays * HOURS_PER_DAY,
          co_available: coAvailableDays * HOURS_PER_DAY,
          co_consumed: coConsumedDays * HOURS_PER_DAY,
          lop_accrued: Number(leaveExtra.lop_accrued) || 0,
          lop_available: Number(leaveExtra.lop_available) || 0,
          lop_consumed: lopConsumed,
          lop_customized: Number(leaveExtra.lop_customized) || 0,
          lop_from_last_year: Number(leaveExtra.lop_from_last_year) || 0,
          lop_to_next_year: Number(leaveExtra.lop_to_next_year) || 0,
          lop_encashed: Number(leaveExtra.lop_encashed) || 0,
        };
      });

      setRows(built);
      setGenerated(true);
    } catch (err: any) {
      toast.error(err.message || "Could not load leave summary");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (generated) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const headers = useMemo(
    () => [
      "Employee id", "Employee name", "Location", "Job title", "Department", "Role", "Band", "Leave year",
      "C-O-Approved (Hours)", "C-O-Available (Hours)", "C-O-Consumed (Hours)",
      "LOP-Accrued", "LOP-Available", "LOP-Consumed", "LOP-Customized",
      "LOP-From last year", "LOP-To next year", "LOP-Encashed",
    ],
    []
  );

  const rowValues = (r: Row) => [
    r.employee_id, r.employee_name, r.location, r.job_title, r.department, r.role, r.band, r.leave_year,
    r.co_approved, r.co_available, r.co_consumed,
    r.lop_accrued, r.lop_available, r.lop_consumed, r.lop_customized,
    r.lop_from_last_year, r.lop_to_next_year, r.lop_encashed,
  ];

  const exportAs = (fmt: "csv" | "excel" | "pdf") => {
    if (!generated || rows.length === 0) {
      toast.error("Generate the report first");
      return;
    }
    if (fmt === "pdf") {
      const html = `<html><head><title>Available Leave Summary</title>
        <style>body{font-family:sans-serif;padding:16px}h1{font-size:16px}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px;font-size:10px;text-align:left}</style>
        </head><body><h1>Available Leave Summary (${from} to ${to})</h1>
        <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${rowValues(r).map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.print(); }
      return;
    }
    const sep = fmt === "excel" ? "\t" : ",";
    const content = [
      headers.join(sep),
      ...rows.map((r) => rowValues(r).map((v) => String(v).replace(/[,\t]/g, " ")).join(sep)),
    ].join("\n");
    const blob = new Blob([content], {
      type: fmt === "excel" ? "application/vnd.ms-excel;charset=utf-8;" : "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `available-leave-summary-${year}.${fmt === "excel" ? "xls" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={fetchData} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("csv")}>
          <Download className="mr-1 h-3 w-3" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("excel")}>
          <Download className="mr-1 h-3 w-3" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("pdf")}>
          <Download className="mr-1 h-3 w-3" /> PDF
        </Button>
      </div>

      {generated && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={8} className="border-r bg-muted/50 text-center font-semibold">
                      Employee Details
                    </TableHead>
                    <TableHead colSpan={3} className="border-r bg-blue-50 text-center font-semibold text-blue-700">
                      C-O
                    </TableHead>
                    <TableHead colSpan={7} className="bg-amber-50 text-center font-semibold text-amber-700">
                      LOP
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {headers.map((h, i) => (
                      <TableHead
                        key={h}
                        className={
                          "whitespace-nowrap text-xs" +
                          (i === 7 || i === 10 ? " border-r" : "")
                        }
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={`${r.employee_id}-${idx}`}>
                      {rowValues(r).map((v, i) => (
                        <TableCell
                          key={i}
                          className={
                            "whitespace-nowrap text-xs" +
                            (i === 0 || i === 1 ? " font-medium" : "") +
                            (i === 7 || i === 10 ? " border-r" : "")
                          }
                        >
                          {v}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={headers.length} className="py-10 text-center text-sm text-muted-foreground">
                        No leave data found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
