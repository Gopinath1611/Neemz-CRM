/**
 * Shared WhatsApp metric-card category breakdown (identical to the Analytics tab).
 *
 * Provides:
 *   - CATEGORIES / categoryOf: the exact same classification used by
 *     WhatsAppSourceAnalytics.tsx
 *   - useMetricCategoryCounts: log-only counts per metric per category
 *   - MetricBreakdownPopoverContent: the clean summary popover body
 *
 * Reads only from the `whatsapp_messages` log table.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { PopoverContent } from "@/components/ui/popover";

export type MetricKey = "sent" | "delivered" | "read" | "failed" | "responses";

type LogRow = {
  status: string | null;
  payload: any;
  created_at: string;
  direction: string | null;
  error?: any;
};

const DELIVERED = new Set(["delivered", "read"]);
const READ = new Set(["read"]);
const FAILED = new Set(["failed", "undeliverable", "undelivered"]);

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

const templateOf = (row: LogRow): string => {
  const req = row?.payload?.request ?? row?.payload;
  return String(req?.template?.name || "").trim();
};

const sourceOf = (row: LogRow): string => {
  const req = row?.payload?.request ?? row?.payload;
  return norm(req?.source) || "system";
};

const OPERATIONAL_BUCKETS: { key: string; match: (t: string) => boolean }[] = [
  { key: "checkin", match: (t) => /check[-_]?in/.test(t) },
  { key: "checkout", match: (t) => /check[-_]?out/.test(t) },
  { key: "prescription", match: (t) => /prescription/.test(t) },
  { key: "invoice", match: (t) => /invoice|^inv[-_]|payment_sharing/.test(t) },
];

const isAppointment = (t: string) => /appointment|app_booking/.test(t);

export const CATEGORIES: { key: string; label: string }[] = [
  { key: "appointment", label: "Book Appointment" },
  { key: "checkin", label: "Check-in" },
  { key: "checkout", label: "Check-out" },
  { key: "prescription", label: "Prescription" },
  { key: "invoice", label: "Invoice" },
  { key: "automation", label: "Workflow Automation / Campaigns" },
  { key: "other", label: "Other / manual sends" },
];

export const categoryOf = (row: LogRow): string => {
  const tpl = norm(templateOf(row));
  const source = sourceOf(row);
  if (isAppointment(tpl)) return "appointment";
  const bucket = OPERATIONAL_BUCKETS.find((b) => b.match(tpl));
  if (bucket) return bucket.key;
  if (source === "workflow" || source === "campaign") return "automation";
  return "other";
};

/**
 * Counts per metric per category for the given date window.
 * `scope = "single_send"` limits outbound rows to manual/direct sends.
 */
export const useMetricCategoryCounts = (opts: {
  fromISO?: string | null;
  toISO?: string | null;
  scope?: "all" | "single_send";
  enabled?: boolean;
}) => {
  const { fromISO = null, toISO = null, scope = "all", enabled = true } = opts;

  const { data, isFetching } = useQuery({
    queryKey: ["whatsapp-metric-category-counts", fromISO, toISO, scope],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<LogRow[]> => {
      const rows: LogRow[] = [];
      const page = 1000;
      for (let from = 0; from < 30_000; from += page) {
        let q = supabase
          .from("whatsapp_messages")
          .select("status, payload, created_at, direction, error")
          .order("created_at", { ascending: false })
          .range(from, from + page - 1);
        if (fromISO) q = q.gte("created_at", fromISO);
        if (toISO) q = q.lte("created_at", toISO);
        const { data: chunk, error } = await q;
        if (error) {
          console.warn("[wa-metric-breakdown] load failed", error.message);
          break;
        }
        rows.push(...((chunk || []) as LogRow[]));
        if (!chunk || chunk.length < page) break;
      }
      return rows;
    },
  });

  const counts = useMemo(() => {
    const empty = () => Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<string, number>;
    const out: Record<MetricKey, Record<string, number>> = {
      sent: empty(),
      delivered: empty(),
      read: empty(),
      failed: empty(),
      responses: empty(),
    };
    for (const row of data || []) {
      const cat = categoryOf(row);
      if (norm(row.direction) === "in") {
        out.responses[cat] = (out.responses[cat] || 0) + 1;
        continue;
      }
      if (scope === "single_send") {
        const src = sourceOf(row);
        if (src !== "single_send" && src !== "system") continue;
      }
      const st = norm(row.status);
      out.sent[cat] = (out.sent[cat] || 0) + 1;
      if (DELIVERED.has(st)) out.delivered[cat] = (out.delivered[cat] || 0) + 1;
      if (READ.has(st)) out.read[cat] = (out.read[cat] || 0) + 1;
      if (FAILED.has(st)) out.failed[cat] = (out.failed[cat] || 0) + 1;
    }
    return out;
  }, [data, scope]);

  // Failed card: real Meta error code + reason groups from the logged error payload.
  const failureReasons = useMemo(() => {
    const rows = (data || []).filter((r) => {
      if (norm(r.direction) === "in") return false;
      if (!FAILED.has(norm(r.status))) return false;
      if (scope === "single_send") {
        const src = sourceOf(r);
        if (src !== "single_send" && src !== "system") return false;
      }
      return true;
    });
    return groupFailureReasons(rows);
  }, [data, scope]);

  return { counts, failureReasons, isFetching };
};

