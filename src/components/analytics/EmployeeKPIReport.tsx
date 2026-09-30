import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface EmployeeKPIProps {
  appointments: any[];
  billings: any[];
  leads: any[];
  treatmentPlans: any[];
  campaigns: any[];
  contentCalendar: any[];
  reviews: any[];
}

const EmployeeKPIReport = ({ appointments, billings, leads, treatmentPlans, campaigns, contentCalendar, reviews }: EmployeeKPIProps) => {
  // Doctor performance
  const doctorStats: Record<string, { patients: number; revenue: number; plans: number; completed: number }> = {};
  appointments.forEach((a: any) => {
    const doc = a.doctor || "Dr. Neemz";
    if (!doctorStats[doc]) doctorStats[doc] = { patients: 0, revenue: 0, plans: 0, completed: 0 };
    doctorStats[doc].patients++;
  });
  billings.forEach((b: any) => {
    // Attribute to default doctor for now
    const doc = "Dr. Neemz";
    if (!doctorStats[doc]) doctorStats[doc] = { patients: 0, revenue: 0, plans: 0, completed: 0 };
    doctorStats[doc].revenue += Number(b.total_amount || 0);
  });
  treatmentPlans.forEach((p: any) => {
    const doc = p.doctor || "Dr. Neemz";
    if (!doctorStats[doc]) doctorStats[doc] = { patients: 0, revenue: 0, plans: 0, completed: 0 };
    doctorStats[doc].plans++;
    if (p.status === "completed") doctorStats[doc].completed++;
  });

  const doctorData = Object.entries(doctorStats).map(([name, data]) => ({
    name,
    patients: data.patients,
    revenue: data.revenue,
    plans: data.plans,
    acceptRate: data.plans > 0 ? Math.round((data.completed / data.plans) * 100) : 0,
  }));

  // Reception KPI
  const totalAppts = appointments.length;
  const totalLeads = leads.length;
  const followedUp = leads.filter((l: any) => l.status !== "new_lead").length;
  const convertedLeads = leads.filter((l: any) => l.status === "converted").length;
  const followUpRate = totalLeads > 0 ? Math.round((followedUp / totalLeads) * 100) : 0;
  const leadConvRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  // Marketing KPI
  const sentCampaigns = campaigns.filter((c: any) => c.status === "sent").length;
  const totalResponses = campaigns.reduce((a: number, c: any) => a + (c.response_count || 0), 0);
  const contentCount = contentCalendar.length;
  const avgRating = reviews.length > 0
    ? (reviews.filter((r: any) => r.rating).reduce((a: number, r: any) => a + (r.rating || 0), 0) / reviews.filter((r: any) => r.rating).length).toFixed(1)
    : "N/A";

  return (
    <div className="space-y-6">
      {/* Doctor Performance */}
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">👩‍⚕️ Doctor Performance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Doctor</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Patients</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Revenue</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment Plans</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Accept Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doctorData.length > 0 ? doctorData.map(d => (
                <tr key={d.name} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium">{d.name}</td>
                  <td className="px-5 py-3 text-sm">{d.patients}</td>
                  <td className="px-5 py-3 text-sm text-success font-medium">₹{d.revenue.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm">{d.plans}</td>
                  <td className="px-5 py-3 text-sm"><Badge variant="outline" className="text-xs">{d.acceptRate}%</Badge></td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-muted-foreground">No doctor data yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reception KPI */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">📞 Reception KPI</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Appointments Booked", value: totalAppts },
              { label: "Leads Followed Up", value: `${followedUp}/${totalLeads} (${followUpRate}%)` },
              { label: "Lead Conversion", value: `${convertedLeads} (${leadConvRate}%)` },
            ].map(kpi => (
              <div key={kpi.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm text-muted-foreground">{kpi.label}</span>
                <span className="text-sm font-bold">{kpi.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Marketing Manager KPI */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">📣 Marketing KPI</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Leads Generated", value: totalLeads },
              { label: "Campaigns Sent", value: sentCampaigns },
              { label: "Campaign Responses", value: totalResponses },
              { label: "Content Created", value: contentCount },
              { label: "Avg Patient Rating", value: avgRating },
            ].map(kpi => (
              <div key={kpi.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm text-muted-foreground">{kpi.label}</span>
                <span className="text-sm font-bold">{kpi.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeKPIReport;
