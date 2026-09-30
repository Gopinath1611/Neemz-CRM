import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdvancedDateRangeFilter } from "@/components/common/AdvancedDateRangeFilter";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import AwarenessEntryManager, {
  AWARENESS_FORMATS, AWARENESS_PLATFORMS, AwarenessContentRow,
} from "@/components/reports/AwarenessEntryManager";
import {
  Eye, Users, Heart, IndianRupee, Image as ImageIcon, Calculator, Search,
  RefreshCw, Info, Star, ExternalLink, Pencil, Trash2, MessageCircle, Plug,
} from "lucide-react";
import { toast } from "sonner";

const CHUNK = 1000;

async function fetchAllRows<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
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

const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const nf = (n: number) => Number(n || 0).toLocaleString("en-IN");
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  gmb: "Google Business",
  linkedin: "LinkedIn",
  quora: "Quora",
  offline: "Offline",
  seo: "SEO (Google Search)",
};
const PLATFORM_STYLE: Record<string, string> = {
  instagram: "border-pink-500/40 text-pink-600",
  facebook: "border-blue-500/40 text-blue-600",
  youtube: "border-red-500/40 text-red-600",
  gmb: "border-amber-500/40 text-amber-600",
  linkedin: "border-sky-500/40 text-sky-600",
  quora: "border-rose-500/40 text-rose-600",
  offline: "border-purple-500/40 text-purple-600",
  seo: "border-emerald-500/40 text-emerald-600",
};
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  AWARENESS_FORMATS.map((f) => [f.value, f.label]),
);

/** Channels shown in Channel Performance: manual-entry channels plus organic search. */
const CHANNELS: { value: string; label: string }[] = [
  ...AWARENESS_PLATFORMS.map((p) => ({ value: p.value as string, label: p.label as string })),
  { value: "seo", label: PLATFORM_LABEL.seo },
];

/** Channels that can return their own numbers today. */
const LIVE_PLATFORMS = ["instagram", "facebook", "youtube", "seo"];

/** Maps the Ad Spend screen's platform values onto awareness channels. */
const spendPlatformToChannels = (p: string): string[] => {
  const s = (p || "").toLowerCase();
  if (s.includes("meta")) return ["instagram", "facebook"];
  if (s.includes("google")) return ["youtube", "gmb"];
  if (s.includes("offline")) return ["offline"];
  return [];
};

type Snapshot = {
  platform: string; snapshot_date: string; followers: number;
  reach: number; impressions: number; engagements: number; content_count: number;
  raw?: any;
};
type SpendRow = { platform: string; period_start: string; period_end: string; amount: number | null };
type SocialMsg = { platform: string | null; message_type: string | null; created_at: string };
type ConnectedApp = { platform: string; is_connected: boolean | null };

