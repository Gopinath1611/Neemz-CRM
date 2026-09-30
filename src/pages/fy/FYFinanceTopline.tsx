import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";

export default function FYFinanceTopline() {
  const [fy, setFY] = useState(getCurrentFY());
  const fin = useFYTable("fy_finance_targets", fy);
  if (!fin.branchId) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="📈 Topline Revenue" description="Monthly topline revenue, COGS & operating expense" fy={fy} onFYChange={setFY} />
      <Card>
        <CardHeader><CardTitle>Topline Targets</CardTitle><CardDescription>Plan revenue & cost lines per month.</CardDescription></CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_finance_targets" fy={fy} rows={fin.rows} onChanged={fin.reload}
            title="Topline Revenue Target"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "topline_revenue_target", label: "Topline Revenue", type: "currency" },
              { key: "cogs_target", label: "COGS", type: "currency" },
              { key: "gross_profit_target", label: "Gross Profit", type: "currency" },
              { key: "gross_margin_percent", label: "Gross Margin %", type: "number" },
              { key: "operating_expense_target", label: "OpEx", type: "currency" },
              { key: "net_profit_target", label: "Net Profit", type: "currency" },
              { key: "net_margin_percent", label: "Net Margin %", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
