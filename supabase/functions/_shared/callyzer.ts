// Shared Callyzer helpers used by callyzer-webhook, callyzer-backfill,
// callyzer-compare and callyzer-recording-refresh.
// NOTE: Callyzer recording URLs are NEVER written to call_logs.recording_path.
// They live only in public.callyzer_call_recordings (admin-only read).
// NOTE: Callyzer's own lead_id / crm_status are IGNORED. DENZO leads and
// patients are matched only by normalized phone.

/** One call after normalization, regardless of the payload format received. */
export type NormalizedCall = {
  callyzerLogId: string | null;
  clientName: string | null;
  phone: string | null;
  duration: number;
  rawCallType: string | null;
  startedAt: string | null; // ISO (UTC) derived from IST wall time
  note: string | null;
  recordingUrl: string | null;
};

export type NormalizedBlock = {
  empName: string | null;
  empNumber: string | null;
  calls: NormalizedCall[];
};

export type EmployeeStat = {
  empName: string | null;
  empNumber: string | null;
  mapped: boolean;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
};

export type UpsertResult = {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  unknownCallTypes: string[];
  unmatchedTelecallers: string[];
  employees: EmployeeStat[];
  dryRun?: boolean;
};

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Callyzer sends naive local timestamps — treat them as Asia/Kolkata (+05:30). */
export function parseCallyzerTime(raw?: string | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim().replace(",", "").replace(" ", "T");
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}+05:30`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** call_date "2026-09-19" + call_time "14:11:13" -> ISO, treated as Asia/Kolkata. */
export function combineCallyzerDateTime(
  date?: string | null,
  time?: string | null,
): string | null {
  if (!date) return null;
  const d = String(date).trim().slice(0, 10);
  const t = String(time ?? "00:00:00").trim() || "00:00:00";
  return parseCallyzerTime(`${d} ${t}`);
}

const KNOWN: Record<string, string> = {
  incoming: "incoming",
  outgoing: "outgoing",
  missed: "missed",
  rejected: "rejected",
  // Callyzer may send these derived types directly. Map them onto the base
  // types the CRM metric logic already derives, so nothing double counts.
  "never attended": "missed",
  "not pickup by client": "outgoing",
  "not pickup": "outgoing",
};

export function mapCallType(raw?: string | null): { call_type: string; known: boolean } {
  const key = String(raw ?? "").trim().toLowerCase();
  if (KNOWN[key]) return { call_type: KNOWN[key], known: true };
  return { call_type: key ? "other" : "unknown", known: false };
}

// ---------- Payload normalization (snake_case v2.x + legacy camelCase) ----------

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/** Sandbox/production v2.1+ flat call object (snake_case). */
function fromSnakeCall(o: any): NormalizedCall {
  return {
    callyzerLogId: str(o.id),
    clientName: str(o.client_name),
    phone: str(o.client_number),
    duration: Number(o.duration ?? 0) || 0,
    rawCallType: str(o.call_type),
    startedAt: combineCallyzerDateTime(o.call_date, o.call_time),
    note: str(o.note),
    recordingUrl: str(o.call_recording_url),
    // o.lead_id / o.crm_status intentionally ignored.
  };
}

/** Legacy camelCase log inside an employee block. */
function fromCamelCall(o: any): NormalizedCall {
  return {
    callyzerLogId: str(o.id ?? o.uniqueId ?? o.unique_id),
    clientName: str(o.name ?? o.clientName),
    phone: str(o.number ?? o.clientNumber),
    duration: Number(o.duration ?? 0) || 0,
    rawCallType: str(o.callType ?? o.call_type),
    startedAt: parseCallyzerTime(o.callTime ?? o.call_time) ??
      combineCallyzerDateTime(o.callDate ?? o.call_date, o.callTime ?? o.call_time),
    note: str(o.note),
    recordingUrl: str(o.recordingURL ?? o.recordingUrl ?? o.call_recording_url),
  };
}

const isSnakeCall = (o: any) =>
  !!o && typeof o === "object" &&
  (o.call_date !== undefined || o.client_number !== undefined || o.call_recording_url !== undefined) &&
  !Array.isArray(o.logs);

const isCamelCall = (o: any) =>
  !!o && typeof o === "object" &&
  (o.callType !== undefined || o.callTime !== undefined || o.recordingURL !== undefined) &&
  !Array.isArray(o.logs);

/** Employee blocks may carry their calls under any of these keys. */
const LOG_KEYS = ["call_logs", "callLogs", "logs", "calls", "call_log"];

const logsArrayOf = (o: any): { key: string; list: any[] } | null => {
  for (const k of LOG_KEYS) {
    if (Array.isArray(o?.[k])) return { key: k, list: o[k] };
  }
  return null;
};

const describe = (item: unknown): string => {
  if (!item || typeof item !== "object") return `non-object entry (${typeof item})`;
  const keys = Object.keys(item as Record<string, unknown>);
  return `unrecognized entry, keys found: ${keys.slice(0, 15).join(", ") || "none"}`;
};

/**
 * Accepts: flat array of snake_case calls, { data|result: [...] }, employee
 * blocks whose calls live under call_logs/callLogs/logs/calls (snake_case v2.x
 * webhook format and the legacy camelCase format), or a single object of any of
 * those shapes. Anything unrecognized is returned in `unrecognized` with a
 * human-readable reason in `reasons` (caller marks the log partial).
 */
export function normalizePayload(raw: unknown): {
  blocks: NormalizedBlock[];
  unrecognized: unknown[];
  reasons: string[];
} {
  const unrecognized: unknown[] = [];
  const reasons: string[] = [];
  const reject = (item: unknown) => {
    unrecognized.push(item);
    const why = describe(item);
    if (!reasons.includes(why)) reasons.push(why);
  };
  const byEmp = new Map<string, NormalizedBlock>();

  const pushCall = (empName: string | null, empNumber: string | null, call: NormalizedCall) => {
    const key = normalizePhone(empNumber) ?? empNumber ?? "";
    let block = byEmp.get(key);
    if (!block) {
      block = { empName, empNumber, calls: [] };
      byEmp.set(key, block);
    }
    if (!block.empName && empName) block.empName = empName;
    block.calls.push(call);
  };

  const rawObj = raw as any;
  const hasEmpFields = !!rawObj && typeof rawObj === "object" &&
    (rawObj.emp_number !== undefined || rawObj.emp_name !== undefined ||
      rawObj.employeeNumber !== undefined || rawObj.employeeName !== undefined);

  const items: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rawObj?.data)
      ? rawObj.data
      : Array.isArray(rawObj?.result)
        ? rawObj.result
        : Array.isArray(rawObj?.call_logs) && !hasEmpFields
          ? rawObj.call_logs
          : raw
            ? [raw]
            : [];

  for (const item of items) {
    const o = item as any;
    if (!o || typeof o !== "object") {
      reject(item);
      continue;
    }
    const logs = logsArrayOf(o);
    if (logs) {
      // Employee block: calls under call_logs / callLogs / logs / calls.
      const empName = str(o.emp_name ?? o.employeeName ?? o.name);
      const empNumber = str(o.emp_number ?? o.employeeNumber ?? o.number);
      for (const l of logs.list) {
        if (isSnakeCall(l)) {
          pushCall(empName, empNumber, fromSnakeCall(l));
        } else if (isCamelCall(l) || (l && typeof l === "object" && (l as any).number)) {
          pushCall(empName, empNumber, fromCamelCall(l));
        } else {
          reject(l);
        }
      }
      continue;
    }
    if (isSnakeCall(o)) {
      pushCall(str(o.emp_name), str(o.emp_number), fromSnakeCall(o));
      continue;
    }
    if (isCamelCall(o)) {
      pushCall(
        str(o.employeeName ?? o.emp_name),
        str(o.employeeNumber ?? o.emp_number),
        fromCamelCall(o),
      );
      continue;
    }
    reject(item);
  }

  return { blocks: [...byEmp.values()], unrecognized, reasons };
}

// ---------- Environment config resolution ----------

export type CallyzerConfig = {
  environment: "sandbox" | "production";
  baseUrl: string;
  apiToken: string;
  version: string;
  paths: { history: string; historyById: string; daywise: string };
};

/** Placeholder / empty tokens must never be sent to Callyzer. */
const PLACEHOLDER_TOKENS = new Set(["", "not-set-yet", "placeholder", "todo"]);

export function resolveCallyzerConfig(
  settings: Record<string, any> | null | undefined,
  opts?: { environment?: string | null },
): { config?: CallyzerConfig; error?: string } {
  const environment: "sandbox" | "production" =
    (opts?.environment ?? settings?.environment) === "production" ? "production" : "sandbox";
  const p = environment === "production" ? "production" : "sandbox";

  const baseUrl = String(settings?.[`${p}_base_url`] ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) return { error: `No base URL configured for ${environment}` };

  const version = String(settings?.[`${p}_api_version`] ?? "").trim().replace(/^\/+|\/+$/g, "") ||
    (environment === "production" ? "v2.2" : "v2.1");
  const cleanPath = (v: unknown, dflt: string) => {
    const s = String(v ?? "").trim();
    return (s || dflt).replace(/^\/*/, "/").replace(/\/+$/, "");
  };
  const paths = {
    history: cleanPath(settings?.[`${p}_history_path`], "/call-log/history"),
    historyById: cleanPath(settings?.[`${p}_history_by_id_path`], "/call-log/history-by-id"),
    daywise: cleanPath(settings?.[`${p}_daywise_path`], "/call-log/daywise-analytics"),
  };

  const apiToken = String(
    Deno.env.get(environment === "production" ? "CALLYZER_API_TOKEN_PROD" : "CALLYZER_API_TOKEN_SANDBOX") ?? "",
  ).trim();
  if (PLACEHOLDER_TOKENS.has(apiToken.toLowerCase())) {
    return { error: `API token for ${environment} is not configured (placeholder or empty)` };
  }

  return { config: { environment, baseUrl, apiToken, version, paths } };
}

/** Full URL: <base>/api/<version><path>  e.g. https://sandbox.api.callyzer.co/api/v2.1/call-log/history */
export function callyzerUrl(config: CallyzerConfig, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${config.baseUrl}/api/${config.version}${p}`;
}

