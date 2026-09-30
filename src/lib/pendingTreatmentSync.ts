/**
 * Pending Treatment eligibility synchronisation.
 *
 * Clinic Workflow remains the single source of truth for treatment progression.
 * After a successful treatment save, this helper recalculates the treatment
 * status for ONE patient (never a full-table scan) and keeps the plan-level
 * `treatment_plans.status` consistent with the authoritative per-stage rows in
 * `treatment_plan_items`.
 *
 * A patient stays in the Pending Treatment queue while ANY stage of ANY of their
 * treatments is still `pending` or `upcoming`. When no open stage remains the
 * patient is automatically no longer eligible (the queue derives eligibility
 * from these same rows, so no row is deleted and no history is modified).
 */

import { supabase } from "@/integrations/supabase/client";
import { deriveOverallStatus, formatStageLabel, resolveStage } from "@/lib/treatmentStages";

export type PendingTreatmentSyncResult = {
  /** Patient still belongs in the Pending Treatment work queue */
  stillPending: boolean;
  /** Open (pending/upcoming) stage labels, deduped — for messaging only */
  openStages: string[];
  /** Overall status across every active treatment of the patient */
  overallStatus: "completed" | "in_progress" | "pending";
};

const OPEN = new Set(["pending", "upcoming"]);

export const syncPendingTreatmentForPatient = async (
  patientId: string
): Promise<PendingTreatmentSyncResult> => {
  const empty: PendingTreatmentSyncResult = { stillPending: false, openStages: [], overallStatus: "completed" };
  if (!patientId) return empty;

  // 1. Patient-scoped plans only.
  const { data: plans, error: plansError } = await supabase
    .from("treatment_plans")
    .select("id, status")
    .eq("patient_id", patientId);
  if (plansError || !plans || plans.length === 0) return empty;

  const planIds = plans.map((p: any) => p.id);

  // 2. Authoritative per-stage rows for those plans.
  const { data: items, error: itemsError } = await supabase
    .from("treatment_plan_items")
    .select("id, plan_id, treatment_type, status")
    .in("plan_id", planIds);
  if (itemsError) return empty;

  const rows = items || [];

  // 3. Recalculate plan-level status; write ONLY when it actually changed.
  const byPlan = new Map<string, any[]>();
  rows.forEach((it: any) => {
    const list = byPlan.get(it.plan_id) || [];
    list.push(it);
    byPlan.set(it.plan_id, list);
  });

  for (const plan of plans as any[]) {
    const planRows = byPlan.get(plan.id) || [];
    if (planRows.length === 0) continue;
    const derived = planRows.some((r) => OPEN.has(String(r.status))) ? "pending" : "completed";
    if (derived !== plan.status) {
      await supabase.from("treatment_plans").update({ status: derived } as any).eq("id", plan.id);
    }
  }

  // 4. Patient-wide eligibility + next actionable stages (read-only derivation).
  const openRows = rows.filter((r: any) => OPEN.has(String(r.status)));
  const labels = new Map<string, string>();
  openRows.forEach((r: any) => {
    const match = resolveStage(r.treatment_type);
    const label = match && !match.treatmentLevel
      ? `${match.treatment.label} — ${formatStageLabel(r.treatment_type)}`
      : String(r.treatment_type || "").trim();
    if (label) labels.set(label.toLowerCase(), label);
  });

  return {
    stillPending: openRows.length > 0,
    openStages: Array.from(labels.values()),
    overallStatus: deriveOverallStatus(rows as any),
  };
};
