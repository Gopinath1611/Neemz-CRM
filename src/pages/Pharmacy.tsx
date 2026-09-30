import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Pill, Search, CalendarIcon, Eye, User, FileText, IndianRupee, Download, TrendingUp, Package, Link2 } from "lucide-react";
import { formatPatientCode } from "@/lib/patientCode";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import MedicineInventoryMapping from "@/components/pharmacy/MedicineInventoryMapping";


type DatePreset = "all" | "today" | "week" | "month" | "custom";
type PaymentStatusLabel = "Paid" | "Partial" | "Pending" | "Not Generated";
type PaymentFilter = "all" | "Paid" | "Partial" | "Pending" | "Not Generated";

// Billed medicine-only totals for one visit (checkin) or patient.
type BilledMedicines = { total: number; items: Record<string, { name: string; qty: number; amount: number }> };

// Pharmacy payment status is judged on the medicine portion of the bill only.
const derivePharmacyStatus = (medTotal: number, paid: number, hasBill: boolean): PaymentStatusLabel => {
  if (!hasBill || !medTotal || medTotal <= 0) return "Not Generated";
  if (paid <= 0) return "Pending";
  if (paid + 0.5 < medTotal) return "Partial";
  return "Paid";
};

type MedSortKey = "qty" | "amount" | "name";

// Display-only doctor name normalization (no DB writes)
const normalizeDoctorName = (raw?: string | null): string => {
  if (!raw) return "";
  let n = String(raw).trim();
  if (!n) return "";
  // Hardcoded fixes for known bad records
  if (/^dr\.?\s*n\.?\s*sadham\s+hussain$/i.test(n)) return "Dr. N. Sadham Hussain";
  if (/^vithyas+ree$/i.test(n)) return "Dr. Vithyas Stree";
  // Ensure space after "Dr."
  n = n.replace(/^dr\.?\s*/i, "Dr. ");
  // Ensure space after single-letter initials like "N." or "X.Y" -> "X. Y"
  n = n.replace(/\b([A-Za-z])\.(?=[A-Za-z])/g, "$1. ");
  return n.replace(/\s+/g, " ").trim();
};

