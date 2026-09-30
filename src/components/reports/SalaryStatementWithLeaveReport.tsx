import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY "Salary Statement with Leave Details" report.
 * Hierarchical grouped headers: Employee Details, Leave Details (C-O / LOP sub columns),
 * Attendance Summary, Salary Details Summary. No writes to any table.
 */

type Col = {
  key: string;
  label: string;
  group: string;
  sub?: "C-O" | "LOP";
  align?: "right";
};

const GROUPS = [
  "Employee Details",
  "Accrued leaves",
  "Consumed leaves",
  "Available leaves",
  "Leave encashed",
  "Attendance Summary",
  "Salary Details Summary",
] as const;

const COLS: Col[] = [
  { key: "employeeId", label: "Employee Id", group: "Employee Details" },
  { key: "firstName", label: "First name", group: "Employee Details" },
  { key: "lastName", label: "Last name", group: "Employee Details" },
  { key: "department", label: "Department", group: "Employee Details" },
  { key: "jobTitle", label: "Job title", group: "Employee Details" },
  { key: "band", label: "Band", group: "Employee Details" },

  { key: "accruedCO", label: "Accrued leaves — C-O", group: "Accrued leaves", sub: "C-O", align: "right" },
  { key: "accruedLOP", label: "Accrued leaves — LOP", group: "Accrued leaves", sub: "LOP", align: "right" },
  { key: "consumedCO", label: "Consumed leaves — C-O", group: "Consumed leaves", sub: "C-O", align: "right" },
  { key: "consumedLOP", label: "Consumed leaves — LOP", group: "Consumed leaves", sub: "LOP", align: "right" },
  { key: "availableCO", label: "Available leaves — C-O", group: "Available leaves", sub: "C-O", align: "right" },
  { key: "availableLOP", label: "Available leaves — LOP", group: "Available leaves", sub: "LOP", align: "right" },
  { key: "encashedCO", label: "Leave encashed — C-O", group: "Leave encashed", sub: "C-O", align: "right" },
  { key: "encashedLOP", label: "Leave encashed — LOP", group: "Leave encashed", sub: "LOP", align: "right" },

  { key: "presentDays", label: "Present days", group: "Attendance Summary", align: "right" },
  { key: "weekends", label: "Weekends", group: "Attendance Summary", align: "right" },
  { key: "holidays", label: "Holidays", group: "Attendance Summary", align: "right" },
  { key: "paidLeaves", label: "Paid leaves", group: "Attendance Summary", align: "right" },
  { key: "lopDays", label: "LOP days", group: "Attendance Summary", align: "right" },
  { key: "lopHours", label: "LOP hours", group: "Attendance Summary", align: "right" },
  { key: "payableDays", label: "Payable days", group: "Attendance Summary", align: "right" },
  { key: "officeWorkingDays", label: "Office working days", group: "Attendance Summary", align: "right" },
  { key: "totalDays", label: "Total days", group: "Attendance Summary", align: "right" },

  { key: "payRunType", label: "Pay run type", group: "Salary Details Summary" },
  { key: "payRunStatus", label: "Pay run status", group: "Salary Details Summary" },
  { key: "employeePayRunStatus", label: "Employee pay run status", group: "Salary Details Summary" },
  { key: "ctc", label: "CTC", group: "Salary Details Summary", align: "right" },
  { key: "basic", label: "Basic", group: "Salary Details Summary", align: "right" },
  { key: "hra", label: "House rent allowance", group: "Salary Details Summary", align: "right" },
  { key: "conveyance", label: "Conveyance allowance", group: "Salary Details Summary", align: "right" },
  { key: "medical", label: "Fixed medical allowance", group: "Salary Details Summary", align: "right" },
  { key: "leaveEncashments", label: "Leave encashments", group: "Salary Details Summary", align: "right" },
  { key: "fixed", label: "Fixed allowance", group: "Salary Details Summary", align: "right" },
  { key: "uniform", label: "Uniform", group: "Salary Details Summary", align: "right" },
  { key: "epfEmployee", label: "EPF(Employee contribution)", group: "Salary Details Summary", align: "right" },
  { key: "epfEmployer", label: "EPF(Employer contribution)", group: "Salary Details Summary", align: "right" },
  { key: "esiEmployee", label: "ESI(Employee contribution)", group: "Salary Details Summary", align: "right" },
  { key: "esiEmployer", label: "ESI(Employer contribution)", group: "Salary Details Summary", align: "right" },
  { key: "lwfEmployee", label: "LWF(Employee contribution)", group: "Salary Details Summary", align: "right" },
  { key: "lwfEmployer", label: "LWF(Employer contribution)", group: "Salary Details Summary", align: "right" },
  { key: "incomeTax", label: "Income Tax", group: "Salary Details Summary", align: "right" },
  { key: "pt", label: "PT(Employee contribution)", group: "Salary Details Summary", align: "right" },
  { key: "totalIncomeTax", label: "Total income tax", group: "Salary Details Summary", align: "right" },
  { key: "grossPay", label: "Gross pay", group: "Salary Details Summary", align: "right" },
  { key: "netPay", label: "Net pay", group: "Salary Details Summary", align: "right" },
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
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthBounds = (from?: string, to?: string) => {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start, end, startISO: iso(start), endISO: iso(end) };
};

