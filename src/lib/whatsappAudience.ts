// Builds real WhatsApp broadcast audiences from Patients and Leads.
//
// Reporting/read-only: nothing here sends messages. It resolves a segment into
// a de-duplicated, valid, WhatsApp-reachable list of phone numbers so the
// campaign modal can show a truthful recipient count.

import { supabase } from "@/integrations/supabase/client";
import { isValidWhatsAppFormat, normalizeWhatsAppPhone, NOT_ON_WHATSAPP_MESSAGE } from "@/lib/whatsappNumberCheck";

/** Tier 1 Meta messaging limit — used only as a warning threshold. */
export const DAILY_SEND_LIMIT = 1000;

export type SegmentKind =
  | "patients_all"
  | "leads_all"
  | "treatment"
  | "patients_inactive_6m"
  | "custom";

export interface AudienceContact {
  name: string;
  phone: string; // normalised, digits only (e.g. 919876543210)
  origin: "patient" | "lead" | "custom";
}

export interface AudienceResult {
  contacts: AudienceContact[];
  /** Rows scanned before any filtering. */
  scanned: number;
  invalid: number;
  duplicates: number;
  blocked: number;
  /** Compact descriptor stored on whatsapp_campaigns.target_segment */
  descriptor: string;
  label: string;
}

export interface CustomAudienceHandover {
  label: string;
  origin: "patient" | "lead" | "custom";
  contacts: { name: string; phone: string }[];
}

const HANDOVER_KEY = "wa-campaign-audience";

