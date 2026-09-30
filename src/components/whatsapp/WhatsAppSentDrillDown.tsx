/**
 * Deep drill-down for the "Messages Sent" card — 4 levels:
 *
 *   L1  Module            clinic / marketing / bot / manual / system / Unattributed
 *   L2  Source            workflow name, campaign name, category bucket, or —
 *                         inside Unattributed — the original sender label
 *                         (estimated, because those rows predate per-send tracking)
 *   L3  Template          template name + message kind + stage transition
 *   L4  Messages          duplicate recipients + individual outbound rows
 *
 * Levels 1-3 come from the SQL aggregate `whatsapp_send_breakdown`, so every
 * outbound row in the window is counted exactly once and the level totals
 * always tie back to the card. Level 4 reads the raw log rows on demand.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Loader2, AlertTriangle } from "lucide-react";

type BreakdownRow = {
  module: string | null;
  category: string | null;
  raw_source: string | null;
  workflow_id: string | null;
  workflow_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  source_kind: string | null;
  name_matched: boolean | null;
  stage_to: string | null;

  message_kind: string | null;
  template_name: string | null;
  total: number;
  unique_recipients: number;
  delivered: number;
  failed: number;
  unique_appointments: number;
  unique_leads: number;
  direct_attributed: number;
  log_matched: number;
};


type MessageRow = {
  id: string;
  created_at: string;
  status: string | null;
  text: string | null;
  recipient: string | null;
  recipient_name: string | null;
  name_matched: boolean | null;
  total_count: number;
  error_code: number | null;
  error_message: string | null;
};


type DuplicateRow = {
  recipient: string;
  message_count: number;
  first_at: string;
  last_at: string;
};

const MODULE_LABELS: Record<string, string> = {
  clinic: "Clinic Workflow",
  marketing: "Marketing & Automation",
  bot: "Chat Bot",
  manual: "Manual Sends",
  system: "System",
};


const APPOINTMENT_KINDS = new Set(["booking", "reminder", "reschedule", "cancellation", "followup"]);

const titleise = (v: string | null | undefined, fallback: string) =>
  !v ? fallback : v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmt = (n: number) => (n || 0).toLocaleString();

const UNATTRIBUTED = "unattributed";


/**
 * Level-2 grouping key: the actual workflow or campaign that sent the message.
 * Messages with neither are kept in their own "Manual / Single Send" group and
 * older automation sends whose workflow name could not be recovered stay in a
 * separate, clearly labelled group — never mapped onto a real workflow.
 */
const sourceKeyOf = (r: BreakdownRow) => {
  const kind = r.source_kind || "manual";
  if (kind === "workflow") return `wf:${r.workflow_id || r.workflow_name || "unknown"}`;
  if (kind === "campaign") return `camp:${r.campaign_id || r.campaign_name || "unknown"}`;
  if (kind === "unknown_workflow") return "unknown-workflow";
  return "manual";
};

const sourceLabelOf = (r: BreakdownRow) => {
  const kind = r.source_kind || "manual";
  if (kind === "workflow") return r.workflow_name || "Workflow (name unavailable)";
  if (kind === "campaign") return r.campaign_name || "Campaign (name unavailable)";
  if (kind === "unknown_workflow") return "Workflow automation (name not recorded)";
  return "Manual / Single Send";
};

type Group = {
  key: string;
  label: string;
  total: number;
  recipients: number;
  delivered: number;
  failed: number;
  direct: number;
  matched: number;
  rows: BreakdownRow[];
};

/**
 * Level-2 subtitle. Attribution is reported per group, not from the first row,
 * so a workflow with both live-attributed and log-recovered messages is not
 * labelled "estimated" as a whole.
 */
const sourceSubOf = (g: Group) => {
  const r = g.rows[0];
  const kind = r?.source_kind || "manual";
  if (kind === "workflow") {
    if (g.matched > 0 && g.direct > 0) {
      return `${fmt(g.direct)} attributed at send time · ${fmt(g.matched)} recovered from log`;
    }
    if (g.matched > 0) return "Recovered from execution log";
    return "Attributed at send time";
  }
  if (kind === "campaign") return "Campaign";
  if (kind === "unknown_workflow") return "Sent before workflow tracking existed";
  return "Sent by hand from the inbox or a single send";
};

