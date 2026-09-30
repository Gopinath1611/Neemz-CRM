import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { aggregatePaymentsByMode, modeLabel, modeColor, parsePaymentSplits, reportBucket } from "@/lib/paymentMode";

interface FinanceProps {
  billings: any[];
  billingItems: any[];
  billingPayments?: any[];
}

const FinanceReport = ({ billings, billingItems, billingPayments = [] }: FinanceProps) => {
  const totalRevenue = billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
  // Collected = sum of actual payment transactions in the period (by payment_date)
  const totalPaid = billingPayments.length > 0
    ? billingPayments.reduce((a: number, p: any) => a + Number(p.amount || 0), 0)
    : billings.reduce((a: number, b: any) => a + Number(b.amount_paid || 0), 0);
  const outstanding = totalRevenue - totalPaid;
  const collectionEfficiency = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0;

  const pendingBills = billings.filter((b: any) => b.payment_status === "pending").length;
  const paidBills = billings.filter((b: any) => b.payment_status === "paid").length;
  const partialBills = billings.filter((b: any) => b.payment_status === "partial").length;

  // Payment method breakdown — use billing_payments as the authoritative
  // source. Fall back to billings only when no payment rows are available
  // (legacy parents), and even then decompose composite payment_method strings
  // via parsePaymentSplits so split payments never collapse to one mode.
  const methodCountsMap: Record<string, { count: number; amount: number }> = {};
  if (billingPayments.length > 0) {
    const agg = aggregatePaymentsByMode(billingPayments as any);
    Object.entries(agg).forEach(([k, v]) => {
      if (v.amount > 0) methodCountsMap[k] = { amount: v.amount, count: v.count };
    });
  } else {
    billings.forEach((b: any) => {
      const splits = parsePaymentSplits(b.payment_method, Number(b.amount_paid || 0));
      splits.forEach((s) => {
        const k = reportBucket(s.mode);
        if (!methodCountsMap[k]) methodCountsMap[k] = { count: 0, amount: 0 };
        methodCountsMap[k].amount += s.amount;
        methodCountsMap[k].count += 1;
      });
    });
  }
  const methodData = Object.entries(methodCountsMap)
    .filter(([, v]) => v.amount > 0)
    .map(([key, data]) => ({
      method: modeLabel(key),
      count: data.count,
      amount: data.amount,
      color: modeColor(key),
    }));

  // Daily collected revenue (last 7 days) — based on actual payment date, not bill creation date
  const dailyRevenue: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyRevenue[key] = 0;
  }
  if (billingPayments.length > 0) {
    billingPayments.forEach((p: any) => {
      const day = p.payment_date?.split("T")[0];
      if (day && dailyRevenue[day] !== undefined) {
        dailyRevenue[day] += Number(p.amount || 0);
      }
    });
  } else {
    billings.forEach((b: any) => {
      const day = b.created_at?.split("T")[0];
      if (day && dailyRevenue[day] !== undefined) {
        dailyRevenue[day] += Number(b.total_amount || 0);
      }
    });
  }
  const dailyData = Object.entries(dailyRevenue).map(([date, amount]) => ({
    date: new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    revenue: amount,
  }));

  // Revenue per treatment
  const treatmentRevenue: Record<string, number> = {};
  billingItems.forEach((item: any) => {
    const t = item.treatment_type;
    treatmentRevenue[t] = (treatmentRevenue[t] || 0) + Number(item.total_price || 0);
  });
  const treatmentRevenueData = Object.entries(treatmentRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, amount]) => ({ name, amount }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Revenue", value: `₹${totalRevenue.toLocaleString()}` },
          { label: "Collected", value: `₹${totalPaid.toLocaleString()}` },
          { label: "Outstanding", value: `₹${outstanding.toLocaleString()}` },
          { label: "Collection %", value: `${collectionEfficiency}%` },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card"><CardContent className="p-4"><p className="text-xl font-bold font-display text-success">{paidBills}</p><p className="text-xs text-muted-foreground">Paid Bills</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4"><p className="text-xl font-bold font-display text-warning">{partialBills}</p><p className="text-xs text-muted-foreground">Partial Payments</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4"><p className="text-xl font-bold font-display text-destructive">{pendingBills}</p><p className="text-xs text-muted-foreground">Pending Bills</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Revenue */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Daily Revenue (7 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fill: "hsl(220,10%,46%)", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Payment Methods</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={methodData} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={80} innerRadius={30}>
                    {methodData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {methodData.map(m => (
                  <div key={m.method} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                      <span>{m.method}</span>
                    </div>
                    <span className="font-medium">₹{(m.amount / 1000).toFixed(0)}K</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue per Treatment */}
      {treatmentRevenueData.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Revenue per Treatment</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {treatmentRevenueData.map(t => (
                  <tr key={t.name} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium">{t.name}</td>
                    <td className="px-5 py-3 text-sm font-medium text-success">₹{t.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FinanceReport;
