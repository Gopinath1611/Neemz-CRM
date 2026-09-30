import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, FY_MONTHS } from "@/lib/fyProjection";

export default function FYChair() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, chairs, loading } = useFYData(fy);
  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Chair Utilization" description="Plan chair-hour capacity & expected patient load" fy={fy} onFYChange={setFY} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Chair Utilization Plan</CardTitle><CardDescription>Available hours = chairs × hours/day × working days</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Chairs</TableHead><TableHead>Hrs/Day</TableHead><TableHead>Days</TableHead><TableHead>Available Hrs</TableHead><TableHead>Target %</TableHead><TableHead>Expected Patients</TableHead></TableRow></TableHeader>
            <TableBody>
              {FY_MONTHS.map(({ num, short }) => {
                const c = chairs.find(x => x.month === num);
                return (
                  <TableRow key={num}>
                    <TableCell className="font-medium">{short}</TableCell>
                    <TableCell>{c?.total_chairs || "—"}</TableCell>
                    <TableCell>{c?.working_hours_per_day || "—"}</TableCell>
                    <TableCell>{c?.working_days || "—"}</TableCell>
                    <TableCell>{c?.available_hours || "—"}</TableCell>
                    <TableCell>{c?.target_utilization_percent || 0}%</TableCell>
                    <TableCell>{c?.expected_patient_load || 0}</TableCell>
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