const groupBy = (rows: BreakdownRow[], keyOf: (r: BreakdownRow) => string, labelOf: (r: BreakdownRow) => string) => {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r);
    const g =
      map.get(key) ||
      {
        key,
        label: labelOf(r),
        total: 0,
        recipients: 0,
        delivered: 0,
        failed: 0,
        direct: 0,
        matched: 0,
        rows: [] as BreakdownRow[],
      };
    g.total += Number(r.total || 0);
    g.recipients += Number(r.unique_recipients || 0);
    g.delivered += Number(r.delivered || 0);
    g.failed += Number(r.failed || 0);
    g.direct += Number(r.direct_attributed || 0);
    g.matched += Number(r.log_matched || 0);
    g.rows.push(r);
    map.set(key, g);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};


const Row = ({
  label,
  sub,
  total,
  delivered,
  failed,
  quotaShare,
  estimated,
  warning,
  onClick,
}: {
  label: string;
  sub?: string;
  total: number;
  delivered: number;
  failed: number;
  quotaShare?: number | null;
  estimated?: boolean;
  warning?: string | null;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary/50 disabled:cursor-default"
  >
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium truncate">{label}</p>
        {estimated && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
            Estimated
          </Badge>
        )}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-success border-success/40">
          {fmt(delivered)} delivered
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-destructive border-destructive/40">
          {fmt(failed)} failed
        </Badge>
        {typeof quotaShare === "number" && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
            {quotaShare.toFixed(quotaShare < 1 ? 2 : 1)}% of daily quota
          </Badge>
        )}
      </div>
      {warning && (
        <p className="text-[11px] text-warning mt-1 flex items-center gap-1">
          <AlertTriangle size={11} className="shrink-0" />
          {warning}
        </p>
      )}
    </div>
    <span className="font-mono text-sm tabular-nums">{fmt(total)}</span>
    {onClick && <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
  </button>
);

