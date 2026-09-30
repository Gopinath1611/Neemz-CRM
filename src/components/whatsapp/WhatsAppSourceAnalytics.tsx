/**
 * WhatsApp message-log analytics (scoped strictly to the WhatsApp module).
 *
 * Every number below is derived ONLY from the `whatsapp_messages` log table —
 * no other module, table or schema is touched. Breakdowns produced:
 *   0. Live metric cards (sent / delivered / read / failed / responses)
 *   1. Delivery breakdown bars
 *   2. Campaign / workflow breakdown (source + template) with delivery rate
 *   3. Core operational clinic templates (Check-in, Check-out, Prescription, Invoice)
 *   4. Trigger-origin split (appointments, clinical workflow, billing, automation,
 *      manual single sends)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { FailedBreakdownPopoverContent, groupFailureReasons } from "@/components/whatsapp/WhatsAppMetricBreakdown";

type LogRow = {
  status: string | null;
  payload: any;
  created_at: string;
  direction: string | null;
  error?: any;
};

type Aggregate = {
  key: string;
  label: string;
  sent: number;
  delivered: number;
  failed: number;
  contacts: Set<string>;
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

const recipientOf = (row: LogRow): string => {
  const req = row?.payload?.request ?? row?.payload;
  return String(req?.to || "").replace(/\D/g, "");
};

/** Core clinic template buckets, matched on the approved template name. */
const OPERATIONAL_BUCKETS: { key: string; label: string; match: (t: string) => boolean }[] = [
  { key: "checkin", label: "Check-in", match: (t) => /check[-_]?in/.test(t) },
  { key: "checkout", label: "Check-out", match: (t) => /check[-_]?out/.test(t) },
  { key: "prescription", label: "Prescription", match: (t) => /prescription/.test(t) },
  { key: "invoice", label: "Invoice", match: (t) => /invoice|^inv[-_]|payment_sharing/.test(t) },
];

const isAppointment = (t: string) => /appointment|app_booking/.test(t);

const rate = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

const sourceLabel = (source: string, template: string) => {
  const tpl = template || "(no template)";
  if (source === "workflow") return `Workflow automation · ${tpl}`;
  if (source === "single_send") return `Manual single send · ${tpl}`;
  if (source === "campaign") return `Campaign · ${tpl}`;
  return `Clinic / system trigger · ${tpl}`;
};

type RangeKey = "today" | "yesterday" | "week" | "month" | "30d" | "90d" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Local-time window for the selected preset. `to` is exclusive (always an explicit boundary). */
const resolveRange = (key: RangeKey): { from: Date | null; to: Date | null } => {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  switch (key) {
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday": {
      const from = new Date(today);
      from.setDate(from.getDate() - 1);
      return { from, to: today };
    }
    case "week": {
      const from = new Date(today);
      // Week starts Monday
      const dow = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - dow);
      return { from, to: tomorrow };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow };
    case "30d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      return { from, to: tomorrow };
    }
    case "90d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 90);
      return { from, to: tomorrow };
    }
    default:
      return { from: null, to: null };
  }
};

/** Explicit analytics categories for the metric popover breakdown. */
const CATEGORIES: { key: string; label: string }[] = [
  { key: "appointment", label: "Book Appointment" },
  { key: "checkin", label: "Check-in" },
  { key: "checkout", label: "Check-out" },
  { key: "prescription", label: "Prescription" },
  { key: "invoice", label: "Invoice" },
  { key: "automation", label: "Workflow Automation / Campaigns" },
  { key: "other", label: "Other / manual sends" },
];

const categoryOf = (row: LogRow): string => {
  const tpl = norm(templateOf(row));
  const source = sourceOf(row);
  if (isAppointment(tpl)) return "appointment";
  const bucket = OPERATIONAL_BUCKETS.find((b) => b.match(tpl));
  if (bucket) return bucket.key;
  if (source === "workflow" || source === "campaign") return "automation";
  return "other";
};


