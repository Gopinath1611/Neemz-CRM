import { useState, useMemo } from "react";
import { BarChart3, Sparkles, CalendarIcon, FileDown, FileSpreadsheet } from "lucide-react";
import { exportToPDF, exportToExcel } from "@/lib/exportAnalytics";
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ClinicOpsReport from "@/components/analytics/ClinicOpsReport";
import MarketingReport from "@/components/analytics/MarketingReport";
import SalesReport from "@/components/analytics/SalesReport";
import FinanceReport from "@/components/analytics/FinanceReport";
import EmployeeKPIReport from "@/components/analytics/EmployeeKPIReport";
import GrowthReport from "@/components/analytics/GrowthReport";
import AIPredictiveReport from "@/components/analytics/AIPredictiveReport";
import SuperDashboard from "@/components/analytics/SuperDashboard";
import { mergeWithLegacyPayments } from "@/lib/paymentReconciliation";

type RangePreset = "today" | "week" | "month" | "custom";

const fetchAll = async () => {
  const [patients, appointments, leads, checkins, billings, billingItems, billingPayments, treatmentPlans, treatmentItems, campaigns, contentCalendar, reviews] = await Promise.all([
    supabase.from("patients").select("*").then(r => r.data || []),
    supabase.from("appointments").select("*").then(r => r.data || []),
    supabase.from("leads").select("*").then(r => r.data || []),
    supabase.from("patient_checkins").select("*").then(r => r.data || []),
    supabase.from("billings").select("*").then(r => r.data || []),
    supabase.from("billing_items").select("*").then(r => r.data || []),
    supabase.from("billing_payments").select("*").then(r => r.data || []),
    supabase.from("treatment_plans").select("*").then(r => r.data || []),
    supabase.from("treatment_plan_items").select("*").then(r => r.data || []),
    supabase.from("whatsapp_campaigns").select("*").then(r => r.data || []),
    supabase.from("content_calendar").select("*").then(r => r.data || []),
    supabase.from("review_requests").select("*").then(r => r.data || []),
  ]);
  // Reconcile historical billings (amount_paid > Σ payments) into synthetic
  // payment rows so Finance/Analytics aggregations match the billing ledger.
  const mergedPayments = mergeWithLegacyPayments(billings as any, billingPayments as any);
  return { patients, appointments, leads, checkins, billings, billingItems, billingPayments: mergedPayments, treatmentPlans, treatmentItems, campaigns, contentCalendar, reviews };
};

const getDateField = (item: any): string | null => {
  return item.payment_date || item.created_at || item.appointment_date || item.checkin_time || item.scheduled_date || item.sent_at || null;
};

const filterByRange = (items: any[], from: Date, to: Date) => {
  const fromTs = from.getTime();
  const toTs = to.getTime();
  return items.filter(item => {
    const df = getDateField(item);
    if (!df) return true;
    const ts = new Date(df).getTime();
    return ts >= fromTs && ts <= toTs;
  });
};

