import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface SalesProps {
  treatmentPlans: any[];
  treatmentItems: any[];
  billings: any[];
  billingItems: any[];
}

const SalesReport = ({ treatmentPlans, treatmentItems, billings, billingItems }: SalesProps) => {
  const totalPlans = treatmentPlans.length;
  const completedPlans = treatmentPlans.filter((p: any) => p.status === "completed").length;
  const acceptedItems = treatmentItems.filter((i: any) => i.status !== "cancelled").length;
  const cancelledItems = treatmentItems.filter((i: any) => i.status === "cancelled").length;
  const planConvRate = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  // Treatment conversion by type
  const treatmentStats: Record<string, { consult: number; accepted: number; revenue: number }> = {};
  treatmentItems.forEach((item: any) => {
    const t = item.treatment_type;
    if (!treatmentStats[t]) treatmentStats[t] = { consult: 0, accepted: 0, revenue: 0 };
    treatmentStats[t].consult++;
    if (item.status === "completed") treatmentStats[t].accepted++;
    treatmentStats[t].revenue += Number(item.estimated_cost || 0);
  });

  // Also pull from billing items for actual revenue
  billingItems.forEach((item: any) => {
    const t = item.treatment_type;
    if (!treatmentStats[t]) treatmentStats[t] = { consult: 0, accepted: 0, revenue: 0 };
    treatmentStats[t].revenue += Number(item.total_price || 0);
  });

  const conversionData = Object.entries(treatmentStats)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)
    .map(([name, data]) => ({
      name,
      consult: data.consult,
      accepted: data.accepted,
      conversion: data.consult > 0 ? Math.round((data.accepted / data.consult) * 100) : 0,
      revenue: data.revenue,
    }));

  const totalRevenue = billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
  const avgTreatmentValue = billings.length > 0 ? Math.round(totalRevenue / billings.length) : 0;
  const mostProfitable = conversionData.length > 0 ? conversionData[0].name : "N/A";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Treatment Plans", value: totalPlans },
          { label: "Completion Rate", value: `${planConvRate}%` },
          { label: "Total Revenue", value: `₹${totalRevenue.toLocaleString()}` },
          { label: "Avg Treatment Value", value: `₹${avgTreatmentValue.toLocaleString()}` },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue by Treatment Chart */}
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Revenue by Treatment</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={conversionData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fill: "hsl(220,10%,46%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(220,10%,46%)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
              <Bar dataKey="revenue" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Treatment Conversion Table */}
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Treatment Conversion</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Consult</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Accepted</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Conversion</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversionData.length > 0 ? conversionData.map(t => (
                <tr key={t.name} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium">{t.name}</td>
                  <td className="px-5 py-3 text-sm">{t.consult}</td>
                  <td className="px-5 py-3 text-sm text-success font-medium">{t.accepted}</td>
                  <td className="px-5 py-3 text-sm"><Badge variant="outline" className="text-xs">{t.conversion}%</Badge></td>
                  <td className="px-5 py-3 text-sm font-medium">₹{t.revenue.toLocaleString()}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-muted-foreground">No treatment data yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {mostProfitable !== "N/A" && (
        <Card className="shadow-card border-accent/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Most Profitable Treatment</p>
            <p className="text-lg font-bold font-display text-accent">{mostProfitable}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SalesReport;
