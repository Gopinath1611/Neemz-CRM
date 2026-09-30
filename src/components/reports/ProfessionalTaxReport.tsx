import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Professional Tax Summary report.
 * Derives PT slab amounts from each employee's monthly gross salary. No writes.
 */

const COLUMNS = ["Employee Id", "Employee name", "Professional tax"];

const money = (v: number) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Tamil Nadu half-yearly PT slabs, expressed as monthly equivalent
const ptForGross = (gross: number) => {
  if (!gross || gross <= 21000) return 0;
  if (gross <= 30000) return 135;
  if (gross <= 45000) return 315;
  if (gross <= 60000) return 690;
  if (gross <= 75000) return 1025;
  return 1250;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "—";

const fyOptions = () => {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, -1, -2].map((d) => {
    const y = startYear + d;
    return { value: String(y), label: `Apr ${y} - Mar ${y + 1}` };
  });
};

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function ProfessionalTaxReport({}: Props) {
  const years = useMemo(fyOptions, []);
  const [fy, setFy] = useState(years[0].value);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("employees")
        .select("id, employee_code, first_name, last_name, base_salary, status, extra_details")
        .order("employee_code", { ascending: true });
      if (cancelled) return;
      setRows(
        (data || []).map((e: any) => {
          const extra = e.extra_details || {};
          const gross = Number(extra.gross_salary ?? e.base_salary ?? 0);
          return {
            id: e.id,
            employeeId: e.employee_code || "—",
            name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—",
            pt: ptForGross(gross),
          };
        }),
      );
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [generated, fy]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.employeeId} ${r.name}`.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = usePagedSlice(filtered, page, pageSize);
  const total = filtered.reduce((s, r) => s + r.pt, 0);

  const table = useMemo(
    () => filtered.map((r) => [r.employeeId, r.name, money(r.pt)]),
    [filtered],
  );

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDelimited = (kind: "csv" | "excel") => {
    if (!generated) {
      toast.error("Click Generate Report first");
      return;
    }
    const csv = [COLUMNS, ...table]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download(
      csv,
      `professional-tax-summary.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Professional Tax Summary exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) {
      toast.error("Click Generate Report first");
      return;
    }
    const label = years.find((y) => y.value === fy)?.label ?? "";
    const html = `<html><head><title>Professional Tax Summary</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px;margin-bottom:2px}p{font-size:11px;color:#555}
      table{border-collapse:collapse;font-size:11px;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}
      </style></head><body><h1>Professional Tax Summary</h1><p>${label}</p><table>
      <thead><tr>${COLUMNS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${table.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups to export PDF");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
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

        <div className="ml-auto flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <Select value={fy} onValueChange={(v) => { setFy(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-[190px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background py-10 text-center text-sm text-muted-foreground">
          Click <strong>Generate Report</strong> to load the professional tax summary
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {years.find((y) => y.value === fy)?.label} · {filtered.length} employee(s) · Total {money(total)}
            </span>
            <Input
              placeholder="Search employee or ID…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-8 w-64 bg-background"
            />
          </div>

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
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                          {initials(r.name)}
                        </span>
                        {r.employeeId}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(r.pt)}</TableCell>
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      No employees found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="employees"
          />
        </div>
      )}
    </div>
  );
}
