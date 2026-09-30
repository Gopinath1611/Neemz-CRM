import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdvancedDateRangeFilter } from "@/components/common/AdvancedDateRangeFilter";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import AdSpendManager, { AdSpendRow } from "@/components/reports/AdSpendManager";
import {
  IndianRupee, Users, CalendarCheck, Footprints, Stethoscope, Calculator,
  TrendingUp, Percent, Search, RefreshCw, Info, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const CHUNK = 1000;

async function fetchAllRows<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(from, from + CHUNK - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const pctText = (part: number, whole: number) => (whole > 0 ? `${pct(part, whole).toFixed(1)}%` : "—");
const last10 = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);

const isHiringCampaign = (name: string) => {
  const n = name.toLowerCase();
  return n.includes("hiring") || n.includes("recruitment") || n.includes("job");
};

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

type Platform = "Meta" | "Google" | "Web" | "Offline" | "Other";

const platformOf = (source?: string | null): Platform => {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "Meta";
  if (s.includes("google") || s.includes("adwords")) return "Google";
  if (s.includes("camp") || s.includes("offline") || s.includes("seminar") || s.includes("walk")) return "Offline";
  if (s.includes("web") || s.includes("seo") || s.includes("site") || s.includes("form")) return "Web";
  return "Other";
};

const PLATFORM_STYLE: Record<Platform, string> = {
  Meta: "border-blue-500/40 text-blue-600",
  Google: "border-amber-500/40 text-amber-600",
  Web: "border-emerald-500/40 text-emerald-600",
  Offline: "border-purple-500/40 text-purple-600",
  Other: "text-muted-foreground",
};

type Lead = {
  id: string; name: string | null; phone: string | null; source: string | null;
  meta_form_name: string | null; created_at: string; assigned_to_name: string | null;
  status: string | null;
};

/** Lead stages that mean the person actually agreed to come in. */
const BOOKED_STAGES = ["consultation_booked", "appointment_booked", "visited", "converted", "won", "treatment_started"];
const isBookedStage = (status?: string | null) =>
  BOOKED_STAGES.includes((status || "").trim().toLowerCase().replace(/\s+/g, "_"));
type Appt = {
  id: string; patient_id: string | null; appointment_date: string | null; created_at: string;
  doctor: string | null; booked_by_name: string | null; created_from: string | null; checkin_time: string | null;
};
type Bill = { id: string; patient_id: string | null; total_amount: number | null; amount_paid: number | null; created_at: string };
type BillItem = { billing_id: string | null; treatment_type: string | null };

type CampaignRow = {
  key: string;
  platform: Platform;
  campaign: string;
  firstLead: string;
  lastLead: string;
  spend: number;
  leads: number;
  matchedLeads: number;
  appointments: number;
  visits: number;
  treatments: number;
  revenue: number;
  bookedBy: string[];
  doctors: string[];
};

export default function LeadGenerationReports() {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } =
    useDateRangeFilter("month", "leadGenReports");

  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [patients, setPatients] = useState<{ id: string; phone: string | null }[]>([]);
  const [spend, setSpend] = useState<AdSpendRow[]>([]);
  const [marketingExpenses, setMarketingExpenses] = useState(0);

  const [platformFilter, setPlatformFilter] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [callerFilter, setCallerFilter] = useState("all");
  const [treatmentFilter, setTreatmentFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fromISO = range.from?.toISOString();
  const toISO = range.to?.toISOString();
  const fromDate = range.from?.toISOString().slice(0, 10);
  const toDate = range.to?.toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try {
      const [leadRows, apptRows, billRows, patientRows, spendRows, expenseRows, billItemRows] = await Promise.all([
        fetchAllRows<Lead>((f, t) => {
          let q = supabase
            .from("leads")
            .select("id, name, phone, source, meta_form_name, created_at, assigned_to_name, status");
          if (fromISO) q = q.gte("created_at", fromISO);
          if (toISO) q = q.lte("created_at", toISO);
          return q.range(f, t);
        }),
        fetchAllRows<Appt>((f, t) =>
          supabase
            .from("appointments")
            .select("id, patient_id, appointment_date, created_at, doctor, booked_by_name, created_from, checkin_time")
            .range(f, t),
        ),
        fetchAllRows<Bill>((f, t) =>
          supabase.from("billings").select("id, patient_id, total_amount, amount_paid, created_at").range(f, t),
        ),
        fetchAllRows<{ id: string; phone: string | null }>((f, t) =>
          supabase.from("patients").select("id, phone").range(f, t),
        ),
        (async () => {
          let q = supabase
            .from("marketing_ad_spend")
            .select("id, platform, campaign_name, period_start, period_end, amount, notes");
          if (fromDate) q = q.gte("period_end", fromDate);
          if (toDate) q = q.lte("period_start", toDate);
          const { data, error } = await q;
          if (error) throw error;
          return (data || []) as AdSpendRow[];
        })(),
        (async () => {
          let q = supabase.from("expenses").select("amount, expense_date").eq("category", "marketing_expenses");
          if (fromDate) q = q.gte("expense_date", fromDate);
          if (toDate) q = q.lte("expense_date", toDate);
          const { data, error } = await q;
          if (error) throw error;
          return (data || []) as { amount: number | null }[];
        })(),
        fetchAllRows<BillItem>((f, t) =>
          supabase.from("billing_items").select("billing_id, treatment_type").range(f, t),
        ),
      ]);
      setLeads(leadRows);
      setAppts(apptRows);
      setBills(billRows);
      setBillItems(billItemRows);
      setPatients(patientRows);
      setSpend(spendRows);
      setMarketingExpenses(expenseRows.reduce((s, e) => s + Number(e.amount || 0), 0));
    } catch (e: any) {
      toast.error(e?.message || "Could not load the report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromISO, toISO]);

  /** phone (last 10) → patient ids */
  const patientsByPhone = useMemo(() => {
    const m = new Map<string, string[]>();
    patients.forEach((p) => {
      const k = last10(p.phone);
      if (!k) return;
      const arr = m.get(k) || [];
      arr.push(p.id);
      m.set(k, arr);
    });
    return m;
  }, [patients]);

  const apptsByPatient = useMemo(() => {
    const m = new Map<string, Appt[]>();
    appts.forEach((a) => {
      if (!a.patient_id) return;
      const arr = m.get(a.patient_id) || [];
      arr.push(a);
      m.set(a.patient_id, arr);
    });
    return m;
  }, [appts]);

  const billsByPatient = useMemo(() => {
    const m = new Map<string, Bill[]>();
    bills.forEach((b) => {
      if (!b.patient_id) return;
      const arr = m.get(b.patient_id) || [];
      arr.push(b);
      m.set(b.patient_id, arr);
    });
    return m;
  }, [bills]);

  /** billing id → distinct treatment names on that invoice */
  const treatmentsByBilling = useMemo(() => {
    const m = new Map<string, Set<string>>();
    billItems.forEach((it) => {
      if (!it.billing_id) return;
      const name = (it.treatment_type || "").trim();
      if (!name) return;
      const s = m.get(it.billing_id) || new Set<string>();
      s.add(name);
      m.set(it.billing_id, s);
    });
    return m;
  }, [billItems]);

  /** Every lead resolved through to visits, treatments and money collected. */
  const journeys = useMemo(() => {
    return leads.map((l) => {
      const key = last10(l.phone);
      const pids = key ? patientsByPhone.get(key) || [] : [];
      const created = new Date(l.created_at).getTime();
      const la: Appt[] = [];
      const lb: Bill[] = [];
      pids.forEach((pid) => {
        (apptsByPatient.get(pid) || []).forEach((a) => {
          if (new Date(a.created_at).getTime() >= created - 86400000) la.push(a);
        });
        (billsByPatient.get(pid) || []).forEach((b) => {
          if (new Date(b.created_at).getTime() >= created - 86400000) lb.push(b);
        });
      });
      const platform = platformOf(l.source);
      const campaign =
        (platform === "Meta" && l.meta_form_name?.trim()) || l.source?.trim() || "Unknown source";
      return {
        lead: l,
        platform,
        campaign,
        matched: pids.length > 0,
        appointments: la,
        visits: la.filter((a) => !!a.checkin_time),
        bills: lb,
        revenue: lb.reduce((s, b) => s + Number(b.amount_paid || 0), 0),
        doctors: Array.from(new Set(la.map((a) => (a.doctor || "").trim()).filter(Boolean))),
        bookedBy: Array.from(
          new Set(
            la.map((a) =>
              (a.booked_by_name || "").trim() ||
              ((a.created_from || "").toLowerCase().includes("portal") ? "Online / Self-booked" : "Not recorded"),
            ),
          ),
        ),
        treatments: Array.from(
          new Set(lb.flatMap((b) => Array.from(treatmentsByBilling.get(b.id) || []))),
        ),
      };
    });
  }, [leads, patientsByPhone, apptsByPatient, billsByPatient, treatmentsByBilling]);

  const doctorOptions = useMemo(
    () => Array.from(new Set(journeys.flatMap((j) => j.doctors))).sort(),
    [journeys],
  );
  const callerOptions = useMemo(
    () => Array.from(new Set(journeys.flatMap((j) => j.bookedBy))).sort(),
    [journeys],
  );
  const treatmentOptions = useMemo(
    () => Array.from(new Set(journeys.flatMap((j) => j.treatments))).sort(),
    [journeys],
  );
  const campaignOptions = useMemo(
    () => Array.from(new Set(journeys.map((j) => j.campaign))).sort(),
    [journeys],
  );

  const filteredJourneys = useMemo(() => {
    const s = search.trim().toLowerCase();
    return journeys.filter((j) => {
      if (platformFilter !== "all" && j.platform !== platformFilter) return false;
      if (doctorFilter !== "all" && !j.doctors.includes(doctorFilter)) return false;
      if (callerFilter !== "all" && !j.bookedBy.includes(callerFilter)) return false;
      if (treatmentFilter !== "all" && !j.treatments.includes(treatmentFilter)) return false;
      if (campaignFilter !== "all" && j.campaign !== campaignFilter) return false;
      if (s && !(j.campaign.toLowerCase().includes(s) || (j.lead.source || "").toLowerCase().includes(s)))
        return false;
      return true;
    });
  }, [journeys, platformFilter, doctorFilter, callerFilter, treatmentFilter, campaignFilter, search]);

  /** Spend matched to a campaign row by platform + name (case-insensitive). */
  const spendByKey = useMemo(() => {
    const m = new Map<string, number>();
    spend.forEach((s) => {
      const k = `${s.platform}|${s.campaign_name.trim().toLowerCase()}`;
      m.set(k, (m.get(k) || 0) + Number(s.amount || 0));
    });
    return m;
  }, [spend]);

  const campaignRows = useMemo<CampaignRow[]>(() => {
    const map = new Map<string, CampaignRow>();
    filteredJourneys.forEach((j) => {
      const key = `${j.platform}|${j.campaign.toLowerCase()}`;
      let r = map.get(key);
      if (!r) {
        r = {
          key,
          platform: j.platform,
          campaign: j.campaign,
          firstLead: j.lead.created_at,
          lastLead: j.lead.created_at,
          spend: spendByKey.get(key) || 0,
          leads: 0, matchedLeads: 0, appointments: 0, visits: 0, treatments: 0, revenue: 0,
          bookedBy: [], doctors: [],
        };
        map.set(key, r);
      }
      r.leads += 1;
      if (j.matched) r.matchedLeads += 1;
      if (j.lead.created_at < r.firstLead) r.firstLead = j.lead.created_at;
      if (j.lead.created_at > r.lastLead) r.lastLead = j.lead.created_at;
      if (j.appointments.length > 0) r.appointments += 1;
      if (j.visits.length > 0) r.visits += 1;
      if (j.bills.length > 0) r.treatments += 1;
      r.revenue += j.revenue;
      j.doctors.forEach((d) => { if (!r!.doctors.includes(d)) r!.doctors.push(d); });
      j.bookedBy.forEach((b) => { if (!r!.bookedBy.includes(b)) r!.bookedBy.push(b); });
    });
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [filteredJourneys, spendByKey]);

  const attributedSpend = campaignRows.reduce((s, r) => s + r.spend, 0);
  const enteredSpend = spend.reduce((s, r) => s + Number(r.amount || 0), 0);
  const unattributedSpend = Math.max(0, enteredSpend - attributedSpend);

  const totals = useMemo(() => {
    const leadsCount = campaignRows.reduce((s, r) => s + r.leads, 0);
    const matched = campaignRows.reduce((s, r) => s + r.matchedLeads, 0);
    const appointments = campaignRows.reduce((s, r) => s + r.appointments, 0);
    const visits = campaignRows.reduce((s, r) => s + r.visits, 0);
    const treatments = campaignRows.reduce((s, r) => s + r.treatments, 0);
    const revenue = campaignRows.reduce((s, r) => s + r.revenue, 0);
    const adSpend = enteredSpend > 0 ? enteredSpend : marketingExpenses;
    return {
      leadsCount, matched, appointments, visits, treatments, revenue, adSpend,
      cpl: leadsCount > 0 ? adSpend / leadsCount : 0,
      roas: adSpend > 0 ? revenue / adSpend : 0,
      roi: adSpend > 0 ? ((revenue - adSpend) / adSpend) * 100 : 0,
    };
  }, [campaignRows, enteredSpend, marketingExpenses]);

  const paged = usePagedSlice(campaignRows, page, pageSize);
  useEffect(() => setPage(1), [platformFilter, doctorFilter, callerFilter, treatmentFilter, campaignFilter, search, preset]);

  const kpis = [
    { label: "Total Ad Spend", value: inr(totals.adSpend), sub: enteredSpend > 0 ? "From recorded ad spend entries" : "From marketing expenses (no entries yet)", icon: IndianRupee },
    { label: "Leads Generated", value: totals.leadsCount.toLocaleString("en-IN"), sub: `${totals.matched} matched to a patient record`, icon: Users },
    { label: "Appointments Booked", value: totals.appointments.toLocaleString("en-IN"), sub: `${pctText(totals.appointments, totals.leadsCount)} of leads`, icon: CalendarCheck },
    { label: "Clinic Visits", value: totals.visits.toLocaleString("en-IN"), sub: `${pctText(totals.visits, totals.appointments)} of appointments`, icon: Footprints },
    { label: "Treatments Converted", value: totals.treatments.toLocaleString("en-IN"), sub: `${pctText(totals.treatments, totals.visits)} of visits`, icon: Stethoscope },
    { label: "Treatment Revenue", value: inr(totals.revenue), sub: totals.treatments > 0 ? `Avg ${inr(totals.revenue / totals.treatments)} per conversion` : "Revenue from converted treatments", icon: IndianRupee },
    { label: "Blended CPL", value: inr(totals.cpl), sub: "Ad spend ÷ total leads", icon: Calculator },
    { label: "ROAS", value: `${totals.roas.toFixed(2)}x`, sub: `${(totals.roas * 100).toFixed(0)}% of spend returned`, icon: TrendingUp },
    { label: "Marketing ROI", value: `${totals.roi.toFixed(1)}%`, sub: "(Revenue − Spend) ÷ Spend", icon: Percent },
  ];

  const unmatched = totals.leadsCount - totals.matched;

  /** Of the leads with no patient record, how many had actually agreed to come in. */
  const unmatchedSplit = useMemo(() => {
    const rows = filteredJourneys.filter((j) => !j.matched);
    const booked = rows.filter((j) => isBookedStage(j.lead.status)).length;
    return { booked, notVisiting: rows.length - booked };
  }, [filteredJourneys]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lead Generation Reports</h1>
            <p className="text-sm text-muted-foreground">
              Full funnel from ad spend to treatment revenue · Read-only, calculated live from leads, appointments and bills
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AdvancedDateRangeFilter
              preset={preset}
              onPresetChange={setPreset}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              showYear
            />
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{k.label}</CardDescription>
                  <k.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-xl">
                  {loading ? <Skeleton className="h-6 w-24" /> : k.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {unmatched > 0 && !loading && (
          <div
            className={`flex items-start gap-2 rounded-md border p-3 text-xs ${
              unmatchedSplit.booked > 0
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-muted/40"
            }`}
          >
            {unmatchedSplit.booked > 0 ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="space-y-1 text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{unmatched} of {totals.leadsCount} leads</span>{" "}
                have no patient record yet — mostly enquiries that never visited. Mobile numbers are already
                compared in normalised form (digits only, last 10), so formatting differences like +91, spaces
                or dashes do not affect this.
              </p>
              <p>
                Of those, <span className="font-medium text-foreground">{unmatchedSplit.booked}</span> had
                already agreed to a booking but were never registered as a patient (worth following up), and{" "}
                <span className="font-medium text-foreground">{unmatchedSplit.notVisiting}</span> are still at
                enquiry stage or did not proceed.
              </p>
              {unattributedSpend > 0 && (
                <p>
                  Also, {inr(unattributedSpend)} of recorded spend does not match any campaign name that
                  produced leads in this period.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ad spend entry */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ad Spend</CardTitle>
            <CardDescription>
              Record what was spent per campaign so cost per lead and ROAS are real numbers, not estimates.
              Marketing expenses booked in Finance for this period: {inr(marketingExpenses)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdSpendManager rows={spend} onChanged={load} />
          </CardContent>
        </Card>

        {/* Campaign master table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign Performance Master</CardTitle>
            <CardDescription>
              Every campaign across Meta, Google, Website and Offline with cost, conversion and revenue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search campaign or source"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {(["Meta", "Google", "Web", "Offline", "Other"] as Platform[]).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Doctor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Doctors</SelectItem>
                  {doctorOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={callerFilter} onValueChange={setCallerFilter}>
                <SelectTrigger className="w-[190px]"><SelectValue placeholder="Booked by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff / Channels</SelectItem>
                  {callerOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Campaign" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaignOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
                <SelectTrigger className="w-[190px]"><SelectValue placeholder="Treatment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Treatments</SelectItem>
                  {treatmentOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {(platformFilter !== "all" || doctorFilter !== "all" || callerFilter !== "all" || campaignFilter !== "all" || treatmentFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPlatformFilter("all"); setDoctorFilter("all"); setCallerFilter("all"); setCampaignFilter("all"); setTreatmentFilter("all"); setSearch(""); }}
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="min-w-[200px]">Campaign</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="text-right">Appointments</TableHead>
                    <TableHead>Booked By</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Treatments</TableHead>
                    <TableHead>Treating Doctors</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={13}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">
                        No campaigns produced leads in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((r, i) => (
                      <TableRow key={r.key}>
                        <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={PLATFORM_STYLE[r.platform]}>{r.platform}</Badge>
                            {isHiringCampaign(r.campaign) && (
                              <Badge variant="outline" className="border-amber-500/40 text-amber-600">HR / Recruitment</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[240px] truncate font-medium">{r.campaign}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(r.firstLead)} → {fmtDate(r.lastLead)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">{r.spend > 0 ? inr(r.spend) : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{r.leads}</TableCell>
                        <TableCell className="text-right">{r.spend > 0 ? inr(r.spend / Math.max(1, r.leads)) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn(r.appointments === 0 && "text-muted-foreground")}>{r.appointments}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({pctText(r.appointments, r.leads)})</span>
                        </TableCell>
                        <TableCell>
                          {r.bookedBy.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="max-w-[130px] truncate">{r.bookedBy[0]}</Badge>
                              {r.bookedBy.length > 1 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="cursor-default">+{r.bookedBy.length - 1}</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>{r.bookedBy.join(", ")}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(r.visits === 0 && "text-muted-foreground")}>{r.visits}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({pctText(r.visits, r.appointments)})</span>
                        </TableCell>
                        <TableCell className={cn("text-right", r.treatments === 0 && "text-muted-foreground")}>{r.treatments}</TableCell>
                        <TableCell>
                          {r.doctors.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="max-w-[130px] truncate">{r.doctors[0]}</Badge>
                              {r.doctors.length > 1 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="cursor-default">+{r.doctors.length - 1}</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>{r.doctors.join(", ")}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{inr(r.revenue)}</TableCell>
                        <TableCell className="text-right">
                          {r.spend > 0 ? (
                            <Badge
                              variant="outline"
                              className={r.revenue >= r.spend ? "border-emerald-500/40 text-emerald-600" : "border-rose-500/40 text-rose-600"}
                            >
                              {(r.revenue / r.spend).toFixed(2)}x
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {!loading && campaignRows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="font-medium">Total ({campaignRows.length} campaigns)</TableCell>
                      <TableCell className="text-right font-medium">{inr(attributedSpend)}</TableCell>
                      <TableCell className="text-right font-medium">{totals.leadsCount}</TableCell>
                      <TableCell className="text-right font-medium">
                        {attributedSpend > 0 ? inr(attributedSpend / Math.max(1, totals.leadsCount)) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{totals.appointments}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-medium">{totals.visits}</TableCell>
                      <TableCell className="text-right font-medium">{totals.treatments}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-medium">{inr(totals.revenue)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {attributedSpend > 0 ? `${(totals.revenue / attributedSpend).toFixed(2)}x` : "—"}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            <TablePagination
              page={page}
              pageSize={pageSize}
              total={campaignRows.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              label="campaigns"
            />

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Revenue is cash actually collected against bills raised after the lead came in. Appointments,
              visits and treatments count one per lead, not per booking, so funnel percentages read as
              conversion rates.
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
