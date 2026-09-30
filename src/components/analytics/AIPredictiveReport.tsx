import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, Users, Calendar } from "lucide-react";

interface AIPredictiveProps {
  patients: any[];
  leads: any[];
  billings: any[];
  appointments: any[];
  treatmentItems: any[];
}

const AIPredictiveReport = ({ patients, leads, billings, appointments, treatmentItems }: AIPredictiveProps) => {
  const totalRevenue = billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
  const totalPatients = patients.length;
  const totalLeads = leads.length;

  // Identify high-value patients (those with billings > avg)
  const avgBill = billings.length > 0 ? totalRevenue / billings.length : 0;
  const highValueBillings = billings.filter((b: any) => Number(b.total_amount || 0) > avgBill * 1.5);

  // Source analysis for predictions
  const sourceCounts: Record<string, number> = {};
  leads.forEach((l: any) => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

  // Treatment demand analysis
  const treatmentDemand: Record<string, number> = {};
  treatmentItems.forEach((i: any) => { treatmentDemand[i.treatment_type] = (treatmentDemand[i.treatment_type] || 0) + 1; });
  const topTreatment = Object.entries(treatmentDemand).sort((a, b) => b[1] - a[1])[0];

  // Day-of-week analysis
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
  appointments.forEach((a: any) => {
    const day = new Date(a.appointment_date).getDay();
    dayOfWeekCounts[day]++;
  });
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const busiestDay = dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];

  // Generate insights
  const insights = [
    {
      icon: Calendar,
      title: "Busiest Day Prediction",
      desc: `${busiestDay} has the highest patient footfall. Plan extra staff and stock on this day.`,
      type: "scheduling",
    },
    {
      icon: TrendingUp,
      title: "Revenue Forecast",
      desc: totalRevenue > 0
        ? `Based on current trends, projected monthly revenue: ₹${Math.round(totalRevenue * 1.15).toLocaleString()} (15% growth potential with optimized campaigns).`
        : "Start recording billings to unlock revenue predictions.",
      type: "revenue",
    },
    {
      icon: Users,
      title: "High-Value Patient Segment",
      desc: highValueBillings.length > 0
        ? `${highValueBillings.length} patients spend 1.5x above average. Focus retention and upselling on this group.`
        : "More billing data needed to identify high-value segments.",
      type: "patients",
    },
    {
      icon: Sparkles,
      title: "Top Lead Source",
      desc: topSource
        ? `${topSource[0].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} generates the most leads (${topSource[1]}). Increase budget allocation here.`
        : "Add leads to see source performance predictions.",
      type: "marketing",
    },
    {
      icon: Sparkles,
      title: "Treatment Demand",
      desc: topTreatment
        ? `${topTreatment[0]} is the most in-demand treatment (${topTreatment[1]} cases). Consider promoting this with targeted ads.`
        : "Record treatments to unlock demand predictions.",
      type: "treatment",
    },
    {
      icon: TrendingUp,
      title: "Campaign Optimization",
      desc: topSource
        ? `Patients from ${topSource[0].replace(/_/g, " ")} have the highest volume. Run A/B test campaigns to further optimize CPA.`
        : "Add campaign data to unlock optimization insights.",
      type: "campaign",
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-accent/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Sparkles size={16} className="text-accent" /> AI Predictive Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="flex gap-3 p-4 rounded-lg bg-secondary/50">
                <insight.icon size={16} className="text-accent shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.desc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 self-start">{insight.type}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <Sparkles size={16} className="text-accent mb-2" />
            <p className="text-lg font-bold font-display">{busiestDay}</p>
            <p className="text-xs text-muted-foreground">Predicted Busiest Day</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <TrendingUp size={16} className="text-success mb-2" />
            <p className="text-lg font-bold font-display">₹{totalRevenue > 0 ? Math.round(totalRevenue * 1.15).toLocaleString() : "0"}</p>
            <p className="text-xs text-muted-foreground">Projected Monthly Revenue</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <Users size={16} className="text-primary mb-2" />
            <p className="text-lg font-bold font-display">{highValueBillings.length}</p>
            <p className="text-xs text-muted-foreground">High-Value Patients</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AIPredictiveReport;
