import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Landmark, Plus, Clock, CalendarDays, Wallet, Eye, Download, FileSpreadsheet,
  FileText, Trash2, Upload, Search,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } from "@/lib/clinicBranding";

type Billing = {
  id: string;
  invoice_number: string | null;
  patient_id: string;
  amount_paid: number | null;
  total_amount: number | null;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
};

interface Props {
  billings: Billing[];
  getPatientName: (id: string) => string;
}

const DEPOSIT_MODES = ["Cash", "Cheque", "UPI Settlement", "Card Settlement", "Mixed"];
const STATUSES = ["Pending", "Deposited", "Cancelled"];

// Where the deposited money physically came from. A deposit is always a
// transfer of cash already recorded as income — it is never revenue again.
const DEPOSIT_SOURCES = [
  { value: "cash_drawer", label: "From Cash Drawer" },
  { value: "direct", label: "Direct Transfer / Cheque" },
] as const;

const sourceLabel = (s?: string | null) =>
  s === "cash_drawer" ? "Cash Drawer" : "Direct";

// How the money physically reached the bank.
const DEPOSIT_WAYS = [
  { value: "bank_branch", label: "Bank Branch Deposit" },
  { value: "atm_cdm", label: "ATM / Cash Deposit Machine (CDM)" },
] as const;

const ACCOUNT_TYPES = ["Current Account", "Savings"] as const;

const depositWayLabel = (w?: string | null) =>
  w === "bank_branch" ? "Bank Branch" : w === "atm_cdm" ? "ATM / CDM" : "—";


const fmt2 = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "Deposited") return "default";
  if (s === "Pending") return "secondary";
  if (s === "Cancelled") return "destructive";
  return "outline";
};

