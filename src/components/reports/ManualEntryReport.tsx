import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Manual Entry Report.
 * Lists manually marked attendance entries (attendance_logs.manual_entry = true)
 * with employee metadata, shift and approval info. No writes.
 */

const DASH = "—";

const COLUMNS = [
  "Employee ID", "Employee name", "Location", "Job title", "Department", "Role",
  "Employment type", "Date", "Shift name", "Requested hours", "Approved hours",
  "Status", "Decisioned by",
];

const hrs = (v: number | null | undefined) =>
  v === null || v === undefined ? DASH : `${Number(v).toFixed(2)} h`;

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function ManualEntryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const start = fromDate || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const end = toDate || format(endOfMonth(new Date()), "yyyy-MM-dd");

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [logs, emps, shifts] = await Promise.all([
        supabase.from("attendance_logs").select("*")
          .eq("manual_entry", true).gte("date", start).lte("date", end)
          .order("date", { ascending: false }),
        supabase.from("employees")
          .select("id, user_id, first_name, last_name, employee_code, department, designation, employment_type, extra_details"),
        supabase.from("employee_shifts")
          .select("employee_id, shift_name, effective_from").order("effective_from", { ascending: false }),
      ]);
      if (cancelled) return;
      const empById: Record<string, any> = {};
      const empByUser: Record<string, any> = {};
      (emps.data || []).forEach((e: any) => {
        empById[e.id] = e;
        if (e.user_id) empByUser[e.user_id] = e;
      });
      const shiftByEmp: Record<string, string> = {};
      (shifts.data || []).forEach((s: any) => {
        if (!shiftByEmp[s.employee_id]) shiftByEmp[s.employee_id] = s.shift_name;
      });

      setRows((logs.data || []).map((l: any) => {
        const e = empById[l.employee_id] || {};
        const decider = l.created_by ? empByUser[l.created_by] : null;
        return {
          id: l.id,
          employeeId: e.employee_code || DASH,
          name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || DASH,
          location: e.extra_details?.location || DASH,
          jobTitle: e.designation || DASH,
          department: e.department || DASH,
          role: e.extra_details?.role || DASH,
          employmentType: e.employment_type || DASH,
          date: l.date,
          shiftName: shiftByEmp[l.employee_id] || DASH,
          requestedHours: l.worked_seconds ? l.worked_seconds / 3600 : null,
          approvedHours: l.hours_worked,
          status: l.status || DASH,
          decisionedBy: decider
            ? `${decider.first_name} ${decider.last_name || ""}`.trim()
            : DASH,
        };
      }));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated, start, end]);

  const paged = usePagedSlice(rows, page, pageSize);

  const table = useMemo(() => rows.map((r) => [
    r.employeeId, r.name, r.location, r.jobTitle, r.department, r.role, r.employmentType,
    r.date, r.shiftName, hrs(r.requestedHours), hrs(r.approvedHours), r.status, r.decisionedBy,
  ]), [rows]);

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
      `manual-entry-report-${start}.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Manual Entry Report exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const html = `<html><head><title>Manual Entry Report</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}p{font-size:11px;color:#555}
      table{border-collapse:collapse;font-size:9px;width:100%}td,th{border:1px solid #ccc;padding:3px 5px;text-align:left}
      </style></head><body><h1>Manual Entry Report</h1><p>${start} to ${end}</p><table>
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
          Apply filters and click <strong>Generate Report</strong> to load data
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-md border bg-background overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.employeeId}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.location}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.jobTitle}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.department}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.role}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.employmentType}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.shiftName}</TableCell>
                    <TableCell className="whitespace-nowrap">{hrs(r.requestedHours)}</TableCell>
                    <TableCell className="whitespace-nowrap">{hrs(r.approvedHours)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.decisionedBy}</TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      No manual attendance entries in the selected range.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      Loading manual entries…
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
              label="entries"
            />
          )}
        </div>
      )}
    </div>
  );
}
