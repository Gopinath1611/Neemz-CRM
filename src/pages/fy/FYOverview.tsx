import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import MasterPlanForm from "@/components/fy/MasterPlanForm";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, formatINR, FY_MONTHS, DEPARTMENTS } from "@/lib/fyProjection";
import { Target, TrendingUp, Activity, PieChart as PieIcon, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function FYOverview() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, master, monthly, actuals, deptTargets, variance, loading, refreshActuals, load } = useFYData(fy);

  const totalTargetRev = monthly.reduce((s, m) => s + Number(m.revenue_target || 0), 0);
  const totalActualRev = actuals.reduce((s, a) => s + Number(a.actual_revenue || 0), 0);
  const totalActualProfit = actuals.reduce((s, a) => s + Number(a.actual_profit || 0), 0);
  const yearProgress = totalTargetRev ? (totalActualRev / totalTargetRev) * 100 : 0;
  const forecastYearEnd = actuals.length > 0 ? (totalActualRev / actuals.length) * 12 : 0;

  const chartData = FY_MONTHS.map(({ num, short }) => {
    const t = monthly.find((m) => m.month === num);
    const a = actuals.find((x) => x.month === num);
    return { month: short, target: Number(t?.revenue_target || 0), actual: Number(a?.actual_revenue || 0) };
  });

  const deptPie = DEPARTMENTS.map((d) => {
    const t = deptTargets.find((x) => x.department_name === d);
    return { name: d, value: Number(t?.yearly_target || 0) };
  }).filter((x) => x.value > 0);

  const alerts: string[] = [];
  variance.forEach((v) => {
    if (v.revenue_target && v.revenue_actual < v.revenue_target * 0.85) {
      alerts.push(`${FY_MONTHS.find((m) => m.num === v.month)?.short}: Revenue at ${Math.round((v.revenue_actual / v.revenue_target) * 100)}% (below 85% target)`);
    }
  });

  const saveMaster = async (data: any) => {
    const payload = { ...data, financial_year: fy, branch_id: branchFilter };
    const { error } = master?.id
      ? await supabase.from("fy_master_plan").update(payload).eq("id", master.id)
      : await supabase.from("fy_master_plan").insert(payload);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
    load();
  };

  if (!branchFilter) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="FY Overview" description="Annual master plan & high-level KPIs" fy={fy} onFYChange={setFY} onSync={refreshActuals} loading={loading} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Target className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">Annual Target</div><div className="text-xl font-bold">{formatINR(master?.total_revenue_target || 0)}</div></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Actual YTD</div><div className="text-xl font-bold">{formatINR(totalActualRev)}</div><div className="text-xs text-muted-foreground">{yearProgress.toFixed(1)}% of target</div></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Activity className="h-8 w-8 text-amber-600" /><div><div className="text-xs text-muted-foreground">Forecast Year-End</div><div className="text-xl font-bold">{formatINR(forecastYearEnd)}</div></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><PieIcon className="h-8 w-8 text-violet-600" /><div><div className="text-xs text-muted-foreground">Profit YTD</div><div className="text-xl font-bold">{formatINR(totalActualProfit)}</div></div></div></CardContent></Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2 text-rose-700"><AlertTriangle className="h-4 w-4" /> Active Alerts ({alerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1">{alerts.slice(0, 5).map((a, i) => <div key={i} className="text-sm">⚠ {a}</div>)}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Annual Master Plan</CardTitle><CardDescription>Set top-level targets for FY {fy}</CardDescription></CardHeader>
        <CardContent><MasterPlanForm initial={master} onSave={saveMaster} /></CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Target vs Actual Revenue</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            <ResponsiveContainer><BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `${(v/100000).toFixed(0)}L`} /><Tooltip formatter={(v: any) => formatINR(v)} /><Legend />
              <Bar dataKey="target" fill="hsl(var(--muted-foreground))" name="Target" />
              <Bar dataKey="actual" fill="hsl(var(--primary))" name="Actual" />
            </BarChart></ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Department Contribution (Yearly Target)</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            {deptPie.length === 0 ? <div className="text-center text-sm text-muted-foreground py-12">Add department targets to see breakdown</div> :
            <ResponsiveContainer><PieChart>
              <Pie data={deptPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                {deptPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip formatter={(v: any) => formatINR(v)} />
            </PieChart></ResponsiveContainer>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