export default function LeadAwarenessReports() {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } =
    useDateRangeFilter("month", "leadAwarenessReports");

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [content, setContent] = useState<AwarenessContentRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [messages, setMessages] = useState<SocialMsg[]>([]);
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [channelNotes, setChannelNotes] = useState<{ channel: string; note: string }[]>([]);

  const [platformFilter, setPlatformFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<AwarenessContentRow | null>(null);
  const [deleting, setDeleting] = useState<AwarenessContentRow | null>(null);

  const fromDate = range.from?.toISOString().slice(0, 10);
  const toDate = range.to?.toISOString().slice(0, 10);
  const fromISO = range.from?.toISOString();
  const toISO = range.to?.toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contentRows, snapRows, spendRows, msgRows, appRows] = await Promise.all([
        fetchAllRows<AwarenessContentRow>((f, t) => {
          let q = supabase.from("awareness_content").select("*").order("published_at", { ascending: false }).range(f, t);
          if (fromDate) q = q.gte("published_at", fromDate);
          if (toDate) q = q.lte("published_at", toDate);
          return q;
        }),
        fetchAllRows<Snapshot>((f, t) => {
          let q = supabase.from("awareness_snapshots").select("*").order("snapshot_date", { ascending: true }).range(f, t);
          // one extra day before the window so a net change can be measured
          if (fromDate) q = q.gte("snapshot_date", fromDate);
          if (toDate) q = q.lte("snapshot_date", toDate);
          return q;
        }),
        fetchAllRows<SpendRow>((f, t) =>
          supabase.from("marketing_ad_spend").select("platform, period_start, period_end, amount").range(f, t)),
        fetchAllRows<SocialMsg>((f, t) => {
          let q = supabase.from("social_messages").select("platform, message_type, created_at").range(f, t);
          if (fromISO) q = q.gte("created_at", fromISO);
          if (toISO) q = q.lte("created_at", toISO);
          return q;
        }),
        fetchAllRows<ConnectedApp>((f, t) =>
          supabase.from("connected_apps").select("platform, is_connected").range(f, t)),
      ]);

      setContent(contentRows);
      setSnapshots(snapRows);
      setSpend(spendRows);
      setMessages(msgRows);
      setApps(appRows);
    } catch (e: any) {
      toast.error(e?.message || "Could not load awareness data");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, fromISO, toISO]);

  useEffect(() => { load(); }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("awareness-sync", {
        body: { from: fromDate, to: toDate },
        headers,
      });
      if (error) throw error;
      const errs = data?.errors ? Object.entries(data.errors as Record<string, string>) : [];
      const notes = data?.notices ? Object.entries(data.notices as Record<string, string>) : [];
      setChannelNotes(
        [...errs, ...notes].map(([k, v]) => ({ channel: PLATFORM_LABEL[k] || k, note: String(v) })),
      );
      if (data?.upserted) toast.success(`Pulled ${data.upserted} items from connected channels`);
      else toast.info("No content came back from the connected channels");
      if (errs.length) toast.warning(`${errs.map(([k]) => PLATFORM_LABEL[k] || k).join(", ")} did not return data`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const removeEntry = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("awareness_content").delete().eq("id", deleting.id);
    if (error) toast.error(error.message);
    else { toast.success("Entry removed"); load(); }
    setDeleting(null);
  };

  /** Channels that have a connection record marked connected. */
  const connectedChannels = useMemo(() => {
    const set = new Set<string>();
    for (const a of apps) {
      if (!a.is_connected) continue;
      const p = (a.platform || "").toLowerCase();
      if (p.includes("instagram") || p.includes("meta")) { set.add("instagram"); set.add("facebook"); }
      if (p.includes("youtube")) set.add("youtube");
      if (p.includes("business") || p.includes("my business")) set.add("gmb");
      if (p.includes("linkedin")) set.add("linkedin");
      if (p.includes("quora")) set.add("quora");
    }
    set.add("offline");
    // Google Search counts as connected once a search snapshot has ever been saved.
    if (snapshots.some((s) => s.platform === "seo")) set.add("seo");
    return set;
  }, [apps, snapshots]);

  /** Latest Google Search snapshot inside the window (impressions, clicks, CTR, position). */
  const seoSnapshot = useMemo(() => {
    const rows = snapshots.filter((s) => s.platform === "seo");
    if (!rows.length) return null;
    return [...rows].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
  }, [snapshots]);

  /** Channel-level spend that overlaps the selected window. */
  const channelSpend = useMemo(() => {
    const byChannel: Record<string, number> = {};
    for (const s of spend) {
      if (fromDate && s.period_end && s.period_end < fromDate) continue;
      if (toDate && s.period_start && s.period_start > toDate) continue;
      const channels = spendPlatformToChannels(s.platform);
      if (!channels.length) continue;
      const share = Number(s.amount || 0) / channels.length;
      for (const c of channels) byChannel[c] = (byChannel[c] || 0) + share;
    }
    return byChannel;
  }, [spend, fromDate, toDate]);

  /** DMs and comments received in the window, per channel. */
  const enquiriesByChannel = useMemo(() => {
    const byChannel: Record<string, number> = {};
    for (const m of messages) {
      const p = (m.platform || "instagram").toLowerCase();
      const key = p.includes("face") ? "facebook" : p.includes("insta") ? "instagram" : p;
      byChannel[key] = (byChannel[key] || 0) + 1;
    }
    return byChannel;
  }, [messages]);

  /** Net follower change per channel across the snapshot window. */
  const followerChange = useMemo(() => {
    const byChannel: Record<string, number> = {};
    const grouped: Record<string, Snapshot[]> = {};
    for (const s of snapshots) (grouped[s.platform] ||= []).push(s);
    for (const [p, rows] of Object.entries(grouped)) {
      const sorted = [...rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      byChannel[p] = (sorted[sorted.length - 1]?.followers || 0) - (sorted[0]?.followers || 0);
    }
    return byChannel;
  }, [snapshots]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return content.filter((c) => {
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (formatFilter !== "all" && c.content_format !== formatFilter) return false;
      if (!q) return true;
      return [c.title, c.caption, c.notes, PLATFORM_LABEL[c.platform], FORMAT_LABEL[c.content_format]]
        .some((v) => (v || "").toLowerCase().includes(q));
    }).sort((a, b) => (b.reach || 0) - (a.reach || 0));
  }, [content, platformFilter, formatFilter, search]);

  const totals = useMemo(() => {
    const sum = (fn: (c: AwarenessContentRow) => number) => filtered.reduce((a, c) => a + (fn(c) || 0), 0);
    const posts = filtered.filter((c) => ["post", "carousel", "story", "gmb_update", "article", "activation"].includes(c.content_format)).length;
    const reels = filtered.filter((c) => c.content_format === "reel").length;
    const shorts = filtered.filter((c) => ["short", "video"].includes(c.content_format)).length;

    const impressions = sum((c) => c.impressions || 0);
    const reach = sum((c) => c.reach || 0);
    const postEngagements = sum((c) => (c.likes || 0) + (c.comments || 0) + (c.shares || 0));

    // DMs count against the channels in view.
    const channelsInView = platformFilter === "all"
      ? Object.keys(enquiriesByChannel)
      : [platformFilter];
    const dms = channelsInView.reduce((a, c) => a + (enquiriesByChannel[c] || 0), 0);
    const engagements = postEngagements + dms;

    const postSpend = sum((c) => Number(c.boost_spend || 0));
    // Channel spend only where no post-level spend was recorded for that channel.
    const channelsWithPostSpend = new Set(filtered.filter((c) => Number(c.boost_spend || 0) > 0).map((c) => c.platform));
    const blendedSpend = Object.entries(channelSpend)
      .filter(([c]) => (platformFilter === "all" || c === platformFilter) && !channelsWithPostSpend.has(c))
      .reduce((a, [, v]) => a + v, 0);
    const totalSpend = postSpend + blendedSpend;

    const followerNet = (platformFilter === "all" ? Object.keys(followerChange) : [platformFilter])
      .reduce((a, c) => a + (followerChange[c] || 0), 0);

    return {
      published: filtered.length, posts, reels, shorts,
      impressions, reach, engagements, postEngagements, dms,
      totalSpend, postSpend, blendedSpend, followerNet,
      cpm: impressions > 0 ? (totalSpend / impressions) * 1000 : 0,
      cpe: engagements > 0 ? totalSpend / engagements : 0,
    };
  }, [filtered, channelSpend, enquiriesByChannel, followerChange, platformFilter]);

  const channelRows = useMemo(() => {
    return CHANNELS.map((p) => {
      const rows = content.filter((c) => c.platform === p.value);
      const reach = rows.reduce((a, c) => a + (c.reach || 0), 0);
      const impressions = rows.reduce((a, c) => a + (c.impressions || 0), 0);
      const engagement = rows.reduce((a, c) => a + (c.likes || 0) + (c.comments || 0) + (c.shares || 0), 0);
      const postSpend = rows.reduce((a, c) => a + Number(c.boost_spend || 0), 0);
      const spendTotal = postSpend > 0 ? postSpend : (channelSpend[p.value] || 0);

      if (p.value === "seo") {
        const raw = seoSnapshot?.raw || {};
        return {
          key: p.value,
          label: p.label,
          // Search totals come from the snapshot, not from counted content rows.
          count: seoSnapshot ? 1 : 0,
          reach: Number(seoSnapshot?.reach || 0),
          impressions: Number(seoSnapshot?.impressions || 0),
          engagement: 0,
          followers: 0,
          spend: 0,
          connected: connectedChannels.has("seo"),
          live: true,
          search: seoSnapshot
            ? {
                clicks: Number(raw.clicks ?? seoSnapshot.reach ?? 0),
                impressions: Number(raw.impressions ?? seoSnapshot.impressions ?? 0),
                ctr: raw.ctr as number | undefined,
                position: raw.avg_position as number | null | undefined,
                rangeEnd: raw.range_end as string | undefined,
              }
            : null,
        };
      }

      return {
        key: p.value,
        label: p.label,
        count: rows.length,
        reach,
        impressions,
        engagement: engagement + (enquiriesByChannel[p.value] || 0),
        followers: followerChange[p.value] || 0,
        spend: spendTotal,
        connected: connectedChannels.has(p.value),
        live: LIVE_PLATFORMS.includes(p.value),
        search: null as null | {
          clicks: number; impressions: number; ctr?: number;
          position?: number | null; rangeEnd?: string;
        },
      };
    });
  }, [content, channelSpend, enquiriesByChannel, followerChange, connectedChannels, seoSnapshot]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const kpis = [
    { label: "Content Published", value: nf(totals.published), sub: `${totals.posts} posts · ${totals.reels} reels · ${totals.shorts} shorts/videos`, icon: ImageIcon },
    { label: "Impressions", value: nf(totals.impressions), sub: `${nf(totals.reach)} reach (people)`, icon: Eye },
    { label: "Total Engagements", value: nf(totals.engagements), sub: `${nf(totals.postEngagements)} on content · ${nf(totals.dms)} DMs & comments`, icon: Heart },
    { label: "Net New Followers", value: `${totals.followerNet >= 0 ? "+" : ""}${nf(totals.followerNet)}`, sub: "Change across saved daily records", icon: Users },
    { label: "Brand Boost Spend", value: inr(totals.totalSpend), sub: `${inr(totals.postSpend)} per post · ${inr(totals.blendedSpend)} channel level`, icon: IndianRupee },
    { label: "CPM / CPE", value: `${inr(totals.cpm)} / ${totals.cpe > 0 ? `₹${totals.cpe.toFixed(2)}` : "—"}`, sub: "Cost per 1,000 impressions · per engagement", icon: Calculator },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lead Awareness Reports</h1>
            <p className="text-sm text-muted-foreground">
              Top-of-funnel brand visibility across every channel · Read-only, calculated live from saved channel data
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdvancedDateRangeFilter
              preset={preset}
              onPresetChange={setPreset}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              showYear
            />
            <AwarenessEntryManager onChanged={load} />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={runSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync channels
            </Button>
          </div>
        </div>

        {/* Per-channel sync notes (what a channel refused to share, in plain words) */}
        {channelNotes.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Last sync notes</p>
            <ul className="space-y-0.5">
              {channelNotes.map((n) => (
                <li key={n.channel}>
                  <span className="font-medium text-foreground">{n.channel}:</span> {n.note}
                </li>
              ))}
            </ul>
          </div>
        )}


        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{k.label}</CardDescription>
                  <k.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <>
                    <p className="text-xl font-semibold">{k.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Channel comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channel Performance</CardTitle>
            <CardDescription>
              Side-by-side comparison for the selected period. Channels that cannot send numbers yet are marked, so
              an empty card never reads as poor performance.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {channelRows.map((c) => (
              <div key={c.key} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={PLATFORM_STYLE[c.key]}>{c.label}</Badge>
                  {!c.live && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Plug className="h-3 w-3" /> manual
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Numbers for this channel are entered by hand for now.</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {c.count === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {c.key === "seo"
                      ? c.connected
                        ? "Google has not sent search numbers for this period yet — use Sync channels. Search data arrives about 3 days late."
                        : "Not connected yet."
                      : c.live
                        ? c.connected ? "No content recorded for this period yet — use Sync channels." : "Not connected yet."
                        : "No entries added for this period yet."}
                  </p>
                ) : c.key === "seo" && c.search ? (
                  <>
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Impressions</dt><dd>{nf(c.search.impressions)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Clicks</dt><dd>{nf(c.search.clicks)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Avg CTR</dt><dd>{c.search.ctr != null ? `${c.search.ctr}%` : "—"}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Avg position</dt><dd>{c.search.position != null ? c.search.position : "—"}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Spend</dt><dd>Organic</dd></div>
                    </dl>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Google publishes search data about 3 days late{c.search.rangeEnd ? ` · counted up to ${fmtDate(c.search.rangeEnd)}` : ""}
                    </p>
                  </>
                ) : (
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Content</dt><dd>{nf(c.count)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Reach</dt><dd>{nf(c.reach)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Impressions</dt><dd>{nf(c.impressions)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Engagement</dt><dd>{nf(c.engagement)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Followers</dt><dd>{c.followers >= 0 ? "+" : ""}{nf(c.followers)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Spend</dt><dd>{c.spend > 0 ? inr(c.spend) : "Organic"}</dd></div>
                  </dl>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Content master table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Performance</CardTitle>
            <CardDescription>Every post, reel, short, update and offline activation in the selected period, best reach first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search topic, headline or hashtag"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {CHANNELS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={formatFilter} onValueChange={(v) => { setFormatFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Format" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {AWARENESS_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">S.No</TableHead>
                    <TableHead>Channel / Type</TableHead>
                    <TableHead className="min-w-[240px]">Content</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Boost</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Enquiries</TableHead>
                    <TableHead className="text-right">Followers</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={13}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                    ))
                  ) : paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">
                        Nothing recorded for this period yet. Use <strong>Sync channels</strong> for Instagram,
                        Facebook and YouTube, or <strong>Add entry</strong> for other channels.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((c, i) => {
                      const spendVal = Number(c.boost_spend || 0);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={PLATFORM_STYLE[c.platform]}>
                                {PLATFORM_LABEL[c.platform] || c.platform}
                              </Badge>
                              <Badge variant="secondary" className="font-normal">
                                {FORMAT_LABEL[c.content_format] || c.content_format}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-start gap-1.5">
                              <div>
                                <p className="line-clamp-1 font-medium">{c.title || "Untitled"}</p>
                                {c.caption && (
                                  <p className="line-clamp-1 text-xs text-muted-foreground">{c.caption}</p>
                                )}
                                <p className="text-[11px] text-muted-foreground">
                                  {c.data_source === "platform" ? "From channel" : "Entered manually"}
                                </p>
                              </div>
                              {c.permalink && (
                                <a href={c.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(c.published_at)}</TableCell>
                          <TableCell className="text-right">
                            {spendVal > 0
                              ? <Badge variant="outline" className="border-amber-500/40 text-amber-600">{inr(spendVal)}</Badge>
                              : <span className="text-xs text-muted-foreground">Organic</span>}
                          </TableCell>
                          <TableCell className="text-right">{nf(c.reach || 0)}</TableCell>
                          <TableCell className="text-right">{nf(c.impressions || 0)}</TableCell>
                          <TableCell className="text-right">{nf(c.likes || 0)}</TableCell>
                          <TableCell className="text-right">{nf(c.comments || 0)}</TableCell>
                          <TableCell className="text-right">{nf(c.shares || 0)}</TableCell>
                          <TableCell className="text-right">{nf(c.enquiries || 0)}</TableCell>
                          <TableCell className="text-right">
                            {(c.follower_gain || 0) > 0 ? `+${nf(c.follower_gain || 0)}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(c)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                {!loading && filtered.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>Filtered total</TableCell>
                      <TableCell className="text-right">{inr(totals.postSpend)}</TableCell>
                      <TableCell className="text-right">{nf(totals.reach)}</TableCell>
                      <TableCell className="text-right">{nf(totals.impressions)}</TableCell>
                      <TableCell className="text-right">{nf(filtered.reduce((a, c) => a + (c.likes || 0), 0))}</TableCell>
                      <TableCell className="text-right">{nf(filtered.reduce((a, c) => a + (c.comments || 0), 0))}</TableCell>
                      <TableCell className="text-right">{nf(filtered.reduce((a, c) => a + (c.shares || 0), 0))}</TableCell>
                      <TableCell className="text-right">{nf(filtered.reduce((a, c) => a + (c.enquiries || 0), 0))}</TableCell>
                      <TableCell className="text-right">{nf(filtered.reduce((a, c) => a + (c.follower_gain || 0), 0))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              label="items"
            />
          </CardContent>
        </Card>

        {/* Community response + reviews */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Community Response</CardTitle>
              <CardDescription>Direct messages and comments received in this period, by channel.</CardDescription>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages or comments recorded for this period.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {Object.entries(enquiriesByChannel).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        {PLATFORM_LABEL[k] || k}
                      </span>
                      <span className="font-medium">{nf(v)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-muted-foreground" /> Public Reviews & Ratings
              </CardTitle>
              <CardDescription>Google Business Profile reviews for Dr Neemz Dentistry.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm font-medium">Reviews not connected yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Public reviews and star ratings will appear here once the Google Business Profile connection is
                  able to share them.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Instagram, Facebook and YouTube return only their most recent content, so history builds up from the first
          sync onwards. LinkedIn, Quora, Google Business updates and offline activations are entered by hand until
          those channels can share numbers. Follower change is measured from the saved daily records, so it is
          indicative at post level.
        </p>

        {editing && (
          <AwarenessEntryManager
            editing={editing}
            onOpenChange={(o) => { if (!o) setEditing(null); }}
            onChanged={load}
          />
        )}

        <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this entry?</AlertDialogTitle>
              <AlertDialogDescription>
                “{deleting?.title || "Untitled"}” will be removed from the awareness report. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={removeEntry}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
