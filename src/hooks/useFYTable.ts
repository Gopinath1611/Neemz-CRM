import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";

export function useFYTable(table: string, fy: string) {
  const { currentBranchId } = useBranch();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentBranchId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from(table)
      .select("*")
      .eq("financial_year", fy)
      .eq("branch_id", currentBranchId)
      .order("month", { ascending: true });
    setRows(data || []);
    setLoading(false);
  }, [table, fy, currentBranchId]);

  useEffect(() => { load(); }, [load]);
  return { rows, loading, reload: load, branchId: currentBranchId };
}