// ---------- Sandbox date window ----------
// The Callyzer sandbox only serves a fixed date range. Every sandbox request is
// clamped to it. Production is never clamped.

export type SandboxWindow = { fromDate: string; toDate: string; fromSec: number; toSec: number };

export const istDayStartSec = (d: string) => Math.floor(Date.parse(`${d}T00:00:00+05:30`) / 1000);
export const istDayEndSec = (d: string) => Math.floor(Date.parse(`${d}T23:59:59+05:30`) / 1000);

export function getSandboxWindow(
  settings: Record<string, any> | null | undefined,
  config: CallyzerConfig,
): SandboxWindow | null {
  if (config.environment !== "sandbox") return null;
  const fromDate = String(settings?.sandbox_window_from ?? "2026-09-19").slice(0, 10);
  const toDate = String(settings?.sandbox_window_to ?? "2026-10-03").slice(0, 10);
  return { fromDate, toDate, fromSec: istDayStartSec(fromDate), toSec: istDayEndSec(toDate) };
}

/** Clamp an epoch-second range into the sandbox window. */
export function clampToWindow(
  fromSec: number,
  toSec: number,
  win: SandboxWindow | null,
): { call_from: number; call_to: number; clamped: boolean; error?: string } {
  if (!win) return { call_from: fromSec, call_to: toSec, clamped: false };
  const call_from = Math.max(fromSec, win.fromSec);
  const call_to = Math.min(toSec, win.toSec);
  const clamped = call_from !== fromSec || call_to !== toSec;
  if (call_from > call_to) {
    return {
      call_from,
      call_to,
      clamped: true,
      error:
        `The requested dates fall outside the Callyzer sandbox window (${win.fromDate} to ${win.toDate}). ` +
        `Pick dates inside that range.`,
    };
  }
  return { call_from, call_to, clamped };
}