export const WhatsAppSentDrillDown = ({
  open,
  onOpenChange,
  fromISO,
  toISO,
  windowLabel,
  cardTotal,
  dailyLimit,
  singleDay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromISO?: string | null;
  toISO?: string | null;
  windowLabel?: string;
  cardTotal?: number;
  /** Meta daily messaging limit; percentages are only shown for a single-day window. */
  dailyLimit?: number;
  singleDay?: boolean;
}) => {
  const [module, setModule] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [template, setTemplate] = useState<BreakdownRow | null>(null);

  const { data: rows, isFetching } = useQuery({
    queryKey: ["whatsapp-send-breakdown", fromISO, toISO],
    enabled: open,
    staleTime: 30_000,
    queryFn: async (): Promise<BreakdownRow[]> => {
      const { data, error } = await supabase.rpc("whatsapp_send_breakdown", {
        _from: fromISO ?? null,
        _to: toISO ?? null,
      } as any);
      if (error) throw error;
      return (data || []) as BreakdownRow[];
    },
  });

  const all = rows || [];
  const grandTotal = useMemo(() => all.reduce((s, r) => s + Number(r.total || 0), 0), [all]);

  const quotaOn = !!singleDay && Number(dailyLimit) > 0;
  const shareOf = (n: number) => (quotaOn ? (n / Number(dailyLimit)) * 100 : null);

  const modules = useMemo(
    () =>
      groupBy(
        all,
        (r) => r.module || UNATTRIBUTED,
        (r) => (r.module && r.module !== UNATTRIBUTED ? MODULE_LABELS[r.module] || titleise(r.module, "Other") : "Unattributed"),
      ),
    [all],
  );

  const moduleRows = useMemo(
    () => (module ? all.filter((r) => (r.module || UNATTRIBUTED) === module) : []),
    [all, module],
  );
  const sources = useMemo(() => groupBy(moduleRows, sourceKeyOf, sourceLabelOf), [moduleRows]);

  const sourceRows = useMemo(
    () => (source ? moduleRows.filter((r) => sourceKeyOf(r) === source) : []),
    [moduleRows, source],
  );

  const isEstimated = module === UNATTRIBUTED;

  // Level 4: the actual messages behind the selected template row. Uses the
  // same SQL derivation as the aggregate, so the list always ties out with the
  // Level 3 count instead of re-deriving filters on the client.
  const [msgPages, setMsgPages] = useState(1);
  const PAGE = 500;
  const { data: messages, isFetching: msgLoading } = useQuery({
    queryKey: [
      "whatsapp-send-drill-messages",
      fromISO,
      toISO,
      template?.template_name,
      template?.message_kind,
      template?.category,
      template?.stage_to,
      template?.workflow_id,
      template?.campaign_id,
      template?.module,
      msgPages,
    ],
    enabled: open && !!template,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase.rpc("whatsapp_send_messages", {
        _from: fromISO ?? null,
        _to: toISO ?? null,
        _module: template?.module ?? null,
        _category: template?.category ?? null,
        _template: template?.template_name ?? null,
        _kind: template?.message_kind ?? null,
        _stage: template?.stage_to ?? null,
        _workflow: template?.workflow_id ?? null,
        _campaign: template?.campaign_id ?? null,
        _limit: msgPages * PAGE,
        _offset: 0,
      } as any);
      if (error) throw error;
      return (data || []) as unknown as MessageRow[];
    },
  });

  const listedTotal = Number(messages?.[0]?.total_count || 0);


  // Level 4: recipients who received this template more than once in the window.
  const duplicatesExpected =
    !!template && Number(template.total || 0) > Number(template.unique_recipients || 0);

  const { data: duplicates } = useQuery({
    queryKey: [
      "whatsapp-send-drill-duplicates",
      fromISO,
      toISO,
      template?.template_name,
      template?.module,
      template?.workflow_id,
      template?.campaign_id,
    ],
    enabled: open && !!template && duplicatesExpected,
    staleTime: 30_000,
    queryFn: async (): Promise<DuplicateRow[]> => {
      const { data, error } = await supabase.rpc("whatsapp_template_duplicate_recipients", {
        _from: fromISO ?? null,
        _to: toISO ?? null,
        _module: template?.module || UNATTRIBUTED,
        _template: template?.template_name || null,
        _workflow: template?.workflow_id || null,
        _campaign: template?.campaign_id || null,
      } as any);
      if (error) throw error;
      return (data || []) as DuplicateRow[];
    },
  });

  const level = template ? 4 : source ? 3 : module ? 2 : 1;
  const back = () => {
    if (template) setTemplate(null);
    else if (source) setSource(null);
    else setModule(null);
    setMsgPages(1);
  };

  const recipientOf = (m: MessageRow) => m.recipient || "—";


  /** Level-3 subtitle: per-appointment / per-lead consumption for appointment sends. */
  const rowSub = (r: BreakdownRow) => {
    const perAppt =
      Number(r.unique_appointments) > 0 ? Number(r.total) / Number(r.unique_appointments) : null;
    return [
      titleise(r.message_kind, ""),
      r.stage_to && r.stage_to !== "unknown" ? `stage → ${titleise(r.stage_to, "")}` : "",
      `${fmt(Number(r.unique_recipients))} recipients`,
      Number(r.unique_leads) ? `${fmt(Number(r.unique_leads))} leads` : "",
      Number(r.unique_appointments) ? `${fmt(Number(r.unique_appointments))} appointments` : "",
      perAppt ? `${perAppt.toFixed(perAppt % 1 ? 1 : 0)} msg/appointment` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const rowWarning = (r: BreakdownRow) => {
    const extra = Number(r.total) - Number(r.unique_recipients);
    const apptExtra =
      Number(r.unique_appointments) > 0 ? Number(r.total) - Number(r.unique_appointments) : 0;
    if (extra > 0 && Number(r.unique_recipients) > 0) {
      return `${fmt(extra)} repeat send${extra === 1 ? "" : "s"} to the same numbers — open to see who`;
    }
    if (apptExtra > 0 && APPOINTMENT_KINDS.has(String(r.message_kind || ""))) {
      return `More than one message per appointment (${fmt(apptExtra)} extra)`;
    }
    return null;
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setModule(null);
          setSource(null);
          setTemplate(null);
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2">
            {level > 1 && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={back}>
                <ChevronLeft size={14} /> Back
              </Button>
            )}
            Messages Sent — Drill Down
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            {windowLabel ? `${windowLabel} · ` : ""}
            {fmt(grandTotal)} outbound messages
            {typeof cardTotal === "number" && cardTotal !== grandTotal
              ? ` (card shows ${fmt(cardTotal)})`
              : ""}
            {" · Level "}
            {level} of 4
          </p>
          {quotaOn && (
            <p className="text-[11px] text-muted-foreground">
              {((grandTotal / Number(dailyLimit)) * 100).toFixed(1)}% of the {fmt(Number(dailyLimit))} daily
              allowance used
            </p>
          )}
        </SheetHeader>

        {isFetching && !all.length ? (
          <div className="py-10 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading breakdown…
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {level === 1 &&
              (modules.length ? (
                modules.map((g) => (
                  <Row
                    key={g.key}
                    label={g.label}
                    sub={
                      g.key === UNATTRIBUTED
                        ? `${fmt(g.recipients)} unique recipients · sent before per-message tracking`
                        : `${fmt(g.recipients)} unique recipients`
                    }
                    total={g.total}
                    delivered={g.delivered}
                    failed={g.failed}
                    quotaShare={shareOf(g.total)}
                    onClick={() => setModule(g.key)}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No outbound messages in this period.
                </p>
              ))}

            {level === 2 && (
              <>
                {isEstimated && (
                  <div className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">
                    These messages were sent before per-message tracking existed, so this split is{" "}
                    <span className="font-medium text-foreground">estimated</span> from the template name and
                    the sender label stored at the time. Counts are exact; the grouping is a best guess, and
                    the pipeline stage and appointment cannot be recovered.
                  </div>
                )}
                {sources.map((g) => (
                  <Row
                    key={g.key}
                    label={g.label}
                    sub={`${sourceSubOf(g)} · ${fmt(g.recipients)} unique recipients`}
                    total={g.total}
                    delivered={g.delivered}
                    failed={g.failed}
                    quotaShare={shareOf(g.total)}
                    estimated={isEstimated || (g.matched > 0 && g.direct === 0)}


                    onClick={() => setSource(g.key)}
                  />
                ))}
              </>
            )}

            {level === 3 &&
              sourceRows
                .slice()
                .sort((a, b) => Number(b.total) - Number(a.total))
                .map((r, i) => (
                  <Row
                    key={`${r.template_name}-${r.message_kind}-${r.stage_to}-${i}`}
                    label={r.template_name || titleise(r.message_kind, "Plain message")}
                    sub={rowSub(r)}
                    total={Number(r.total)}
                    delivered={Number(r.delivered)}
                    failed={Number(r.failed)}
                    quotaShare={shareOf(Number(r.total))}
                    estimated={isEstimated || (Number(r.log_matched) > 0 && Number(r.direct_attributed) === 0)}

                    warning={rowWarning(r)}
                    onClick={() => { setMsgPages(1); setTemplate(r); }}
                  />
                ))}

            {level === 4 && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {template?.template_name || titleise(template?.message_kind, "Plain message")} ·{" "}
                  {msgLoading
                    ? "loading…"
                    : `listed ${fmt(messages?.length || 0)} of ${fmt(listedTotal || Number(template?.total || 0))} counted`}
                </p>


                {duplicatesExpected && (
                  <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-warning" />
                      Repeat sends to the same number
                    </p>
                    {(duplicates || []).length ? (
                      (duplicates || []).map((d) => (
                        <div key={d.recipient} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono truncate">{d.recipient}</span>
                          <span className="text-muted-foreground shrink-0">
                            {new Date(d.first_at).toLocaleTimeString()} → {new Date(d.last_at).toLocaleTimeString()}
                          </span>
                          <Badge variant="secondary" className="font-mono shrink-0 text-[10px]">
                            {fmt(Number(d.message_count))}×
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Loading repeat recipients…</p>
                    )}
                  </div>
                )}

                {(messages || []).map((m) => (
                  <div key={m.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {m.recipient_name && (
                          <p className="text-sm font-medium truncate">{m.recipient_name}</p>
                        )}
                        <p
                          className={
                            m.recipient_name
                              ? "text-[11px] text-muted-foreground font-mono"
                              : "text-sm font-medium font-mono"
                          }
                        >
                          {recipientOf(m)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.name_matched && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            Estimated
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            ["failed", "undeliverable", "undelivered"].includes(String(m.status || "").toLowerCase())
                              ? "text-destructive border-destructive/40 text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {m.status || "unknown"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                    {m.text && <p className="text-xs mt-1 line-clamp-2 text-foreground">{m.text}</p>}
                    {(m.error_code || m.error_message) && (
                      <p className="text-[11px] text-destructive mt-1">
                        {m.error_code ? `Code ${m.error_code}: ` : ""}
                        {m.error_message}
                      </p>
                    )}
                  </div>
                ))}
                {!msgLoading && listedTotal > (messages?.length || 0) && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setMsgPages((p) => p + 1)}>
                    Show more ({fmt(listedTotal - (messages?.length || 0))} remaining)
                  </Button>
                )}
                {!msgLoading && !(messages || []).length && (
                  <p className="text-sm text-muted-foreground py-6 text-center">No messages found.</p>
                )}

              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default WhatsAppSentDrillDown;
