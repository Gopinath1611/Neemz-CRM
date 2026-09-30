import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";

export default function FYSales() {
  const [fy, setFY] = useState(getCurrentFY());
  const sales = useFYTable("fy_sales_targets", fy);
  if (!sales.branchId) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Sales Module" description="Lead conversion, opportunity & closure targets" fy={fy} onFYChange={setFY} />
      <Card>
        <CardHeader><CardTitle>Sales Submodule</CardTitle><CardDescription>Monthly sales pipeline targets.</CardDescription></CardHeader>
        <CardContent>
          <Tabs defaultValue="sales">
            <TabsList className="mb-4"><TabsTrigger value="sales">💰 Sales Target</TabsTrigger></TabsList>
            <TabsContent value="sales">
              <SimpleCrudTable
                table="fy_sales_targets" fy={fy} rows={sales.rows} onChanged={sales.reload}
                title="Sales Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "total_lead_target", label: "Total Leads", type: "number" },
                  { key: "qualified_lead_target", label: "Qualified Leads", type: "number" },
                  { key: "conversion_rate_target", label: "Conversion %", type: "number" },
                  { key: "opportunity_value_target", label: "Opp. Value", type: "currency" },
                  { key: "closures_target", label: "Closures", type: "number" },
                  { key: "closed_revenue_target", label: "Closed Revenue", type: "currency" },
                  { key: "responsible_person", label: "Responsible", type: "text" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
