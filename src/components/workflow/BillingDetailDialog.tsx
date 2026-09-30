import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, MessageSquare, Phone, Pencil, Trash2, IndianRupee, FileText, Clock, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";
import { PAYMENT_MODE_OPTIONS, normalizeMode } from "@/lib/paymentMode";

interface BillingRecord {
  id: string;
  total_amount: number;
  amount_paid: number | null;
  payment_status: string;
  created_at: string;
  payment_method: string | null;
  invoice_number: string | null;
  discount_amount: number | null;
  discount_percent: number | null;
  subtotal: number;
  tax_amount: number | null;
  notes: string | null;
  patient_id: string;
  checkin_id: string | null;
  plan_id: string | null;
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

interface BillingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billing: BillingRecord | null;
  patientName: string;
  allBillings: BillingRecord[];
  onRefresh: () => void;
}

const BillingDetailDialog = ({ open, onOpenChange, billing, patientName, allBillings, onRefresh }: BillingDetailDialogProps) => {
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([
    { method: "cash", amount: "" },
  ]);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [discountAmount, setDiscountAmount] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [consultationNotes, setConsultationNotes] = useState<string | null>(null);
  const [paymentRecords, setPaymentRecords] = useState<Array<{ id: string; payment_date: string; amount: number; payment_method: string | null; notes: string | null; billing_id: string; invoice_number?: string | null }>>([]);
  const { hasRole } = useAuth();
  const canAdjust = hasRole("admin") || hasRole("finance_manager");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDiscount, setAdjustDiscount] = useState("0");
  const [adjustTotal, setAdjustTotal] = useState("0");
  const [adjustCollected, setAdjustCollected] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);


  useEffect(() => {
    if (billing && open) {
      fetchBillingItems(billing.id);
      fetchPaymentRecords(billing.id);
      setDiscountAmount(String(billing.discount_amount || 0));
      if (billing.checkin_id) {
        supabase
          .from("dental_charts")
          .select("notes, created_at")
          .eq("checkin_id", billing.checkin_id)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            const rows = (data as any[]) || [];
            const combined = rows.map((r) => (r.notes || "").trim()).filter(Boolean).join("\n");
            setConsultationNotes(combined);
          });
      } else {
        setConsultationNotes(null);
      }
    }
  }, [billing, open]);

  const fetchPaymentRecords = async (billingId: string) => {
    const { data } = await supabase
      .from("billing_payments")
      .select("id, payment_date, amount, payment_method, notes, billing_id")
      .eq("billing_id", billingId)
      .order("payment_date", { ascending: true });
    setPaymentRecords((data as any[]) || []);
  };


  const fetchBillingItems = async (billingId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("billing_items")
      .select("*")
      .eq("billing_id", billingId)
      .order("created_at", { ascending: true });
    setBillingItems((data as BillingItem[]) || []);
    setLoading(false);
  };

  if (!billing) return null;

  const balance = billing.total_amount - (billing.amount_paid || 0);
  const pendingBills = allBillings.filter(b => b.payment_status !== "paid" && (b.total_amount - (b.amount_paid || 0)) > 0);

  const totalPaymentAmount = paymentEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  const handleAddPaymentRow = () => {
    setPaymentEntries([...paymentEntries, { method: "cash", amount: "" }]);
  };

  const handleRemovePaymentRow = (idx: number) => {
    setPaymentEntries(paymentEntries.filter((_, i) => i !== idx));
  };

  const handlePaymentEntryChange = (idx: number, field: "method" | "amount", value: string) => {
    const updated = [...paymentEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    setPaymentEntries(updated);
  };

  // Inventory deduction for paid pharmacy bills is owned exclusively by the
  // database trigger (`handle_billing_status_inventory` → `deduct_inventory_for_bill`),
  // which is idempotent per bill. No client-side deduction here — that caused
  // the same bill to reduce stock twice.


  const handleRecordPayment = async () => {
    if (recordingPayment) return;
    if (totalPaymentAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    // Validate every split leg + block over-recording past the remaining balance.
    const validEntries = paymentEntries.filter(e => parseFloat(e.amount) > 0);
    if (validEntries.length === 0) { toast.error("Enter at least one payment amount"); return; }
    for (const e of validEntries) {
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
      const methods = validEntries.map(e => `${e.method}: ₹${e.amount}`).join(", ");
      const newStatus = newPaid >= billing.total_amount ? "paid" : "partial";
      const noteText = `${methods}${paymentNotes ? ` | ${paymentNotes}` : ""} (${paymentDate})`;
      const existingNotes = billing.notes || "";
      const updatedNotes = existingNotes ? `${existingNotes}\n${noteText}` : noteText;

      // Build payment_date timestamp from selected date + current time.
      const now = new Date();
      const paymentTs = new Date(
        `${paymentDate}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
      ).toISOString();

      // Insert ONE billing_payments row per mode. All-or-nothing.
      const insertedIds: string[] = [];
      let failed = false;
      let failCode: string | undefined;

      for (const e of validEntries) {
        const canonical = normalizeMode(e.method);
        const amt = parseFloat(e.amount);
        const { data: inserted, error: payErr } = await supabase
          .from("billing_payments")
          .insert({
            billing_id: billing.id,
            patient_id: billing.patient_id,
            payment_date: paymentTs,
            amount: amt,
            payment_method: canonical,
            notes: paymentNotes || null,
          })
          .select("id")
          .single();
        if (payErr || !inserted?.id) {
          failed = true;
          failCode = payErr?.code;
          break;
        }
        insertedIds.push(inserted.id);
      }

      if (failed) {
        if (insertedIds.length > 0) {
          await supabase.from("billing_payments").delete().in("id", insertedIds);
        }
        toast.error(failCode === "23505" ? "This payment was already recorded" : "Payment record failed");
        return;
      }

      const displayMethods = validEntries.map(e => normalizeMode(e.method)).join(", ");
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
        if (insertedIds.length > 0) {
          await supabase.from("billing_payments").delete().in("id", insertedIds);
        }
        toast.error("Payment update failed");
      } else {
        // Stock deduction happens server-side via the billing status trigger.

        toast.success("Payment recorded");
        setPaymentEntries([{ method: "cash", amount: "" }]);
        setPaymentNotes("");
        await fetchPaymentRecords(billing.id);
        onRefresh();
      }

    } finally {
      setRecordingPayment(false);
    }
  };

  const handleUpdateDiscount = async () => {
    const disc = parseFloat(discountAmount) || 0;
    const newTotal = billing.subtotal - disc + (billing.tax_amount || 0);
    const newStatus = (billing.amount_paid || 0) >= newTotal ? "paid" : billing.payment_status;

    const { error } = await supabase
      .from("billings")
      .update({ discount_amount: disc, total_amount: newTotal, payment_status: newStatus })
      .eq("id", billing.id);

    if (error) toast.error("Failed to update discount");
    else { toast.success("Discount updated"); onRefresh(); }
  };

  const openAdjust = () => {
    setAdjustDiscount(String(billing.discount_amount || 0));
    setAdjustTotal(String(billing.total_amount || 0));
    setAdjustCollected(String(billing.amount_paid || 0));
    setAdjustReason("");
    setAdjustOpen(true);
  };

  const handleAdjustBill = async () => {
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
      await fetchPaymentRecords(billing.id);
      onRefresh();
    } finally {
      setSavingAdjust(false);
    }
  };

  const handlePrintInvoice = async () => {
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

  const paymentHistory = paymentRecords;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={20} /> Billing Details — {patientName}
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Invoice</p>
            <p className="font-bold text-sm">{billing.invoice_number || "N/A"}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold text-sm">₹{billing.total_amount.toLocaleString()}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="font-bold text-sm text-green-600">₹{(billing.amount_paid || 0).toLocaleString()}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`font-bold text-sm ${balance > 0 ? "text-destructive" : ""}`}>₹{balance.toLocaleString()}</p>
          </CardContent></Card>
        </div>

        <div className="flex items-center gap-2 mb-2 text-sm">
          <Badge variant={billing.payment_status === "paid" ? "default" : "destructive"}>
            {billing.payment_status}
          </Badge>
          <span className="text-muted-foreground">
            {format(new Date(billing.created_at), "dd MMM yyyy")}
          </span>
          <span className="text-muted-foreground capitalize">
            {billing.payment_method || "—"}
          </span>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="overview" className="text-xs">
              <FileText size={14} className="mr-1" /> Invoice
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">
              <AlertCircle size={14} className="mr-1" /> Pending
            </TabsTrigger>
            <TabsTrigger value="treatments" className="text-xs">
              <Clock size={14} className="mr-1" /> Treatments
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs">
              <CreditCard size={14} className="mr-1" /> Payments
            </TabsTrigger>
          </TabsList>

          {/* === INVOICE TAB === */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Invoice #:</span> <strong>{billing.invoice_number || "N/A"}</strong></div>
              <div><span className="text-muted-foreground">Date:</span> <strong>{format(new Date(billing.created_at), "dd MMM yyyy")}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={billing.payment_status === "paid" ? "default" : "destructive"} className="ml-1 text-[10px]">{billing.payment_status}</Badge></div>
              <div><span className="text-muted-foreground">Method:</span> <strong className="capitalize">{billing.payment_method || "—"}</strong></div>
            </div>

            {billing.checkin_id && (
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-1"><FileText size={14} /> Consultation Notes</h4>
                <div className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3">
                  {consultationNotes && consultationNotes.trim() ? (
                    consultationNotes
                  ) : (
                    <span className="text-muted-foreground italic">No Notes</span>
                  )}
                </div>
              </div>
            )}


            <div>
              <h4 className="font-semibold text-sm mb-2">Service & Treatment Info</h4>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : billingItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Treatment</TableHead>
                        <TableHead className="text-xs">Tooth</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        <TableHead className="text-xs">Price</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billingItems.map((item, idx) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-xs font-medium">{item.treatment_type}{item.description ? ` - ${item.description}` : ""}</TableCell>
                          <TableCell className="text-xs">{item.tooth_number || "—"}</TableCell>
                          <TableCell className="text-xs">{item.quantity || 1}</TableCell>
                          <TableCell className="text-xs">₹{item.unit_price.toLocaleString()}</TableCell>
                          <TableCell className="text-xs font-medium">₹{item.total_price.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{billing.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between items-center">
                <span>Discount</span>
                <div className="flex items-center gap-1">
                  <Input type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className="w-24 h-7 text-xs" />
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleUpdateDiscount}>Apply</Button>
                </div>
              </div>
              {(billing.tax_amount || 0) > 0 && (
                <div className="flex justify-between"><span>Tax</span><span>₹{(billing.tax_amount || 0).toLocaleString()}</span></div>
              )}
              <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>₹{billing.total_amount.toLocaleString()}</span></div>
              <div className="flex justify-between text-green-600"><span>Amount Paid</span><span>₹{(billing.amount_paid || 0).toLocaleString()}</span></div>
              <div className={`flex justify-between font-bold ${balance > 0 ? "text-destructive" : ""}`}>
                <span>Balance</span><span>₹{balance.toLocaleString()}</span>
              </div>
            </div>
          </TabsContent>

          {/* === PENDING BILLS TAB === */}
          <TabsContent value="pending" className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2"><AlertCircle size={16} /> Pending Bills ({pendingBills.length})</h4>
            {pendingBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending bills</p>
            ) : (
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
                    {pendingBills.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs font-medium">{b.invoice_number || b.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">{format(new Date(b.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs">₹{b.total_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-xs">₹{(b.amount_paid || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-medium text-destructive">₹{(b.total_amount - (b.amount_paid || 0)).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* === TREATMENTS TAB === */}
          <TabsContent value="treatments" className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2"><Clock size={16} /> Treatment Done</h4>
            {billingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No treatments</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Treatment</TableHead>
                      <TableHead className="text-xs">Action</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs font-medium">{item.treatment_type}</TableCell>
                        <TableCell className="text-xs">{item.description || "—"}</TableCell>
                        <TableCell className="text-xs">{format(new Date(billing.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs">₹{item.total_price.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* === PAYMENTS TAB === */}
          <TabsContent value="payments" className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2"><CreditCard size={16} /> Payment History</h4>

            {paymentHistory.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentHistory.map((entry, idx) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs">{format(new Date(entry.payment_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs capitalize">
                          {(entry.payment_method || "—")}: ₹{Number(entry.amount).toLocaleString()}
                          {entry.notes ? ` — ${entry.notes}` : ""}
                        </TableCell>
                      </TableRow>
                    ))}

                  </TableBody>
                </Table>
              </div>
            )}

            {balance > 0 && (
              <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                <h5 className="font-semibold text-sm">Record Payment</h5>
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
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleAddPaymentRow}>+ Split Payment</Button>
                </div>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 text-xs w-40" />
                <Textarea placeholder="Notes..." value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="text-xs h-16" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total: ₹{totalPaymentAmount.toLocaleString()}</span>
                  <Button size="sm" onClick={handleRecordPayment} disabled={totalPaymentAmount <= 0 || recordingPayment}>
                    <IndianRupee size={14} className="mr-1" /> {recordingPayment ? "Recording…" : "Record Payment"}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Communication & Actions */}
        <div className="border-t pt-4 mt-4 space-y-3">
          <h4 className="font-semibold text-sm">Communication & Actions</h4>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handlePrintInvoice}>
              <Printer size={14} className="mr-1" /> Print Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.info("Prescription print — use Prescription tab")}>
              <FileText size={14} className="mr-1" /> Print Prescription
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const { data: p } = await supabase
                .from("patients")
                .select("first_name,last_name,phone")
                .eq("id", billing.patient_id)
                .maybeSingle();
              if (!p) { toast.error("Patient not found for this billing"); return; }
              const inv = billing.invoice_number || billing.id.slice(0, 8);
              const bal = billing.total_amount - (billing.amount_paid || 0);
              const patientName = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.first_name || "Patient";
              const text = `Hi ${p.first_name}, here is your invoice.\n\nInvoice: ${inv}\nTotal: ₹${billing.total_amount.toLocaleString()}\nBalance: ₹${bal.toLocaleString()}\n\nThank you!`;
              // Fetch line items for the PDF
              const { data: lineItems } = await supabase
                .from("billing_items")
                .select("treatment_type,description,quantity,unit_price,total_price")
                .eq("billing_id", billing.id);
              let invoicePdfPath: string;
              try {
                const { generateInvoicePdfPath } = await import("@/lib/patientDocuments");
                invoicePdfPath = await generateInvoicePdfPath({
                  billing: billing as any,
                  items: (lineItems || []) as any,
                  patientName,
                  patientPhone: p.phone,
                });
              } catch (err: any) {
                toast.error(`Invoice PDF failed: ${err?.message || "unknown"}`);
                return;
              }
              void sendClinicWhatsApp({
                patient: p,
                templateKey: "payment_invoice",
                // fl_invoice_ready — 4 BODY params + dynamic URL button ({{1}} = invoice number).
                bodyParams: [patientName, `Invoice ${inv}`, `₹${billing.total_amount.toLocaleString()}`, inv],
                buttonUrlParams: [invoicePdfPath],
                fallbackText: text,
                label: "Invoice",
              });
            }}>
              <MessageSquare size={14} className="mr-1" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.info("SMS sending feature coming soon")}>
              <Phone size={14} className="mr-1" /> SMS
            </Button>
          </div>
          <div className="flex gap-2">
            {canAdjust && (
              <Button size="sm" variant="outline" onClick={openAdjust}>
                <IndianRupee size={14} className="mr-1" /> Adjust
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setIsEditing(!isEditing)}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Admin: Edit Paid Bill / Adjust Amount */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Paid Bill / Adjust Amount</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Discount (₹)</label>
              <Input type="number" min={0} value={adjustDiscount} onChange={e => setAdjustDiscount(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Total Bill Value (₹)</label>
              <Input type="number" min={0} value={adjustTotal} onChange={e => setAdjustTotal(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Actual Collected Amount (₹)</label>
              <Input type="number" min={0} value={adjustCollected} onChange={e => setAdjustCollected(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reason / Remarks <span className="text-destructive">*</span></label>
              <Textarea value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="Why is this bill being adjusted?" className="text-sm" rows={2} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Collected changes are logged as an adjustment entry dated on the original payment day, so that day's Finance reports stay accurate.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdjustBill} disabled={savingAdjust}>
                {savingAdjust ? "Saving…" : "Save Adjustment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default BillingDetailDialog;
