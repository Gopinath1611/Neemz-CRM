import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/common/TablePagination";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { generatePayrunEmployees } from "@/lib/payrollCalculation";

const TABS = [
  { id: "summary", label: "Pay run summary" },
  { id: "employees", label: "Employee summary" },
  { id: "taxes", label: "Taxes and deduction summary" },
] as const;

const COST_LEGEND = [
  { label: "Net salary", color: "hsl(var(--primary))" },
  { label: "Income tax", color: "hsl(var(--destructive))" },
  { label: "Professional tax", color: "hsl(var(--chart-3, var(--muted-foreground)))" },
  { label: "EPF", color: "hsl(var(--accent-foreground))" },
  { label: "ESI", color: "hsl(var(--secondary-foreground))" },
  { label: "LWF", color: "hsl(var(--muted-foreground))" },
];

const TAX_ROWS = ["Income Tax", "Professional Tax", "Total"];
const PRE_TAX_ROWS = [
  "EPF Contribution",
  "EPS Contribution",
  "EDLI Contribution",
  "EPF Admin Charges",
  "Gratuity",
  "LWF Contribution",
  "Total",
];
const POST_TAX_ROWS = ["Uniform", "Late Entry", "Self and Family Treatment cost", "Total"];

function DeductionTable({ title, cols, rows }: { title: string; cols: [string, string, string]; rows: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => <TableHead key={c} className="text-xs uppercase">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r} className={r === "Total" ? "font-semibold" : ""}>
                <TableCell>{r}</TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const fmtMoney = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDays = (n: any) => {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

export default function PayrunDetail({ payrun, onBack }: { payrun: any; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [livePayrun, setLivePayrun] = useState<any>(payrun);

  const title = livePayrun?.pay_period_start
    ? new Date(livePayrun.pay_period_start).toLocaleDateString("en-US", { month: "long", year: "numeric" }).replace(" ", ", ")
    : livePayrun?.name ?? "Payrun";

  const fetchRows = useCallback(async () => {
    if (!payrun?.id) return;
    setLoadingRows(true);
    const { data, error } = await supabase
      .from("payroll")
      .select("*, employees(employee_code, first_name, last_name, status, employment_type, extra_details)")
      .eq("payrun_id", payrun.id)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as any[]) ?? []);
    setLoadingRows(false);

    const { data: fresh } = await supabase.from("payruns").select("*").eq("id", payrun.id).single();
    if (fresh) setLivePayrun(fresh);
  }, [payrun?.id]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await generatePayrunEmployees(livePayrun);
      toast.success(`Payrun recalculated — ${res.employees} employees mapped`);
      await fetchRows();
    } catch (e: any) {
      toast.error(e?.message || "Recalculation failed");
    }
    setRecalculating(false);
  };

  const totalPayableDays = rows.reduce((s, r) => s + Number(r.present_days || 0), 0);
  const totalGross = rows.reduce((s, r) => s + Number(r.gross_salary || 0), 0);
  const totalNet = rows.reduce((s, r) => s + Number(r.net_salary || 0), 0);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  // An in-progress period uses calendar days elapsed to date as the pro-rata
  // denominator, so the payable column is labelled accordingly.
  const periodInProgress = !!livePayrun?.pay_period_end && new Date(livePayrun.pay_period_end) > new Date();

  const summaryRows: Array<[string, any]> = [
    ["Payday", livePayrun?.pay_period_end ? format(new Date(livePayrun.pay_period_end), "dd MMM yyyy") : "—"],
    ["Payable days", rows.length ? fmtDays(totalPayableDays) : "—"],
    ["No of employees", rows.length || livePayrun?.total_employees || "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground">
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary-foreground/10 text-primary-foreground" onClick={onBack}>
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{title}</h1>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          <RefreshCw size={14} className={recalculating ? "animate-spin" : ""} />
          {recalculating ? "Calculating…" : "Recalculate"}
        </Button>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "whitespace-nowrap px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
              activeTab === t.id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payroll cost summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative h-40 w-40 shrink-0 rounded-full border-[18px] border-primary/70 flex items-center justify-center text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total payroll cost</p>
                    <p className="text-lg font-semibold">{rows.length ? fmtMoney(totalNet) : "—"}</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm w-full">
                  {COST_LEGEND.map((l) => (
                    <li key={l.label} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                        {l.label}
                      </span>
                      <span className={l.label === "Net salary" && rows.length ? "font-medium" : "text-muted-foreground"}>
                        {l.label === "Net salary" && rows.length ? fmtMoney(totalNet) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
                <span>Payroll cost</span>
                <span>{rows.length ? fmtMoney(totalNet) : "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payroll summary</CardTitle></CardHeader>
            <CardContent className="divide-y text-sm">
              {summaryRows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-3">
                  <span className="text-muted-foreground">{k}</span><span>{v}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-3">
                <span className="text-muted-foreground">Gross pay</span>
                <span>{rows.length ? fmtMoney(totalGross) : "—"}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-muted-foreground">Net pay</span>
                <span className="font-semibold text-primary">{rows.length ? fmtMoney(totalNet) : "—"}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary" className="capitalize">{livePayrun?.status ?? "—"}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "employees" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Employee Id", "First name", "Last name", "Status", "Employment type", "Location", "Band", "Payable", "LOP", "Gross pay", "Net pay"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.employees?.employee_code || "—"}</TableCell>
                    <TableCell>{r.employees?.first_name || "—"}</TableCell>
                    <TableCell>{r.employees?.last_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.employees?.status || "active"}</Badge>
                    </TableCell>
                    <TableCell className="capitalize text-xs">{(r.employees?.employment_type || "—").replace(/_/g, " ")}</TableCell>
                    <TableCell className="capitalize text-xs">{r.employees?.extra_details?.location || "—"}</TableCell>
                    <TableCell className="text-xs">—</TableCell>
                    <TableCell title={periodInProgress ? "Period still in progress — calendar days counted up to today; Sundays and holidays are fully paid." : r.notes || undefined}>
                      {fmtDays(r.present_days)} / {fmtDays(r.working_days)}
                      {periodInProgress && <span className="text-xs text-muted-foreground"> (to date)</span>}
                    </TableCell>
                    <TableCell className={Number(r.leave_days) > 0 ? "text-destructive" : ""} title={r.notes || undefined}>{fmtDays(r.leave_days)}</TableCell>
                    <TableCell title={r.notes || undefined}>{fmtMoney(r.gross_salary)}</TableCell>
                    <TableCell className="font-medium text-primary" title={r.notes || undefined}>{fmtMoney(r.net_salary)}</TableCell>

                  </TableRow>
                ))}
                {!loadingRows && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                      No employees in this payrun yet. Click "Recalculate" to map employees from attendance.
                    </TableCell>
                  </TableRow>
                )}
                {loadingRows && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                      Loading employee summary…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={rows.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              label="employees"
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "taxes" && (
        <div className="space-y-4">
          <DeductionTable title="Tax Details" cols={["Tax Name", "Paid by Employer", "Paid by Employee"]} rows={TAX_ROWS} />
          <DeductionTable title="Pre tax deductions" cols={["Deduction Name", "Employer(s) Contribution", "Employee(s) Contribution"]} rows={PRE_TAX_ROWS} />
          <DeductionTable title="Post tax deductions" cols={["Deduction Name", "Employer(s) Contribution", "Employee(s) Contribution"]} rows={POST_TAX_ROWS} />
        </div>
      )}
    </div>
  );
}
