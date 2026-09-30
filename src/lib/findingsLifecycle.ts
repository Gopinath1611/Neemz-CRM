// Consultation Findings Lifecycle helpers.
// All writes are ADDITIVE — they never modify or delete dental_chart_entries
// or any existing table. They mirror findings into the immutable
// consultation_findings + finding_status_history audit log.

import { supabase } from "@/integrations/supabase/client";


export type FindingStatus =
  | "active"
  | "continuing"
  | "monitoring"
  | "resolved"
  | "recurred"
  | "reopened"
  | "closed";

export interface ConsultationFinding {
  id: string;
  patient_id: string;
  checkin_id: string | null;
  appointment_id: string | null;
  chart_id: string | null;
  chart_entry_id: string | null;
  parent_finding_id: string | null;
  linked_treatment_plan_item_id: string | null;
  tooth_number: number | null;
  surface: string | null;
  condition: string;
  diagnosis: string | null;
  treatment_needed: string | null;
  notes: string | null;
  doctor: string | null;
  recorded_at: string;
  created_by: string | null;
  created_at: string;
  // Cache columns (synced from finding_status_history via DB trigger).
  current_status: FindingStatus;
  is_active: boolean;
  last_updated_at: string;
}

export interface FindingHistoryRow {
  id: string;
  finding_id: string;
  patient_id: string;
  checkin_id: string | null;
  appointment_id: string | null;
  doctor: string | null;
  previous_status: FindingStatus | null;
  new_status: FindingStatus;
  progress_note: string | null;
  updated_by: string | null;
  event_date: string;
  created_at: string;
}

export interface OpenFinding extends ConsultationFinding {
  latest_status: FindingStatus;
  last_event_date: string;
}

interface ToothLikeEntry {
  tooth_number?: number | null;
  surface?: string | null;
  condition: string;
  treatment_needed?: string | null;
  notes?: string | null;
}

interface GeneralFinding {
  condition: string;
  treatment_needed?: string | null;
}

const sb = supabase as any;

const norm = (v: unknown) =>
  String(v ?? "").trim().toLowerCase();

const keyOf = (tooth: number | null, surface: string | null, condition: string) =>
  `${tooth ?? "GEN"}|${norm(surface)}|${norm(condition)}`;

/**
 * Fetch all findings for a patient using the cached current_status / is_active
 * / last_updated_at columns. The history table remains the source of truth;
 * these columns are kept in sync by the `trg_refresh_finding_cache` trigger.
 */
export async function fetchOpenFindings(patientId: string): Promise<OpenFinding[]> {
  const { data: findings, error } = await sb
    .from("consultation_findings")
    .select("*")
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: false });

  if (error || !findings) return [];

  return (findings as ConsultationFinding[]).map((f) => ({
    ...f,
    latest_status: f.current_status,
    last_event_date: f.last_updated_at,
  }));
}

/**
 * Fetch the complete history for a patient (all timeline events).
 */
export async function fetchFindingsTimeline(patientId: string): Promise<{
  findings: ConsultationFinding[];
  history: FindingHistoryRow[];
}> {
  const [{ data: findings }, { data: history }] = await Promise.all([
    sb.from("consultation_findings").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: true }),
    sb.from("finding_status_history").select("*").eq("patient_id", patientId).order("event_date", { ascending: true }),
  ]);
  return {
    findings: (findings || []) as ConsultationFinding[],
    history: (history || []) as FindingHistoryRow[],
  };
}

const CLOSED_STATUSES: FindingStatus[] = ["resolved", "closed"];

/**
 * Mirror in-memory tooth/general findings into consultation_findings.
 *
 * Duplicate detection:
 *   - Look up cached `current_status` per (patient, tooth, surface, condition).
 *   - If an open finding exists (current_status NOT IN ('resolved','closed') → is_active=true),
 *     skip — never create a duplicate active finding.
 *   - If the latest matching finding is closed (resolved/closed), create a NEW
 *     consultation_finding and set `parent_finding_id` to the closed one.
 *     This preserves the timeline AND records the recurrence relationship.
 *   - Never modifies existing rows or history.
 */
