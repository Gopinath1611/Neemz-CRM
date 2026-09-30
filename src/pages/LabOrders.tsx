import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FlaskConical, Search, Package, Clock, CheckCircle, Truck, RefreshCw, CalendarIcon, ShieldCheck, Upload, Eye, Download, MessageCircle, Mail, Trash2, AlertTriangle, Link2, Unlink, MoreVertical, Pencil, Plus, FileSearch } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatPatientCode } from "@/lib/patientCode";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { buildLabOrderRow } from "@/lib/labOrderRows";

const statusColors: Record<string, string> = {
  sent: "text-primary",
  in_progress: "text-warning",
  delivered: "text-success",
  cancelled: "text-destructive",
};

type DatePreset = "all" | "today" | "week" | "month" | "custom";

const LabOrders = () => {
  const navigate = useNavigate();
  const { labs, labWorks, doctorNames } = useClinicMasters();
  const [orders, setOrders] = useState<any[]>([]);
  const [patients, setPatients] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const [labFilter, setLabFilter] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [dateOpen, setDateOpen] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const prevToRef = useRef<Date | undefined>(undefined);

  useEffect(() => {
    if (customTo && !prevToRef.current && customFrom) {
      setDateOpen(false);
    }
    prevToRef.current = customTo;
  }, [customTo, customFrom]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [warrantyOrder, setWarrantyOrder] = useState<any | null>(null);
  const [warrantyYears, setWarrantyYears] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  // billing_id -> invoice summary, for the "Patient Bill (Receivable)" column
  const [billingsMap, setBillingsMap] = useState<Record<string, { invoice_number: string | null; total_amount: number; amount_paid: number }>>({});
  const [linkOrder, setLinkOrder] = useState<any | null>(null);
  const [patientInvoices, setPatientInvoices] = useState<any[]>([]);
  const [linkBillingId, setLinkBillingId] = useState<string>("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (o: any) => {
    setEditOrder(o);
    setEditForm({
      lab_name: o.lab_name || "",
      lab_phone: o.lab_phone || "",
      work_type: o.work_type || "",
      material: o.material || "",
      shade: o.shade || "",
      tooth_number: o.tooth_number || "",
      doctor: o.doctor || "",
      sent_date: o.sent_date || "",
      expected_delivery_date: o.expected_delivery_date || "",
      price_of_material: o.price_of_material ?? 0,
      lab_expense: o.lab_expense ?? 0,
      lab_expense_paid_amount: o.lab_expense_paid_amount ?? 0,
      patient_bill: o.patient_bill ?? 0,
      notes: o.notes || "",
    });
  };

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("lab_orders").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lab order deleted" });
    setDeleteTarget(null);
    fetchOrders();
  };

  const saveEdit = async () => {
    if (!editOrder) return;
    setEditSaving(true);
    const { error } = await supabase.from("lab_orders").update({
      lab_name: editForm.lab_name,
      lab_phone: editForm.lab_phone || null,
      work_type: editForm.work_type,
      material: editForm.material || null,
      shade: editForm.shade || null,
      tooth_number: editForm.tooth_number || null,
      doctor: editForm.doctor || null,
      sent_date: editForm.sent_date || null,
      expected_delivery_date: editForm.expected_delivery_date || null,
      price_of_material: Number(editForm.price_of_material) || 0,
      lab_expense: Number(editForm.lab_expense) || 0,
      lab_expense_paid_amount: Number(editForm.lab_expense_paid_amount) || 0,
      patient_bill: Number(editForm.patient_bill) || 0,
      notes: editForm.notes || null,
    }).eq("id", editOrder.id);
    setEditSaving(false);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lab order updated" });
    setEditOrder(null);
    fetchOrders();
  };

  // ---- Add Lab Order (Backfill) ----
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillForm, setBackfillForm] = useState<any>({});
  const [backfillSaving, setBackfillSaving] = useState(false);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [backfillCheckins, setBackfillCheckins] = useState<any[]>([]);
  const [backfillInvoices, setBackfillInvoices] = useState<any[]>([]);
  const [dupWarning, setDupWarning] = useState<any | null>(null);

  // ---- Possibly missed lab orders ----
  const [viewMode, setViewMode] = useState<"orders" | "missed">("orders");
  const [missedRows, setMissedRows] = useState<any[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  const fetchDismissals = async () => {
    const { data } = await supabase.from("lab_order_backfill_dismissals").select("patient_id, billing_id");
    const s = new Set<string>((data || []).map((d: any) => `${d.patient_id}|${d.billing_id}`));
    setDismissedKeys(s);
    return s;
  };

  const fetchMissed = async (dismissed?: Set<string>) => {
    const dismissedSet = dismissed || dismissedKeys;
    setMissedLoading(true);
    try {
      const { data: items } = await supabase
        .from("billing_items")
        .select("billing_id, treatment_type, total_price")
        .or("treatment_type.ilike.%lab:%,treatment_type.ilike.%crown%,treatment_type.ilike.%bridge%,treatment_type.ilike.%denture%,treatment_type.ilike.%veneer%,treatment_type.ilike.%inlay%,treatment_type.ilike.%onlay%,treatment_type.ilike.%aligner%,treatment_type.ilike.%zirconia%,treatment_type.ilike.%ceramic%,treatment_type.ilike.%pfm%");
      const byBilling: Record<string, { items: string[]; amount: number }> = {};
      (items || []).forEach((i: any) => {
        if (!byBilling[i.billing_id]) byBilling[i.billing_id] = { items: [], amount: 0 };
        if (i.treatment_type && !byBilling[i.billing_id].items.includes(i.treatment_type)) byBilling[i.billing_id].items.push(i.treatment_type);
        byBilling[i.billing_id].amount += Number(i.total_price || 0);
      });
      const billingIds = Object.keys(byBilling);
      if (billingIds.length === 0) { setMissedRows([]); return; }
      const billingsAll: any[] = [];
      for (let i = 0; i < billingIds.length; i += 200) {
        const { data } = await supabase.from("billings").select("id, invoice_number, patient_id, created_at, total_amount").in("id", billingIds.slice(i, i + 200));
        billingsAll.push(...(data || []));
      }
      const { data: linkedOrders } = await supabase.from("lab_orders").select("billing_id").not("billing_id", "is", null);
      const linkedSet = new Set((linkedOrders || []).map((o: any) => o.billing_id));
      const rows = billingsAll
        .filter((b: any) => !linkedSet.has(b.id) && !dismissedSet.has(`${b.patient_id}|${b.id}`))
        .map((b: any) => ({ ...b, items: byBilling[b.id].items, labAmount: byBilling[b.id].amount }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const pids = [...new Set(rows.map((r: any) => r.patient_id))];
      const pmap: Record<string, any> = {};
      for (let i = 0; i < pids.length; i += 200) {
        const { data } = await supabase.from("patients").select("id, first_name, last_name, patient_code, phone").in("id", pids.slice(i, i + 200));
        (data || []).forEach((p: any) => { pmap[p.id] = { name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), code: p.patient_code, phone: p.phone }; });
      }
      setMissedRows(rows.map((r: any) => ({ ...r, patient: pmap[r.patient_id] })));
    } finally { setMissedLoading(false); }
  };

  const dismissMissed = async (row: any) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("lab_order_backfill_dismissals").insert({ patient_id: row.patient_id, billing_id: row.id, dismissed_by: userData.user?.id || null } as any);
    if (error) { toast({ title: "Dismiss failed", description: error.message, variant: "destructive" }); return; }
    setDismissedKeys((prev) => new Set(prev).add(`${row.patient_id}|${row.id}`));
    setMissedRows((prev) => prev.filter((r: any) => r.id !== row.id));
  };

  const loadPatientContext = async (pid: string) => {
    const [{ data: chk }, { data: inv }] = await Promise.all([
      supabase.from("patient_checkins").select("id, checkin_time").eq("patient_id", pid).order("checkin_time", { ascending: false }).limit(30),
      supabase.from("billings").select("id, invoice_number, total_amount, amount_paid, created_at").eq("patient_id", pid).order("created_at", { ascending: false }).limit(50),
    ]);
    setBackfillCheckins(chk || []);
    setBackfillInvoices(inv || []);
  };

  const openBackfill = async (prefill?: any) => {
    setBackfillForm(prefill || { status: "sent", sent_date: format(new Date(), "yyyy-MM-dd") });
    setPatientSearch("");
    setBackfillCheckins([]);
    setBackfillInvoices([]);
    setBackfillOpen(true);
    if (allPatients.length === 0) {
      const { data } = await supabase.from("patients").select("id, first_name, last_name, patient_code, phone").order("first_name").limit(2000);
      setAllPatients(data || []);
    }
    if (prefill?.patient_id) loadPatientContext(prefill.patient_id);
  };

  const findDuplicate = () => {
    const { patient_id, work_type, sent_date } = backfillForm;
    if (!patient_id || !work_type || !sent_date) return null;
    const target = new Date(sent_date).getTime();
    return orders.find((o: any) => {
      if (o.patient_id !== patient_id) return false;
      if ((o.work_type || "").trim().toLowerCase() !== work_type.trim().toLowerCase()) return false;
      const dates = [o.sent_date, o.actual_delivery_date].filter(Boolean).map((d: string) => new Date(d).getTime());
      return dates.some((d: number) => Math.abs(d - target) <= 30 * 24 * 3600 * 1000);
    });
  };

  const saveBackfill = async (skipDupCheck = false) => {
    const f = backfillForm;
    if (!f.patient_id || !f.lab_name || !f.work_type || !f.sent_date || !f.status) {
      toast({ title: "Missing required fields", description: "Patient, Lab, Work Type, Sent Date and Status are required.", variant: "destructive" });
      return;
    }
    if (f.status === "delivered" && !f.actual_delivery_date) {
      toast({ title: "Delivered date required", description: "Delivered status needs an actual delivery date.", variant: "destructive" });
      return;
    }
    if (!skipDupCheck) {
      const dup = findDuplicate();
      if (dup) { setDupWarning(dup); return; }
    }
    setBackfillSaving(true);
    try {
      const expense = Number(f.lab_expense) || 0;
      const paidAmt = Number(f.lab_expense_paid_amount) || 0;
      const payStatus = expense > 0 && paidAmt >= expense ? "paid" : paidAmt > 0 ? "partial" : "unpaid";
      const row = buildLabOrderRow({
        patient_id: f.patient_id,
        checkin_id: f.checkin_id || null,
        lab_name: f.lab_name,
        lab_phone: f.lab_phone,
        work_type: f.work_type,
        material: f.material,
        shade: f.shade,
        tooth_number: f.tooth_number,
        price_of_material: f.price_of_material,
        lab_expense: f.lab_expense,
        patient_bill: f.patient_bill,
        lab_expense_paid_amount: f.lab_expense_paid_amount,
        sent_date: f.sent_date,
        expected_delivery_date: f.expected_delivery_date,
        notes: f.notes,
        doctor: f.doctor,
        created_at: new Date(`${f.sent_date}T10:00:00`).toISOString(),
        status: f.status,
        actual_delivery_date: f.actual_delivery_date || null,
        billing_id: f.billing_id || null,
        lab_expense_paid_date: f.lab_expense_paid_date || null,
        lab_payment_status: payStatus,
      });
      const { error } = await supabase.from("lab_orders").insert(row as any);
      if (error) throw error;
      toast({ title: "Lab order added (backfill)" });
      setBackfillOpen(false);
      setDupWarning(null);
      fetchOrders();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setBackfillSaving(false); }
  };

  const openWarranty = (o: any) => {
    setWarrantyOrder(o);
    setWarrantyYears(o.warranty_years ? String(o.warranty_years) : "");
  };

  const getLabPaymentStatus = (order: any) => {
    const expense = Number(order.lab_expense || 0);
    const paid = Number(order.lab_expense_paid_amount || 0);
    if (expense > 0 && paid >= expense) return "paid";
    if (paid > 0) return "partial";
    return "unpaid";
  };

  const getPatientPaymentStatus = (order: any) => {
    if (!order.billing_id || !billingsMap[order.billing_id]) return "not_linked";
    const billed = Number(order.patient_bill || 0);
    const paid = billingsMap[order.billing_id].amount_paid;
    if (billed > 0 && paid >= billed) return "paid";
    if (paid > 0) return "partial";
    return "unpaid";
  };

  const saveWarrantyYears = async () => {
    if (!warrantyOrder) return;
    const yrs = warrantyYears ? parseInt(warrantyYears, 10) : null;
    const { error } = await supabase.from("lab_orders").update({ warranty_years: yrs }).eq("id", warrantyOrder.id);
    if (error) { toast({ title: "Failed to save", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Warranty period saved" });
    setWarrantyOrder({ ...warrantyOrder, warranty_years: yrs });
    fetchOrders();
  };

  const uploadWarrantyCard = async (file: File) => {
    if (!warrantyOrder || !file) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "pdf";
    const path = `${warrantyOrder.patient_id}/${warrantyOrder.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("warranty-cards").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); return; }
    const { data: pub } = supabase.storage.from("warranty-cards").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error } = await supabase.from("lab_orders").update({ warranty_card_url: url }).eq("id", warrantyOrder.id);
    setUploading(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Warranty card uploaded" });
    setWarrantyOrder({ ...warrantyOrder, warranty_card_url: url });
    fetchOrders();
  };

  const removeWarrantyCard = async () => {
    if (!warrantyOrder?.warranty_card_url) return;
    if (!confirm("Remove warranty card?")) return;
    const { error } = await supabase.from("lab_orders").update({ warranty_card_url: null }).eq("id", warrantyOrder.id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removed" });
    setWarrantyOrder({ ...warrantyOrder, warranty_card_url: null });
    fetchOrders();
  };

  const downloadWarrantyCard = async () => {
    if (!warrantyOrder?.warranty_card_url) return;
    try {
      const res = await fetch(warrantyOrder.warranty_card_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const patient = patients[warrantyOrder.patient_id]?.name || "patient";
      a.download = `Warranty-${patient}-${warrantyOrder.work_type || "lab"}.${(warrantyOrder.warranty_card_url.split(".").pop() || "pdf").split("?")[0]}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    }
  };

  const sendWarrantyWhatsApp = () => {
    if (!warrantyOrder?.warranty_card_url) { toast({ title: "Upload warranty card first", variant: "destructive" }); return; }
    const p = patients[warrantyOrder.patient_id];
    const phone = (p?.phone || "").replace(/\D/g, "");
    if (!phone) { toast({ title: "Patient phone missing", variant: "destructive" }); return; }
    const yrs = warrantyOrder.warranty_years ? `${warrantyOrder.warranty_years} years` : "";
    const msg = `Hello ${p?.name || ""},\n\nYour ${warrantyOrder.work_type || "lab work"} warranty card${yrs ? ` (${yrs})` : ""} is attached:\n${warrantyOrder.warranty_card_url}\n\n— Dr Neemz Dentistry`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const sendWarrantyEmail = () => {
    if (!warrantyOrder?.warranty_card_url) { toast({ title: "Upload warranty card first", variant: "destructive" }); return; }
    const p = patients[warrantyOrder.patient_id];
    const email = p?.email;
    if (!email) { toast({ title: "Patient email missing", variant: "destructive" }); return; }
    const yrs = warrantyOrder.warranty_years ? `${warrantyOrder.warranty_years} years` : "";
    const subject = `Your Warranty Card${yrs ? ` — ${yrs}` : ""}`;
    const body = `Hello ${p?.name || ""},\n\nYour ${warrantyOrder.work_type || "lab work"} warranty card${yrs ? ` (${yrs})` : ""} is available here:\n${warrantyOrder.warranty_card_url}\n\n— Dr Neemz Dentistry`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const fetchPatientsForOrders = async (ordersData: any[]) => {
    const ids = [...new Set(ordersData.map((o: any) => o.patient_id).filter(Boolean))];
    if (ids.length === 0) { setPatients({}); return; }
    const map: Record<string, any> = {};
    // Chunk to avoid URL length limits with large IN lists
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, patient_code, phone, email")
        .in("id", chunk);
      (data || []).forEach((p: any) => {
        map[p.id] = { name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), code: p.patient_code, phone: p.phone, email: p.email };
      });
    }
    setPatients(map);
  };

  const fetchBillingsForOrders = async (ordersData: any[]) => {
    const ids = [...new Set(ordersData.map((o: any) => o.billing_id).filter(Boolean))];
    if (ids.length === 0) { setBillingsMap({}); return; }
    const map: Record<string, any> = {};
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("billings")
        .select("id, invoice_number, total_amount, amount_paid")
        .in("id", chunk);
      (data || []).forEach((b: any) => {
        map[b.id] = { invoice_number: b.invoice_number, total_amount: Number(b.total_amount || 0), amount_paid: Number(b.amount_paid || 0) };
      });
    }
    setBillingsMap(map);
  };

  const fetchOrders = async () => {
    const { data } = await supabase.from("lab_orders").select("*").order("created_at", { ascending: false });
    if (data) {
      setOrders(data);
      await fetchPatientsForOrders(data);
      await fetchBillingsForOrders(data);
    }
  };

  const openLinkDialog = async (o: any) => {
    setLinkOrder(o);
    setLinkBillingId(o.billing_id || "");
    setPatientInvoices([]);
    const { data } = await supabase
      .from("billings")
      .select("id, invoice_number, total_amount, amount_paid, created_at")
      .eq("patient_id", o.patient_id)
      .order("created_at", { ascending: false });
    setPatientInvoices(data || []);
  };

  const saveLinkedInvoice = async () => {
    if (!linkOrder) return;
    setLinkSaving(true);
    const value = linkBillingId || null;
    const { error } = await supabase.from("lab_orders").update({ billing_id: value }).eq("id", linkOrder.id);
    setLinkSaving(false);
    if (error) { toast({ title: "Failed to link invoice", description: error.message, variant: "destructive" }); return; }
    toast({ title: value ? "Invoice linked" : "Invoice unlinked" });
    setLinkOrder(null);
    fetchOrders();
  };

  useEffect(() => {
    fetchOrders();
    fetchDismissals().then((s) => fetchMissed(s));
    const channel = supabase
      .channel("lab-orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "delivered") updates.actual_delivery_date = new Date().toISOString().split("T")[0];
    await supabase.from("lab_orders").update(updates).eq("id", id);
    toast({ title: `Order marked as ${status}` });
    fetchOrders();
  };

  const getDateRange = (): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: endOfDay(now) };
      case "week": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
      case "custom":
        if (customFrom && customTo) return { from: startOfDay(customFrom), to: endOfDay(customTo) };
        if (customFrom) return { from: startOfDay(customFrom), to: endOfDay(customFrom) };
        return null;
      default: return null;
    }
  };

  const isOverdue = (o: any) => o.status !== "delivered" && o.status !== "cancelled" && o.expected_delivery_date && new Date(o.expected_delivery_date) < new Date();

  const filtered = useMemo(() => {
    const range = getDateRange();
    return orders.filter(o => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (workTypeFilter !== "all" && o.work_type !== workTypeFilter) return false;
      if (labFilter !== "all" && o.lab_name !== labFilter) return false;
      if (doctorFilter !== "all" && o.doctor !== doctorFilter) return false;
      if (overdueOnly && !isOverdue(o)) return false;
      if (range) {
        const orderDate = new Date(o.sent_date || o.created_at);
        if (!isWithinInterval(orderDate, { start: range.from, end: range.to })) return false;
      }
      if (search) {
        const term = search.toLowerCase();
        const patientName = (patients[o.patient_id]?.name || "").toLowerCase();
        return patientName.includes(term) || o.lab_name.toLowerCase().includes(term) || (o.work_type || "").toLowerCase().includes(term) || (o.doctor || "").toLowerCase().includes(term);
      }
      return true;
    });
  }, [orders, statusFilter, workTypeFilter, labFilter, doctorFilter, overdueOnly, datePreset, customFrom, customTo, search, patients]);

  const pagedFiltered = usePagedSlice(filtered, page, pageSize);

  // Merge master data with existing order data for filters
  const workTypes = useMemo(() => {
    const fromMaster = labWorks.map(w => w.name);
    const fromOrders = orders.map(o => o.work_type).filter(Boolean);
    return [...new Set([...fromMaster, ...fromOrders])];
  }, [labWorks, orders]);

  const labNames = useMemo(() => {
    const fromMaster = labs.map(l => l.name);
    const fromOrders = orders.map(o => o.lab_name).filter(Boolean);
    return [...new Set([...fromMaster, ...fromOrders])];
  }, [labs, orders]);

  const doctorFilterOptions = useMemo(() => {
    const fromMaster = doctorNames;
    const fromOrders = orders.map(o => o.doctor).filter(Boolean);
    return [...new Set([...fromMaster, ...fromOrders])].sort((a, b) => a.localeCompare(b));
  }, [doctorNames, orders]);


  // Stats based on filtered data
  const pendingCount = filtered.filter(o => o.status === "sent").length;
  const inProgressCount = filtered.filter(o => o.status === "in_progress").length;
  const deliveredCount = filtered.filter(o => o.status === "delivered").length;
  const overdueCount = filtered.filter(isOverdue).length;
  const totalCost = filtered.reduce((a, o) => a + Number(o.lab_expense || 0), 0);

  const dateLabel = () => {
    const range = getDateRange();
    if (!range) return "All Time";
    return `${format(range.from, "dd MMM")} — ${format(range.to, "dd MMM yyyy")}`;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <FlaskConical size={22} className="text-primary" /> Lab Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track all dental lab work — synced with Clinic Workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", viewMode === "missed" && "border-warning text-warning")}
            onClick={() => setViewMode((v) => (v === "missed" ? "orders" : "missed"))}
          >
            <FileSearch size={14} /> Possibly Missed{missedRows.length > 0 ? ` (${missedRows.length})` : ""}
          </Button>
          <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground" onClick={() => openBackfill()}>
            <Plus size={14} /> Add Lab Order (Backfill)
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrders} className="gap-1.5">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* Smart Date Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs h-9 gap-2 min-w-[240px] justify-start">
              <CalendarIcon size={14} className="text-primary" />
              <span className="font-medium">
                {datePreset === "all" ? "All Time" : datePreset === "today" ? "Today" : datePreset === "week" ? "This Week" : datePreset === "month" ? "This Month" : "Custom Range"}
              </span>
              {datePreset !== "all" && (
                <span className="text-muted-foreground ml-auto">{dateLabel()}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex">
              <div className="flex flex-col gap-1 p-2 border-r border-border min-w-[140px]">
                {([
                  { value: "all", label: "All Time" },
                  { value: "today", label: "Today" },
                  { value: "week", label: "This Week" },
                  { value: "month", label: "This Month" },
                  { value: "custom", label: "Custom Range" },
                ] as { value: DatePreset; label: string }[]).map(p => (
                  <Button
                    key={p.value}
                    size="sm"
                    variant={datePreset === p.value ? "default" : "ghost"}
                    className={cn("text-xs h-8 justify-start", datePreset === p.value && "gradient-primary border-0")}
                    onClick={() => { setDatePreset(p.value); if (p.value !== "custom") setDateOpen(false); }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {datePreset === "custom" && (
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-muted-foreground px-2 pt-1 pb-1">SELECT DATE RANGE</p>
                  <Calendar
                    mode="range"
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={(range: any) => {
                      setCustomFrom(range?.from);
                      setCustomTo(range?.to);
                    }}
                    numberOfMonths={1}
                    initialFocus
                    className={cn("p-2 pointer-events-auto")}
                  />
                  {(customFrom || customTo) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 w-full mt-1"
                      onClick={() => { setCustomFrom(undefined); setCustomTo(undefined); }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {viewMode === "missed" ? (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="p-4 border-b border-border flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground flex items-center gap-2"><FileSearch size={16} className="text-warning" /> Possibly Missed Lab Orders</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Invoices with lab-related items (keyword match) that have no lab order linked. Confirm each one before backfilling.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => fetchDismissals().then((s) => fetchMissed(s))} disabled={missedLoading} className="gap-1.5 shrink-0"><RefreshCw size={14} /> Refresh</Button>
            </div>
            {missedRows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">{missedLoading ? "Scanning invoices…" : "No possibly-missed lab orders found."}</p>
            ) : (
              <div className="divide-y divide-border">
                {missedRows.map((r) => (
                  <div key={r.id} className="p-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-[200px] flex-1">
                      <p className="text-sm font-medium text-foreground">{r.patient?.name || "Unknown"} <span className="text-xs text-muted-foreground">{r.patient?.code || ""}</span></p>
                      <p className="text-xs text-muted-foreground">{r.invoice_number || "Invoice"} · {r.created_at ? format(new Date(r.created_at), "dd MMM yyyy") : ""}</p>
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex flex-wrap gap-1">
                        {r.items.slice(0, 4).map((it: string) => <Badge key={it} variant="outline" className="text-[10px]">{it}</Badge>)}
                        {r.items.length > 4 && <Badge variant="outline" className="text-[10px]">+{r.items.length - 4}</Badge>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground">₹{r.labAmount.toLocaleString()}</span>
                    <div className="flex gap-2">
                      <Button size="sm" className="gradient-primary text-primary-foreground h-8 text-xs" onClick={() => openBackfill({ patient_id: r.patient_id, billing_id: r.id, sent_date: format(new Date(r.created_at), "yyyy-MM-dd"), patient_bill: r.labAmount, status: "sent", notes: `Backfill — invoice ${r.invoice_number || r.id.slice(0, 8)}` })}>Backfill this</Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => dismissMissed(r)}>Dismiss</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (<>
      {/* Stats Cards — filtered */}
      <div className="grid gap-4 sm:grid-cols-5">
        {[
          { label: "Overdue Orders", value: overdueCount, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", className: "border-destructive/30" },
          { label: "Pending", value: pendingCount, icon: Package, color: "text-primary", bg: "bg-primary/10" },
          { label: "In Progress", value: inProgressCount, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Delivered", value: deliveredCount, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
          { label: "Total Lab Cost", value: `₹${totalCost.toLocaleString()}`, icon: Truck, color: "text-accent", bg: "bg-accent/10" },
        ].map(s => {
          const isOverdueCard = s.label === "Overdue Orders";
          return (
            <Card
              key={s.label}
              className={cn("shadow-card", s.className, isOverdueCard && overdueOnly && "bg-destructive/20 ring-2 ring-destructive", isOverdueCard && "cursor-pointer")}
              onClick={isOverdueCard ? () => setOverdueOnly(v => !v) : undefined}
              role={isOverdueCard ? "button" : undefined}
              tabIndex={isOverdueCard ? 0 : undefined}
              aria-pressed={isOverdueCard ? overdueOnly : undefined}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon size={18} className={s.color} /></div>
                <div>
                  <p className="text-xl font-bold font-display">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search patient, lab or work type..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={labFilter} onValueChange={setLabFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Lab" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Labs</SelectItem>
            {labNames.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={workTypeFilter} onValueChange={setWorkTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Work Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {workTypes.map(t => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Doctor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Doctors</SelectItem>
            {doctorFilterOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1760px]">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {["Patient ID", "Patient Name", "Lab", "Work Type", "Recommended Doctor", "Tooth", "Shade", "Sent", "Expected", "Delivered", "Warranty", "Status", "Price of Material", "Lab Expense (Payable)", "Patient Bill (Receivable)", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={16} className="px-4 py-8 text-center text-sm text-muted-foreground">No lab orders found for selected period</td></tr>
                ) : pagedFiltered.map(o => (
                  <tr key={o.id} className={cn("hover:bg-secondary/30 transition-colors", isOverdue(o) && "bg-destructive/15 text-destructive")}>
                    <td className="px-4 py-3 text-sm font-medium text-primary">
                      {formatPatientCode(patients[o.patient_id]?.code)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <button
                        className="text-primary hover:underline cursor-pointer"
                        onClick={() => navigate(`/clinic-workflow/${o.patient_id}?step=lab_orders`)}
                      >
                        {patients[o.patient_id]?.name || "Unknown"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{o.lab_name}</div>
                      {o.lab_phone && <div className="text-[10px] text-muted-foreground">{o.lab_phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm">{(o.work_type || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</td>
                    <td className="px-4 py-3 text-sm">{o.doctor || "—"}</td>
                    <td className="px-4 py-3 text-sm">{o.tooth_number || "—"}</td>
                    <td className="px-4 py-3 text-sm">{o.shade || "—"}</td>
                    <td className="px-4 py-3 text-sm">{o.sent_date || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {o.expected_delivery_date || "—"}
                      {isOverdue(o) && <Badge variant="destructive" className="ml-1 text-[9px] px-1">Overdue</Badge>}
                    </td>
                    <td className="px-4 py-3 text-sm">{o.actual_delivery_date || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => openWarranty(o)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-medium transition-colors"
                      >
                        <ShieldCheck size={12} />
                        {o.warranty_years ? `${o.warranty_years} yr${o.warranty_years > 1 ? "s" : ""}` : "Add"}
                        {o.warranty_card_url && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-success" title="Card uploaded" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] ${statusColors[o.status] || ""}`}>
                        {o.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">
                      ₹{Number(o.price_of_material || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-semibold text-foreground">₹{Number(o.lab_expense || 0).toLocaleString()}</span>
                        {(() => {
                          const paymentStatus = getLabPaymentStatus(o);
                          return (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] capitalize",
                                paymentStatus === "paid" && "text-success border-success/40",
                                paymentStatus === "partial" && "text-primary border-primary/40",
                                paymentStatus === "unpaid" && "text-warning border-warning/40",
                              )}
                            >
                              {paymentStatus}
                            </Badge>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-semibold text-foreground">₹{Number(o.patient_bill || 0).toLocaleString()}</span>
                        {(() => {
                          const paymentStatus = getPatientPaymentStatus(o);
                          return (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] capitalize",
                                paymentStatus === "paid" && "text-success border-success/40",
                                paymentStatus === "partial" && "text-primary border-primary/40",
                                paymentStatus === "unpaid" && "text-warning border-warning/40",
                                paymentStatus === "not_linked" && "text-muted-foreground",
                              )}
                            >
                              {paymentStatus === "not_linked" ? "Not Linked" : paymentStatus}
                            </Badge>
                          );
                        })()}
                        {o.billing_id && billingsMap[o.billing_id] && (
                          <span className="text-[10px] text-muted-foreground">
                            {billingsMap[o.billing_id].invoice_number || "Invoice"} · ₹{billingsMap[o.billing_id].amount_paid.toLocaleString()} collected
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => openLinkDialog(o)}>
                            {o.billing_id ? <Unlink size={14} className="mr-2" /> : <Link2 size={14} className="mr-2" />}
                            {o.billing_id ? "Change Invoice" : "Link Invoice"}
                          </DropdownMenuItem>
                          {o.status === "sent" && (
                            <DropdownMenuItem onClick={() => updateStatus(o.id, "in_progress")}>
                              <Clock size={14} className="mr-2" /> In Progress
                            </DropdownMenuItem>
                          )}
                          {(o.status === "sent" || o.status === "in_progress") && (
                            <DropdownMenuItem onClick={() => updateStatus(o.id, "delivered")}>
                              <CheckCircle size={14} className="mr-2 text-success" /> Delivered
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openEdit(o)}>
                            <Pencil size={14} className="mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(o)} className="text-destructive focus:text-destructive">
                            <Trash2 size={14} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="lab orders" />
        </CardContent>
      </Card>

      </>)}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lab order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the lab order for {deleteTarget ? patients[deleteTarget.patient_id]?.name || "this patient" : ""}
              {deleteTarget?.work_type ? ` (${deleteTarget.work_type})` : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Lab Order (Backfill) Dialog */}
      <Dialog open={backfillOpen} onOpenChange={(o) => { if (!o) { setBackfillOpen(false); setDupWarning(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} className="text-primary" /> Add Lab Order (Backfill)
            </DialogTitle>
            <p className="text-xs text-muted-foreground">For lab work already done and billed but never entered in Clinic Workflow. This never creates an invoice or payment.</p>
          </DialogHeader>

          {/* Patient picker */}
          <div className="space-y-2">
            <Label>Patient *</Label>
            {backfillForm.patient_id ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  {(() => { const p = allPatients.find((x) => x.id === backfillForm.patient_id) || missedRows.find((r) => r.patient_id === backfillForm.patient_id)?.patient; return p ? `${(p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim())}` : "Selected patient"; })()}
                  <span className="text-xs text-muted-foreground ml-2">{(() => { const p = allPatients.find((x) => x.id === backfillForm.patient_id) || missedRows.find((r) => r.patient_id === backfillForm.patient_id)?.patient; return p ? `${p.code || p.patient_code || ""} ${p.phone ? `· ${p.phone}` : ""}` : ""; })()}</span>
                </span>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setBackfillForm({ ...backfillForm, patient_id: "", checkin_id: "", billing_id: "" })}>Change</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input placeholder="Search patient by name, code or phone..." value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} />
                <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {allPatients
                    .filter((p) => {
                      const q = patientSearch.trim().toLowerCase();
                      if (!q) return true;
                      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase();
                      return name.includes(q) || String(p.patient_code || "").toLowerCase().includes(q) || (p.phone || "").includes(q);
                    })
                    .slice(0, 20)
                    .map((p) => (
                      <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60" onClick={() => { setBackfillForm({ ...backfillForm, patient_id: p.id, checkin_id: "", billing_id: "" }); loadPatientContext(p.id); }}>
                        <span className="font-medium">{`${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unnamed"}</span>
                        <span className="text-xs text-muted-foreground ml-2">{p.patient_code || ""} {p.phone ? `· ${p.phone}` : ""}</span>
                      </button>
                    ))}
                  {allPatients.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Loading patients…</p>}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label>Lab *</Label>
              <Select value={backfillForm.lab_name || ""} onValueChange={(v) => { const lab = labs.find((l) => l.name === v); setBackfillForm({ ...backfillForm, lab_name: v, lab_phone: lab?.mobile || "" }); }}>
                <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
                <SelectContent>
                  {labs.map((l) => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lab Phone</Label>
              <Input value={backfillForm.lab_phone || ""} onChange={(e) => setBackfillForm({ ...backfillForm, lab_phone: e.target.value })} />
            </div>
            <div>
              <Label>Work Type *</Label>
              <Select value={backfillForm.work_type || ""} onValueChange={(v) => setBackfillForm({ ...backfillForm, work_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select work type" /></SelectTrigger>
                <SelectContent>
                  {labWorks.map((w) => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={backfillForm.status || "sent"} onValueChange={(v) => setBackfillForm({ ...backfillForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sent Date * (past dates allowed)</Label>
              <Input type="date" value={backfillForm.sent_date || ""} onChange={(e) => setBackfillForm({ ...backfillForm, sent_date: e.target.value })} />
            </div>
            <div>
              <Label>Expected Delivery Date</Label>
              <Input type="date" value={backfillForm.expected_delivery_date || ""} onChange={(e) => setBackfillForm({ ...backfillForm, expected_delivery_date: e.target.value })} />
            </div>
            <div>
              <Label>Actual Delivery Date {backfillForm.status === "delivered" ? "*" : ""}</Label>
              <Input type="date" value={backfillForm.actual_delivery_date || ""} onChange={(e) => setBackfillForm({ ...backfillForm, actual_delivery_date: e.target.value })} />
            </div>
            <div>
              <Label>Doctor</Label>
              <Select value={backfillForm.doctor || ""} onValueChange={(v) => setBackfillForm({ ...backfillForm, doctor: v })}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctorNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tooth Number(s)</Label>
              <Input value={backfillForm.tooth_number || ""} onChange={(e) => setBackfillForm({ ...backfillForm, tooth_number: e.target.value })} placeholder="e.g. 11, 12" />
            </div>
            <div>
              <Label>Shade</Label>
              <Input value={backfillForm.shade || ""} onChange={(e) => setBackfillForm({ ...backfillForm, shade: e.target.value })} />
            </div>
            <div>
              <Label>Material</Label>
              <Input value={backfillForm.material || ""} onChange={(e) => setBackfillForm({ ...backfillForm, material: e.target.value })} />
            </div>
            <div>
              <Label>Price of Material (₹)</Label>
              <Input type="number" min="0" value={backfillForm.price_of_material ?? ""} onChange={(e) => setBackfillForm({ ...backfillForm, price_of_material: e.target.value })} />
            </div>
            <div>
              <Label>Lab Expense — Payable (₹)</Label>
              <Input type="number" min="0" value={backfillForm.lab_expense ?? ""} onChange={(e) => setBackfillForm({ ...backfillForm, lab_expense: e.target.value })} />
            </div>
            <div>
              <Label>Patient Bill (₹)</Label>
              <Input type="number" min="0" value={backfillForm.patient_bill ?? ""} onChange={(e) => setBackfillForm({ ...backfillForm, patient_bill: e.target.value })} />
            </div>
            <div>
              <Label>Already Paid to Lab (₹)</Label>
              <Input type="number" min="0" value={backfillForm.lab_expense_paid_amount ?? ""} onChange={(e) => setBackfillForm({ ...backfillForm, lab_expense_paid_amount: e.target.value })} />
            </div>
            <div>
              <Label>Paid to Lab Date</Label>
              <Input type="date" value={backfillForm.lab_expense_paid_date || ""} onChange={(e) => setBackfillForm({ ...backfillForm, lab_expense_paid_date: e.target.value })} />
            </div>
            <div>
              <Label>Link Check-in (optional)</Label>
              <Select value={backfillForm.checkin_id || "none"} onValueChange={(v) => setBackfillForm({ ...backfillForm, checkin_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No check-in link" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No check-in link</SelectItem>
                  {backfillCheckins.map((c) => <SelectItem key={c.id} value={c.id}>{c.checkin_time ? format(new Date(c.checkin_time), "dd MMM yyyy, hh:mm a") : c.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link Existing Invoice (optional)</Label>
              <Select value={backfillForm.billing_id || "none"} onValueChange={(v) => setBackfillForm({ ...backfillForm, billing_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {backfillInvoices.map((b) => <SelectItem key={b.id} value={b.id}>{b.invoice_number || "Invoice"} — ₹{Number(b.total_amount || 0).toLocaleString()} ({Number(b.amount_paid || 0).toLocaleString()} paid)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input value={backfillForm.notes || ""} onChange={(e) => setBackfillForm({ ...backfillForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackfillOpen(false)}>Cancel</Button>
            <Button onClick={() => saveBackfill()} disabled={backfillSaving} className="gradient-primary text-primary-foreground">
              {backfillSaving ? "Saving…" : "Add Lab Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate warning */}
      <AlertDialog open={!!dupWarning} onOpenChange={(o) => !o && setDupWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle size={16} className="text-warning" /> Possible duplicate</AlertDialogTitle>
            <AlertDialogDescription>
              {dupWarning && <>This patient already has a <b>{dupWarning.work_type}</b> lab order{dupWarning.sent_date ? ` sent on ${dupWarning.sent_date}` : ""} (status: {(dupWarning.status || "").replace(/_/g, " ")}). Save anyway?</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDupWarning(null); saveBackfill(true); }}>Save anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Lab Order Dialog */}
      <Dialog open={!!editOrder} onOpenChange={(o) => !o && setEditOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={18} className="text-primary" />
              Edit Lab Order — {editOrder ? patients[editOrder.patient_id]?.name : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label className="text-xs">Lab</Label>
              <Select value={editForm.lab_name || ""} onValueChange={v => setEditForm({ ...editForm, lab_name: v })}>
                <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
                <SelectContent>
                  {labNames.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Lab Phone</Label>
              <Input value={editForm.lab_phone || ""} onChange={e => setEditForm({ ...editForm, lab_phone: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Work Type</Label>
              <Select value={editForm.work_type || ""} onValueChange={v => setEditForm({ ...editForm, work_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select work type" /></SelectTrigger>
                <SelectContent>
                  {workTypes.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recommended Doctor</Label>
              <Select value={editForm.doctor || ""} onValueChange={v => setEditForm({ ...editForm, doctor: v })}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctorFilterOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tooth Number</Label>
              <Input value={editForm.tooth_number || ""} onChange={e => setEditForm({ ...editForm, tooth_number: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Shade</Label>
              <Input value={editForm.shade || ""} onChange={e => setEditForm({ ...editForm, shade: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Material</Label>
              <Input value={editForm.material || ""} onChange={e => setEditForm({ ...editForm, material: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Sent Date</Label>
              <Input type="date" value={editForm.sent_date || ""} onChange={e => setEditForm({ ...editForm, sent_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Expected Delivery</Label>
              <Input type="date" value={editForm.expected_delivery_date || ""} onChange={e => setEditForm({ ...editForm, expected_delivery_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Price of Material (₹)</Label>
              <Input type="number" value={editForm.price_of_material ?? ""} onChange={e => setEditForm({ ...editForm, price_of_material: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Lab Expense (₹)</Label>
              <Input type="number" value={editForm.lab_expense ?? ""} onChange={e => setEditForm({ ...editForm, lab_expense: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Paid to Lab (₹)</Label>
              <Input type="number" value={editForm.lab_expense_paid_amount ?? ""} onChange={e => setEditForm({ ...editForm, lab_expense_paid_amount: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Patient Bill (₹)</Label>
              <Input type="number" value={editForm.patient_bill ?? ""} onChange={e => setEditForm({ ...editForm, patient_bill: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editForm.lab_name || !editForm.work_type} className="gradient-primary text-primary-foreground">
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Invoice Dialog */}
      <Dialog open={!!linkOrder} onOpenChange={(o) => !o && setLinkOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 size={18} className="text-primary" />
              Link Invoice — {linkOrder ? patients[linkOrder.patient_id]?.name : ""}
            </DialogTitle>
          </DialogHeader>
          {linkOrder && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Pick the invoice that charged this patient for <span className="font-medium text-foreground">{(linkOrder.work_type || "lab work").replace(/_/g, " ")}</span>. Its payment progress shows below the "Patient Bill (Receivable)" amount.
              </p>
              <Select value={linkBillingId} onValueChange={setLinkBillingId}>
                <SelectTrigger><SelectValue placeholder="Select an invoice (optional)" /></SelectTrigger>
                <SelectContent>
                  {patientInvoices.length === 0 && (
                    <SelectItem value="__none" disabled>No invoices for this patient</SelectItem>
                  )}
                  {patientInvoices.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.invoice_number || "Invoice"} · {format(new Date(b.created_at), "dd MMM yyyy")} · ₹{Number(b.amount_paid || 0).toLocaleString()} / ₹{Number(b.total_amount || 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkOrder.billing_id && (
                <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => setLinkBillingId("")}>
                  <Unlink size={12} /> Remove link
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOrder(null)}>Cancel</Button>
            <Button onClick={saveLinkedInvoice} disabled={linkSaving} className="gradient-primary text-primary-foreground">
              {linkSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warranty Dialog */}
      <Dialog open={!!warrantyOrder} onOpenChange={(o) => !o && setWarrantyOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              Warranty — {warrantyOrder ? patients[warrantyOrder.patient_id]?.name : ""}
            </DialogTitle>
          </DialogHeader>

          {warrantyOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground bg-muted/40 p-3 rounded-md">
                <div><span className="font-semibold text-foreground">Lab:</span> {warrantyOrder.lab_name}</div>
                <div><span className="font-semibold text-foreground">Work:</span> {(warrantyOrder.work_type || "").replace(/_/g, " ")}</div>
                <div><span className="font-semibold text-foreground">Tooth:</span> {warrantyOrder.tooth_number || "—"}</div>
                <div><span className="font-semibold text-foreground">Shade:</span> {warrantyOrder.shade || "—"}</div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Warranty Period (years)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={warrantyYears}
                    onChange={(e) => setWarrantyYears(e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
                <Button onClick={saveWarrantyYears} className="gradient-primary text-primary-foreground">Save</Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Warranty Card</Label>
                {warrantyOrder.warranty_card_url ? (
                  <button
                    type="button"
                    onClick={() => window.open(warrantyOrder.warranty_card_url, "_blank")}
                    className="group flex items-center gap-3 border rounded-md p-2 bg-muted/20 hover:bg-muted/40 transition-colors w-full text-left"
                    title="Click to open full preview"
                  >
                    <div className="w-16 h-16 rounded border bg-background overflow-hidden flex items-center justify-center shrink-0">
                      {/\.(pdf)(\?|$)/i.test(warrantyOrder.warranty_card_url) ? (
                        <div className="flex flex-col items-center text-[9px] text-muted-foreground">
                          <ShieldCheck size={20} className="text-primary" />
                          <span className="mt-0.5 font-semibold">PDF</span>
                        </div>
                      ) : (
                        <img src={warrantyOrder.warranty_card_url} alt="Warranty Card" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">Warranty card uploaded</div>
                      <div className="text-[11px] text-muted-foreground">Click to open full preview</div>
                    </div>
                    <Eye size={14} className="text-muted-foreground group-hover:text-primary shrink-0" />
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">No warranty card uploaded yet.</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadWarrantyCard(f); e.currentTarget.value = ""; }}
                    />
                    <span>
                      <Button asChild size="sm" variant="outline" disabled={uploading}>
                        <span className="cursor-pointer"><Upload size={14} /> {warrantyOrder.warranty_card_url ? "Replace" : "Upload"}</span>
                      </Button>
                    </span>
                  </label>
                  {warrantyOrder.warranty_card_url && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => window.open(warrantyOrder.warranty_card_url, "_blank")}>
                        <Eye size={14} /> View
                      </Button>
                      <Button size="sm" variant="outline" onClick={downloadWarrantyCard}>
                        <Download size={14} /> Download
                      </Button>
                      <Button size="sm" variant="outline" onClick={sendWarrantyWhatsApp} className="text-success border-success/30">
                        <MessageCircle size={14} /> WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={sendWarrantyEmail}>
                        <Mail size={14} /> Email
                      </Button>
                      <Button size="sm" variant="outline" onClick={removeWarrantyCard} className="text-destructive border-destructive/30">
                        <Trash2 size={14} /> Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setWarrantyOrder(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LabOrders;