/** Pulls the real Meta error code + description out of the logged error/payload. */
export const extractMetaError = (row: any): { code: string | null; reason: string } => {
  const rawErr = row?.error;
  const p = row?.payload || {};
  const candidate =
    (Array.isArray(rawErr) ? rawErr[0] : typeof rawErr === "object" && rawErr !== null ? rawErr : null) ||
    (Array.isArray(p?.errors) ? p.errors[0] : null) ||
    (Array.isArray(p?.status?.errors) ? p.status.errors[0] : null) ||
    p?.error ||
    p?.response?.error ||
    null;

  const code =
    candidate?.code != null
      ? String(candidate.code)
      : row?.error_code != null
        ? String(row.error_code)
        : null;

  const reason =
    candidate?.error_data?.details ||
    candidate?.title ||
    candidate?.message ||
    (typeof rawErr === "string" ? rawErr : "") ||
    row?.error_message ||
    "No error detail recorded by Meta";

  return { code, reason: String(reason).trim() || "No error detail recorded by Meta" };
};

export type FailureReasonGroup = { key: string; code: string | null; reason: string; count: number };

/** Official Meta WhatsApp Business API error descriptions used in the Failed breakdown popover. */
export const META_ERROR_DESCRIPTIONS: Record<string, string> = {
  "131049":
    "Healthy ecosystem engagement restriction — Meta's per-user marketing message limit or frequency capping reached to protect user experience.",
  "131026":
    "Message Undeliverable — Recipient is not on WhatsApp, hasn't accepted the latest Terms of Service, or is using an outdated app version.",
  "131047":
    "Re-engagement message limit — More than 24 hours have passed since the recipient last replied; a business-initiated template is required.",
  "131048":
    "Spam rate limit hit / Quality restriction — Number restricted due to high block or report rates.",
  "130429": "Rate limit hit — Cloud API message throughput limit breached.",
  "131051": "Unsupported message type or format mismatch.",
  "131000": "Unknown error / Something went wrong.",
};

const getMetaErrorDescription = (code: string | null, rawReason: string): string => {
  if (!code) return rawReason || "No error detail recorded by Meta";
  return META_ERROR_DESCRIPTIONS[code] || rawReason || "No error detail recorded by Meta";
};

export const groupFailureReasons = (rows: any[]): FailureReasonGroup[] => {
  const map = new Map<string, FailureReasonGroup>();
  for (const row of rows) {
    const { code, reason } = extractMetaError(row);
    const key = `${code ?? "no-code"}|${getMetaErrorDescription(code, reason)}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { key, code, reason: getMetaErrorDescription(code, reason), count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

export const FailedBreakdownPopoverContent = ({
  windowLabel,
  reasons,
  total,
}: {
  windowLabel?: string;
  reasons: FailureReasonGroup[];
  total: number;
}) => (
  <PopoverContent align="start" className="w-[28rem] p-0">
    <div className="p-3 border-b">
      <p className="text-sm font-medium">Failed</p>
      <p className="text-[11px] text-muted-foreground">
        Meta error code breakdown{windowLabel ? ` · ${windowLabel}` : ""}
      </p>
    </div>
    <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
      {reasons.length ? (
        reasons.map((r) => {
          const official = r.code ? META_ERROR_DESCRIPTIONS[r.code] : null;
          return (
            <div key={r.key} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs font-semibold text-foreground">
                    {r.code ? `Code ${r.code}` : "No code reported"}
                  </p>
                  {official && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      Official
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-foreground mt-0.5 leading-relaxed">{r.reason}</p>
                {!official && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                    Raw reason logged by Meta.
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="font-mono shrink-0 mt-0.5">
                {r.count.toLocaleString()}
              </Badge>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">No failed messages in this period.</p>
      )}
    </div>
    <div className="p-3 border-t flex items-center justify-between text-sm font-medium bg-muted/30">
      <span>Total failed</span>
      <span>{(total || 0).toLocaleString()}</span>
    </div>
  </PopoverContent>
);

export const MetricBreakdownPopoverContent = ({
  label,
  windowLabel,
  counts,
  total,
}: {
  label: string;
  windowLabel?: string;
  counts: Record<string, number>;
  total: number;
}) => (
  <PopoverContent align="start" className="w-80 p-0">
    <div className="p-3 border-b">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-[11px] text-muted-foreground">
        Category breakdown{windowLabel ? ` · ${windowLabel}` : ""}
      </p>
    </div>
    <div className="p-3 space-y-1.5">
      {CATEGORIES.map((c) => (
        <div key={c.key} className="flex items-center justify-between text-sm">
          <span className="truncate pr-2 text-muted-foreground">{c.label}</span>
          <Badge variant="secondary" className="font-mono">
            {(counts?.[c.key] || 0).toLocaleString()}
          </Badge>
        </div>
      ))}
    </div>
    <div className="p-3 border-t flex items-center justify-between text-sm font-medium bg-muted/30">
      <span>Total</span>
      <span>{(total || 0).toLocaleString()}</span>
    </div>
  </PopoverContent>
);

export default MetricBreakdownPopoverContent;
