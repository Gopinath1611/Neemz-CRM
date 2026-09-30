import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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
  employment_type: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  requested_details: string;
  leave_count: string;
  lop: string;
  applied_date: string;
  applied_by: string;
  approval_status: string;
  decision_by: string;
  reason: string;
};

const HEADERS = [
  "Employee Id", "Employee name", "Location", "Job title", "Department", "Role", "Band",
  "Employment type", "Leave type", "Start date", "End date", "Requested date's details",
  "Leave count", "LOP day(s)/hour(s)", "Applied date", "Applied by", "Approval status",
  "Decision taken by", "Reason",
];

const isLop = (t?: string | null) => {
  const v = (t || "").toLowerCase();
  return v.includes("lop") || v.includes("unpaid") || v.includes("loss of pay");
};

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return String(d).slice(0, 10); }
};

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "—";

export default function AppliedLeaveSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const year = (fromDate || new Date().toISOString()).slice(0, 4);
  const from = fromDate || `${year}-01-01`;
  const to = toDate || `${year}-12-31`;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: leaves, error }, { data: emps }] = await Promise.all([
        supabase
          .from("leave_requests")
          .select("*, employees(employee_code, first_name, last_name, department, designation, employment_type, extra_details)")
          .gte("start_date", from)
          .lte("start_date", to)
          .order("created_at", { ascending: false }),
        supabase.from("employees").select("id, employee_code, first_name, last_name"),
      ]);
      if (error) throw error;

      const empMap = new Map((emps || []).map((e: any) => [e.id, e]));

      const built: Row[] = (leaves || []).map((l: any) => {
        const e = l.employees || empMap.get(l.employee_id) || {};
        const extra = e.extra_details || {};
        const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—";
        const days = Number(l.days) || 0;
        return {
          employee_id: e.employee_code || "—",
          employee_name: name,
          location: extra.location || extra.work_location || "Salem",
          job_title: e.designation || "—",
          department: e.department || "—",
          role: extra.role || e.designation || "—",
          band: extra.band || "—",
          employment_type: e.employment_type || "Full time",
          leave_type: l.leave_type || "—",
          start_date: fmtDate(l.start_date),
          end_date: fmtDate(l.end_date),
          requested_details:
            l.start_date === l.end_date
              ? `${fmtDate(l.start_date)} (Full day)`
              : `${fmtDate(l.start_date)} → ${fmtDate(l.end_date)} (${days} day${days === 1 ? "" : "s"})`,
          leave_count: `${days} day(s)`,
          lop: isLop(l.leave_type) ? `${days} day(s)` : "0 day(s)",
          applied_date: fmtDate(l.created_at),
          applied_by: l.applied_by || name,
          approval_status: (l.status || "pending").replace(/^\w/, (c: string) => c.toUpperCase()),
          decision_by: (l.status || "").toLowerCase() === "pending" ? "—" : (l.approved_by || "—"),
          reason: l.reason || "—",
        };
      });

      setRows(built);
      setPage(1);
      setGenerated(true);
      if (built.length === 0) toast.info("No applied leaves in the selected range");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const rowValues = (r: Row) => [
    r.employee_id, r.employee_name, r.location, r.job_title, r.department, r.role, r.band,
    r.employment_type, r.leave_type, r.start_date, r.end_date, r.requested_details,
    r.leave_count, r.lop, r.applied_date, r.applied_by, r.approval_status, r.decision_by, r.reason,
  ];

  const paged = usePagedSlice(rows, page, pageSize);
  const headers = useMemo(() => HEADERS, []);

  const exportAs = (fmt: "csv" | "excel" | "pdf") => {
    if (!generated || rows.length === 0) {
      toast.error("Generate the report first");
      return;
    }
    if (fmt === "pdf") {
      const html = `<html><head><title>Applied Leave Summary</title>
        <style>body{font-family:sans-serif;padding:16px}h1{font-size:16px}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px;font-size:9px;text-align:left}</style>
        </head><body><h1>Applied Leave Summary (${from} to ${to})</h1>
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
      ...rows.map((r) => rowValues(r).map((v) => String(v).replace(/[,\t\n]/g, " ")).join(sep)),
    ].join("\n");
    const blob = new Blob([content], {
      type: fmt === "excel" ? "application/vnd.ms-excel;charset=utf-8;" : "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `applied-leave-summary-${year}.${fmt === "excel" ? "xls" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusVariant = (s: string) => {
    const v = s.toLowerCase();
    if (v === "approved") return "default";
    if (v === "rejected") return "destructive";
    return "secondary";
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
                    {headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r, idx) => (
                    <TableRow key={`${r.employee_id}-${idx}`}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                            {initials(r.employee_name)}
                          </span>
                          {r.employee_id}
                        </div>
                      </TableCell>
                      {rowValues(r).slice(1).map((v, i) => (
                        <TableCell key={i} className="whitespace-nowrap text-xs">
                          {i === 15 ? (
                            <Badge variant={statusVariant(String(v)) as any}>{v}</Badge>
                          ) : (
                            v
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={headers.length} className="py-10 text-center text-sm text-muted-foreground">
                        No applied leaves found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {rows.length > 0 && (
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={rows.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                label="leaves"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
