import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import { useFYData } from "@/hooks/useFYData";
import { getCurrentFY, FY_MONTHS, MARKETING_CHANNELS, formatINR } from "@/lib/fyProjection";

export default function FYMarketing() {
  const [fy, setFY] = useState(getCurrentFY());
  const { branchFilter, marketing, loading } = useFYData(fy);
  if (!branchFilter) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Marketing Plan" description="Channel-wise campaign budgets & ROI targets" fy={fy} onFYChange={setFY} loading={loading} />
      <Card>
        <CardHeader><CardTitle>Marketing Projection Plan</CardTitle><CardDescription>Channels: {MARKETING_CHANNELS.map(c => c.label).join(" · ")}</CardDescription></CardHeader>
        <CardContent>
          {marketing.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No campaigns planned yet.</div> :
          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Budget</TableHead><TableHead>Lead Target</TableHead><TableHead>ROI %</TableHead></TableRow></TableHeader>
            <TableBody>{marketing.map(m => <TableRow key={m.id}><TableCell>{FY_MONTHS.find(x => x.num === m.month)?.short}</TableCell><TableCell>{m.campaign_name}</TableCell><TableCell>{m.channel}</TableCell><TableCell>{formatINR(m.budget_allocated)}</TableCell><TableCell>{m.lead_target}</TableCell><TableCell>{m.expected_roi_percent}%</TableCell></TableRow>)}</TableBody>
          </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
