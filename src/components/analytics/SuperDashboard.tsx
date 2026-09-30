import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, CalendarCheck, Target, Star, TrendingUp, Sparkles } from "lucide-react";

interface SuperDashboardProps {
  patients: any[];
  appointments: any[];
  leads: any[];
  billings: any[];
  reviews: any[];
  treatmentItems: any[];
  checkins: any[];
}

const SuperDashboard = ({ patients, appointments, leads, billings, reviews, treatmentItems, checkins }: SuperDashboardProps) => {
  const today = new Date().toISOString().split("T")[0];

  const todayRevenue = billings
    .filter((b: any) => b.created_at?.split("T")[0] === today)
    .reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);

  const todayPatients = appointments.filter((a: any) => a.appointment_date === today).length;
  const todayCheckins = checkins.filter((c: any) => c.checkin_time?.split("T")[0] === today).length;

  const totalAppts = appointments.length;
  const completedAppts = appointments.filter((a: any) => a.status === "completed" || a.status === "checked_in").length;
  const apptUtil = totalAppts > 0 ? Math.round((completedAppts / totalAppts) * 100) : 0;

  const totalLeads = leads.length;
  const converted = leads.filter((l: any) => l.status === "converted").length;
  const leadConv = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

  // Best treatment
  const treatmentRevenue: Record<string, number> = {};
  treatmentItems.forEach((i: any) => {
    treatmentRevenue[i.treatment_type] = (treatmentRevenue[i.treatment_type] || 0) + Number(i.estimated_cost || 0);
  });
  const bestTreatment = Object.entries(treatmentRevenue).sort((a, b) => b[1] - a[1])[0];

  const reviewCount = reviews.filter((r: any) => r.review_received).length;
  const avgRating = reviews.filter((r: any) => r.rating).length > 0
    ? (reviews.filter((r: any) => r.rating).reduce((a: number, r: any) => a + (r.rating || 0), 0) / reviews.filter((r: any) => r.rating).length).toFixed(1)
    : "N/A";

  const totalRevenue = billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
  const totalPaid = billings.reduce((a: number, b: any) => a + Number(b.amount_paid || 0), 0);
  const outstanding = totalRevenue - totalPaid;

  const stats = [
    { label: "Today's Revenue", value: `₹${todayRevenue.toLocaleString()}`, icon: DollarSign, color: "text-success", bg: "bg-success/10" },
    { label: "Today's Patients", value: todayPatients, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Today's Check-ins", value: todayCheckins, icon: CalendarCheck, color: "text-accent", bg: "bg-accent/10" },
    { label: "Lead Conversion", value: `${leadConv}%`, icon: Target, color: "text-warning", bg: "bg-warning/10" },
    { label: "Appt Utilization", value: `${apptUtil}%`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Google Reviews", value: `${reviewCount} (${avgRating}★)`, icon: Star, color: "text-warning", bg: "bg-warning/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-5 flex items-start gap-4">
              <div className={`p-3 rounded-xl ${s.bg}`}>
                <s.icon size={20} className={s.color} />
              </div>
              <div>
                <p className="text-2xl font-bold font-display">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Quick Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Total Patients", value: patients.length },
              { label: "Total Revenue", value: `₹${totalRevenue.toLocaleString()}` },
              { label: "Outstanding", value: `₹${outstanding.toLocaleString()}` },
              { label: "Total Leads", value: totalLeads },
              { label: "Converted Leads", value: converted },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-bold">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-card border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Sparkles size={16} className="text-accent" /> Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bestTreatment && (
              <div className="p-3 rounded-lg bg-accent/5">
                <p className="text-xs text-muted-foreground">Best Performing Treatment</p>
                <p className="text-sm font-bold">{bestTreatment[0]} — ₹{bestTreatment[1].toLocaleString()}</p>
              </div>
            )}
            <div className="p-3 rounded-lg bg-primary/5">
              <p className="text-xs text-muted-foreground">Collection Efficiency</p>
              <p className="text-sm font-bold">{totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0}%</p>
            </div>
            <div className="p-3 rounded-lg bg-success/5">
              <p className="text-xs text-muted-foreground">Patient Lifetime Value</p>
              <p className="text-sm font-bold">₹{patients.length > 0 ? Math.round(totalRevenue / patients.length).toLocaleString() : "0"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SuperDashboard;
