import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

interface GrowthProps {
  patients: any[];
  billings: any[];
  treatmentItems: any[];
  reviews: any[];
}

const GrowthReport = ({ patients, billings, treatmentItems, reviews }: GrowthProps) => {
  // Monthly new patients (last 6 months)
  const monthlyPatients: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyPatients[key] = 0;
  }
  patients.forEach((p: any) => {
    const key = p.created_at?.substring(0, 7);
    if (key && monthlyPatients[key] !== undefined) monthlyPatients[key]++;
  });
  const patientGrowthData = Object.entries(monthlyPatients).map(([month, count]) => ({
    month: new Date(month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    patients: count,
  }));

  // Monthly revenue (last 6 months)
  const monthlyRevenue: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyRevenue[key] = 0;
  }
  billings.forEach((b: any) => {
    const key = b.created_at?.substring(0, 7);
    if (key && monthlyRevenue[key] !== undefined) monthlyRevenue[key] += Number(b.total_amount || 0);
  });
  const revenueGrowthData = Object.entries(monthlyRevenue).map(([month, amount]) => ({
    month: new Date(month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    revenue: amount,
  }));

  const totalPatients = patients.length;
  const totalRevenue = billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
  const ltv = totalPatients > 0 ? Math.round(totalRevenue / totalPatients) : 0;

  const avgRating = reviews.filter((r: any) => r.rating).length > 0
    ? (reviews.filter((r: any) => r.rating).reduce((a: number, r: any) => a + (r.rating || 0), 0) / reviews.filter((r: any) => r.rating).length).toFixed(1)
    : "N/A";
  const reviewCount = reviews.filter((r: any) => r.review_received).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Patients", value: totalPatients },
          { label: "Patient LTV", value: `₹${ltv.toLocaleString()}` },
          { label: "Google Reviews", value: reviewCount },
          { label: "Avg Rating", value: avgRating },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Patient Growth (6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={patientGrowthData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} />
                <Tooltip />
                <Line type="monotone" dataKey="patients" stroke="hsl(217,91%,50%)" strokeWidth={2} dot={{ fill: "hsl(217,91%,50%)" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Revenue Trend (6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueGrowthData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card border-primary/20">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground mb-1">Patient Lifetime Value</p>
          <p className="text-3xl font-bold font-display text-primary">₹{ltv.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Average revenue generated per patient across all visits</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default GrowthReport;
