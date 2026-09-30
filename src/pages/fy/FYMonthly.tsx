import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, FY_MONTHS, formatINR } from "@/lib/fyProjection";

export default function FYMonthly() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, master, monthly, loading, load } = useFYData(fy);

  const distributeMonthly = async () => {
    if (!master?.total_revenue_target) return toast({ title: "Set annual target first", variant: "destructive" });
    const perMonthRev = Math.round(master.total_revenue_target / 12);
    const perMonthPat = Math.round((master.total_patient_target || 0) / 12);
    const rows = FY_MONTHS.map(({ num }) => ({
      financial_year: fy, branch_id: branchFilter, month: num,
      revenue_target: perMonthRev, patient_target: perMonthPat,
      implant_target: 0, ortho_target: 0, cosmetic_target: 0, recall_target: 0,
      marketing_budget: 0, salary_budget: 0, operational_cost_budget: 0,
      net_profit_target: Math.round(perMonthRev * 0.25),
    }));
    await supabase.from("fy_monthly_targets").delete().eq("financial_year", fy).eq("branch_id", branchFilter as any);
    const { error } = await supabase.from("fy_monthly_targets").insert(rows);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Monthly targets distributed" });
    load();
  };

  if (!branchFilter) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Monthly Plan" description="Distribute or customize per-month targets" fy={fy} onFYChange={setFY} loading={loading} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle>Monthly Targets</CardTitle><CardDescription>FY {fy}</CardDescription></div>
          <Button onClick={distributeMonthly} variant="outline" size="sm"><Save className="h-4 w-4 mr-2" /> Auto-distribute from Annual</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Revenue Target</TableHead><TableHead>Patients</TableHead><TableHead>Implants</TableHead><TableHead>Ortho</TableHead><TableHead>Cosmetic</TableHead><TableHead>Mkt Budget</TableHead><TableHead>Net Profit</TableHead></TableRow></TableHeader>
            <TableBody>
              {FY_MONTHS.map(({ num, short }) => {
                const m = monthly.find(x => x.month === num);
                return (
                  <TableRow key={num}>
                    <TableCell className="font-medium">{short}</TableCell>
                    <TableCell>{formatINR(m?.revenue_target || 0)}</TableCell>
                    <TableCell>{m?.patient_target || 0}</TableCell>
                    <TableCell>{m?.implant_target || 0}</TableCell>
                    <TableCell>{m?.ortho_target || 0}</TableCell>
                    <TableCell>{m?.cosmetic_target || 0}</TableCell>
                    <TableCell>{formatINR(m?.marketing_budget || 0)}</TableCell>
                    <TableCell>{formatINR(m?.net_profit_target || 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