const Analytics = () => {
  const { data, isLoading } = useQuery({ queryKey: ["analytics-all"], queryFn: fetchAll });
  const [preset, setPreset] = useState<RangePreset>("month");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (preset === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    if (preset === "month") return { from: startOfMonth(now), to: endOfDay(now) };
    return { from: customFrom || startOfMonth(now), to: endOfDay(customTo || now) };
  }, [preset, customFrom, customTo]);

  const raw = data || { patients: [], appointments: [], leads: [], checkins: [], billings: [], billingItems: [], billingPayments: [], treatmentPlans: [], treatmentItems: [], campaigns: [], contentCalendar: [], reviews: [] };

  const d = useMemo(() => ({
    patients: raw.patients, // don't filter patients themselves
    appointments: filterByRange(raw.appointments, from, to),
    leads: filterByRange(raw.leads, from, to),
    checkins: filterByRange(raw.checkins, from, to),
    billings: filterByRange(raw.billings, from, to),
    billingItems: filterByRange(raw.billingItems, from, to),
    billingPayments: filterByRange(raw.billingPayments, from, to),
    treatmentPlans: filterByRange(raw.treatmentPlans, from, to),
    treatmentItems: filterByRange(raw.treatmentItems, from, to),
    campaigns: filterByRange(raw.campaigns, from, to),
    contentCalendar: filterByRange(raw.contentCalendar, from, to),
    reviews: filterByRange(raw.reviews, from, to),
  }), [raw, from, to]);

  const rangeLabel = preset === "custom" && customFrom
    ? `${format(customFrom, "dd MMM")} – ${customTo ? format(customTo, "dd MMM") : "now"}`
    : preset === "today" ? "Today" : preset === "week" ? "This Week" : "This Month";

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">Analytics & Reports <BarChart3 size={20} className="text-primary" /></h1>
          <p className="text-sm text-muted-foreground mt-1">Complete clinic intelligence — {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["today", "week", "month", "custom"] as RangePreset[]).map(p => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              className="text-xs h-8"
              onClick={() => setPreset(p)}
            >
              {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
            </Button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs h-8 w-[120px] justify-start", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon size={12} className="mr-1" />
                    {customFrom ? format(customFrom, "dd MMM yy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">–</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs h-8 w-[120px] justify-start", !customTo && "text-muted-foreground")}>
                    <CalendarIcon size={12} className="mr-1" />
                    {customTo ? format(customTo, "dd MMM yy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
          <Badge className="bg-accent/10 text-accent border-accent/20 text-xs"><Sparkles size={12} className="mr-1" /> Live</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading analytics...</div>
      ) : (
        <Tabs defaultValue="dashboard" className="w-full" onValueChange={(v) => setActiveTab(v)}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-secondary/50 p-1.5">
            <TabsTrigger value="dashboard" className="text-xs">🧠 Owner Dashboard</TabsTrigger>
            <TabsTrigger value="clinic" className="text-xs">📊 Clinic Ops</TabsTrigger>
            <TabsTrigger value="marketing" className="text-xs">📣 Marketing</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">💰 Sales</TabsTrigger>
            <TabsTrigger value="finance" className="text-xs">💳 Finance</TabsTrigger>
            <TabsTrigger value="employee" className="text-xs">👩‍⚕️ Employee KPI</TabsTrigger>
            <TabsTrigger value="growth" className="text-xs">📈 Growth</TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">🤖 AI Predictions</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5" onClick={() => exportToPDF(activeTab, d, rangeLabel)}>
                <FileDown size={14} /> PDF
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5" onClick={() => exportToExcel(activeTab, d, rangeLabel)}>
                <FileSpreadsheet size={14} /> Excel
              </Button>
            </div>
          </div>

          <TabsContent value="dashboard">
            <SuperDashboard patients={d.patients} appointments={d.appointments} leads={d.leads} billings={d.billings} reviews={d.reviews} treatmentItems={d.treatmentItems} checkins={d.checkins} />
          </TabsContent>
          <TabsContent value="clinic">
            <ClinicOpsReport patients={d.patients} appointments={d.appointments} checkins={d.checkins} treatmentPlans={d.treatmentPlans} treatmentItems={d.treatmentItems} />
          </TabsContent>
          <TabsContent value="marketing">
            <MarketingReport leads={d.leads} campaigns={d.campaigns} contentCalendar={d.contentCalendar} />
          </TabsContent>
          <TabsContent value="sales">
            <SalesReport treatmentPlans={d.treatmentPlans} treatmentItems={d.treatmentItems} billings={d.billings} billingItems={d.billingItems} />
          </TabsContent>
          <TabsContent value="finance">
            <FinanceReport billings={d.billings} billingItems={d.billingItems} billingPayments={d.billingPayments} />
          </TabsContent>
          <TabsContent value="employee">
            <EmployeeKPIReport appointments={d.appointments} billings={d.billings} leads={d.leads} treatmentPlans={d.treatmentPlans} campaigns={d.campaigns} contentCalendar={d.contentCalendar} reviews={d.reviews} />
          </TabsContent>
          <TabsContent value="growth">
            <GrowthReport patients={d.patients} billings={d.billings} treatmentItems={d.treatmentItems} reviews={d.reviews} />
          </TabsContent>
          <TabsContent value="ai">
            <AIPredictiveReport patients={d.patients} leads={d.leads} billings={d.billings} appointments={d.appointments} treatmentItems={d.treatmentItems} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Analytics;