/** Turn a Callyzer date-range rejection into a friendly message. */
export function friendlyRangeError(
  status: number,
  body: string,
  win: SandboxWindow | null,
): string | null {
  if (!/can only be accessed from|dates are within this range|date range/i.test(body)) return null;
  const allowed = win ? `${win.fromDate} to ${win.toDate}` : "the range Callyzer reported";
  return `Callyzer only serves call data for ${allowed}. Adjust the dates (or the sandbox window in settings) and try again.`;
}

type Client = {
  from: (t: string) => any;
};

/**
 * Insert/update Callyzer call logs with one-to-one dedupe against Android rows.
 * Shared by the webhook and the backfill so both behave identically.
 * With opts.dryRun = true nothing is written; counts are a preview only.
 */
export async function upsertCallyzerLogs(
  supabase: Client,
  blocks: NormalizedBlock[],
  environment: string,
  opts?: { dryRun?: boolean; ignoreUnmapped?: boolean },
): Promise<UpsertResult> {
  const dryRun = !!opts?.dryRun;
  const ignoreUnmapped = opts?.ignoreUnmapped !== false;
  const res: UpsertResult = {
    received: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    ignored: 0,
    unknownCallTypes: [],
    unmatchedTelecallers: [],
    employees: [],
    dryRun,
  };

  // Callyzer employee number -> DENZO profile id (written to call_logs.telecaller_id)
  const { data: mappings } = await supabase
    .from("callyzer_employee_mappings")
    .select("callyzer_emp_number, profile_id, is_active");
  const mapByEmp = new Map<string, string | null>();
  for (const m of mappings ?? []) {
    if (m.is_active === false) continue;
    const key = normalizePhone(m.callyzer_emp_number) ?? String(m.callyzer_emp_number);
    mapByEmp.set(key, m.profile_id ?? null);
  }

  // Dry-run only: Callyzer ids already claimed in this batch, so duplicates
  // inside one payload don't count twice as inserts.
  const seenIds = new Set<string>();

  for (const block of blocks ?? []) {
    const empKey = normalizePhone(block.empNumber) ?? String(block.empNumber ?? "");
    const telecallerId = mapByEmp.get(empKey) ?? null;
    const mapped = !!telecallerId;
    if (!mapped && empKey && !res.unmatchedTelecallers.includes(empKey)) {
      res.unmatchedTelecallers.push(empKey);
    }

    const found = (block.calls ?? []).length;
    const stat: EmployeeStat = {
      empName: block.empName ?? null,
      empNumber: block.empNumber ?? null,
      mapped,
      found,
      inserted: 0,
      updated: 0,
      skipped: 0,
      ignored: 0,
    };

    // Unmapped Callyzer employee + setting ON -> nothing is written to call_logs
    // and nothing lands in the unmatched-calls list.
    if (!mapped && ignoreUnmapped) {
      res.received += found;
      res.ignored += found;
      stat.ignored = found;
      res.employees.push(stat);
      continue;
    }

    const before = { inserted: res.inserted, updated: res.updated, skipped: res.skipped };

    for (const log of block.calls ?? []) {
      res.received++;
      const callyzerLogId = log.callyzerLogId;
      const phone = log.phone;
      const normalized = normalizePhone(phone);
      const startedAt = log.startedAt;
      const duration = log.duration;
      const { call_type, known } = mapCallType(log.rawCallType);
      if (!known && log.rawCallType && !res.unknownCallTypes.includes(log.rawCallType)) {
        res.unknownCallTypes.push(log.rawCallType);
      }

      const endedAt =
        startedAt && duration > 0
          ? new Date(new Date(startedAt).getTime() + duration * 1000).toISOString()
          : startedAt;

      const base: Record<string, unknown> = {
        phone,
        normalized_phone: normalized,
        call_type,
        raw_call_type: log.rawCallType,
        duration_seconds: duration,
        started_at: startedAt,
        ended_at: endedAt,
        notes: log.note,
        source: "callyzer",
        callyzer_log_id: callyzerLogId,
        callyzer_environment: environment,
        status: duration > 0 ? "connected" : call_type === "missed" ? "missed" : "not_connected",
      };
      if (telecallerId) base.telecaller_id = telecallerId;

      // 1) Same Callyzer log already stored -> update it.
      let targetId: string | null = null;
      if (callyzerLogId) {
        if (dryRun && seenIds.has(callyzerLogId)) {
          res.skipped++;
          continue;
        }
        const { data: existing } = await supabase
          .from("call_logs")
          .select("id")
          .eq("callyzer_log_id", callyzerLogId)
          .maybeSingle();
        if (existing?.id) targetId = existing.id;
        seenIds.add(callyzerLogId);
      }

      // 2) Otherwise try to attach to an Android row (one-to-one, closest start time).
      if (!targetId && startedAt && normalized) {
        const from = new Date(new Date(startedAt).getTime() - 60_000).toISOString();
        const to = new Date(new Date(startedAt).getTime() + 60_000).toISOString();
        const { data: cands } = await supabase
          .from("call_logs")
          .select("id, started_at")
          .eq("normalized_phone", normalized)
          .eq("call_type", call_type)
          .is("callyzer_log_id", null)
          .neq("source", "callyzer")
          .gte("started_at", from)
          .lte("started_at", to);
        if (cands?.length) {
          const wanted = new Date(startedAt).getTime();
          const closest = [...cands].sort(
            (a: any, b: any) =>
              Math.abs(new Date(a.started_at).getTime() - wanted) -
              Math.abs(new Date(b.started_at).getTime() - wanted),
          )[0];
          targetId = closest?.id ?? null;
        }
      }

      if (targetId) {
        if (dryRun) {
          res.updated++;
          continue;
        }
        const { error } = await supabase.from("call_logs").update(base).eq("id", targetId);
        if (error) {
          res.skipped++;
          continue;
        }
        res.updated++;
        await afterRow(supabase, targetId, log, normalized, phone, empKey, telecallerId, environment);
        continue;
      }

      if (dryRun) {
        if (!startedAt || !phone) res.skipped++;
        else res.inserted++;
        continue;
      }

      // 3) Fresh insert — match lead/patient by normalized phone only.
      const match = await matchContact(supabase, normalized);
      const { data: ins, error } = await supabase
        .from("call_logs")
        .insert({ ...base, ...match })
        .select("id")
        .maybeSingle();
      if (error || !ins?.id) {
        res.skipped++;
        continue;
      }
      res.inserted++;
      await afterRow(supabase, ins.id, log, normalized, phone, empKey, telecallerId, environment);
    }

    stat.inserted = res.inserted - before.inserted;
    stat.updated = res.updated - before.updated;
    stat.skipped = res.skipped - before.skipped;
    res.employees.push(stat);
  }

  return res;
}

