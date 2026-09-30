import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IndianRupee, TrendingUp, TrendingDown, Wallet, Receipt,
  CreditCard, Clock, FileText, PieChart, BarChart3,
  Users, Building2, ShoppingCart, Calculator, Target, Download, Landmark,
  ChevronDown, ChevronRight, Trash2, Loader2, CheckCircle2, AlertCircle,
  History, Undo2, SlidersHorizontal
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RPieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from "recharts";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BillingDetailDialog from "@/components/workflow/BillingDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { dedupeBillingRecords } from "@/lib/billingRecords";
import {
  REPORT_MODES,
  modeLabel,
  modeColor,
  normalizeMode,
  aggregatePaymentsByMode,
  parsePaymentSplits,
  reportBucket,
  prettyPaymentMethod,
} from "@/lib/paymentMode";

import { mergeWithLegacyPayments, runReconciliationAudit } from "@/lib/paymentReconciliation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } from "@/lib/clinicBranding";
import { FileSpreadsheet } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import DepositsSection from "@/components/finance/DepositsSection";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

const COLORS = [
  "hsl(217,91%,50%)", "hsl(142,71%,45%)", "hsl(38,92%,50%)",
  "hsl(330,80%,55%)", "hsl(172,66%,40%)", "hsl(0,72%,51%)",
  "hsl(260,60%,55%)", "hsl(190,80%,42%)"
];

const sections = [
  { id: "revenue", label: "Revenue Management", icon: IndianRupee },
  { id: "billing", label: "Billing & Invoicing", icon: Receipt },
  { id: "payments", label: "Payment Collection", icon: CreditCard },
  { id: "receivables", label: "Accounts Receivable", icon: Clock },
  { id: "deposits", label: "Deposits", icon: Landmark },
  { id: "expenses", label: "Expense Management", icon: TrendingDown },
  { id: "pnl", label: "Profit & Loss", icon: PieChart },
  { id: "cashflow", label: "Cash Flow", icon: Wallet },
  { id: "tax", label: "Tax & Compliance", icon: FileText },
  { id: "doctor_revenue", label: "Doctor Revenue Sharing", icon: Users },
  { id: "vendor", label: "Vendor & Lab Payments", icon: ShoppingCart },
  { id: "budget", label: "Financial Planning", icon: Target },
  { id: "dashboard", label: "Finance Dashboard", icon: BarChart3 },
];

