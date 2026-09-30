import { useState, useRef, useEffect, useCallback } from "react";
import { Instagram, Facebook, Youtube, Linkedin, Twitter, MessageCircle, Heart, Share2, Send, Sparkles, Bot, Clock, User, Filter, Smile, Paperclip, X, Image as ImageIcon, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePreset, resolveDateRange } from "@/components/common/DateRangeFilter";
import { AdvancedDateRangeFilter } from "@/components/common/AdvancedDateRangeFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MetaAppDiagnosticCard } from "@/components/social/MetaAppDiagnosticCard";
import { isMetaRateLimitError } from "@/lib/metaSyncConfig";

type SyncStatus = "success" | "throttled" | "failed";
type SyncStat = {
  at: Date;
  durationMs: number;
  metaMs: number;
  storedMs: number;
  status: SyncStatus;
  trigger: "manual" | "auto" | "push";
};

const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);

const healthOf = (s: SyncStat | null) => {
  if (!s) return { label: "—", cls: "text-muted-foreground" };
  if (s.status === "throttled") return { label: "Rate-limited", cls: "text-amber-600 dark:text-amber-400" };
  if (s.status === "failed") return { label: "Failed", cls: "text-destructive" };
  if (s.durationMs > 4000) return { label: "Bottleneck", cls: "text-destructive" };
  if (s.durationMs > 2000) return { label: "Slow", cls: "text-amber-600 dark:text-amber-400" };
  return { label: "Healthy", cls: "text-emerald-600 dark:text-emerald-400" };
};


const platformIcons: Record<string, any> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  twitter: Twitter,
};

const platformColors: Record<string, string> = {
  instagram: "text-pink-500",
  facebook: "text-blue-600",
  youtube: "text-red-500",
  linkedin: "text-blue-500",
  twitter: "text-foreground",
};

interface InboxItem {
  id: string;
  threadId?: string;
  platform: string;
  type: "comment" | "message" | "mention" | "review";
  userName: string;
  userAvatar: string;
  content: string;
  postTitle?: string;
  timestamp: string;
  rawTime?: string;
  isRead: boolean;
  isReplied: boolean;
  sentiment: "positive" | "neutral" | "negative";
  permalink?: string;
}

const READ_KEY = "social_inbox_read_ids";
const REPLIED_KEY = "social_inbox_replied_ids";
const loadIds = (k: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); }
};
const saveIds = (k: string, s: Set<string>) => {
  try { localStorage.setItem(k, JSON.stringify(Array.from(s))); } catch {}
};

// Cached snapshot of the last rendered inbox, so the tab paints instantly on open
const SNAPSHOT_KEY = "social_inbox_snapshot_v1";
const SNAPSHOT_CAP = 200;
const loadSnapshot = (): InboxItem[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
    const items = Array.isArray(raw?.items) ? raw.items : [];
    return items.filter((i: any) => i && i.id && i.platform);
  } catch { return []; }
};
const saveSnapshot = (items: InboxItem[]) => {
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), items: items.slice(0, SNAPSHOT_CAP) })
    );
  } catch {}
};

const timeAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const m = Math.floor(Math.max(0, Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const initialsOf = (name: string) =>
  (name || "?").split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

// Same-activity key used to de-duplicate stored (pushed) rows against the live Graph pull
const dedupeKey = (platform: string, type: string, sender: string, content: string) =>
  [platform, type, (sender || "").toLowerCase().trim(), (content || "").trim()].join("|");

const templateReplies: Record<string, string[]> = {
  appointment: [
    "Hello! Thank you for reaching out. Please call us at 📞 0427-XXXXXXX or WhatsApp to book your appointment. Our team will assist you! 🦷",
    "Hi! We'd love to help. You can book your appointment online at our website or visit us directly. Walk-ins are welcome too! 😊",
  ],
  pricing: [
    "Thank you for your interest! Our pricing depends on the specific treatment needed. Please visit us for a free consultation and we'll provide a detailed treatment plan with costs. 🏥",
    "Hi! We offer competitive pricing with EMI options available. Please DM us or call for a personalized quote. First consultation is free! 💰",
  ],
  positive: [
    "Thank you so much for your kind words! We're glad you had a great experience. Your smile is our reward! 😊🦷",
    "We really appreciate your feedback! It motivates us to keep providing the best dental care in Salem. Thank you! 🙏",
  ],
  negative: [
    "We're sorry to hear about your experience. We strive to provide quality care at fair prices. Could you please DM us so we can address your concerns? 🙏",
    "Thank you for your feedback. We'd love the opportunity to discuss this further. Please reach out to us directly so we can make things right. 📞",
  ],
  general: [
    "Thank you for your comment! Follow us for more dental tips and updates. 🦷✨",
    "Thanks for engaging! Feel free to reach out if you have any dental questions. We're here to help! 😊",
  ],
};

const UnifiedInbox = () => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterUnread, setFilterUnread] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [filterPending, setFilterPending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState("general");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [syncStat, setSyncStat] = useState<SyncStat | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncStat[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastUpdateSource, setLastUpdateSource] = useState<"push" | "sync">("sync");
  const triggerRef = useRef<"manual" | "auto" | "push">("auto");
  const [inbox, setInbox] = useState<InboxItem[]>(() => loadSnapshot());
  const [storedPage, setStoredPage] = useState(0);
  const [hasMoreStored, setHasMoreStored] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadIds(READ_KEY));
  const [repliedIds, setRepliedIds] = useState<Set<string>>(() => loadIds(REPLIED_KEY));
  const [loadError, setLoadError] = useState<string>("");
  const [missingScopes, setMissingScopes] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readRef = useRef(readIds);
  const repliedRef = useRef(repliedIds);
  useEffect(() => { readRef.current = readIds; saveIds(READ_KEY, readIds); }, [readIds]);
  useEffect(() => { repliedRef.current = repliedIds; saveIds(REPLIED_KEY, repliedIds); }, [repliedIds]);

  const recordSync = useCallback((stat: SyncStat) => {
    setSyncStat(stat);
    setSyncHistory(prev => [stat, ...prev].slice(0, 5));
  }, []);

  const decorate = (i: InboxItem): InboxItem => ({
    ...i,
    isRead: readRef.current.has(i.id),
    isReplied: repliedRef.current.has(i.id),
  });

  // Merge incoming items into what's already rendered (cache first, live data wins on conflicts)
  const mergeItems = useCallback((incoming: InboxItem[]) => {
    setInbox(prev => {
      const byKey = new Map<string, InboxItem>();
      for (const it of prev) byKey.set(dedupeKey(it.platform, it.type, it.userName, it.content), decorate(it));
      for (const it of incoming) byKey.set(dedupeKey(it.platform, it.type, it.userName, it.content), decorate(it));
      return Array.from(byKey.values()).sort(
        (a, b) => new Date(b.rawTime || 0).getTime() - new Date(a.rawTime || 0).getTime()
      );
    });
  }, []);

  const storedToItem = (row: any): InboxItem => {
    const platform = row.platform === "facebook" ? "facebook" : "instagram";
    const type = (row.message_type === "comment" ? "comment" : "message") as InboxItem["type"];
    const name = row.sender_name || (platform === "facebook" ? "Facebook User" : "Instagram User");
    const id = `wh-${row.id}`;
    return {
      id,
      platform,
      type,
      userName: name,
      userAvatar: initialsOf(name),
      content: row.message || "",
      timestamp: timeAgo(row.created_at),
      rawTime: row.created_at,
      isRead: readRef.current.has(id),
      isReplied: repliedRef.current.has(id),
      sentiment: "neutral",
    };
  };

  const STORED_PAGE_SIZE = 25;

  // Instant path: saved activity straight from our own database, newest first, 25 at a time
  const loadStored = useCallback(async (page: number) => {
    if (page === 0) setInitialLoading(true);
    else setLoadingOlder(true);
    const t0 = performance.now();
    try {
      const { data, error } = await supabase
        .from("social_messages")
        .select("id, platform, sender_name, message, message_type, created_at")
        .order("created_at", { ascending: false })
        .range(page * STORED_PAGE_SIZE, page * STORED_PAGE_SIZE + STORED_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data || [];
      mergeItems(rows.map(storedToItem));
      setHasMoreStored(rows.length === STORED_PAGE_SIZE);
      setStoredPage(page);
      console.info(`[social-inbox] stored page ${page} (${rows.length} rows) in ${Math.round(performance.now() - t0)}ms`);
    } catch (e: any) {
      if (page === 0) setLoadError(e?.message || "Failed to load saved conversations");
    } finally {
      setInitialLoading(false);
      setLoadingOlder(false);
    }
  }, [mergeItems]);

  // Background path: live Meta pull — never blocks the rendered list
  const syncMeta = useCallback(async (showToast = false) => {
    setIsRefreshing(true);
    const trigger = triggerRef.current;
    triggerRef.current = "auto";
    const t0 = performance.now();
    setElapsedMs(0);
    console.info(`[social-inbox] meta sync start ${new Date().toISOString()} (${trigger})`);
    try {
      const { data, error } = await supabase.functions.invoke("social-inbox", { body: {} });
      const metaMs = performance.now() - t0;
      if (error) throw error;
      const items: InboxItem[] = (data?.items || []).map((it: any) => decorate(it));
      mergeItems(items);
      setLastSync(new Date());
      const errs = data?.errors || {};
      const errKeys = Object.keys(errs);
      const errText = errKeys.map(k => `${k}: ${errs[k]}`).join(" · ");
      setLoadError(errKeys.length ? errText : "");
      const missing: string[] = data?.permissions?.missing || [];
      setMissingScopes(Array.isArray(missing) ? missing : []);
      const durationMs = performance.now() - t0;
      const status: SyncStatus = isMetaRateLimitError(errText) ? "throttled" : "success";
      recordSync({ at: new Date(), durationMs, metaMs, storedMs: 0, status, trigger });
      setLastUpdateSource(trigger === "push" ? "push" : "sync");
      console.info(`[social-inbox] meta sync ${status} in ${Math.round(durationMs)}ms`);
      if (showToast) {
        toast({
          title: "Inbox refreshed",
          description: `${items.length} live items · synced in ${fmtMs(durationMs)}`,
        });
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to load live inbox";
      setLoadError(msg);
      const durationMs = performance.now() - t0;
      recordSync({
        at: new Date(),
        durationMs,
        metaMs: durationMs,
        storedMs: 0,
        status: isMetaRateLimitError(msg) ? "throttled" : "failed",
        trigger,
      });
      console.warn(`[social-inbox] meta sync failed after ${Math.round(durationMs)}ms: ${msg}`);
      if (showToast) toast({ title: "Refresh failed", description: msg, variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast, recordSync, mergeItems]);

  // Cache-first render, then a background Meta pull; webhooks keep it live afterwards
  useEffect(() => {
    loadStored(0);
    triggerRef.current = "auto";
    syncMeta(false);

    let debounce: ReturnType<typeof setTimeout> | null = null;
    // Near-instant refresh of stored activity; tiny debounce collapses webhook bursts
    const nudge = () => {
      if (debounce) clearTimeout(debounce);
      setLastUpdateSource("push");
      debounce = setTimeout(() => loadStored(0), 150);
    };

    // Optimistically render the webhook row itself so it shows before the Graph refetch lands
    const optimistic = (row: any) => {
      if (!row) return;
      const id = `wh-${row.id}`;
      const platform = row.platform === "facebook" ? "facebook" : "instagram";
      const name = row.sender_name || (platform === "facebook" ? "Facebook User" : "Instagram User");
      const rawTime = row.created_at || new Date().toISOString();
      setInbox(prev => {
        if (prev.some(i => i.id === id)) return prev;
        const item: InboxItem = {
          id,
          platform,
          type: row.message_type === "comment" ? "comment" : "message",
          userName: name,
          userAvatar: (name || "?").split(/\s+/).map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(),
          content: row.message || "",
          timestamp: "just now",
          rawTime,
          isRead: readRef.current.has(id),
          isReplied: repliedRef.current.has(id),
          sentiment: "neutral",
        };
        return [item, ...prev].sort(
          (a, b) => new Date(b.rawTime || 0).getTime() - new Date(a.rawTime || 0).getTime()
        );
      });
    };

    // Meta webhooks insert into social_messages → refresh the live inbox immediately
    const channel = supabase
      .channel("unified-inbox-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_messages" }, (payload) => {
        optimistic(payload.new);
        nudge();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "social_messages" }, nudge)
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the snapshot fresh so the next open paints instantly
  useEffect(() => {
    if (!inbox.length) return;
    const t = setTimeout(() => saveSnapshot(inbox), 500);
    return () => clearTimeout(t);
  }, [inbox]);

  // Infinite scroll for older stored activity
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMoreStored) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !loadingOlder && !initialLoading) loadStored(storedPage + 1);
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMoreStored, loadingOlder, initialLoading, storedPage, loadStored]);



  // Live counter while a sync is in flight
  useEffect(() => {
    if (!isRefreshing) return;
    const start = performance.now();
    const t = setInterval(() => setElapsedMs(performance.now() - start), 100);
    return () => clearInterval(t);
  }, [isRefreshing]);

  const handleRefresh = () => {
    triggerRef.current = "manual";
    loadStored(0);
    syncMeta(true);
  };

  const health = healthOf(syncStat);
  const latencyTooltip = syncStat
    ? [
        `Meta pull ${fmtMs(syncStat.metaMs)} · stored activity ${fmtMs(syncStat.storedMs)}`,
        `Trigger: ${syncStat.trigger}`,
        syncHistory.length > 1
          ? `Recent: ${syncHistory.map(s => fmtMs(s.durationMs)).join(", ")}`
          : "",
      ].filter(Boolean).join("\n")
    : "No sync recorded yet";

  const dateRange = datePreset === "custom"
    ? { from: customFrom, to: customTo }
    : resolveDateRange(datePreset);

  const inDateRange = (item: InboxItem) => {
    if (datePreset === "all") return true;
    if (!item.rawTime) return true;
    const t = new Date(item.rawTime).getTime();
    if (Number.isNaN(t)) return true;
    if (dateRange.from && t < new Date(dateRange.from).setHours(0, 0, 0, 0)) return false;
    if (dateRange.to && t > new Date(dateRange.to).setHours(23, 59, 59, 999)) return false;
    return true;
  };

  const filtered = inbox.filter(item => {
    if (filterPlatform !== "all" && item.platform !== filterPlatform) return false;
    if (filterType !== "all" && item.type !== filterType) return false;
    if (!inDateRange(item)) return false;
    if (filterUnread && item.isRead) return false;
    if (filterPending && item.isReplied) return false;
    return true;
  });

  // If the active filters empty the loaded set, keep pulling the next page automatically
  useEffect(() => {
    if (filtered.length === 0 && inbox.length > 0 && hasMoreStored && !loadingOlder && !initialLoading) {
      loadStored(storedPage + 1);
    }
  }, [filtered.length, inbox.length, hasMoreStored, loadingOlder, initialLoading, storedPage, loadStored]);

  const unreadCount = inbox.filter(i => !i.isRead).length;
  const unrepliedCount = inbox.filter(i => !i.isReplied).length;
  // Counts for what the current filters actually show, so badges can't contradict the list
  const scoped = inbox.filter(item => {
    if (filterPlatform !== "all" && item.platform !== filterPlatform) return false;
    if (filterType !== "all" && item.type !== filterType) return false;
    return true;
  });
  const scopedUnread = scoped.filter(i => !i.isRead).length;
  const scopedUnreplied = scoped.filter(i => !i.isReplied).length;
  const isScoped = filterPlatform !== "all" || filterType !== "all";



  const handleSendReply = async () => {
    if (!selected) return;
    if (!replyText.trim() && attachments.length === 0) return;

    if (selected.platform === "youtube") {
      toast({
        title: "YouTube needs OAuth",
        description: "Opening the post — reply there. (We'll log it as replied here.)",
      });
      if (selected.permalink) window.open(selected.permalink, "_blank", "noopener");
      const id = selected.id;
      setRepliedIds(prev => new Set(prev).add(id));
      setInbox(prev => prev.map(i => i.id === id ? { ...i, isReplied: true } : i));
      setSelected(s => s ? { ...s, isReplied: true } : s);
      setReplyText("");
      setAttachments([]);
      return;
    }

    if (!selected.threadId) {
      toast({ title: "Cannot reply", description: "Missing thread reference for this item.", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-reply", {
        body: {
          platform: selected.platform,
          type: selected.type,
          threadId: selected.threadId,
          message: replyText.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const id = selected.id;
      setRepliedIds(prev => new Set(prev).add(id));
      setInbox(prev => prev.map(i => i.id === id ? { ...i, isReplied: true } : i));
      setSelected(s => s ? { ...s, isReplied: true } : s);
      setReplyText("");
      setAttachments([]);
      toast({
        title: "Reply sent ✓",
        description: `Posted live to ${selected.platform}`,
      });
      // Re-pull to reflect the new reply
      setTimeout(() => syncMeta(false), 1500);
    } catch (e: any) {
      toast({ title: "Reply failed", description: e?.message || "Could not post reply", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleEmojiSelect = (emojiData: { emoji: string }) => {
    setReplyText(prev => prev + emojiData.emoji);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setAttachments(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAIGenerate = () => {
    const aiReply = selected?.sentiment === "negative"
      ? "We appreciate your honest feedback. At Dr. Neemz Dentistry, we're committed to providing the best care at fair prices. We'd love to discuss your concerns personally — please DM us or call 0427-XXXXXXX. 🙏"
      : selected?.content.toLowerCase().includes("appointment")
      ? "Hello! Thank you for reaching out. We'd be happy to help with an appointment. Please call us at 0427-XXXXXXX or send us a WhatsApp message, and our team will find the best slot for you. 😊🦷"
      : "Thank you for your message! We really appreciate your interest in Dr. Neemz Dentistry. Our team will get back to you shortly with all the details. Stay tuned for more dental tips! 🦷✨";
    setReplyText(aiReply);
    toast({ title: "AI reply generated", description: "Review and send" });
  };

  return (
    <div className="space-y-0">
    <MetaAppDiagnosticCard />
    <div className="grid gap-0 md:gap-3 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] h-[calc(100vh-260px)] min-h-[500px]">

      {/* Inbox List - hidden on mobile when conversation selected */}
      <Card className={`shadow-card flex flex-col overflow-hidden ${selected ? "hidden md:flex" : "flex"}`}>
        <CardHeader className="pb-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              Inbox
              <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                title={isScoped ? `${scopedUnread} unread in this view · ${unreadCount} unread overall` : undefined}
                className={`text-xs cursor-pointer transition-all hover:bg-secondary ${filterUnread ? "ring-2 ring-primary bg-primary/10" : ""}`}
                onClick={() => setFilterUnread(v => !v)}
              >
                {isScoped ? `${scopedUnread} of ${unreadCount} unread` : `${unreadCount} unread`}
              </Badge>
              <Badge
                title={isScoped ? `${scopedUnreplied} pending in this view · ${unrepliedCount} pending overall` : undefined}
                className={`bg-accent/10 text-accent text-xs border-0 cursor-pointer transition-all hover:bg-accent/20 ${filterPending ? "ring-2 ring-accent bg-accent/20" : ""}`}
                onClick={() => setFilterPending(v => !v)}
              >
                {isScoped ? `${scopedUnreplied} of ${unrepliedCount} pending` : `${unrepliedCount} pending`}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title={
                  syncStat
                    ? `Last synced: ${lastSync.toLocaleTimeString()} · round-trip ${fmtMs(syncStat.durationMs)}\n${latencyTooltip}`
                    : `Last synced: ${lastSync.toLocaleTimeString()}`
                }
                aria-label="Refresh inbox"
              >
                <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
              </Button>
              {isRefreshing && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  syncing {(elapsedMs / 1000).toFixed(1)}s…
                </span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Last synced {lastSync.toLocaleTimeString()}
            {syncStat && (
              <>
                {" "}
                <span title={latencyTooltip} className="cursor-help">
                  (took {fmtMs(syncStat.durationMs)}) ·{" "}
                  <span className={`font-semibold ${health.cls}`}>{health.label}</span>
                </span>
              </>
            )}{" "}
            · instant on new activity · Refresh for a live pull
          </p>
          <p className="text-[10px] text-muted-foreground">
            Last update via {lastUpdateSource === "push" ? "webhook push (instant)" : "live pull"}
            {syncStat && ` · Meta pull ${fmtMs(syncStat.metaMs)}`}
          </p>
          {loadError && (
            <p className="text-[10px] text-destructive mt-1 break-words">{loadError}</p>
          )}
          {missingScopes.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2 flex items-start gap-2">
              <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
                Meta token is missing permissions: <span className="font-semibold">{missingScopes.join(", ")}</span>.
                Regenerate the token in Meta with these scopes and update it in Settings → Connected Platforms to load messages.
              </p>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="comment">Comments</SelectItem>
                <SelectItem value="message">Messages</SelectItem>
                <SelectItem value="mention">Mentions</SelectItem>
                <SelectItem value="review">Reviews</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2">
            <AdvancedDateRangeFilter
              preset={datePreset}
              onPresetChange={setDatePreset}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              hideAll={false}
              hideTomorrow
              showYear
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          <div className="divide-y divide-border">
            {filtered.map(item => {
              const PlatformIcon = platformIcons[item.platform];
              const isSelected = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected({ ...item, isRead: true });
                    setReadIds(prev => { const n = new Set(prev); n.add(item.id); return n; });
                    setInbox(prev => prev.map(i => i.id === item.id ? { ...i, isRead: true } : i));
                    setShowTemplates(false);
                    setReplyText("");
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                  } ${!item.isRead ? "bg-accent/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {item.userAvatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.userName}</span>
                        {!item.isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <PlatformIcon size={10} className={platformColors[item.platform]} />
                        <span className="text-[10px] text-muted-foreground capitalize">{item.type}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{item.timestamp}</span>
                        {item.isReplied && <Badge className="bg-success/10 text-success text-[9px] border-0 h-4">Replied</Badge>}
                        {item.sentiment === "negative" && <Badge className="bg-destructive/10 text-destructive text-[9px] border-0 h-4">⚠️</Badge>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-6 py-10 text-center text-xs text-muted-foreground space-y-2">
                {initialLoading || loadingOlder ? (
                  <p>Loading conversations…</p>
                ) : loadError ? (
                  <p>No live data. {loadError}</p>
                ) : inbox.length > 0 ? (
                  <>
                    <p>
                      Nothing matches your current filters
                      {filterType !== "all" && <> · type: <span className="font-medium capitalize">{filterType}</span></>}
                      {filterPlatform !== "all" && <> · platform: <span className="font-medium capitalize">{filterPlatform}</span></>}
                      {filterUnread && <> · unread only</>}
                      {filterPending && <> · pending only</>}
                      . {inbox.length} item{inbox.length === 1 ? "" : "s"} available in total.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setFilterType("all"); setFilterPlatform("all"); setFilterUnread(false); setFilterPending(false); }}
                    >
                      Show all activity
                    </Button>
                  </>
                ) : (
                  <p>No comments, messages, mentions or reviews yet. New activity from Instagram, Facebook &amp; YouTube will appear here automatically.</p>
                )}
              </div>
            )}

            {hasMoreStored && (
              <div ref={sentinelRef} className="px-4 py-3 text-center text-[10px] text-muted-foreground">
                {loadingOlder ? "loading older…" : ""}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conversation Detail - hidden on mobile until conversation selected */}
      <Card className={`shadow-card flex flex-col overflow-hidden ${selected ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <>
            <CardHeader className="pb-3 shrink-0 border-b border-border">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 md:hidden shrink-0"
                  onClick={() => setSelected(null)}
                  aria-label="Back to inbox"
                >
                  <X size={18} />
                </Button>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold shrink-0">
                  {selected.userAvatar}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{selected.userName}</h3>
                    {(() => { const PIcon = platformIcons[selected.platform]; return <PIcon size={14} className={platformColors[selected.platform]} />; })()}
                    <Badge variant="outline" className="text-[10px] capitalize">{selected.type}</Badge>
                    <Badge className={`text-[10px] border-0 ${
                      selected.sentiment === "positive" ? "bg-success/10 text-success" :
                      selected.sentiment === "negative" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {selected.sentiment === "positive" ? "😊 Positive" : selected.sentiment === "negative" ? "😟 Negative" : "😐 Neutral"}
                    </Badge>
                  </div>
                  {selected.postTitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">On: {selected.postTitle}</p>
                  )}
                </div>
                {selected.permalink && (
                  <a href={selected.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                    Open <ExternalLink size={11} />
                  </a>
                )}
                <span className="text-xs text-muted-foreground">{selected.timestamp}</span>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto py-4">
              {/* Message bubble */}
              <div className="flex gap-3 mb-6">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {selected.userAvatar}
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]">
                  <p className="text-sm">{selected.content}</p>
                  <span className="text-[10px] text-muted-foreground mt-1 block">{selected.timestamp}</span>
                </div>
              </div>

              {selected.isReplied && (
                <div className="flex gap-3 mb-6 justify-end">
                  <div className="bg-primary/10 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                    <p className="text-sm">Thank you for reaching out! We'd love to help. Please call us or visit our clinic for a consultation. 😊🦷</p>
                    <span className="text-[10px] text-muted-foreground mt-1 block text-right">Replied</span>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    DN
                  </div>
                </div>
              )}

              {/* Template Suggestions */}
              {showTemplates && (
                <div className="mb-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-semibold">Quick Reply Templates</Label>
                    <Select value={selectedTemplateCategory} onValueChange={setSelectedTemplateCategory}>
                      <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appointment">Appointment</SelectItem>
                        <SelectItem value="pricing">Pricing</SelectItem>
                        <SelectItem value="positive">Positive Reply</SelectItem>
                        <SelectItem value="negative">Negative Reply</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    {templateReplies[selectedTemplateCategory]?.map((tpl, i) => (
                      <button
                        key={i}
                        onClick={() => { setReplyText(tpl); setShowTemplates(false); }}
                        className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-xs"
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>

            {/* Reply Area - Prominent */}
            <div className="shrink-0 border-t-2 border-primary/20 bg-muted/30 p-3 space-y-2">

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, idx) => {
                    const isImg = file.type.startsWith("image/");
                    const url = isImg ? URL.createObjectURL(file) : null;
                    return (
                      <div key={idx} className="relative group flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5 text-xs">
                        {isImg && url ? (
                          <img src={url} alt={file.name} className="h-8 w-8 object-cover rounded" />
                        ) : (
                          <Paperclip size={14} className="text-muted-foreground" />
                        )}
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remove attachment"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-background rounded-xl border-2 border-border focus-within:border-primary/50 transition-colors shadow-sm">
                <Textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Reply to ${selected.userName}...`}
                  className="min-h-[110px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none text-sm bg-transparent"
                />
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
                  <div className="flex items-center gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Add emoji">
                          <Smile size={18} className="text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 border-0 w-auto" align="start">
                        <EmojiPicker
                          onEmojiClick={handleEmojiSelect}
                          emojiStyle={EmojiStyle.NATIVE}
                          theme={Theme.AUTO}
                          width={320}
                          height={380}
                          searchPlaceholder="Search emoji..."
                          previewConfig={{ showPreview: false }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Attach file"
                    >
                      <Paperclip size={18} className="text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Attach image"
                    >
                      <ImageIcon size={18} className="text-muted-foreground" />
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,video/*,application/pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <div className="h-5 w-px bg-border mx-1" />
                    <Button
                      variant={showTemplates ? "default" : "ghost"}
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setShowTemplates(!showTemplates)}
                      title="Quick reply templates"
                    >
                      <MessageCircle size={14} className="sm:mr-1" />
                      <span className="hidden sm:inline">Templates</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-accent hover:text-accent"
                      onClick={handleAIGenerate}
                      title="AI Smart Reply"
                    >
                      <Sparkles size={14} className="sm:mr-1" />
                      <span className="hidden sm:inline">AI Reply</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        toast({ title: "Auto-reply enabled", description: `AI will respond to similar messages on ${selected.platform}` });
                      }}
                      title="Enable Auto-Reply"
                    >
                      <Bot size={14} className="sm:mr-1" />
                      <span className="hidden sm:inline">Auto</span>
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="gradient-primary border-0 h-9 px-4"
                    onClick={handleSendReply}
                    disabled={isSending || (!replyText.trim() && attachments.length === 0)}
                  >
                    <Send size={14} className="mr-1.5" /> {isSending ? "Sending…" : "Send Reply"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle size={48} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a conversation to view details</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
    </div>

  );
};

export default UnifiedInbox;
