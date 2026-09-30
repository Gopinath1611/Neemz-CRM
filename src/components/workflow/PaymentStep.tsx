import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  CreditCard, FileText, Printer, MessageSquare, Phone, Pencil, Trash2,
  IndianRupee, AlertCircle, ArrowRight, Plus, Clock, CheckCircle2, Ticket
} from "lucide-react";
import { toast } from "sonner";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";
import { dedupeBillingRecords } from "@/lib/billingRecords";
import { PAYMENT_MODE_OPTIONS, normalizeMode } from "@/lib/paymentMode";
import {
  lookupCouponByCode, findPendingCouponForPhone, markCouponRedeemed, couponOfferLabel,
  type CouponRecord,
} from "@/lib/couponRedemption";

interface PaymentStepProps {
  selectedPatient: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  renderQuickPatientSearch: () => React.ReactNode;
  onContinue: () => void;
  activeCheckinId?: string | null;
}

interface BillingRecord {
  id: string;
  total_amount: number;
  amount_paid: number | null;
  payment_status: string;
  created_at: string;
  payment_method: string | null;
  invoice_number: string | null;
  discount_amount: number | null;
  subtotal: number;
  tax_amount: number | null;
  notes: string | null;
  checkin_id?: string | null;
  patient_id?: string | null;
}

interface BillingItem {
  id: string;
  treatment_type: string;
  description: string | null;
  quantity: number | null;
  unit_price: number;
  total_price: number;
  tooth_number: string | null;
}

interface PaymentEntry {
  method: string;
  amount: string;
}

