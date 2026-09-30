import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, DEPARTMENTS, formatINR } from "@/lib/fyProjection";

export default function FYDepartments() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, deptTargets, loading } = useFYData(fy);
  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Department Targets" description="Per-department revenue & conversion goals" fy={fy} onFYChange={setFY} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Department Projection Targets</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Monthly</TableHead><TableHead>Quarterly</TableHead><TableHead>Yearly</TableHead><TableHead>Conversion %</TableHead><TableHead>Avg Case Value</TableHead></TableRow></TableHeader>
            <TableBody>
              {DEPARTMENTS.map(d => {
                const t = deptTargets.find(x => x.department_name === d);
                return (
                  <TableRow key={d}>
                    <TableCell className="font-medium">{d}</TableCell>
                    <TableCell>{formatINR(t?.monthly_target || 0)}</TableCell>
                    <TableCell>{formatINR(t?.quarterly_target || 0)}</TableCell>
                    <TableCell>{formatINR(t?.yearly_target || 0)}</TableCell>
                    <TableCell>{t?.conversion_target || 0}%</TableCell>
                    <TableCell>{formatINR(t?.avg_case_value_target || 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">Per-department target editing coming in next phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
