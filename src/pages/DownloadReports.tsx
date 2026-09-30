import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
import { Download, FileSpreadsheet, FileText, Eye, CalendarDays, Stethoscope, Smile, FlaskConical, Users, Pill, ShieldCheck, Trash2, Package, ShoppingCart, Wallet, Loader2 } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ReportKey =
  | "appointments" | "clinic_workflow" | "ortho" | "external_referrals"
  | "patient_database" | "lab_orders" | "pharmacy" | "sterilization"
  | "waste" | "inventory" | "purchases" | "expenses";

interface ReportDef {
  key: ReportKey;
  label: string;
  description: string;
  icon: any;
  dateField: string;
  dateIsTimestamp?: boolean;
  table: string;
  select: string;
  mapRow?: (r: any) => Record<string, any>;
  /** Custom fetcher overrides default fetchData (used for clinic_workflow which joins many tables) */
  customFetch?: (from: Date | undefined, to: Date | undefined) => Promise<Record<string, any>[]>;
}

const flattenPatient = (p: any) => ({
  "Patient ID": p?.patient_code ?? "",
  "Patient Name": p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "",
  "Patient Phone": p?.phone ?? "",
});

const safeFormat = (val: any, fmt: string) => {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return format(d, fmt);
  } catch {
    return "";
  }
};

