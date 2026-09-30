import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
import {
  Download, FileSpreadsheet, FileText, Eye, Loader2,
  IndianRupee, Receipt, CreditCard, Clock, TrendingDown,
  ShoppingCart, Users, FlaskConical, PieChart, Wallet,
} from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ReportKey =
  | "revenue" | "billing" | "billing_items" | "payments" | "receivables"
  | "expenses" | "purchases" | "payroll" | "lab_costs" | "pnl";

interface ReportDef {
  key: ReportKey;
  label: string;
  description: string;
  icon: any;
  customFetch: (from?: Date, to?: Date) => Promise<Record<string, any>[]>;
}

const flatPatient = (p: any) => ({
  "Patient ID": p?.patient_code ?? "",
  "Patient Name": p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "",
  "Phone": p?.phone ?? "",
});

const inRange = (dateStr: string | null | undefined, from?: Date, to?: Date) => {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

const fetchBillings = async (from?: Date, to?: Date) => {
  let q: any = (supabase as any)
    .from("billings")
    .select("created_at,invoice_number,subtotal,discount_amount,discount_percent,tax_amount,total_amount,amount_paid,payment_method,payment_status,notes,patient:patients(patient_code,first_name,last_name,phone)")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (from) q = q.gte("created_at", from.toISOString());
  if (to) q = q.lte("created_at", to.toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

const REPORTS: ReportDef[] = [
  {
    key: "revenue",
    label: "Revenue",
    description: "All billings — total billed, collected & outstanding per invoice",
    icon: IndianRupee,
    customFetch: async (from, to) => {
      const data = await fetchBillings(from, to);
      return data.map((b: any) => ({
        "Date": b.created_at ? format(new Date(b.created_at), "dd MMM yyyy") : "",
        "Invoice #": b.invoice_number ?? "",
        ...flatPatient(b.patient),
        "Subtotal": Number(b.subtotal || 0),
        "Discount": Number(b.discount_amount || 0),
        "Tax": Number(b.tax_amount || 0),
        "Total Billed": Number(b.total_amount || 0),
        "Collected": Number(b.amount_paid || 0),
        "Outstanding": Math.max(0, Number(b.total_amount || 0) - Number(b.amount_paid || 0)),
        "Payment Status": b.payment_status ?? "",
      }));
    },
  },
  {
    key: "billing",
    label: "Billing & Invoices",
    description: "Invoice-level details with patient, amounts, taxes & status",
    icon: Receipt,
    customFetch: async (from, to) => {
      const data = await fetchBillings(from, to);
      return data.map((b: any) => ({
        "Invoice Date": b.created_at ? format(new Date(b.created_at), "dd MMM yyyy hh:mm a") : "",
        "Invoice #": b.invoice_number ?? "",
        ...flatPatient(b.patient),
        "Subtotal": Number(b.subtotal || 0),
        "Discount %": Number(b.discount_percent || 0),
        "Discount Amt": Number(b.discount_amount || 0),
        "Tax": Number(b.tax_amount || 0),
        "Total": Number(b.total_amount || 0),
        "Paid": Number(b.amount_paid || 0),
        "Balance": Math.max(0, Number(b.total_amount || 0) - Number(b.amount_paid || 0)),
        "Payment Method": b.payment_method ?? "",
        "Payment Status": b.payment_status ?? "",
        "Notes": b.notes ?? "",
      }));
    },
  },
  {
    key: "billing_items",
    label: "Invoice Line Items",
    description: "Treatment-wise billed items with tooth, quantity & price",
    icon: Receipt,
    customFetch: async (from, to) => {
      const bills = await fetchBillings(from, to);
      const billIds = bills.map((b: any) => (b as any).id).filter(Boolean);
      // bills doesn't include id; refetch with id
      let q: any = (supabase as any).from("billings").select("id,invoice_number,created_at,patient:patients(patient_code,first_name,last_name,phone)").order("created_at", { ascending: false }).limit(10000);
      if (from) q = q.gte("created_at", from.toISOString());
      if (to) q = q.lte("created_at", to.toISOString());
      const { data: bs, error } = await q;
      if (error) throw error;
      const ids = (bs || []).map((b: any) => b.id);
      if (!ids.length) return [];
      const { data: items, error: e2 } = await (supabase as any).from("billing_items").select("*").in("billing_id", ids);
      if (e2) throw e2;
      const map = new Map((bs || []).map((b: any) => [b.id, b]));
      return (items || []).map((it: any) => {
        const b: any = map.get(it.billing_id) || {};
        return {
          "Date": b.created_at ? format(new Date(b.created_at), "dd MMM yyyy") : "",
          "Invoice #": b.invoice_number ?? "",
          ...flatPatient(b.patient),
          "Treatment": it.treatment_type ?? "",
          "Description": it.description ?? "",
          "Tooth": it.tooth_number ?? "",
          "Qty": Number(it.quantity || 0),
          "Unit Price": Number(it.unit_price || 0),
          "Total": Number(it.total_price || 0),
        };
      });
    },
  },
  {
    key: "payments",
    label: "Payments Collected",
    description: "Amounts collected per invoice with payment method breakdown",
    icon: CreditCard,
    customFetch: async (from, to) => {
      const data = await fetchBillings(from, to);
      return data
        .filter((b: any) => Number(b.amount_paid || 0) > 0)
        .map((b: any) => ({
          "Date": b.created_at ? format(new Date(b.created_at), "dd MMM yyyy hh:mm a") : "",
          "Invoice #": b.invoice_number ?? "",
          ...flatPatient(b.patient),
          "Total Bill": Number(b.total_amount || 0),
          "Amount Paid": Number(b.amount_paid || 0),
          "Balance": Math.max(0, Number(b.total_amount || 0) - Number(b.amount_paid || 0)),
          "Payment Method": b.payment_method ?? "cash",
          "Payment Status": b.payment_status ?? "",
        }));
    },
  },
  {
    key: "receivables",
    label: "Accounts Receivable",
    description: "Unpaid / partially paid invoices — pending collection",
    icon: Clock,
    customFetch: async (from, to) => {
      const data = await fetchBillings(from, to);
      return data
        .filter((b: any) => b.payment_status !== "paid" && (Number(b.total_amount || 0) - Number(b.amount_paid || 0)) > 0)
        .map((b: any) => ({
          "Invoice Date": b.created_at ? format(new Date(b.created_at), "dd MMM yyyy") : "",
          "Invoice #": b.invoice_number ?? "",
          ...flatPatient(b.patient),
          "Total": Number(b.total_amount || 0),
          "Paid": Number(b.amount_paid || 0),
          "Pending": Math.max(0, Number(b.total_amount || 0) - Number(b.amount_paid || 0)),
          "Status": b.payment_status ?? "",
        }));
    },
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "All expenses with category, sub-category & payment mode",
    icon: TrendingDown,
    customFetch: async (from, to) => {
      let q: any = (supabase as any).from("expenses")
        .select("expense_date,category,subcategory,description,amount,payment_method,paid_to,receipt_number,notes,created_at")
        .order("expense_date", { ascending: false }).limit(10000);
      if (from) q = q.gte("expense_date", from.toISOString().split("T")[0]);
      if (to) q = q.lte("expense_date", to.toISOString().split("T")[0]);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        "Date": r.expense_date ?? "",
        "Category": r.category ?? "",
        "Subcategory": r.subcategory ?? "",
        "Description": r.description ?? "",
        "Amount": Number(r.amount || 0),
        "Payment Method": r.payment_method ?? "",
        "Paid To": r.paid_to ?? "",
        "Receipt #": r.receipt_number ?? "",
        "Notes": r.notes ?? "",
      }));
    },
  },
  {
    key: "purchases",
    label: "Purchases (Vendor Bills)",
    description: "Supplier purchases with invoice, amounts & payment status",
    icon: ShoppingCart,
    customFetch: async (from, to) => {
      let q: any = (supabase as any).from("purchases")
        .select("purchase_date,invoice_number,supplier_name,supplier_phone,supplier_type,subtotal,tax_amount,discount_amount,total_amount,payment_status,payment_method,delivery_status,delivery_date,notes")
        .order("purchase_date", { ascending: false }).limit(10000);
      if (from) q = q.gte("purchase_date", from.toISOString().split("T")[0]);
      if (to) q = q.lte("purchase_date", to.toISOString().split("T")[0]);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        "Date": r.purchase_date ?? "",
        "Invoice #": r.invoice_number ?? "",
        "Supplier": r.supplier_name ?? "",
        "Phone": r.supplier_phone ?? "",
        "Type": r.supplier_type ?? "",
        "Subtotal": Number(r.subtotal || 0),
        "Tax": Number(r.tax_amount || 0),
        "Discount": Number(r.discount_amount || 0),
        "Total": Number(r.total_amount || 0),
        "Payment Status": r.payment_status ?? "",
        "Payment Method": r.payment_method ?? "",
        "Delivery Status": r.delivery_status ?? "",
        "Delivery Date": r.delivery_date ?? "",
        "Notes": r.notes ?? "",
      }));
    },
  },
  {
    key: "payroll",
    label: "Payroll (Salaries)",
    description: "Monthly payroll — gross, deductions, net salary per employee",
    icon: Users,
    customFetch: async (from, to) => {
      let q: any = (supabase as any).from("payroll")
        .select("month,year,working_days,present_days,leave_days,base_salary,gross_salary,total_deductions,net_salary,payment_status,payment_date,payment_method,created_at,employee:employees(first_name,last_name,employee_id,designation)")
        .order("year", { ascending: false }).order("month", { ascending: false }).limit(10000);
      const { data, error } = await q;
      if (error) throw error;
      return (data || [])
        .filter((r: any) => inRange(r.payment_date || r.created_at, from, to))
        .map((r: any) => ({
          "Month": `${r.month}/${r.year}`,
          "Employee ID": r.employee?.employee_id ?? "",
          "Employee": r.employee ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim() : "",
          "Designation": r.employee?.designation ?? "",
          "Working Days": r.working_days ?? 0,
          "Present": r.present_days ?? 0,
          "Leave": r.leave_days ?? 0,
          "Base Salary": Number(r.base_salary || 0),
          "Gross": Number(r.gross_salary || 0),
          "Deductions": Number(r.total_deductions || 0),
          "Net Salary": Number(r.net_salary || 0),
          "Payment Status": r.payment_status ?? "",
          "Payment Date": r.payment_date ?? "",
          "Payment Method": r.payment_method ?? "",
        }));
    },
  },
  {
    key: "lab_costs",
    label: "Lab Costs",
    description: "Lab order charges — vendor-wise spend with status",
    icon: FlaskConical,
    customFetch: async (from, to) => {
      let q: any = (supabase as any).from("lab_orders")
        .select("sent_date,lab_name,work_type,material,rate,status,actual_delivery_date,patient:patients(patient_code,first_name,last_name)")
        .order("sent_date", { ascending: false }).limit(10000);
      if (from) q = q.gte("sent_date", from.toISOString().split("T")[0]);
      if (to) q = q.lte("sent_date", to.toISOString().split("T")[0]);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        "Date": r.sent_date ?? "",
        "Lab": r.lab_name ?? "",
        "Patient": r.patient ? `${r.patient.first_name ?? ""} ${r.patient.last_name ?? ""}`.trim() : "",
        "Work Type": r.work_type ?? "",
        "Material": r.material ?? "",
        "Rate": Number(r.rate || 0),
        "Status": r.status ?? "",
        "Delivered": r.actual_delivery_date ?? "",
      }));
    },
  },
  {
    key: "pnl",
    label: "Profit & Loss Summary",
    description: "Revenue, expenses & net profit summary for the period",
    icon: PieChart,
    customFetch: async (from, to) => {
      const [bills, exps, purs, pays, labs] = await Promise.all([
        fetchBillings(from, to),
        (async () => {
          let q: any = (supabase as any).from("expenses").select("expense_date,amount,category").limit(10000);
          if (from) q = q.gte("expense_date", from.toISOString().split("T")[0]);
          if (to) q = q.lte("expense_date", to.toISOString().split("T")[0]);
          const { data } = await q; return data || [];
        })(),
        (async () => {
          let q: any = (supabase as any).from("purchases").select("purchase_date,total_amount").limit(10000);
          if (from) q = q.gte("purchase_date", from.toISOString().split("T")[0]);
          if (to) q = q.lte("purchase_date", to.toISOString().split("T")[0]);
          const { data } = await q; return data || [];
        })(),
        (async () => {
          const { data } = await (supabase as any).from("payroll").select("net_salary,payment_date,created_at").limit(10000);
          return (data || []).filter((r: any) => inRange(r.payment_date || r.created_at, from, to));
        })(),
        (async () => {
          let q: any = (supabase as any).from("lab_orders").select("sent_date,rate").limit(10000);
          if (from) q = q.gte("sent_date", from.toISOString().split("T")[0]);
          if (to) q = q.lte("sent_date", to.toISOString().split("T")[0]);
          const { data } = await q; return data || [];
        })(),
      ]);

      const totalBilled = bills.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
      const collected = bills.reduce((a: number, b: any) => a + Number(b.amount_paid || 0), 0);
      const outstanding = totalBilled - collected;
      const expTotal = exps.reduce((a: number, e: any) => a + Number(e.amount || 0), 0);
      const purTotal = purs.reduce((a: number, p: any) => a + Number(p.total_amount || 0), 0);
      const payTotal = pays.reduce((a: number, p: any) => a + Number(p.net_salary || 0), 0);
      const labTotal = labs.reduce((a: number, l: any) => a + Number(l.rate || 0), 0);
      const allExp = expTotal + purTotal + payTotal + labTotal;
      const profit = collected - allExp;

      return [
        { Metric: "Total Billed (Revenue)", Amount: totalBilled },
        { Metric: "Collected", Amount: collected },
        { Metric: "Outstanding", Amount: outstanding },
        { Metric: "Operating Expenses", Amount: expTotal },
        { Metric: "Purchases (Materials)", Amount: purTotal },
        { Metric: "Payroll (Salaries)", Amount: payTotal },
        { Metric: "Lab Charges", Amount: labTotal },
        { Metric: "Total Expenses", Amount: allExp },
        { Metric: "Net Profit", Amount: profit },
        { Metric: "Profit Margin %", Amount: collected > 0 ? Math.round((profit / collected) * 100) : 0 },
      ];
    },
  },
];