const isLOP = (t: unknown) => /lop|unpaid|loss of pay/i.test(String(t ?? ""));
const isCompOff = (t: unknown) => /comp|c-?o\b/i.test(String(t ?? ""));

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function SalaryStatementWithLeaveReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [colsOpen, setColsOpen] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COLS.map((c) => [c.key, true])),
  );

  const { start, end, startISO, endISO } = useMemo(
    () => monthBounds(fromDate, toDate), [fromDate, toDate],
  );

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [empRes, leaveRes, balRes, holRes, attRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_code, first_name, last_name, department, designation, base_salary, status, extra_details")
          .order("employee_code", { ascending: true }),
        supabase.from("leave_requests").select("*"),
        supabase.from("leave_balances").select("*"),
        supabase.from("holidays").select("*"),
        supabase.from("attendance_logs").select("*").gte("log_date", startISO).lte("log_date", endISO),
      ]);
      if (cancelled) return;

      const employees: any[] = empRes.data || [];
      const leaves: any[] = (leaveRes.data as any[]) || [];
      const balances: any[] = (balRes.data as any[]) || [];
      const holidayList: any[] = (holRes.data as any[]) || [];
      const logs: any[] = (attRes.data as any[]) || [];

      // Calendar metrics for the period
      const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      let weekends = 0;
      const dayISOs: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        dayISOs.push(d.toISOString().slice(0, 10));
        if (d.getDay() === 0) weekends++;
      }
      const holidayCount = holidayList.filter((h) => {
        const d = String(h.holiday_date ?? h.date ?? "").slice(0, 10);
        return d && dayISOs.includes(d);
      }).length;
      const officeWorkingDays = Math.max(0, totalDays - weekends - holidayCount);

      const inPeriod = (v: unknown) => {
        const d = String(v ?? "").slice(0, 10);
        return !!d && d >= startISO && d <= endISO;
      };

      setRows(employees.map((e: any) => {
        const extra = e.extra_details || {};
        const empLeaves = leaves.filter((l) => l.employee_id === e.id);
        const empBalances = balances.filter((b) => b.employee_id === e.id);

        const sumDays = (list: any[]) =>
          r2(list.reduce((s, l) => s + Number(l.days ?? l.total_days ?? l.no_of_days ?? 0), 0));

        const approved = empLeaves.filter(
          (l) => /approved/i.test(String(l.status ?? "")) && inPeriod(l.start_date ?? l.from_date),
        );
        const consumedCO = sumDays(approved.filter((l) => isCompOff(l.leave_type)));
        const consumedLOP = sumDays(approved.filter((l) => isLOP(l.leave_type)));
        const paidLeaves = r2(
          sumDays(approved.filter((l) => !isLOP(l.leave_type))),
        );

        const balOf = (pred: (t: unknown) => boolean, field: string[]) =>
          r2(empBalances.filter((b) => pred(b.leave_type)).reduce((s, b) => {
            const key = field.find((f) => b[f] !== undefined && b[f] !== null);
            return s + Number(key ? b[key] : 0);
          }, 0));

        const accruedCO = balOf(isCompOff, ["allocated", "total_allocated", "entitled", "opening_balance"]);
        const accruedLOP = balOf(isLOP, ["allocated", "total_allocated", "entitled", "opening_balance"]);
        const availableCO = balOf(isCompOff, ["balance", "available", "remaining"]);
        const availableLOP = balOf(isLOP, ["balance", "available", "remaining"]);
        const encashedCO = Number(extra.leave_encashed_co ?? 0);
        const encashedLOP = Number(extra.leave_encashed_lop ?? 0);

        const presentDays = new Set(
          logs.filter((l) => l.employee_id === e.id && l.check_in_time)
            .map((l) => String(l.log_date).slice(0, 10)),
        ).size;

        const lopDays = consumedLOP;
        const lopHours = r2(lopDays * 8);
        const payableDays = r2(Math.max(0, totalDays - lopDays));

        // Salary structure
        const gross = Number(extra.gross_salary ?? e.base_salary ?? 0);
        const basic = r2(gross * 0.5);
        const hra = r2(basic * 0.4);
        const conveyance = gross > 0 ? CONVEYANCE : 0;
        const medical = gross > 0 ? MEDICAL : 0;
        const uniform = Number(extra.uniform_allowance ?? 0);
        const leaveEncashments = Number(extra.leave_encashment ?? 0);
        const fixed = r2(Math.max(0, gross - basic - hra - conveyance - medical - uniform));

        const epfEmployee = gross > 0 ? r2(Math.min(basic, EPF_WAGE_CEILING) * 0.12) : 0;
        const epfEmployer = epfEmployee;
        const esiApplicable = gross > 0 && gross <= ESI_GROSS_LIMIT;
        const esiEmployee = esiApplicable ? r2(gross * 0.0075) : 0;
        const esiEmployer = esiApplicable ? r2(gross * 0.0325) : 0;
        const lwfEmployee = gross > 0 ? LWF_EMPLOYEE : 0;
        const lwfEmployer = gross > 0 ? LWF_EMPLOYER : 0;
        const pt = gross >= PT_THRESHOLD ? PT_AMOUNT : 0;
        const incomeTax = Number(extra.monthly_tds ?? 0);

        const perDay = totalDays > 0 ? gross / totalDays : 0;
        const grossPay = r2(Math.max(0, perDay * payableDays) + leaveEncashments);
        const netPay = r2(grossPay - epfEmployee - esiEmployee - lwfEmployee - pt - incomeTax);

        return {
          id: e.id,
          employeeId: e.employee_code || "—",
          firstName: e.first_name || "—",
          lastName: e.last_name || "—",
          department: e.department || "—",
          jobTitle: e.designation || "—",
          band: extra.band || "—",
          accruedCO, accruedLOP, consumedCO, consumedLOP,
          availableCO, availableLOP, encashedCO, encashedLOP,
          presentDays, weekends, holidays: holidayCount, paidLeaves,
          lopDays, lopHours, payableDays, officeWorkingDays, totalDays,
          payRunType: "Monthly",
          payRunStatus: /active/i.test(String(e.status ?? "")) ? "Open" : "Not applicable",
          employeePayRunStatus: /active/i.test(String(e.status ?? "")) ? "Yet to process" : "Excluded",
          ctc: r2(gross + epfEmployer + esiEmployer),
          basic, hra, conveyance, medical, leaveEncashments, fixed, uniform,
          epfEmployee, epfEmployer, esiEmployee, esiEmployer,
          lwfEmployee, lwfEmployer, incomeTax, pt,
          totalIncomeTax: r2(incomeTax + pt),
          grossPay, netPay,
        };
      }));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated, startISO, endISO]);

  const activeCols = useMemo(() => COLS.filter((c) => visible[c.key]), [visible]);

  const groupSpans = useMemo(() => {
    const spans: { group: string; span: number }[] = [];
    activeCols.forEach((c) => {
      const last = spans[spans.length - 1];
      if (last && last.group === c.group) last.span++;
      else spans.push({ group: c.group, span: 1 });
    });
    return spans;
  }, [activeCols]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.employeeId} ${r.firstName} ${r.lastName} ${r.department}`.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const cellValue = (r: any, c: Col) => {
    const v = r[c.key];
    if (typeof v === "number") {
      const isMoney = c.group === "Salary Details Summary" && c.align === "right";
      return isMoney ? money(v) : String(v);
    }
    return v ?? "—";
  };

  const headerLabel = (c: Col) => c.sub ?? c.label;

  const exportMatrix = useMemo(
    () => [
      activeCols.map((c) => c.label),
      ...filtered.map((r) => activeCols.map((c) => cellValue(r, c))),
    ],
    [activeCols, filtered],
  );

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportDelimited = (kind: "csv" | "excel") => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const csv = exportMatrix
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download(
      csv,
      `salary-statement-with-leave-details.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Salary Statement with Leave Details exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const [head, ...body] = exportMatrix;
    const html = `<html><head><title>Salary Statement with Leave Details</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}
      table{border-collapse:collapse;font-size:7px;width:100%}td,th{border:1px solid #ccc;padding:2px 3px;text-align:left}
      </style></head><body><h1>Salary Statement with Leave Details</h1><table>
      <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to export PDF"); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  const toggleGroup = (group: string, on: boolean) =>
    setVisible((prev) => {
      const next = { ...prev };
      COLS.filter((c) => c.group === group).forEach((c) => { next[c.key] = on; });
      return next;
    });

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
        {generated && (
          <Button size="sm" variant="outline" onClick={() => setColsOpen(true)}>
            <Settings2 className="h-3 w-3 mr-1" /> Columns ({activeCols.length}/{COLS.length})
          </Button>
        )}
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background py-10 text-center text-sm text-muted-foreground">
          Click <strong>Generate Report</strong> to load the salary statement with leave details
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {filtered.length} employee(s) · {startISO} → {endISO}
            </span>
            <Input
              placeholder="Search employee, ID or department…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-8 w-64 bg-background"
            />
          </div>

          <div className="rounded-md border bg-background overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {groupSpans.map((g, i) => (
                    <TableHead
                      key={`${g.group}-${i}`}
                      colSpan={g.span}
                      className="whitespace-nowrap border-l text-center text-xs font-semibold bg-muted/60"
                    >
                      {g.group}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  {activeCols.map((c) => (
                    <TableHead key={c.key} className="whitespace-nowrap text-xs">
                      {headerLabel(c)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    {activeCols.map((c) => (
                      <TableCell
                        key={c.key}
                        className={`whitespace-nowrap text-xs ${c.align === "right" ? "text-right" : ""} ${c.key === "firstName" ? "font-medium" : ""}`}
                      >
                        {cellValue(r, c)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={activeCols.length} className="text-center py-8 text-muted-foreground">
                      No employees found.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={activeCols.length} className="text-center py-8 text-muted-foreground">
                      Loading salary statement with leave details…
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

      <Dialog open={colsOpen} onOpenChange={setColsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose which columns you see</DialogTitle>
            <DialogDescription>
              Select the metrics you want displayed in the report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {GROUPS.map((group) => {
              const groupCols = COLS.filter((c) => c.group === group);
              const allOn = groupCols.every((c) => visible[c.key]);
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`grp-${group}`}
                      checked={allOn}
                      onCheckedChange={(v) => toggleGroup(group, !!v)}
                    />
                    <label htmlFor={`grp-${group}`} className="text-sm font-semibold">
                      {group}
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                    {groupCols.map((c) => (
                      <div key={c.key} className="flex items-center gap-2">
                        <Checkbox
                          id={`col-${c.key}`}
                          checked={!!visible[c.key]}
                          onCheckedChange={(v) =>
                            setVisible((prev) => ({ ...prev, [c.key]: !!v }))}
                        />
                        <label htmlFor={`col-${c.key}`} className="text-xs">{c.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisible(Object.fromEntries(COLS.map((c) => [c.key, true])))}
            >
              Select all
            </Button>
            <Button size="sm" onClick={() => setColsOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
