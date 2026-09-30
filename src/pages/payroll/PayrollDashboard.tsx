import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Wallet, Plus, IndianRupee, Building2,
  Receipt, ShieldCheck, ArrowRight, X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth } from "date-fns";

const FY_OPTIONS = [
  { value: "2026-2027", label: "Apr 1, 2026 - Mar 31, 2027" },
  { value: "2025-2026", label: "Apr 1, 2025 - Mar 31, 2026" },
  { value: "2024-2025", label: "Apr 1, 2024 - Mar 31, 2025" },
];

const FY_MONTHS = [
  { m: 4, label: "Apr" }, { m: 5, label: "May" }, { m: 6, label: "Jun" },
  { m: 7, label: "Jul" }, { m: 8, label: "Aug" }, { m: 9, label: "Sep" },
  { m: 10, label: "Oct" }, { m: 11, label: "Nov" }, { m: 12, label: "Dec" },
  { m: 1, label: "Jan" }, { m: 2, label: "Feb" }, { m: 3, label: "Mar" },
];

const PayrollDashboard = () => {
  const [fy, setFy] = useState("2026-2027");
  const [periodFilter, setPeriodFilter] = useState("this_year");
  const [locationFilter, setLocationFilter] = useState("all");
  const [payruns, setPayruns] = useState<any[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    pay_period_month: 4,
    location: "all",
    band: "all",
    employment_type: "all",
  });

  useEffect(() => { fetchAll(); fetchLocations(); }, [fy]);

  const fetchLocations = async () => {
    const { data } = await supabase.from("branches").select("name").eq("is_active", true);
    if (data) setLocations(data.map((b: any) => b.name));
  };

  const fetchAll = async () => {
    const { data } = await supabase.from("payruns").select("*").eq("financial_year", fy).order("pay_period_month");
    if (data) setPayruns(data);
  };

  const fyStartYear = parseInt(fy.split("-")[0]);

  // Aggregated stats
  const totals = payruns.reduce((acc, p) => {
    acc.ctc += Number(p.total_ctc || 0);
    acc.net += Number(p.total_net_pay || 0);
    acc.tax += Number(p.total_tax || 0);
    acc.deductions += Number(p.total_deductions || 0);
    acc.employees = Math.max(acc.employees, p.total_employees || 0);
    return acc;
  }, { ctc: 0, net: 0, tax: 0, deductions: 0, employees: 0 });

  // Find next month to process
  const processedMonths = new Set(payruns.filter(p => p.status !== "draft").map(p => p.pay_period_month));
  const nextMonth = FY_MONTHS.find(m => !processedMonths.has(m.m)) || FY_MONTHS[0];
  const nextMonthYear = nextMonth.m >= 4 ? fyStartYear : fyStartYear + 1;

  // Monthly graph
  const chartData = FY_MONTHS.map(m => {
    const p = payruns.find(pr => pr.pay_period_month === m.m);
    return {
      month: m.label,
      net: Number(p?.total_net_pay || 0),
      ctc: Number(p?.total_ctc || 0),
    };
  });

  const handleCreatePayrun = async () => {
    if (!createForm.name) { toast.error("Enter payrun name"); return; }
    const m = createForm.pay_period_month;
    const y = m >= 4 ? fyStartYear : fyStartYear + 1;
    const start = startOfMonth(new Date(y, m - 1, 1));
    const end = endOfMonth(start);

    const { error } = await supabase.from("payruns").insert({
      name: createForm.name,
      financial_year: fy,
      pay_period_month: m,
      pay_period_year: y,
      pay_period_start: format(start, "yyyy-MM-dd"),
      pay_period_end: format(end, "yyyy-MM-dd"),
      location: createForm.location,
      band: createForm.band,
      employment_type: createForm.employment_type,
      payrun_type: "regular",
      status: "draft",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Payrun created");
    setShowCreate(false);
    setCreateForm({ name: "", pay_period_month: 4, location: "all", band: "all", employment_type: "all" });
    fetchAll();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" /> Payroll Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">FY {FY_OPTIONS.find(f => f.value === fy)?.label}</p>
        </div>
        <div className="flex gap-2">
          <Select value={fy} onValueChange={setFy}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FY_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-1" /> Create Payrun</Button>
        </div>
      </div>

      {/* Summary + Process Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Payroll Summary - Monthly Trend</h3>
              <Badge variant="outline">FY {fy}</Badge>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip />
                <Bar dataKey="net" fill="hsl(var(--primary))" name="Net Pay" />
                <Bar dataKey="ctc" fill="hsl(var(--accent))" name="CTC" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Process Payrun For</p>
            <h3 className="text-2xl font-bold text-primary">{nextMonth.label} {nextMonthYear}</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Cost of Company</span><span className="font-semibold">₹{totals.ctc.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pay Day</span><span className="font-semibold">Last day of {nextMonth.label}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Employees</span><span className="font-semibold">{totals.employees || "-"}</span></div>
            </div>
            <Button className="w-full mt-4" onClick={() => { setCreateForm({ ...createForm, pay_period_month: nextMonth.m, name: `Payrun ${nextMonth.label} ${nextMonthYear}` }); setShowCreate(true); }}>
              Create Payrun <ArrowRight size={14} className="ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3">
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Locations" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="previous_year">Previous Year</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="previous_month">Previous Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={IndianRupee} label="Cost of Company" value={`₹${totals.ctc.toLocaleString()}`} color="text-primary" />
        <StatCard icon={Receipt} label="TDS" value={`₹${Math.round(totals.tax).toLocaleString()}`} color="text-amber-600" />
        <StatCard icon={ShieldCheck} label="EPF" value={`₹${Math.round(totals.deductions * 0.5).toLocaleString()}`} color="text-blue-600" />
        <StatCard icon={ShieldCheck} label="ESI" value={`₹${Math.round(totals.deductions * 0.1).toLocaleString()}`} color="text-purple-600" />
        <StatCard icon={Building2} label="Professional Tax" value={`₹${Math.round(totals.deductions * 0.05).toLocaleString()}`} color="text-green-600" />
        <StatCard icon={ShieldCheck} label="Labour Welfare" value={`₹${Math.round(totals.deductions * 0.02).toLocaleString()}`} color="text-rose-600" />
      </div>

      {/* Create Payrun Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Payrun</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Payrun Name *</Label>
              <Input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder={`Payrun ${FY_MONTHS.find(m => m.m === createForm.pay_period_month)?.label} ${createForm.pay_period_month >= 4 ? fyStartYear : fyStartYear + 1}`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pay Period (Month)</Label>
                <Select value={String(createForm.pay_period_month)} onValueChange={v => setCreateForm({ ...createForm, pay_period_month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FY_MONTHS.map(m => {
                      const y = m.m >= 4 ? fyStartYear : fyStartYear + 1;
                      return <SelectItem key={m.m} value={String(m.m)}>{m.label} {y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={createForm.location} onValueChange={v => setCreateForm({ ...createForm, location: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Band</Label>
                <Select value={createForm.band} onValueChange={v => setCreateForm({ ...createForm, band: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Bands</SelectItem>
                    <SelectItem value="L1">L1</SelectItem>
                    <SelectItem value="L2">L2</SelectItem>
                    <SelectItem value="L3">L3</SelectItem>
                    <SelectItem value="L4">L4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Employment Type</Label>
                <Select value={createForm.employment_type} onValueChange={v => setCreateForm({ ...createForm, employment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}><X size={14} className="mr-1" /> Close</Button>
              <Button className="flex-1" onClick={handleCreatePayrun}>Create Payrun</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <Card>
    <CardContent className="p-4">
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="text-xs text-muted-foreground mt-2">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </CardContent>
  </Card>
);

export default PayrollDashboard;
