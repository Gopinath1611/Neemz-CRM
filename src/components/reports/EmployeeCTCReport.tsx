import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Employee CTC Details report.
 * Derives the standard salary structure from each employee's monthly base salary.
 * No writes to any table.
 */

const COLUMNS = [
  "Employee Id", "Employee name", "Annual ctc", "Monthly ctc", "Gross annual", "Gross monthly",
  "Basic", "House rent allowance", "Conveyance allowance", "Fixed medical allowance",
  "Fixed allowance", "EPF Employee contribution annual", "EPF Employee contribution monthly",
  "EPF Employer contribution monthly", "EPF Employer contribution annual",
  "ESI Employee contribution annual", "ESI Employee contribution monthly",
  "ESI Employer contribution monthly", "ESI Employer contribution annual",
  "Gratuity Employer contribution monthly", "Gratuity Employer contribution annual",
  "Perquisite",
];

const EPF_WAGE_CEILING = 15000;
const ESI_GROSS_LIMIT = 21000;
const CONVEYANCE = 1600;
const MEDICAL = 1250;

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (v: number) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function EmployeeCTCReport({ }: Props) {
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

      setRows((data || []).map((e: any) => {
        const extra = e.extra_details || {};
        const grossMonthly = Number(extra.gross_salary ?? e.base_salary ?? 0);
        const basic = r2(grossMonthly * 0.5);
        const hra = r2(basic * 0.4);
        const conveyance = grossMonthly > 0 ? CONVEYANCE : 0;
        const medical = grossMonthly > 0 ? MEDICAL : 0;
        const fixed = r2(Math.max(0, grossMonthly - basic - hra - conveyance - medical));

        const epfBase = Math.min(basic, EPF_WAGE_CEILING);
        const epfEmployee = grossMonthly > 0 ? r2(epfBase * 0.12) : 0;
        const epfEmployer = epfEmployee;

        const esiApplicable = grossMonthly > 0 && grossMonthly <= ESI_GROSS_LIMIT;
        const esiEmployee = esiApplicable ? r2(grossMonthly * 0.0075) : 0;
        const esiEmployer = esiApplicable ? r2(grossMonthly * 0.0325) : 0;

        const gratuity = grossMonthly > 0 ? r2(basic * 0.0481) : 0;
        const monthlyCtc = r2(grossMonthly + epfEmployer + esiEmployer + gratuity);

        return {
          id: e.id,
          employeeId: e.employee_code || "—",
          name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—",
          annualCtc: r2(monthlyCtc * 12),
          monthlyCtc,
          grossAnnual: r2(grossMonthly * 12),
          grossMonthly,
          basic, hra, conveyance, medical, fixed,
          epfEmployeeAnnual: r2(epfEmployee * 12),
          epfEmployeeMonthly: epfEmployee,
          epfEmployerMonthly: epfEmployer,
          epfEmployerAnnual: r2(epfEmployer * 12),
          esiEmployeeAnnual: r2(esiEmployee * 12),
          esiEmployeeMonthly: esiEmployee,
          esiEmployerMonthly: esiEmployer,
          esiEmployerAnnual: r2(esiEmployer * 12),
          gratuityMonthly: gratuity,
          gratuityAnnual: r2(gratuity * 12),
          perquisite: Number(extra.perquisite ?? 0),
        };
      }));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.employeeId} ${r.name}`.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const cells = (r: any) => [
    r.employeeId, r.name, money(r.annualCtc), money(r.monthlyCtc), money(r.grossAnnual),
    money(r.grossMonthly), money(r.basic), money(r.hra), money(r.conveyance), money(r.medical),
    money(r.fixed), money(r.epfEmployeeAnnual), money(r.epfEmployeeMonthly),
    money(r.epfEmployerMonthly), money(r.epfEmployerAnnual), money(r.esiEmployeeAnnual),
    money(r.esiEmployeeMonthly), money(r.esiEmployerMonthly), money(r.esiEmployerAnnual),
    money(r.gratuityMonthly), money(r.gratuityAnnual), money(r.perquisite),
  ];

  const table = useMemo(() => filtered.map(cells), [filtered]);

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
      `employee-ctc-details.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Employee CTC Details exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const html = `<html><head><title>Employee CTC Details</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}
      table{border-collapse:collapse;font-size:8px;width:100%}td,th{border:1px solid #ccc;padding:2px 4px;text-align:left}
      </style></head><body><h1>Employee CTC Details</h1><table>
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
          Click <strong>Generate Report</strong> to load employee CTC details
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {filtered.length} employee(s)
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
                    {cells(r).map((c, i) => (
                      <TableCell key={i} className={`whitespace-nowrap ${i === 1 ? "font-medium" : ""}`}>
                        {c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      No employees found.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      Loading CTC details…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
        </div>
      )}
    </div>
  );
}
