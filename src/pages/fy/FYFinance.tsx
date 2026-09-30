import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";

export default function FYFinance() {
  const [fy, setFY] = useState(getCurrentFY());
  const fin = useFYTable("fy_finance_targets", fy);
  if (!fin.branchId) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Finance Module" description="Topline, gross profit & net profit targets" fy={fy} onFYChange={setFY} />
      <Card>
        <CardHeader><CardTitle>Finance Submodules</CardTitle><CardDescription>Plan revenue, COGS, gross & net profit per month.</CardDescription></CardHeader>
        <CardContent>
          <Tabs defaultValue="topline">
            <TabsList className="mb-4 flex flex-wrap h-auto">
              <TabsTrigger value="topline">📈 Topline</TabsTrigger>
              <TabsTrigger value="gross">💵 Gross Profit</TabsTrigger>
              <TabsTrigger value="net">💎 Net Profit</TabsTrigger>
            </TabsList>

            <TabsContent value="topline">
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
            </TabsContent>
            <TabsContent value="gross">
              <div className="text-sm text-muted-foreground mb-3">Gross Profit = Topline Revenue − COGS. Edit values from the Topline tab; this view focuses on the gross side.</div>
              <SimpleCrudTable
                table="fy_finance_targets" fy={fy} rows={fin.rows} onChanged={fin.reload}
                title="Gross Profit Plan"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "topline_revenue_target", label: "Revenue", type: "currency" },
                  { key: "cogs_target", label: "COGS", type: "currency" },
                  { key: "gross_profit_target", label: "Gross Profit", type: "currency" },
                  { key: "gross_margin_percent", label: "Margin %", type: "number" },
                ]}
              />
            </TabsContent>
            <TabsContent value="net">
              <div className="text-sm text-muted-foreground mb-3">Net Profit = Gross Profit − Operating Expenses.</div>
              <SimpleCrudTable
                table="fy_finance_targets" fy={fy} rows={fin.rows} onChanged={fin.reload}
                title="Net Profit Plan"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "gross_profit_target", label: "Gross Profit", type: "currency" },
                  { key: "operating_expense_target", label: "OpEx", type: "currency" },
                  { key: "net_profit_target", label: "Net Profit", type: "currency" },
                  { key: "net_margin_percent", label: "Net Margin %", type: "number" },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
