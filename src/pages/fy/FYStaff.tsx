import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, formatINR } from "@/lib/fyProjection";

export default function FYStaff() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, staffTargets, loading } = useFYData(fy);
  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Staff Targets" description="Per-staff productivity goals" fy={fy} onFYChange={setFY} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Staff Productivity Targets</CardTitle></CardHeader>
        <CardContent>
          {staffTargets.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No staff targets set yet.</div> :
          <Table>
            <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Role</TableHead><TableHead>Monthly Revenue</TableHead><TableHead>Conversion %</TableHead><TableHead>Patients</TableHead></TableRow></TableHeader>
            <TableBody>{staffTargets.map(s => <TableRow key={s.id}><TableCell>{s.staff_id?.slice(0,8)}</TableCell><TableCell>{s.role}</TableCell><TableCell>{formatINR(s.monthly_revenue_target)}</TableCell><TableCell>{s.conversion_target}%</TableCell><TableCell>{s.patient_handling_target}</TableCell></TableRow>)}</TableBody>
          </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