export default function DepositsSection({ billings, getPatientName }: Props) {
  const queryClient = useQueryClient();

  const { data: deposits = [] } = useQuery({
    queryKey: ["finance-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("*")
        .order("deposit_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Saved bank accounts (shared with salary transfers) used to auto-fill account details
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["deposit-bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_banks")
        .select("id, bank_name, account_number, ifsc_code, branch_name, is_active")
        .eq("is_active", true)
        .order("bank_name");
      if (error) throw error;
      return data || [];
    },
  });


  const { data: depositInvoices = [] } = useQuery({
    queryKey: ["finance-deposit-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deposit_invoices").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // Map: deposit_id -> billing rows
  const depositInvoiceMap = useMemo(() => {
    const billingById = new Map(billings.map((b) => [b.id, b]));
    const m = new Map<string, { row: any; billing?: Billing }[]>();
    for (const di of depositInvoices as any[]) {
      const arr = m.get(di.deposit_id) || [];
      arr.push({ row: di, billing: billingById.get(di.billing_id) });
      m.set(di.deposit_id, arr);
    }
    return m;
  }, [depositInvoices, billings]);

  // Set of billing ids already deposited (excluding cancelled)
  const usedBillingIds = useMemo(() => {
    const cancelled = new Set(
      (deposits as any[]).filter((d) => d.status === "Cancelled").map((d) => d.id)
    );
    const s = new Set<string>();
    for (const di of depositInvoices as any[]) {
      if (!cancelled.has(di.deposit_id)) s.add(di.billing_id);
    }
    return s;
  }, [depositInvoices, deposits]);

  // Stats
  const totalDeposited = (deposits as any[])
    .filter((d) => d.status === "Deposited")
    .reduce((a, d) => a + Number(d.deposit_amount || 0), 0);
  const pendingDeposits = (deposits as any[]).filter((d) => d.status === "Pending").length;
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const todaysAmt = (deposits as any[])
    .filter((d) => d.deposit_date === today && d.status === "Deposited")
    .reduce((a, d) => a + Number(d.deposit_amount || 0), 0);
  const monthAmt = (deposits as any[])
    .filter((d) => d.deposit_date >= monthStart && d.status === "Deposited")
    .reduce((a, d) => a + Number(d.deposit_amount || 0), 0);

  // Filters
  const [fDepositNo, setFDepositNo] = useState("");
  const [fInvoice, setFInvoice] = useState("");
  const [fDate, setFDate] = useState("");
  const [fBank, setFBank] = useState("");
  const [fMode, setFMode] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fSource, setFSource] = useState("all");

  const filtered = useMemo(() => {
    return (deposits as any[]).filter((d) => {
      if (fDepositNo && !d.deposit_no?.toLowerCase().includes(fDepositNo.toLowerCase())) return false;
      if (fDate && d.deposit_date !== fDate) return false;
      if (fBank && !d.bank_account?.toLowerCase().includes(fBank.toLowerCase())) return false;
      if (fMode !== "all" && d.deposit_mode !== fMode) return false;
      if (fStatus !== "all" && d.status !== fStatus) return false;
      if (fSource !== "all" && (d.source || "direct") !== fSource) return false;
      if (fInvoice) {
        const items = depositInvoiceMap.get(d.id) || [];
        const hasInv = items.some(
          (it) => it.billing?.invoice_number?.toLowerCase().includes(fInvoice.toLowerCase())
        );
        if (!hasInv) return false;
      }
      return true;
    });
  }, [deposits, fDepositNo, fInvoice, fDate, fBank, fMode, fStatus, fSource, depositInvoiceMap]);

  // Add / Edit dialog
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fDepositDate, setDepositDate] = useState(today);
  const [bankAccount, setBankAccount] = useState("");
  const [depositMode, setDepositMode] = useState("Cash");
  const [bankReference, setBankReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [depositedBy, setDepositedBy] = useState("");
  const [status, setStatus] = useState("Deposited");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualAmount, setManualAmount] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [existingSlip, setExistingSlip] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [source, setSource] = useState<string>("direct");
  // Bank & account details
  const [bankPick, setBankPick] = useState<string>("manual");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountType, setAccountType] = useState<string>("Current Account");
  const [branchName, setBranchName] = useState("");
  // Deposit way + channel details
  const [depositWay, setDepositWay] = useState<string>("bank_branch");
  const [depositBranchName, setDepositBranchName] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [drawerInfo, setDrawerInfo] = useState<
    { hasDay: boolean; expected: number; alreadyDeposited: number; available: number } | null
  >(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const resetForm = () => {
    setDepositDate(today);
    setBankAccount("");
    setDepositMode("Cash");
    setBankReference("");
    setRemarks("");
    setDepositedBy("");
    setStatus("Deposited");
    setSelectedIds(new Set());
    setManualAmount("");
    setSlipFile(null);
    setExistingSlip(null);
    setInvoiceSearch("");
    setSource("direct");
    setBankPick("manual");
    setAccountNumber("");
    setIfscCode("");
    setAccountType("Current Account");
    setBranchName("");
    setDepositWay("bank_branch");
    setDepositBranchName("");
    setChallanNumber("");
    setReferenceNumber("");
    setReferralCode("");

    setDrawerInfo(null);
    setEditing(null);
  };

  useEffect(() => {
    if (!addOpen) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen]);

  const openEdit = (d: any) => {
    setEditing(d);
    setDepositDate(d.deposit_date);
    setBankAccount(d.bank_account);
    setDepositMode(d.deposit_mode);
    setBankReference(d.bank_reference || "");
    setRemarks(d.remarks || "");
    setDepositedBy(d.deposited_by);
    setStatus(d.status);
    setSource(d.source || "direct");
    setBankPick("manual");
    setAccountNumber(d.account_number || "");
    setIfscCode(d.ifsc_code || "");
    setAccountType(d.account_type || "Current Account");
    setBranchName(d.bank_branch_name || "");
    setDepositWay(d.deposit_way || "bank_branch");
    setDepositBranchName(d.deposit_branch_name || "");
    setChallanNumber(d.challan_number || "");
    setReferenceNumber(d.reference_number || "");
    setReferralCode(d.referral_code || "");

    setExistingSlip(d.slip_path || null);
    setManualAmount(String(Number(d.deposit_amount || 0) || ""));
    setAddOpen(true);
  };

  // Picking a saved bank account fills the account fields (still editable).
  const handleBankPick = (val: string) => {
    setBankPick(val);
    if (val === "manual") return;
    const b: any = bankAccounts.find((x: any) => x.id === val);
    if (!b) return;
    const last4 = (b.account_number || "").slice(-4);
    setBankAccount(last4 ? `${b.bank_name} - ${last4}` : b.bank_name);
    setAccountNumber(b.account_number || "");
    setIfscCode((b.ifsc_code || "").toUpperCase());
    setBranchName(b.branch_name || "");
  };


  // Eligible invoices: fully paid, not already used (except those in editing deposit)
  const eligibleInvoices = useMemo(() => {
    const allowedSelectedExisting = editing ? new Set(selectedIds) : new Set<string>();
    return billings.filter((b) => {
      const paid = b.payment_status === "paid" && Number(b.amount_paid || 0) > 0;
      if (!paid) return false;
      if (usedBillingIds.has(b.id) && !allowedSelectedExisting.has(b.id)) return false;
      if (invoiceSearch) {
        const q = invoiceSearch.toLowerCase();
        if (
          !b.invoice_number?.toLowerCase().includes(q) &&
          !getPatientName(b.patient_id).toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [billings, usedBillingIds, invoiceSearch, editing, selectedIds, getPatientName]);

  const computedAmount = useMemo(() => {
    const value = Number(manualAmount);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [manualAmount]);

  // Physical cash available in the drawer for the chosen date:
  //   opening + cash collected − drawer expenses − drawer deposits already recorded
  // Read-only lookup; used purely to warn about over-depositing.
  useEffect(() => {
    if (!addOpen || source !== "cash_drawer" || !fDepositDate) {
      setDrawerInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDrawerLoading(true);
      const { data: dayRow } = await supabase
        .from("cash_drawer_days")
        .select("id, opening_total")
        .eq("drawer_date", fDepositDate)
        .maybeSingle();

      let drawerExpenses = 0;
      if (dayRow?.id) {
        const { data: exps } = await supabase
          .from("cash_drawer_expenses")
          .select("amount")
          .eq("drawer_day_id", dayRow.id);
        drawerExpenses = (exps || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      }

      const { data: pays } = await supabase
        .from("billing_payments")
        .select("amount, payment_method")
        .gte("payment_date", `${fDepositDate}T00:00:00`)
        .lte("payment_date", `${fDepositDate}T23:59:59`);
      const cashReceived = (pays || [])
        .filter((p: any) => (p.payment_method || "").toLowerCase().includes("cash"))
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      const alreadyDeposited = (deposits as any[])
        .filter(
          (d) =>
            (d.source || "direct") === "cash_drawer" &&
            (d.drawer_date || d.deposit_date) === fDepositDate &&
            d.status !== "Cancelled" &&
            (!editing || d.id !== editing.id)
        )
        .reduce((s, d) => s + Number(d.deposit_amount || 0), 0);

      const expected = Number(dayRow?.opening_total || 0) + cashReceived - drawerExpenses;
      if (cancelled) return;
      setDrawerInfo({
        hasDay: !!dayRow,
        expected,
        alreadyDeposited,
        available: expected - alreadyDeposited,
      });
      setDrawerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, source, fDepositDate, deposits, editing]);

  const overDeposit =
    source === "cash_drawer" && !!drawerInfo && computedAmount > drawerInfo.available + 0.01;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Save
  const handleSave = async () => {
    if (!fDepositDate || !bankAccount.trim() || !depositMode || !depositedBy.trim()) {
      toast({ title: "Missing fields", description: "Fill all mandatory fields.", variant: "destructive" });
      return;
    }
    if (depositWay === "bank_branch" && !challanNumber.trim()) {
      toast({ title: "Challan number required", description: "Enter the challan / counterfoil number for a bank branch deposit.", variant: "destructive" });
      return;
    }
    if (depositWay === "atm_cdm" && !referenceNumber.trim()) {
      toast({ title: "Reference number required", description: "Enter the machine / transaction reference number for an ATM / CDM deposit.", variant: "destructive" });
      return;
    }

    if (computedAmount <= 0) {
      toast({ title: "Amount required", description: "Enter the deposit amount.", variant: "destructive" });
      return;
    }
    if (!slipFile && !existingSlip) {
      toast({ title: "Slip required", description: "Please upload the deposit slip before saving.", variant: "destructive" });
      return;
    }
    if (slipFile && slipFile.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 10 MB allowed.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let slipPath = existingSlip;
      if (slipFile) {
        const ext = slipFile.name.split(".").pop() || "bin";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("deposit-slips").upload(path, slipFile, {
          contentType: slipFile.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        slipPath = path;
      }

      const payload = {
        deposit_date: fDepositDate,
        bank_account: bankAccount.trim(),
        deposit_mode: depositMode,
        bank_reference: bankReference.trim() || null,
        remarks: remarks.trim() || null,
        deposited_by: depositedBy.trim(),
        deposit_amount: computedAmount,
        status,
        slip_path: slipPath,
        source,
        drawer_date: source === "cash_drawer" ? fDepositDate : null,
        account_number: accountNumber.trim() || null,
        ifsc_code: ifscCode.trim().toUpperCase() || null,
        account_type: accountType || null,
        bank_branch_name: branchName.trim() || null,
        deposit_way: depositWay,
        deposit_branch_name: depositWay === "bank_branch" ? (depositBranchName.trim() || null) : null,
        challan_number: depositWay === "bank_branch" ? (challanNumber.trim() || null) : null,
        reference_number: depositWay === "atm_cdm" ? (referenceNumber.trim() || null) : null,
        referral_code: depositWay === "atm_cdm" ? (referralCode.trim() || null) : null,

      };

      let depositId: string;
      if (editing) {
        const { error } = await supabase.from("deposits").update(payload).eq("id", editing.id);
        if (error) throw error;
        depositId = editing.id;
      } else {
        const depositNo = `DEP-${format(new Date(), "yyyyMMdd")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const { data, error } = await supabase
          .from("deposits")
          .insert({ ...payload, deposit_no: depositNo })
          .select("id")
          .single();
        if (error) throw error;
        depositId = data.id;
      }

      void depositId;



      toast({ title: "Saved", description: editing ? "Deposit updated" : "Deposit recorded" });
      queryClient.invalidateQueries({ queryKey: ["finance-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["finance-deposit-invoices"] });
      setAddOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: any) => {
    if (!confirm(`Delete deposit ${d.deposit_no}?`)) return;
    try {
      const { error } = await supabase.from("deposits").delete().eq("id", d.id);
      if (error) throw error;
      if (d.slip_path) await supabase.storage.from("deposit-slips").remove([d.slip_path]);
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["finance-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["finance-deposit-invoices"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // View / Details dialog
  const [viewDep, setViewDep] = useState<any>(null);

  const downloadSlip = async (path?: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from("deposit-slips").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Error", description: "Could not fetch slip", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  // Export
  const handleExportExcel = () => {
    const rows = filtered.map((d: any) => {
      const items = depositInvoiceMap.get(d.id) || [];
      return {
        "Deposit No": d.deposit_no,
        "Deposit Date": d.deposit_date,
        "Bank Account": d.bank_account,
        "Deposit Mode": d.deposit_mode,
        "Source": sourceLabel(d.source),
        "Deposit Way": depositWayLabel(d.deposit_way),
        "Account Number": d.account_number || "",
        "IFSC": d.ifsc_code || "",
        "Challan No": d.challan_number || "",
        "Reference No": d.reference_number || "",
        "Bank Ref": d.bank_reference || "",

        "Invoices": items.length,
        "Invoice Numbers": items.map((i) => i.billing?.invoice_number || "").filter(Boolean).join(", "),
        "Deposit Amount": Number(d.deposit_amount || 0).toFixed(2),
        "Deposited By": d.deposited_by,
        "Status": d.status,
        "Remarks": d.remarks || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deposits");
    XLSX.writeFile(wb, `deposits_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const handleExportPDF = async () => {
    const doc = new jsPDF();
    const branding = await fetchClinicBranding();
    const headerEnd = await addClinicPdfHeader(doc, branding);
    doc.setFontSize(14);
    doc.text("DEPOSITS REPORT", doc.internal.pageSize.getWidth() - 14, headerEnd, { align: "right" });
    autoTable(doc, {
      head: [["No", "Date", "Bank", "Mode", "Source", "Way", "Invoices", "Amount", "By", "Status"]],
      body: filtered.map((d: any) => [
        d.deposit_no,
        d.deposit_date,
        d.bank_account,
        d.deposit_mode,
        sourceLabel(d.source),
        depositWayLabel(d.deposit_way),

        String((depositInvoiceMap.get(d.id) || []).length),
        fmt2(Number(d.deposit_amount || 0)),
        d.deposited_by,
        d.status,
      ]),
      startY: headerEnd + 6,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95] },
      margin: { bottom: 25 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });
    doc.save(`deposits_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const StatCard = ({ label, value, icon: Icon, color = "text-primary" }: any) => (
    <Card className="shadow-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-secondary ${color}`}><Icon size={18} /></div>
        <div>
          <p className="text-xl font-bold font-display">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Deposits" value={fmt2(totalDeposited)} icon={Landmark} color="text-success" />
        <StatCard label="Pending Deposits" value={pendingDeposits} icon={Clock} color="text-warning" />
        <StatCard label="Today's Deposits" value={fmt2(todaysAmt)} icon={CalendarDays} color="text-primary" />
        <StatCard label="This Month" value={fmt2(monthAmt)} icon={Wallet} color="text-primary" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h3 className="text-base font-semibold font-display flex items-center gap-2">
          <Landmark size={16} className="text-primary" /> Bank Deposits
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet size={14} className="mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText size={14} className="mr-1" /> PDF
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus size={14} className="mr-1" /> Add Deposit
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Input placeholder="Deposit No." value={fDepositNo} onChange={(e) => setFDepositNo(e.target.value)} />
          <Input placeholder="Invoice No." value={fInvoice} onChange={(e) => setFInvoice(e.target.value)} />
          <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
          <Input placeholder="Bank Account" value={fBank} onChange={(e) => setFBank(e.target.value)} />
          <Select value={fMode} onValueChange={setFMode}>
            <SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              {DEPOSIT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fSource} onValueChange={setFSource}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {DEPOSIT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deposit No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Deposit Way</TableHead>

                <TableHead className="text-center">Invoices</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Deposited By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">No deposits found</TableCell></TableRow>
              ) : (
                filtered.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.deposit_no}</TableCell>
                    <TableCell>{d.deposit_date}</TableCell>
                    <TableCell>{d.bank_account}</TableCell>
                    <TableCell>{d.deposit_mode}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          (d.source || "direct") === "cash_drawer"
                            ? "border-primary/40 text-primary"
                            : "text-muted-foreground"
                        }
                      >
                        {sourceLabel(d.source)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {d.deposit_way ? (
                        <Badge variant="outline" className="text-muted-foreground">{depositWayLabel(d.deposit_way)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{(depositInvoiceMap.get(d.id) || []).length}</TableCell>

                    <TableCell className="text-right font-mono">{fmt2(Number(d.deposit_amount || 0))}</TableCell>
                    <TableCell>{d.deposited_by}</TableCell>
                    <TableCell><Badge variant={statusVariant(d.status)}>{d.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => setViewDep(d)} title="View"><Eye size={14} /></Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(d)} title="Edit"><Upload size={14} /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(d)} title="Delete"><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Deposit" : "Add Deposit"}</DialogTitle>
            <DialogDescription>Record actual bank deposit and link the paid invoices included in it.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 1. Deposit Header */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deposit Header</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Deposit Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={fDepositDate} onChange={(e) => setDepositDate(e.target.value)} />
                </div>
                <div>
                  <Label>Deposited By <span className="text-destructive">*</span></Label>
                  <Input value={depositedBy} onChange={(e) => setDepositedBy(e.target.value)} placeholder="Staff name" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source <span className="text-destructive">*</span></Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPOSIT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {source === "cash_drawer" && (
                    <p className={`mt-1 text-xs ${overDeposit ? "text-destructive" : "text-muted-foreground"}`}>
                      {drawerLoading
                        ? "Checking drawer balance…"
                        : !drawerInfo
                          ? ""
                          : !drawerInfo.hasDay
                            ? `No drawer opening recorded for ${fDepositDate}. Available cash counted as ${fmt2(drawerInfo.available)}.`
                            : `Cash available in drawer on ${fDepositDate}: ${fmt2(drawerInfo.available)}` +
                              (drawerInfo.alreadyDeposited > 0
                                ? ` (${fmt2(drawerInfo.alreadyDeposited)} already remitted)`
                                : "")}
                    </p>
                  )}
                  {overDeposit && (
                    <p className="mt-1 text-xs text-destructive">
                      This deposit of {fmt2(computedAmount)} is more than the cash available in the drawer. You can still save it if this is a correction.
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Label>Remarks</Label>
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
                </div>
              </div>
            </div>

            {/* 2. Target Bank & Account Details */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Bank &amp; Account Details</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Saved Bank Account</Label>
                  <Select value={bankPick} onValueChange={handleBankPick}>
                    <SelectTrigger><SelectValue placeholder="Choose a saved bank account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Enter manually</SelectItem>
                      {bankAccounts.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bank Account <span className="text-destructive">*</span></Label>
                  <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. HDFC - 1234" />
                </div>
                <div>
                  <Label>Account Type</Label>
                  <Select value={accountType} onValueChange={setAccountType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bank Account Number</Label>
                  <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" />
                </div>
                <div>
                  <Label>Branch Name</Label>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Home branch" />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder="e.g. HDFC0001234"
                    className="uppercase"
                  />
                </div>
              </div>
            </div>

            {/* 3. Deposit Method & Channel Details */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deposit Method &amp; Channel Details</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Deposit Mode <span className="text-destructive">*</span></Label>
                  <Select value={depositMode} onValueChange={setDepositMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPOSIT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Deposit Way <span className="text-destructive">*</span></Label>
                  <Select value={depositWay} onValueChange={setDepositWay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPOSIT_WAYS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bank Reference / UTR</Label>
                  <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
                </div>

                {depositWay === "bank_branch" ? (
                  <>
                    <div>
                      <Label>Deposit Branch Name</Label>
                      <Input value={depositBranchName} onChange={(e) => setDepositBranchName(e.target.value)} placeholder="Branch where cash was deposited" />
                    </div>
                    <div>
                      <Label>Challan / Counterfoil Number <span className="text-destructive">*</span></Label>
                      <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} placeholder="Challan number" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Label>ATM / Machine Location</Label>
                      <Input value={depositBranchName} onChange={(e) => setDepositBranchName(e.target.value)} placeholder="Machine location / branch" />
                    </div>
                    <div>
                      <Label>Machine / Transaction Reference Number <span className="text-destructive">*</span></Label>
                      <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Reference number" />
                    </div>
                    <div>
                      <Label>Referral / Staff Reference Code</Label>
                      <Input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="Optional" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Slip upload */}
            <div className="rounded-lg border border-border p-3">
              <Label>
                {depositWay === "bank_branch" ? "Challan Copy" : "Deposit Slip / ATM Receipt"}{" "}
                <span className="text-destructive">*</span>{" "}
                <span className="text-xs text-muted-foreground">(PDF/JPG/PNG, max 10 MB)</span>
              </Label>

              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
              {existingSlip && !slipFile && (
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                  Current slip on file.
                  <Button type="button" size="sm" variant="link" className="h-auto p-0" onClick={() => downloadSlip(existingSlip)}>View</Button>
                </div>
              )}
            </div>

            {/* Deposit amount */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <Label className="text-sm">Deposit Amount <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Enter deposit amount"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
              />
              <div className="text-base font-bold font-display">Total: {fmt2(computedAmount)}</div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Deposit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewDep} onOpenChange={(o) => !o && setViewDep(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewDep && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Landmark size={18} className="text-primary" /> Deposit {viewDep.deposit_no}
                </DialogTitle>
                <DialogDescription>Deposit details and linked invoices</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div><span className="text-muted-foreground">Date:</span> {viewDep.deposit_date}</div>
                  <div><span className="text-muted-foreground">Bank Account:</span> {viewDep.bank_account}</div>
                  <div><span className="text-muted-foreground">Deposit Mode:</span> {viewDep.deposit_mode}</div>
                  <div>
                    <span className="text-muted-foreground">Source:</span>{" "}
                    <Badge variant="outline" className={(viewDep.source || "direct") === "cash_drawer" ? "border-primary/40 text-primary" : "text-muted-foreground"}>
                      {sourceLabel(viewDep.source)}
                    </Badge>
                  </div>
                  <div><span className="text-muted-foreground">Deposited By:</span> {viewDep.deposited_by}</div>
                  <div><span className="text-muted-foreground">Bank Ref / UTR:</span> {viewDep.bank_reference || "—"}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(viewDep.status)}>{viewDep.status}</Badge></div>
                  <div><span className="text-muted-foreground">Account Type:</span> {viewDep.account_type || "—"}</div>
                  <div><span className="text-muted-foreground">Account Number:</span> {viewDep.account_number || "—"}</div>
                  <div><span className="text-muted-foreground">Branch:</span> {viewDep.bank_branch_name || "—"}</div>
                  <div><span className="text-muted-foreground">IFSC:</span> {viewDep.ifsc_code || "—"}</div>
                  <div><span className="text-muted-foreground">Deposit Way:</span> {depositWayLabel(viewDep.deposit_way)}</div>
                  {viewDep.deposit_way === "atm_cdm" ? (
                    <>
                      <div><span className="text-muted-foreground">ATM / Machine Location:</span> {viewDep.deposit_branch_name || "—"}</div>
                      <div><span className="text-muted-foreground">Machine / Txn Reference:</span> {viewDep.reference_number || "—"}</div>
                      <div><span className="text-muted-foreground">Referral / Staff Code:</span> {viewDep.referral_code || "—"}</div>
                    </>
                  ) : (
                    <>
                      <div><span className="text-muted-foreground">Deposit Branch:</span> {viewDep.deposit_branch_name || "—"}</div>
                      <div><span className="text-muted-foreground">Challan / Counterfoil No:</span> {viewDep.challan_number || "—"}</div>
                    </>
                  )}
                  {viewDep.remarks && <div className="sm:col-span-2"><span className="text-muted-foreground">Remarks:</span> {viewDep.remarks}</div>}

                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Invoices in this deposit</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(depositInvoiceMap.get(viewDep.id) || []).map((it) => (
                        <TableRow key={it.row.id}>
                          <TableCell className="font-mono text-xs">{it.billing?.invoice_number || it.row.billing_id.slice(0, 8)}</TableCell>
                          <TableCell>{it.billing ? getPatientName(it.billing.patient_id) : "—"}</TableCell>
                          <TableCell className="text-xs">{it.billing?.payment_method || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{fmt2(Number(it.row.amount || 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end mt-2 pt-2 border-t border-border">
                    <span className="font-semibold">Total: {fmt2(Number(viewDep.deposit_amount || 0))}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-sm">Deposit Slip</span>
                  <Button size="sm" variant="outline" onClick={() => downloadSlip(viewDep.slip_path)} disabled={!viewDep.slip_path}>
                    <Download size={14} className="mr-1" /> Download Slip
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