const Pharmacy = () => {
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [patients, setPatients] = useState<Record<string, { name: string; code: number | null; phone: string }>>({});
  const [paymentMap, setPaymentMap] = useState<Record<string, { status: PaymentStatusLabel; paid: number; total: number; billNumbers: string[]; hasBill: boolean }>>({});
  const [billedMedMap, setBilledMedMap] = useState<Record<string, BilledMedicines>>({});

  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [tab, setTab] = useState<"prescriptions" | "medicines">("prescriptions");
  const [medSearch, setMedSearch] = useState("");
  const [medSort, setMedSort] = useState<MedSortKey>("qty");
  const [medPage, setMedPage] = useState(1);
  const [medPageSize, setMedPageSize] = useState(10);

  const fetchPrescriptions = async () => {
    const { data } = await supabase
      .from("prescriptions")
      .select("*, prescription_items(*)")
      .order("created_at", { ascending: false });
    if (data) {
      const relevantCheckinIds = Array.from(new Set(data.map((rx: any) => rx.checkin_id).filter(Boolean)));
      const relevantPids = Array.from(new Set(data.map((rx: any) => rx.patient_id).filter(Boolean)));
      const diagMap: Record<string, string> = {};
      const docMap: Record<string, string> = {};
      if (relevantCheckinIds.length > 0) {
        const chunk = 200;
        for (let i = 0; i < relevantCheckinIds.length; i += chunk) {
          const slice = relevantCheckinIds.slice(i, i + chunk);
          const { data: plans } = await supabase
            .from("treatment_plans")
            .select("checkin_id, diagnosis, doctor, created_at")
            .in("checkin_id", slice)
            .order("created_at", { ascending: false });
          (plans || []).forEach((p: any) => {
            if (p.checkin_id && p.diagnosis && !diagMap[p.checkin_id]) diagMap[p.checkin_id] = p.diagnosis;
            if (p.checkin_id && p.doctor && !docMap[p.checkin_id]) docMap[p.checkin_id] = p.doctor;
          });
        }
      }

      if (relevantPids.length > 0) {
        const chunk = 200;
        for (let i = 0; i < relevantPids.length; i += chunk) {
          const slice = relevantPids.slice(i, i + chunk);
          const { data: plans } = await supabase
            .from("treatment_plans")
            .select("patient_id, diagnosis, doctor, created_at")
            .in("patient_id", slice)
            .order("created_at", { ascending: false });
          (plans || []).forEach((p: any) => {
            if (p.patient_id && p.diagnosis && !diagMap[p.patient_id]) diagMap[p.patient_id] = p.diagnosis;
            if (p.patient_id && p.doctor && !docMap[p.patient_id]) docMap[p.patient_id] = p.doctor;
          });
        }
      }
      const enriched = data.map((rx: any) => ({
        ...rx,
        diagnosis:
          rx.diagnosis && String(rx.diagnosis).trim() !== ""
            ? rx.diagnosis
            : (diagMap[rx.checkin_id] || diagMap[rx.patient_id] || ""),
        doctor: docMap[rx.checkin_id] || (rx.doctor && String(rx.doctor).trim() !== "" ? rx.doctor : (docMap[rx.patient_id] || "")),
      }));
      setPrescriptions(enriched);

      const ids = Array.from(new Set(enriched.map((rx: any) => rx.patient_id).filter(Boolean))) as string[];
      const checkinIds = Array.from(new Set(enriched.map((rx: any) => rx.checkin_id).filter(Boolean))) as string[];
      await fetchPatients(ids);
      await fetchPaymentStatus(ids, checkinIds);
    }
  };

  const fetchPatients = async (ids?: string[]) => {
    const map: Record<string, { name: string; code: number | null; phone: string }> = {};
    if (ids && ids.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { data } = await supabase
          .from("patients")
          .select("id, first_name, last_name, patient_code, phone")
          .in("id", slice);
        (data || []).forEach((p: any) => {
          map[p.id] = {
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown",
            code: p.patient_code,
            phone: String(p.phone ?? ""),
          };
        });
      }
    }
    setPatients(map);
  };

  const fetchPaymentStatus = async (ids: string[], checkinIds: string[] = []) => {
    const map: Record<string, { status: PaymentStatusLabel; paid: number; total: number; billNumbers: string[]; hasBill: boolean }> = {};
    const medMap: Record<string, BilledMedicines> = {};
    if ((!ids || ids.length === 0) && (!checkinIds || checkinIds.length === 0)) {
      setPaymentMap(map);
      setBilledMedMap(medMap);
      return;
    }

    const deriveStatus = (total: number, paid: number): PaymentStatusLabel => {
      if (total <= 0) return "Not Generated";
      if (paid <= 0) return "Pending";
      if (paid < total) return "Partial";
      return "Paid";
    };

    const chunkSize = 200;

    // Billing ids collected here so medicine-only line items can be aggregated below.
    const billingOwner: Record<string, { checkinId?: string | null; patientId?: string | null }> = {};

    // 1. Per-visit billings (primary source — same record Clinic Workflow uses)
    const checkinAgg: Record<string, { total: number; paid: number; billNumbers: string[] }> = {};
    for (let i = 0; i < checkinIds.length; i += chunkSize) {
      const slice = checkinIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("billings")
        .select("id, checkin_id, patient_id, total_amount, amount_paid, payment_status, invoice_number")
        .in("checkin_id", slice);
      (data || []).forEach((b: any) => {
        const cid = b.checkin_id;
        if (!cid) return;
        billingOwner[b.id] = { checkinId: cid, patientId: b.patient_id };
        if (!checkinAgg[cid]) checkinAgg[cid] = { total: 0, paid: 0, billNumbers: [] };
        checkinAgg[cid].total += Number(b.total_amount || 0);
        checkinAgg[cid].paid += Number(b.amount_paid || 0);
        if (b.invoice_number) checkinAgg[cid].billNumbers.push(String(b.invoice_number));
      });
    }
    Object.entries(checkinAgg).forEach(([cid, a]) => {
      map[cid] = { status: deriveStatus(a.total, a.paid), paid: a.paid, total: a.total, billNumbers: a.billNumbers, hasBill: true };
    });

    // 2. Patient-level fallback — only the LATEST billing per patient (by created_at)
    const patientLatest: Record<string, any> = {};
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("billings")
        .select("id, patient_id, total_amount, amount_paid, payment_status, invoice_number, created_at")
        .in("patient_id", slice)
        .order("created_at", { ascending: false });
      (data || []).forEach((b: any) => {
        const pid = b.patient_id;
        if (!pid) return;
        if (!patientLatest[pid]) patientLatest[pid] = b;
      });
    }
    ids.forEach((pid) => {
      const b = patientLatest[pid];
      if (!b) {
        map[pid] = { status: "Not Generated", paid: 0, total: 0, billNumbers: [], hasBill: false };
        return;
      }
      if (!billingOwner[b.id]) billingOwner[b.id] = { checkinId: null, patientId: pid };
      const total = Number(b.total_amount || 0);
      const paid = Number(b.amount_paid || 0);
      map[pid] = {
        status: deriveStatus(total, paid),
        paid,
        total,
        billNumbers: b.invoice_number ? [String(b.invoice_number)] : [],
        hasBill: true,
      };
    });

    // 3. Medicine-only line items from those bills — the single source of truth for
    //    pharmacy money. Treatment/procedure lines are excluded by the type filter.
    const billingIds = Object.keys(billingOwner);
    const addLine = (key: string, name: string, qty: number, amount: number) => {
      if (!medMap[key]) medMap[key] = { total: 0, items: {} };
      medMap[key].total += amount;
      const nk = name.toLowerCase();
      if (!medMap[key].items[nk]) medMap[key].items[nk] = { name, qty: 0, amount: 0 };
      medMap[key].items[nk].qty += qty;
      medMap[key].items[nk].amount += amount;
    };
    for (let i = 0; i < billingIds.length; i += chunkSize) {
      const slice = billingIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("billing_items")
        .select("billing_id, description, quantity, unit_price, total_price, treatment_type")
        .in("billing_id", slice)
        .ilike("treatment_type", "medicine"); // case-insensitive — never miss Medicine/medicine/MEDICINE rows
      (data || []).forEach((li: any) => {
        const owner = billingOwner[li.billing_id];
        if (!owner) return;
        const qty = Number(li.quantity || 1);
        const amount = Number(li.total_price ?? 0) || Number(li.unit_price || 0) * qty;
        const name = String(li.description || "").split(" (")[0].trim() || "Medicine";
        if (owner.checkinId) addLine(owner.checkinId, name, qty, amount);
        if (owner.patientId) addLine(owner.patientId, name, qty, amount);
      });
    }

    setPaymentMap(map);
    setBilledMedMap(medMap);
  };


  const fetchPrices = async () => {
    const { data: meds } = await supabase.from("medicines").select("name, inventory_item_id");
    const { data: inv } = await supabase.from("inventory_items").select("id, selling_price, cost_price");
    const invMap: Record<string, number> = {};
    (inv || []).forEach((i: any) => {
      invMap[i.id] = Number(i.selling_price || i.cost_price || 0);
    });
    const pmap: Record<string, number> = {};
    (meds || []).forEach((m: any) => {
      const price = m.inventory_item_id ? invMap[m.inventory_item_id] || 0 : 0;
      pmap[m.name.toLowerCase()] = price;
    });
    setPriceMap(pmap);
  };

  useEffect(() => {
    fetchPrescriptions();
    fetchPrices();
  }, []);

  // Refresh payment status when the tab/window regains focus or visibility,
  // so payments recorded in Clinic Workflow show up here immediately.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") fetchPrescriptions();
    };
    const onFocus = () => fetchPrescriptions();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", onFocus);

    // Realtime sync with billings & billing_payments
    const channel = supabase
      .channel("pharmacy-billing-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "billings" }, () => fetchPrescriptions())
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_payments" }, () => fetchPrescriptions())
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, []);

  // Billed medicine-only figures for a patient group (visit bill first, patient bill fallback).
  const billedFor = (g: any): BilledMedicines | undefined =>
    (g?.latest_checkin_id ? billedMedMap[g.latest_checkin_id] : undefined) || billedMedMap[g?.patient_id];
  const payFor = (g: any) => (g?.latest_checkin_id && paymentMap[g.latest_checkin_id]) || paymentMap[g?.patient_id];
  // Cost column = sum of medicine bill lines ONLY. Unbilled prescriptions return null
  // (rendered as "—") — no duration × frequency estimation, which inflated non-tablet items.
  const medCostFor = (g: any): number | null => {
    const b = billedFor(g);
    if (b && b.total > 0) return b.total;
    if (payFor(g)?.hasBill) return 0; // billed, but no medicine lines
    return null; // not billed yet — amount unknown until checkout
  };
  const statusFor = (g: any): PaymentStatusLabel => {
    const b = billedFor(g);
    const pay = payFor(g);
    return derivePharmacyStatus(b?.total || 0, pay?.paid || 0, !!pay?.hasBill);
  };


  // Group prescriptions by patient
  const grouped = useMemo(() => {
    const map: Record<string, any> = {};
    prescriptions.forEach((rx) => {
      const pid = rx.patient_id;
      if (!map[pid]) {
        map[pid] = {
          patient_id: pid,
          latest_checkin_id: rx.checkin_id || null,
          prescriptions: [],
          items: [],
          latest_date: rx.created_at,
          doctors: new Set<string>(),
          diagnoses: new Set<string>(),
          total_cost: 0,
        };
      }
      map[pid].prescriptions.push(rx);
      (rx.prescription_items || []).forEach((it: any) => {
        map[pid].items.push({ ...it, prescription_date: rx.created_at, prescription_doctor: rx.doctor });
      });
      if (new Date(rx.created_at) > new Date(map[pid].latest_date)) {
        map[pid].latest_date = rx.created_at;
        if (rx.checkin_id) map[pid].latest_checkin_id = rx.checkin_id;
      }
      if (rx.doctor) map[pid].doctors.add(normalizeDoctorName(rx.doctor));
      if (rx.diagnosis) map[pid].diagnoses.add(rx.diagnosis);
    });
    return Object.values(map).sort((a: any, b: any) => new Date(b.latest_date).getTime() - new Date(a.latest_date).getTime());
  }, [prescriptions, priceMap]);

  const filtered = useMemo(() => {
    const q = search.trim();
    const qLower = q.toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return grouped.filter((g: any) => {
      const patient = patients[g.patient_id];
      const pay = payFor(g);
      const payStatus: PaymentStatusLabel = statusFor(g);


      let matchSearch = true;
      if (q) {
        const nameMatch = !!patient?.name?.toLowerCase().includes(qLower);
        // Patient ID: partial match against raw numeric code AND formatted code (PT0007 / UHID)
        const rawCode = patient?.code != null ? String(patient.code) : "";
        const formattedCode = formatPatientCode(patient?.code);
        const idMatch =
          (!!qDigits && rawCode.includes(qDigits)) ||
          formattedCode.toLowerCase().includes(qLower);
        // Mobile: digit substring match
        const phoneDigits = (patient?.phone || "").replace(/\D/g, "");
        const phoneMatch = !!qDigits && phoneDigits.length > 0 && phoneDigits.includes(qDigits);
        const phoneRawMatch = !!patient?.phone && patient.phone.toLowerCase().includes(qLower);
        // Bill / invoice number substring
        const billMatch = (pay?.billNumbers || []).some((bn) => bn.toLowerCase().includes(qLower));
        const diagMatch = Array.from(g.diagnoses).some((d: any) => d?.toLowerCase().includes(qLower));
        const docMatch = Array.from(g.doctors).some((d: any) => d?.toLowerCase().includes(qLower));
        const statusMatch = payStatus.toLowerCase().includes(qLower);
        const rxNumberMatch = (g.prescriptions || []).some((rx: any) =>
          String(rx.id || "").toLowerCase().includes(qLower)
        );
        matchSearch = !!(
          nameMatch || idMatch || phoneMatch || phoneRawMatch ||
          billMatch || diagMatch || docMatch || statusMatch || rxNumberMatch
        );
      }

      if (!matchSearch) return false;

      if (paymentFilter !== "all" && payStatus !== paymentFilter) return false;


      const rxDate = new Date(g.latest_date);
      const now = new Date();

      switch (datePreset) {
        case "today":
          return isWithinInterval(rxDate, { start: startOfDay(now), end: endOfDay(now) });
        case "week":
          return isWithinInterval(rxDate, { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
        case "month":
          return isWithinInterval(rxDate, { start: startOfMonth(now), end: endOfMonth(now) });
        case "custom":
          if (customFrom && customTo) {
            return isWithinInterval(rxDate, { start: startOfDay(customFrom), end: endOfDay(customTo) });
          }
          if (customFrom) return rxDate >= startOfDay(customFrom);
          if (customTo) return rxDate <= endOfDay(customTo);
          return true;
        default:
          return true;
      }
    });
  }, [grouped, patients, paymentMap, billedMedMap, search, datePreset, customFrom, customTo, paymentFilter]);

  const totalPatients = filtered.length;
  const pagedFiltered = usePagedSlice(filtered as any[], page, pageSize);
  const todayCount = grouped.filter((g: any) => {
    const d = new Date(g.latest_date);
    const now = new Date();
    return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(now) });
  }).length;
  const totalMedicines = filtered.reduce((sum, g: any) => sum + g.items.length, 0);
  const totalCost = filtered.reduce((sum, g: any) => sum + (medCostFor(g) ?? 0), 0);
  const todayCost = grouped
    .filter((g: any) => {
      const d = new Date(g.latest_date);
      const now = new Date();
      return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(now) });
    })
    .reduce((sum, g: any) => sum + (medCostFor(g) ?? 0), 0);

  // Medicine-wise Sales aggregation — billed medicine lines first, estimate only when unbilled
  const medicineSales = useMemo(() => {
    const m: Record<string, { name: string; qty: number; amount: number; lastDate: string }> = {};
    const add = (name: string, qty: number, amount: number, date: string) => {
      const rawName = (name || "").trim();
      if (!rawName) return;
      const key = rawName.toLowerCase();
      if (!m[key]) m[key] = { name: rawName, qty: 0, amount: 0, lastDate: date };
      m[key].qty += qty;
      m[key].amount += amount;
      if (new Date(date) > new Date(m[key].lastDate)) m[key].lastDate = date;
    };
    filtered.forEach((g: any) => {
      const billed = billedFor(g);
      if (billed && billed.total > 0) {
        Object.values(billed.items).forEach((li) => add(li.name, li.qty, li.amount, g.latest_date));
        return;
      }
      // Unbilled prescriptions are excluded — no estimated sales from duration × frequency.
      if (!payFor(g)?.hasBill) return;
    });
    const arr = Object.values(m);
    const q = medSearch.trim().toLowerCase();
    const filteredArr = q ? arr.filter((x) => x.name.toLowerCase().includes(q)) : arr;
    filteredArr.sort((a, b) => {
      if (medSort === "name") return a.name.localeCompare(b.name);
      if (medSort === "amount") return b.amount - a.amount;
      return b.qty - a.qty;
    });
    return filteredArr;
  }, [filtered, billedMedMap, paymentMap, medSearch, medSort, priceMap]);


  const pagedMedSales = usePagedSlice(medicineSales as any[], medPage, medPageSize);
  const totalMedQty = medicineSales.reduce((s, x) => s + x.qty, 0);
  const totalMedRevenue = medicineSales.reduce((s, x) => s + x.amount, 0);
  const bestSelling = medicineSales[0]?.name || "—";

  const exportMedicineSalesCSV = () => {
    const headers = ["Medicine Name", "Quantity Sold", "Total Sales Amount", "Last Sold Date"];
    const rows = medicineSales.map((m) => [
      `"${m.name.replace(/"/g, '""')}"`,
      m.qty,
      Math.round(m.amount),
      format(new Date(m.lastDate), "dd-MM-yyyy"),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medicine-wise-sales-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  const openDetail = (group: any) => {
    setSelectedGroup(group);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Pill className="h-7 w-7 text-primary" />
            Pharmacy
          </h1>
          <p className="text-muted-foreground mt-1">All prescriptions grouped by patient</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMappingOpen(true)}>
            <Link2 className="h-4 w-4 mr-1" /> Inventory Mapping
          </Button>
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[130px]">

              <CalendarIcon className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {datePreset === "custom" && (
            <>
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {customFrom ? format(customFrom, "dd MMM yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customFrom}
                    onSelect={(d) => { setCustomFrom(d); setFromOpen(false); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {customTo ? format(customTo, "dd MMM yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customTo}
                    onSelect={(d) => { setCustomTo(d); setToOpen(false); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </>
          )}
          <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as PaymentFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Payment Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Not Generated">Not Generated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Patients</p>
              <p className="text-xl font-bold text-foreground">{totalPatients}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10"><Pill className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Today's Patients</p>
              <p className="text-xl font-bold text-foreground">{todayCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10"><Pill className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Medicines</p>
              <p className="text-xl font-bold text-foreground">{totalMedicines}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10"><IndianRupee className="h-5 w-5 text-accent" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Cost{datePreset === "all" ? "" : ` (Today: ₹${todayCost.toLocaleString()})`}</p>
              <p className="text-xl font-bold text-foreground">₹{totalCost.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="medicines">Medicine-wise Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="prescriptions" className="space-y-4 mt-0">
          {/* Search */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient ID, name, mobile, bill no, doctor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>


      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Last Date</TableHead>
                <TableHead>Patient ID</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Medicines</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No pharmacy records found.
                  </TableCell>
                </TableRow>
              ) : (
                pagedFiltered.map((g: any, idx: number) => {
                  const patient = patients[g.patient_id];
                  const medCount = g.items.length;
                  const doctor = Array.from(g.doctors).filter(Boolean).join(", ") || "—";
                  const serial = (page - 1) * pageSize + idx + 1;
                  const pay = payFor(g);
                  const payStatus: PaymentStatusLabel = statusFor(g);

                  const payVariant =
                    payStatus === "Paid" ? "default" : payStatus === "Partial" || payStatus === "Pending" ? "secondary" : "outline";
                  const payClass =
                    payStatus === "Paid"
                      ? "bg-success/15 text-success border-success/30"
                      : payStatus === "Partial"
                      ? "bg-info/15 text-info border-info/30"
                      : payStatus === "Pending"
                      ? "bg-warning/15 text-warning border-warning/30"
                      : "bg-muted text-muted-foreground";
                  return (
                    <TableRow key={g.patient_id} className="hover:bg-secondary/30 cursor-pointer" onClick={() => openDetail(g)}>
                      <TableCell className="text-sm font-medium text-muted-foreground">{serial}</TableCell>
                      <TableCell className="text-sm">{format(new Date(g.latest_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {formatPatientCode(patient?.code)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          className="text-sm font-medium text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/clinic-workflow/${g.patient_id}?step=prescription`);
                          }}
                        >
                          {patient?.name || "Unknown"}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{doctor}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="text-xs cursor-default">
                                {medCount} medicine{medCount !== 1 ? "s" : ""}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start" className="max-w-sm max-h-80 overflow-auto">
                              <p className="text-xs font-semibold mb-2 text-muted-foreground">Medicines ({medCount})</p>
                              {medCount === 0 ? (
                                <p className="text-xs text-muted-foreground">No medicines available</p>
                              ) : (
                                <ul className="text-sm leading-relaxed space-y-1">
                                  {g.items.map((it: any, i: number) => (
                                    <li key={i}>{it.medicine_name || "—"}</li>
                                  ))}
                                </ul>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">{medCostFor(g) == null ? "—" : `₹${Math.round(medCostFor(g) as number).toLocaleString()}`}</TableCell>
                      <TableCell>
                        <Badge variant={payVariant as any} className={cn("text-xs", payClass)}>{payStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDetail(g); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="prescriptions" />
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="medicines" className="space-y-4 mt-0">
          {/* Medicine-wise Sales summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Package className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Medicines Sold</p>
                  <p className="text-xl font-bold text-foreground">{medicineSales.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10"><Pill className="h-5 w-5 text-warning" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Quantity</p>
                  <p className="text-xl font-bold text-foreground">{totalMedQty.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10"><IndianRupee className="h-5 w-5 text-accent" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Pharmacy Revenue</p>
                  <p className="text-xl font-bold text-foreground">₹{Math.round(totalMedRevenue).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10"><TrendingUp className="h-5 w-5 text-success" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Best Selling</p>
                  <p className="text-sm font-bold text-foreground truncate" title={bestSelling}>{bestSelling}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Medicine controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search medicine name..."
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={medSort} onValueChange={(v) => setMedSort(v as MedSortKey)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qty">Highest Quantity Sold</SelectItem>
                <SelectItem value="amount">Highest Sales Amount</SelectItem>
                <SelectItem value="name">Medicine Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportMedicineSalesCSV} disabled={medicineSales.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Medicine Name</TableHead>
                    <TableHead className="text-right">Quantity Sold</TableHead>
                    <TableHead className="text-right">Total Sales Amount</TableHead>
                    <TableHead>Last Sold Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medicineSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        No medicine sales found
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedMedSales.map((m: any, idx: number) => (
                      <TableRow key={m.name}>
                        <TableCell className="text-sm text-muted-foreground">{(medPage - 1) * medPageSize + idx + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{m.name}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{m.qty.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">₹{Math.round(m.amount).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{format(new Date(m.lastDate), "dd-MM-yyyy")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination page={medPage} pageSize={medPageSize} total={medicineSales.length} onPageChange={setMedPage} onPageSizeChange={setMedPageSize} label="medicines" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>




      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              Patient Prescription Details
            </DialogTitle>
          </DialogHeader>
          {selectedGroup && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Patient</p>
                  <p className="font-medium">{patients[selectedGroup.patient_id]?.name || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Patient ID</p>
                  <p className="font-medium">{formatPatientCode(patients[selectedGroup.patient_id]?.code)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Doctor(s)</p>
                  <p className="font-medium">{Array.from(selectedGroup.doctors).join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Visit</p>
                  <p className="font-medium">{format(new Date(selectedGroup.latest_date), "dd MMM yyyy, hh:mm a")}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Diagnosis</p>
                  <p className="font-medium">{Array.from(selectedGroup.diagnoses).join(", ") || "—"}</p>
                </div>
                <div className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-accent/5">
                  <span className="text-sm font-medium">Total Cost</span>
                  <span className="text-base font-bold text-accent">{medCostFor(selectedGroup) == null ? "— (not billed yet)" : `₹${Math.round(medCostFor(selectedGroup) as number).toLocaleString()}`}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Medicines ({selectedGroup.items.length})</h4>
                <div className="space-y-2">
                  {selectedGroup.items.map((item: any, idx: number) => {
                    const billedLine = billedFor(selectedGroup)?.items[(item.medicine_name || "").trim().toLowerCase()];
                    const cost = billedLine ? billedLine.amount : payFor(selectedGroup)?.hasBill ? 0 : null;

                    return (
                      <Card key={item.id || idx}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{item.medicine_name}</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {item.dosage && <Badge variant="outline" className="text-xs">{item.dosage}</Badge>}
                                {item.frequency && <Badge variant="outline" className="text-xs">{item.frequency}</Badge>}
                                {item.duration && <Badge variant="outline" className="text-xs">{item.duration}</Badge>}
                              </div>
                              {item.instructions && (
                                <p className="text-xs text-muted-foreground mt-1">{item.instructions}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(item.prescription_date), "dd MMM yyyy")}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant="secondary" className="text-xs mb-1">#{idx + 1}</Badge>
                              <p className="text-sm font-semibold">{cost == null ? "—" : `₹${Math.round(cost).toLocaleString()}`}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {selectedGroup.items.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No medicines</p>
                  )}
                </div>
              </div>

              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setDetailOpen(false);
                  navigate(`/clinic-workflow/${selectedGroup.patient_id}?step=prescription`);
                }}
              >
                <User className="h-4 w-4 mr-2" /> Open in Clinic Workflow
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MedicineInventoryMapping open={mappingOpen} onOpenChange={setMappingOpen} />
    </div>
  );

};

export default Pharmacy;
