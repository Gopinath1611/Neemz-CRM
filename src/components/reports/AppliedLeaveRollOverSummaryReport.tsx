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
  employee: string;
  details: string;
  status: string;
  carry_forward: number;
};

const HEADERS = ["#", "Date", "Reference", "Details", "Status"];

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return String(d).slice(0, 10); }
};

const num = (v: any) => Number(v) || 0;

export default function AppliedLeaveRollOverSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const year = (fromDate || new Date().toISOString()).slice(0, 4);
  const fromYear = Number(year);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leave_rollovers")
        .select("*")
        .eq("from_year", fromYear)
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

      const built: Row[] = (data || []).map((r: any) => {
        const e = empMap.get(r.employee_id) || {};
        const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—";
        const code = e.employee_code ? ` (${e.employee_code})` : "";
        const detailsParts = [
          r.leave_type || "Leave",
          `Remaining unused: ${num(r.remaining_unused)}`,
          `Carried forward: ${num(r.carry_forward)}`,
        ];
        if (num(r.enhancement)) detailsParts.push(`Enhancement: ${num(r.enhancement)}`);
        if (num(r.encashment)) detailsParts.push(`Encashment: ${num(r.encashment)}`);
        if (r.notes) detailsParts.push(String(r.notes));
        return {
          id: r.id,
          applied_date: fmtDate(r.created_at),
          reference: `${name}${code}`,
          employee: name,
          details: detailsParts.join(" · "),
          status: `Rolled to ${r.to_year ?? fromYear + 1}`,
          carry_forward: num(r.carry_forward),
        };
      });

      setRows(built);
      setGenerated(true);
      if (built.length === 0) toast.info(`No leave roll overs found for ${fromYear}`);
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

  const totalCarried = rows.reduce((s, r) => s + r.carry_forward, 0);

  const exportAs = (fmt: "csv" | "excel" | "pdf") => {
    if (!generated || rows.length === 0) {
      toast.error("Generate the report first");
      return;
    }
    if (fmt === "pdf") {
      const html = `<html><head><title>Applied Leave Roll Over Summary</title>
        <style>body{font-family:sans-serif;padding:16px}h1{font-size:16px}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px;font-size:10px;text-align:left}</style>
        </head><body><h1>Applied Leave Roll Over Summary (${fromYear} → ${fromYear + 1})</h1>
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
    a.download = `applied-leave-rollover-${fromYear}.${fmt === "excel" ? "xls" : "csv"}`;
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
            <Badge variant="secondary">{rows.length} roll over(s)</Badge>
            <Badge variant="secondary">{totalCarried} day(s) carried forward</Badge>
            <Badge variant="outline">Leave year {fromYear} → {fromYear + 1}</Badge>
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
                          <Badge variant="default">{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={HEADERS.length} className="py-10 text-center text-sm text-muted-foreground">
                          No leave roll overs found for {fromYear}
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
