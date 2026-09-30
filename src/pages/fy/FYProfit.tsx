import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, FY_MONTHS, formatINR } from "@/lib/fyProjection";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export default function FYProfit() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, monthly, actuals, profitSummary, loading, refreshActuals } = useFYData(fy);

  const chartData = FY_MONTHS.map(({ num, short }) => {
    const t = monthly.find((m) => m.month === num);
    const a = actuals.find((x) => x.month === num);
    return { month: short, target: Number(t?.revenue_target || 0), actual: Number(a?.actual_revenue || 0) };
  });

  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Profit Forecast" description="Net profit, margin & cost breakdown" fy={fy} onFYChange={setFY} onSync={refreshActuals} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Profit Forecast Summary</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue Target</span><span className="font-semibold">{formatINR(profitSummary?.total_revenue_target || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Salary Expense</span><span>{formatINR(profitSummary?.salary_expense_target || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Marketing Expense</span><span>{formatINR(profitSummary?.marketing_expense_target || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Operational</span><span>{formatINR(profitSummary?.operational_expense_target || 0)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-semibold">Net Profit Target</span><span className="font-bold text-emerald-600">{formatINR(profitSummary?.net_profit_target || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit Margin</span><span>{profitSummary?.profit_margin_target || 0}%</span></div>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer><LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `${(v/100000).toFixed(0)}L`} /><Tooltip formatter={(v: any) => formatINR(v)} />
              <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" name="Actual Revenue" />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" name="Target" />
            </LineChart></ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
