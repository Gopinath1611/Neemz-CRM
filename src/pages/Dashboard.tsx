import { ArrowUp, ArrowDown, UserPlus, Phone, Calendar, TrendingUp, Star, Share2, Instagram, MessageSquare, Sparkles, IndianRupee, Clock, Package, AlertTriangle, CreditCard } from "lucide-react";
import LicenseAlertsWidget from "@/components/dashboard/LicenseAlertsWidget";
import HRExpiryAlertsWidget from "@/components/dashboard/HRExpiryAlertsWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { format } from "date-fns";

const leadSourceData = [
  { source: "Instagram", count: 45, color: "hsl(330, 80%, 55%)" },
  { source: "Facebook", count: 38, color: "hsl(217, 89%, 55%)" },
  { source: "Google Ads", count: 62, color: "hsl(4, 80%, 52%)" },
  { source: "Website", count: 28, color: "hsl(142, 71%, 45%)" },
  { source: "Walk-in", count: 35, color: "hsl(38, 92%, 50%)" },
  { source: "WhatsApp", count: 22, color: "hsl(142, 70%, 40%)" },
];

const aiInsights = [
  { icon: Sparkles, text: "Invisalign leads from Instagram have 3x higher conversion. Increase Instagram ad budget.", priority: "high" },
  { icon: TrendingUp, text: "Saturday dental camps generate most walk-in leads. Schedule next camp.", priority: "medium" },
  { icon: Star, text: "15 patients completed treatment this week. Send review requests to boost Google rating.", priority: "high" },
  { icon: MessageSquare, text: "WhatsApp campaign had 68% open rate. Replicate for other treatments.", priority: "medium" },
];