export default function FinanceDownloadReports() {
  const { toast } = useToast();
  const dr = useDateRangeFilter("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<ReportKey | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const dateLabel = () => {
    if (dr.preset === "all") return "All Time";
    if (dr.preset === "year") return "This Year";
    if (dr.range.from && dr.range.to) return `${format(dr.range.from, "dd MMM yyyy")} – ${format(dr.range.to, "dd MMM yyyy")}`;
    return dr.preset;
  };

  const openPreview = async (def: ReportDef) => {
    setPreviewKey(def.key);
    setPreviewLoading(true);
    setPreviewRows([]);
    try {
      const rows = await def.customFetch(dr.range.from, dr.range.to);
      setPreviewRows(rows);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setPreviewKey(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const writeExcel = (label: string, rows: Record<string, any>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));
    XLSX.writeFile(wb, `Finance_${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  const writePDF = async (label: string, rows: Record<string, any>[]) => {
    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = await addClinicPdfHeader(doc, branding);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`Finance: ${label}`, 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Period: ${dateLabel()}  |  Total: ${rows.length}  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 14, startY + 6);
    doc.setTextColor(0);
    const cols = Object.keys(rows[0]);
    autoTable(doc, {
      head: [cols],
      body: rows.map((r) => cols.map((c) => String(r[c] ?? ""))),
      startY: startY + 12,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 95], fontSize: 8 },
      margin: { bottom: 30 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });
    doc.save(`Finance_${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const downloadExcel = async (def: ReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_xlsx");
    try {
      const rows = presetRows ?? await def.customFetch(dr.range.from, dr.range.to);
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records.` }); return; }
      writeExcel(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const downloadPDF = async (def: ReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_pdf");
    try {
      const rows = presetRows ?? await def.customFetch(dr.range.from, dr.range.to);
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records.` }); return; }
      writePDF(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const downloadAllExcel = async () => {
    setBusy("all_xlsx");
    try {
      const wb = XLSX.utils.book_new();
      let total = 0;
      const errors: string[] = [];
      for (const def of REPORTS) {
        try {
          const rows = await def.customFetch(dr.range.from, dr.range.to);
          const data = rows.length ? rows : [{ Info: "No records in selected period" }];
          total += rows.length;
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), def.label.substring(0, 31));
        } catch (e: any) { errors.push(`${def.label}: ${e.message}`); }
      }
      XLSX.writeFile(wb, `Finance_All_Reports_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast({
        title: "Downloaded",
        description: errors.length ? `${total} records. Errors: ${errors.join("; ")}` : `All finance reports (${total} records)`,
        variant: errors.length ? "destructive" : "default",
      });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const previewDef = REPORTS.find((r) => r.key === previewKey);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" /> Finance — Download Reports
          </h1>
          <p className="text-muted-foreground mt-1">Preview & export every finance module: revenue, billing, payments, receivables, expenses, payroll, P&L. Live data, any date range.</p>
        </div>
        <Button onClick={downloadAllExcel} disabled={!!busy}>
          {busy === "all_xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Download All (Excel)
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Date Range Filter</CardTitle>
          <CardDescription>Applies to every finance report below. Default: This Month.</CardDescription>
        </CardHeader>
        <CardContent>
          <DateRangeFilter
            preset={dr.preset}
            onPresetChange={dr.setPreset}
            customFrom={dr.customFrom}
            customTo={dr.customTo}
            onCustomFromChange={dr.setCustomFrom}
            onCustomToChange={dr.setCustomTo}
            hideTomorrow
            showYesterday
            showYear
          />
          <div className="mt-2 text-sm text-muted-foreground">Selected: <Badge variant="secondary">{dateLabel()}</Badge></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((def) => {
          const Icon = def.icon;
          const xlsxBusy = busy === def.key + "_xlsx";
          const pdfBusy = busy === def.key + "_pdf";
          return (
            <Card key={def.key} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {def.label}
                </CardTitle>
                <CardDescription className="text-xs">{def.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="default" onClick={() => openPreview(def)} disabled={!!busy}>
                  <Eye className="h-4 w-4" /> View
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadExcel(def)} disabled={!!busy}>
                  {xlsxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadPDF(def)} disabled={!!busy}>
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {previewDef && (
        <ReportPreviewDialog
          open={!!previewKey}
          onOpenChange={(o) => !o && setPreviewKey(null)}
          title={`Finance — ${previewDef.label}`}
          periodLabel={dateLabel()}
          rows={previewRows}
          loading={previewLoading}
          busy={busy}
          busyKey={previewDef.key}
          onDownloadExcel={() => downloadExcel(previewDef, previewRows)}
          onDownloadPDF={() => downloadPDF(previewDef, previewRows)}
        />
      )}
    </div>
  );
}
