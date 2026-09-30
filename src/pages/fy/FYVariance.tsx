import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, FY_MONTHS, formatINR, varianceColor } from "@/lib/fyProjection";

export default function FYVariance() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, variance, loading, refreshActuals } = useFYData(fy);
  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Variance Tracker" description="Target vs Actual gap analysis" fy={fy} onFYChange={setFY} onSync={refreshActuals} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Variance Tracker</CardTitle><CardDescription>🟢 Green: at/above target · 🟡 Yellow: within 10% · 🔴 Red: below 10%</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Revenue Target</TableHead><TableHead>Actual</TableHead><TableHead>Variance</TableHead><TableHead>Profit Variance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {FY_MONTHS.map(({ num, short }) => {
                const v = variance.find(x => x.month === num);
                if (!v) return <TableRow key={num}><TableCell>{short}</TableCell><TableCell colSpan={5} className="text-muted-foreground text-xs">No data — click Sync Actuals</TableCell></TableRow>;
                return (
                  <TableRow key={num}>
                    <TableCell className="font-medium">{short}</TableCell>
                    <TableCell>{formatINR(v.revenue_target)}</TableCell>
                    <TableCell>{formatINR(v.revenue_actual)}</TableCell>
                    <TableCell className={v.revenue_variance >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatINR(v.revenue_variance)}</TableCell>
                    <TableCell className={v.profit_variance >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatINR(v.profit_variance)}</TableCell>
                    <TableCell><Badge variant="outline" className={varianceColor(v.variance_status)}>{v.variance_status.toUpperCase()}</Badge></TableCell>
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
