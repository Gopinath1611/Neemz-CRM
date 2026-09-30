import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

/**
 * READ-ONLY Expense Claim Summary report.
 * Lists reimbursement/expense claims in the selected range with employee metadata,
 * approval workflow info and payment details. No writes.
 */

const DASH = "—";

const COLUMNS = [
  "Employee Id", "Employee name", "Location", "Job title", "Department", "Role", "Band",
  "Employment type", "Reimbursement type", "Category", "Date of expense", "Claimed amount",
  "Approved amount", "Merchant", "Reference", "Description", "Applied on", "Applied by",
  "Approval status", "Reason", "Decision taken on", "Decision taken by", "Mode of payment",
  "Reimbursement sanctioned on", "Payment reference",
];

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? DASH : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const dateOnly = (v: string | null | undefined) =>
  v ? format(new Date(v), "dd MMM yyyy") : DASH;

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function ExpenseClaimSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const start = fromDate || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const end = toDate || format(endOfMonth(new Date()), "yyyy-MM-dd");

  useEffect(() => {
    if (!generated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [exp, emps] = await Promise.all([
        supabase.from("expenses").select("*")
          .gte("expense_date", start).lte("expense_date", end)
          .order("expense_date", { ascending: false }),
        supabase.from("employees")
          .select("id, first_name, last_name, employee_code, department, designation, employment_type, extra_details"),
      ]);
      if (cancelled) return;

      const byName: Record<string, any> = {};
      (emps.data || []).forEach((e: any) => {
        const full = `${e.first_name || ""} ${e.last_name || ""}`.trim().toLowerCase();
        if (full) byName[full] = e;
      });

      setRows((exp.data || []).map((x: any) => {
        const e = byName[String(x.paid_to || "").trim().toLowerCase()] || {};
        const extra = e.extra_details || {};
        return {
          id: x.id,
          employeeId: e.employee_code || DASH,
          name: e.first_name ? `${e.first_name} ${e.last_name || ""}`.trim() : (x.paid_to || DASH),
          location: extra.location || DASH,
          jobTitle: e.designation || DASH,
          department: e.department || DASH,
          role: extra.role || DASH,
          band: extra.band || DASH,
          employmentType: e.employment_type || DASH,
          reimbursementType: x.subcategory || x.category || DASH,
          category: x.category || DASH,
          expenseDate: dateOnly(x.expense_date),
          claimedAmount: x.amount,
          approvedAmount: x.amount,
          merchant: x.paid_to || DASH,
          reference: x.expense_number || x.receipt_number || DASH,
          description: x.description || DASH,
          appliedOn: dateOnly(x.created_at),
          appliedBy: e.first_name ? `${e.first_name} ${e.last_name || ""}`.trim() : (x.paid_to || DASH),
          approvalStatus: "Approved",
          reason: x.notes || DASH,
          decisionOn: dateOnly(x.updated_at || x.created_at),
          decisionBy: DASH,
          modeOfPayment: x.payment_method || DASH,
          sanctionedOn: dateOnly(x.updated_at || x.created_at),
          paymentReference: x.receipt_number || DASH,
        };
      }));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [generated, start, end]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.employeeId} ${r.name} ${r.category} ${r.reference}`.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const table = useMemo(() => filtered.map((r) => [
    r.employeeId, r.name, r.location, r.jobTitle, r.department, r.role, r.band,
    r.employmentType, r.reimbursementType, r.category, r.expenseDate, money(r.claimedAmount),
    money(r.approvedAmount), r.merchant, r.reference, r.description, r.appliedOn, r.appliedBy,
    r.approvalStatus, r.reason, r.decisionOn, r.decisionBy, r.modeOfPayment, r.sanctionedOn,
    r.paymentReference,
  ]), [filtered]);

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
      `expense-claim-summary-${start}.${kind === "csv" ? "csv" : "xls"}`,
      kind === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel",
    );
    toast.success(`Expense Claim Summary exported as ${kind === "csv" ? "CSV" : "Excel"}`);
  };

  const exportPDF = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const html = `<html><head><title>Expense Claim Summary</title><style>
      body{font-family:sans-serif;padding:16px}h1{font-size:16px}p{font-size:11px;color:#555}
      table{border-collapse:collapse;font-size:8px;width:100%}td,th{border:1px solid #ccc;padding:2px 4px;text-align:left}
      </style></head><body><h1>Expense Claim Summary</h1><p>${start} to ${end}</p><table>
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
          <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {start} to {end}
            </span>
            <Input
              placeholder="Search employee, ID, category…"
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
                    <TableCell className="whitespace-nowrap">{r.employeeId}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.location}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.jobTitle}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.department}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.role}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.band}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.employmentType}</TableCell>
                    <TableCell className="whitespace-nowrap capitalize">{r.reimbursementType}</TableCell>
                    <TableCell className="whitespace-nowrap capitalize">{r.category}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.expenseDate}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(r.claimedAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(r.approvedAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.merchant}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.reference}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.description}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.appliedOn}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.appliedBy}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className="text-xs">{r.approvalStatus}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.reason}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.decisionOn}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.decisionBy}</TableCell>
                    <TableCell className="whitespace-nowrap capitalize">{r.modeOfPayment}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.sanctionedOn}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.paymentReference}</TableCell>
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      No expense claims in the selected range.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                      Loading expense claims…
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
              label="claims"
            />
          )}
        </div>
      )}
    </div>
  );
}
