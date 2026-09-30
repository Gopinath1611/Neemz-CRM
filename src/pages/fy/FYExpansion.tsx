import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, FY_MONTHS, formatINR } from "@/lib/fyProjection";

export default function FYExpansion() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, expansion, loading } = useFYData(fy);
  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Branch Expansion" description="New branch launches, investments & break-even" fy={fy} onFYChange={setFY} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Branch Expansion Plan</CardTitle></CardHeader>
        <CardContent>
          {expansion.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No expansion planned for FY {fy}.</div> :
          <Table>
            <TableHeader><TableRow><TableHead>Branch</TableHead><TableHead>Launch</TableHead><TableHead>Chairs</TableHead><TableHead>Investment</TableHead><TableHead>Expected Mo Revenue</TableHead><TableHead>Break-even</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{expansion.map(e => <TableRow key={e.id}><TableCell>{e.new_branch_name}</TableCell><TableCell>{FY_MONTHS.find(x => x.num === e.launch_month)?.short}</TableCell><TableCell>{e.chairs_planned}</TableCell><TableCell>{formatINR(e.investment_required)}</TableCell><TableCell>{formatINR(e.expected_monthly_revenue)}</TableCell><TableCell>Mo {e.break_even_month || "—"}</TableCell><TableCell><Badge variant="outline">{e.status}</Badge></TableCell></TableRow>)}</TableBody>
          </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
