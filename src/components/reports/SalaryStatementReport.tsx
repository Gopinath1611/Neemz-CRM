import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Employee Salary Statement report.
 * Derives the monthly salary structure from each employee's salary details.
 * No writes to any table.
 */

const COLUMNS = [
  "Employee Id", "First name", "Last name", "Ctc", "Basic", "House rent allowance",
  "Conveyance allowance", "Fixed medical allowance", "Leave encashment", "Fixed allowance",
  "Uniform", "EPF(Employee contribution)", "EPF(Employee contribution) Arrear",
  "EPF(Employer contribution)", "EPF(Employer contribution) Arrear",
  "ESI(Employee contribution)", "ESI(Employee contribution) Arrear",
  "ESI(Employer contribution)", "ESI(Employer contribution) Arrear",
  "LWF(Employee contribution)", "LWF(Employer contribution)", "Income Tax",
  "PT(Employee contribution)", "Total income tax", "Gross pay", "Net pay",
];

const EPF_WAGE_CEILING = 15000;
const ESI_GROSS_LIMIT = 21000;
const CONVEYANCE = 1600;
const MEDICAL = 1250;
const LWF_EMPLOYEE = 20;
const LWF_EMPLOYER = 40;
const PT_THRESHOLD = 21000;
const PT_AMOUNT = 208;

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (v: number) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function SalaryStatementReport({ }: Props) {
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
        const gross = Number(extra.gross_salary ?? e.base_salary ?? 0);
        const basic = r2(gross * 0.5);
        const hra = r2(basic * 0.4);
        const conveyance = gross > 0 ? CONVEYANCE : 0;
        const medical = gross > 0 ? MEDICAL : 0;
        const uniform = Number(extra.uniform_allowance ?? 0);
        const leaveEncashment = Number(extra.leave_encashment ?? 0);
        const fixed = r2(Math.max(0, gross - basic - hra - conveyance - medical - uniform));

        const epfBase = Math.min(basic, EPF_WAGE_CEILING);
        const epfEmployee = gross > 0 ? r2(epfBase * 0.12) : 0;
        const epfEmployer = epfEmployee;

        const esiApplicable = gross > 0 && gross <= ESI_GROSS_LIMIT;
        const esiEmployee = esiApplicable ? r2(gross * 0.0075) : 0;
        const esiEmployer = esiApplicable ? r2(gross * 0.0325) : 0;

        const lwfEmployee = gross > 0 ? LWF_EMPLOYEE : 0;
        const lwfEmployer = gross > 0 ? LWF_EMPLOYER : 0;
        const pt = gross >= PT_THRESHOLD ? PT_AMOUNT : 0;
        const incomeTax = Number(extra.monthly_tds ?? 0);

        const grossPay = r2(gross + leaveEncashment);
        const netPay = r2(grossPay - epfEmployee - esiEmployee - lwfEmployee - pt - incomeTax);

        return {
          id: e.id,
          employeeId: e.employee_code || "—",
          firstName: e.first_name || "—",
          lastName: e.last_name || "—",
          ctc: r2(gross + epfEmployer + esiEmployer),
          basic, hra, conveyance, medical,
          leaveEncashment, fixed, uniform,
          epfEmployee, epfEmployeeArrear: 0,
          epfEmployer, epfEmployerArrear: 0,
          esiEmployee, esiEmployeeArrear: 0,
          esiEmployer, esiEmployerArrear: 0,
          lwfEmployee, lwfEmployer,
          incomeTax, pt,
          totalIncomeTax: r2(incomeTax + pt),
          grossPay, netPay,
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
    return rows.filter((r) =>
      `${r.employeeId} ${r.firstName} ${r.lastName}`.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const cells = (r: any) => [
    r.employeeId, r.firstName, r.lastName, money(r.ctc), money(r.basic), money(r.hra),
    money(r.conveyance), money(r.medical), money(r.leaveEncashment), money(r.fixed),
    money(r.uniform), money(r.epfEmployee), money(r.epfEmployeeArrear), money(r.epfEmployer),
    money(r.epfEmployerArrear), money(r.esiEmployee), money(r.esiEmployeeArrear),
    money(r.esiEmployer), money(r.esiEmployerArrear), money(r.lwfEmployee), money(r.lwfEmployer),
    money(r.incomeTax), money(r.pt), money(r.totalIncomeTax), money(r.grossPay), money(r.netPay),
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
      `employee-salary-statement.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Employee Salary Statement exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const html = `<html><head><title>Employee Salary Statement</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}
      table{border-collapse:collapse;font-size:8px;width:100%}td,th{border:1px solid #ccc;padding:2px 4px;text-align:left}
      </style></head><body><h1>Employee Salary Statement</h1><table>
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
          Click <strong>Generate Report</strong> to load the salary statement
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
                      Loading salary statement…
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