export async function syncFindingsFromChart(opts: {
  patientId: string;
  checkinId: string | null;
  appointmentId: string | null;
  chartId: string | null;
  doctor: string | null;
  recordedAtISO: string;
  toothEntries: ToothLikeEntry[];
  generalFindings: GeneralFinding[];
}): Promise<{ inserted: number; skipped: number; recurrences: number }> {
  // Pull all prior findings (cache fields included).
  const prior = await fetchOpenFindings(opts.patientId);

  // Index by (tooth, surface, condition): latest record wins. fetchOpenFindings
  // already returns rows ordered by recorded_at DESC.
  const latestByKey = new Map<string, OpenFinding>();
  prior.forEach((p) => {
    const k = keyOf(p.tooth_number, p.surface, p.condition);
    if (!latestByKey.has(k)) latestByKey.set(k, p);
  });

  const candidates: Array<{
    tooth_number: number | null;
    surface: string | null;
    condition: string;
    treatment_needed: string | null;
    notes: string | null;
  }> = [];

  opts.toothEntries.forEach((e) => {
    if (!e.condition || norm(e.condition) === "healthy") return;
    candidates.push({
      tooth_number: e.tooth_number ?? null,
      surface: e.surface || null,
      condition: e.condition,
      treatment_needed: e.treatment_needed || null,
      notes: e.notes || null,
    });
  });

  opts.generalFindings.forEach((g) => {
    if (!g.condition) return;
    candidates.push({
      tooth_number: null,
      surface: null,
      condition: g.condition,
      treatment_needed: g.treatment_needed || null,
      notes: null,
    });
  });

  let inserted = 0;
  let skipped = 0;
  let recurrences = 0;

  const { data: userData } = await sb.auth.getUser();
  const createdBy = userData?.user?.id ?? null;

  for (const c of candidates) {
    const k = keyOf(c.tooth_number, c.surface, c.condition);
    const latest = latestByKey.get(k);

    // Open finding already exists → skip (no duplicate active row).
    if (latest && latest.is_active !== false && !CLOSED_STATUSES.includes(latest.current_status)) {
      skipped++;
      continue;
    }

    // Closed latest → record this as a RECURRENCE, link to the prior finding.
    const parentId = latest && CLOSED_STATUSES.includes(latest.current_status) ? latest.id : null;

    const { data: newRow, error } = await sb
      .from("consultation_findings")
      .insert({
        patient_id: opts.patientId,
        checkin_id: opts.checkinId,
        appointment_id: opts.appointmentId,
        chart_id: opts.chartId,
        parent_finding_id: parentId,
        tooth_number: c.tooth_number,
        surface: c.surface,
        condition: c.condition,
        treatment_needed: c.treatment_needed,
        notes: c.notes,
        doctor: opts.doctor,
        recorded_at: opts.recordedAtISO,
        created_by: createdBy,
      })
      .select("id")
      .single();

    if (error || !newRow) continue;
    inserted++;

    // If this is a recurrence, immediately append a 'recurred' event so the
    // timeline reflects it (the seed trigger already created the 'active' row,
    // so we add a second event that captures the recurrence semantics).
    if (parentId) {
      recurrences++;
      await sb.from("finding_status_history").insert({
        finding_id: newRow.id,
        patient_id: opts.patientId,
        checkin_id: opts.checkinId,
        appointment_id: opts.appointmentId,
        doctor: opts.doctor,
        previous_status: "active",
        new_status: "recurred",
        progress_note: latest ? `Recurrence of finding originally recorded on ${new Date(latest.recorded_at).toISOString().slice(0, 10)}` : null,
        updated_by: createdBy,
        event_date: opts.recordedAtISO,
      });
    }

    // Update the local index so multiple candidates for the same key in
    // one save don't create a second duplicate.
    latestByKey.set(k, {
      ...(latest || ({} as OpenFinding)),
      id: newRow.id,
      patient_id: opts.patientId,
      tooth_number: c.tooth_number,
      surface: c.surface,
      condition: c.condition,
      current_status: parentId ? "recurred" : "active",
      is_active: true,
      last_updated_at: opts.recordedAtISO,
      recorded_at: opts.recordedAtISO,
      latest_status: parentId ? "recurred" : "active",
      last_event_date: opts.recordedAtISO,
    } as OpenFinding);
  }

  return { inserted, skipped, recurrences };
}

/**
 * Append a status event (Continue / Resolved / Monitoring / Recurred / Reopened / Progress Note).
 * Always inserts a new row — never modifies prior events.
 */
export async function addStatusEvent(opts: {
  findingId: string;
  patientId: string;
  checkinId?: string | null;
  appointmentId?: string | null;
  doctor?: string | null;
  previousStatus?: FindingStatus | null;
  newStatus: FindingStatus;
  progressNote?: string | null;
  eventDateISO?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: userData } = await sb.auth.getUser();
  const updatedBy = userData?.user?.id ?? null;

  const { error } = await sb.from("finding_status_history").insert({
    finding_id: opts.findingId,
    patient_id: opts.patientId,
    checkin_id: opts.checkinId ?? null,
    appointment_id: opts.appointmentId ?? null,
    doctor: opts.doctor ?? null,
    previous_status: opts.previousStatus ?? null,
    new_status: opts.newStatus,
    progress_note: opts.progressNote ?? null,
    updated_by: updatedBy,
    event_date: opts.eventDateISO ?? new Date().toISOString(),
  });

  return { ok: !error, error: error?.message };
}

export const STATUS_LABEL: Record<FindingStatus, string> = {
  active: "Active",
  continuing: "Continuing Treatment",
  monitoring: "Monitoring",
  resolved: "Resolved",
  recurred: "Recurred",
  reopened: "Reopened",
  closed: "Closed",
};

export const STATUS_COLOR: Record<FindingStatus, string> = {
  active: "bg-amber-100 text-amber-800 border-amber-300",
  continuing: "bg-blue-100 text-blue-800 border-blue-300",
  monitoring: "bg-purple-100 text-purple-800 border-purple-300",
  resolved: "bg-green-100 text-green-800 border-green-300",
  recurred: "bg-rose-100 text-rose-800 border-rose-300",
  reopened: "bg-orange-100 text-orange-800 border-orange-300",
  closed: "bg-slate-100 text-slate-800 border-slate-300",
};
