import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";

export default function FYRecruitment() {
  const [fy, setFY] = useState(getCurrentFY());
  const recruit = useFYTable("fy_recruitment_targets", fy);
  if (!recruit.branchId) return <NoBranchCard />;
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Recruitment Module" description="Hiring plan & budget" fy={fy} onFYChange={setFY} />
      <Card>
        <CardHeader><CardTitle>Recruitment Submodule</CardTitle><CardDescription>Role-wise hiring targets for the year.</CardDescription></CardHeader>
        <CardContent>
          <Tabs defaultValue="recruit">
            <TabsList className="mb-4"><TabsTrigger value="recruit">👥 Recruitment Target</TabsTrigger></TabsList>
            <TabsContent value="recruit">
              <SimpleCrudTable
                table="fy_recruitment_targets" fy={fy} rows={recruit.rows} onChanged={recruit.reload}
                title="Recruitment Plan"
                fields={[
                  { key: "month", label: "Plan Month", type: "month" },
                  { key: "role_name", label: "Role", type: "text", required: true },
                  { key: "department", label: "Department", type: "text" },
                  { key: "positions_target", label: "Positions", type: "number" },
                  { key: "expected_joining_month", label: "Joining Month", type: "month" },
                  { key: "budget_per_position", label: "Budget/Position", type: "currency" },
                  { key: "total_budget", label: "Total Budget", type: "currency" },
                  { key: "status", label: "Status", type: "select", options: [
                    { value: "planned", label: "Planned" }, { value: "in_progress", label: "In Progress" },
                    { value: "hired", label: "Hired" }, { value: "on_hold", label: "On Hold" }] },
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
