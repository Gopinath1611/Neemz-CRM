import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  fromDate?: string;
  toDate?: string;
}

type Row = {
  id: string;
  applied_date: string;
  reference: string;
  details: string;
  status: string;
};

const HEADERS = ["#", "Date", "Reference", "Details", "Status"];

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return String(d).slice(0, 10); }
};

const statusVariant = (s: string) => {
  const v = s.toLowerCase();
  if (v === "approved") return "default";
  if (v === "rejected") return "destructive";
  return "secondary";
};

export default function AppliedCompOffSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const year = (fromDate || new Date().toISOString()).slice(0, 4);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("comp_off_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const employeeIds = [...new Set((data || []).map((r: any) => r.employee_id).filter(Boolean))];
      const empMap = new Map<string, any>();
      if (employeeIds.length > 0) {
        const { data: emps, error: empError } = await supabase
          .from("employees")
          .select("id, employee_code, first_name, last_name, designation")
          .in("id", employeeIds);
        if (empError) throw empError;
        (emps || []).forEach((e: any) => empMap.set(e.id, e));
      }

      const from = fromDate || `${year}-01-01`;
      const to = toDate || `${year}-12-31`;

      const built: Row[] = (data || [])
        .filter((r: any) => {
          const d = r.working_date || r.created_at;
          if (!d) return true;
          const s = String(d).slice(0, 10);
          return s >= from && s <= to;
        })
        .map((r: any) => {
          const e = empMap.get(r.employee_id) || {};
          const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—";
          const code = e.employee_code ? ` (${e.employee_code})` : "";
          const detailsParts = [
            `Worked on ${fmtDate(r.working_date)}`,
            r.duration_type || "Full day",
          ];
          if (r.expiry_date) detailsParts.push(`Expires ${fmtDate(r.expiry_date)}`);
          if (r.reason) detailsParts.push(String(r.reason));
          return {
            id: r.id,
            applied_date: fmtDate(r.created_at),
            reference: `${name}${code}`,
            details: detailsParts.join(" · "),
            status: (r.status || "pending").replace(/^\w/, (c: string) => c.toUpperCase()),
          };
        });

      setRows(built);
      setGenerated(true);
      if (built.length === 0) toast.info("No comp-off requests in the selected range");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (generated) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const counts = rows.reduce(
    (acc, r) => {
      const v = r.status.toLowerCase();
      if (v === "approved") acc.approved++;
      else if (v === "rejected") acc.rejected++;
      else acc.pending++;
      return acc;
    },
    { approved: 0, rejected: 0, pending: 0 }
  );

  const exportAs = (fmt: "csv" | "excel" | "pdf") => {
    if (!generated || rows.length === 0) {
      toast.error("Generate the report first");
      return;
    }
    if (fmt === "pdf") {
      const html = `<html><head><title>Applied Comp Off Summary</title>
        <style>body{font-family:sans-serif;padding:16px}h1{font-size:16px}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px;font-size:10px;text-align:left}</style>
        </head><body><h1>Applied Comp Off Summary (${year})</h1>
        <table><thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.applied_date}</td><td>${r.reference}</td><td>${r.details}</td><td>${r.status}</td></tr>`).join("")}</tbody></table>
        </body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.print(); }
      return;
    }
    const sep = fmt === "excel" ? "\t" : ",";
    const content = [
      HEADERS.join(sep),
      ...rows.map((r, i) =>
        [i + 1, r.applied_date, r.reference, r.details, r.status]
          .map((v) => String(v).replace(/[,\t\n]/g, " "))
          .join(sep)
      ),
    ].join("\n");
    const blob = new Blob([content], {
      type: fmt === "excel" ? "application/vnd.ms-excel;charset=utf-8;" : "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `applied-comp-off-summary-${year}.${fmt === "excel" ? "xls" : "csv"}`;
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
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{rows.length} total</Badge>
            <Badge variant="default">{counts.approved} approved</Badge>
            <Badge variant="secondary">{counts.pending} pending</Badge>
            <Badge variant="destructive">{counts.rejected} rejected</Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {HEADERS.map((h) => (
                        <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{i + 1}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.applied_date}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-medium">{r.reference}</TableCell>
                        <TableCell className="text-xs">{r.details}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={statusVariant(r.status) as any}>{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={HEADERS.length} className="py-10 text-center text-sm text-muted-foreground">
                          No comp-off requests found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
