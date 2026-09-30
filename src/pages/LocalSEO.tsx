import { useEffect, useState, useCallback } from "react";
import { MapPin, Search, TrendingUp, Globe, Sparkles, RefreshCw, AlertTriangle, FileText, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Ranking {
  keyword: string;
  position: number;
  clicks: number;
  impressions: number;
  ctr: number;
  change: string;
  trend: "up" | "down" | "stable";
}

interface TopPage {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

interface ChecklistItem {
  item: string;
  done: boolean;
  score: number;
  detail?: string;
}

interface Snapshot {
  id: string;
  site_url: string;
  gsc_property: string | null;
  range_start: string | null;
  range_end: string | null;
  totals: {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    avgPosition?: number | null;
    queryCount?: number;
    searchType?: string;
    timezone?: string;
    opportunities?: {
      nearPageOne?: string[];
      lowCtr?: string[];
      zeroClick?: string[];
    };
  };
  rankings: Ranking[];
  top_pages: TopPage[];
  checklist: ChecklistItem[];
  ai_suggestions: string[];
  sources: { gsc?: boolean; gsc_error?: string | null };
  created_at: string;
}

const LocalSEO = () => {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [keywordSort, setKeywordSort] = useState<"clicks" | "impressions">("clicks");

  const loadSnapshot = useCallback(async () => {
    const { data, error } = await supabase
      .from("local_seo_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.error("Failed to load SEO snapshot", error);
    setSnapshot((data as unknown as Snapshot) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("local-seo-sync", { body: {} });
      if (error) throw error;
      if (data?.status === "selection_required") {
        toast({
          title: "Multiple Search Console properties found",
          description: `Choose one: ${(data.candidates as string[]).join(", ")}`,
        });
      } else {
        toast({ title: "SEO data refreshed" });
      }
      await loadSnapshot();
    } catch (err) {
      toast({
        title: "Refresh failed",
        description: err instanceof Error ? err.message : "Could not refresh SEO data",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const checklist = snapshot?.checklist ?? [];
  const overallScore = checklist.length
    ? Math.round(checklist.reduce((a, c) => a + (c.score ?? 0), 0) / checklist.length)
    : null;
  const gscConnected = !!snapshot?.sources?.gsc;
  const rankings = snapshot?.rankings ?? [];
  const topPages = snapshot?.top_pages ?? [];
  const totals = snapshot?.totals ?? {};
  const siteCtr = Number(totals.ctr ?? 0);

  const sortedKeywords = [...rankings].sort((a, b) =>
    keywordSort === "clicks"
      ? b.clicks - a.clicks || b.impressions - a.impressions
      : b.impressions - a.impressions || b.clicks - a.clicks,
  );

  const opportunities = totals.opportunities;
  const fallbackSuggestions = [
    ...(opportunities?.lowCtr ?? []),
    ...(opportunities?.nearPageOne ?? []),
    ...(opportunities?.zeroClick ?? []),
  ];
  const suggestions = (snapshot?.ai_suggestions ?? []).length
    ? snapshot!.ai_suggestions
    : fallbackSuggestions;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            Local SEO &amp; Google <MapPin size={20} className="text-primary" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {snapshot
              ? `Live data · ${snapshot.range_start ?? "—"} to ${snapshot.range_end ?? "—"} · updated ${new Date(snapshot.created_at).toLocaleString()}`
              : "Google visibility for Dr Neemz Dentistry, Salem"}
          </p>
          {snapshot?.gsc_property && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Search Console property: {snapshot.gsc_property} · Search type:{" "}
              {snapshot.totals?.searchType ?? "web"} · 28-day window in{" "}
              {snapshot.totals?.timezone ?? "America/Los_Angeles"} (Search Console time)
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold font-display text-primary">
              {overallScore !== null ? `${overallScore}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">On-page SEO Score</p>
          </div>
          <Button variant="outline" size="sm" onClick={runSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {!loading && !snapshot && (
        <Card className="shadow-card border-warning/30">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No SEO data yet</p>
              <p className="text-sm text-muted-foreground">
                Click Refresh to run the first audit. Keyword rankings, clicks and impressions need Google Search
                Console connected; on-page checks work without it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {snapshot && !gscConnected && (
        <Card className="shadow-card border-warning/30">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Google Search Console not connected</p>
              <p className="text-sm text-muted-foreground">
                {snapshot.sources?.gsc_error ||
                  "Connect and verify Search Console to see real keyword positions, clicks and impressions."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <>
          {gscConnected && (
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: "Clicks", value: totals.clicks ?? 0 },
                { label: "Impressions", value: totals.impressions ?? 0 },
                { label: "CTR", value: `${totals.ctr ?? 0}%` },
                { label: "Avg. position", value: totals.avgPosition ?? "—" },
              ].map((k) => (
                <Card key={k.label} className="shadow-card">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-xl font-bold font-display">{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Ranking Keywords */}
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <Search size={14} /> Top Ranking Keywords
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    {(["clicks", "impressions"] as const).map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={keywordSort === k ? "secondary" : "ghost"}
                        className="h-7 text-xs capitalize"
                        onClick={() => setKeywordSort(k)}
                      >
                        {k}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Real search terms · {snapshot?.range_start ?? "—"} to {snapshot?.range_end ?? "—"}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {sortedKeywords.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted-foreground">
                    No keyword data — connect Google Search Console.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left font-medium px-4 py-2">Keyword</th>
                          <th className="text-right font-medium px-2 py-2">Pos.</th>
                          <th className="text-right font-medium px-2 py-2">Clicks</th>
                          <th className="text-right font-medium px-2 py-2">Impr.</th>
                          <th className="text-right font-medium px-4 py-2">CTR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedKeywords.map((r) => {
                          const nearPageOne = r.position > 10 && r.position <= 20;
                          const lowCtr =
                            r.impressions >= 50 && r.ctr < Math.max(1, siteCtr * 0.5) && r.position <= 20;
                          return (
                            <tr key={r.keyword}>
                              <td className="px-4 py-2 max-w-[220px]">
                                <p className="truncate">{r.keyword}</p>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {nearPageOne && (
                                    <Badge className="text-[10px] bg-warning/10 text-warning">
                                      Page 2 — close to page 1
                                    </Badge>
                                  )}
                                  {lowCtr && (
                                    <Badge className="text-[10px] bg-destructive/10 text-destructive">
                                      Low CTR
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                {r.position}
                                {r.change !== "0" && (
                                  <span
                                    className={`ml-1 text-xs ${
                                      r.trend === "up"
                                        ? "text-success"
                                        : r.trend === "down"
                                          ? "text-destructive"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {r.change}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right">{r.clicks}</td>
                              <td className="px-2 py-2 text-right">{r.impressions}</td>
                              <td className="px-4 py-2 text-right">{r.ctr}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SEO Checklist */}
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Globe size={14} /> On-page SEO Checks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {checklist.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Run Refresh to audit the published site.</p>
                ) : (
                  checklist.map((item) => (
                    <div key={item.item} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.done ? (
                            <Check size={12} className="text-success shrink-0" />
                          ) : (
                            <X size={12} className="text-warning shrink-0" />
                          )}
                          <span className="truncate">{item.item}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{item.score}%</span>
                      </div>
                      {item.detail && (
                        <p className="pl-6 text-xs text-muted-foreground truncate">{item.detail}</p>
                      )}
                      <Progress value={item.score} className="h-1" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Top Pages */}
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <FileText size={14} /> Top Pages in Google
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {topPages.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted-foreground">
                    No page data — connect Google Search Console.
                  </p>
                ) : (
                  <div className="divide-y divide-border max-h-80 overflow-y-auto">
                    {topPages.map((p) => (
                      <div key={p.page} className="flex items-center justify-between gap-3 px-6 py-3">
                        <span className="text-sm truncate">{p.page.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs">{p.clicks} clicks</Badge>
                          <Badge className="text-xs bg-muted text-muted-foreground">#{p.position}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card className="shadow-card border-accent/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Sparkles size={14} className="text-accent" /> AI SEO Suggestions
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Based on your real Search Console keywords for this period
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Suggestions are generated from the latest audit — run Refresh.
                  </p>
                ) : (
                  suggestions.map((s, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-accent/5">
                      <Sparkles size={12} className="text-accent shrink-0 mt-0.5" />
                      <p className="text-sm text-foreground/80">{s}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {gscConnected && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp size={12} /> Source: Google Search Console property {snapshot?.gsc_property}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default LocalSEO;
