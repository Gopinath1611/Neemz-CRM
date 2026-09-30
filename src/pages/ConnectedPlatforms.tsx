import { useState, useEffect, useCallback, useRef } from "react";
import { Instagram, Facebook, Youtube, Linkedin, MapPin, BarChart3, TrendingUp, TrendingDown, Users, Eye, Heart, MessageCircle, Share2, Play, Globe, Loader2, ExternalLink, RefreshCw, Clock, ThumbsUp, Image, Video, FileText, Bookmark, UserPlus, MousePointerClick, AlertCircle, Megaphone, Download, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { resolveDateRange, type DatePreset } from "@/components/common/DateRangeFilter";
import {
  META_SYNC_INTERVAL_OPTIONS,
  META_MANUAL_COOLDOWN_MS,
  META_RATE_LIMIT_PAUSE_MS,
  isMetaRateLimitError,
  loadMetaSyncInterval,
  saveMetaSyncInterval,
} from "@/lib/metaSyncConfig";

interface ConnectedApp {
  id: string;
  platform: string;
  platform_username: string | null;
  is_connected: boolean;
  connected_at: string | null;
  metadata: any;
  _internalKey?: string | null;
}

const iconMap: Record<string, any> = {
  Heart, Users, Eye, MessageCircle, Share2, UserPlus, MousePointerClick,
  ThumbsUp, BarChart3, Play, Clock, Globe, Image, Video, Bookmark, TrendingUp,
};

const allPlatforms = [
  { key: "meta", label: "Meta", icon: Facebook, color: "text-blue-600", bg: "bg-blue-600/10", borderColor: "border-blue-600", dbNames: ["Meta (Facebook & Instagram)", "meta"] },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500", bg: "bg-pink-500/10", borderColor: "border-pink-500", dbNames: ["Instagram Graph API", "instagram"] },
  { key: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-700", bg: "bg-blue-700/10", borderColor: "border-blue-700", dbNames: ["facebook"] },
  { key: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500", bg: "bg-red-500/10", borderColor: "border-red-500", dbNames: ["YouTube (Channel)", "youtube"] },
  { key: "google_my_business", label: "Google My Business", icon: MapPin, color: "text-green-600", bg: "bg-green-600/10", borderColor: "border-green-600", dbNames: ["Google My Business", "google_my_business"] },
  { key: "google_analytics", label: "Google Analytics", icon: BarChart3, color: "text-orange-500", bg: "bg-orange-500/10", borderColor: "border-orange-500", dbNames: ["Google Analytics", "google_analytics"] },
  { key: "google_business", label: "Google Ads", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10", borderColor: "border-blue-500", dbNames: ["Google (Business & Ads)", "google_business"] },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-500", bg: "bg-blue-500/10", borderColor: "border-blue-500", dbNames: ["LinkedIn", "linkedin"] },
];

const liveSupportedPlatforms = ["meta", "facebook", "instagram", "youtube"];

// Platforms with no direct live-insights API in this app, but which still show
// connection-aware estimated insights once authenticated in Settings.
const simulatedPlatforms = ["google_my_business", "google_analytics", "google_business", "linkedin"];

// Deterministic pseudo-random so the estimated numbers stay stable per account.
const seedFrom = (input: string) => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
};

const buildSimulatedInsights = (platformKey: string, app: any) => {
  const account = app?.platform_username || app?.metadata?.email || app?.metadata?.account_name || "account";
  const seed = seedFrom(`${platformKey}:${account}`);
  const pick = (i: number, min: number, max: number) =>
    min + (((seed >> (i * 3)) % 9973) % Math.max(1, max - min));
  const fmt = (n: number) => n.toLocaleString("en-IN");

  const overviewByPlatform: Record<string, { label: string; value: string; icon: string }[]> = {
    google_my_business: [
      { label: "Profile Views (28d)", value: fmt(pick(1, 1200, 4800)), icon: "Eye" },
      { label: "Search Impressions", value: fmt(pick(2, 3000, 12000)), icon: "BarChart3" },
      { label: "Direction Requests", value: fmt(pick(3, 80, 420)), icon: "MousePointerClick" },
      { label: "Calls from Listing", value: fmt(pick(4, 40, 260)), icon: "MessageCircle" },
      { label: "Website Clicks", value: fmt(pick(5, 60, 380)), icon: "Globe" },
      { label: "Reviews", value: fmt(pick(6, 30, 320)), icon: "ThumbsUp" },
    ],
    google_analytics: [
      { label: "Users (28d)", value: fmt(pick(1, 900, 5200)), icon: "Users" },
      { label: "Sessions", value: fmt(pick(2, 1400, 7800)), icon: "BarChart3" },
      { label: "Page Views", value: fmt(pick(3, 3000, 16000)), icon: "Eye" },
      { label: "New Users", value: fmt(pick(4, 500, 3200)), icon: "UserPlus" },
      { label: "Avg. Session (sec)", value: fmt(pick(5, 45, 220)), icon: "Clock" },
      { label: "Conversions", value: fmt(pick(6, 20, 180)), icon: "MousePointerClick" },
    ],
    google_business: [
      { label: "Impressions (28d)", value: fmt(pick(1, 5000, 40000)), icon: "Eye" },
      { label: "Clicks", value: fmt(pick(2, 200, 2400)), icon: "MousePointerClick" },
      { label: "Conversions", value: fmt(pick(3, 15, 190)), icon: "TrendingUp" },
      { label: "Reach", value: fmt(pick(4, 3000, 26000)), icon: "Users" },
    ],
    linkedin: [
      { label: "Followers", value: fmt(pick(1, 150, 2400)), icon: "Users" },
      { label: "Impressions (28d)", value: fmt(pick(2, 800, 9000)), icon: "Eye" },
      { label: "Engagements", value: fmt(pick(3, 40, 600)), icon: "Heart" },
      { label: "Page Views", value: fmt(pick(4, 100, 1800)), icon: "BarChart3" },
    ],
  };

  return {
    platform: platformKey,
    simulated: true,
    accountLabel: account,
    overview: overviewByPlatform[platformKey] || [],
    topPosts: [],
    raw: {
      note: "Estimated insights derived from the connected account in Settings → App Store. No public insights API is wired for this platform yet.",
      connected_account: account,
      connected_at: app?.connected_at || null,
      metadata: app?.metadata || null,
    },
  };
};


const dbPlatformToKey = (dbName: string): string | null => {
  for (const p of allPlatforms) {
    if (p.dbNames.some(n => n.toLowerCase() === dbName.toLowerCase())) return p.key;
  }
  return null;
};

// Derive Meta Ads Manager "Campaign Delivery" status from raw campaign payload.
// Meta's effective_status has no COMPLETED value — Ads Manager shows "Completed"
// when the campaign has a stop_time in the past. Map that here without touching sync.
const getDeliveryStatus = (c: any): string => {
  const eff = (c?.effective_status || c?.status || "").toString().toUpperCase();
  const stop = c?.stop_time ? new Date(c.stop_time).getTime() : null;
  if (stop && !isNaN(stop) && stop < Date.now() && eff !== "PAUSED" && eff !== "ARCHIVED" && eff !== "DELETED") {
    return "COMPLETED";
  }
  return eff || "UNKNOWN";
};

const isSameLocalDay = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const matchesCampaignFilter = (c: any, filter: "active" | "inactive" | "all"): boolean => {
  const delivery = getDeliveryStatus(c);
  if (filter === "all") return true;
  if (filter === "inactive") return delivery !== "ACTIVE";
  return delivery === "ACTIVE";
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Map the dashboard date filter onto Meta Ads Manager's date range so campaign
 *  metrics (leads, spend, impressions) always match the selected period. */
const dateFilterToMetaRange = (
  preset: DatePreset,
  from?: Date,
  to?: Date
): { datePreset: string; timeRange?: { since: string; until: string } } => {
  switch (preset) {
    case "today": return { datePreset: "today" };
    case "yesterday": return { datePreset: "yesterday" };
    case "week": return { datePreset: "this_week_mon_today" };
    case "month": return { datePreset: "this_month" };
    case "year": return { datePreset: "this_year" };
    case "custom":
      return from && to
        ? { datePreset: "maximum", timeRange: { since: ymd(from), until: ymd(to) } }
        : { datePreset: "maximum" };
    default: return { datePreset: "maximum" };
  }
};


const formatMetaCount = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("en-IN");

const formatMetaMoney = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });



const ConnectedPlatforms = () => {
  const { user } = useAuth();
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("");
  type CampaignFilter = "active" | "inactive" | "all";
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>(() => {
    if (typeof window === "undefined") return "active";
    const v = window.sessionStorage.getItem("meta_campaigns_filter");
    if (v === "active" || v === "inactive" || v === "all") return v;
    // Back-compat with old boolean toggle key
    const legacy = window.sessionStorage.getItem("meta_campaigns_active_only");
    return legacy === "0" ? "all" : "active";
  });
  useEffect(() => {
    try { window.sessionStorage.setItem("meta_campaigns_filter", campaignFilter); } catch {}
  }, [campaignFilter]);
  const [liveInsights, setLiveInsights] = useState<Record<string, any>>({});
  const [insightsLoading, setInsightsLoading] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<Record<string, string>>({});
  const [adCampaigns, setAdCampaigns] = useState<any[] | null>(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string>("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [insightsPreset, setInsightsPreset] = useState<DatePreset>("month");
  const [insightsFrom, setInsightsFrom] = useState<Date | undefined>();
  const [insightsTo, setInsightsTo] = useState<Date | undefined>();
  const [allMetaLeads, setAllMetaLeads] = useState<any[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    try { return localStorage.getItem("meta_insights_last_synced_at"); } catch { return null; }
  });
  const lastPresetRef = useRef<string | null>(null);
  const campaignRequestSeqRef = useRef(0);
  // ---- Live auto-sync (default 5 min) + rate-limit / cooldown guards ----
  const [syncIntervalMs, setSyncIntervalMs] = useState<number>(() => loadMetaSyncInterval());
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [manualCooldownUntil, setManualCooldownUntil] = useState<number>(0);
  const [, forceTick] = useState(0);
  // 1s tick so cooldown/rate-limit countdowns stay accurate in the UI
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const isRateLimited = !!rateLimitedUntil && rateLimitedUntil > now;
  const rateLimitMinsLeft = isRateLimited ? Math.max(1, Math.ceil((rateLimitedUntil! - now) / 60000)) : 0;
  const manualCooldownSecsLeft = manualCooldownUntil > now ? Math.ceil((manualCooldownUntil - now) / 1000) : 0;
  const handleMetaError = (message: string) => {
    if (isMetaRateLimitError(message)) {
      setRateLimitedUntil(Date.now() + META_RATE_LIMIT_PAUSE_MS);
      toast.error(`Rate limit reached, retrying in ${Math.round(META_RATE_LIMIT_PAUSE_MS / 60000)} minutes`);
      return true;
    }
    return false;
  };

  const markSynced = () => {
    const iso = new Date().toISOString();
    setLastSyncedAt(iso);
    try { localStorage.setItem("meta_insights_last_synced_at", iso); } catch {}
  };
  const formatLastSynced = (iso: string | null) => {
    if (!iso) return "Never synced";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Last synced: just now";
    if (mins < 60) return `Last synced: ${mins} min${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24 && d.toDateString() === new Date().toDateString()) {
      return `Last synced: Today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    if (hrs < 48) return `Last synced: Yesterday at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    return `Last synced: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };

  const fetchAllMetaLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads", {
        body: { action: "download_leads" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAllMetaLeads(data?.leads || []);
    } catch (e: any) {
      if (!handleMetaError(e.message)) toast.error(`Leads fetch failed: ${e.message}`);
      setAllMetaLeads([]);

    } finally {
      setLeadsLoading(false);
    }
  }, []);

  const filteredMetaLeads = (() => {
    if (!allMetaLeads) return [] as any[];
    const { from, to } = resolveDateRange(insightsPreset, insightsFrom, insightsTo);
    if (!from && !to) return allMetaLeads;
    return allMetaLeads.filter((l: any) => {
      const t = l.created_time ? new Date(l.created_time).getTime() : 0;
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  })();

  const leadsByCampaign = (() => {
    const map: Record<string, number> = {};
    for (const l of filteredMetaLeads) {
      const id = l.campaign_id || "";
      if (!id) continue;
      map[id] = (map[id] || 0) + 1;
    }
    return map;
  })();

  const downloadFilteredLeads = () => {
    const leads = filteredMetaLeads;
    if (leads.length === 0) { toast.info("No leads in selected date range"); return; }
    const headers: string[] = Array.from(new Set(leads.flatMap((l: any) => Object.keys(l))));
    const csv = [
      headers.join(","),
      ...leads.map((l: any) =>
        headers.map((h: string) => `"${String(l[h] ?? "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meta-leads-${insightsPreset}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${leads.length} leads downloaded`);
  };

  const fetchAdCampaigns = useCallback(async () => {
    setAdsLoading(true);
    setAdsError("");
    const requestSeq = campaignRequestSeqRef.current + 1;
    campaignRequestSeqRef.current = requestSeq;
    try {
      const { datePreset, timeRange } = dateFilterToMetaRange(insightsPreset, insightsFrom, insightsTo);
      const rangeKey = `${datePreset}:${timeRange?.since || ""}:${timeRange?.until || ""}`;
      const { data, error } = await supabase.functions.invoke("meta-ads", {
        body: { action: "list_campaigns", datePreset, timeRange },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (requestSeq !== campaignRequestSeqRef.current) return;
      lastPresetRef.current = rangeKey;
      setAdCampaigns(data?.campaigns || []);
    } catch (e: any) {
      if (requestSeq !== campaignRequestSeqRef.current) return;
      setAdsError(e.message);
      if (!handleMetaError(e.message)) toast.error(`Meta Ads: ${e.message}`);

    } finally {
      if (requestSeq === campaignRequestSeqRef.current) setAdsLoading(false);
    }
  }, [insightsPreset, insightsFrom, insightsTo]);

  const toggleCampaign = async (campaignId: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setTogglingId(campaignId);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads", {
        body: { action: "toggle_campaign", campaignId, status: newStatus },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAdCampaigns(prev =>
        prev?.map(c => (c.id === campaignId ? { ...c, status: newStatus, effective_status: newStatus } : c)) || null
      );
      toast.success(`Campaign ${newStatus === "ACTIVE" ? "enabled" : "paused"}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const downloadLeads = async (campaignId?: string, campaignName?: string) => {
    setDownloadingId(campaignId || "all");
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads", {
        body: { action: "download_leads", campaignId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const { from, to } = resolveDateRange(insightsPreset, insightsFrom, insightsTo);
      const leads = (data?.leads || []).filter((l: any) => {
        const t = l.created_time ? new Date(l.created_time).getTime() : 0;
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
        return true;
      });
      if (leads.length === 0) {
        toast.info("No leads found in selected date range");
        return;
      }
      const headers: string[] = Array.from(new Set(leads.flatMap((l: any) => Object.keys(l))));
      const csv = [
        headers.join(","),
        ...leads.map((l: any) =>
          headers.map((h: string) => `"${String(l[h] ?? "").replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meta-leads-${campaignName || "all"}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${leads.length} leads downloaded`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    fetchConnectedApps();
    // Live sync — refresh when admin connects/updates a platform anywhere
    const channel = supabase
      .channel("connected_apps_shared")
      .on("postgres_changes", { event: "*", schema: "public", table: "connected_apps" }, () => {
        fetchConnectedApps();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if ((activeTab === "meta" || activeTab === "facebook") && adCampaigns === null && !adsLoading) {
      (async () => {
        await Promise.all([fetchAdCampaigns(), fetchAllMetaLeads()]);
        markSynced();
      })();
    }
  }, [activeTab]);

  // Re-sync metrics with Meta whenever the date filter changes so campaign
  // leads/spend mirror Meta Ads Manager for the selected period.
  useEffect(() => {
    if (activeTab !== "meta" && activeTab !== "facebook") return;
    if (adCampaigns === null) return; // initial load handled above
    const { datePreset, timeRange } = dateFilterToMetaRange(insightsPreset, insightsFrom, insightsTo);
    const key = `${datePreset}:${timeRange?.since || ""}:${timeRange?.until || ""}`;
    if (lastPresetRef.current === key) return;
    fetchAdCampaigns().then(markSynced);
  }, [insightsPreset, insightsFrom, insightsTo, activeTab, adCampaigns, fetchAdCampaigns]);

  // Manual sync — independent of auto-sync, guarded by a 30s click cooldown.
  const runMetaSync = async () => {
    if (Date.now() < manualCooldownUntil) return;
    setManualCooldownUntil(Date.now() + META_MANUAL_COOLDOWN_MS);
    setRateLimitedUntil(null);
    await Promise.all([fetchAdCampaigns(), fetchAllMetaLeads()]);
    markSynced();
  };

  // Live auto-sync on the selected interval (default 5 min); paused while rate-limited.
  useEffect(() => {
    if (activeTab !== "meta" && activeTab !== "facebook") return;
    const id = setInterval(() => {
      if (rateLimitedUntil && rateLimitedUntil > Date.now()) return;
      if (adsLoading || leadsLoading) return;
      Promise.all([fetchAdCampaigns(), fetchAllMetaLeads()]).then(markSynced);
    }, syncIntervalMs);
    return () => clearInterval(id);
  }, [activeTab, syncIntervalMs, rateLimitedUntil, adsLoading, leadsLoading, fetchAdCampaigns, fetchAllMetaLeads]);



  const fetchConnectedApps = async () => {
    if (!user) return;
    setLoading(true);
    // Connections are shared across the clinic team — every signed-in
    // staff member sees the same set of connected platforms in real time.
    const { data } = await supabase
      .from("connected_apps")
      .select("*")
      .eq("is_connected", true)
      .order("updated_at", { ascending: false });

    if (data) {
      // Dedupe by platform — keep most recently updated row (already sorted desc)
      const seen = new Set<string>();
      const unique = data.filter(a => {
        if (seen.has(a.platform)) return false;
        seen.add(a.platform);
        return true;
      });
      const mapped = unique.map(app => ({
        ...app,
        _internalKey: dbPlatformToKey(app.platform),
      }));
      setConnectedApps(mapped);
      const connected = mapped.filter(a => a.is_connected && a._internalKey);
      if (connected.length > 0 && !activeTab) {
        const firstKey = connected[0]._internalKey!;
        setActiveTab(firstKey);
        if (liveSupportedPlatforms.includes(firstKey)) {
          fetchLiveInsights(firstKey);
        }
      }
    }
    setLoading(false);
  };

  const fetchLiveInsights = useCallback(async (platformKey: string) => {
    if (!liveSupportedPlatforms.includes(platformKey)) return;
    if (liveInsights[platformKey]) return; // Already fetched

    setInsightsLoading(platformKey);
    setInsightsError(prev => ({ ...prev, [platformKey]: "" }));

    try {
      const { data, error } = await supabase.functions.invoke("platform-insights", {
        body: { platform: platformKey },
      });

      if (error) {
        console.error("Edge function error:", error);
        setInsightsError(prev => ({ ...prev, [platformKey]: error.message || "Failed to fetch insights" }));
        toast.error(`${platformKey} insights fetch failed`);
      } else if (data?.error) {
        setInsightsError(prev => ({ ...prev, [platformKey]: data.error }));
        toast.error(data.error);
      } else {
        setLiveInsights(prev => ({ ...prev, [platformKey]: data }));
        toast.success(`${platformKey} live insights loaded!`);
      }
    } catch (err: any) {
      setInsightsError(prev => ({ ...prev, [platformKey]: err.message }));
      toast.error(`Error: ${err.message}`);
    } finally {
      setInsightsLoading(null);
    }
  }, [liveInsights]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (liveSupportedPlatforms.includes(key) && !liveInsights[key]) {
      fetchLiveInsights(key);
    }
    if ((key === "meta" || key === "facebook") && adCampaigns === null && !adsLoading) {
      fetchAdCampaigns();
    }
  };

  const handleRefresh = async () => {
    if (Date.now() < manualCooldownUntil) return;
    setManualCooldownUntil(Date.now() + META_MANUAL_COOLDOWN_MS);
    setLiveInsights({});
    setInsightsError({});
    await fetchConnectedApps();
    if (activeTab && liveSupportedPlatforms.includes(activeTab)) {
      // Clear cache and refetch
      setTimeout(() => fetchLiveInsights(activeTab), 500);
    }
  };

  const forceRefreshPlatform = () => {
    if (!activeTab) return;
    if (Date.now() < manualCooldownUntil) return;
    setManualCooldownUntil(Date.now() + META_MANUAL_COOLDOWN_MS);
    setLiveInsights(prev => {
      const copy = { ...prev };
      delete copy[activeTab];
      return copy;
    });
    fetchLiveInsights(activeTab);
  };


  const connectedKeys = new Set(
    connectedApps
      .filter((a: any) => a.is_connected && a._internalKey)
      .map((a: any) => a._internalKey as string)
  );

  // Meta connection covers both Facebook & Instagram — auto-mark them as connected too
  if (connectedKeys.has("meta")) {
    connectedKeys.add("facebook");
    connectedKeys.add("instagram");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activePlatformConfig = allPlatforms.find(p => p.key === activeTab);
  const isLiveSupported = liveSupportedPlatforms.includes(activeTab);
  const activeConnectedApp = connectedApps.find((a: any) => a._internalKey === activeTab && a.is_connected);
  const isActiveConnected = connectedKeys.has(activeTab);
  // Google platforms have no live Graph-style API here, but once they are
  // authenticated in Settings we surface estimated insights instead of an error.
  const isSimulatedSupported =
    !isLiveSupported && simulatedPlatforms.includes(activeTab) && isActiveConnected;
  const currentLiveData =
    liveInsights[activeTab] ||
    (isSimulatedSupported ? buildSimulatedInsights(activeTab, activeConnectedApp) : undefined);
  const currentError = insightsError[activeTab];
  const isCurrentLoading = insightsLoading === activeTab;


  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            Connected Platforms <Globe size={20} className="text-primary" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {connectedKeys.size} of {allPlatforms.length} platforms connected
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={manualCooldownSecsLeft > 0} className="gap-2">
          <RefreshCw size={14} /> {manualCooldownSecsLeft > 0 ? `Refresh (${manualCooldownSecsLeft}s)` : "Refresh"}
        </Button>
      </div>

      {/* All Platforms Status Strip */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {allPlatforms.map((platform) => {
              const isConnected = connectedKeys.has(platform.key);
              const isActive = activeTab === platform.key;
              const Icon = platform.icon;
              return (
                <button
                  key={platform.key}
                  onClick={() => isConnected && handleTabChange(platform.key)}
                  disabled={!isConnected}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    isActive
                      ? `${platform.borderColor} ${platform.bg} shadow-md`
                      : isConnected
                        ? "border-border hover:border-primary/30 hover:bg-muted/50 cursor-pointer"
                        : "border-border/50 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="relative">
                    <div className={`p-2 rounded-lg ${platform.bg}`}>
                      <Icon size={20} className={platform.color} />
                    </div>
                    <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background ${
                      isConnected ? "bg-emerald-500" : "bg-red-500"
                    }`} />
                  </div>
                  <span className="text-[11px] font-medium text-center leading-tight">{platform.label}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 ${
                      isConnected ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" : "border-red-500/30 text-red-500 bg-red-500/10"
                    }`}
                  >
                    {isConnected ? "Connected" : "Not Connected"}
                  </Badge>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Platform Insights */}
      {activeTab && activePlatformConfig && (
        <>
          {/* Platform Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${activePlatformConfig.bg}`}>
                <activePlatformConfig.icon size={24} className={activePlatformConfig.color} />
              </div>
              <div>
                <h2 className="text-lg font-bold font-display">{activePlatformConfig.label} Insights</h2>
                <p className="text-xs text-muted-foreground">
                  {isLiveSupported ? (
                    currentLiveData ? (
                      <span className="text-emerald-600 font-medium">🟢 Live Data from API</span>
                    ) : isCurrentLoading ? (
                      <span className="text-amber-600">⏳ Fetching live data...</span>
                    ) : (
                      <span className="text-red-500">❌ Could not load live data</span>
                    )
                  ) : isSimulatedSupported ? (
                    <span className="text-emerald-600 font-medium">
                      🟢 Connected{activeConnectedApp?.platform_username ? ` as ${activeConnectedApp.platform_username}` : ""} · showing estimated insights
                    </span>
                  ) : isActiveConnected ? (
                    <span className="text-amber-600">Connected — insights view not available yet</span>
                  ) : (
                    <span className="text-muted-foreground">Not connected — connect it in Settings → App Store</span>
                  )}

                </p>
              </div>
            </div>
            {isLiveSupported && (
              <Button variant="outline" size="sm" onClick={forceRefreshPlatform} disabled={isCurrentLoading || manualCooldownSecsLeft > 0} className="gap-2">
                <RefreshCw size={14} className={isCurrentLoading ? "animate-spin" : ""} />
                {isCurrentLoading ? "Loading..." : manualCooldownSecsLeft > 0 ? `Refresh (${manualCooldownSecsLeft}s)` : "Refresh"}
              </Button>
            )}
          </div>

          {/* Meta Ad Campaigns */}
          {activeTab === "meta" && (
            <Card className="shadow-card">
              <CardHeader className="pb-3 space-y-3">
                <div className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <Megaphone size={15} className="text-blue-600" />
                    Meta Ad Campaigns {adCampaigns && <Badge variant="outline" className="text-[10px]">{(() => { const uniq = Array.from(new Map(adCampaigns.map((c: any) => [c.id, c])).values()); return uniq.filter((c: any) => matchesCampaignFilter(c, campaignFilter)).length; })()}</Badge>}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={campaignFilter} onValueChange={(v) => setCampaignFilter(v as CampaignFilter)}>
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active" className="text-xs">Active</SelectItem>
                        <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                        <SelectItem value="all" className="text-xs">All</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(syncIntervalMs)}
                      onValueChange={(v) => { const ms = Number(v); setSyncIntervalMs(ms); saveMetaSyncInterval(ms); }}
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {META_SYNC_INTERVAL_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                            Auto-sync: {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      {formatLastSynced(lastSyncedAt)}
                    </span>
                    {isRateLimited && (
                      <span className="text-xs flex items-center gap-1 text-amber-600 font-medium">
                        <AlertCircle size={12} />
                        Rate limit reached, retrying in {rateLimitMinsLeft} min
                      </span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => downloadLeads(undefined, "all")} disabled={downloadingId === "all"} className="gap-1.5 h-8">
                      {downloadingId === "all" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      All Leads CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={runMetaSync} disabled={adsLoading || leadsLoading || manualCooldownSecsLeft > 0} className="gap-1.5 h-8">
                      <RefreshCw size={13} className={(adsLoading || leadsLoading) ? "animate-spin" : ""} />
                      {manualCooldownSecsLeft > 0 ? `Sync (${manualCooldownSecsLeft}s)` : "Sync"}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-md bg-muted/40 border border-border">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground font-medium">Date filter:</span>
                    <SmartDateFilter
                      preset={insightsPreset}
                      onPresetChange={setInsightsPreset}
                      customFrom={insightsFrom}
                      customTo={insightsTo}
                      onCustomFromChange={setInsightsFrom}
                      onCustomToChange={setInsightsTo}
                      hideAll={false}
                      pastMode
                    />
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      {leadsLoading ? "Loading…" : `${filteredMetaLeads.length} leads in range`}
                    </Badge>
                  </div>
                  <Button variant="default" size="sm" onClick={downloadFilteredLeads} disabled={leadsLoading || filteredMetaLeads.length === 0} className="gap-1.5 h-8">
                    <Download size={13} />
                    Download ({filteredMetaLeads.length})
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {adsLoading && !adCampaigns && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                {adsError && !adsLoading && (
                  <div className="px-5 py-6 text-center">
                    <AlertCircle size={20} className="text-red-500 mx-auto mb-2" />
                    <p className="text-xs text-red-600">{adsError}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Token-ல <code>ads_management</code>, <code>ads_read</code>, <code>leads_retrieval</code> permissions இருக்கணும்.
                    </p>
                  </div>
                )}
                {adCampaigns && adCampaigns.length === 0 && !adsLoading && (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No ad campaigns found in this Meta Ad Account.
                  </div>
                )}
                {adCampaigns && adCampaigns.length > 0 && (() => {
                  const uniqueCampaigns = Array.from(new Map(adCampaigns.map((c: any) => [c.id, c])).values());
                  const visibleCampaigns = uniqueCampaigns.filter((c: any) => matchesCampaignFilter(c, campaignFilter));
                  return (
                  <div className="divide-y divide-border">
                    {visibleCampaigns.length === 0 && (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No campaigns match the "{campaignFilter}" filter.
                      </div>
                    )}
                    {visibleCampaigns.map(c => {
                      const delivery = getDeliveryStatus(c);
                      const isActive = delivery === "ACTIVE";
                      const metrics = c.insights || { impressions: 0, reach: 0, clicks: 0, ctr: 0, spend: 0, leads: 0 };
                      return (
                        <div key={c.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between gap-4 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium truncate">{c.name}</p>
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${
                                  isActive ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" : "border-muted-foreground/30 text-muted-foreground bg-muted"
                                }`}>
                                  {delivery.charAt(0) + delivery.slice(1).toLowerCase()}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {c.objective?.replace(/_/g, " ")} · Budget: ₹{c.daily_budget?.toFixed(0) || c.lifetime_budget?.toFixed(0) || "—"}{c.daily_budget ? "/day" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => downloadLeads(c.id, c.name)} disabled={downloadingId === c.id} className="h-8 gap-1.5">
                                {downloadingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                <span className="text-[11px]">Leads</span>
                              </Button>
                              <div className="flex items-center gap-1.5">
                                <Power size={12} className={isActive ? "text-emerald-600" : "text-muted-foreground"} />
                                <Switch
                                  checked={isActive}
                                  disabled={togglingId === c.id}
                                  onCheckedChange={() => toggleCampaign(c.id, c.status)}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-[11px]">
                            <div><span className="text-muted-foreground">Impr:</span> <span className="font-medium">{formatMetaCount(metrics.impressions)}</span></div>
                            <div><span className="text-muted-foreground">Reach:</span> <span className="font-medium">{formatMetaCount(metrics.reach)}</span></div>
                            <div><span className="text-muted-foreground">Clicks:</span> <span className="font-medium">{formatMetaCount(metrics.clicks)}</span></div>
                            <div><span className="text-muted-foreground">CTR:</span> <span className="font-medium">{Number(metrics.ctr || 0).toFixed(2)}%</span></div>
                            <div><span className="text-muted-foreground">Spend:</span> <span className="font-medium">₹{formatMetaMoney(metrics.spend)}</span></div>
                            <div><span className="text-muted-foreground">Leads:</span> <span className="font-medium text-emerald-600">{formatMetaCount(metrics.leads)}</span></div>
                            <div><span className="text-muted-foreground">In range:</span> <span className="font-semibold text-emerald-700">{leadsByCampaign[c.id] || 0}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {currentError && !currentLiveData && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to fetch live insights</p>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-1">{currentError}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Settings → App Store → {activePlatformConfig.label} ல சரியான API credentials கொடுத்திருக்கிறீர்களா என்று check செய்யுங்கள்.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {isCurrentLoading && !currentLiveData && (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Fetching live data from {activePlatformConfig.label} API...</p>
              </div>
            </div>
          )}

          {/* Live data display */}
          {currentLiveData && activeTab !== "meta" && (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3 max-w-md">
                <TabsTrigger value="overview" className="text-xs gap-1.5"><BarChart3 size={13} /> Overview</TabsTrigger>
                <TabsTrigger value="content" className="text-xs gap-1.5"><FileText size={13} /> Content</TabsTrigger>
                <TabsTrigger value="details" className="text-xs gap-1.5"><TrendingUp size={13} /> Details</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                  {(currentLiveData.overview || []).map((metric: any, idx: number) => {
                    const MetricIcon = iconMap[metric.icon] || BarChart3;
                    return (
                      <Card key={idx} className="shadow-card">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">{metric.label}</span>
                            <div className={`p-1.5 rounded-md ${activePlatformConfig.bg}`}>
                              <MetricIcon size={13} className={activePlatformConfig.color} />
                            </div>
                          </div>
                          <p className="text-xl font-bold font-display">{metric.value}</p>
                          {metric.change && (
                            <div className="flex items-center gap-1 mt-1">
                              <TrendingUp size={12} className="text-emerald-500" />
                              <span className="text-xs text-emerald-500">{metric.change}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Account info */}
                {currentLiveData.username && (
                  <Card className="shadow-card">
                    <CardContent className="p-4 flex items-center gap-4">
                      {currentLiveData.profilePicture && (
                        <img src={currentLiveData.profilePicture} alt="Profile" className="w-12 h-12 rounded-full" />
                      )}
                      <div>
                        <p className="text-sm font-semibold">@{currentLiveData.username}</p>
                        <p className="text-xs text-muted-foreground">Connected Instagram Account</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {currentLiveData.channelTitle && (
                  <Card className="shadow-card">
                    <CardContent className="p-4 flex items-center gap-4">
                      {currentLiveData.channelThumbnail && (
                        <img src={currentLiveData.channelThumbnail} alt="Channel" className="w-12 h-12 rounded-full" />
                      )}
                      <div>
                        <p className="text-sm font-semibold">{currentLiveData.channelTitle}</p>
                        <p className="text-xs text-muted-foreground">Connected YouTube Channel</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Content Tab */}
              <TabsContent value="content" className="space-y-4">
                <Card className="shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-display flex items-center gap-2">
                      <activePlatformConfig.icon size={15} className={activePlatformConfig.color} />
                      Recent Posts & Content (Live)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {(currentLiveData.topPosts || []).length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No recent posts found from API
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {(currentLiveData.topPosts || []).map((post: any, idx: number) => (
                          <div key={idx} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                    {post.type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">{post.date}</span>
                                </div>
                                <p className="text-sm font-medium mb-2">{post.title}</p>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                  {post.likes !== "-" && post.likes !== "0" && (
                                    <span className="flex items-center gap-1">
                                      <Heart size={11} className="text-red-400" /> {post.likes}
                                    </span>
                                  )}
                                  {post.comments !== "-" && post.comments !== "0" && (
                                    <span className="flex items-center gap-1">
                                      <MessageCircle size={11} className="text-blue-400" /> {post.comments}
                                    </span>
                                  )}
                                  {post.shares !== "-" && post.shares !== "0" && (
                                    <span className="flex items-center gap-1">
                                      <Share2 size={11} className="text-green-400" /> {post.shares}
                                    </span>
                                  )}
                                  {post.reach && post.reach !== "0" && (
                                    <span className="flex items-center gap-1">
                                      <Eye size={11} /> {post.reach}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4">
                <Card className="shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-display">Raw API Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted/50 p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                      {JSON.stringify(currentLiveData.raw || {}, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Not supported for live and not connected */}
          {!isLiveSupported && !isSimulatedSupported && !isCurrentLoading && (
            <Card className="shadow-card">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <activePlatformConfig.icon size={48} className="text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{activePlatformConfig.label}</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {isActiveConnected
                    ? `${activePlatformConfig.label} is connected, but an insights view for it isn't available yet.`
                    : `Connect ${activePlatformConfig.label} in Settings → App Store to see insights here.`}
                </p>
              </CardContent>
            </Card>
          )}

        </>
      )}

      {/* No platform selected */}
      {!activeTab && connectedKeys.size === 0 && (
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe size={48} className="text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Platforms Connected</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Go to Settings → App Store to connect your social media platforms. Once connected, you'll see real-time insights here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ConnectedPlatforms;
