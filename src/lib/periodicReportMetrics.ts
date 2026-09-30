/**
 * Report-only metric helpers for the Periodic Reports page.
 * Intentionally separate from src/lib/callLogMetrics.ts (Call Logs panels) —
 * Callyzer's periodic-report definitions differ (callback / later-connect aware).
 * Never import this into the Call Logs page.
 */

export interface ReportCallRow {
  id: string;
  call_type: string;
  status: string;
  duration_seconds: number;
  started_at: string | null;
  ended_at: string | null;
  phone: string | null;
  normalized_phone: string | null;
  notes: string | null;
  telecaller_id: string | null;
}

export const isIncomingCall = (c: ReportCallRow) => c.call_type === "incoming";
export const isOutgoingCall = (c: ReportCallRow) => c.call_type === "outgoing";
export const isMissedCall = (c: ReportCallRow) => c.call_type === "missed" || c.status === "missed";
export const isRejectedCall = (c: ReportCallRow) => c.call_type === "rejected" || c.status === "rejected";
export const isConnectedCall = (c: ReportCallRow) => c.duration_seconds > 0;

export const clientKey = (c: ReportCallRow) => c.normalized_phone || c.phone || "";
const startMs = (c: ReportCallRow) => (c.started_at ? new Date(c.started_at).getTime() : 0);

export const formatReportDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const sumDuration = (rows: ReportCallRow[]) => rows.reduce((t, r) => t + (r.duration_seconds || 0), 0);

/** India-local calendar day key for grouping (Working Hours per day). */
export const indiaDayKey = (iso: string | null) => {
  if (!iso) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
};

/** Callyzer meaning: outgoing, 0 duration, and no later connected call to that client. */
export const notPickupRows = (calls: ReportCallRow[]): ReportCallRow[] => {
  const latestConnected = new Map<string, number>();
  for (const c of calls) {
    if (!isConnectedCall(c)) continue;
    const key = clientKey(c);
    if (!key) continue;
    latestConnected.set(key, Math.max(latestConnected.get(key) ?? 0, startMs(c)));
  }
  return calls.filter(
    (c) =>
      isOutgoingCall(c) &&
      c.duration_seconds <= 0 &&
      startMs(c) >= (latestConnected.get(clientKey(c)) ?? -1),
  );
};

/** Callyzer meaning: incoming missed/rejected with no later callback (any call) to that client. */
export const neverAttendedRows = (calls: ReportCallRow[]): ReportCallRow[] => {
  const latestOther = new Map<string, number>();
  for (const c of calls) {
    const key = clientKey(c);
    if (!key) continue;
    if (isIncomingCall(c) && (isMissedCall(c) || isRejectedCall(c))) continue;
    latestOther.set(key, Math.max(latestOther.get(key) ?? 0, startMs(c)));
  }
  return calls.filter(
    (c) =>
      isIncomingCall(c) &&
      (isMissedCall(c) || isRejectedCall(c)) &&
      startMs(c) >= (latestOther.get(clientKey(c)) ?? -1),
  );
};

/** First call to last call of each India day, summed across days. */
export const workingSeconds = (calls: ReportCallRow[]) => {
  const byDay = new Map<string, number[]>();
  for (const c of calls) {
    const stamps = [c.started_at, c.ended_at]
      .filter((v): v is string => Boolean(v))
      .map((v) => new Date(v).getTime())
      .filter(Number.isFinite);
    if (!stamps.length) continue;
    const key = indiaDayKey(c.started_at);
    const list = byDay.get(key) ?? [];
    list.push(...stamps);
    byDay.set(key, list);
  }
  let total = 0;
  for (const stamps of byDay.values()) {
    if (stamps.length > 1) total += (Math.max(...stamps) - Math.min(...stamps)) / 1000;
  }
  return Math.round(total);
};

const uniqueCount = (rows: ReportCallRow[]) =>
  new Set(rows.map(clientKey).filter(Boolean)).size;

export interface DirectionStats {
  calls: number;
  duration: number;
  connected: number;
  connectedDuration: number;
  connectedAvg: number;
}

const directionStats = (rows: ReportCallRow[]): DirectionStats => {
  const connected = rows.filter(isConnectedCall);
  const connectedDuration = sumDuration(connected);
  return {
    calls: rows.length,
    duration: sumDuration(rows),
    connected: connected.length,
    connectedDuration,
    connectedAvg: connected.length ? Math.round(connectedDuration / connected.length) : 0,
  };
};

export interface ReportSummary {
  incoming: DirectionStats;
  outgoing: DirectionStats;
  missed: number;
  rejected: number;
  totalCalls: number;
  totalDuration: number;
  neverAttended: number;
  notPickup: number;
  connectedCalls: number;
  connectedDuration: number;
  connectedAvg: number;
  uniqueConnectedCalls: number;
  uniqueClients: number;
  workingSeconds: number;
}

export const buildSummary = (calls: ReportCallRow[]): ReportSummary => {
  const incoming = directionStats(calls.filter(isIncomingCall));
  const outgoing = directionStats(calls.filter(isOutgoingCall));
  const connected = calls.filter(isConnectedCall);
  const connectedDuration = sumDuration(connected);
  return {
    incoming,
    outgoing,
    missed: calls.filter(isMissedCall).length,
    rejected: calls.filter(isRejectedCall).length,
    totalCalls: calls.length,
    totalDuration: sumDuration(calls),
    neverAttended: neverAttendedRows(calls).length,
    notPickup: notPickupRows(calls).length,
    connectedCalls: connected.length,
    connectedDuration,
    connectedAvg: connected.length ? Math.round(connectedDuration / connected.length) : 0,
    uniqueConnectedCalls: uniqueCount(connected),
    uniqueClients: uniqueCount(calls),
    workingSeconds: workingSeconds(calls),
  };
};

export interface EmployeeSummaryRow extends ReportSummary {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
}

export const buildEmployeeSummary = (
  calls: ReportCallRow[],
  names: Map<string, { name: string; number: string }>,
): EmployeeSummaryRow[] => {
  const byEmployee = new Map<string, ReportCallRow[]>();
  for (const c of calls) {
    const key = c.telecaller_id ?? "unassigned";
    const list = byEmployee.get(key) ?? [];
    list.push(c);
    byEmployee.set(key, list);
  }
  return [...byEmployee.entries()]
    .map(([employeeId, rows]) => ({
      employeeId,
      employeeName: names.get(employeeId)?.name ?? (employeeId === "unassigned" ? "Unassigned" : "Unknown"),
      employeeNumber: names.get(employeeId)?.number ?? "—",
      ...buildSummary(rows),
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls);
};
