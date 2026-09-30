import {
  Ban,
  Clock,
  Hourglass,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Minimal shape shared by panel and list calculations. */
export interface MetricCallRow {
  call_type: string;
  duration_seconds: number;
  ended_at: string | null;
  normalized_phone: string | null;
  phone: string | null;
  started_at: string | null;
  status: string;
}

export type MetricTone = "neutral" | "primary" | "success" | "info" | "warning" | "destructive";

export const isMissed = (call: MetricCallRow) => call.call_type === "missed" || call.status === "missed";
export const isRejected = (call: MetricCallRow) => call.call_type === "rejected" || call.status === "rejected";
export const isIncoming = (call: MetricCallRow) => call.call_type === "incoming";
export const isOutgoing = (call: MetricCallRow) => call.call_type === "outgoing";
export const isConnected = (call: MetricCallRow) => call.status === "completed" && call.duration_seconds > 0;

export const formatDuration = (seconds: number, emptyAsDash = false) => {
  if (seconds <= 0) return emptyAsDash ? "—" : "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

const sumDuration = <T extends MetricCallRow>(rows: T[]) =>
  rows.reduce((total, row) => total + row.duration_seconds, 0);

/** One representative row per distinct client (latest call first). */
const uniqueClientRows = <T extends MetricCallRow>(calls: T[]): T[] => {
  const byPhone = new Map<string, T>();
  for (const call of calls) {
    const key = call.normalized_phone || call.phone;
    if (!key) continue;
    const existing = byPhone.get(key);
    if (!existing || (call.started_at ?? "") > (existing.started_at ?? "")) {
      byPhone.set(key, call);
    }
  }
  return [...byPhone.values()];
};

/** Working Hours span: the first and last call of the period (representative set). */
const workingHoursRows = <T extends MetricCallRow>(calls: T[]): T[] => {
  const timed = calls
    .filter((c) => c.started_at)
    .sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""));
  if (timed.length === 0) return [];
  return timed.length === 1 ? [timed[0]] : [timed[0], timed[timed.length - 1]];
};

const workingSeconds = (calls: MetricCallRow[]) => {
  const timestamps = calls.flatMap((call) =>
    [call.started_at, call.ended_at]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite),
  );
  return timestamps.length > 1 ? Math.max(...timestamps) / 1000 - Math.min(...timestamps) / 1000 : 0;
};

export interface MetricDef<T extends MetricCallRow = MetricCallRow> {
  label: string;
  icon: LucideIcon;
  tone: MetricTone;
  /** Value shown on the tile — the exact metric definition. */
  value: (calls: T[]) => string | number;
  /** Rows that make up the tile — used for list drill-down. */
  rows: (calls: T[]) => T[];
  /** True when the drill-down is a representative row set, not a strict filter. */
  representative?: boolean;
}

// Order is the exact panel order — do not reorder.
export const METRIC_DEFS: MetricDef[] = [
  { label: "Total Calls", icon: Phone, tone: "primary", value: (c) => c.length, rows: (c) => c },
  {
    label: "Call Duration", icon: Clock, tone: "neutral",
    value: (c) => formatDuration(sumDuration(c), true),
    rows: (c) => c.filter((r) => r.duration_seconds > 0),
  },
  { label: "Incoming", icon: PhoneIncoming, tone: "success", value: (c) => c.filter(isIncoming).length, rows: (c) => c.filter(isIncoming) },
  {
    label: "Incoming Duration", icon: PhoneIncoming, tone: "success",
    value: (c) => formatDuration(sumDuration(c.filter(isIncoming)), true),
    rows: (c) => c.filter((r) => isIncoming(r) && r.duration_seconds > 0),
  },
  { label: "Outgoing", icon: PhoneOutgoing, tone: "info", value: (c) => c.filter(isOutgoing).length, rows: (c) => c.filter(isOutgoing) },
  {
    label: "Outgoing Duration", icon: PhoneOutgoing, tone: "warning",
    value: (c) => formatDuration(sumDuration(c.filter(isOutgoing)), true),
    rows: (c) => c.filter((r) => isOutgoing(r) && r.duration_seconds > 0),
  },
  { label: "Missed", icon: PhoneMissed, tone: "destructive", value: (c) => c.filter(isMissed).length, rows: (c) => c.filter(isMissed) },
  { label: "Rejected", icon: Ban, tone: "destructive", value: (c) => c.filter(isRejected).length, rows: (c) => c.filter(isRejected) },
  {
    label: "Never Attended", icon: PhoneOff, tone: "destructive",
    value: (c) => c.filter((r) => isIncoming(r) && isMissed(r)).length,
    rows: (c) => c.filter((r) => isIncoming(r) && isMissed(r)),
  },
  {
    label: "Not Pickup by Client", icon: PhoneOff, tone: "destructive",
    value: (c) => c.filter((r) => isOutgoing(r) && r.duration_seconds <= 0 && ["missed", "failed", "no_recording"].includes(r.status)).length,
    rows: (c) => c.filter((r) => isOutgoing(r) && r.duration_seconds <= 0 && ["missed", "failed", "no_recording"].includes(r.status)),
  },
  {
    label: "Unique Clients", icon: UserRound, tone: "neutral",
    value: (c) => new Set(c.map((r) => r.normalized_phone || r.phone).filter((p): p is string => Boolean(p))).size,
    rows: uniqueClientRows,
    representative: true,
  },
  {
    label: "Working Hours", icon: Hourglass, tone: "neutral",
    value: (c) => formatDuration(Math.round(workingSeconds(c)), true),
    rows: workingHoursRows,
    representative: true,
  },
  { label: "Connected Calls", icon: PhoneCall, tone: "neutral", value: (c) => c.filter(isConnected).length, rows: (c) => c.filter(isConnected) },
];