/** Stash a custom list (from Patient Database / Contacts) for the campaign modal. */
export const stashCustomAudience = (payload: CustomAudienceHandover) => {
  try {
    sessionStorage.setItem(HANDOVER_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
};

/** Read + clear a stashed custom list. */
export const takeCustomAudience = (): CustomAudienceHandover | null => {
  try {
    const raw = sessionStorage.getItem(HANDOVER_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOVER_KEY);
    const parsed = JSON.parse(raw) as CustomAudienceHandover;
    if (!parsed || !Array.isArray(parsed.contacts)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const CHUNK = 1000;

/** Page through a table so the 1,000-row cap never silently truncates data. */
async function fetchAllRows<T = any>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(from, from + CHUNK - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

/** Numbers known to be unreachable on WhatsApp (blocklist + past 131026 failures). */
async function fetchUnreachable(phones: string[]): Promise<Set<string>> {
  const unreachable = new Set<string>();
  const unique = Array.from(new Set(phones));
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const [{ data: blocked }, { data: failed }] = await Promise.all([
      (supabase as any)
        .from("whatsapp_blocked_numbers")
        .select("wa_phone")
        .in("wa_phone", chunk)
        .eq("blocked", true),
      (supabase as any)
        .from("whatsapp_messages")
        .select("recipient_phone")
        .in("recipient_phone", chunk)
        .eq("error_code", "131026"),
    ]);
    (blocked || []).forEach((r: any) => unreachable.add(String(r.wa_phone)));
    (failed || []).forEach((r: any) => unreachable.add(String(r.recipient_phone)));
  }
  return unreachable;
}

const last10 = (phone: string) => phone.slice(-10);

interface RawContact {
  name: string;
  phone: string | null | undefined;
  origin: AudienceContact["origin"];
}

/** Normalise → drop invalid → dedupe on last 10 digits → drop unreachable. */
async function refineContacts(raw: RawContact[]): Promise<Omit<AudienceResult, "descriptor" | "label">> {
  const scanned = raw.length;
  let invalid = 0;
  let duplicates = 0;
  const seen = new Map<string, AudienceContact>();

  raw.forEach((r) => {
    const phone = normalizeWhatsAppPhone(r.phone);
    if (!phone || !isValidWhatsAppFormat(phone)) {
      invalid += 1;
      return;
    }
    const key = last10(phone);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.set(key, { name: r.name || "", phone, origin: r.origin });
  });

  const candidates = Array.from(seen.values());
  const unreachable = await fetchUnreachable(candidates.map((c) => c.phone));
  const contacts = candidates.filter((c) => !unreachable.has(c.phone));

  return {
    contacts,
    scanned,
    invalid,
    duplicates,
    blocked: candidates.length - contacts.length,
  };
}

const patientRows = () =>
  fetchAllRows<any>((from, to) =>
    supabase
      .from("patients")
      .select("id, first_name, last_name, phone")
      .not("phone", "is", null)
      .range(from, to),
  );

const leadRows = (treatment?: string) =>
  fetchAllRows<any>((from, to) => {
    let q = supabase.from("leads").select("id, name, phone, treatment_interest").not("phone", "is", null);
    if (treatment) q = q.eq("treatment_interest", treatment);
    return q.range(from, to);
  });

const patientName = (p: any) => `${p.first_name || ""} ${p.last_name || ""}`.trim();

async function patientIdsWithTreatment(treatment: string): Promise<Set<string>> {
  const items = await fetchAllRows<any>((from, to) =>
    supabase
      .from("treatment_plan_items")
      .select("plan_id, treatment_type")
      .ilike("treatment_type", treatment)
      .range(from, to),
  );
  const planIds = Array.from(new Set(items.map((i) => i.plan_id).filter(Boolean)));
  const ids = new Set<string>();
  for (let i = 0; i < planIds.length; i += 200) {
    const chunk = planIds.slice(i, i + 200);
    const { data } = await supabase.from("treatment_plans").select("patient_id").in("id", chunk);
    (data || []).forEach((r: any) => r.patient_id && ids.add(String(r.patient_id)));
  }
  return ids;
}

async function patientIdsSeenSince(sinceISO: string): Promise<Set<string>> {
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("appointments")
      .select("patient_id")
      .gte("appointment_date", sinceISO)
      .not("patient_id", "is", null)
      .range(from, to),
  );
  return new Set(rows.map((r) => String(r.patient_id)));
}

export const segmentLabel = (kind: SegmentKind, treatment?: string, customLabel?: string): string => {
  switch (kind) {
    case "patients_all":
      return "All Registered Patients";
    case "leads_all":
      return "All Pipeline Leads / Contacts";
    case "treatment":
      return treatment ? `By Treatment — ${treatment}` : "By Treatment Type";
    case "patients_inactive_6m":
      return "Inactive Patients (no visit in 6 months)";
    case "custom":
      return customLabel || "Custom list";
  }
};

export async function buildAudience(
  kind: SegmentKind,
  options: { treatment?: string; custom?: CustomAudienceHandover | null } = {},
): Promise<AudienceResult> {
  const { treatment, custom } = options;
  let raw: RawContact[] = [];
  let descriptor = "";

  if (kind === "patients_all") {
    const rows = await patientRows();
    raw = rows.map((p) => ({ name: patientName(p), phone: p.phone, origin: "patient" as const }));
    descriptor = "patients:all";
  } else if (kind === "leads_all") {
    const rows = await leadRows();
    raw = rows.map((l) => ({ name: l.name || "", phone: l.phone, origin: "lead" as const }));
    descriptor = "leads:all";
  } else if (kind === "treatment") {
    if (!treatment) throw new Error("Pick a treatment first");
    const [patients, leads, ids] = await Promise.all([
      patientRows(),
      leadRows(treatment),
      patientIdsWithTreatment(treatment),
    ]);
    raw = [
      ...patients
        .filter((p) => ids.has(String(p.id)))
        .map((p) => ({ name: patientName(p), phone: p.phone, origin: "patient" as const })),
      ...leads.map((l) => ({ name: l.name || "", phone: l.phone, origin: "lead" as const })),
    ];
    descriptor = `treatment:${treatment}`;
  } else if (kind === "patients_inactive_6m") {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const [patients, seen] = await Promise.all([
      patientRows(),
      patientIdsSeenSince(since.toISOString().slice(0, 10)),
    ]);
    raw = patients
      .filter((p) => !seen.has(String(p.id)))
      .map((p) => ({ name: patientName(p), phone: p.phone, origin: "patient" as const }));
    descriptor = "patients:inactive6m";
  } else {
    const list = custom?.contacts || [];
    raw = list.map((c) => ({ name: c.name || "", phone: c.phone, origin: custom?.origin || "custom" }));
    descriptor = `custom:${list.length}`;
  }

  const refined = await refineContacts(raw);
  return {
    ...refined,
    descriptor: kind === "custom" ? `custom:${refined.contacts.length}` : descriptor,
    label: segmentLabel(kind, treatment, custom?.label),
  };
}

export const audienceBreakdownText = (r: AudienceResult): string => {
  const parts = [`${r.scanned.toLocaleString()} contacts`];
  if (r.invalid) parts.push(`${r.invalid.toLocaleString()} invalid`);
  if (r.duplicates) parts.push(`${r.duplicates.toLocaleString()} duplicates removed`);
  if (r.blocked) parts.push(`${r.blocked.toLocaleString()} not on WhatsApp`);
  return parts.join(" · ");
};

export const NOT_REACHABLE_NOTE = NOT_ON_WHATSAPP_MESSAGE;