const ageFromDOB = (dob?: string) => {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

// ---- CLINIC WORKFLOW custom fetch (joins checkins → patient → vitals → plan → items → billings) ----
const fetchClinicWorkflow = async (from: Date | undefined, to: Date | undefined) => {
  let q: any = (supabase as any)
    .from("patient_checkins")
    .select(`
      id,checkin_time,checkout_time,status,notes,
      patient:patients(patient_code,first_name,last_name,phone,gender,date_of_birth,location,district,source,medical_notes)
    `)
    .order("checkin_time", { ascending: false })
    .limit(5000);
  if (from) q = q.gte("checkin_time", from.toISOString());
  if (to) q = q.lte("checkin_time", to.toISOString());
  const { data: checkins, error } = await q;
  if (error) throw error;
  if (!checkins?.length) return [];

  const checkinIds = checkins.map((c: any) => c.id);

  const [vitalsRes, plansRes, billsRes] = await Promise.all([
    (supabase as any).from("patient_vitals").select("checkin_id,blood_pressure_systolic,blood_pressure_diastolic,pulse_rate,temperature,weight,height,spo2,blood_sugar").in("checkin_id", checkinIds),
    (supabase as any).from("treatment_plans").select("id,checkin_id,doctor,status,total_estimated_cost,notes").in("checkin_id", checkinIds),
    (supabase as any).from("billings").select("checkin_id,invoice_number,subtotal,discount_amount,tax_amount,total_amount,amount_paid,payment_method,payment_status").in("checkin_id", checkinIds),
  ]);

  const planIds = (plansRes.data || []).map((p: any) => p.id);
  const itemsRes = planIds.length
    ? await (supabase as any).from("treatment_plan_items").select("plan_id,treatment_type,description,estimated_cost,status,doctor,tooth_number").in("plan_id", planIds)
    : { data: [] };

  const vitalsMap = new Map((vitalsRes.data || []).map((v: any) => [v.checkin_id, v]));
  const planMap = new Map((plansRes.data || []).map((p: any) => [p.checkin_id, p]));
  const billMap = new Map((billsRes.data || []).map((b: any) => [b.checkin_id, b]));
  const itemsByPlan = new Map<string, any[]>();
  (itemsRes.data || []).forEach((it: any) => {
    if (!itemsByPlan.has(it.plan_id)) itemsByPlan.set(it.plan_id, []);
    itemsByPlan.get(it.plan_id)!.push(it);
  });

  return checkins.map((c: any) => {
    const p = c.patient || {};
    const v: any = vitalsMap.get(c.id) || {};
    const plan: any = planMap.get(c.id) || {};
    const bill: any = billMap.get(c.id) || {};
    const items = plan?.id ? (itemsByPlan.get(plan.id) || []) : [];
    const consult = items.map((i) => i.treatment_type).filter(Boolean).join(", ");
    const treatments = items.filter((i) => i.status === "completed").map((i) => i.treatment_type).filter(Boolean).join(", ");
    const due = Number(bill.total_amount ?? 0) - Number(bill.amount_paid ?? 0);

    return {
      "Date": safeFormat(c.checkin_time, "dd MMM yyyy"),
      "Patient ID": p.patient_code ?? "",
      "Patient Name": `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      "Phone": p.phone ?? "",
      "Age": ageFromDOB(p.date_of_birth),
      "Gender": p.gender ?? "",
      "Location": p.location ?? "",
      "District": p.district ?? "",
      "Source": p.source ?? "",
      "Doctor": plan.doctor ?? "",
      "BP": v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic ?? ""}` : "",
      "Pulse": v.pulse_rate ?? "",
      "Temp": v.temperature ?? "",
      "SpO2": v.spo2 ?? "",
      "Sugar": v.blood_sugar ?? "",
      "Weight": v.weight ?? "",
      "Height": v.height ?? "",
      "Consultation (Plan)": consult,
      "Treatments Done": treatments,
      "Plan Status": plan.status ?? "",
      "Estimated Cost": plan.total_estimated_cost ?? 0,
      "Invoice #": bill.invoice_number ?? "",
      "Bill Total": bill.total_amount ?? 0,
      "Discount": bill.discount_amount ?? 0,
      "Tax": bill.tax_amount ?? 0,
      "Paid": bill.amount_paid ?? 0,
      "Due": due > 0 ? due : 0,
      "Payment Method": bill.payment_method ?? "",
      "Payment Status": bill.payment_status ?? "",
      "Check-in": safeFormat(c.checkin_time, "hh:mm a"),
      "Check-out": safeFormat(c.checkout_time, "hh:mm a"),
      "Visit Status": c.status ?? "",
      "Notes": c.notes ?? "",
    };
  });
};

const REPORTS: ReportDef[] = [
  {
    key: "appointments",
    label: "Appointments",
    description: "Booked + walk-in appointments with patient ID, doctor, source & status",
    icon: CalendarDays,
    table: "appointments",
    dateField: "appointment_date",
    select: "appointment_date,start_time,end_time,doctor,type,status,source,notes,checkin_time,checkout_time,created_at,patient:patients(patient_code,first_name,last_name,phone,gender,date_of_birth,location)",
    mapRow: (r) => ({
      "Date": r.appointment_date ?? "",
      "Patient ID": r.patient?.patient_code ?? "",
      "Patient Name": r.patient ? `${r.patient.first_name ?? ""} ${r.patient.last_name ?? ""}`.trim() : "",
      "Phone": r.patient?.phone ?? "",
      "Age": ageFromDOB(r.patient?.date_of_birth),
      "Gender": r.patient?.gender ?? "",
      "Location": r.patient?.location ?? "",
      "Start Time": r.start_time ?? "",
      "End Time": r.end_time ?? "",
      "Doctor": r.doctor ?? "",
      "Type": r.type ?? "",
      "Status": r.status ?? "",
      "Source": r.source ?? "",
      "Check-in": safeFormat(r.checkin_time, "dd MMM yyyy hh:mm a"),
      "Check-out": safeFormat(r.checkout_time, "dd MMM yyyy hh:mm a"),
      "Booked On": safeFormat(r.created_at, "dd MMM yyyy"),
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "clinic_workflow",
    label: "Clinic Workflow",
    description: "Full visit: patient, vitals, doctor, consult, treatment, bill & payment",
    icon: Stethoscope,
    table: "patient_checkins",
    dateField: "checkin_time",
    dateIsTimestamp: true,
    select: "*",
    customFetch: fetchClinicWorkflow,
  },
  {
    key: "ortho",
    label: "Ortho Treatment",
    description: "Orthodontic cases with diagnosis, plan & status",
    icon: Smile,
    table: "orthodontic_cases",
    dateField: "start_date",
    select: "start_date,case_code,doctor,status,estimated_months,appliance_type,appliance_brand,extraction_plan,treatment_notes,total_cost,installment_amount,installment_frequency,next_due_date,notes,created_at,patient:patients(patient_code,first_name,last_name,phone)",
    mapRow: (r) => ({
      "Start Date": r.start_date ?? "",
      "Case Code": r.case_code ?? "",
      ...flattenPatient(r.patient),
      "Doctor": r.doctor ?? "",
      "Status": r.status ?? "",
      "Months": r.estimated_months ?? "",
      "Appliance": r.appliance_type ?? "",
      "Brand": r.appliance_brand ?? "",
      "Extraction Plan": r.extraction_plan ?? "",
      "Treatment Notes": r.treatment_notes ?? "",
      "Total Cost": r.total_cost ?? 0,
      "Installment": r.installment_amount ?? 0,
      "Frequency": r.installment_frequency ?? "",
      "Next Due": r.next_due_date ?? "",
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "external_referrals",
    label: "External Referrals",
    description: "Diagnostic orders sent outside the clinic",
    icon: FlaskConical,
    table: "diagnostic_orders",
    dateField: "created_at",
    dateIsTimestamp: true,
    select: "created_at,category,scan_center,blood_lab,tests,doctor,status,cost,report_received_at,sample_collected_at,notes,patient:patients(patient_code,first_name,last_name,phone)",
    mapRow: (r) => ({
      "Order Date": safeFormat(r.created_at, "dd MMM yyyy hh:mm a"),
      ...flattenPatient(r.patient),
      "Category": r.category ?? "",
      "Scan Center": r.scan_center ?? "",
      "Blood Lab": r.blood_lab ?? "",
      "Tests": Array.isArray(r.tests) ? r.tests.join(", ") : (r.tests ?? ""),
      "Doctor": r.doctor ?? "",
      "Status": r.status ?? "",
      "Cost": r.cost ?? 0,
      "Sample Collected": safeFormat(r.sample_collected_at, "dd MMM yyyy"),
      "Report Received": safeFormat(r.report_received_at, "dd MMM yyyy"),
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "patient_database",
    label: "Patient Database",
    description: "Patient master data — demographics, source, notes",
    icon: Users,
    table: "patients",
    dateField: "created_at",
    dateIsTimestamp: true,
    select: "patient_code,first_name,last_name,phone,email,gender,date_of_birth,address,location,district,source,medical_notes,created_at",
    mapRow: (r) => ({
      "Patient ID": r.patient_code ?? "",
      "Name": `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      "Phone": r.phone ?? "",
      "Email": r.email ?? "",
      "Gender": r.gender ?? "",
      "DOB": r.date_of_birth ?? "",
      "Age": ageFromDOB(r.date_of_birth),
      "Address": r.address ?? "",
      "Location": r.location ?? "",
      "District": r.district ?? "",
      "Source": r.source ?? "",
      "Medical Notes": r.medical_notes ?? "",
      "Registered": safeFormat(r.created_at, "dd MMM yyyy"),
    }),
  },
  {
    key: "lab_orders",
    label: "Lab Orders",
    description: "Lab work orders with status & expected dates",
    icon: FlaskConical,
    table: "lab_orders",
    dateField: "sent_date",
    select: "sent_date,lab_name,lab_phone,work_type,material,shade,tooth_number,description,rate,expected_delivery_date,actual_delivery_date,status,notes,created_at,patient:patients(patient_code,first_name,last_name,phone)",
    mapRow: (r) => ({
      "Sent Date": r.sent_date ?? "",
      ...flattenPatient(r.patient),
      "Lab": r.lab_name ?? "",
      "Lab Phone": r.lab_phone ?? "",
      "Work Type": r.work_type ?? "",
      "Material": r.material ?? "",
      "Shade": r.shade ?? "",
      "Tooth": Array.isArray(r.tooth_number) ? r.tooth_number.join(", ") : (r.tooth_number ?? ""),
      "Description": r.description ?? "",
      "Rate": r.rate ?? 0,
      "Expected": r.expected_delivery_date ?? "",
      "Delivered": r.actual_delivery_date ?? "",
      "Status": r.status ?? "",
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "pharmacy",
    label: "Pharmacy / Prescriptions",
    description: "Prescriptions issued with diagnosis & doctor",
    icon: Pill,
    table: "prescriptions",
    dateField: "created_at",
    dateIsTimestamp: true,
    select: "created_at,doctor,diagnosis,notes,patient:patients(patient_code,first_name,last_name,phone)",
    mapRow: (r) => ({
      "Date": safeFormat(r.created_at, "dd MMM yyyy hh:mm a"),
      ...flattenPatient(r.patient),
      "Doctor": r.doctor ?? "",
      "Diagnosis": r.diagnosis ?? "",
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "sterilization",
    label: "Sterilization Log",
    description: "Sterilization cycles & tracking",
    icon: ShieldCheck,
    table: "sterilization_logs",
    dateField: "performed_at",
    dateIsTimestamp: true,
    select: "performed_at,instrument_name,sterilization_method,cycle_number,performed_by,duration_minutes,temperature,pressure,result,batch_id,notes,created_at",
    mapRow: (r) => ({
      "Date": safeFormat(r.performed_at, "dd MMM yyyy hh:mm a"),
      "Instrument": r.instrument_name ?? "",
      "Method": r.sterilization_method ?? "",
      "Cycle #": r.cycle_number ?? "",
      "Performed By": r.performed_by ?? "",
      "Duration (min)": r.duration_minutes ?? "",
      "Temperature": r.temperature ?? "",
      "Pressure": r.pressure ?? "",
      "Result": r.result ?? "",
      "Batch": r.batch_id ?? "",
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "waste",
    label: "Waste Management",
    description: "Bio-medical waste manifests & disposal",
    icon: Trash2,
    table: "waste_logs",
    dateField: "collection_date",
    select: "collection_date,collection_time,manifest_number,waste_type,waste_category,items_description,quantity,unit,collected_by,collected_by_person,disposed_by,is_collected,notes,created_at",
    mapRow: (r) => ({
      "Date": r.collection_date ?? "",
      "Time": r.collection_time ?? "",
      "Manifest #": r.manifest_number ?? "",
      "Type": r.waste_type ?? "",
      "Category": r.waste_category ?? "",
      "Items": r.items_description ?? "",
      "Quantity": r.quantity ?? 0,
      "Unit": r.unit ?? "",
      "Collected By": r.collected_by_person ?? r.collected_by ?? "",
      "Disposed By": r.disposed_by ?? "",
      "Collected": r.is_collected ? "Yes" : "No",
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "All inventory items with stock & values",
    icon: Package,
    table: "inventory_items",
    dateField: "created_at",
    dateIsTimestamp: true,
    select: "sku,name,brand,quantity,unit,min_stock_level,cost_price,selling_price,supplier,status,expiry_date,notes,created_at",
    mapRow: (r) => ({
      "SKU": r.sku ?? "",
      "Name": r.name ?? "",
      "Brand": r.brand ?? "",
      "Quantity": r.quantity ?? 0,
      "Unit": r.unit ?? "",
      "Min Stock": r.min_stock_level ?? 0,
      "Cost Price": r.cost_price ?? 0,
      "Selling Price": r.selling_price ?? 0,
      "Stock Value": Number(r.quantity ?? 0) * Number(r.cost_price ?? 0),
      "Supplier": r.supplier ?? "",
      "Status": r.status ?? "",
      "Expiry": r.expiry_date ?? "",
      "Notes": r.notes ?? "",
      "Added": safeFormat(r.created_at, "dd MMM yyyy"),
    }),
  },
  {
    key: "purchases",
    label: "Purchases",
    description: "Purchase orders with supplier & invoice",
    icon: ShoppingCart,
    table: "purchases",
    dateField: "purchase_date",
    select: "purchase_date,invoice_number,supplier_name,supplier_phone,supplier_type,subtotal,tax_amount,discount_amount,total_amount,payment_status,payment_method,delivery_status,delivery_date,notes,created_at",
    mapRow: (r) => ({
      "Date": r.purchase_date ?? "",
      "Invoice #": r.invoice_number ?? "",
      "Supplier": r.supplier_name ?? "",
      "Supplier Phone": r.supplier_phone ?? "",
      "Supplier Type": r.supplier_type ?? "",
      "Subtotal": r.subtotal ?? 0,
      "Tax": r.tax_amount ?? 0,
      "Discount": r.discount_amount ?? 0,
      "Total": r.total_amount ?? 0,
      "Payment Status": r.payment_status ?? "",
      "Payment Method": r.payment_method ?? "",
      "Delivery Status": r.delivery_status ?? "",
      "Delivery Date": r.delivery_date ?? "",
      "Notes": r.notes ?? "",
    }),
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "All expenses with category & payment mode",
    icon: Wallet,
    table: "expenses",
    dateField: "expense_date",
    select: "expense_date,category,subcategory,description,amount,payment_method,paid_to,receipt_number,notes,created_at",
    mapRow: (r) => ({
      "Date": r.expense_date ?? "",
      "Category": r.category ?? "",
      "Subcategory": r.subcategory ?? "",
      "Description": r.description ?? "",
      "Amount": r.amount ?? 0,
      "Payment Method": r.payment_method ?? "",
      "Paid To": r.paid_to ?? "",
      "Receipt #": r.receipt_number ?? "",
      "Notes": r.notes ?? "",
    }),
  },
];

export default function DownloadReports() {
  const { toast } = useToast();
  const dr = useDateRangeFilter("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<ReportKey | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchData = async (def: ReportDef) => {
    if (def.customFetch) return def.customFetch(dr.range.from, dr.range.to);
    let q: any = (supabase as any).from(def.table).select(def.select).order(def.dateField, { ascending: false }).limit(5000);
    if (dr.range.from) {
      const v = def.dateIsTimestamp ? dr.range.from.toISOString() : dr.range.from.toISOString().split("T")[0];
      q = q.gte(def.dateField, v);
    }
    if (dr.range.to) {
      const v = def.dateIsTimestamp ? dr.range.to.toISOString() : dr.range.to.toISOString().split("T")[0];
      q = q.lte(def.dateField, v);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as any[];
  };

  const buildRows = (def: ReportDef, data: any[]): Record<string, any>[] => {
    if (def.customFetch) return data as Record<string, any>[]; // already mapped
    if (def.mapRow) return data.map(def.mapRow);
    return data.map((r) => {
      const out: Record<string, any> = {};
      Object.entries(r).forEach(([k, v]) => {
        const key = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (v == null) out[key] = "";
        else if (Array.isArray(v)) out[key] = v.join(", ");
        else if (typeof v === "object") out[key] = JSON.stringify(v);
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) out[key] = safeFormat(v, "dd MMM yyyy, hh:mm a");
        else out[key] = v;
      });
      return out;
    });
  };

  const dateLabel = () => {
    if (dr.preset === "all") return "All Time";
    if (dr.range.from && dr.range.to) return `${format(dr.range.from, "dd MMM yyyy")} – ${format(dr.range.to, "dd MMM yyyy")}`;
    return dr.preset;
  };

  const openPreview = async (def: ReportDef) => {
    setPreviewKey(def.key);
    setPreviewLoading(true);
    setPreviewRows([]);
    try {
      const data = await fetchData(def);
      setPreviewRows(buildRows(def, data));
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
    XLSX.writeFile(wb, `${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  const writePDF = async (label: string, rows: Record<string, any>[]) => {
    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = await addClinicPdfHeader(doc, branding);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${label} Report`, 14, startY);
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
    doc.save(`${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const downloadExcel = async (def: ReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_xlsx");
    try {
      const rows = presetRows ?? buildRows(def, await fetchData(def));
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records in selected range.` }); return; }
      writeExcel(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const downloadPDF = async (def: ReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_pdf");
    try {
      const rows = presetRows ?? buildRows(def, await fetchData(def));
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records in selected range.` }); return; }
      writePDF(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const downloadAllExcel = async () => {
    setBusy("all_xlsx");
    try {
      const wb = XLSX.utils.book_new();
      let totalRows = 0;
      const errors: string[] = [];
      for (const def of REPORTS) {
        try {
          const data = await fetchData(def);
          const rows = data.length ? buildRows(def, data) : [{ Info: "No records in selected period" }];
          totalRows += data.length;
          const ws = XLSX.utils.json_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, def.label.substring(0, 31));
        } catch (e: any) {
          errors.push(`${def.label}: ${e.message}`);
        }
      }
      XLSX.writeFile(wb, `Clinic_All_Reports_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast({
        title: "Downloaded",
        description: errors.length ? `${totalRows} records. Errors: ${errors.join("; ")}` : `All reports (${totalRows} total records)`,
        variant: errors.length ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const previewDef = REPORTS.find((r) => r.key === previewKey);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Download className="h-7 w-7 text-primary" /> Download Reports</h1>
          <p className="text-muted-foreground mt-1">Preview, then export module reports as Excel or PDF for any date range. Live data, always accurate.</p>
        </div>
        <Button onClick={downloadAllExcel} disabled={!!busy}>
          {busy === "all_xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Download All (Excel)
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Date Range Filter</CardTitle>
          <CardDescription>Applies to every report below. Default: This Month.</CardDescription>
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
                  <Eye className="h-4 w-4" />
                  View
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
          title={previewDef.label}
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