const PaymentStep = ({ selectedPatient, renderQuickPatientSearch, onContinue, activeCheckinId = null }: PaymentStepProps) => {
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<BillingRecord | null>(null);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([{ method: "cash", amount: "" }]);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState({ treatment_type: "", tooth_number: "", quantity: "1", unit_price: "0" });

  // Coupon (Offline Campaign offers) — code entry + pending-coupon banner
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [pendingCoupon, setPendingCoupon] = useState<CouponRecord | null>(null);


  // Admin / Finance Manager: Edit Paid Bill / Adjust Amount
  const { hasRole } = useAuth();
  const canAdjust = hasRole("admin") || hasRole("finance_manager");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDiscount, setAdjustDiscount] = useState("0");
  const [adjustTotal, setAdjustTotal] = useState("0");
  const [adjustCollected, setAdjustCollected] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);

  useEffect(() => {
    if (selectedPatient) fetchBillings();
  }, [selectedPatient, activeCheckinId]);

  useEffect(() => {
    let active = true;
    setPendingCoupon(null);
    setCouponCode("");
    if (selectedPatient?.phone) {
      findPendingCouponForPhone(selectedPatient.phone)
        .then((c) => { if (active) setPendingCoupon(c); })
        .catch(() => { /* banner is optional */ });
    }
    return () => { active = false; };
  }, [selectedPatient?.id, selectedPatient?.phone]);


  const preferredBilling = useMemo(() => {
    const active = billings.filter(b => b.payment_status !== "cancelled");
    if (!active.length) return null;

    if (activeCheckinId) {
      const activeBill = active.find((record) => record.checkin_id === activeCheckinId && record.payment_status !== "paid");
      if (activeBill) return activeBill;

      const activeBillAnyStatus = active.find((record) => record.checkin_id === activeCheckinId);
      if (activeBillAnyStatus) return activeBillAnyStatus;
    }

    return active.find((record) => record.payment_status !== "paid") || active[0];
  }, [billings, activeCheckinId]);

  useEffect(() => {
    if (selectedBilling) {
      fetchBillingItems(selectedBilling.id);
      setDiscountAmount(String(selectedBilling.discount_amount || 0));
      // Sync payment date with the invoice date shown above
      setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    }
    // Keyed by id so refreshed billing objects (new amount_paid/status) don't
    // reset local inputs — they only refresh the derived totals below.
  }, [selectedBilling?.id]);

  useEffect(() => {
    setSelectedBilling((current) => {
      // Always adopt the freshest record for the bill we're on so balance and
      // status recompute immediately after a payment is recorded.
      if (current) {
        const refreshed = billings.find((b) => b.id === current.id);
        if (refreshed) return refreshed;
      }
      return preferredBilling;
    });
  }, [billings, preferredBilling]);


  const fetchBillings = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    const { data } = await supabase
      .from("billings")
      .select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    const records = dedupeBillingRecords((data as BillingRecord[]) || []);
    setBillings(records);
    setLoading(false);
  };

  const fetchBillingItems = async (billingId: string) => {
    const { data } = await supabase
      .from("billing_items")
      .select("*")
      .eq("billing_id", billingId)
      .order("created_at", { ascending: true });
    setBillingItems((data as BillingItem[]) || []);
  };

  if (!selectedPatient) return null;

  const patientName = `${selectedPatient.first_name} ${selectedPatient.last_name}`;
  const billing = selectedBilling;
  const balance = billing ? billing.total_amount - (billing.amount_paid || 0) : 0;

  const openAdjust = () => {
    if (!billing) return;
    setAdjustDiscount(String(billing.discount_amount || 0));
    setAdjustTotal(String(billing.total_amount || 0));
    setAdjustCollected(String(billing.amount_paid || 0));
    setAdjustReason("");
    setAdjustOpen(true);
  };

  const handleAdjustBill = async () => {
    if (!billing) return;
    const total = parseFloat(adjustTotal);
    const collected = parseFloat(adjustCollected);
    const disc = parseFloat(adjustDiscount) || 0;
    if (isNaN(total) || total < 0) { toast.error("Enter a valid total amount"); return; }
    if (isNaN(collected) || collected < 0) { toast.error("Enter a valid collected amount"); return; }
    if (collected > total) { toast.error("Collected amount cannot exceed the total"); return; }
    if (!adjustReason.trim()) { toast.error("Reason is mandatory for bill adjustment"); return; }

    setSavingAdjust(true);
    try {
      const oldCollected = billing.amount_paid || 0;
      const delta = Math.round((collected - oldCollected) * 100) / 100;
      const newStatus = total > 0 && collected >= total ? "paid" : collected > 0 ? "partial" : "pending";

      const { error } = await supabase
        .from("billings")
        .update({
          discount_amount: disc,
          total_amount: total,
          amount_paid: collected,
          payment_status: newStatus,
          notes: `${billing.notes ? billing.notes + "\n" : ""}[Adjustment] ${adjustReason.trim()} (Total → ₹${total}, Collected → ₹${collected})`,
        })
        .eq("id", billing.id);
      if (error) { toast.error("Failed to update bill"); return; }

      // Keep Finance "Collected" (SUM of billing_payments) in sync via an adjustment entry
      if (delta !== 0) {
        // Date the adjustment on the ORIGINAL transaction day (latest real
        // payment on this bill; fallback: invoice date) so the negative value
        // deducts from that day's collection, not today.
        const { data: lastPay } = await supabase
          .from("billing_payments")
          .select("payment_date")
          .eq("billing_id", billing.id)
          // include legacy rows with NULL payment_method (SQL <> excludes NULLs)
          .or("payment_method.is.null,payment_method.neq.adjustment")
          .order("payment_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const adjustmentDate = lastPay?.payment_date || billing.created_at || new Date().toISOString();
        const { error: payErr } = await supabase.from("billing_payments").insert({
          billing_id: billing.id,
          patient_id: billing.patient_id,
          payment_date: adjustmentDate,
          amount: delta,
          payment_method: "adjustment",
          notes: `Bill adjustment: ${adjustReason.trim()}`,
        });
        if (payErr) toast.error("Bill updated, but adjustment payment log failed");
      }

      toast.success("Bill adjusted — finance reports updated");
      setAdjustOpen(false);
      await fetchBillings();
    } finally {
      setSavingAdjust(false);
    }
  };
  const pendingBills = billings.filter(b => b.payment_status !== "paid" && b.payment_status !== "cancelled" && (b.total_amount - (b.amount_paid || 0)) > 0);
  const totalPaymentAmount = paymentEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const paymentHistory = (billing?.notes || "").split("\n").filter(n => n.includes("₹"));

  const handleAddPaymentRow = () => setPaymentEntries([...paymentEntries, { method: "cash", amount: "" }]);
  const handleRemovePaymentRow = (idx: number) => setPaymentEntries(paymentEntries.filter((_, i) => i !== idx));
  const handlePaymentEntryChange = (idx: number, field: "method" | "amount", value: string) => {
    const updated = [...paymentEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    setPaymentEntries(updated);
  };

  // Inventory deduction for paid pharmacy bills is owned exclusively by the
  // idempotent database trigger; no client-side deduction path exists here.


  const handleRecordPayment = async () => {
    if (recordingPayment) return;
    if (!billing) return;
    if (totalPaymentAmount <= 0) { toast.error("Enter a valid payment amount"); return; }
    // Block split-payment over-recording: Σ leg amounts must not exceed the
    // remaining balance on this bill. Each leg must itself be a positive
    // number representing only that mode's contribution (never the full bill).
    const validEntriesPre = paymentEntries.filter((e) => parseFloat(e.amount) > 0);
    if (validEntriesPre.length === 0) { toast.error("Enter at least one payment amount"); return; }
    for (const e of validEntriesPre) {
      const v = parseFloat(e.amount);
      if (!isFinite(v) || v <= 0) { toast.error("Each split leg needs a positive amount"); return; }
    }
    if (totalPaymentAmount - balance > 0.01) {
      toast.error(`Total split amount ₹${totalPaymentAmount.toLocaleString()} exceeds remaining balance ₹${balance.toLocaleString()}`);
      return;
    }
    setRecordingPayment(true);
    try {
      const newPaid = (billing.amount_paid || 0) + totalPaymentAmount;
      const methodsLabel = paymentEntries.filter(e => parseFloat(e.amount) > 0).map(e => `${e.method}: ₹${e.amount}`).join(", ");
      const newStatus = newPaid >= billing.total_amount ? "paid" : "partial";
      const noteText = `${methodsLabel}${paymentNotes ? ` | ${paymentNotes}` : ""} (${paymentDate})`;
      const existingNotes = billing.notes || "";
      const updatedNotes = existingNotes ? `${existingNotes}\n${noteText}` : noteText;

      // Build payment_date timestamp on selected date (preserve current time so multiple same-day entries order correctly)
      const now = new Date();
      const paymentTs = new Date(`${paymentDate}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`).toISOString();

      // 1) Insert ONE billing_payments row per non-zero mode entry, using
      //    canonical mode keys. This is the only way Finance/Analytics will
      //    attribute amounts per mode correctly. If any insert fails, roll
      //    back every row we just wrote so the transaction is all-or-nothing.
      const validEntries = paymentEntries.filter((e) => parseFloat(e.amount) > 0);
      const insertedIds: string[] = [];
      let insertFailed = false;
      let insertErrCode: string | undefined;

      for (const e of validEntries) {
        const canonicalMode = normalizeMode(e.method);
        const amt = parseFloat(e.amount);
        const { data: inserted, error: payErr } = await supabase
          .from("billing_payments")
          .insert({
            billing_id: billing.id,
            patient_id: billing.patient_id,
            payment_date: paymentTs,
            amount: amt,
            payment_method: canonicalMode,
            notes: paymentNotes || null,
          })
          .select("id")
          .single();

        if (payErr || !inserted?.id) {
          insertFailed = true;
          insertErrCode = payErr?.code;
          break;
        }
        insertedIds.push(inserted.id);
      }

      if (insertFailed) {
        // Atomic rollback: remove anything we just inserted.
        if (insertedIds.length > 0) {
          await supabase.from("billing_payments").delete().in("id", insertedIds);
        }
        toast.error(insertErrCode === "23505" ? "This payment was already recorded" : "Payment record failed");
        fetchBillings();
        return;
      }

      // 2) Update billing totals/status (does NOT change original created_at).
      //    billings.payment_method stays as a display label (comma-joined canonical modes).
      const displayMethods = validEntries.map((e) => normalizeMode(e.method)).join(", ");
      const { error } = await supabase
        .from("billings")
        .update({
          amount_paid: newPaid,
          payment_status: newStatus,
          payment_method: displayMethods,
          notes: updatedNotes,
        })
        .eq("id", billing.id);

      if (error) {
        // Roll back the payment rows so amounts don't drift.
        if (insertedIds.length > 0) {
          await supabase.from("billing_payments").delete().in("id", insertedIds);
        }
        toast.error("Payment update failed");
        return;
      }

      // Inventory deduction is handled server-side by the
      // trg_handle_billing_status_inventory trigger when payment_status flips to 'paid'.
      // The trigger is idempotent so no client-side deduction is needed.

      toast.success("Payment recorded successfully!");
      setPaymentEntries([{ method: "cash", amount: "" }]);
      setPaymentNotes("");
      await fetchBillings();
    } finally {
      setRecordingPayment(false);

    }
  };

  const handleApplyCoupon = async (codeInput?: string) => {
    const code = (codeInput ?? couponCode).trim();
    if (!billing) { toast.error("Select an invoice first"); return; }
    if (!code) { toast.error("Enter a coupon code first"); return; }

    setApplyingCoupon(true);
    try {
      const result = await lookupCouponByCode(code, selectedPatient?.phone);
      if (!result.ok || !result.coupon) {
        toast.error(result.reason || "Coupon could not be applied");
        return;
      }
      const coupon = result.coupon;
      const pct = Number(coupon.discount_percentage || 0);
      const disc = Math.min(billing.subtotal, Math.round((billing.subtotal * pct) / 100));
      const newTotal = billing.subtotal - disc + (billing.tax_amount || 0);
      const newStatus = (billing.amount_paid || 0) >= newTotal ? "paid" : billing.payment_status;

      const { error } = await supabase
        .from("billings")
        .update({ discount_amount: disc, total_amount: newTotal, payment_status: newStatus })
        .eq("id", billing.id);
      if (error) { toast.error("Failed to apply the coupon discount"); return; }

      const redeemed = await markCouponRedeemed(coupon.id);
      setDiscountAmount(String(disc));
      setCouponCode(coupon.coupon_code || code);
      if (pendingCoupon?.id === coupon.id) setPendingCoupon(null);
      await fetchBillings();

      toast.success(
        `Coupon ${coupon.coupon_code || code} applied — ${couponOfferLabel(coupon)} (₹${disc.toLocaleString()} off)` +
        (redeemed ? "" : ". Note: could not mark it as redeemed."),
      );
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleUpdateDiscount = async () => {
    if (!billing) return;
    const disc = parseFloat(discountAmount) || 0;
    const newTotal = billing.subtotal - disc + (billing.tax_amount || 0);
    const newStatus = (billing.amount_paid || 0) >= newTotal ? "paid" : billing.payment_status;

    const { error } = await supabase
      .from("billings")
      .update({ discount_amount: disc, total_amount: newTotal, payment_status: newStatus })
      .eq("id", billing.id);

    if (error) toast.error("Failed to update discount");
    else { toast.success("Discount updated"); fetchBillings(); }
  };

  const handleDeletePayment = async () => {
    if (!billing || !confirm("Cancel this payment record? It will be marked as VOID and excluded from totals.")) return;
    const { error } = await supabase
      .from("billings")
      .update({ payment_status: "cancelled" })
      .eq("id", billing.id);
    if (error) toast.error("Cancel failed");
    else { toast.success("Payment cancelled"); setSelectedBilling(null); fetchBillings(); }
  };

  const handleEditItem = (item: BillingItem) => {
    setEditingItemId(item.id);
    setEditItemDraft({
      treatment_type: item.treatment_type,
      tooth_number: item.tooth_number || "",
      quantity: String(item.quantity || 1),
      unit_price: String(item.unit_price),
    });
  };

  const handleSaveItemEdit = async (itemId: string) => {
    const qty = parseInt(editItemDraft.quantity) || 1;
    const price = parseFloat(editItemDraft.unit_price) || 0;
    const total = qty * price;
    const { error } = await supabase.from("billing_items").update({
      treatment_type: editItemDraft.treatment_type,
      tooth_number: editItemDraft.tooth_number || null,
      quantity: qty,
      unit_price: price,
      total_price: total,
    }).eq("id", itemId);
    if (error) { toast.error("Update failed"); return; }
    toast.success("Item updated");
    setEditingItemId(null);
    if (billing) {
      await fetchBillingItems(billing.id);
      // Recompute billing subtotal/total
      const { data: items } = await supabase.from("billing_items").select("total_price").eq("billing_id", billing.id);
      const newSubtotal = (items || []).reduce((s, i: any) => s + Number(i.total_price || 0), 0);
      const newTotal = newSubtotal - (billing.discount_amount || 0) + (billing.tax_amount || 0);
      await supabase.from("billings").update({ subtotal: newSubtotal, total_amount: newTotal }).eq("id", billing.id);
      fetchBillings();
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("billing_items").delete().eq("id", itemId);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Item deleted");
    if (billing) {
      await fetchBillingItems(billing.id);
      const { data: items } = await supabase.from("billing_items").select("total_price").eq("billing_id", billing.id);
      const newSubtotal = (items || []).reduce((s, i: any) => s + Number(i.total_price || 0), 0);
      const newTotal = newSubtotal - (billing.discount_amount || 0) + (billing.tax_amount || 0);
      await supabase.from("billings").update({ subtotal: newSubtotal, total_amount: newTotal }).eq("id", billing.id);
      fetchBillings();
    }
  };

  const handleDeleteBillingRecord = async (billingId: string) => {
    if (!confirm("Delete this entire bill?")) return;
    await supabase.from("billing_items").delete().eq("billing_id", billingId);
    const { error } = await supabase.from("billings").delete().eq("id", billingId);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Bill deleted");
    if (selectedBilling?.id === billingId) setSelectedBilling(null);
    fetchBillings();
  };

  const handlePrintInvoice = async () => {
    if (!billing) return;
    const { openBrandedPrintWindow } = await import("@/lib/clinicBranding");
    const body = `
      <h2 style="text-align:center;margin:0 0 12px;">INVOICE</h2>
      <div style="text-align:center;font-size:12px;color:#555;margin-bottom:14px;">
        Invoice #: <b>${billing.invoice_number || "N/A"}</b> &nbsp;|&nbsp;
        Date: ${format(new Date(billing.created_at), "dd MMM yyyy")} &nbsp;|&nbsp;
        Patient: ${patientName}
      </div>
      <table><thead><tr><th>Treatment</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${billingItems.map(i => `<tr><td>${i.treatment_type}${i.description ? ` - ${i.description}` : ""}</td>
      <td>${i.quantity || 1}</td><td>₹${i.unit_price.toLocaleString()}</td><td>₹${i.total_price.toLocaleString()}</td></tr>`).join("")}</tbody></table>
      <div style="margin-top:10px;font-size:13px;">
        <div>Subtotal: ₹${billing.subtotal.toLocaleString()}</div>
        <div>Discount: ₹${(billing.discount_amount || 0).toLocaleString()}</div>
        <div style="font-weight:700;font-size:16px;margin-top:6px;">Total: ₹${billing.total_amount.toLocaleString()}</div>
        <div>Paid: ₹${(billing.amount_paid || 0).toLocaleString()}</div>
        <div>Balance: ₹${balance.toLocaleString()}</div>
      </div>`;
    await openBrandedPrintWindow({ title: `Invoice - ${billing.invoice_number || billing.id.slice(0, 8)}`, bodyHtml: body });
  };

  const handlePrintPrescription = () => toast.info("Use Prescription step to print prescription");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <CreditCard size={20} /> Payment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderQuickPatientSearch()}

        {/* Pending offline-campaign coupon for this patient's mobile number */}
        {pendingCoupon?.coupon_code && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <Ticket size={14} className="text-primary" />
            <span className="font-medium">Coupon {pendingCoupon.coupon_code} available</span>
            <span className="text-xs text-muted-foreground">
              {couponOfferLabel(pendingCoupon)}
              {pendingCoupon.expiry_date ? ` · valid till ${format(new Date(pendingCoupon.expiry_date), "dd MMM yyyy")}` : ""}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs ml-auto"
              disabled={applyingCoupon || !billing}
              onClick={() => handleApplyCoupon(pendingCoupon.coupon_code || "")}
            >
              Apply
            </Button>
          </div>
        )}


        {/* Top Status Bar */}
        {billing && (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-secondary/30">
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground">Invoice #</p>
                <p className="font-semibold">{billing.invoice_number || "N/A"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Invoice Date</p>
                <p className="font-semibold">{format(new Date(billing.created_at), "dd MMM yyyy")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Total Amount</p>
                <p className="font-semibold">₹{billing.total_amount.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={billing.payment_status === "paid" ? "default" : "destructive"}
                  className="text-xs px-3 py-1"
                >
                  {billing.payment_status === "paid" ? (
                    <><CheckCircle2 size={12} className="mr-1" /> Paid</>
                  ) : (
                    <><AlertCircle size={12} className="mr-1" /> {billing.payment_status}</>
                  )}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Service & Treatment Info */}
        {billing && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <FileText size={14} /> Service & Treatment Info
            </h4>
            {billingItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items found</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-10">#</TableHead>
                      <TableHead className="text-xs">Treatment</TableHead>
                      <TableHead className="text-xs">Tooth</TableHead>
                      <TableHead className="text-xs">Qty</TableHead>
                      <TableHead className="text-xs">Price</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingItems.map((item, idx) => {
                      const isEditing = editingItemId === item.id;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-xs font-medium">
                            {isEditing ? (
                              <Input value={editItemDraft.treatment_type} onChange={e => setEditItemDraft({ ...editItemDraft, treatment_type: e.target.value })} className="h-7 text-xs" />
                            ) : (
                              <>{item.treatment_type}{item.description ? ` - ${item.description}` : ""}</>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input value={editItemDraft.tooth_number} onChange={e => setEditItemDraft({ ...editItemDraft, tooth_number: e.target.value })} className="h-7 text-xs w-16" />
                            ) : (item.tooth_number || "—")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input type="number" value={editItemDraft.quantity} onChange={e => setEditItemDraft({ ...editItemDraft, quantity: e.target.value })} className="h-7 text-xs w-14" />
                            ) : (item.quantity || 1)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input type="number" value={editItemDraft.unit_price} onChange={e => setEditItemDraft({ ...editItemDraft, unit_price: e.target.value })} className="h-7 text-xs w-20" />
                            ) : (`₹${item.unit_price.toLocaleString()}`)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">₹{item.total_price.toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Pending Bills */}
        {pendingBills.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2 text-destructive">
              <AlertCircle size={14} /> Pending Bills ({pendingBills.length})
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Total</TableHead>
                    <TableHead className="text-xs">Paid</TableHead>
                    <TableHead className="text-xs">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingBills.map(b => {
                    const bal = b.total_amount - (b.amount_paid || 0);
                    const isSelected = selectedBilling?.id === b.id;
                    return (
                      <TableRow
                        key={b.id}
                        className={`cursor-pointer hover:bg-accent/50 ${isSelected ? "bg-accent/40" : ""}`}
                        onClick={() => setSelectedBilling(b)}
                      >
                        <TableCell className="text-xs font-medium">{b.invoice_number || b.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">{format(new Date(b.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs">₹{b.total_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-xs">₹{(b.amount_paid || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-medium text-destructive">₹{bal.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Payment History */}
        {billing && paymentHistory.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Clock size={14} /> Payment History
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentHistory.map((entry, idx) => {
                    const dateMatch = entry.match(/\((\d{4}-\d{2}-\d{2})\)/);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-xs">{dateMatch ? dateMatch[1] : "—"}</TableCell>
                        <TableCell className="text-xs">{entry}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Payment Info - Record Payment */}
        {billing && balance > 0 && (
          <div className="bg-secondary/30 rounded-lg p-4 space-y-3 border">
            <h5 className="font-semibold text-sm flex items-center gap-2">
              <IndianRupee size={14} /> Record Payment
            </h5>
            <div className="space-y-2">
              {paymentEntries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={entry.method} onValueChange={v => handlePaymentEntryChange(idx, "method", v)}>
                    <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={entry.amount}
                    onChange={e => handlePaymentEntryChange(idx, "amount", e.target.value)}
                    className="w-28 h-8 text-xs"
                  />
                  {paymentEntries.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleRemovePaymentRow(idx)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleAddPaymentRow}>
                <Plus size={12} className="mr-1" /> Split Payment
              </Button>
            </div>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 text-xs w-40" />
            <Textarea placeholder="Payment notes..." value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="text-xs h-16" />
          </div>
        )}

        {/* Summary - Discount, Total, Paid, Balance */}
        {billing && (
          <div className="bg-card border rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span>Discount</span>
              <div className="flex items-center gap-1">
                <Input type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className="w-24 h-7 text-xs" />
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleUpdateDiscount}>Apply</Button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1"><Ticket size={13} /> Coupon Code</span>
              <div className="flex items-center gap-1">
                <Input
                  value={couponCode}
                  placeholder="CPN-XXXXX"
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") handleApplyCoupon(); }}
                  className="w-36 h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={applyingCoupon}
                  onClick={() => handleApplyCoupon()}
                >
                  {applyingCoupon ? "Applying..." : "Apply"}
                </Button>
              </div>
            </div>

            <div className="flex justify-between font-medium items-center">
              <span>Total Amount</span>
              <div className="flex items-center gap-2">
                <span>₹{billing.total_amount.toLocaleString()}</span>
                {canAdjust && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openAdjust}>
                    <IndianRupee size={12} className="mr-1" /> Adjust
                  </Button>
                )}
              </div>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Amount Paid</span>
              <span>₹{((billing.amount_paid || 0) + totalPaymentAmount).toLocaleString()}</span>
            </div>
            <div className={`flex justify-between font-bold border-t pt-2 ${(balance - totalPaymentAmount) > 0 ? "text-destructive" : "text-green-600"}`}>
              <span>Balance Amount</span>
              <span>₹{Math.max(0, balance - totalPaymentAmount).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Record Payment Button */}
        {billing && balance > 0 && (
          <Button onClick={handleRecordPayment} disabled={totalPaymentAmount <= 0 || recordingPayment} className="w-full">
            <IndianRupee size={14} className="mr-1" /> Record Payment — ₹{totalPaymentAmount.toLocaleString()}
          </Button>
        )}

        {/* Paid confirmation */}
        {billing && balance <= 0 && (
          <div className="text-center py-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-green-600" />
            <p className="font-semibold text-green-700 dark:text-green-400">Fully Paid</p>
          </div>
        )}

        <Separator />

        {/* Communication */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Communication</h4>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              const inv = billing?.invoice_number || billing?.id?.slice(0, 8) || "";
              const total = billing?.total_amount ?? 0;
              const paid = billing?.amount_paid ?? 0;
              const bal = total - paid;
              const patientName = `${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim() || selectedPatient.first_name || "Patient";
              // Filter out medicine/pharmacy line items — {{2}} should only reflect dental treatments.
              const isMedicineItem = (it: any) => {
                const t = String(it?.treatment_type || "").toLowerCase();
                const d = String(it?.description || "").toLowerCase();
                return (
                  t.includes("medicine") ||
                  t.includes("pharmacy") ||
                  t.includes("prescription") ||
                  d.includes("medicine") ||
                  d.includes("pharmacy")
                );
              };
              const treatmentItems = billingItems.filter((it) => !isMedicineItem(it));
              const compiledItems = treatmentItems.length === 0
                ? "Dental Treatment"
                : treatmentItems.length === 1
                  ? `${treatmentItems[0].treatment_type}${treatmentItems[0].description ? ` - ${treatmentItems[0].description}` : ""}`
                  : treatmentItems.map((it, i) => {
                      const label = `${it.treatment_type}${it.description ? ` - ${it.description}` : ""}`;
                      return `${i + 1}. ${label}`;
                    }).join("; ");
              const text = `Hi ${selectedPatient.first_name}, here is your invoice from Dr Neemz Dentistry.\n\nInvoice: ${inv}\n${compiledItems}\nTotal: ₹${total.toLocaleString()}\nPaid: ₹${paid.toLocaleString()}\nBalance: ₹${bal.toLocaleString()}\n\nThank you!`;
              let invoicePdfPath: string | undefined;
              let invoicePdfUrl: string | undefined;
              try {
                const { generateInvoicePdfPath, generateInvoicePdfSignedUrl } = await import("@/lib/patientDocuments");
                invoicePdfPath = await generateInvoicePdfPath({
                  billing: billing!,
                  items: billingItems as any,
                  patientName,
                  patientPhone: selectedPatient.phone,
                });
                // Also generate a signed URL for the wa.me text fallback (if template send fails).
                try {
                  invoicePdfUrl = await generateInvoicePdfSignedUrl({
                    billing: billing!,
                    items: billingItems as any,
                    patientName,
                    patientPhone: selectedPatient.phone,
                  });
                } catch { /* fallback URL is optional */ }
              } catch (err: any) {
                toast.error(`Invoice PDF failed: ${err?.message || "unknown"}`);
                return;
              }
              // `fl_invoice_ready`: 4 BODY params + dynamic URL button ({{1}} = invoice number).
              void sendClinicWhatsApp({
                patient: selectedPatient,
                templateKey: "payment_invoice",
                bodyParams: [patientName, compiledItems, `₹${total.toLocaleString()}`, inv],
                buttonUrlParams: [invoicePdfPath],
                fallbackText: `${text}${invoicePdfUrl ? `\n\nDownload: ${invoicePdfUrl}` : ""}`,
                label: "Invoice",
              });
            }}>
              <MessageSquare size={14} className="mr-1" /> WhatsApp Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const patientName = `${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim() || selectedPatient.first_name || "Patient";
              const today = new Date();
              const todayLabel = today.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
              const medItems = billingItems.filter((it: any) =>
                String(it.treatment_type || "").toLowerCase().includes("medicine") ||
                String(it.treatment_type || "").toLowerCase().includes("prescription")
              );
              const rawDoctorName = (billing as any)?.doctor || (billingItems[0] as any)?.doctor || "Dr Neemz";
              // Template body already prefixes "Dr " — strip any leading Dr/Dr./Doctor to avoid "Dr Dr Neemz".
              const doctorName = String(rawDoctorName).replace(/^\s*(dr\.?|doctor)\s+/i, "").trim() || "Neemz";
              let prescriptionPdfPath: string | undefined;
              try {
                const { generatePrescriptionPdfPath } = await import("@/lib/patientDocuments");
                prescriptionPdfPath = await generatePrescriptionPdfPath({
                  patientName,
                  patientPhone: selectedPatient.phone,
                  doctorName,
                  date: today,
                  items: medItems.map((it: any) => {
                    const raw = String(it.description || it.treatment_type || "");
                    const dosageMatch = raw.match(/\(([^)]+)\)/);
                    const daysMatch = raw.match(/(\d+)\s*days?/i);
                    const cleanName = raw
                      .replace(/\([^)]*\)/g, "")
                      .replace(/\d+\s*days?/i, "")
                      .replace(/\s{2,}/g, " ")
                      .replace(/[\s\-–—]+$/g, "")
                      .trim();
                    return {
                      name: cleanName || raw,
                      dosage: dosageMatch ? dosageMatch[1].trim() : null,
                      days: daysMatch ? Number(daysMatch[1]) : (Number(it.quantity || 0) || null),
                      notes: it.tooth_number ? `Tooth: ${it.tooth_number}` : null,
                    };
                  }),
                });
              } catch (err: any) {
                toast.error(`Prescription PDF failed: ${err?.message || "unknown"}`);
                return;
              }
              // fl_prescription_ready fallback text must mirror the approved template body only —
              // no medicine list, dosage, or invoice-style summary.
              const fallbackBody = `Dear ${patientName}, your prescription from Dr ${doctorName} dated ${todayLabel} is ready.`;
              void sendClinicWhatsApp({
                patient: selectedPatient,
                templateKey: "prescription_share",
                // fl_prescription_ready — 3 BODY params (patient, doctor, date) + dynamic URL button (PDF path)
                bodyParams: [patientName, doctorName, todayLabel],
                buttonUrlParams: prescriptionPdfPath ? [prescriptionPdfPath] : undefined,
                fallbackText: prescriptionPdfPath
                  ? `${fallbackBody}\n\nDownload Prescription: ${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patient-doc/${encodeURI(prescriptionPdfPath)}`
                  : fallbackBody,
                label: "Prescription",
              });
            }}>
              <MessageSquare size={14} className="mr-1" /> WhatsApp Prescription
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.info("SMS sending coming soon")}>
              <Phone size={14} className="mr-1" /> SMS Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.info("SMS: Prescription sending coming soon")}>
              <Phone size={14} className="mr-1" /> SMS Prescription
            </Button>
          </div>
        </div>

        {/* Print */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Print</h4>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handlePrintInvoice}>
              <Printer size={14} className="mr-1" /> Print Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrintPrescription}>
              <Printer size={14} className="mr-1" /> Print Prescription
            </Button>
          </div>
        </div>

        {/* Edit / Delete */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => toast.info("Edit billing from Billing step")}>
            <Pencil size={14} className="mr-1" /> Edit Payment
          </Button>
          <Button size="sm" variant="outline" onClick={handleDeletePayment} className="text-destructive border-destructive/40 hover:bg-destructive/10">
            <Trash2 size={14} className="mr-1" /> Cancel Payment
          </Button>

        </div>

        <Separator />

        {/* Continue to Checkout */}
        <Button onClick={onContinue} className="gradient-primary text-primary-foreground w-full">
          Continue to Checkout <ArrowRight size={16} className="ml-2" />
        </Button>
      </CardContent>

      {/* Admin / Finance Manager: Edit Paid Bill / Adjust Amount */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Paid Bill / Adjust Amount</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Discount (₹)</Label>
              <Input type="number" min={0} value={adjustDiscount} onChange={e => setAdjustDiscount(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total Bill Value (₹)</Label>
              <Input type="number" min={0} value={adjustTotal} onChange={e => setAdjustTotal(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Actual Collected Amount (₹)</Label>
              <Input type="number" min={0} value={adjustCollected} onChange={e => setAdjustCollected(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason (mandatory)</Label>
              <Textarea value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="Why is this bill being adjusted?" className="text-sm" rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">
              Collected changes are logged as an adjustment entry dated on the original payment day, so that day's Finance reports stay accurate.
            </p>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdjustBill} disabled={savingAdjust}>
              {savingAdjust ? "Saving…" : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PaymentStep;