const Dashboard = () => {
  const today = format(new Date(), "yyyy-MM-dd");

  // Today's revenue from billings
  const { data: todayBillings = [] } = useQuery({
    queryKey: ["dashboard-today-billings", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("billings")
        .select("total_amount, amount_paid, payment_status, payment_method")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);
      return data || [];
    },
  });

  // Pending payments (all time)
  const { data: pendingBillings = [] } = useQuery({
    queryKey: ["dashboard-pending-billings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("billings")
        .select("id, patient_id, total_amount, amount_paid, payment_status, created_at")
        .neq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  // Patients for name lookup
  const { data: patients = [] } = useQuery({
    queryKey: ["dashboard-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name");
      return data || [];
    },
  });

  // Today's & upcoming appointments
  const { data: upcomingAppointments = [] } = useQuery({
    queryKey: ["dashboard-appointments", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, patient_id, appointment_date, start_time, type, status, doctor")
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(10);
      return data || [];
    },
  });

  // Low stock items
  const { data: lowStockItems = [] } = useQuery({
    queryKey: ["dashboard-low-stock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, name, quantity, min_stock_level, status, unit")
        .or("status.eq.low_stock,status.eq.out_of_stock")
        .order("quantity", { ascending: true })
        .limit(10);
      return data || [];
    },
  });

  // Lead count
  const { data: leadCount } = useQuery({
    queryKey: ["leads-count"],
    queryFn: async () => {
      const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  // Today's checkins count
  const { data: todayCheckins } = useQuery({
    queryKey: ["dashboard-checkins", today],
    queryFn: async () => {
      const { count } = await supabase
        .from("patient_checkins")
        .select("*", { count: "exact", head: true })
        .gte("checkin_time", `${today}T00:00:00`)
        .lte("checkin_time", `${today}T23:59:59`);
      return count || 0;
    },
  });

  // Computed
  const todayRevenue = todayBillings.reduce((a, b) => a + Number(b.total_amount || 0), 0);
  const todayCollected = todayBillings.reduce((a, b) => a + Number(b.amount_paid || 0), 0);
  const totalPending = pendingBillings.reduce((a, b) => a + (Number(b.total_amount || 0) - Number(b.amount_paid || 0)), 0);
  const todayAppointments = upcomingAppointments.filter((a: any) => a.appointment_date === today);

  const getPatientName = (id: string) => {
    const p = patients.find((p: any) => p.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
  };

  // Weekly revenue (last 7 days)
  const weeklyRevenue = () => {
    const data: { day: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      data.push({ day: format(d, "EEE"), revenue: 0 });
    }
    return data;
  };

  const stats = [
    { label: "Today's Revenue", value: `₹${todayRevenue.toLocaleString("en-IN")}`, sub: `Collected: ₹${todayCollected.toLocaleString("en-IN")}`, icon: IndianRupee, color: "bg-success/10 text-success" },
    { label: "Today's Appointments", value: todayAppointments.length, sub: `Total upcoming: ${upcomingAppointments.length}`, icon: Calendar, color: "bg-primary/10 text-primary" },
    { label: "Pending Payments", value: `₹${totalPending.toLocaleString("en-IN")}`, sub: `${pendingBillings.length} bills`, icon: Clock, color: "bg-warning/10 text-warning" },
    { label: "Low Stock Alerts", value: lowStockItems.length, sub: lowStockItems.length > 0 ? `${lowStockItems.filter((i: any) => i.status === "out_of_stock").length} out of stock` : "All good", icon: AlertTriangle, color: lowStockItems.length > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success" },
    { label: "Today's Patients", value: todayCheckins || 0, sub: "Checked in today", icon: UserPlus, color: "bg-accent/10 text-accent" },
    { label: "Total Leads", value: leadCount || 0, sub: "All time", icon: TrendingUp, color: "bg-info/10 text-info" },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, Dr. Neemz · {format(new Date(), "EEEE, dd MMM yyyy")}
          </p>
        </div>
        <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">
          <Sparkles size={12} className="mr-1" /> Live Data
        </Badge>
      </div>

      {/* Stats Grid */}
      <LicenseAlertsWidget />
      <HRExpiryAlertsWidget />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardContent className="p-4">
              <div className={`rounded-lg p-2 w-fit ${stat.color}`}>
                <stat.icon size={16} />
              </div>
              <p className="text-xl font-bold font-display mt-2">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Appointments */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Calendar size={16} className="text-primary" /> Today's Appointments
              <Badge variant="secondary" className="ml-auto text-[10px]">{todayAppointments.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {todayAppointments.length > 0 ? (
              <div className="divide-y divide-border">
                {todayAppointments.map((apt: any) => (
                  <div key={apt.id} className="px-5 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{getPatientName(apt.patient_id)}</p>
                      <p className="text-xs text-muted-foreground">{apt.type} · {apt.doctor || "Dr. Neemz"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{apt.start_time?.slice(0, 5)}</p>
                      <Badge variant={apt.status === "completed" ? "default" : apt.status === "checked_in" ? "secondary" : "outline"} className="text-[10px]">
                        {apt.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No appointments today</div>
            )}
          </CardContent>
        </Card>

        {/* Pending Payments */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Clock size={16} className="text-warning" /> Pending Payments
              <Badge variant="secondary" className="ml-auto text-[10px]">₹{totalPending.toLocaleString("en-IN")}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingBillings.length > 0 ? (
              <div className="divide-y divide-border">
                {pendingBillings.slice(0, 6).map((bill: any) => {
                  const pending = Number(bill.total_amount || 0) - Number(bill.amount_paid || 0);
                  return (
                    <div key={bill.id} className="px-5 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{getPatientName(bill.patient_id)}</p>
                        <p className="text-xs text-muted-foreground">
                          Total: ₹{Number(bill.total_amount).toLocaleString("en-IN")} · Paid: ₹{Number(bill.amount_paid).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-destructive">₹{pending.toLocaleString("en-IN")}</p>
                        <Badge variant={bill.payment_status === "partial" ? "secondary" : "destructive"} className="text-[10px]">
                          {bill.payment_status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No pending payments 🎉</div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" /> Low Stock Alerts
              <Badge variant="secondary" className="ml-auto text-[10px]">{lowStockItems.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {lowStockItems.length > 0 ? (
              <div className="divide-y divide-border">
                {lowStockItems.map((item: any) => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Min: {item.min_stock_level} {item.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${item.quantity === 0 ? "text-destructive" : "text-warning"}`}>
                        {item.quantity} {item.unit}
                      </p>
                      <Badge variant={item.status === "out_of_stock" ? "destructive" : "secondary"} className="text-[10px]">
                        {item.status === "out_of_stock" ? "Out of Stock" : "Low Stock"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">All items in stock ✅</div>
            )}
          </CardContent>
        </Card>

        {/* AI Insights */}
        <Card className="shadow-card border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Sparkles size={16} className="text-accent" /> AI Growth Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiInsights.map((insight, i) => (
                <div key={i} className={`flex gap-3 p-3 rounded-lg ${insight.priority === "high" ? "bg-accent/5 border border-accent/10" : "bg-secondary/50"}`}>
                  <insight.icon size={16} className="text-accent shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/80">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lead Sources */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Lead Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={leadSourceData} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {leadSourceData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {leadSourceData.map((item) => (
                <div key={item.source} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.source}</span>
                  </div>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