async function matchContact(supabase: Client, normalized: string | null) {
  const out: Record<string, unknown> = {};
  if (!normalized) return out;
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .ilike("phone", `%${normalized}`)
    .limit(1)
    .maybeSingle();
  if (lead?.id) {
    out.lead_id = lead.id;
    out.match_method = "phone";
    return out;
  }
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .ilike("phone", `%${normalized}`)
    .limit(1)
    .maybeSingle();
  if (patient?.id) {
    out.patient_id = patient.id;
    out.match_method = "phone";
  }
  return out;
}

async function afterRow(
  supabase: Client,
  callLogId: string,
  log: NormalizedCall,
  normalized: string | null,
  phone: string | null,
  empKey: string,
  telecallerId: string | null,
  environment: string,
) {
  // Recording URL -> admin-only table only. Never call_logs.recording_path.
  if (log.recordingUrl) {
    await supabase
      .from("callyzer_call_recordings")
      .upsert(
        { call_log_id: callLogId, recording_url: log.recordingUrl, environment },
        { onConflict: "call_log_id" },
      );
  }

  // Unmatched: no telecaller mapping, or no lead/patient match.
  const { data: row } = await supabase
    .from("call_logs")
    .select("lead_id, patient_id")
    .eq("id", callLogId)
    .maybeSingle();
  const unmatched = !telecallerId || (!row?.lead_id && !row?.patient_id);
  if (unmatched) {
    const { data: existing } = await supabase
      .from("callyzer_unmatched_calls")
      .select("id")
      .eq("call_log_id", callLogId)
      .maybeSingle();
    if (!existing?.id) {
      await supabase.from("callyzer_unmatched_calls").insert({
        call_log_id: callLogId,
        phone,
        normalized_phone: normalized,
        callyzer_emp_number: empKey || null,
        environment,
      });
    }
  }
}