export const WhatsAppSourceAnalytics = () => {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");



  const { fromISO, toISO } = useMemo(() => {
    const { from, to } = resolveRange(rangeKey);
    return { fromISO: from ? from.toISOString() : null, toISO: to ? to.toISOString() : null };
  }, [rangeKey]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["whatsapp-source-analytics", rangeKey, fromISO, toISO],
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
        if (toISO) q = q.lt("created_at", toISO);
        const { data: chunk, error } = await q;
        if (error) {
          console.warn("[wa-source-analytics] load failed", error.message);
          break;
        }
        rows.push(...((chunk || []) as LogRow[]));
        if (!chunk || chunk.length < page) break;
      }
      return rows;
    },
  });

  const rows = data || [];

  const { campaigns, operational, triggers, totals, breakdown } = useMemo(() => {
    const outbound = rows.filter((r) => norm(r.direction) !== "in");
    const inbound = rows.filter((r) => norm(r.direction) === "in");



    const bump = (map: Map<string, Aggregate>, key: string, label: string, row: LogRow) => {
      let agg = map.get(key);
      if (!agg) {
        agg = { key, label, sent: 0, delivered: 0, failed: 0, contacts: new Set() };
        map.set(key, agg);
      }
      agg.sent += 1;
      const st = norm(row.status);
      if (DELIVERED.has(st)) agg.delivered += 1;
      if (FAILED.has(st)) agg.failed += 1;
      const to = recipientOf(row);
      if (to) agg.contacts.add(to);
    };

    const campaignMap = new Map<string, Aggregate>();
    const opMap = new Map<string, Aggregate>();
    const triggerMap = new Map<string, Aggregate>();
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    let pending = 0;

    for (const row of outbound) {
      const template = templateOf(row);
      const tplKey = norm(template);
      const source = sourceOf(row);
      sent += 1;
      const st = norm(row.status);
      if (DELIVERED.has(st)) delivered += 1;
      if (READ.has(st)) read += 1;
      if (FAILED.has(st)) failed += 1;
      if (!DELIVERED.has(st) && !FAILED.has(st)) pending += 1;

      bump(campaignMap, `${source}|${tplKey}`, sourceLabel(source, template), row);



      const bucket = OPERATIONAL_BUCKETS.find((b) => b.match(tplKey));
      if (bucket) bump(opMap, bucket.key, bucket.label, row);

      let triggerKey = "other";
      let triggerLabel = "Other / uncategorised";
      if (source === "single_send") {
        triggerKey = "manual";
        triggerLabel = "Manual single send";
      } else if (source === "workflow" || source === "campaign") {
        triggerKey = "automation";
        triggerLabel = "Campaign / workflow automation";
      } else if (isAppointment(tplKey)) {
        triggerKey = "appointment";
        triggerLabel = "Appointment bookings";
      } else if (bucket && bucket.key === "invoice") {
        triggerKey = "billing";
        triggerLabel = "Billing & invoicing";
      } else if (bucket) {
        triggerKey = "clinical";
        triggerLabel = "Clinical workflow (check-in / out / prescription)";
      }
      bump(triggerMap, triggerKey, triggerLabel, row);
    }

    const sortDesc = (list: Aggregate[]) => list.sort((a, b) => b.sent - a.sent);



    const operationalList = OPERATIONAL_BUCKETS.map(
      (b) =>
        opMap.get(b.key) || {
          key: b.key,
          label: b.label,
          sent: 0,
          delivered: 0,
          failed: 0,
          contacts: new Set<string>(),
        },
    );

    const pctOf = (n: number) => (sent > 0 ? Math.round((n / sent) * 100) : 0);

    return {
      campaigns: sortDesc(Array.from(campaignMap.values())),
      operational: operationalList,
      triggers: sortDesc(Array.from(triggerMap.values())),
      totals: { sent, delivered, read, failed, responses: inbound.length },
      breakdown: [
        { type: "Delivered", count: delivered, percent: pctOf(delivered) },
        { type: "Read", count: read, percent: pctOf(read) },
        { type: "Failed", count: failed, percent: pctOf(failed) },
        { type: "Pending / sent only", count: pending, percent: pctOf(pending) },
      ],
    };
  }, [rows]);


  /** Category counts per metric ("sent" | "delivered" | "read" | "failed" | "responses"). */
  const categoryCounts = useMemo(() => {
    const empty = () => Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<string, number>;
    const out: Record<string, Record<string, number>> = {
      sent: empty(),
      delivered: empty(),
      read: empty(),
      failed: empty(),
      responses: empty(),
    };
    for (const row of rows) {
      const cat = categoryOf(row);
      if (norm(row.direction) === "in") {
        out.responses[cat] = (out.responses[cat] || 0) + 1;
        continue;
      }
      const st = norm(row.status);
      out.sent[cat] = (out.sent[cat] || 0) + 1;
      if (DELIVERED.has(st)) out.delivered[cat] = (out.delivered[cat] || 0) + 1;
      if (READ.has(st)) out.read[cat] = (out.read[cat] || 0) + 1;
      if (FAILED.has(st)) out.failed[cat] = (out.failed[cat] || 0) + 1;
    }
    return out;
  }, [rows]);

  /** Real Meta error code + reason groups for the Failed card popover. */
  const failureReasons = useMemo(
    () =>
      groupFailureReasons(
        rows.filter((r) => norm(r.direction) !== "in" && FAILED.has(norm(r.status))),
      ),
    [rows],
  );

  const windowLabel = RANGES.find((r) => r.key === rangeKey)?.label ?? "";

  const metricCards: { label: string; value: number; helper?: string; metric: string }[] = [
    { label: "Messages Sent", value: totals.sent, metric: "sent" },
    {
      label: "Delivered",
      value: totals.delivered,
      helper: `${rate(totals.delivered, totals.sent)} delivery rate`,
      metric: "delivered",
    },
    { label: "Read", value: totals.read, helper: `${rate(totals.read, totals.sent)} read rate`, metric: "read" },
    { label: "Failed", value: totals.failed, helper: `${rate(totals.failed, totals.sent)} failure rate`, metric: "failed" },
    {
      label: "Responses",
      value: totals.responses,
      helper: `${rate(totals.responses, totals.sent)} response rate`,
      metric: "responses",
    },
  ];




  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" /> Live Analytics · {windowLabel}
          </CardTitle>
          <div className="flex items-center gap-1 flex-wrap">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={rangeKey === r.key ? "default" : "outline"}
                onClick={() => setRangeKey(r.key)}
              >
                {r.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metricCards.map((m) => {
              const counts = categoryCounts[m.metric] || {};
              return (
                <Popover key={m.label}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-left rounded-lg border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-accent/40 cursor-pointer"
                    >
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="text-2xl font-bold font-display text-foreground">
                        {(m.value || 0).toLocaleString()}
                      </p>
                      {m.helper && <p className="text-[10px] text-muted-foreground mt-0.5">{m.helper}</p>}
                    </button>
                  </PopoverTrigger>
                  {m.metric === "failed" ? (
                    <FailedBreakdownPopoverContent
                      windowLabel={windowLabel}
                      reasons={failureReasons}
                      total={m.value}
                    />
                  ) : (
                  <PopoverContent align="start" className="w-80 p-0">
                    <div className="p-3 border-b">
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-[11px] text-muted-foreground">Category breakdown · {windowLabel}</p>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {CATEGORIES.map((c) => (
                        <div key={c.key} className="flex items-center justify-between text-sm">
                          <span className="truncate pr-2 text-muted-foreground">{c.label}</span>
                          <Badge variant="secondary" className="font-mono">
                            {(counts[c.key] || 0).toLocaleString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 border-t flex items-center justify-between text-sm font-medium bg-muted/30">
                      <span>Total</span>
                      <span>{(m.value || 0).toLocaleString()}</span>
                    </div>
                  </PopoverContent>
                  )}
                </Popover>
              );
            })}
          </div>


          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1"
            onClick={() => window.open("https://business.facebook.com/wa/manage/insights/", "_blank")}
          >
            <ExternalLink size={14} /> Open Meta Detailed Analytics
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Delivery Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {totals.sent > 0 ? (
            breakdown.map((s) => (
              <div key={s.type}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{s.type}</span>
                  <span className="text-muted-foreground">
                    {s.count.toLocaleString()} ({s.percent}%)
                  </span>
                </div>
                <Progress value={s.percent} className="h-2" />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {isFetching ? "Loading message logs…" : "No outbound messages in this period."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Campaign & Workflow Message Breakdown</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {windowLabel} · sourced only from WhatsApp message logs · {totals.sent.toLocaleString()} outbound messages,{" "}
            {rate(totals.delivered, totals.sent)} delivered
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign / workflow</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Success rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="text-sm">{c.label}</TableCell>
                  <TableCell className="text-right">{c.contacts.size.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{c.sent.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{c.delivered.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{c.failed.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">{rate(c.delivered, c.sent)}</TableCell>
                </TableRow>
              ))}
              {!campaigns.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    {isFetching ? "Loading message logs…" : "No outbound messages in this period."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Core Clinic Templates</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Check-in, Check-out, Prescription and Invoice sends</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Triggered</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operational.map((o) => (
                  <TableRow key={o.key}>
                    <TableCell className="text-sm">
                      <Badge variant="outline" className="font-normal">
                        {o.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{o.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{o.delivered.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">{rate(o.delivered, o.sent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Trigger Origin</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Appointment, clinical and billing triggers versus manual sends
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Contacts</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {triggers.map((t) => (
                  <TableRow key={t.key}>
                    <TableCell className="text-sm">{t.label}</TableCell>
                    <TableCell className="text-right">{t.contacts.size.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{t.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{t.delivered.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">{rate(t.delivered, t.sent)}</TableCell>
                  </TableRow>
                ))}
                {!triggers.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      No data for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WhatsAppSourceAnalytics;
