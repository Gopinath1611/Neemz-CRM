import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Employee's Salary Revision History report.
 * Builds a full revision timeline per employee from stored revision metadata.
 * No writes to any table.
 */

type ColKey =
  | "employeeId" | "name" | "previousCtc" | "currentCtc" | "diffAmount" | "diffPct"
  | "effectiveFrom" | "payoutMonth" | "location" | "jobTitle" | "department"
  | "role" | "employmentType" | "band";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "employeeId", label: "Employee id" },
  { key: "name", label: "Employee name" },
  { key: "previousCtc", label: "Previous CTC" },
  { key: "currentCtc", label: "Current CTC" },
  { key: "diffAmount", label: "Difference amount" },
  { key: "diffPct", label: "Difference %" },
  { key: "effectiveFrom", label: "Effective from" },
  { key: "payoutMonth", label: "Payout month" },
  { key: "location", label: "Location" },
  { key: "jobTitle", label: "Job title" },
  { key: "department", label: "Department" },
  { key: "role", label: "Role" },
  { key: "employmentType", label: "Employment type" },
  { key: "band", label: "Band" },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (v: number) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtMonth = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function SalaryRevisionHistoryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(
    () => COLUMNS.reduce((a, c) => ({ ...a, [c.key]: true }), {} as Record<ColKey, boolean>),
  );

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("employees")
        .select("id, employee_code, first_name, last_name, base_salary, designation, department, employment_type, extra_details")
        .order("employee_code", { ascending: true });
      if (cancelled) return;

      const list = (data || []).flatMap((e: any) => {
        const extra = e.extra_details || {};
        const base = Number(e.base_salary ?? 0);
        const currentAnnual = base * 12;

        const revisions: any[] = Array.isArray(extra.salary_revisions) ? extra.salary_revisions : [];
        const source = revisions.length
          ? [...revisions].sort((a, b) => {
              const da = new Date(a.effective_from || 0).getTime();
              const db = new Date(b.effective_from || 0).getTime();
              return da - db;
            })
          : extra.previous_ctc != null
            ? [{
                previous_ctc: extra.previous_ctc,
                revised_ctc: extra.revised_ctc ?? currentAnnual,
                effective_from: extra.revision_effective_from ?? null,
              }]
            : [];

        return source.map((rev: any, idx: number) => {
          const prev = Number(rev.previous_ctc ?? 0);
          const current = Number(rev.revised_ctc ?? rev.current_ctc ?? currentAnnual);
          const diff = r2(current - prev);
          return {
            key: `${e.id}-${idx}`,
            effectiveRaw: rev.effective_from || null,
            employeeId: e.employee_code || "—",
            name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—",
            previousCtc: money(prev),
            currentCtc: money(current),
            diffAmount: money(diff),
            diffPct: prev > 0 ? `${r2((diff / prev) * 100)}%` : "—",
            effectiveFrom: fmtDate(rev.effective_from),
            payoutMonth: fmtMonth(rev.payout_month ?? rev.approved_payout_month ?? rev.effective_from),
            location: extra.location || extra.work_location || "—",
            jobTitle: e.designation || "—",
            department: e.department || "—",
            role: rev.role || e.designation || "—",
            employmentType: e.employment_type || "—",
            band: extra.band || "—",
          };
        });
      });

      const inRange = list.filter((r) => {
        if (!r.effectiveRaw) return true;
        const d = new Date(r.effectiveRaw).getTime();
        if (fromDate && d < new Date(fromDate).getTime()) return false;
        if (toDate && d > new Date(toDate).getTime()) return false;
        return true;
      });

      setRows(inRange);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated, fromDate, toDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.employeeId} ${r.name}`.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = usePagedSlice(filtered, page, pageSize);
  const shown = COLUMNS.filter((c) => visible[c.key]);

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const matrix = () => filtered.map((r) => shown.map((c) => String(r[c.key] ?? "—")));

  const exportDelimited = (kind: "csv" | "excel") => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const csv = [shown.map((c) => c.label), ...matrix()]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download(
      csv,
      `employee-salary-revision-history.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Salary Revision History exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const html = `<html><head><title>Employee Salary Revision History</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}
      table{border-collapse:collapse;font-size:8px;width:100%}td,th{border:1px solid #ccc;padding:2px 4px;text-align:left}
      </style></head><body><h1>Employee Salary Revision History</h1><table>
      <thead><tr>${shown.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
      <tbody>${matrix().map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
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

        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Settings2 className="h-3 w-3 mr-1" /> Columns
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Choose which columns you see</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={visible[c.key]}
                    onCheckedChange={(v) => setVisible((p) => ({ ...p, [c.key]: !!v }))}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setVisible(COLUMNS.reduce((a, c) => ({ ...a, [c.key]: true }), {} as Record<ColKey, boolean>))}
              >
                Select all
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setVisible(COLUMNS.reduce((a, c) => ({ ...a, [c.key]: c.key === "employeeId" || c.key === "name" }), {} as Record<ColKey, boolean>))}
              >
                Reset
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background py-10 text-center text-sm text-muted-foreground">
          Click <strong>Generate Report</strong> to load the revision history
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {filtered.length} revision(s)
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
                  {shown.map((c) => (
                    <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.key}>
                    {shown.map((c) => (
                      <TableCell key={c.key} className={`whitespace-nowrap ${c.key === "name" ? "font-medium" : ""}`}>
                        {r[c.key] ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={shown.length} className="text-center py-8 text-muted-foreground">
                      No salary revision history found for the selected period.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={shown.length} className="text-center py-8 text-muted-foreground">
                      Loading salary revision history…
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
              label="revisions"
            />
          )}
        </div>
      )}
    </div>
  );
}
