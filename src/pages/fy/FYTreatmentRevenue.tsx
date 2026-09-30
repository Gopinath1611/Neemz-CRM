import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import FYRoiDashboard, { FYRoiCategory } from "@/components/fy/FYRoiDashboard";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { supabase } from "@/integrations/supabase/client";

export default function FYTreatmentRevenue() {
  const [fy, setFY] = useState(getCurrentFY());
  const t = useFYTable("fy_treatment_revenue_targets", fy);
  const { treatmentOptions } = useClinicMasters();
  const [categories, setCategories] = useState<FYRoiCategory[]>([]);

  // Categories = treatments user has actually added targets for (no defaults)
  useEffect(() => {
    const labelByKey = new Map<string, string>();
    (treatmentOptions ?? []).forEach(o => labelByKey.set(o.value, o.label));
    const fromTargets = new Map<string, FYRoiCategory>();
    (t.rows ?? []).forEach((r: any) => {
      const k = (r.treatment ?? "").toString();
      if (!k) return;
      if (!fromTargets.has(k)) fromTargets.set(k, { key: k, label: labelByKey.get(k) ?? k });
    });
    setCategories(Array.from(fromTargets.values()));
  }, [treatmentOptions, t.rows]);

  if (!t.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🦷 Treatment-wise Revenue" description="Revenue per treatment — Target vs Achieved (auto-tracked from billings)" fy={fy} onFYChange={setFY} />

      <FYRoiDashboard
        rows={t.rows}
        fy={fy}
        categoryField="treatment"
        spendField="avg_case_value"
        revenueField="revenue_target"
        leadsField="case_count_target"
        categories={categories}
        primaryMetricLabel="Revenue"
        enableCategoryFilter
        categoryFilterLabel="Treatment"
        fetchRangeActuals={async (start, end) => {
          const { data } = await (supabase as any)
            .from("billing_items")
            .select("treatment_type, total_price, created_at")
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString());
          const revenue: Record<string, number> = {};
          const leads: Record<string, number> = {};
          (data ?? []).forEach((b: any) => {
            const k = (b.treatment_type ?? "").toString();
            if (!k) return;
            revenue[k] = (revenue[k] ?? 0) + Number(b.total_price ?? 0);
            leads[k] = (leads[k] ?? 0) + 1;
          });
          // Spend (cost) for treatment isn't tracked at item level — return 0s
          return { revenue, leads, spend: {}, conversions: {} };
        }}
        fetchMonthlyActuals={async (fyArg) => {
          const startYear = parseInt(fyArg.split("-")[0], 10);
          const start = new Date(startYear, 3, 1);
          const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
          const { data } = await (supabase as any)
            .from("billing_items")
            .select("treatment_type, total_price, created_at")
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString());
          const revenue: Record<number, Record<string, number>> = {};
          const leads: Record<number, Record<string, number>> = {};
          (data ?? []).forEach((b: any) => {
            const m = new Date(b.created_at).getMonth() + 1;
            const k = (b.treatment_type ?? "").toString();
            if (!k) return;
            revenue[m] = revenue[m] || {};
            leads[m] = leads[m] || {};
            revenue[m][k] = (revenue[m][k] ?? 0) + Number(b.total_price ?? 0);
            leads[m][k] = (leads[m][k] ?? 0) + 1;
          });
          return { revenue, leads, spend: {}, conversions: {} };
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Manage Treatment Revenue Targets</CardTitle>
          <CardDescription>Plan monthly revenue, case count and average case value for each treatment.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_treatment_revenue_targets" fy={fy} rows={t.rows} onChanged={t.reload}
            title="Treatment Revenue Plan"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "treatment", label: "Treatment", type: "treatment_select" },
              { key: "case_count_target", label: "Cases Target", type: "number" },
              { key: "avg_case_value", label: "Avg Case Value", type: "currency" },
              { key: "revenue_target", label: "Revenue Target", type: "currency" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