const Finance = () => {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [selectedBilling, setSelectedBilling] = useState<any>(null);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [vendorDialog, setVendorDialog] = useState<{ open: boolean; type: "lab" | "supplier"; name: string }>({ open: false, type: "lab", name: "" });
  const [vendorStatusFilter, setVendorStatusFilter] = useState<string>("all");
  const [recordPayment, setRecordPayment] = useState<{ type: "lab" | "supplier"; id: string; label: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paySaving, setPaySaving] = useState(false);

  // Record a payment against a lab order or supplier purchase and sync its status.
  const handleRecordVendorPayment = async () => {
    if (!recordPayment) return;
    const amt = Number(payAmount || 0);
    if (amt <= 0) { toast.error("Enter a payment amount above zero"); return; }
    setPaySaving(true);
    try {
      if (recordPayment.type === "lab") {
        const o = labOrders.find((x: any) => x.id === recordPayment.id);
        if (!o) throw new Error("Lab order not found");
        const payable = Number(o.lab_expense || 0);
        const newPaid = Number(o.lab_expense_paid_amount || 0) + amt;
        const status = payable > 0 && newPaid >= payable ? "paid" : newPaid > 0 ? "partial" : "unpaid";
        const { error } = await supabase.from("lab_orders").update({
          lab_expense_paid_amount: newPaid,
          lab_expense_paid_date: payDate,
          lab_payment_status: status,
        }).eq("id", recordPayment.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["finance-lab-orders"] });
      } else {
        const p = purchases.find((x: any) => x.id === recordPayment.id);
        if (!p) throw new Error("Purchase not found");
        const newPaid = Number(p.amount_paid || 0) + amt;
        const total = Number(p.total_amount || 0);
        const status = total > 0 && newPaid >= total ? "paid" : newPaid > 0 ? "partial" : "pending";
        const { error } = await supabase.from("purchases").update({
          amount_paid: newPaid,
          payment_paid_date: payDate,
          payment_status: status,
        }).eq("id", recordPayment.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["finance-purchases"] });
      }
      toast.success("Payment recorded", { description: `${recordPayment.label} — ₹${amt.toLocaleString("en-IN")} on ${payDate}` });
      setRecordPayment(null);
      setPayAmount("");
    } catch (e: any) {
      toast.error("Payment failed", { description: e.message });
    } finally {
      setPaySaving(false);
    }
  };
  // ─── Receivables adjustments (Finance-level state so dialogs survive
  // re-renders of the nested ReceivablesSection component) ───
  // Receivables actions follow the per-module permission grid
  // (Settings → Manage Roles → Finance → Receivables). Admin bypasses it.
  const receivablesPerms = usePermissions("/finance#receivables");
  const isAdminUser = receivablesPerms.canEdit;
  const [adjustTarget, setAdjustTarget] = useState<any | null>(null);
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const [adjType, setAdjType] = useState("discount");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseSaving, setReverseSaving] = useState(false);

  // Append-only receivable adjustments. Read by everyone, inserted by admins.
  const { data: adjustments } = useQuery({
    queryKey: ["receivable-adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receivable_adjustments")
        .select("*")
        .order("adjusted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const adjByBilling = useMemo(() => {
    const m = new Map<string, any[]>();
    (adjustments || []).forEach((a: any) => {
      const arr = m.get(a.billing_id) || [];
      arr.push(a);
      m.set(a.billing_id, arr);
    });
    return m;
  }, [adjustments]);

  const adjTotalFor = (billingId: string) =>
    (adjByBilling.get(billingId) || []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);

  const openAdjust = (p: any) => {
    setAdjustTarget(p);
    setAdjType("discount");
    setAdjAmount("");
    setAdjReason("");
  };

  const saveAdjustment = async () => {
    if (!adjustTarget) return;
    const amt = Number(adjAmount || 0);
    if (!isFinite(amt) || amt <= 0) { toast.error("Enter an amount above zero"); return; }
    if (!adjReason.trim()) { toast.error("Reason is mandatory"); return; }
    const currentPending = Number(adjustTarget.pending || 0);
    if (amt > currentPending) {
      toast.error(`Amount cannot exceed current pending (₹${currentPending.toLocaleString("en-IN")})`);
      return;
    }
    setAdjSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("receivable_adjustments").insert({
        billing_id: adjustTarget.id,
        patient_id: adjustTarget.billing?.patient_id || null,
        adjustment_type: adjType,
        amount: amt,
        reason: adjReason.trim(),
        pending_before: currentPending,
        pending_after: currentPending - amt,
        adjusted_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Adjustment recorded", { description: `${adjustTarget.invoice_number || "Invoice"} — ₹${amt.toLocaleString("en-IN")}` });
      setAdjustTarget(null);
      queryClient.invalidateQueries({ queryKey: ["receivable-adjustments"] });
    } catch (e: any) {
      toast.error("Adjustment failed", { description: e.message });
    } finally {
      setAdjSaving(false);
    }
  };

  const saveReversal = async () => {
    if (!reverseTarget || !historyTarget) return;
    const origAmount = Number(reverseTarget.amount || 0);
    if (origAmount <= 0) { toast.error("Only positive adjustments can be reversed"); return; }
    if (!reverseReason.trim()) { toast.error("Reason is mandatory"); return; }
    setReverseSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const before = Number(historyTarget.pending || 0);
      const { error } = await supabase.from("receivable_adjustments").insert({
        billing_id: historyTarget.id,
        patient_id: historyTarget.billing?.patient_id || null,
        adjustment_type: reverseTarget.adjustment_type,
        amount: -origAmount,
        reason: reverseReason.trim(),
        pending_before: before,
        pending_after: before + origAmount,
        reverses_id: reverseTarget.id,
        adjusted_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Adjustment reversed", { description: `₹${origAmount.toLocaleString("en-IN")} restored to pending` });
      setReverseTarget(null);
      setReverseReason("");
      queryClient.invalidateQueries({ queryKey: ["receivable-adjustments"] });
    } catch (e: any) {
      toast.error("Reversal failed", { description: e.message });
    } finally {
      setReverseSaving(false);
    }
  };

  const [metricDialog, setMetricDialog] = useState<{ open: boolean; key: string }>({ open: false, key: "" });
  const [oldInvoicesDialogOpen, setOldInvoicesDialogOpen] = useState(false);
  const [outstandingExpanded, setOutstandingExpanded] = useState(false);
  const [cashModeFilter, setCashModeFilter] = useState<string | null>(null);
  const [oldDuesExpanded, setOldDuesExpanded] = useState(false);
  const [selectedTreatment, setSelectedTreatment] = useState<string | null>(null);


  const location = useLocation();
  const queryClient = useQueryClient();

  // Sync section with URL hash or direct /finance/deposits route
  useEffect(() => {
    if (location.pathname === "/finance/deposits") {
      setActiveSection("deposits");
      return;
    }
    const hash = location.hash.replace("#", "");
    if (hash && sections.some((s) => s.id === hash)) {
      setActiveSection(hash);
    }
  }, [location.pathname, location.hash]);

  // Paginated fetch — an unpaginated read is capped at 1000 rows by the
  // backend, which silently drops older invoices/payments and breaks totals.
  const fetchAllRows = async (table: string, orderCol: string) => {
    const pageSize = 1000;
    const all: any[] = [];
    for (let page = 0; ; page += 1) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*")
        .order(orderCol, { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) break;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    return all;
  };

  // Fetch all financial data
  const { data: billings = [] } = useQuery({
    queryKey: ["finance-billings"],
    queryFn: async () => fetchAllRows("billings", "created_at"),
  });


  const { data: billingItems = [] } = useQuery({
    queryKey: ["finance-billing-items"],
    queryFn: async () => {
      return fetchAllRows("billing_items", "created_at");
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["finance-expenses"],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      return data || [];
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["finance-purchases"],
    queryFn: async () => {
      const { data } = await supabase.from("purchases").select("*").order("purchase_date", { ascending: false });
      return data || [];
    },
  });

  const { data: payroll = [] } = useQuery({
    queryKey: ["finance-payroll"],
    queryFn: async () => {
      const { data } = await supabase.from("payroll").select("*, employees(first_name, last_name)");
      return data || [];
    },
  });

  const { data: labOrders = [] } = useQuery({
    queryKey: ["finance-lab-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("lab_orders").select("*");
      return data || [];
    },
  });

  // Payment transactions — source of truth for revenue/collection dates.
  // Raw rows from billing_payments only; the merge with reconciled legacy
  // synthetic rows happens below so every Finance/Analytics aggregation sees
  // a consistent dataset.
  const { data: rawBillingPayments = [] } = useQuery({
    queryKey: ["finance-billing-payments"],
    queryFn: async () => fetchAllRows("billing_payments", "payment_date"),
  });

  // Bank remittances made out of the physical cash drawer. Read-only; used only
  // for cash settlement visibility. Deposits are transfers of cash already
  // counted as income — they never enter revenue, expense or profit maths.
  const { data: drawerDeposits = [] } = useQuery({
    queryKey: ["finance-drawer-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("id, deposit_amount, status, source, drawer_date, deposit_date")
        .eq("source", "cash_drawer")
        .neq("status", "Cancelled");
      if (error) throw error;
      return data || [];
    },
  });



  const planIdsToLoad = useMemo(
    () => Array.from(new Set(
      billings.map((row: any) => row.plan_id).filter((v): v is string => Boolean(v))
    )),
    [billings]
  );

  const checkinIdsToLoad = useMemo(
    () => Array.from(new Set(
      billings.map((row: any) => row.checkin_id).filter((v): v is string => Boolean(v))
    )),
    [billings]
  );

  const { data: treatmentPlans = [] } = useQuery({
    queryKey: ["finance-treatment-plans", planIdsToLoad, checkinIdsToLoad],
    enabled: planIdsToLoad.length > 0 || checkinIdsToLoad.length > 0,
    queryFn: async () => {
      const all: any[] = [];
      const chunkSize = 200;
      for (let from = 0; from < planIdsToLoad.length; from += chunkSize) {
        const chunk = planIdsToLoad.slice(from, from + chunkSize);
        const { data, error } = await supabase
          .from("treatment_plans")
          .select("id, checkin_id, doctor")
          .in("id", chunk);
        if (error) throw error;
        if (data?.length) all.push(...data);
      }
      for (let from = 0; from < checkinIdsToLoad.length; from += chunkSize) {
        const chunk = checkinIdsToLoad.slice(from, from + chunkSize);
        const { data, error } = await supabase
          .from("treatment_plans")
          .select("id, checkin_id, doctor")
          .in("checkin_id", chunk);
        if (error) throw error;
        if (data?.length) all.push(...data);
      }
      return all;
    },
  });

  const patientIdsToLoad = useMemo(
    () => Array.from(new Set(
      [...billings, ...labOrders]
        .map((row: any) => row.patient_id)
        .filter((patientId): patientId is string => Boolean(patientId))
    )),
    [billings, labOrders]
  );

  const { data: patients = [] } = useQuery({
    queryKey: ["finance-patients", patientIdsToLoad],
    enabled: patientIdsToLoad.length > 0,
    queryFn: async () => {
      const all: any[] = [];
      const chunkSize = 200;

      for (let from = 0; from < patientIdsToLoad.length; from += chunkSize) {
        const patientIdsChunk = patientIdsToLoad.slice(from, from + chunkSize);
        const { data, error } = await supabase
          .from("patients")
          .select("id, first_name, last_name, phone")
          .in("id", patientIdsChunk);

        if (error) throw error;
        if (data?.length) all.push(...data);
      }

      return all;
    },
  });

  // Referred patients — used to tag referral-linked collections (read-only)
  const { data: referrals = [] } = useQuery({
    queryKey: ["finance-referrals"],
    queryFn: async () => {
      const { data } = await supabase.from("referrals").select("id, referred_patient_id");
      return data || [];
    },
  });

  // Referral income — external diagnostic orders count as income only once the
  // report is received or reviewed. Ordered / Sample Collected / Cancelled stay
  // excluded from Finance entirely. The order's created_at is the transaction date.
  const { data: referralOrders = [] } = useQuery({
    queryKey: ["finance-referral-income"],
    queryFn: async () => {
      const { data } = await supabase.from("diagnostic_orders").select("id, status, cost, created_at");
      return data || [];
    },
  });



  const { data: purchaseItems = [] } = useQuery({
    queryKey: ["finance-purchase-items"],
    queryFn: async () => {
      const { data } = await supabase.from("purchase_items").select("*");
      return data || [];
    },
  });

  // ─── Global Date Filter ───
  const { preset: globalPreset, setPreset: setGlobalPreset, customFrom: globalFrom, setCustomFrom: setGlobalFrom, customTo: globalTo, setCustomTo: setGlobalTo, range: globalRange } =
    useDateRangeFilter("today");

  const inGlobalRange = (dateStr?: string | null) => {
    if (!globalRange.from && !globalRange.to) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (globalRange.from && d < globalRange.from) return false;
    if (globalRange.to && d > globalRange.to) return false;
    return true;
  };

  // Filtered source arrays — every section uses these
  const fBillings = useMemo(
    () => dedupeBillingRecords(billings.filter((b: any) => inGlobalRange(b.created_at))),
    [billings, globalRange.from, globalRange.to]
  );
  const fBillingIds = useMemo(() => new Set(fBillings.map((b: any) => b.id)), [fBillings]);
  const fBillingItems = useMemo(() => billingItems.filter((it: any) => fBillingIds.has(it.billing_id)), [billingItems, fBillingIds]);
  const fExpenses = useMemo(() => expenses.filter((e: any) => inGlobalRange(e.expense_date)), [expenses, globalRange.from, globalRange.to]);
  const fPurchases = useMemo(() => purchases.filter((p: any) => inGlobalRange(p.purchase_date)), [purchases, globalRange.from, globalRange.to]);
  const fPayroll = useMemo(() => payroll.filter((p: any) => inGlobalRange(p.created_at || p.pay_period_end || p.pay_date)), [payroll, globalRange.from, globalRange.to]);
  const fLabOrders = useMemo(() => labOrders.filter((o: any) => inGlobalRange(o.created_at || o.order_date)), [labOrders, globalRange.from, globalRange.to]);

  // Vendor payables only: delivered orders by delivery date, plus cancelled
  // orders that still carry a paid amount (kept visible as "Cancelled (paid)").
  const fLabPayables = useMemo(() => labOrders.filter((o: any) => {
    const paid = Number(o.lab_expense_paid_amount || 0);
    const keep = o.status === "delivered" || (o.status === "cancelled" && paid > 0);
    if (!keep) return false;
    return inGlobalRange(o.actual_delivery_date || o.created_at || o.order_date);
  }), [labOrders, globalRange.from, globalRange.to]);

  // Merge real billing_payments with reconciled-from-ledger synthetic rows
  // (historical billings where amount_paid > Σ payments). This is the
  // canonical dataset every Finance/Analytics aggregation consumes.
  const billingPayments = useMemo(
    () => mergeWithLegacyPayments(billings as any, rawBillingPayments as any),
    [billings, rawBillingPayments]
  );

  // Payments filtered by payment_date — every revenue/collection metric uses these
  const fPayments = useMemo(
    () => billingPayments.filter((p: any) => inGlobalRange(p.payment_date)),
    [billingPayments, globalRange.from, globalRange.to]
  );

  // Cash physically remitted to the bank from the drawer within the active range.
  const remittedToBank = useMemo(
    () => (drawerDeposits as any[])
      .filter((d) => inGlobalRange(d.drawer_date || d.deposit_date))
      .reduce((s, d) => s + Number(d.deposit_amount || 0), 0),
    [drawerDeposits, globalRange.from, globalRange.to]
  );

  // ─── Shared Billable Dataset (single source of truth) ───
  // Excludes cancelled, void, and ₹0 (no-charge / complimentary) invoices.
  // Every Finance section (Revenue, Billing, Receivables, etc.) reads from this.
  const getEffectiveBillingStatus = (b: any): "no_charge" | "cancelled" | "paid" | "partial" | "pending" => {
    const amt = Number(b.total_amount || 0);
    const status = String(b.payment_status || "").toLowerCase();
    if (status === "cancelled" || status === "void" || status === "voided") return "cancelled";
    if (amt <= 0) return "no_charge";
    const paid = Number(b.amount_paid || 0);
    if (paid <= 0) return "pending";
    if (paid >= amt) return "paid";
    return "partial";
  };

  const billableBillings = useMemo(
    () => fBillings.filter((b: any) => {
      const eff = getEffectiveBillingStatus(b);
      return eff !== "cancelled" && eff !== "no_charge";
    }),
    [fBillings]
  );
  const billableIdSet = useMemo(() => new Set(billableBillings.map((b: any) => b.id)), [billableBillings]);

  // Qualifying referral commission (status = Report Received or Reviewed) within
  // the selected date range. The patient pays the scan centre / lab directly;
  // the centre pays OUR clinic a commission, so this is income, never an expense.
  const qualifyingReferrals = useMemo(
    () => (referralOrders as any[]).filter((o) =>
      ["report_received", "reviewed"].includes(String(o.status || "")) && inGlobalRange(o.created_at)),
    [referralOrders, globalRange.from, globalRange.to]
  );
  const referralIncome = useMemo(
    () => qualifyingReferrals.reduce((a: number, o: any) => a + Number(o.cost || 0), 0),
    [qualifyingReferrals]
  );



  // Collected = SUM(billing_payments.amount) for payments made in the selected range
  // AND whose parent invoice was also created within that range (strict period-bound).
  // Payments received in-range for invoices billed in an earlier period are excluded
  // here and reported separately as "Previous Dues Collected".
  const nonVoidBillingIdSet = useMemo(() => {
    const s = new Set<string>();
    billings.forEach((b: any) => {
      const status = String(b.payment_status || "").toLowerCase();
      if (status === "cancelled" || status === "void" || status === "voided") return;
      s.add(b.id);
    });
    return s;
  }, [billings]);

  const isRealPayment = (p: any) => {
    if (!p.billing_id) return false;
    if (!nonVoidBillingIdSet.has(p.billing_id)) return false;
    const amt = Number(p.amount || 0);
    // Skip ₹0 rows, but KEEP negative rows — bill adjustments / collected-amount
    // reductions are logged as negative entries (payment_method = "adjustment")
    // and must deduct from Collected, Outstanding and Previous Dues.
    if (!isFinite(amt) || amt === 0) return false;
    const status = String(p.status || "").toLowerCase();
    if (status === "failed" || status === "cancelled" || status === "refunded" || status === "void") return false;
    return true;
  };

  // Strictly period-bound collections (invoice created in range + paid in range)
  const billablePaymentsInRange = useMemo(
    () => fPayments.filter((p: any) => isRealPayment(p) && billableIdSet.has(p.billing_id)),
    [fPayments, nonVoidBillingIdSet, billableIdSet]
  );

  // Payments received in range against invoices billed BEFORE the range.
  // These are split into two buckets:
  //   • Previous Dues  — the part that actually clears the invoice's pending balance
  //   • Advance / Overpayment — anything paid beyond the invoice total
  const previousPeriodPayments = useMemo(
    () => fPayments.filter((p: any) => isRealPayment(p) && !billableIdSet.has(p.billing_id)),
    [fPayments, nonVoidBillingIdSet, billableIdSet]
  );

  const previousDuesSplit = useMemo(() => {
    const billingsById = new Map<string, any>(billings.map((b: any) => [b.id, b]));
    // Amount already paid on each old invoice BEFORE the selected range starts
    const paidBefore = new Map<string, number>();
    const from = globalRange.from ? new Date(globalRange.from).getTime() : null;
    for (const p of billingPayments as any[]) {
      if (!p?.billing_id || !isRealPayment(p)) continue;
      const t = p.payment_date ? new Date(p.payment_date).getTime() : 0;
      if (from !== null && t >= from) continue;
      if (from === null) continue;
      paidBefore.set(p.billing_id, (paidBefore.get(p.billing_id) || 0) + Number(p.amount || 0));
    }

    const consumed = new Map<string, number>();
    const dues: any[] = [];
    const advances: any[] = [];
    let duesTotal = 0;
    let advanceTotal = 0;

    const ordered = [...previousPeriodPayments].sort(
      (a, b) => new Date(a.payment_date || 0).getTime() - new Date(b.payment_date || 0).getTime()
    );

    for (const p of ordered) {
      const b = billingsById.get(p.billing_id);
      const total = Number(b?.total_amount || 0);
      const already = (paidBefore.get(p.billing_id) || 0) + (consumed.get(p.billing_id) || 0);
      const remainingDue = Math.max(0, total - already);
      const amount = Number(p.amount || 0);
      // Negative rows are bill adjustments — they always reduce dues collected
      // (never create "advance"), and they lower the running consumed total so
      // later payments re-fill the reopened balance correctly.
      const duePart = amount < 0 ? amount : Math.min(amount, remainingDue);
      const advancePart = amount - duePart;
      consumed.set(p.billing_id, (consumed.get(p.billing_id) || 0) + amount);

      if (duePart !== 0) {
        dues.push({ ...p, amount: duePart });
        duesTotal += duePart;
      }
      if (advancePart > 0) {
        advances.push({ ...p, amount: advancePart });
        advanceTotal += advancePart;
      }
    }

    return { dues, advances, duesTotal, advanceTotal };
  }, [previousPeriodPayments, billings, billingPayments, globalRange.from, nonVoidBillingIdSet]);

  // Strictly pending-balance clearing only — advances/overpayments excluded
  const previousDuesPayments = previousDuesSplit.dues;
  const previousDuesCollected = previousDuesSplit.duesTotal;
  const advancePayments = previousDuesSplit.advances;
  const advanceCollected = previousDuesSplit.advanceTotal;

  // Display-only drill-down for the "Old Dues Collected" reconciliation row:
  // each dues receipt with its parent invoice and that invoice's treatments.
  const previousDuesDetail = useMemo(() => {
    const billingsById = new Map<string, any>((billings as any[]).map((b) => [b.id, b]));
    const itemsByBilling = new Map<string, string[]>();
    for (const it of billingItems as any[]) {
      if (!it?.billing_id) continue;
      const name = String(it.treatment_type || it.description || "").trim();
      if (!name) continue;
      const arr = itemsByBilling.get(it.billing_id) || [];
      if (!arr.includes(name)) arr.push(name);
      itemsByBilling.set(it.billing_id, arr);
    }
    return (previousDuesPayments as any[])
      .map((p) => {
        const b = billingsById.get(p.billing_id);
        return {
          id: p.id,
          invoice: b?.invoice_number || (b?.id ? String(b.id).slice(0, 8) : "—"),
          invoiceDate: b?.created_at || b?.billing_date || null,
          treatments: itemsByBilling.get(p.billing_id) || [],
          paymentDate: p.payment_date || null,
          mode: prettyPaymentMethod(p.payment_method),
          amount: Number(p.amount || 0),
        };
      })
      .sort((a, b) => new Date(b.paymentDate || 0).getTime() - new Date(a.paymentDate || 0).getTime());
  }, [previousDuesPayments, billings, billingItems]);

  // Prior-period dues recovered in range, apportioned per treatment using each
  // old invoice's line items (same ratio technique as current-period lines).
  const priorDuesByTreatment = useMemo(() => {
    const itemsByBilling = new Map<string, any[]>();
    for (const it of billingItems as any[]) {
      if (!it?.billing_id) continue;
      const arr = itemsByBilling.get(it.billing_id) || [];
      arr.push(it);
      itemsByBilling.set(it.billing_id, arr);
    }
    const billingsById = new Map<string, any>((billings as any[]).map((b) => [b.id, b]));
    const map = new Map<string, { total: number; receipts: { id: string; invoice: string; paymentDate: string | null; mode: string; amount: number }[] }>();
    for (const p of previousDuesPayments as any[]) {
      const items = (itemsByBilling.get(p.billing_id) || []).filter((it) => Number(it.total_price || 0) > 0);
      if (items.length === 0) continue;
      const gross = items.reduce((a, it) => a + Number(it.total_price || 0), 0);
      if (gross <= 0) continue;
      const b = billingsById.get(p.billing_id);
      const invoice = b?.invoice_number || String(p.billing_id).slice(0, 8);
      for (const it of items) {
        const name = (it.treatment_type || "Other").toString().trim() || "Other";
        const share = Number(p.amount || 0) * (Number(it.total_price || 0) / gross);
        if (share === 0) continue;
        const entry = map.get(name) || { total: 0, receipts: [] };
        entry.total += share;
        entry.receipts.push({
          id: `${p.id}-${it.id ?? name}`,
          invoice,
          paymentDate: p.payment_date || null,
          mode: prettyPaymentMethod(p.payment_method),
          amount: share,
        });
        map.set(name, entry);
      }
    }
    return map;
  }, [previousDuesPayments, billingItems, billings]);



  // ─── Period Financial Primitives (Revenue ↔ Billing must match) ───
  const totalBilled = useMemo(
    () => billableBillings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0),
    [billableBillings]
  );
  // De-dupe by payment transaction id so a row can never contribute twice.
  const totalCollected = useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const p of billablePaymentsInRange) {
      if (p.id && seen.has(p.id)) continue;
      if (p.id) seen.add(p.id);
      sum += Number(p.amount || 0);
    }
    return sum;
  }, [billablePaymentsInRange]);
  // Outstanding — date-bound: for invoices created in range, remaining balance after
  // payments received *within the same range*. Clamped at 0 per invoice so refunds /
  // overpayments never turn negative. Guarantees Total Revenue = Collected + Outstanding.
  const outstanding = useMemo(() => {
    const paidInRangeByBilling = new Map<string, number>();
    const seen = new Set<string>();
    for (const p of billablePaymentsInRange) {
      if (p.id && seen.has(p.id)) continue;
      if (p.id) seen.add(p.id);
      const key = p.billing_id;
      if (!key) continue;
      paidInRangeByBilling.set(key, (paidInRangeByBilling.get(key) || 0) + Number(p.amount || 0));
    }
    return billableBillings.reduce((a: number, b: any) => {
      const paid = paidInRangeByBilling.get(b.id) || 0;
      return a + Math.max(Number(b.total_amount || 0) - paid, 0);
    }, 0);
  }, [billableBillings, billablePaymentsInRange]);

  const collectionPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  // Back-compat aliases used by other Finance sections (P&L, Cash Flow, Tax, dialogs).
  const totalPaid = totalCollected;
  // Total Revenue = invoice revenue generated in the selected period (billed only).
  // Cash received for invoices raised earlier is reported separately as
  // "Old Dues Collected" so a collected figure is never mixed into a billed one.
  const totalRevenue = totalBilled;

  // ─── Dev-only synchronization validation ───
  useEffect(() => {
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) {
      const billingTotalAmount = billableBillings.reduce(
        (a: number, b: any) => a + Number(b.total_amount || 0), 0
      );
      const billingPending = billableBillings.reduce(
        (a: number, b: any) => a + Math.max(Number(b.total_amount || 0) - Number(b.amount_paid || 0), 0), 0
      );
      // Independent recount of Collected straight from billingPayments → must match totalCollected.
      const collectedRecount = billingPayments.reduce((sum: number, p: any) => {
        if (!p.billing_id) return sum;
        if (!nonVoidBillingIdSet.has(p.billing_id)) return sum;
        if (!billableIdSet.has(p.billing_id)) return sum;

        const amt = Number(p.amount || 0);
        if (!(amt > 0)) return sum;
        if (!inGlobalRange(p.payment_date)) return sum;
        return sum + amt;
      }, 0);
      const mismatches: string[] = [];
      if (Math.abs(totalBilled - billingTotalAmount) > 0.5)
        mismatches.push(`TotalBilled ${totalBilled} ≠ Billing.TotalAmount ${billingTotalAmount}`);
      if (Math.abs(outstanding - billingPending) > 0.5)
        mismatches.push(`Outstanding ${outstanding} ≠ Billing.Pending ${billingPending}`);
      if (Math.abs(totalCollected - collectedRecount) > 0.5)
        mismatches.push(`Collected ${totalCollected} ≠ PaymentStep recount ${collectedRecount}`);
      // Informational: Revenue (by invoice date) − Collected (by payment date) need not
      // equal Outstanding when payments cross periods. Log so devs can spot dataset drift.
      const periodDrift = totalBilled - totalCollected - outstanding;
      if (Math.abs(periodDrift) > 0.5) {
        // eslint-disable-next-line no-console
        console.info(
          `[Finance Sync] Cross-period drift ₹${periodDrift.toFixed(2)} — payments made this period for invoices billed in another period (expected behavior).`
        );
      }
      if (mismatches.length) {
        // eslint-disable-next-line no-console
        console.warn("[Finance Sync]", mismatches.join(" | "));
      }
    }
  }, [totalBilled, totalCollected, outstanding, billableBillings, billingPayments, nonVoidBillingIdSet, globalRange.from, globalRange.to]);



  const totalExpenses = fExpenses.reduce((a, b) => a + Number(b.amount || 0), 0);
  // Paid purchases are auto-mirrored into the expenses table via DB trigger,
  // so they are already included in totalExpenses. Only count unpaid purchases
  // here as additional accrual liability (not yet captured as expense).
  const nonMirroredPurchases = useMemo(
    () => fPurchases.filter((p: any) => p.payment_status !== "paid"),
    [fPurchases]
  );
  const totalPurchases = nonMirroredPurchases.reduce((a, b) => a + Number(b.total_amount || 0), 0);
  const totalPayroll = fPayroll.reduce((a, b) => a + Number(b.net_salary || 0), 0);
  const totalLabCost = fLabOrders.reduce((a, b) => a + Number(b.rate || 0), 0);
  const allExpenses = totalExpenses + totalPurchases + totalPayroll + totalLabCost;
  const totalCollectedAll = totalPaid + previousDuesCollected;
  // Total Cash In = money actually received in the period, including referral
  // commission income earned from scan centres / labs.
  const totalCashIn = totalCollectedAll + referralIncome;
  const totalCollectedWithReferral = totalCashIn;

  const netCashFlow = totalCashIn - allExpenses;
  const profit = totalRevenue - allExpenses;
  const profitMargin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;



  const patientById = useMemo(
    () => new Map(patients.map((patient: any) => [patient.id, patient])),
    [patients]
  );

  const formatPatientName = (patient: any) => {
    if (!patient) return "Unknown";
    const name = [patient.first_name, patient.last_name]
      .map((value: unknown) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ");

    return name || patient.phone || "Unknown";
  };

  const getPatientName = (id: string) => formatPatientName(patientById.get(id));

  const planById = useMemo(
    () => new Map(treatmentPlans.map((plan: any) => [plan.id, plan])),
    [treatmentPlans]
  );
  const planByCheckin = useMemo(() => {
    const m = new Map<string, any>();
    treatmentPlans.forEach((p: any) => {
      if (p.checkin_id && !m.has(p.checkin_id)) m.set(p.checkin_id, p);
    });
    return m;
  }, [treatmentPlans]);

  const getDoctorName = (b: any) => {
    const plan = (b?.plan_id && planById.get(b.plan_id)) || (b?.checkin_id && planByCheckin.get(b.checkin_id)) || null;
    const doc = plan?.doctor ? String(plan.doctor).trim() : "";
    return doc || "—";
  };

  const getPatientNameWithPhone = (id: string) => {
    const p = patientById.get(id);
    if (!p) return "Unknown";
    const name = formatPatientName(p);
    return p.phone ? `${name} · ${p.phone}` : name;
  };

  // Daily revenue (last 30 days) — recognized on payment_date
  const dailyRevenue = () => {
    const data: Record<string, { revenue: number; collected: number; expenses: number; outstanding: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "yyyy-MM-dd");
      data[key] = { revenue: 0, collected: 0, expenses: 0, outstanding: 0 };
    }
    fPayments.forEach((p: any) => {
      const day = p.payment_date?.split("T")[0];
      if (day && data[day]) {
        const amt = Number(p.amount || 0);
        data[day].revenue += amt;
        data[day].collected += amt;
      }
    });
    fExpenses.forEach((e: any) => {
      const day = e.expense_date?.split("T")[0];
      if (day && data[day]) data[day].expenses += Number(e.amount || 0);
    });
    nonMirroredPurchases.forEach((p: any) => {
      const day = p.purchase_date?.split("T")[0];
      if (day && data[day]) data[day].expenses += Number(p.total_amount || 0);
    });
    return Object.entries(data).map(([date, vals]) => ({
      date: format(new Date(date), "dd MMM"),
      ...vals,
    }));
  };


  // Revenue per treatment
  const treatmentRevenue = () => {
    const map: Record<string, number> = {};
    fBillingItems.forEach((item: any) => {
      map[item.treatment_type] = (map[item.treatment_type] || 0) + Number(item.total_price || 0);
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));
  };

  // ─── Treatment-wise revenue breakdown (isolated, read-only) ───
  // Billed = sum of billing_items.total_price for invoices created in range.
  // Collected = per-invoice collected-in-range apportioned across its line items
  // (receipts attach to invoices, never to individual lines).
  const treatmentRevenueBreakdown = useMemo(() => {
    const collectedByBilling = new Map<string, number>();
    const seen = new Set<string>();
    for (const p of billablePaymentsInRange as any[]) {
      if (p.id && seen.has(p.id)) continue;
      if (p.id) seen.add(p.id);
      if (!p.billing_id) continue;
      collectedByBilling.set(p.billing_id, (collectedByBilling.get(p.billing_id) || 0) + Number(p.amount || 0));
    }
    // Net invoiced amount per invoice (after invoice-level discounts/adjustments)
    const billingTotals = new Map<string, number>();
    (fBillings as any[]).forEach((b) => billingTotals.set(b.id, Number(b.total_amount || 0)));

    // Only line items whose parent invoice is in the active filtered set
    const items = (fBillingItems as any[]).filter((it) => it.billing_id && billingTotals.has(it.billing_id));

    // Gross line-item sum per invoice, used to apportion the invoice discount
    const grossByBilling = new Map<string, number>();
    items.forEach((it) => {
      grossByBilling.set(it.billing_id, (grossByBilling.get(it.billing_id) || 0) + Number(it.total_price || 0));
    });

    const map = new Map<string, { name: string; count: number; billed: number; collected: number }>();
    items.forEach((it) => {
      const name = (it.treatment_type || "Other").toString().trim() || "Other";
      const gross = Number(it.total_price || 0);
      const invoiceGross = grossByBilling.get(it.billing_id) || 0;
      const invoiceNet = billingTotals.get(it.billing_id) || 0;
      const ratio = invoiceGross > 0 ? gross / invoiceGross : 0;
      // Net billed = proportional share of the invoice's net total (discounts applied)
      const billed = invoiceGross > 0 ? invoiceNet * ratio : 0;
      const invoiceCollected = collectedByBilling.get(it.billing_id) || 0;
      const row = map.get(name) || { name, count: 0, billed: 0, collected: 0 };
      row.count += Number(it.quantity || 0) || 1;
      row.billed += billed;
      row.collected += invoiceCollected * ratio;
      map.set(name, row);
    });
    // ─── Non-treatment money: kept OUT of the clinical ranking ───
    // Invoices with no line items (or items summing to zero) are direct bills.
    let directBilled = 0;
    let directCollected = 0;
    let directCount = 0;
    (fBillings as any[]).forEach((b) => {
      const gross = grossByBilling.get(b.id) || 0;
      if (gross > 0) return;
      const net = Number(b.total_amount || 0);
      const collected = collectedByBilling.get(b.id) || 0;
      if (net === 0 && collected === 0) return;
      directCount += 1;
      directBilled += net;
      directCollected += collected;
    });
    // Payments in range against invoices outside the filtered invoice set.
    let orphanCollected = 0;
    for (const [billingId, amount] of collectedByBilling) {
      if (!billingTotals.has(billingId)) orphanCollected += amount;
    }

    const rows = Array.from(map.values()).sort((a, b) => b.billed - a.billed);
    const billedTotal = rows.reduce((a, r) => a + r.billed, 0);
    const collectedTotal = rows.reduce((a, r) => a + r.collected, 0);
    return {
      rows: rows.map((r) => ({ ...r, share: billedTotal > 0 ? (r.billed / billedTotal) * 100 : 0 })),
      billedTotal,
      collectedTotal,
      countTotal: rows.reduce((a, r) => a + r.count, 0),
      reconciliation: {
        directCount,
        directBilled,
        directCollected: directCollected + orphanCollected,
        previousDues: previousDuesCollected,
        referralIncome,
        cashIn: collectedTotal + directCollected + orphanCollected + previousDuesCollected + referralIncome,
      },
    };
  }, [fBillingItems, fBillings, billablePaymentsInRange, previousDuesCollected, referralIncome]);


  // Revenue per doctor
  const doctorRevenue = () => {
    const map: Record<string, number> = {};
    fBillings.forEach((b: any) => {
      const doc = "Dr. Neemz";
      map[doc] = (map[doc] || 0) + Number(b.total_amount || 0);
    });
    return Object.entries(map).map(([doctor, revenue]) => ({
      doctor,
      revenue,
      share30: Math.round(revenue * 0.3),
    }));
  };

  // Payment method breakdown — source of truth is billing_payments.
  // Uses aggregatePaymentsByMode so split payments and historical composite
  // rows decompose correctly without ever double-counting.
  const paymentMethods = () => {
    const map = aggregatePaymentsByMode(fPayments as any);
    return Object.entries(map)
      .filter(([, v]) => v.amount > 0)
      .map(([key, v]) => ({
        method: modeLabel(key),
        amount: v.amount,
        count: v.count,
        color: modeColor(key),
      }));
  };

  const getCalculatedPendingAmount = (billing: any) =>
    Math.max(Number(billing.total_amount || 0) - Number(billing.amount_paid || 0), 0);

  const hasBillPendingAmount = (billing: any) =>
    Number(billing.total_amount || 0) > 0 && getCalculatedPendingAmount(billing) > 0;

  // Pending payments (receivables) — respect the active global date filter.
  // When a range is selected, only invoices created within that range contribute.
  const pendingPayments = () =>
    fBillings
      .filter((b: any) => Number(b.total_amount || 0) > 0)
      .map((b: any) => ({
        id: b.id,
        invoice_number: b.invoice_number,
        patient: getPatientName(b.patient_id),
        patient_phone: patientById.get(b.patient_id)?.phone || "",
        total: Number(b.total_amount || 0),
        paid: Number(b.amount_paid || 0),
        pending: getCalculatedPendingAmount(b),
        status: b.payment_status,
        date: b.created_at,
        billing: b,
      }))
      .filter((p) => p.pending > 0)
      .sort((a, b) => b.pending - a.pending);


  // Expense breakdown by category
  const expenseByCategory = () => {
    const map: Record<string, number> = {};
    fExpenses.forEach((e: any) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    });
    if (totalPurchases > 0) map["Dental Materials / Purchases"] = totalPurchases;
    if (totalPayroll > 0) map["Staff Salaries"] = totalPayroll;
    if (totalLabCost > 0) map["Lab Charges"] = totalLabCost;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount], i) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " "),
        amount,
        color: COLORS[i % COLORS.length],
      }));
  };

  // Monthly P&L (last 6 months) — uses filtered arrays so date filter narrows further if applied
  const monthlyPnL = () => {
    const data: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const label = format(d, "MMM yy");

      const rev = billingPayments
        .filter((p: any) => {
          const dt = p.payment_date ? new Date(p.payment_date) : null;
          return dt && dt >= start && dt <= end;
        })
        .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);


      const exp = fExpenses
        .filter((e: any) => {
          const dt = new Date(e.expense_date);
          return dt >= start && dt <= end;
        })
        .reduce((a: number, e: any) => a + Number(e.amount || 0), 0);

      const purch = nonMirroredPurchases
        .filter((p: any) => {
          const dt = new Date(p.purchase_date);
          return dt >= start && dt <= end;
        })
        .reduce((a: number, p: any) => a + Number(p.total_amount || 0), 0);

      const totalExp = exp + purch;
      data.push({ month: label, revenue: rev, expenses: totalExp, profit: rev - totalExp });
    }
    return data;
  };

  // Cash flow (inflows vs outflows by month)
  const cashFlowData = monthlyPnL;

  // Vendor payables — Payable / Paid / Outstanding per vendor, live from
  // lab_orders and purchases so payments recorded anywhere reflect here.
  const vendorOrderStatus = (payable: number, paid: number, cancelled: boolean): "Paid" | "Partial" | "Unpaid" | "Amount not entered" => {
    if (payable <= 0) return "Amount not entered";
    if (paid >= payable) return "Paid";
    if (paid > 0) return "Partial";
    return cancelled && paid > 0 ? "Partial" : "Unpaid";
  };

  const vendorPayments = () => {
    const labMap: Record<string, { count: number; payable: number; paid: number; zeroExpense: number }> = {};
    fLabPayables.forEach((o: any) => {
      const name = o.lab_name;
      if (!labMap[name]) labMap[name] = { count: 0, payable: 0, paid: 0, zeroExpense: 0 };
      const payable = Number(o.lab_expense || 0);
      const paid = Number(o.lab_expense_paid_amount || 0);
      labMap[name].count++;
      labMap[name].payable += payable;
      labMap[name].paid += paid;
      if (payable <= 0) labMap[name].zeroExpense++;
    });

    const supplierMap: Record<string, { count: number; payable: number; paid: number; zeroExpense: number }> = {};
    fPurchases.forEach((p: any) => {
      const name = p.supplier_name;
      if (!supplierMap[name]) supplierMap[name] = { count: 0, payable: 0, paid: 0, zeroExpense: 0 };
      supplierMap[name].count++;
      supplierMap[name].payable += Number(p.total_amount || 0);
      supplierMap[name].paid += Number(p.amount_paid || 0);
    });

    const withStatus = (m: Record<string, { count: number; payable: number; paid: number; zeroExpense: number }>) =>
      Object.fromEntries(Object.entries(m).map(([name, d]) => {
        const outstanding = Math.max(0, d.payable - d.paid);
        const status = d.paid >= d.payable && d.payable > 0 ? "Paid" : d.paid > 0 ? "Partial" : d.payable > 0 ? "Unpaid" : "Amount not entered";
        return [name, { ...d, outstanding, status }];
      }));

    return { labs: withStatus(labMap), suppliers: withStatus(supplierMap) };
  };

  // ─── Global CSV export — exports filtered data across all sections ───
  const handleGlobalExport = () => {
    const rangeLabel = globalRange.from || globalRange.to
      ? `${globalRange.from ? format(globalRange.from, "ddMMyyyy") : "start"}_to_${globalRange.to ? format(globalRange.to, "ddMMyyyy") : "end"}`
      : "all_time";
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(`Finance Report,${rangeLabel},Section: ${activeSection}`);
    lines.push("");
    lines.push("SUMMARY");
    lines.push("Metric,Value (INR)");
    lines.push(["Total Billed (This Period)", totalRevenue].join(","));
    lines.push(["Collected (This Period's Bills)", totalPaid].join(","));
    lines.push(["Outstanding", outstanding].join(","));
    lines.push(["Old Dues Collected", previousDuesCollected].join(","));
    lines.push(["Total Cash In", totalCashIn].join(","));
    lines.push(["Total Expenses", totalExpenses].join(","));
    lines.push(["Purchases", totalPurchases].join(","));
    lines.push(["Salaries", totalPayroll].join(","));
    lines.push(["Lab Costs", totalLabCost].join(","));
    lines.push(["Referral Income (Commission)", referralIncome].join(","));
    lines.push(["All Expenses", allExpenses].join(","));

    lines.push(["Net Profit", profit].join(","));
    lines.push(["Profit Margin %", profitMargin].join(","));
    lines.push("");
    lines.push("BILLINGS / INVOICES");
    lines.push("Invoice,Patient,Total,Paid,Status,Method (Raw),Method (Normalized),Date");
    fBillings.forEach((b: any) => lines.push([
      esc(b.invoice_number || ""),
      esc(getPatientName(b.patient_id)),
      Number(b.total_amount || 0),
      Number(b.amount_paid || 0),
      esc(b.payment_status),
      esc(b.payment_method || ""),
      esc(prettyPaymentMethod(b.payment_method)),
      esc(b.created_at ? format(new Date(b.created_at), "yyyy-MM-dd") : ""),
    ].join(",")));
    lines.push("");
    lines.push("EXPENSES");
    lines.push("Date,Category,Description,Method,Amount");
    fExpenses.forEach((e: any) => lines.push([
      esc(e.expense_date ? format(new Date(e.expense_date), "yyyy-MM-dd") : ""),
      esc(e.category),
      esc(e.description),
      esc(e.payment_method || ""),
      Number(e.amount || 0),
    ].join(",")));
    lines.push("");
    lines.push("PURCHASES");
    lines.push("Date,Supplier,Method,Amount");
    fPurchases.forEach((p: any) => lines.push([
      esc(p.purchase_date ? format(new Date(p.purchase_date), "yyyy-MM-dd") : ""),
      esc(p.supplier_name || ""),
      esc(p.payment_method || ""),
      Number(p.total_amount || 0),
    ].join(",")));

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance_${activeSection}_${rangeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Global PDF export — mirrors CSV content using clinic branding ───
  const handleGlobalExportPDF = async () => {
    const rangeLabel = globalRange.from || globalRange.to
      ? `${globalRange.from ? format(globalRange.from, "ddMMyyyy") : "start"}_to_${globalRange.to ? format(globalRange.to, "ddMMyyyy") : "end"}`
      : "all_time";
    const branding = await fetchClinicBranding();
    const doc = new jsPDF();
    const startY = await addClinicPdfHeader(doc, branding);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`Finance Report — ${activeSection}`, 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Period: ${rangeLabel}  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 14, startY + 6);
    doc.setTextColor(0);

    const fmtINR = (n: number) => `INR ${Number(n || 0).toLocaleString("en-IN")}`;

    autoTable(doc, {
      head: [["Metric", "Value"]],
      body: [
        ["Total Billed (This Period)", fmtINR(totalRevenue)],
        ["Collected (This Period's Bills)", fmtINR(totalPaid)],
        ["Outstanding", fmtINR(outstanding)],
        ["Old Dues Collected", fmtINR(previousDuesCollected)],
        ["Total Cash In", fmtINR(totalCashIn)],
        ["Total Expenses", fmtINR(totalExpenses)],
        ["Purchases", fmtINR(totalPurchases)],
        ["Salaries", fmtINR(totalPayroll)],
        ["Lab Costs", fmtINR(totalLabCost)],
        ["Referral Income (Commission)", fmtINR(referralIncome)],

        ["All Expenses", fmtINR(allExpenses)],
        ["Net Profit", fmtINR(profit)],
        ["Profit Margin %", `${profitMargin}%`],
      ],
      startY: startY + 12,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 58, 95] },
      margin: { bottom: 25 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });

    if (fBillings.length) {
      autoTable(doc, {
        head: [["Invoice", "Patient", "Total", "Paid", "Status", "Method (Raw)", "Method (Normalized)", "Date"]],
        body: fBillings.map((b: any) => [
          b.invoice_number || "",
          getPatientName(b.patient_id),
          fmtINR(Number(b.total_amount || 0)),
          fmtINR(Number(b.amount_paid || 0)),
          b.payment_status || "",
          b.payment_method || "",
          prettyPaymentMethod(b.payment_method),
          b.created_at ? format(new Date(b.created_at), "dd MMM yy") : "",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 95] },
        margin: { bottom: 25 },
        didDrawPage: () => addClinicPdfFooter(doc),
      });
    }

    if (fExpenses.length) {
      autoTable(doc, {
        head: [["Date", "Category", "Description", "Method", "Amount"]],
        body: fExpenses.map((e: any) => [
          e.expense_date ? format(new Date(e.expense_date), "dd MMM yy") : "",
          e.category || "",
          e.description || "",
          e.payment_method || "",
          fmtINR(Number(e.amount || 0)),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 95] },
        margin: { bottom: 25 },
        didDrawPage: () => addClinicPdfFooter(doc),
      });
    }

    if (fPurchases.length) {
      autoTable(doc, {
        head: [["Date", "Supplier", "Method", "Amount"]],
        body: fPurchases.map((p: any) => [
          p.purchase_date ? format(new Date(p.purchase_date), "dd MMM yy") : "",
          p.supplier_name || "",
          p.payment_method || "",
          fmtINR(Number(p.total_amount || 0)),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 95] },
        margin: { bottom: 25 },
        didDrawPage: () => addClinicPdfFooter(doc),
      });
    }

    doc.save(`finance_${activeSection}_${rangeLabel}.pdf`);
  };

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return <FinanceDashboard />;
      case "revenue":
        return <RevenueSection />;
      case "billing":
        return <BillingSection />;
      case "payments":
        return <PaymentsSection />;
      case "receivables":
        return <ReceivablesSection />;
      case "deposits":
        return <DepositsSection billings={billings as any} getPatientName={getPatientName} />;
      case "expenses":
        return <ExpensesSection />;
      case "pnl":
        return <PnLSection />;
      case "cashflow":
        return <CashFlowSection />;
      case "tax":
        return <TaxSection />;
      case "doctor_revenue":
        return <DoctorRevenueSection />;
      case "vendor":
        return <VendorSection />;
      case "budget":
        return <BudgetSection />;
      default:
        return <FinanceDashboard />;
    }
  };

  // ─── SUB-COMPONENTS ───

  const StatCard = ({ label, value, icon: Icon, color = "text-primary", onClick, tooltip, className = "", iconClassName = "", valueClassName = "", labelClassName = "" }: any) => {
    const card = (
      <Card
        className={`shadow-card ${className} ${onClick ? "cursor-pointer transition-all hover:shadow-md hover:border-primary/40" : ""}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconClassName || "bg-secondary"} ${color}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className={`text-xl font-bold font-display ${valueClassName}`}>{value}</p>
            <p className={`text-xs text-muted-foreground ${labelClassName}`}>{label}</p>
          </div>
        </CardContent>
      </Card>
    );
    if (!tooltip) return card;
    return (
      <TooltipProvider delayDuration={150}>
        <UITooltip>
          <TooltipTrigger asChild>{card}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">{tooltip}</TooltipContent>
        </UITooltip>
      </TooltipProvider>
    );
  };

  // ─── Shared Treatment-wise Revenue card (clinical treatments only) ───
  const TreatmentRevenueCard = () => {
    const rec = treatmentRevenueBreakdown.reconciliation;
    const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    const extras: { label: string; note: string; billed: number | null; collected: number; expandable?: boolean }[] = [];
    if (rec.directBilled !== 0 || rec.directCollected !== 0) {
      extras.push({
        label: "Direct bills (no treatment lines)",
        note: `${rec.directCount} invoice${rec.directCount === 1 ? "" : "s"}`,
        billed: rec.directBilled,
        collected: rec.directCollected,
      });
    }
    if (rec.previousDues !== 0) {
      extras.push({
        label: "Old Dues Collected",
        note: "Cash received for invoices raised in earlier periods",
        billed: null,
        collected: rec.previousDues,
        expandable: previousDuesDetail.length > 0,
      });
    }
    if (rec.referralIncome > 0) {
      extras.push({
        label: "Referral Income (Commission)",
        note: "Commission received from scan centres & labs in this period",
        billed: null,
        collected: rec.referralIncome,
      });
    }

    return (
      <>
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Treatment-wise Revenue</CardTitle>
          <p className="text-xs text-muted-foreground">
            Clinical treatments only · Apportioned from invoice receipts for the selected period
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {treatmentRevenueBreakdown.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No treatment billing in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment</th>
                    <th className="hidden sm:table-cell px-5 py-3 text-right text-xs font-semibold text-muted-foreground">Procedures</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground">Billed</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground">Collected</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground w-[180px]">Share %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {treatmentRevenueBreakdown.rows.map((r, i) => (
                    <tr
                      key={r.name}
                      className="hover:bg-secondary/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedTreatment(r.name)}
                      title="Click for cash realization breakdown"
                    >
                      <td className="px-5 py-3 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          {i === 0 && <Badge variant="secondary" className="text-[10px]">Top</Badge>}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3 text-sm text-right">{r.count}</td>
                      <td className="px-5 py-3 text-sm text-right font-medium">{inr(r.billed)}</td>
                      <td className="px-5 py-3 text-sm text-right font-medium text-success">{inr(r.collected)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.share)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{r.share.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-secondary/40">
                    <td className="px-5 py-3 text-sm font-semibold">Clinical Total</td>
                    <td className="hidden sm:table-cell px-5 py-3 text-sm text-right font-semibold">{treatmentRevenueBreakdown.countTotal}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold">{inr(treatmentRevenueBreakdown.billedTotal)}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-success">{inr(treatmentRevenueBreakdown.collectedTotal)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {(extras.length > 0 || treatmentRevenueBreakdown.rows.length > 0) && (
            <div className="border-t-2 border-dashed border-border bg-secondary/20 px-5 py-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Not part of the clinical ranking
              </p>
              {extras.length === 0 ? (
                <p className="text-xs text-muted-foreground">No non-treatment money in this period.</p>
              ) : (
                extras.map((e) => (
                  <div key={e.label}>
                    <div
                      className={`flex flex-wrap items-baseline justify-between gap-2 text-sm ${e.expandable ? "cursor-pointer rounded-md -mx-2 px-2 py-1 hover:bg-secondary/50" : ""}`}
                      onClick={e.expandable ? () => setOldDuesExpanded((v) => !v) : undefined}
                      role={e.expandable ? "button" : undefined}
                      aria-expanded={e.expandable ? oldDuesExpanded : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        {e.expandable && (
                          oldDuesExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{e.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{e.note}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="w-24 text-right">{e.billed === null ? "—" : inr(e.billed)}</span>
                        <span className="w-24 text-right text-success">{inr(e.collected)}</span>
                      </div>
                    </div>
                    {e.expandable && oldDuesExpanded && (
                      <div className="ml-5 mt-2 rounded-lg border border-border bg-muted/40 overflow-x-auto">
                        <table className="w-full min-w-[560px]">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Invoice</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Treatments</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Payment</th>
                              <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Amount Cleared</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {previousDuesDetail.map((d) => (
                              <tr key={d.id}>
                                <td className="px-3 py-2 text-xs align-top">
                                  <div className="font-medium">{d.invoice}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {d.invoiceDate ? format(new Date(d.invoiceDate), "dd MMM yyyy") : "—"}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs align-top">
                                  {d.treatments.length === 0 ? (
                                    <span className="text-muted-foreground">No treatment lines</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {d.treatments.map((t) => (
                                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs align-top">
                                  <div>{d.paymentDate ? format(new Date(d.paymentDate), "dd MMM yyyy") : "—"}</div>
                                  <div className="text-[11px] text-muted-foreground">{d.mode}</div>
                                </td>
                                <td className="px-3 py-2 text-xs text-right align-top font-medium text-success">{inr(d.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-border">
                              <td className="px-3 py-2 text-xs font-semibold" colSpan={3}>Total Old Dues Cleared</td>
                              <td className="px-3 py-2 text-xs text-right font-semibold text-success">{inr(rec.previousDues)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2 text-sm font-semibold">
                <span>Total Cash In (all sources)</span>
                <div className="flex items-center gap-6">
                  <span className="w-24 text-right text-muted-foreground text-xs font-normal">—</span>
                  <span className="w-24 text-right text-success">{inr(rec.cashIn)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Total Realized Cash breakdown — opens when a treatment row is clicked */}
      {(() => {
        const row = treatmentRevenueBreakdown.rows.find((r) => r.name === selectedTreatment);
        const prior = selectedTreatment ? priorDuesByTreatment.get(selectedTreatment) : undefined;
        const priorTotal = prior?.total || 0;
        const realized = (row?.collected || 0) + priorTotal;
        const outstandingForRow = Math.max(0, (row?.billed || 0) - (row?.collected || 0));
        return (
          <Dialog open={!!selectedTreatment} onOpenChange={(o) => { if (!o) setSelectedTreatment(null); }}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selectedTreatment}
                  {row && <Badge variant="secondary">{row.count} procedure{row.count === 1 ? "" : "s"} this period</Badge>}
                </DialogTitle>
                <DialogDescription>
                  Total Realized Cash for the selected period — current-period collections plus prior dues recovered on this treatment.
                </DialogDescription>
              </DialogHeader>
              {!row ? (
                <p className="text-sm text-muted-foreground py-4">No data for this treatment in the selected period.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border divide-y divide-border text-sm">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-muted-foreground">New Period Invoices Billed</span>
                      <span className="font-medium">{inr(row.billed)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-muted-foreground">Current Period Collected</span>
                      <span className="font-medium text-success">{inr(row.collected)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-muted-foreground">Prior Dues Recovered (This Period)</span>
                      <span className="font-medium text-success">{inr(priorTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-muted-foreground">Outstanding (This Period's Bills)</span>
                      <span className="font-medium text-warning">{inr(outstandingForRow)}</span>
                    </div>
                  </div>
                  {prior && prior.receipts.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Prior dues recovered — receipts
                      </p>
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground">Invoice</th>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground">Payment</th>
                            <th className="px-4 py-2 text-right text-[11px] font-semibold text-muted-foreground">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {prior.receipts.map((r2) => (
                            <tr key={r2.id}>
                              <td className="px-4 py-2 text-xs font-medium">{r2.invoice}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">
                                {r2.paymentDate ? format(new Date(r2.paymentDate), "dd MMM yyyy") : "—"} · {r2.mode}
                              </td>
                              <td className="px-4 py-2 text-xs text-right font-medium text-success">{inr(r2.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
                    <span className="text-sm font-semibold">Total Cash Realized</span>
                    <span className="text-base font-bold text-primary">{inr(realized)}</span>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
  };


  const FinanceDashboard = () => (
    <div className="space-y-6">
      {/* Revenue & Receivables */}
      <section aria-labelledby="revenue-receivables-heading" className="space-y-3">
        <div>
          <h2 id="revenue-receivables-heading" className="text-base font-semibold font-display">Revenue &amp; Receivables</h2>
          <p className="text-xs text-muted-foreground">Billing raised, collections against those bills, and remaining receivables.</p>
        </div>
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Billed (This Period)" value={`₹${totalRevenue.toLocaleString("en-IN")}`} icon={IndianRupee} color="text-success" onClick={() => setMetricDialog({ open: true, key: "totalRevenue" })} tooltip="Total billed amount for the selected period." />
          <StatCard label="Collected (This Period's Bills)" value={`₹${totalPaid.toLocaleString("en-IN")}`} icon={Wallet} color="text-primary" onClick={() => { setCashModeFilter(null); setMetricDialog({ open: true, key: "cashReceived" }); }} tooltip="Payments collected against bills generated in the selected period." />
          <StatCard label="Outstanding" value={`₹${outstanding.toLocaleString("en-IN")}`} icon={Clock} color="text-warning" onClick={() => setMetricDialog({ open: true, key: "outstanding" })} tooltip="Amount still receivable against bills generated in the selected period." />
          <StatCard label="Pending Bills" value={String(pendingPayments().length)} icon={FileText} color="text-warning" onClick={() => setMetricDialog({ open: true, key: "pendingBills" })} tooltip="Bills in the selected period that are not fully paid." />
        </div>
      </section>

      {/* Cash Flow */}
      <section aria-labelledby="cash-flow-heading" className="space-y-3">
        <div>
          <h2 id="cash-flow-heading" className="text-base font-semibold font-display">Cash Flow</h2>
          <p className="text-xs text-muted-foreground">Cash received during the selected period and recorded spending.</p>
        </div>
        <div className="grid auto-rows-fr gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Current Collections" value={`₹${totalPaid.toLocaleString("en-IN")}`} icon={CreditCard} color="text-primary" onClick={() => { setCashModeFilter(null); setMetricDialog({ open: true, key: "cashReceived" }); }} tooltip="Payments collected against bills generated in the selected period." />
          <StatCard label="Old Dues Collected" value={`₹${previousDuesCollected.toLocaleString("en-IN")}`} icon={Clock} color="text-warning" tooltip="Payments received during this period against bills from earlier periods." />
          <StatCard label="Referral Income" value={`₹${referralIncome.toLocaleString("en-IN")}`} icon={Landmark} color="text-success" tooltip="Commission income receivable from scan centres and blood labs for referrals whose report has been received or reviewed in this period. Counted inside Total Cash In / Revenue." />
          <StatCard label="Total Cash In" value={`₹${totalCashIn.toLocaleString("en-IN")}`} icon={Wallet} color="text-emerald-800" className="bg-white border-4 border-emerald-900 shadow-sm ring-1 ring-emerald-900/10 rounded-xl" valueClassName="text-slate-900 font-bold" labelClassName="text-slate-600 font-medium" iconClassName="bg-emerald-100 text-emerald-800" tooltip="Total cash received from current collections, old dues and referral commission income." />

          <StatCard label="Total Expenses" value={`₹${allExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} color="text-destructive" onClick={() => setMetricDialog({ open: true, key: "expenses" })} tooltip="Total recorded expenses for the selected period." />
          <Card className={`shadow-card ${netCashFlow >= 0 ? "border-success/40" : "border-destructive/40"}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${netCashFlow >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                {netCashFlow >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xl font-bold font-display">₹{netCashFlow.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${netCashFlow >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {netCashFlow >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {netCashFlow >= 0 ? "Surplus" : "Deficit"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Net Cash Flow</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>Current Collections</span><span aria-hidden="true">+</span>
          <span>Old Dues Collected</span><span aria-hidden="true">+</span>
          <span>Referral Income</span><span aria-hidden="true">=</span>
          <span className="font-semibold text-foreground">Total Cash In</span>

          <span aria-hidden="true">|</span>
          <span>Net Cash</span><span aria-hidden="true">=</span>
          <span className="font-semibold text-foreground">Total Cash In − Total Expenses</span>
        </div>
      </section>

      {/* Operating Profit (Billed Basis) */}
      <section aria-labelledby="profitability-heading" className="space-y-3">
        <div>
          <h2 id="profitability-heading" className="text-base font-semibold font-display">Operating Profit (Billed Basis)</h2>
          <p className="text-xs text-muted-foreground">Accrual-basis: Billed revenue less recorded expenses for the selected period.</p>
        </div>
        <Card className={`shadow-card ${profit < 0 ? "border-destructive/40" : ""}`}>
          <CardContent className="p-4">
            <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1.2fr_1fr]">
              <div className="flex min-h-20 flex-col justify-center">
                <p className="text-xs text-muted-foreground">Total Billed</p>
                <p className="mt-1 text-lg font-bold font-display">₹{totalRevenue.toLocaleString("en-IN")}</p>
              </div>
              <span className="hidden self-center text-muted-foreground lg:block" aria-hidden="true">−</span>
              <div className="flex min-h-20 flex-col justify-center border-t border-border pt-3 sm:border-t-0 lg:pt-0">
                <p className="text-xs text-muted-foreground">Total Expenses</p>
                <p className="mt-1 text-lg font-bold font-display">₹{allExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <span className="hidden self-center text-muted-foreground lg:block" aria-hidden="true">=</span>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-20 items-start rounded-md border-t border-border px-0 pt-3 text-left hover:bg-secondary/40 hover:text-primary sm:border-t-0 lg:pt-0"
                onClick={() => setMetricDialog({ open: true, key: "profit" })}
              >
                <span className="flex flex-col items-start">
                  <span className="text-xs font-normal text-muted-foreground">Net Profit</span>
                  <span className={`mt-1 text-xl font-bold font-display ${profit >= 0 ? "text-success" : "text-destructive"}`}>₹{profit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-20 items-start rounded-md border-t border-border px-0 pt-3 text-left hover:bg-secondary/40 hover:text-primary sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0"
                onClick={() => setMetricDialog({ open: true, key: "margin" })}
              >
                <span className="flex flex-col items-start">
                  <span className="text-xs font-normal text-muted-foreground">Profit Margin</span>
                  <span className={`mt-1 text-xl font-bold font-display ${profit < 0 ? "text-destructive" : "text-primary"}`}>{profitMargin}%</span>
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Revenue Trend */}
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Revenue vs Collection (30 Days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyRevenue()}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fill: "hsl(220,10%,46%)", fontSize: 9 }} interval={4} />
              <YAxis tick={{ fill: "hsl(220,10%,46%)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(217,91%,50%)" fill="hsl(217,91%,50%)" fillOpacity={0.15} name="Revenue" />
              <Area type="monotone" dataKey="collected" stroke="hsl(142,71%,45%)" fill="hsl(142,71%,45%)" fillOpacity={0.15} name="Collected" />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expense Breakdown */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="45%" height={200}>
                <RPieChart>
                  <Pie data={expenseByCategory()} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={80} innerRadius={30}>
                    {expenseByCategory().map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                </RPieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1">
                {expenseByCategory().slice(0, 6).map((e) => (
                  <div key={e.category} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                      <span className="truncate max-w-[120px]">{e.category}</span>
                    </div>
                    <span className="font-medium">₹{(e.amount / 1000).toFixed(0)}K</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly P&L */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Monthly P&L (6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyPnL()}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: "hsl(220,10%,46%)", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Bar dataKey="revenue" fill="hsl(142,71%,45%)" radius={[3, 3, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="hsl(0,72%,51%)" radius={[3, 3, 0, 0]} name="Expenses" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <TreatmentRevenueCard />
      {(() => {
        const billingsById = new Map<string, any>(billings.map((b: any) => [b.id, b]));
        const oldInvoicePayments = previousDuesPayments
          .map((p: any) => ({ p, b: billingsById.get(p.billing_id) }))
          .filter(({ b }) => !!b)
          .sort((a, b) => new Date(b.p.payment_date || 0).getTime() - new Date(a.p.payment_date || 0).getTime());
        const oldTotal = oldInvoicePayments.reduce((s, x) => s + Number(x.p.amount || 0), 0);
        const modeAgg = aggregatePaymentsByMode(
          oldInvoicePayments.map(({ p }) => ({ payment_method: p.payment_method, amount: Number(p.amount || 0) }))
        );
        const modeRows = Object.entries(modeAgg)
          .filter(([, v]) => Number(v.amount) !== 0)
          .sort((a, b) => b[1].amount - a[1].amount);
        const modeTotal = modeRows.reduce((s, [, v]) => s + Number(v.amount || 0), 0);
        return (
          <Dialog open={oldInvoicesDialogOpen} onOpenChange={setOldInvoicesDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Previous Dues Collected</DialogTitle>
                <DialogDescription>
                  Payments received in the selected range that clear pending balances on invoices billed before this period. Advances and overpayments are excluded. Total: ₹{oldTotal.toLocaleString("en-IN")} ({oldInvoicePayments.length} payment{oldInvoicePayments.length === 1 ? "" : "s"}). Not included in Collected, Net Profit or Margin.
                </DialogDescription>
              </DialogHeader>

              {/* Mode of payment breakdown */}
              <div className="rounded-md border">
                <div className="border-b bg-secondary/40 px-3 py-2 text-sm font-semibold">Breakdown by mode of payment</div>
                {modeRows.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">No payments in this range.</div>
                ) : (
                  <div className="divide-y">
                    {modeRows.map(([mode, v]) => (
                      <div key={mode} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: modeColor(mode) }} />
                          {modeLabel(mode)}
                          <span className="text-xs text-muted-foreground">({v.count} txn{v.count === 1 ? "" : "s"})</span>
                        </span>
                        <span className={`font-medium ${Number(v.amount) < 0 ? "text-destructive" : ""}`}>{Number(v.amount) < 0 ? "−" : ""}₹{Math.abs(Number(v.amount)).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-secondary/30 px-3 py-2 text-sm font-semibold">
                      <span>Total</span>
                      <span>₹{modeTotal.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Invoice #</th>
                      <th className="px-3 py-2 text-left font-semibold">Invoice Date</th>
                      <th className="px-3 py-2 text-left font-semibold">Payment Date</th>
                      <th className="px-3 py-2 text-left font-semibold">Mode of Payment</th>
                      <th className="px-3 py-2 text-right font-semibold">Amount Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {oldInvoicePayments.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No old invoice payments in this range.</td></tr>
                    )}
                    {oldInvoicePayments.map(({ p, b }) => (
                      <tr key={p.id} className="hover:bg-secondary/30">
                        <td className="px-3 py-2 font-medium">{b.invoice_number || b.id?.slice(0, 8)}</td>
                        <td className="px-3 py-2">{new Date(b.created_at).toLocaleDateString("en-IN")}</td>
                        <td className="px-3 py-2">{p.payment_date ? format(new Date(p.payment_date), "dd MMM yyyy, hh:mm a") : "—"}</td>
                        <td className="px-3 py-2">{prettyPaymentMethod(p.payment_method)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${Number(p.amount || 0) < 0 ? "text-destructive" : "text-success"}`}>{Number(p.amount || 0) < 0 ? "−" : ""}₹{Math.abs(Number(p.amount || 0)).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );

  const RevenueSection = () => {
    const periodLabel =
      globalRange.from && globalRange.to
        ? `${format(globalRange.from, "dd MMM")} – ${format(globalRange.to, "dd MMM yyyy")}`
        : "the selected period";
    const collectedTooltip = (
      <div className="space-y-1">
        <div className="font-medium text-foreground">Collected (Actual Revenue)</div>
        <div>From <span className="font-medium">{billablePaymentsInRange.length}</span> payment transaction{billablePaymentsInRange.length === 1 ? "" : "s"} in {periodLabel}.</div>
        <div>Source: Clinic Workflow → <span className="font-medium">Payment</span> step (every entry creates a payment row).</div>
        <div className="text-muted-foreground">May include payments for invoices billed in earlier periods, so Billed − Collected ≠ Outstanding when payments cross months.</div>
      </div>
    );
    return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
        <div><strong className="text-foreground">Note:</strong> <span className="font-medium">Total Billed</span> = invoice மொத்த தொகை (patient கட்டவேண்டியது). <span className="font-medium">Collected</span> = patient கிட்டிருந்து உண்மையில் பெற்ற பணம் (இதே எண் "Payment Collection" page-ல் காட்டப்படும்). <span className="font-medium">Outstanding</span> = இன்னும் வசூலிக்கப்படாதது.</div>
        <div><span className="font-medium text-foreground">Collected source:</span> Clinic Workflow → Payment step-ல் பதிவான பணம் (payment date selected period-ல் இருந்தால் மட்டும் கணக்கில் வரும்).</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Billed (This Period)" value={`₹${totalBilled.toLocaleString("en-IN")}`} icon={Receipt} color="text-primary" tooltip="Invoices raised inside the selected period. Same figure as the Finance Dashboard." />
        <StatCard label="Collected (This Period's Bills)" value={`₹${totalCollected.toLocaleString("en-IN")}`} icon={CreditCard} color="text-success" tooltip={collectedTooltip} />
        <StatCard label="Outstanding" value={`₹${outstanding.toLocaleString("en-IN")}`} icon={Clock} color="text-warning" />
        <StatCard label="Collection %" value={`${collectionPct}%`} icon={Target} />
        <StatCard label="Old Dues Collected" value={`₹${previousDuesCollected.toLocaleString("en-IN")}`} icon={Clock} color="text-warning" tooltip="Cash received in this period against invoices raised in earlier periods. Not counted as this period's billing." />
        <StatCard label="Total Cash In" value={`₹${totalCashIn.toLocaleString("en-IN")}`} icon={Wallet} color="text-success" tooltip="Collected + Old Dues Collected — all money actually received in the selected period." />
      </div>
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Daily Revenue, Collection, Expenses & Outstanding (30 Days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyRevenue()}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fill: "hsl(220,10%,46%)", fontSize: 9 }} interval={4} />
              <YAxis tick={{ fill: "hsl(220,10%,46%)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="collected" fill="hsl(217,91%,50%)" radius={[4, 4, 0, 0]} name="Collected" />
              <Bar dataKey="expenses" fill="hsl(0,72%,51%)" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="outstanding" fill="hsl(38,92%,50%)" radius={[4, 4, 0, 0]} name="Outstanding" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <TreatmentRevenueCard />

      {treatmentRevenue().length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Revenue per Treatment</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={treatmentRevenue().slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Bar dataKey="amount" fill="hsl(217,91%,50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
    );
  };

  const BillingSection = () => {
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [doctorFilter, setDoctorFilter] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState<number>(10);
    const [page, setPage] = useState<number>(1);
    const [deleteTarget, setDeleteTarget] = useState<any>(null);
    const [deleting, setDeleting] = useState(false);
    const [showTreatmentSummary, setShowTreatmentSummary] = useState(false);

    // Invoice id -> ordered unique treatment names (display only, from already-fetched line items)
    const treatmentsByBilling = useMemo(() => {
      const map = new Map<string, string[]>();
      (fBillingItems as any[]).forEach((it) => {
        const id = it.billing_id;
        const name = String(it.treatment_type || "").trim();
        if (!id || !name) return;
        const list = map.get(id) || [];
        if (!list.includes(name)) list.push(name);
        map.set(id, list);
      });
      return map;
    }, [fBillingItems]);

    // Treatment -> { bills, amount } for the selected period
    const treatmentSummary = useMemo(() => {
      const agg = new Map<string, { bills: number; amount: number }>();
      const bump = (name: string, amount: number) => {
        const cur = agg.get(name) || { bills: 0, amount: 0 };
        cur.bills += 1;
        cur.amount += amount;
        agg.set(name, cur);
      };
      const itemsByBilling = new Map<string, any[]>();
      (fBillingItems as any[]).forEach((it) => {
        if (!it.billing_id) return;
        const arr = itemsByBilling.get(it.billing_id) || [];
        arr.push(it);
        itemsByBilling.set(it.billing_id, arr);
      });
      (fBillings as any[]).forEach((b) => {
        const items = itemsByBilling.get(b.id) || [];
        const gross = items.reduce((s, it) => s + Number(it.total_price || 0), 0);
        if (!items.length || gross <= 0) {
          bump("Direct / General", Number(b.total_amount || 0));
          return;
        }
        const net = Number(b.total_amount || 0);
        const perTreatment = new Map<string, number>();
        items.forEach((it) => {
          const name = String(it.treatment_type || "").trim() || "Direct / General";
          perTreatment.set(name, (perTreatment.get(name) || 0) + Number(it.total_price || 0));
        });
        perTreatment.forEach((lineTotal, name) => bump(name, (lineTotal / gross) * net));
      });
      return Array.from(agg.entries())
        .map(([name, v]) => ({ name, bills: v.bills, amount: Math.round(v.amount) }))
        .sort((a, b) => b.amount - a.amount);
    }, [fBillings, fBillingItems]);

    const handleDeleteInvoice = async () => {
      if (!deleteTarget) return;
      setDeleting(true);
      try {
        // billing_items / billing_payments / deposit_invoices cascade on delete
        const { error } = await supabase.from("billings").delete().eq("id", deleteTarget.id);
        if (error) throw error;
        // Optimistically drop the row so table + summary cards update instantly
        queryClient.setQueryData(["finance-billings"], (old: any) =>
          Array.isArray(old) ? old.filter((r: any) => r.id !== deleteTarget.id) : old
        );
        queryClient.setQueryData(["finance-billing-items"], (old: any) =>
          Array.isArray(old) ? old.filter((r: any) => r.billing_id !== deleteTarget.id) : old
        );
        queryClient.setQueryData(["finance-billing-payments"], (old: any) =>
          Array.isArray(old) ? old.filter((r: any) => r.billing_id !== deleteTarget.id) : old
        );
        queryClient.invalidateQueries({ queryKey: ["finance-billings"] });
        queryClient.invalidateQueries({ queryKey: ["finance-billing-items"] });
        queryClient.invalidateQueries({ queryKey: ["finance-billing-payments"] });
        toast.success("Invoice deleted successfully");
        setDeleteTarget(null);
      } catch (e: any) {
        toast.error("Failed to delete invoice", { description: e?.message });
      } finally {
        setDeleting(false);
      }
    };

    const doctorOptions = useMemo(() => {
      const set = new Set<string>();
      fBillings.forEach((b: any) => {
        const d = getDoctorName(b);
        if (d && d !== "—") set.add(d);
      });
      return Array.from(set).sort();
    }, [fBillings, treatmentPlans]);

    // Local alias of the shared parent helper so each row carries _eff for table chips
    const getEffectiveStatus = getEffectiveBillingStatus;

    const billsWithStatus = useMemo(
      () => fBillings.map((b: any) => ({ ...b, _eff: getEffectiveStatus(b) })),
      [fBillings]
    );

    const filteredBills = useMemo(() => {
      const q = search.trim().toLowerCase();
      return billsWithStatus.filter((b: any) => {
        if (statusFilter !== "all" && b._eff !== statusFilter) return false;
        if (doctorFilter !== "all" && getDoctorName(b) !== doctorFilter) return false;
        if (!q) return true;
        const inv = (b.invoice_number || "").toLowerCase();
        const pat = getPatientName(b.patient_id).toLowerCase();
        const doc = getDoctorName(b).toLowerCase();
        return inv.includes(q) || pat.includes(q) || doc.includes(q);
      });
    }, [billsWithStatus, statusFilter, doctorFilter, search, treatmentPlans]);

    useEffect(() => { setPage(1); }, [statusFilter, doctorFilter, search, pageSize]);

    // Summary cards = shared parent primitives (single source of truth).
    // Per spec: Search / Doctor / Status filters do NOT affect summary totals.
    const totalCount = billableBillings.length;
    const totalAmount = totalBilled;
    const totalPaidF = totalCollected;
    const totalPending = outstanding;

    const counts = useMemo(() => {
      const c = { all: billsWithStatus.length, paid: 0, partial: 0, pending: 0, cancelled: 0, no_charge: 0 } as Record<string, number>;
      billsWithStatus.forEach((b: any) => { c[b._eff] = (c[b._eff] || 0) + 1; });
      return c;
    }, [billsWithStatus]);

    const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIdx = (currentPage - 1) * pageSize;
    const pageRows = filteredBills.slice(startIdx, startIdx + pageSize);

    const StatusChip = ({ value, label, count, color }: { value: string; label: string; count: number; color?: string }) => (
      <button
        onClick={() => setStatusFilter(value)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${statusFilter === value ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary border-border"}`}
      >
        {label} <span className={`ml-1 ${statusFilter === value ? "" : color || "text-muted-foreground"}`}>({count})</span>
      </button>
    );

    const statusBadge = (eff: string) => {
      const map: Record<string, { variant: any; label: string; cls?: string }> = {
        paid: { variant: "default", label: "Paid" },
        partial: { variant: "secondary", label: "Partial" },
        pending: { variant: "destructive", label: "Pending" },
        cancelled: { variant: "outline", label: "Cancelled", cls: "text-muted-foreground" },
        no_charge: { variant: "outline", label: "No Charge", cls: "text-muted-foreground border-dashed" },
      };
      const m = map[eff] || map.pending;
      return <Badge variant={m.variant} className={`text-[10px] ${m.cls || ""}`}>{m.label}</Badge>;
    };

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Bills" value={totalCount} icon={Receipt} />
          <StatCard label="Total Amount" value={`₹${totalAmount.toLocaleString("en-IN")}`} icon={IndianRupee} color="text-primary" />
          <StatCard label="Collected" value={`₹${totalPaidF.toLocaleString("en-IN")}`} icon={CreditCard} color="text-success" />
          <StatCard label="Pending" value={`₹${totalPending.toLocaleString("en-IN")}`} icon={Clock} color="text-destructive" />
        </div>

        {treatmentSummary.length > 0 && (
          <Card className="shadow-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold font-display">Treatment-wise summary</p>
                  <p className="text-xs text-muted-foreground">
                    {treatmentSummary.length} treatment type{treatmentSummary.length === 1 ? "" : "s"} billed in the selected period
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowTreatmentSummary((v) => !v)}>
                  {showTreatmentSummary ? "Hide" : "Show"}
                </Button>
              </div>
              {showTreatmentSummary && (
                <div className="flex flex-wrap gap-2">
                  {treatmentSummary.slice(0, 12).map((t) => (
                    <span
                      key={t.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs"
                    >
                      <span className="font-medium max-w-[160px] truncate">{t.name}</span>
                      <span className="text-muted-foreground">{t.bills} bill{t.bills === 1 ? "" : "s"}</span>
                      <span className="font-semibold">₹{t.amount.toLocaleString("en-IN")}</span>
                    </span>
                  ))}
                  {treatmentSummary.length > 12 && (
                    <TooltipProvider delayDuration={150}>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground cursor-default">
                            +{treatmentSummary.length - 12} more
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                          {treatmentSummary.slice(12).map((t) => `${t.name} · ${t.bills} · ₹${t.amount.toLocaleString("en-IN")}`).join(", ")}
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base font-display">Bills</CardTitle>
              <Input
                placeholder="Search invoice or patient..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full sm:w-64"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip value="all" label="All" count={counts.all} />
              <StatusChip value="paid" label="Paid" count={counts.paid} color="text-success" />
              <StatusChip value="partial" label="Partial" count={counts.partial} color="text-warning" />
              <StatusChip value="pending" label="Pending" count={counts.pending} color="text-destructive" />
              <StatusChip value="cancelled" label="Cancelled" count={counts.cancelled} color="text-muted-foreground" />
              <StatusChip value="no_charge" label="No Charge" count={counts.no_charge} color="text-muted-foreground" />
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Doctor:</span>
                <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                  <SelectTrigger className="h-9 w-56"><SelectValue placeholder="All doctors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All doctors</SelectItem>
                    {doctorOptions.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {doctorFilter !== "all" && (
              <div className="text-xs text-muted-foreground">
                {doctorFilter}: <span className="font-semibold text-foreground">{totalCount}</span> invoice(s) ·
                Total <span className="font-semibold text-foreground">₹{totalAmount.toLocaleString("en-IN")}</span> ·
                Collected <span className="font-semibold text-success">₹{totalPaidF.toLocaleString("en-IN")}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">S.No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Doctor</th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Pending</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Mode of Payment</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-muted-foreground">No bills found</td></tr>
                  )}
                  {pageRows.map((b: any, idx: number) => {
                    const amt = Number(b.total_amount || 0);
                    const paid = Number(b.amount_paid || 0);
                    const pend = getCalculatedPendingAmount(b);
                    const mode = (b.payment_method || "—").toString();
                    return (
                      <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{startIdx + idx + 1}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{format(new Date(b.created_at), "dd MMM yy")}</td>
                        <td className="px-4 py-3 text-sm font-mono">
                          <button
                            onClick={() => { setSelectedBilling(b); setBillingDialogOpen(true); }}
                            className="text-primary hover:underline"
                          >
                            {b.invoice_number || "—"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm">{getPatientName(b.patient_id)}</td>
                        <td className="px-4 py-3 text-sm">{getDoctorName(b)}</td>
                        <td className="hidden md:table-cell px-4 py-3 text-sm">
                          {(() => {
                            const names = treatmentsByBilling.get(b.id) || [];
                            if (names.length === 0) {
                              return <span className="text-xs text-muted-foreground italic">Direct / General</span>;
                            }
                            const content = (
                              <span className="inline-flex items-center gap-1 max-w-[200px]">
                                <Badge variant="secondary" className="text-[10px] max-w-[140px] truncate">{names[0]}</Badge>
                                {names.length > 1 && (
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">+{names.length - 1} more</span>
                                )}
                              </span>
                            );
                            return (
                              <TooltipProvider delayDuration={150}>
                                <UITooltip>
                                  <TooltipTrigger asChild><span className="cursor-default">{content}</span></TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                                    {names.join(", ")}
                                  </TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">₹{amt.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-sm text-right text-success">₹{paid.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-sm text-right text-destructive">₹{pend.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className="text-[10px] uppercase">{mode}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {statusBadge(b._eff)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete invoice ${b.invoice_number || b.id}`}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(b)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="ml-2">
                  {totalCount === 0 ? "0" : `${startIdx + 1}-${Math.min(startIdx + pageSize, totalCount)}`} of {totalCount}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(1)}>«</Button>
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</Button>
                {Array.from({ length: totalPages }).slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5).map((_, i) => {
                  const pageNum = Math.max(0, currentPage - 3) + i + 1;
                  if (pageNum > totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={pageNum === currentPage ? "default" : "outline"}
                      onClick={() => setPage(pageNum)}
                      className="min-w-9"
                    >{pageNum}</Button>
                  );
                })}
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</Button>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete invoice {deleteTarget?.invoice_number || ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this invoice? This action cannot be undone. All linked
                payment records and line items for this invoice will also be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(e) => { e.preventDefault(); handleDeleteInvoice(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : "Delete Invoice"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );

  };

  const PaymentsSection = () => {
    // All mode classification is delegated to the shared paymentMode util.
    // Reporting buckets cover Cash / UPI / Card / Bank Transfer / Cheque /
    // EMI / Insurance / Wallet / Legacy-Unknown / Other.
    const STANDARD_METHODS = REPORT_MODES;

    // Income breakdown — source of truth is billing_payments. Each row is
    // decomposed into its split modes (Cash + UPI etc.) without double-counting.
    const incomeAgg = aggregatePaymentsByMode(fPayments as any);

    const incomeData = STANDARD_METHODS
      .map((k) => ({
        key: k,
        method: modeLabel(k),
        amount: incomeAgg[k]?.amount || 0,
        count: incomeAgg[k]?.count || 0,
        color: modeColor(k),
      }))
      .filter((m) => m.amount > 0 || m.count > 0);
    const totalIncome = incomeData.reduce((a, b) => a + b.amount, 0);

    // Expense breakdown by payment method. Expenses are stored with a single
    // canonical mode per row, so normalizeMode is sufficient — no splits.
    const expenseMap: Record<string, { amount: number; count: number; items: { description: string; amount: number; date: string; category: string }[] }> = {};
    STANDARD_METHODS.forEach((m) => (expenseMap[m] = { amount: 0, count: 0, items: [] }));
    fExpenses.forEach((e: any) => {
      const m = normalizeMode(e.payment_method);
      const bucket = m === "credit_card" || m === "debit_card" ? "card" : m;
      if (!expenseMap[bucket]) expenseMap[bucket] = { amount: 0, count: 0, items: [] };
      const amt = Number(e.amount || 0);
      expenseMap[bucket].amount += amt;
      expenseMap[bucket].count++;
      expenseMap[bucket].items.push({
        description: e.description || "—",
        amount: amt,
        date: e.expense_date,
        category: e.category || "general",
      });
    });
    // Note: Paid purchases are automatically mirrored into the expenses table
    // via the sync_purchase_to_expense() DB trigger, so they're already counted
    // in fExpenses above. Do NOT add fPurchases again — that would double-count.

    const expenseData = STANDARD_METHODS
      .map((k) => ({
        key: k,
        method: modeLabel(k),
        amount: expenseMap[k]?.amount || 0,
        count: expenseMap[k]?.count || 0,
        items: (expenseMap[k]?.items || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        color: modeColor(k),
      }))
      .filter((m) => m.amount > 0 || m.count > 0);
    const totalExpenseByMethod = expenseData.reduce((a, b) => a + b.amount, 0);
    const netByMethod = STANDARD_METHODS
      .map((k) => ({
        key: k,
        method: modeLabel(k),
        income: incomeAgg[k]?.amount || 0,
        expense: expenseMap[k]?.amount || 0,
        net: (incomeAgg[k]?.amount || 0) - (expenseMap[k]?.amount || 0),
        color: modeColor(k),
      }))
      .filter((m) => m.income > 0 || m.expense > 0);

    return (
      <div className="space-y-8">
        {/* ─── INCOME (from Clinic Workflow billings) ─── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-display font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-success" /> Income Collected
            </h3>
            <Badge variant="secondary" className="text-xs">Total: ₹{totalIncome.toLocaleString("en-IN")}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {incomeData.map((m) => {
              const pct = totalIncome > 0 ? Math.round((m.amount / totalIncome) * 100) : 0;
              return (
                <Card key={m.key} className="shadow-card border-l-4" style={{ borderLeftColor: m.color }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground font-medium">{m.method}</p>
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                    </div>
                    <p className="text-xl font-bold font-display text-success">₹{m.amount.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{m.count} transaction{m.count !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Cash settlement & banking status — display only. Income totals above are untouched. */}
          {(() => {
            const cashCollected = incomeAgg["cash"]?.amount || 0;
            const retained = cashCollected - remittedToBank;
            return (
              <Card className="shadow-card border-dashed mb-4">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-semibold font-display">Cash Settlement &amp; Banking Status</p>
                    <span className="text-[10px] text-muted-foreground">Transfer view only · not added to income</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Cash Collected</p>
                      <p className="text-base font-bold font-display">₹{Math.round(cashCollected).toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Remitted to Bank</p>
                      <p className="text-base font-bold font-display">₹{Math.round(remittedToBank).toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-md border border-primary/30 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Retained in Drawer</p>
                      <p className={`text-base font-bold font-display ${retained < 0 ? "text-destructive" : ""}`}>
                        ₹{Math.round(retained).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-display">Income Distribution by Method</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div className="w-[50%] flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <RPieChart>
                      <Pie data={incomeData.filter(d => d.amount > 0)} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={80} innerRadius={35}>
                        {incomeData.filter(d => d.amount > 0).map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                    </RPieChart>
                  </ResponsiveContainer>
                  <div className="mt-1 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Income</p>
                    <p className="text-lg font-bold font-display text-success">₹{totalIncome.toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  {incomeData.map((m) => (
                    <div key={m.key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="text-sm">{m.method}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-success">₹{m.amount.toLocaleString("en-IN")}</span>
                        <span className="text-xs text-muted-foreground ml-2">({m.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── EXPENSE (from Expenses + Purchases) ─── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-display font-semibold flex items-center gap-2">
              <TrendingDown size={16} className="text-destructive" /> Expenses Paid
            </h3>
            <Badge variant="secondary" className="text-xs">Total: ₹{totalExpenseByMethod.toLocaleString("en-IN")}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {expenseData.map((m) => {
              const pct = totalExpenseByMethod > 0 ? Math.round((m.amount / totalExpenseByMethod) * 100) : 0;
              return (
                <Card key={m.key} className="shadow-card border-l-4" style={{ borderLeftColor: m.color }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground font-medium">{m.method}</p>
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                    </div>
                    <p className="text-xl font-bold font-display text-destructive">₹{m.amount.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{m.count} transaction{m.count !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-display">Expense Distribution by Method</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={expenseData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {expenseData.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-center border-t border-border pt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Expense</p>
                <p className="text-lg font-bold font-display text-destructive">₹{totalExpenseByMethod.toLocaleString("en-IN")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Expense detail by method */}
          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            {expenseData.filter(m => m.items.length > 0).map((m) => (
              <Card key={m.key} className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.method} Expenses
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">₹{m.amount.toLocaleString("en-IN")}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full">
                      <tbody className="divide-y divide-border">
                        {m.items.slice(0, 10).map((it, i) => (
                          <tr key={i} className="hover:bg-secondary/30">
                            <td className="px-4 py-2 text-xs">
                              <p className="font-medium truncate max-w-[180px]">{it.description}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{it.category.replace(/_/g, " ")} · {it.date ? format(new Date(it.date), "dd MMM") : "—"}</p>
                            </td>
                            <td className="px-4 py-2 text-xs text-right font-semibold text-destructive whitespace-nowrap">₹{it.amount.toLocaleString("en-IN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {m.items.length === 0 && (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">No expenses via {m.method}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ─── NET SUMMARY ─── */}
        <Card className="shadow-card border-primary/20">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Net Summary by Payment Method</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Income</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Expense</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {netByMethod.map((n) => (
                  <tr key={n.key} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 text-sm font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: n.color }} />
                        {n.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-success font-medium">₹{n.income.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-sm text-right text-destructive font-medium">₹{n.expense.toLocaleString("en-IN")}</td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${n.net >= 0 ? "text-success" : "text-destructive"}`}>
                      ₹{n.net.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const ReceivablesSection = () => {
    const isAdmin = receivablesPerms.canCreate;
    const rawPending = pendingPayments();

    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState<number>(10);
    const [page, setPage] = useState<number>(1);

    // Receivables-list-only adjustments: cancelled/void invoices are excluded
    // here and pending is reduced by adjustments. pendingPayments(), the
    // dashboard, Billing, P&L and exports keep using unadjusted figures.
    const pending = useMemo(() =>
      rawPending
        .filter((p: any) => !["cancelled", "void", "voided"].includes(String(p.billing?.payment_status || "").toLowerCase()))
        .map((p: any) => {
          const adjustedTotal = adjTotalFor(p.id);
          const nextPending = Math.max(0, p.pending - adjustedTotal);
          const status = nextPending === 0 && adjustedTotal > 0
            ? "adjusted"
            : (p.paid > 0 || adjustedTotal > 0) ? "partial" : "pending";
          return { ...p, adjustedTotal, pending: nextPending, status };
        }),
      [rawPending, adjByBilling]
    );

    const activeRows = useMemo(() => pending.filter((p: any) => p.pending > 0), [pending]);
    const adjustedRows = useMemo(() => pending.filter((p: any) => p.status === "adjusted"), [pending]);
    const totalPending = activeRows.reduce((a, b) => a + b.pending, 0);
    const totalAdjustedAll = pending.reduce((s: number, p: any) => s + p.adjustedTotal, 0);

    const filteredPending = useMemo(() => {
      const q = search.trim().toLowerCase();
      const base = statusFilter === "adjusted" ? adjustedRows : activeRows;
      return base.filter((p) => {
        if (statusFilter !== "all" && statusFilter !== "adjusted" && p.status !== statusFilter) return false;
        if (!q) return true;
        return (p.invoice_number || "").toLowerCase().includes(q)
          || (p.patient || "").toLowerCase().includes(q)
          || (p.patient_phone || "").toLowerCase().includes(q);
      });
    }, [activeRows, adjustedRows, statusFilter, search]);

    useEffect(() => { setPage(1); }, [statusFilter, search, pageSize]);

    const partialCount = activeRows.filter((p) => p.status === "partial").length;
    const pendingCount = activeRows.filter((p) => p.status === "pending").length;

    const totalCount = filteredPending.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIdx = (currentPage - 1) * pageSize;
    const pageRows = filteredPending.slice(startIdx, startIdx + pageSize);

    const StatusChip = ({ value, label, count, color }: { value: string; label: string; count: number; color?: string }) => (
      <button
        onClick={() => setStatusFilter(value)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${statusFilter === value ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary border-border"}`}
      >
        {label} <span className={`ml-1 ${statusFilter === value ? "" : color || "text-muted-foreground"}`}>({count})</span>
      </button>
    );

    const getPendingDurationDays = (dateStr?: string | null) => {
      if (!dateStr) return 0;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 0;
      return Math.max(0, differenceInDays(new Date(), d));
    };

    const formatPendingDuration = (days: number) => {
      if (days <= 29) return `${days} Days`;
      if (days <= 59) return `1 Month ${days - 30} Days`;
      const months = Math.floor(days / 30);
      const rem = days % 30;
      return `${months} Months ${rem} Days`;
    };

    const pendingDurationBadgeClass = (days: number) => {
      if (days <= 30) return "bg-success/15 text-success border-success/25";
      if (days <= 60) return "bg-warning/15 text-warning border-warning/25";
      return "bg-destructive/15 text-destructive border-destructive/25";
    };

    // Group pending amount by treatment type using billing_items, weighted by each billing's pending ratio
    const pendingByTreatment = useMemo(() => {
      const map = new Map<string, { amount: number; count: number }>();
      pending.forEach((p) => {
        const items = billingItems.filter((it: any) => it.billing_id === p.id);
        const itemsTotal = items.reduce((s: number, it: any) => s + Number(it.total_price || 0), 0);
        if (itemsTotal <= 0 || p.pending <= 0) return;
        const ratio = p.pending / itemsTotal;
        items.forEach((it: any) => {
          const key = (it.treatment_type || "Other").trim() || "Other";
          const share = Number(it.total_price || 0) * ratio;
          const cur = map.get(key) || { amount: 0, count: 0 };
          cur.amount += share;
          cur.count += 1;
          map.set(key, cur);
        });
      });
      return Array.from(map.entries())
        .map(([treatment, v], i) => ({
          treatment,
          amount: Math.round(v.amount),
          count: v.count,
          color: COLORS[i % COLORS.length],
        }))
        .sort((a, b) => b.amount - a.amount);
    }, [pending, billingItems]);

    // Overdue = pending invoices older than 30 days
    const overdueList = activeRows.filter((p) => getPendingDurationDays(p.date) > 30);
    const overdueAmount = overdueList.reduce((a, b) => a + b.pending, 0);

    // Avg collection days — for fully paid invoices in this filter range
    const paidBillsInRange = fBillings.filter((b: any) =>
      b.payment_status === "paid" && Number(b.total_amount || 0) > 0
    );
    const avgCollectionDays = (() => {
      if (paidBillsInRange.length === 0) return 0;
      const totalDays = paidBillsInRange.reduce((sum: number, b: any) => {
        const created = new Date(b.created_at);
        const paidPayments = billingPayments
          .filter((p: any) => p.billing_id === b.id && p.payment_date)
          .map((p: any) => new Date(p.payment_date).getTime());
        if (paidPayments.length === 0) return sum;
        const lastPaid = new Date(Math.max(...paidPayments));
        return sum + Math.max(0, differenceInDays(lastPaid, created));
      }, 0);
      return Math.round(totalDays / paidBillsInRange.length);
    })();

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total Outstanding" value={`₹${totalPending.toLocaleString("en-IN")}`} icon={Clock} color="text-destructive" />
          <StatCard label="Receivable Invoices" value={pending.length} icon={FileText} color="text-warning" />
          <StatCard label="Overdue Amount" value={`₹${overdueAmount.toLocaleString("en-IN")}`} icon={Clock} color="text-destructive" />
          <StatCard label="Overdue Count" value={overdueList.length} icon={FileText} color="text-destructive" />
          <StatCard label="Avg Collection Days" value={avgCollectionDays} icon={Calculator} />
        </div>
        {totalAdjustedAll > 0 && (
          <p className="text-xs text-muted-foreground">
            Outstanding shown here is after ₹{totalAdjustedAll.toLocaleString("en-IN")} of adjustments; other Finance screens show pre-adjustment figures.
          </p>
        )}
        <Card className="shadow-card">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base font-display">Accounts Receivable</CardTitle>
              <Input
                placeholder="Search invoice, patient, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full sm:w-64"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip value="all" label="All" count={activeRows.length} />
              <StatusChip value="partial" label="Partial" count={partialCount} color="text-warning" />
              <StatusChip value="pending" label="Pending" count={pendingCount} color="text-destructive" />
              <StatusChip value="adjusted" label="Adjusted" count={adjustedRows.length} color="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Phone</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Pending</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Pending Duration</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">No pending bills found</td></tr>
                  )}
                  {pageRows.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(p.date), "dd MMM yy")}</td>
                      <td className="px-4 py-3 text-sm font-mono">
                        <button
                          onClick={() => { setSelectedBilling(p.billing); setBillingDialogOpen(true); }}
                          className="text-primary hover:underline"
                        >
                          {p.invoice_number || "—"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{p.patient}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.patient_phone || "—"}</td>
                      <td className="px-4 py-3 text-sm text-right">₹{p.total.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-sm text-right text-success">₹{p.paid.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-destructive">
                        ₹{p.pending.toLocaleString("en-IN")}
                        {p.adjustedTotal > 0 && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] bg-secondary/60">
                            Adj ₹{p.adjustedTotal.toLocaleString("en-IN")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.pending > 0 ? (
                          <Badge variant="outline" className={`text-[10px] ${pendingDurationBadgeClass(getPendingDurationDays(p.date))}`}>
                            {formatPendingDuration(getPendingDurationDays(p.date))}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={p.status === "adjusted" ? "outline" : p.status === "partial" ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isAdmin && p.pending > 0 && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openAdjust(p)}>
                              <SlidersHorizontal className="mr-1 h-3 w-3" /> Adjust
                            </Button>
                          )}
                          {(p.adjustedTotal > 0 || (adjByBilling.get(p.id) || []).length > 0) && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Adjustment history" onClick={() => setHistoryTarget(p)}>
                              <History className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="ml-2">
                  {totalCount === 0 ? "0" : `${startIdx + 1}-${Math.min(startIdx + pageSize, totalCount)}`} of {totalCount}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(1)}>«</Button>
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</Button>
                {Array.from({ length: totalPages }).slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5).map((_, i) => {
                  const pageNum = Math.max(0, currentPage - 3) + i + 1;
                  if (pageNum > totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={pageNum === currentPage ? "default" : "outline"}
                      onClick={() => setPage(pageNum)}
                      className="min-w-9"
                    >{pageNum}</Button>
                  );
                })}
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</Button>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Pending Amount by Treatment Type</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              எந்த treatment-களில் அதிக நிலுவை (pending) தொகை இருக்கிறது என்பதை இங்கே பார்க்கலாம்.
            </p>
          </CardHeader>
          <CardContent>
            {pendingByTreatment.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No pending treatment data.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(260, pendingByTreatment.length * 36)}>
                  <BarChart data={pendingByTreatment} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="treatment" width={160} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number, _n, p: any) => [`₹${v.toLocaleString("en-IN")}`, `${p.payload.treatment} (${p.payload.count} bills)`]}
                    />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                      {pendingByTreatment.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Treatment</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Bills</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Pending Amount</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pendingByTreatment.map((t) => (
                        <tr key={t.treatment} className="hover:bg-secondary/30">
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                              {t.treatment}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{t.count}</td>
                          <td className="px-4 py-2 text-right font-semibold text-destructive">₹{t.amount.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {totalPending > 0 ? ((t.amount / totalPending) * 100).toFixed(1) : "0.0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

      </div>
    );
  };

  const ExpensesSection = () => {
    const categories = expenseByCategory();
    const [breakdownDialog, setBreakdownDialog] = useState<{ open: boolean; key: string }>({ open: false, key: "" });

    // ---- Expenses List View (display only; uses already-fetched fExpenses) ----
    const [expSearch, setExpSearch] = useState("");
    const [expCategory, setExpCategory] = useState("all");
    const [expMode, setExpMode] = useState("all");
    const [expPage, setExpPage] = useState(1);
    const [expPageSize, setExpPageSize] = useState(25);

    const prettyCategory = (c: string) =>
      String(c || "").charAt(0).toUpperCase() + String(c || "").slice(1).replace(/_/g, " ");

    const categoryColor = useMemo(() => {
      const m = new Map<string, string>();
      categories.forEach((c) => m.set(c.category, c.color));
      return m;
    }, [categories]);

    const expenseCategoryOptions = useMemo(
      () => Array.from(new Set((fExpenses as any[]).map((e) => String(e.category || "").trim()).filter(Boolean))).sort(),
      [fExpenses]
    );
    const expenseModeOptions = useMemo(
      () => Array.from(new Set((fExpenses as any[]).map((e) => normalizeMode(e.payment_method)))).sort(),
      [fExpenses]
    );

    const filteredExpenses = useMemo(() => {
      const q = expSearch.trim().toLowerCase();
      return (fExpenses as any[]).filter((e) => {
        if (expCategory !== "all" && String(e.category || "") !== expCategory) return false;
        if (expMode !== "all" && normalizeMode(e.payment_method) !== expMode) return false;
        if (!q) return true;
        return [e.paid_to, e.description, e.notes, e.expense_number, e.receipt_number]
          .some((v) => String(v || "").toLowerCase().includes(q));
      });
    }, [fExpenses, expSearch, expCategory, expMode]);

    const filteredExpenseTotal = useMemo(
      () => filteredExpenses.reduce((a, b) => a + Number(b.amount || 0), 0),
      [filteredExpenses]
    );

    const expenseFiltersActive = expSearch.trim() !== "" || expCategory !== "all" || expMode !== "all";
    const pagedExpenses = usePagedSlice(filteredExpenses, expPage, expPageSize);
    const openExpenseReceipt = async (path: string) => {
      const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 300);
      if (error || !data?.signedUrl) { toast.error("Unable to open receipt"); return; }
      window.open(data.signedUrl, "_blank");
    };

    const breakdownConfig: Record<string, { title: string; total: number; columns: string[]; rows: any[][] }> = {
      total: {
        title: "Total Expenses — Operating Expenses",
        total: totalExpenses,
        columns: ["Date", "Category", "Description", "Vendor", "Method", "Amount"],
        rows: fExpenses.map((e: any) => [
          e.expense_date ? format(new Date(e.expense_date), "dd MMM yy") : "—",
          e.category || "—",
          e.description || "—",
          e.vendor || "—",
          e.payment_method || "—",
          `₹${Number(e.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ]),
      },
      purchases: {
        title: "Purchases — Inventory & Materials",
        total: totalPurchases,
        columns: ["Date", "Invoice", "Supplier", "Status", "Amount"],
        rows: fPurchases.map((p: any) => [
          p.purchase_date ? format(new Date(p.purchase_date), "dd MMM yy") : (p.created_at ? format(new Date(p.created_at), "dd MMM yy") : "—"),
          p.invoice_number || "—",
          p.supplier_name || "—",
          p.delivery_status || p.status || "—",
          `₹${Number(p.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ]),
      },
      salaries: {
        title: "Salaries — Staff Payroll",
        total: totalPayroll,
        columns: ["Period", "Employee", "Gross", "Deductions", "Net Salary"],
        rows: fPayroll.map((p: any) => [
          p.pay_period || (p.created_at ? format(new Date(p.created_at), "MMM yy") : "—"),
          p.employee_name || p.employee_id || "—",
          `₹${Number(p.gross_salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₹${Number(p.tax_deduction || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₹${Number(p.net_salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ]),
      },
      lab: {
        title: "Lab Costs — External Lab Orders",
        total: totalLabCost,
        columns: ["Date", "Order #", "Lab", "Patient", "Status", "Amount"],
        rows: fLabOrders.map((l: any) => [
          l.order_date ? format(new Date(l.order_date), "dd MMM yy") : (l.created_at ? format(new Date(l.created_at), "dd MMM yy") : "—"),
          l.order_number || "—",
          l.lab_name || "—",
          getPatientName(l.patient_id) || "—",
          l.status || "—",
          `₹${Number(l.rate || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ]),
      },
    };

    const current = breakdownConfig[breakdownDialog.key];

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Total Expenses" value={`₹${totalExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Wallet} color="text-destructive" onClick={() => setBreakdownDialog({ open: true, key: "total" })} />
          <StatCard label="Purchases" value={`₹${totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={ShoppingCart} color="text-warning" onClick={() => setBreakdownDialog({ open: true, key: "purchases" })} />
          <StatCard label="Salaries" value={`₹${totalPayroll.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Users} onClick={() => setBreakdownDialog({ open: true, key: "salaries" })} />
          <StatCard label="Lab Costs" value={`₹${totalLabCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Building2} onClick={() => setBreakdownDialog({ open: true, key: "lab" })} />
        </div>
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Expense Category Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="category" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {categories.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expenses List View — display only, from already-fetched fExpenses */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-display">Expenses List View</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredExpenses.length} of {fExpenses.length} expenses in the selected period
                </p>
              </div>
              {expenseFiltersActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setExpSearch(""); setExpCategory("all"); setExpMode("all"); setExpPage(1); }}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Search vendor, description, voucher no..."
                value={expSearch}
                onChange={(e) => { setExpSearch(e.target.value); setExpPage(1); }}
                className="sm:max-w-xs"
              />
              <Select value={expCategory} onValueChange={(v) => { setExpCategory(v); setExpPage(1); }}>
                <SelectTrigger className="sm:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {expenseCategoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{prettyCategory(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expMode} onValueChange={(v) => { setExpMode(v); setExpPage(1); }}>
                <SelectTrigger className="sm:w-[170px]"><SelectValue placeholder="Payment Mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment Modes</SelectItem>
                  {expenseModeOptions.map((m) => (
                    <SelectItem key={m} value={m}>{modeLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-semibold text-muted-foreground w-14">S.No</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground w-28">Date</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Category</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Vendor / Payee</th>
                    <th className="hidden md:table-cell px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Description</th>
                    <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-semibold text-muted-foreground w-32">Payment Mode</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground w-32">Amount</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {expenseFiltersActive ? "No expenses match your filters" : "No expenses in this period"}
                      </td>
                    </tr>
                  ) : pagedExpenses.map((e: any, i: number) => {
                    const label = prettyCategory(e.category);
                    const color = categoryColor.get(label);
                    const desc = String(e.description || e.notes || "").trim();
                    const mode = normalizeMode(e.payment_method);
                    return (
                      <tr key={e.id} className="hover:bg-muted/40">
                        <td className="hidden sm:table-cell px-3 py-3 text-xs text-muted-foreground">
                          {(expPage - 1) * expPageSize + i + 1}
                        </td>
                        <td className="px-3 py-3 text-sm whitespace-nowrap">
                          {e.expense_date ? format(new Date(e.expense_date), "dd MMM yy") : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] max-w-[180px]"
                            style={color ? { backgroundColor: `${color}1a`, borderColor: `${color}55` } : undefined}
                          >
                            {color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                            <span className="truncate">{label || "—"}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          <span className="block max-w-[180px] truncate">{String(e.paid_to || "").trim() || "—"}</span>
                        </td>
                        <td className="hidden md:table-cell px-3 py-3 text-sm text-muted-foreground">
                          {desc ? (
                            <TooltipProvider delayDuration={150}>
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <span className="block max-w-[280px] truncate cursor-default">{desc}</span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">{desc}</TooltipContent>
                              </UITooltip>
                            </TooltipProvider>
                          ) : "—"}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-3">
                          <Badge variant="outline" className="text-[10px]">{modeLabel(mode)}</Badge>
                        </td>
                        <td className="px-3 py-3 text-sm text-right font-medium whitespace-nowrap">
                          ₹{Number(e.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {e.receipt_url ? (
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="View receipt" onClick={() => openExpenseReceipt(e.receipt_url)}>
                              <Receipt size={14} />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/50 border-t border-border">
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-xs font-semibold">
                      Filtered Total ({filteredExpenses.length} entries)
                      <span className="ml-2 font-normal text-muted-foreground">
                        Period Total (Total Expenses KPI): ₹{totalExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-bold whitespace-nowrap">
                      ₹{filteredExpenseTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <TablePagination
              page={expPage}
              pageSize={expPageSize}
              total={filteredExpenses.length}
              onPageChange={setExpPage}
              onPageSizeChange={setExpPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              label="expenses"
            />
          </CardContent>
        </Card>

        <Dialog open={breakdownDialog.open} onOpenChange={(open) => setBreakdownDialog({ open, key: breakdownDialog.key })}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{current?.title || "Breakdown"}</DialogTitle>
              <DialogDescription>
                {current ? `${current.rows.length} records · Total ₹${current.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto -mx-6 px-6">
              {current && current.rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No records found in this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b border-border bg-secondary/50">
                      {current?.columns.map((c, i) => (
                        <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i === (current.columns.length - 1) ? "text-right" : "text-left"}`}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {current?.rows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-secondary/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className={`px-3 py-2 ${ci === row.length - 1 ? "text-right font-medium" : ""}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {current && current.rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-secondary/40">
                        <td colSpan={(current.columns.length - 1)} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">TOTAL</td>
                        <td className="px-3 py-2 text-right text-sm font-bold">₹{current.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const PnLSection = () => {
    const data = monthlyPnL();

    // ---- Treatment Profitability (display only; reuses already-fetched data) ----
    const [tpSearch, setTpSearch] = useState("");
    const [tpSort, setTpSort] = useState<{ key: "revenue" | "cost" | "margin" | "marginPct"; dir: "asc" | "desc" }>({ key: "margin", dir: "desc" });
    const [tpPage, setTpPage] = useState(1);
    const [tpPageSize, setTpPageSize] = useState(10);

    const treatmentProfitability = useMemo(() => {
      const itemsByBilling = new Map<string, any[]>();
      (fBillingItems as any[]).forEach((it) => {
        if (!it.billing_id) return;
        const arr = itemsByBilling.get(it.billing_id) || [];
        arr.push(it);
        itemsByBilling.set(it.billing_id, arr);
      });

      const agg = new Map<string, { revenue: number; procedures: number }>();
      (fBillings as any[]).forEach((b) => {
        const items = itemsByBilling.get(b.id) || [];
        const gross = items.reduce((s, it) => s + Number(it.total_price || 0), 0);
        if (!items.length || gross <= 0) return;
        const net = Number(b.total_amount || 0);
        items.forEach((it) => {
          const name = String(it.treatment_type || "").trim();
          if (!name) return;
          const cur = agg.get(name) || { revenue: 0, procedures: 0 };
          cur.revenue += (Number(it.total_price || 0) / gross) * net;
          cur.procedures += Number(it.quantity || 0) || 1;
          agg.set(name, cur);
        });
      });

      // Direct cost attribution: lab orders matched to treatment names by work_type.
      const costByTreatment = new Map<string, number>();
      let unmatchedLabCost = 0;
      const names = Array.from(agg.keys());
      (fLabOrders as any[]).forEach((o) => {
        const wt = String(o.work_type || "").trim().toLowerCase();
        const rate = Number(o.rate || 0);
        if (!wt) { unmatchedLabCost += rate; return; }
        const hit = names.find((n) => {
          const ln = n.toLowerCase();
          return ln === wt || ln.includes(wt) || wt.includes(ln);
        });
        if (hit) costByTreatment.set(hit, (costByTreatment.get(hit) || 0) + rate);
        else unmatchedLabCost += rate;
      });

      const labExpenses = (fExpenses as any[])
        .filter((e) => String(e.category || "").toLowerCase().includes("lab"))
        .reduce((s, e) => s + Number(e.amount || 0), 0);

      const rows = Array.from(agg.entries()).map(([name, v]) => {
        const revenue = Math.round(v.revenue);
        const hasCost = costByTreatment.has(name);
        const cost = Math.round(costByTreatment.get(name) || 0);
        const margin = revenue - cost;
        return {
          name,
          procedures: v.procedures,
          revenue,
          cost,
          hasCost,
          margin,
          marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
        };
      });

      return { rows, unattributedCost: Math.round(unmatchedLabCost + labExpenses) };
    }, [fBillings, fBillingItems, fLabOrders, fExpenses]);

    const tpFiltered = useMemo(() => {
      const q = tpSearch.trim().toLowerCase();
      const list = q ? treatmentProfitability.rows.filter((r) => r.name.toLowerCase().includes(q)) : treatmentProfitability.rows.slice();
      const mul = tpSort.dir === "desc" ? -1 : 1;
      return list.sort((a, b) => (a[tpSort.key] - b[tpSort.key]) * mul);
    }, [treatmentProfitability, tpSearch, tpSort]);

    const tpPaged = usePagedSlice(tpFiltered, tpPage, tpPageSize);
    const tpTotals = useMemo(() => tpFiltered.reduce(
      (acc, r) => ({ procedures: acc.procedures + r.procedures, revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, margin: acc.margin + r.margin }),
      { procedures: 0, revenue: 0, cost: 0, margin: 0 },
    ), [tpFiltered]);

    const tpSortHeader = (label: string, key: "revenue" | "cost" | "margin" | "marginPct", extra = "") => (
      <th
        className={`px-4 py-3 text-right text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground ${extra}`}
        onClick={() => { setTpSort((s) => s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }); setTpPage(1); }}
      >
        {label}{tpSort.key === key ? (tpSort.dir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    );

    const marginBadge = (pct: number) => {
      const cls = pct > 60
        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
        : pct >= 30
          ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
          : "bg-rose-500/10 text-rose-600 border-rose-500/30";
      const bar = pct > 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-rose-500";
      return (
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={`text-[10px] ${cls}`}>{pct.toFixed(1)}%</Badge>
          <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Total Revenue" value={`₹${totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={IndianRupee} color="text-success" />
          <StatCard label="Total Expenses" value={`₹${allExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} color="text-destructive" />
          <StatCard label="Net Profit" value={`₹${profit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} color={profit >= 0 ? "text-success" : "text-destructive"} />
          <StatCard label="Profit Margin" value={`${profitMargin}%`} icon={PieChart} />
        </div>
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Profit & Loss Statement (6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <Bar dataKey="revenue" fill="hsl(142,71%,45%)" name="Revenue" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" fill="hsl(0,72%,51%)" name="Expenses" radius={[3, 3, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Profit Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <Line type="monotone" dataKey="profit" stroke="hsl(217,91%,50%)" strokeWidth={2} dot={{ r: 4 }} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Treatment Profitability & Contribution Margin — display only */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-display">Treatment Profitability &amp; Contribution Margin</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Analysis of procedure revenue, direct attributable costs (lab charges &amp; material purchases), and gross margin.
                </p>
              </div>
              <Input
                value={tpSearch}
                onChange={(e) => { setTpSearch(e.target.value); setTpPage(1); }}
                placeholder="Search treatment…"
                className="h-9 w-full sm:w-56"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-secondary/50 border-y border-border">
                  <tr>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-12">S.No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment</th>
                    <th className="hidden md:table-cell px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Procedures</th>
                    {tpSortHeader("Revenue", "revenue")}
                    {tpSortHeader("Direct Cost", "cost")}
                    {tpSortHeader("Gross Margin", "margin")}
                    {tpSortHeader("Margin %", "marginPct")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tpPaged.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No treatment billing in this period.</td></tr>
                  )}
                  {tpPaged.map((r, i) => (
                    <tr key={r.name} className="hover:bg-secondary/30">
                      <td className="hidden sm:table-cell px-4 py-3 text-sm text-muted-foreground">{(tpPage - 1) * tpPageSize + i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">{r.name}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm text-right">{r.procedures}</td>
                      <td className="px-4 py-3 text-sm text-right">₹{r.revenue.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {r.hasCost ? (
                          `₹${r.cost.toLocaleString("en-IN")}`
                        ) : (
                          <span className="text-xs text-muted-foreground italic" title="No direct cost recorded">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${r.margin >= 0 ? "text-success" : "text-destructive"}`}>
                        ₹{r.margin.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3">{marginBadge(r.marginPct)}</td>
                    </tr>
                  ))}
                </tbody>
                {tpFiltered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/40 text-sm font-semibold">
                      <td className="hidden sm:table-cell px-4 py-3" />
                      <td className="px-4 py-3">Total ({tpFiltered.length})</td>
                      <td className="hidden md:table-cell px-4 py-3 text-right">{tpTotals.procedures}</td>
                      <td className="px-4 py-3 text-right">₹{tpTotals.revenue.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-right">₹{tpTotals.cost.toLocaleString("en-IN")}</td>
                      <td className={`px-4 py-3 text-right ${tpTotals.margin >= 0 ? "text-success" : "text-destructive"}`}>₹{tpTotals.margin.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-right">
                        {tpTotals.revenue > 0 ? `${((tpTotals.margin / tpTotals.revenue) * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
              Unattributed lab &amp; material cost for this period: ₹{treatmentProfitability.unattributedCost.toLocaleString("en-IN")} — overhead that could not be mapped to a specific procedure, so it is excluded from the margins above.
            </p>
            {tpFiltered.length > tpPageSize && (
              <TablePagination
                page={tpPage}
                pageSize={tpPageSize}
                total={tpFiltered.length}
                onPageChange={setTpPage}
                onPageSizeChange={setTpPageSize}
                pageSizeOptions={[10, 15, 25, 50]}
                label="treatments"
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const CashFlowSection = () => {
    const data = cashFlowData();
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Inflows" value={`₹${totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} color="text-success" />
          <StatCard label="Total Outflows" value={`₹${allExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} color="text-destructive" />
          <StatCard label="Net Cash Flow" value={`₹${(totalPaid - allExpenses).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Wallet} color={totalPaid >= allExpenses ? "text-success" : "text-destructive"} />
        </div>
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Cash Flow (6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(142,71%,45%)" fill="hsl(142,71%,45%)" fillOpacity={0.1} name="Inflow" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(0,72%,51%)" fill="hsl(0,72%,51%)" fillOpacity={0.1} name="Outflow" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  };

  const TaxSection = () => {
    const gstCollected = fBillings.reduce((a: number, b: any) => a + Number(b.tax_amount || 0), 0);
    const tdsPaid = fPayroll.reduce((a: number, b: any) => a + Number(b.tax_deduction || 0), 0);
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="GST Collected" value={`₹${gstCollected.toLocaleString("en-IN")}`} icon={FileText} />
          <StatCard label="TDS Deducted" value={`₹${tdsPaid.toLocaleString("en-IN")}`} icon={Calculator} />
          <StatCard label="Total Revenue (Taxable)" value={`₹${totalRevenue.toLocaleString("en-IN")}`} icon={IndianRupee} />
        </div>
        <Card className="shadow-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Tax compliance data is derived from billings (GST/tax) and payroll (TDS). 
              For detailed GST filing and income tax reporting, export the data and consult your CA.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const DoctorRevenueSection = () => {
    const docs = doctorRevenue();
    return (
      <div className="space-y-6">
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Doctor Revenue & Commission</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Doctor</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground">Revenue Generated</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground">30% Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((d) => (
                  <tr key={d.doctor} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium">{d.doctor}</td>
                    <td className="px-5 py-3 text-sm text-right text-success">₹{d.revenue.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold">₹{d.share30.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const VendorSection = () => {
    const { labs, suppliers } = vendorPayments();
    const fmt2 = (n: any) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const allVendors = [...Object.values(labs), ...Object.values(suppliers)] as any[];
    const totalPayable = allVendors.reduce((a, v) => a + v.payable, 0);
    const totalPaidV = allVendors.reduce((a, v) => a + v.paid, 0);
    const totalOutstanding = Math.max(0, totalPayable - totalPaidV);

    const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
      s === "Paid" ? "default" : s === "Partial" ? "secondary" : s === "Unpaid" ? "destructive" : "outline";

    const matchesFilter = (v: any) =>
      vendorStatusFilter === "all" || v.status === vendorStatusFilter || (vendorStatusFilter === "Unpaid" && v.status === "Amount not entered" && v.payable === 0);

    const filtered = (m: Record<string, any>) => Object.fromEntries(Object.entries(m).filter(([, v]) => matchesFilter(v)));

    const VendorTable = ({ map, type, emptyLabel }: { map: Record<string, any>; type: "lab" | "supplier"; emptyLabel: string }) => (
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">{type === "lab" ? "Lab Payments" : "Supplier Payments"}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Vendor</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Orders</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Payable</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Outstanding</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(map).map(([name, data]: [string, any]) => (
                  <tr
                    key={name}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => setVendorDialog({ open: true, type, name })}
                  >
                    <td className="px-4 py-3 text-sm text-primary hover:underline">
                      {name}
                      {data.zeroExpense > 0 && (
                        <div className="text-[10px] text-amber-600 font-normal">{data.zeroExpense} order{data.zeroExpense !== 1 ? "s" : ""} — amount not entered</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{data.count}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">₹{fmt2(data.payable)}</td>
                    <td className="px-4 py-3 text-sm text-right text-success">₹{fmt2(data.paid)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-destructive">₹{fmt2(data.outstanding)}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(data.status)} className="text-[10px]">{data.status}</Badge></td>
                  </tr>
                ))}
                {Object.keys(map).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Payable" value={`₹${fmt2(totalPayable)}`} icon={IndianRupee} />
          <StatCard label="Total Paid" value={`₹${fmt2(totalPaidV)}`} icon={CheckCircle2} color="text-success" />
          <StatCard label="Outstanding" value={`₹${fmt2(totalOutstanding)}`} icon={AlertCircle} color="text-destructive" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["all", "Unpaid", "Partial", "Paid"].map((v) => (
            <button
              key={v}
              onClick={() => setVendorStatusFilter(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${vendorStatusFilter === v ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary border-border"}`}
            >
              {v === "all" ? "All" : v}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-1">Lab payables count delivered orders only, by delivery date.</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <VendorTable map={filtered(labs)} type="lab" emptyLabel="No delivered lab orders yet" />
          <VendorTable map={filtered(suppliers)} type="supplier" emptyLabel="No purchases yet" />
        </div>
      </div>
    );
  };

  const BudgetSection = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Monthly Revenue" value={`₹${totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={IndianRupee} color="text-success" />
        <StatCard label="Monthly Expenses" value={`₹${allExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} color="text-destructive" />
        <StatCard label="Savings Rate" value={`${profitMargin}%`} icon={Target} />
      </div>
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Revenue vs Expenses Trend</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyPnL()}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(142,71%,45%)" strokeWidth={2} name="Revenue" />
              <Line type="monotone" dataKey="expenses" stroke="hsl(0,72%,51%)" strokeWidth={2} name="Expenses" />
              <Line type="monotone" dataKey="profit" stroke="hsl(217,91%,50%)" strokeWidth={2} strokeDasharray="5 5" name="Profit" />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  const currentSection = sections.find((s) => s.id === activeSection);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <IndianRupee className="text-success" size={24} />
            Finance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete financial overview — Revenue, Expenses, P&L, Cash Flow & more
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeSection} onValueChange={setActiveSection}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <s.icon size={14} />
                    {s.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SmartDateFilter
            preset={globalPreset}
            onPresetChange={setGlobalPreset}
            customFrom={globalFrom}
            customTo={globalTo}
            onCustomFromChange={setGlobalFrom}
            onCustomToChange={setGlobalTo}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" title="Export" className="h-9 w-9 shrink-0">
                <Download size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleGlobalExport}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Download CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleGlobalExportPDF}>
                <FileText className="h-4 w-4 mr-2" /> Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {renderSection()}

      {/* Adjust dialog — receivables list only; never touches billings/payments */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Receivable</DialogTitle>
            <DialogDescription>
              {adjustTarget?.invoice_number || "Invoice"} · {adjustTarget?.patient}
            </DialogDescription>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="font-semibold">₹{adjustTarget.total.toLocaleString("en-IN")}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Paid</p>
                  <p className="font-semibold text-success">₹{adjustTarget.paid.toLocaleString("en-IN")}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Pending</p>
                  <p className="font-semibold text-destructive">₹{adjustTarget.pending.toLocaleString("en-IN")}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-type">Adjustment type</Label>
                <Select value={adjType} onValueChange={setAdjType}>
                  <SelectTrigger id="adj-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount">Discount</SelectItem>
                    <SelectItem value="write_off">Write-off</SelectItem>
                    <SelectItem value="correction">Correction</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-amount">Amount (max ₹{adjustTarget.pending.toLocaleString("en-IN")})</Label>
                <Input
                  id="adj-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-reason">Reason (mandatory)</Label>
                <Textarea
                  id="adj-reason"
                  rows={2}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Why is this being adjusted?"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This only changes the Receivables list and its summary cards. Billing, Revenue, P&amp;L and reports stay unchanged.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
                <Button onClick={saveAdjustment} disabled={adjSaving}>
                  {adjSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Adjustment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History dialog — read-only log, one-time reversal per adjustment */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjustment History</DialogTitle>
            <DialogDescription>
              {historyTarget?.invoice_number || "Invoice"} · {historyTarget?.patient}
            </DialogDescription>
          </DialogHeader>
          {historyTarget && (
            <div className="space-y-3">
              {historyTarget.paid + historyTarget.adjustedTotal > historyTarget.total && (
                <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Over-collected after adjustment — ₹{(historyTarget.paid + historyTarget.adjustedTotal - historyTarget.total).toLocaleString("en-IN")}. Reverse an adjustment to resolve this.
                </p>
              )}
              {(adjByBilling.get(historyTarget.id) || []).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No adjustments recorded for this invoice.</p>
              )}
              {(adjByBilling.get(historyTarget.id) || []).map((a: any) => {
                const isReversal = !!a.reverses_id;
                const reversed = (adjByBilling.get(historyTarget.id) || []).some((r: any) => r.reverses_id === a.id);
                return (
                  <div key={a.id} className="rounded-lg border border-border p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={isReversal ? "secondary" : "outline"} className="text-[10px]">
                          {isReversal ? "Reversal" : String(a.adjustment_type).replace(/_/g, " ")}
                        </Badge>
                        <span className={`font-semibold ${Number(a.amount) < 0 ? "text-warning" : "text-destructive"}`}>
                          {Number(a.amount) < 0 ? "+" : "−"}₹{Math.abs(Number(a.amount)).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(a.adjusted_at), "dd MMM yyyy, hh:mm a")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Pending ₹{Number(a.pending_before).toLocaleString("en-IN")} → ₹{Number(a.pending_after).toLocaleString("en-IN")}
                    </p>
                    {isAdminUser && !isReversal && !reversed && (
                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => { setReverseTarget(a); setReverseReason(`Reversal of ${String(a.adjustment_type).replace(/_/g, " ")} — ${a.reason}`); }}
                        >
                          <Undo2 className="mr-1 h-3 w-3" /> Reverse
                        </Button>
                      </div>
                    )}
                    {reversed && (
                      <p className="text-[11px] text-muted-foreground italic">Reversed</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reversal confirm — inserts a mirror row with the exact negative amount */}
      <AlertDialog open={!!reverseTarget} onOpenChange={(o) => { if (!o) { setReverseTarget(null); setReverseReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this adjustment?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores ₹{Math.abs(Number(reverseTarget?.amount || 0)).toLocaleString("en-IN")} to the invoice's pending.
              A reversal is permanent and can only be done once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="rev-reason">Reason (mandatory)</Label>
            <Textarea
              id="rev-reason"
              rows={2}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveReversal} disabled={reverseSaving}>
              {reverseSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Reversal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BillingDetailDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
        billing={selectedBilling}
        patientName={selectedBilling ? getPatientNameWithPhone(selectedBilling.patient_id) : ""}
        allBillings={billings.filter((x: any) => selectedBilling && x.patient_id === selectedBilling.patient_id) as any}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["finance-billings"] });
          queryClient.invalidateQueries({ queryKey: ["finance-billing-items"] });
        }}
      />

      <Dialog open={vendorDialog.open} onOpenChange={(o) => setVendorDialog((v) => ({ ...v, open: o }))}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {vendorDialog.type === "lab" ? <Building2 size={18} className="text-primary" /> : <ShoppingCart size={18} className="text-primary" />}
              {vendorDialog.name}
            </DialogTitle>
            <DialogDescription>
              {vendorDialog.type === "lab" ? "Delivered orders — Payable, Paid and Outstanding" : "Purchase invoices — Payable, Paid and Outstanding"}
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const fmt2 = (n: any) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const payStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
              const v = (s || "").toLowerCase();
              if (v === "paid") return "default";
              if (v === "partial") return "secondary";
              if (v === "amount not entered") return "outline";
              return "destructive";
            };
            const labPayableStatus = (o: any): "Paid" | "Partial" | "Unpaid" | "Amount not entered" => {
              const payable = Number(o.lab_expense || 0);
              const paid = Number(o.lab_expense_paid_amount || 0);
              if (payable <= 0) return "Amount not entered";
              if (paid >= payable) return "Paid";
              if (paid > 0) return "Partial";
              return "Unpaid";
            };
            const orderMatchesFilter = (st: string) =>
              vendorStatusFilter === "all" || st === vendorStatusFilter || (vendorStatusFilter === "Unpaid" && st === "Amount not entered");
            const prettyMode = (m: string) => {
              const map: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer", card: "Card", cheque: "Cheque" };
              return map[(m || "").toLowerCase()] || (m ? m.replace(/_/g, " ") : "—");
            };
            const invoiceFor = (o: any) => o.invoice_number || `LAB-${String(o.id || "").slice(0, 8).toUpperCase()}`;

            const downloadPdf = async () => {
              const branding = await fetchClinicBranding();
              const doc = new jsPDF();
              const pageWidth = doc.internal.pageSize.getWidth();
              const headerEnd = await addClinicPdfHeader(doc, branding);
              doc.setFontSize(13);
              doc.setFont("helvetica", "bold");
              doc.text(vendorDialog.type === "lab" ? "LAB PAYMENT STATEMENT" : "SUPPLIER PAYMENT STATEMENT", pageWidth - 14, headerEnd, { align: "right" });
              doc.setFontSize(10);
              doc.setFont("helvetica", "normal");
              doc.text(vendorDialog.name, pageWidth - 14, headerEnd + 6, { align: "right" });
              doc.text(`Printed: ${format(new Date(), "dd-MM-yyyy hh:mm a")}`, pageWidth - 14, headerEnd + 11, { align: "right" });

              if (vendorDialog.type === "lab") {
                const orders = fLabPayables
                  .filter((o: any) => o.lab_name === vendorDialog.name && orderMatchesFilter(labPayableStatus(o)));
                const totalP = orders.reduce((a: number, o: any) => a + Number(o.lab_expense || 0), 0);
                const totalPaid = orders.reduce((a: number, o: any) => a + Number(o.lab_expense_paid_amount || 0), 0);
                autoTable(doc, {
                  startY: headerEnd + 18,
                  head: [["Invoice #", "Patient", "Work", "Tooth", "Delivered", "Payable (Rs.)", "Paid (Rs.)", "Outstanding (Rs.)", "Status"]],
                  body: orders.map((o: any) => {
                    const payable = Number(o.lab_expense || 0);
                    const paid = Number(o.lab_expense_paid_amount || 0);
                    return [
                      invoiceFor(o),
                      getPatientName(o.patient_id),
                      (o.work_type || "").replace(/_/g, " "),
                      o.tooth_number || "—",
                      o.actual_delivery_date || "—",
                      fmt2(payable),
                      fmt2(paid),
                      fmt2(Math.max(0, payable - paid)),
                      labPayableStatus(o) + (o.status === "cancelled" && paid > 0 ? " (Cancelled)" : ""),
                    ];
                  }),
                  theme: "grid",
                  headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
                  styles: { fontSize: 7, cellPadding: 3 },
                  columnStyles: { 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right", fontStyle: "bold" } },
                  margin: { bottom: 30 },
                  didDrawPage: () => addClinicPdfFooter(doc),
                });
                const finalY = (doc as any).lastAutoTable.finalY || 100;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`Payable: Rs.${fmt2(totalP)}    Paid: Rs.${fmt2(totalPaid)}    Outstanding: Rs.${fmt2(Math.max(0, totalP - totalPaid))}`, pageWidth - 14, finalY + 10, { align: "right" });
                doc.save(`Lab_Payments_${vendorDialog.name.replace(/\s+/g, "_")}.pdf`);
              } else {
                const list = fPurchases.filter((p: any) => {
                  if (p.supplier_name !== vendorDialog.name) return false;
                  const payable = Number(p.total_amount || 0);
                  const paid = Number(p.amount_paid || 0);
                  const st = paid >= payable && payable > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
                  return orderMatchesFilter(st);
                });
                const totalP = list.reduce((a: number, p: any) => a + Number(p.total_amount || 0), 0);
                const totalPaid = list.reduce((a: number, p: any) => a + Number(p.amount_paid || 0), 0);
                autoTable(doc, {
                  startY: headerEnd + 18,
                  head: [["Invoice #", "Date", "Mode", "Payable (Rs.)", "Paid (Rs.)", "Outstanding (Rs.)", "Status"]],
                  body: list.map((p: any) => {
                    const payable = Number(p.total_amount || 0);
                    const paid = Number(p.amount_paid || 0);
                    return [
                      p.invoice_number || "—",
                      p.purchase_date || "—",
                      prettyMode(p.payment_method),
                      fmt2(payable),
                      fmt2(paid),
                      fmt2(Math.max(0, payable - paid)),
                      paid >= payable && payable > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid",
                    ];
                  }),
                  theme: "grid",
                  headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
                  styles: { fontSize: 8, cellPadding: 3 },
                  columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
                  margin: { bottom: 30 },
                  didDrawPage: () => addClinicPdfFooter(doc),
                });
                const finalY = (doc as any).lastAutoTable.finalY || 100;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`Payable: Rs.${fmt2(totalP)}    Paid: Rs.${fmt2(totalPaid)}    Outstanding: Rs.${fmt2(Math.max(0, totalP - totalPaid))}`, pageWidth - 14, finalY + 10, { align: "right" });
                doc.save(`Supplier_Payments_${vendorDialog.name.replace(/\s+/g, "_")}.pdf`);
              }
            };

            if (vendorDialog.type === "lab") {
              const orders = fLabPayables
                .filter((o: any) => o.lab_name === vendorDialog.name && orderMatchesFilter(labPayableStatus(o)));
              const total = orders.reduce((a: number, o: any) => a + Number(o.lab_expense || 0), 0);
              const totalPaid = orders.reduce((a: number, o: any) => a + Number(o.lab_expense_paid_amount || 0), 0);
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-sm text-muted-foreground">{orders.length} delivered order{orders.length !== 1 ? "s" : ""}</span>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span>Payable <span className="font-bold text-primary">₹{fmt2(total)}</span></span>
                      <span>Paid <span className="font-bold text-success">₹{fmt2(totalPaid)}</span></span>
                      <span>Outstanding <span className="font-bold text-destructive">₹{fmt2(Math.max(0, total - totalPaid))}</span></span>
                      <Button size="sm" variant="outline" onClick={downloadPdf} className="gap-1.5">
                        <Download size={14} /> Download PDF
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Invoice #</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Patient</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Work / Material</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Tooth</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Delivered</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Payable</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Paid</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Outstanding</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orders.map((o: any) => {
                          const ps = labPayableStatus(o);
                          const payable = Number(o.lab_expense || 0);
                          const paid = Number(o.lab_expense_paid_amount || 0);
                          const cancelled = o.status === "cancelled";
                          return (
                            <tr key={o.id} className="hover:bg-secondary/30">
                              <td className="px-3 py-2 font-mono text-xs">{invoiceFor(o)}</td>
                              <td className="px-3 py-2 font-medium">{getPatientName(o.patient_id)}</td>
                              <td className="px-3 py-2">
                                <div className="capitalize">{(o.work_type || "").replace(/_/g, " ")}</div>
                                {o.material && <div className="text-[10px] text-muted-foreground">{o.material}{o.shade ? ` · ${o.shade}` : ""}</div>}
                              </td>
                              <td className="px-3 py-2">{o.tooth_number || "—"}</td>
                              <td className="px-3 py-2">{o.actual_delivery_date || "—"}</td>
                              <td className="px-3 py-2">
                                <Badge variant={payStatusVariant(ps)} className="text-[10px]">{ps}</Badge>
                                {cancelled && paid > 0 && <Badge variant="outline" className="text-[10px] ml-1">Cancelled (paid)</Badge>}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">{ps === "Amount not entered" ? <span className="text-xs text-amber-600">Not entered</span> : `₹${fmt2(payable)}`}</td>
                              <td className="px-3 py-2 text-right text-success">₹{fmt2(paid)}</td>
                              <td className="px-3 py-2 text-right font-semibold">₹{fmt2(Math.max(0, payable - paid))}</td>
                              <td className="px-3 py-2 text-right">
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => { setRecordPayment({ type: "lab", id: o.id, label: invoiceFor(o) }); setPayAmount(""); setPayDate(format(new Date(), "yyyy-MM-dd")); }}>
                                  Record Payment
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {orders.length === 0 && (
                          <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">No orders</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            const purchaseList = fPurchases.filter((p: any) => {
              if (p.supplier_name !== vendorDialog.name) return false;
              const payable = Number(p.total_amount || 0);
              const paid = Number(p.amount_paid || 0);
              const st = paid >= payable && payable > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
              return orderMatchesFilter(st);
            });
            const total = purchaseList.reduce((a: number, p: any) => a + Number(p.total_amount || 0), 0);
            const totalPaidS = purchaseList.reduce((a: number, p: any) => a + Number(p.amount_paid || 0), 0);
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
                  <span className="text-sm text-muted-foreground">{purchaseList.length} invoice{purchaseList.length !== 1 ? "s" : ""}</span>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>Payable <span className="font-bold text-primary">₹{fmt2(total)}</span></span>
                    <span>Paid <span className="font-bold text-success">₹{fmt2(totalPaidS)}</span></span>
                    <span>Outstanding <span className="font-bold text-destructive">₹{fmt2(Math.max(0, total - totalPaidS))}</span></span>
                    <Button size="sm" variant="outline" onClick={downloadPdf} className="gap-1.5">
                      <Download size={14} /> Download PDF
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {purchaseList.map((p: any) => {
                    const items = purchaseItems.filter((it: any) => it.purchase_id === p.id);
                    const payable = Number(p.total_amount || 0);
                    const paid = Number(p.amount_paid || 0);
                    const psLabel = paid >= payable && payable > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
                    return (
                      <div key={p.id} className="rounded-lg border border-border overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-secondary/40">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold text-primary">{p.invoice_number || "No Invoice #"}</span>
                            <span className="text-xs text-muted-foreground">· {p.purchase_date}</span>
                            <span className="text-xs text-muted-foreground">· Mode: {prettyMode(p.payment_method)}</span>
                            <Badge variant={payStatusVariant(psLabel)} className="text-[10px]">{psLabel}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-xs text-muted-foreground">Paid <span className="font-medium text-success">₹{fmt2(paid)}</span> · Due <span className="font-semibold text-destructive">₹{fmt2(Math.max(0, payable - paid))}</span></span>
                            <span className="font-bold">₹{fmt2(payable)}</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => { setRecordPayment({ type: "supplier", id: p.id, label: p.invoice_number || "Purchase" }); setPayAmount(""); setPayDate(format(new Date(), "yyyy-MM-dd")); }}>
                              Record Payment
                            </Button>
                          </div>
                        </div>
                        {items.length > 0 ? (
                          <table className="w-full text-xs">
                            <thead className="bg-background">
                              <tr className="border-b border-border">
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Item</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Qty</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Unit Price</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {items.map((it: any) => (
                                <tr key={it.id}>
                                  <td className="px-3 py-2">{it.item_name}</td>
                                  <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                                  <td className="px-3 py-2 text-right">₹{fmt2(it.unit_price)}</td>
                                  <td className="px-3 py-2 text-right font-medium">₹{fmt2(it.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="px-3 py-3 text-xs text-muted-foreground">No line items recorded</div>
                        )}
                      </div>
                    );
                  })}
                  {purchaseList.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground border border-border rounded-lg">No purchases</div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Record vendor payment (lab order or supplier purchase) ─── */}
      <Dialog open={!!recordPayment} onOpenChange={(o) => { if (!o) setRecordPayment(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>{recordPayment?.label} — the amount is added to what has already been paid.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Amount (₹)</label>
              <Input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Payment Date</label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <Button className="w-full" disabled={paySaving} onClick={handleRecordVendorPayment}>
              {paySaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Save Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* ─── Metric calculation breakdown (view-only) ─── */}
      <Dialog open={metricDialog.open} onOpenChange={(o) => { setMetricDialog((m) => ({ ...m, open: o })); if (!o) { setOutstandingExpanded(false); setCashModeFilter(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {(() => {
            const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
            const Row = ({ label, value, strong = false, muted = false }: any) => (
              <div className={`flex items-center justify-between py-2 ${strong ? "border-t border-border mt-1 pt-3" : ""}`}>
                <span className={`text-sm ${muted ? "text-muted-foreground" : ""} ${strong ? "font-semibold" : ""}`}>{label}</span>
                <span className={`text-sm font-mono ${strong ? "font-bold text-primary" : ""}`}>{value}</span>
              </div>
            );
            const Section = ({ title, children }: any) => (
              <div className="rounded-lg border border-border p-4 bg-secondary/20">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
                {children}
              </div>
            );
            const FormulaBox = ({ formula }: { formula: string }) => (
              <div className="rounded-md bg-secondary/40 border border-border px-3 py-2 text-xs font-mono text-foreground/80">
                {formula}
              </div>
            );

            switch (metricDialog.key) {
              case "totalRevenue": {
                // Tier 1 — invoices created inside the selected range
                const newInvoices = billableBillings;
                const paidNew = newInvoices.filter((b: any) => getEffectiveBillingStatus(b) === "paid");
                const partialNew = newInvoices.filter((b: any) => getEffectiveBillingStatus(b) === "partial");
                const pendingNew = newInvoices.filter((b: any) => getEffectiveBillingStatus(b) === "pending");
                const sumAmt = (rows: any[]) => rows.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
                const paidNewAmt = sumAmt(paidNew);
                const partialNewAmt = sumAmt(partialNew);
                const pendingNewAmt = sumAmt(pendingNew);

                // Tier 2 — backlog clearances (invoices created before the range)
                const backlogInvoiceCount = new Set(previousDuesPayments.map((p: any) => p.billing_id)).size;

                // Tier 3 — referral-linked revenue (informational subset, not additive)
                const referredPatientIds = new Set(
                  (referrals as any[]).map((r) => r.referred_patient_id).filter(Boolean)
                );
                const referralInvoices = newInvoices.filter((b: any) => referredPatientIds.has(b.patient_id));
                const referralAmt = sumAmt(referralInvoices);

                const SubRow = ({ label, count, value, note }: any) => (
                  <div className="flex items-start justify-between gap-4 py-1.5 pl-4 border-l border-border/60 ml-1">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{label}</p>
                      {note && <p className="text-xs text-muted-foreground">{note}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono">{value}</p>
                      {count !== undefined && (
                        <p className="text-xs text-muted-foreground">{count} invoice{count === 1 ? "" : "s"}</p>
                      )}
                    </div>
                  </div>
                );
                const GroupHeader = ({ title, subtitle, value }: any) => (
                  <div className="flex items-start justify-between gap-4 pt-3 pb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{title}</p>
                      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                    </div>
                    <span className="text-sm font-mono font-semibold shrink-0">{value}</span>
                  </div>
                );

                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><IndianRupee size={18} className="text-success" /> Total Billed (This Period)</DialogTitle>
                      <DialogDescription>Invoices raised inside the selected date range. Cash received in this range for invoices raised earlier is listed separately below and is not part of Total Billed.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <FormulaBox formula="Total Billed = Σ (Invoices raised within Selected Date Range)" />
                      <Section title="Hierarchical Breakdown">
                        <div className="divide-y divide-border/60">
                          <div>
                            <GroupHeader
                              title="New Invoices Collection"
                              subtitle="Created in this range"
                              value={fmt(paidNewAmt + partialNewAmt + pendingNewAmt)}
                            />
                            <SubRow label="Fully Paid Invoices" count={paidNew.length} value={fmt(paidNewAmt)} />
                            <SubRow label="Partially Paid Invoices" count={partialNew.length} value={fmt(partialNewAmt)} />
                            <SubRow label="Unpaid / Pending Invoices" count={pendingNew.length} value={fmt(pendingNewAmt)} />
                          </div>
                          <div>
                            <GroupHeader
                              title="Previous Period Dues / Backlog Collection"
                              subtitle="Created before range, paid in range — reported separately, NOT part of Total Billed"
                              value={fmt(previousDuesCollected)}
                            />
                            <SubRow
                              label="Backlog Clearances / Old Invoice Payments"
                              count={backlogInvoiceCount}
                              value={fmt(previousDuesCollected)}
                              note={`${previousDuesPayments.length} payment${previousDuesPayments.length === 1 ? "" : "s"} in range`}
                            />
                          </div>
                          <div>
                            <GroupHeader
                              title="Referral / Special Revenue Streams"
                              subtitle="Already included above — shown for visibility only"
                              value={fmt(referralAmt)}
                            />
                            <SubRow
                              label="Referral-linked Collections"
                              count={referralInvoices.length}
                              value={fmt(referralAmt)}
                              note="Invoices of referred patients in this range"
                            />
                          </div>
                        </div>
                        <Row label="Total Billed (This Period)" value={fmt(totalRevenue)} strong />
                        <Row label="Old Dues Collected (separate)" value={fmt(previousDuesCollected)} muted />
                        <Row label="Total Cash In" value={fmt(totalCashIn)} muted />
                      </Section>
                    </div>
                  </>
                );
              }

              case "collected": {
                // Authoritative source: billing_payments (decomposed by mode).
                const byMethod = aggregatePaymentsByMode(billablePaymentsInRange as any);
                // Per-transaction breakdown — same rows that sum to totalCollected,
                // de-duped by id and joined to the parent billing for invoice/patient.
                const billingsById = new Map<string, any>(billings.map((b: any) => [b.id, b]));
                const seenCollected = new Set<string>();
                const collectedTxns = billablePaymentsInRange
                  .filter((p: any) => {
                    if (p.id && seenCollected.has(p.id)) return false;
                    if (p.id) seenCollected.add(p.id);
                    return true;
                  })
                  .map((p: any) => {
                    const b = billingsById.get(p.billing_id);
                    return {
                      id: p.id,
                      payment_date: p.payment_date,
                      invoice_number: b?.invoice_number || (b?.id ? b.id.slice(0, 8) : null),
                      patient_name: b ? getPatientName(b.patient_id) : "—",
                      mode: prettyPaymentMethod(p.payment_method),
                      amount: Number(p.amount || 0),
                    };
                  })
                  .sort((a: any, b: any) => new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime());
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><CreditCard size={18} className="text-primary" /> Collected</DialogTitle>
                      <DialogDescription>
                        Actual amount received from patients across all invoices. Total: {fmt(totalPaid)} ({collectedTxns.length} payment{collectedTxns.length === 1 ? "" : "s"}).
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <Section title="Breakdown by payment method">
                        {Object.entries(byMethod).filter(([, v]) => v.amount !== 0).map(([m, v]) => (
                          <Row key={m} label={modeLabel(m)} value={fmt(v.amount)} />
                        ))}
                        <Row label="Total Collected" value={fmt(totalPaid)} strong />
                      </Section>
                      <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
                        <h4 className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                          Payment Transactions ({collectedTxns.length})
                        </h4>
                        <div className="max-h-[45vh] overflow-auto">
                          {collectedTxns.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No payments collected in this period.</div>
                          ) : (
                            <table className="w-full text-xs border-collapse">
                              <thead className="bg-muted sticky top-0">
                                <tr>
                                  <th className="border px-2 py-1.5 text-left font-medium">Payment Date/Time</th>
                                  <th className="border px-2 py-1.5 text-left font-medium">Invoice #</th>
                                  <th className="border px-2 py-1.5 text-left font-medium">Patient</th>
                                  <th className="border px-2 py-1.5 text-left font-medium">Mode</th>
                                  <th className="border px-2 py-1.5 text-right font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {collectedTxns.map((t: any) => (
                                  <tr key={t.id} className="hover:bg-muted/50">
                                    <td className="border px-2 py-1.5 whitespace-nowrap">
                                      {t.payment_date ? format(new Date(t.payment_date), "dd MMM yyyy, hh:mm a") : "—"}
                                    </td>
                                    <td className="border px-2 py-1.5 font-medium">{t.invoice_number || "—"}</td>
                                    <td className="border px-2 py-1.5">{t.patient_name}</td>
                    <td className="border px-2 py-1.5">{t.mode}</td>
                    <td className={`border px-2 py-1.5 text-right font-medium ${t.amount < 0 ? "text-destructive" : "text-success"}`}>{t.amount < 0 ? "−" : ""}₹{Math.abs(t.amount).toLocaleString("en-IN")}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-secondary/40 sticky bottom-0">
                                <tr>
                                  <td className="border px-2 py-1.5 font-semibold text-right" colSpan={4}>Total</td>
                                  <td className="border px-2 py-1.5 text-right font-bold text-primary">₹{totalPaid.toLocaleString("en-IN")}</td>
                                </tr>
                              </tfoot>
                            </table>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                );
              }
              case "cashReceived": {
                // Same finance source as the KPI: current-period invoice payments
                // (billablePaymentsInRange) + previous-dues portion (previousDuesPayments).
                // No new queries, no recalculation of business logic.
                const seenCash = new Set<string>();
                const cashRows: any[] = [];
                for (const p of billablePaymentsInRange) {
                  if (p.id && seenCash.has(p.id)) continue;
                  if (p.id) seenCash.add(p.id);
                  cashRows.push({ ...p, __bucketSource: "current" });
                }
                for (const p of previousDuesPayments) {
                  cashRows.push({ ...p, __bucketSource: "dues" });
                }
                const grandTotal = cashRows.reduce((a, p: any) => a + Number(p.amount || 0), 0);

                // Aggregate by mode (split-aware, single pass).
                const byMode = aggregatePaymentsByMode(cashRows as any);
                const modeRows = REPORT_MODES
                  .map((m) => ({ key: m, ...byMode[m] }))
                  .filter((r) => r.amount !== 0)
                  .sort((a, b) => b.amount - a.amount);

                const billingsByIdCash = new Map<string, any>(billings.map((b: any) => [b.id, b]));
                const modeTxns = cashModeFilter
                  ? cashRows
                      .flatMap((p: any) => {
                        const amt = Number(p.amount || 0);
                        return parsePaymentSplits(p.payment_method, amt)
                          .filter((s) => reportBucket(s.mode) === cashModeFilter && s.amount !== 0)
                          .map((s, i) => {
                            const b = billingsByIdCash.get(p.billing_id);
                            return {
                              key: `${p.id}-${i}`,
                              payment_date: p.payment_date,
                              invoice_number: b?.invoice_number || (b?.id ? b.id.slice(0, 8) : null),
                              patient_name: b ? getPatientName(b.patient_id) : "—",
                              mode: modeLabel(s.mode),
                              source: p.__bucketSource === "dues" ? "Previous Dues" : "Current Period",
                              amount: s.amount,
                            };
                          });
                      })
                      .sort((a: any, b: any) => new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime())
                  : [];
                const modeTxnTotal = modeTxns.reduce((a: number, r: any) => a + r.amount, 0);

                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><Wallet size={18} className="text-success" /> Total Collected</DialogTitle>
                      <DialogDescription>
                        Payment-mode breakdown for the selected period, including current-period invoices and previous dues collected.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 mt-2">
                      <div className="rounded-lg border border-border bg-secondary/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Collected</p>
                        <p className="text-2xl font-bold font-display text-success">{fmt(grandTotal)}</p>
                        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          <p>Patient payments: <span className="font-medium text-foreground">{fmt(grandTotal)}</span></p>
                        </div>

                      </div>
                      {cashRows.length === 0 ? (
                        <div className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                          No collections found for the selected period.
                        </div>
                      ) : (
                        <Section title="Breakdown by payment mode">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="border px-2 py-1.5 text-left font-medium">Payment Mode</th>
                                  <th className="border px-2 py-1.5 text-right font-medium">Amount</th>
                                  <th className="border px-2 py-1.5 text-right font-medium">Txns</th>
                                  <th className="border px-2 py-1.5 text-right font-medium">% of Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {modeRows.map((r) => (
                                  <tr
                                    key={r.key}
                                    onClick={() => setCashModeFilter((c) => (c === r.key ? null : r.key))}
                                    className={`cursor-pointer hover:bg-muted/50 ${cashModeFilter === r.key ? "bg-primary/10" : ""}`}
                                  >
                                    <td className="border px-2 py-1.5">
                                      <span className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: modeColor(r.key) }} />
                                        {modeLabel(r.key)}
                                      </span>
                                    </td>
                                    <td className="border px-2 py-1.5 text-right font-medium">{fmt(r.amount)}</td>
                                    <td className="border px-2 py-1.5 text-right">{r.count}</td>
                                    <td className="border px-2 py-1.5 text-right">
                                      {grandTotal > 0 ? `${((r.amount / grandTotal) * 100).toFixed(2)}%` : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-secondary/40">
                                <tr>
                                  <td className="border px-2 py-1.5 font-semibold">Grand Total</td>
                                  <td className="border px-2 py-1.5 text-right font-bold text-primary">{fmt(grandTotal)}</td>
                                  <td className="border px-2 py-1.5 text-right font-semibold">{cashRows.length}</td>
                                  <td className="border px-2 py-1.5 text-right font-semibold">100%</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">Click any payment mode to see its transactions.</p>
                        </Section>
                      )}

                      {cashModeFilter && (
                        <Section title={`${modeLabel(cashModeFilter)} transactions (${modeTxns.length})`}>
                          <div className="max-h-[40vh] overflow-auto">
                            {modeTxns.length === 0 ? (
                              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                                No collections found for the selected period.
                              </div>
                            ) : (
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="border px-2 py-1.5 text-left font-medium">Date / Time</th>
                                    <th className="border px-2 py-1.5 text-left font-medium">Invoice #</th>
                                    <th className="border px-2 py-1.5 text-left font-medium">Patient</th>
                                    <th className="border px-2 py-1.5 text-left font-medium">Bucket</th>
                                    <th className="border px-2 py-1.5 text-right font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {modeTxns.map((t: any) => (
                                    <tr key={t.key} className="hover:bg-muted/50">
                                      <td className="border px-2 py-1.5 whitespace-nowrap">
                                        {t.payment_date ? format(new Date(t.payment_date), "dd MMM yyyy, hh:mm a") : "—"}
                                      </td>
                                      <td className="border px-2 py-1.5 font-medium">{t.invoice_number || "—"}</td>
                                      <td className="border px-2 py-1.5">{t.patient_name}</td>
                                      <td className="border px-2 py-1.5">{t.source}</td>
                                      <td className="border px-2 py-1.5 text-right font-medium text-success">{fmt(t.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-secondary/40 sticky bottom-0">
                                  <tr>
                                    <td className="border px-2 py-1.5 font-semibold text-right" colSpan={4}>Total</td>
                                    <td className="border px-2 py-1.5 text-right font-bold text-primary">{fmt(modeTxnTotal)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        </Section>
                      )}
                    </div>
                  </>
                );
              }
              case "outstanding": {

                // Per-invoice breakdown matching the period-bound outstanding calc:
                // remaining = max(total_amount − paidInRange, 0); only invoices with
                // remaining > 0 contribute to the Outstanding total.
                const paidInRangeByBilling = new Map<string, number>();
                const seenPay = new Set<string>();
                for (const p of billablePaymentsInRange) {
                  if (p.id && seenPay.has(p.id)) continue;
                  if (p.id) seenPay.add(p.id);
                  const key = p.billing_id;
                  if (!key) continue;
                  paidInRangeByBilling.set(key, (paidInRangeByBilling.get(key) || 0) + Number(p.amount || 0));
                }
                const unpaidInvoices = billableBillings
                  .map((b: any) => {
                    const total = Number(b.total_amount || 0);
                    const paid = paidInRangeByBilling.get(b.id) || 0;
                    const remaining = Math.max(total - paid, 0);
                    return {
                      id: b.id,
                      invoice_number: b.invoice_number,
                      created_at: b.created_at,
                      total,
                      paid,
                      remaining,
                      patient_name: b.patient_name,
                    };
                  })
                  .filter((r: any) => r.remaining > 0)
                  .sort((a: any, b: any) => b.remaining - a.remaining);
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><Clock size={18} className="text-warning" /> Outstanding</DialogTitle>
                      <DialogDescription>Amount still to be collected from patients.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <FormulaBox formula="Outstanding = Total Billed − Collected" />
                      <Section title="Calculation">
                        <Row label="Total Billed (this period)" value={fmt(totalRevenue)} />
                        <Row label="− Collected" value={`− ${fmt(totalPaid)}`} muted />
                        <Row label="= Outstanding" value={fmt(outstanding)} strong />
                      </Section>
                      <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setOutstandingExpanded((v) => !v)}
                          className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors"
                        >
                          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {outstandingExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Unpaid Invoices ({unpaidInvoices.length})
                          </span>
                          <span className="text-sm font-mono font-bold text-warning">{fmt(outstanding)}</span>
                        </button>
                        {outstandingExpanded && (
                          <div className="border-t border-border max-h-[40vh] overflow-auto">
                            {unpaidInvoices.length === 0 ? (
                              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                No unpaid or partial invoices in this period.
                              </div>
                            ) : (
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="border px-2 py-1.5 text-left font-medium">Invoice #</th>
                                    <th className="border px-2 py-1.5 text-left font-medium">Date</th>
                                    <th className="border px-2 py-1.5 text-right font-medium">Total</th>
                                    <th className="border px-2 py-1.5 text-right font-medium">Paid</th>
                                    <th className="border px-2 py-1.5 text-right font-medium">Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {unpaidInvoices.map((r: any) => (
                                    <tr key={r.id} className="hover:bg-muted/50">
                                      <td className="border px-2 py-1.5 align-top font-medium" title={r.patient_name ? `Patient: ${r.patient_name}` : undefined}>
                                        {r.invoice_number || r.id.slice(0, 8)}
                                      </td>
                                      <td className="border px-2 py-1.5 align-top whitespace-nowrap">
                                        {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—"}
                                      </td>
                                      <td className="border px-2 py-1.5 text-right font-mono whitespace-nowrap">{fmt(r.total)}</td>
                                      <td className="border px-2 py-1.5 text-right font-mono whitespace-nowrap">{fmt(r.paid)}</td>
                                      <td className="border px-2 py-1.5 text-right font-mono whitespace-nowrap font-semibold text-warning">{fmt(r.remaining)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-muted/60">
                                    <td className="border px-2 py-1.5 font-semibold" colSpan={4}>Total Outstanding</td>
                                    <td className="border px-2 py-1.5 text-right font-mono font-bold text-warning">{fmt(outstanding)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              }
              case "expenses":
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><TrendingDown size={18} className="text-destructive" /> Total Expenses</DialogTitle>
                      <DialogDescription>All clinic outflows: operating expenses + purchases + salaries + lab costs.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <FormulaBox formula="Total Expenses = Operating Expenses + Purchases + Salaries + Lab Costs" />
                      <Section title="Breakdown">
                        <Row label={`Operating expenses (${fExpenses.length})`} value={fmt(totalExpenses)} />
                        <Row label={`Purchases (${fPurchases.length})`} value={fmt(totalPurchases)} />
                        <Row label={`Staff salaries (${fPayroll.length} payslips)`} value={fmt(totalPayroll)} />
                        <Row label={`Lab orders (${fLabOrders.length})`} value={fmt(totalLabCost)} />

                        <Row label="Total Expenses" value={fmt(allExpenses)} strong />
                      </Section>
                    </div>
                  </>
                );
              case "profit":
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><TrendingUp size={18} className={profit >= 0 ? "text-success" : "text-destructive"} /> Net Profit</DialogTitle>
                      <DialogDescription>Profit after subtracting all expenses from total revenue.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <FormulaBox formula="Net Profit = Total Revenue − Total Expenses" />
                      <Section title="Calculation">
                        <Row label="Total Revenue" value={fmt(totalRevenue)} />
                        <Row label="− Operating expenses" value={`− ${fmt(totalExpenses)}`} muted />
                        <Row label="− Purchases" value={`− ${fmt(totalPurchases)}`} muted />
                        <Row label="− Staff salaries" value={`− ${fmt(totalPayroll)}`} muted />
                        <Row label="− Lab costs" value={`− ${fmt(totalLabCost)}`} muted />
                        

                        <Row label="= Net Profit" value={fmt(profit)} strong />
                      </Section>
                      <p className="text-xs text-muted-foreground">Note: Calculation uses <span className="font-medium">Total Revenue</span> (invoiced amount), not cash collected.</p>
                    </div>
                  </>
                );
              case "margin":
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><PieChart size={18} className="text-primary" /> Profit Margin</DialogTitle>
                      <DialogDescription>Percentage of total revenue that becomes profit.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <FormulaBox formula="Profit Margin = (Net Profit ÷ Total Revenue) × 100" />
                      <Section title="Calculation">
                        <Row label="Net Profit" value={fmt(profit)} />
                        <Row label="÷ Total Revenue" value={fmt(totalRevenue)} muted />
                        <Row label="× 100" value="" muted />
                        <Row label="= Profit Margin" value={`${profitMargin}%`} strong />
                      </Section>
                    </div>
                  </>
                );

              case "pendingBills": {
                const list = pendingPayments();
                const partial = list.filter((p: any) => p.status === "partial").length;
                const pending = list.filter((p: any) => p.status === "pending").length;
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><FileText size={18} className="text-warning" /> Pending Bills</DialogTitle>
                      <DialogDescription>Invoices that are not fully paid.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <FormulaBox formula="Pending Bills = count(billings WHERE total_amount > 0 AND max(total_amount - amount_paid, 0) > 0)" />
                      <Section title="Breakdown by status">
                        <Row label="Partial invoices" value={String(partial)} />
                        <Row label="Pending invoices" value={String(pending)} />
                        <Row label="Total Pending Bills" value={String(list.length)} strong />
                        <Row label="Total Pending Amount" value={fmt(list.reduce((a: number, b: any) => a + b.pending, 0))} />
                      </Section>
                    </div>
                  </>
                );
              }
              default:
                return null;
            }
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Finance;
