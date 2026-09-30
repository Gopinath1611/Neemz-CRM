/**
 * Treatment stage progression catalog.
 *
 * Multi-visit dental treatments are recorded in `treatment_plan_items` as one row
 * per clinical stage (this is the existing architecture — no schema change).
 * This module is the single place that knows which stages belong to which
 * treatment and in what order, so Clinic Workflow can advance a treatment one
 * stage at a time and derive the overall treatment status.
 */

export type StagedTreatment = {
  /** Stable key */
  key: string;
  /** Display label of the overall treatment */
  label: string;
  /** Ordered clinical stages */
  stages: string[];
  /** Extra names that mean "the whole treatment" (not a stage) */
  aliases?: string[];
};

export const STAGED_TREATMENTS: StagedTreatment[] = [
  {
    key: "root_canal",
    label: "Root Canal Treatment",
    stages: ["Access Opening", "BMP", "Obturation"],
    aliases: ["rct", "root canal", "root canal treatment", "endodontic treatment"],
  },
  {
    key: "crown",
    label: "Crown",
    stages: ["Tooth Preparation", "Impression", "Crown Trial", "Crown Cementation"],
    aliases: ["crown", "cap", "crown & bridge", "crown and bridge", "bridge"],
  },
  {
    key: "implant",
    label: "Implant",
    stages: ["Implant Placement", "Healing", "Abutment", "Crown Fixing"],
    aliases: ["implant", "dental implant"],
  },
];

const norm = (v?: string | null) =>
  (v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Stage aliases → canonical stage label (helps legacy spellings) */
const STAGE_ALIASES: Record<string, string> = {
  "access opening": "Access Opening",
  "access cavity": "Access Opening",
  bmp: "BMP",
  "biomechanical preparation": "BMP",
  "bio mechanical preparation": "BMP",
  "canal preparation": "BMP",
  obturation: "Obturation",
  "gp filling": "Obturation",
  "tooth preparation": "Tooth Preparation",
  "crown preparation": "Tooth Preparation",
  "tooth prep": "Tooth Preparation",
  impression: "Impression",
  "crown impression": "Impression",
  "crown trial": "Crown Trial",
  "crown cementation": "Crown Cementation",
  cementation: "Crown Cementation",
  "implant placement": "Implant Placement",
  healing: "Healing",
  abutment: "Abutment",
  "abutment placement": "Abutment",
  "crown fixing": "Crown Fixing",
};

export type StageMatch = {
  treatment: StagedTreatment;
  /** Canonical stage label, null when the row names the whole treatment */
  stage: string | null;
  /** Index of the stage in the treatment (0-based); 0 when treatment-level */
  stageIndex: number;
  /** True when the row names the whole treatment rather than a single stage */
  treatmentLevel: boolean;
};

/** Resolve a `treatment_type` value to its staged treatment + stage position. */
export const resolveStage = (treatmentType?: string | null): StageMatch | null => {
  const n = norm(treatmentType);
  if (!n) return null;

  const canonicalStage = STAGE_ALIASES[n];
  if (canonicalStage) {
    const treatment = STAGED_TREATMENTS.find((t) => t.stages.includes(canonicalStage));
    if (treatment) {
      return {
        treatment,
        stage: canonicalStage,
        stageIndex: treatment.stages.indexOf(canonicalStage),
        treatmentLevel: false,
      };
    }
  }

  for (const treatment of STAGED_TREATMENTS) {
    const stageHit = treatment.stages.find((s) => norm(s) === n);
    if (stageHit) {
      return { treatment, stage: stageHit, stageIndex: treatment.stages.indexOf(stageHit), treatmentLevel: false };
    }
  }

  for (const treatment of STAGED_TREATMENTS) {
    const names = [treatment.label, ...(treatment.aliases || [])].map(norm);
    if (names.includes(n)) {
      return { treatment, stage: null, stageIndex: 0, treatmentLevel: true };
    }
  }

  return null;
};

/** True when the treatment_type belongs to a multi-stage treatment. */
export const isStagedTreatment = (treatmentType?: string | null) => resolveStage(treatmentType) !== null;

/**
 * Next clinical stage that becomes actionable once `treatmentType` is completed.
 * Returns null for single-visit treatments and for the final stage.
 */
export const getNextStage = (treatmentType?: string | null): string | null => {
  const match = resolveStage(treatmentType);
  if (!match) return null;
  // A treatment-level row ("Root Canal Treatment") completing means its first stage is done.
  const nextIndex = match.treatmentLevel ? 1 : match.stageIndex + 1;
  return match.treatment.stages[nextIndex] ?? null;
};

/** True when completing this row completes the whole treatment. */
export const isFinalStage = (treatmentType?: string | null) => {
  const match = resolveStage(treatmentType);
  if (!match) return true;
  return getNextStage(treatmentType) === null;
};

/** Human label of the overall treatment ("Root Canal Treatment"), or the raw name. */
export const getTreatmentLabel = (treatmentType?: string | null) =>
  resolveStage(treatmentType)?.treatment.label ?? (treatmentType || "");

/** "Access Opening (2/3)" style label for read-only displays. */
export const formatStageLabel = (treatmentType?: string | null): string => {
  const match = resolveStage(treatmentType);
  if (!match || match.treatmentLevel || !match.stage) return treatmentType || "";
  return `${match.stage} (${match.stageIndex + 1}/${match.treatment.stages.length})`;
};

/** Overall status of a treatment given its stage rows. */
export const deriveOverallStatus = (
  rows: Array<{ treatment_type?: string | null; status?: string | null }>
): "completed" | "in_progress" | "pending" => {
  const hasCompleted = rows.some((r) => r.status === "completed");
  const hasOpen = rows.some((r) => r.status === "pending" || r.status === "upcoming");
  if (hasOpen && hasCompleted) return "in_progress";
  if (hasOpen) return "pending";
  return "completed";
};
