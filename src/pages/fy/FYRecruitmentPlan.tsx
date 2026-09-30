import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import FYRoiDashboard, { FYRoiCategory } from "@/components/fy/FYRoiDashboard";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";

export default function FYRecruitmentPlan() {
  const [fy, setFY] = useState(getCurrentFY());
  const recruit = useFYTable("fy_recruitment_targets", fy);
  const [categories, setCategories] = useState<FYRoiCategory[]>([]);

  // Categories = roles user has actually added targets for
  useEffect(() => {
    const map = new Map<string, FYRoiCategory>();
    (recruit.rows ?? []).forEach((r: any) => {
      const k = (r.role_name ?? "").toString().trim();
      if (!k) return;
      if (!map.has(k.toLowerCase())) map.set(k.toLowerCase(), { key: k.toLowerCase(), label: k });
    });
    setCategories(Array.from(map.values()));
  }, [recruit.rows]);

  if (!recruit.branchId) return <NoBranchCard />;

  // Normalize role mapping (case-insensitive against designation/department)
  const matchRole = (emp: any, key: string) => {
    const k = key.toLowerCase();
    const d = (emp.designation ?? "").toString().toLowerCase();
    const dept = (emp.department ?? "").toString().toLowerCase();
    return d.includes(k) || k.includes(d) || dept.includes(k);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader
        title="👥 Recruitment Target"
        description="Role-wise hiring plan vs actual joinings (auto-tracked from employees)"
        fy={fy}
        onFYChange={setFY}
      />

      <FYRoiDashboard
        rows={recruit.rows}
        fy={fy}
        categoryField="role_name"
        spendField="budget_per_position"
        revenueField="total_budget"
        leadsField="positions_target"
        categories={categories}
        primaryMetricLabel="Hiring Budget"
        enableCategoryFilter
        categoryFilterLabel="Role"
        fetchRangeActuals={async (start, end) => {
          const { data } = await (supabase as any)
            .from("employees")
            .select("designation, department, base_salary, join_date, status")
            .gte("join_date", start.toISOString().slice(0, 10))
            .lte("join_date", end.toISOString().slice(0, 10));
          const spend: Record<string, number> = {};
          const leads: Record<string, number> = {};
          (data ?? []).forEach((e: any) => {
            categories.forEach((c) => {
              if (matchRole(e, c.key)) {
                spend[c.key] = (spend[c.key] ?? 0) + Number(e.base_salary ?? 0);
                leads[c.key] = (leads[c.key] ?? 0) + 1;
              }
            });
          });
          return { spend, revenue: spend, leads, conversions: leads };
        }}
        fetchMonthlyActuals={async (fyArg) => {
          const startYear = parseInt(fyArg.split("-")[0], 10);
          const start = new Date(startYear, 3, 1);
          const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
          const { data } = await (supabase as any)
            .from("employees")
            .select("designation, department, base_salary, join_date")
            .gte("join_date", start.toISOString().slice(0, 10))
            .lte("join_date", end.toISOString().slice(0, 10));
          const spend: Record<number, Record<string, number>> = {};
          const leads: Record<number, Record<string, number>> = {};
          (data ?? []).forEach((e: any) => {
            if (!e.join_date) return;
            const m = new Date(e.join_date).getMonth() + 1;
            spend[m] = spend[m] || {};
            leads[m] = leads[m] || {};
            categories.forEach((c) => {
              if (matchRole(e, c.key)) {
                spend[m][c.key] = (spend[m][c.key] ?? 0) + Number(e.base_salary ?? 0);
                leads[m][c.key] = (leads[m][c.key] ?? 0) + 1;
              }
            });
          });
          return { spend, revenue: spend, leads, conversions: leads };
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Manage Recruitment Targets</CardTitle>
          <CardDescription>Plan role-wise hiring targets, joining month and budget for the year.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
