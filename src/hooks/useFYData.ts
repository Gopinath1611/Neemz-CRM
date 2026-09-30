import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { FY_MONTHS } from "@/lib/fyProjection";
import { toast } from "@/hooks/use-toast";

export function useFYData(fy: string) {
  const { currentBranchId } = useBranch();
  const [loading, setLoading] = useState(false);
  const [master, setMaster] = useState<any>(null);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [actuals, setActuals] = useState<any[]>([]);
  const [variance, setVariance] = useState<any[]>([]);
  const [deptTargets, setDeptTargets] = useState<any[]>([]);
  const [chairs, setChairs] = useState<any[]>([]);
  const [staffTargets, setStaffTargets] = useState<any[]>([]);
  const [marketing, setMarketing] = useState<any[]>([]);
  const [expansion, setExpansion] = useState<any[]>([]);
  const [profitSummary, setProfitSummary] = useState<any>(null);

  const branchFilter = currentBranchId;

  const load = useCallback(async () => {
    if (!branchFilter) return;
    setLoading(true);
    try {
      const [m, mt, at, vt, dt, ch, st, mk, ex, ps] = await Promise.all([
        supabase.from("fy_master_plan").select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).maybeSingle(),
        supabase.from("fy_monthly_targets").select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).order("month"),
        supabase.from("fy_actual_tracking").select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).order("month"),
        supabase.from("fy_variance_tracker").select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).order("month"),
        supabase.from("department_projection_targets").select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any),
        supabase.from("chair_utilization_projection").select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).order("month"),
        supabase.from("staff_projection_targets" as any).select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any),
        supabase.from("marketing_projection_plan" as any).select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).order("month"),
        supabase.from("branch_expansion_plan").select("*").eq("financial_year", fy),
        supabase.from("profit_projection_summary" as any).select("*").eq("financial_year", fy).eq("branch_id", branchFilter as any).maybeSingle(),
      ]);
      setMaster(m.data);
      setMonthly(mt.data ?? []);
      setActuals(at.data ?? []);
      setVariance(vt.data ?? []);
      setDeptTargets(dt.data ?? []);
      setChairs(ch.data ?? []);
      setStaffTargets((st as any).data ?? []);
      setMarketing((mk as any).data ?? []);
      setExpansion(ex.data ?? []);
      setProfitSummary((ps as any).data);
    } finally {
      setLoading(false);
    }
  }, [fy, branchFilter]);

  useEffect(() => { load(); }, [load]);

  const refreshActuals = async () => {
    if (!branchFilter) return;
    setLoading(true);
    for (const { num } of FY_MONTHS) {
      await supabase.rpc("recompute_fy_actuals" as any, {
        p_branch_id: branchFilter, p_financial_year: fy, p_month: num,
      });
    }
    toast({ title: "Refreshed", description: "Actual data recomputed." });
    await load();
  };

  return {
    loading, branchFilter,
    master, monthly, actuals, variance, deptTargets, chairs,
    staffTargets, marketing, expansion, profitSummary,
    load, refreshActuals, setMaster,
  };
}
