import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { roleLabels } from "@/lib/roleAccess";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Search, ShieldCheck, Loader2 } from "lucide-react";

import KpiCards from "@/components/admin/activity/KpiCards";
import HourlyActivityChart, {
  HourlyActivityDatum,
} from "@/components/admin/activity/HourlyActivityChart";
import LiveActivityFeed, {
  LiveActivityItem,
} from "@/components/admin/activity/LiveActivityFeed";
import SessionsTable, { SessionRow } from "@/components/admin/activity/SessionsTable";
import PageTimeTable, { PageTimeStat } from "@/components/admin/activity/PageTimeTable";
import DataChangesTable, {
  DataChangeRow,
} from "@/components/admin/activity/DataChangesTable";
import ModuleActivityView, { ModuleStat } from "@/components/admin/activity/ModuleActivityView";
import ActivityLogsExplorer, {
  ActivityLogFilters,
  ActivityLogRow,
} from "@/components/admin/activity/ActivityLogsExplorer";
import MonitoringSettingsTab from "@/components/admin/activity/MonitoringSettingsTab";

import {
  fetchActivitySummary,
  fetchHourlyActivity,
  fetchRecentChanges,
  fetchSessions,
  fetchPageViews,
  fetchPageTimeStats,
  fetchModuleStats,
  fetchLogs,
  tableToModule,
  formatDuration,
  timeAgo,
  type RecentChangeRow,
  type SessionRow as RawSessionRow,
} from "@/lib/activityMonitoring";

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const hour = i;
  const ampm = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${ampm}`;
});

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDateTime(ts: string): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString("en-IN")} ${d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
}

function capitalizeAction(action: string | null | unknown): "Create" | "Update" | "Delete" {
  const a = typeof action === "string" ? action.toLowerCase() : "";
  if (a === "insert") return "Create";
  if (a === "delete") return "Delete";
  return "Update";
}

function shortId(id: string | null | unknown): string {
  if (!id || typeof id !== "string") return "—";
  return id.length > 8 ? id.slice(0, 8) : id;
}

const UserActivityMonitor = () => {
  const { roles, user } = useAuth();
  const primaryRole = roles?.[0];
  const roleLabel = primaryRole ? roleLabels[primaryRole] ?? primaryRole : "Admin";

  const [search, setSearch] = useState("");
  const [selectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState({
    pageViews: 0,
    crudCount: 0,
    onlineUsers: 0,
    activeSessions: 0,
    uniqueUsers: 0,
  });
  const [hourlyData, setHourlyData] = useState<HourlyActivityDatum[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveActivityItem[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pageStats, setPageStats] = useState<PageTimeStat[]>([]);
  const [dataChanges, setDataChanges] = useState<DataChangeRow[]>([]);
  const [moduleStats, setModuleStats] = useState<ModuleStat[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const [logFilters, setLogFilters] = useState<ActivityLogFilters>({
    search: "",
    userId: "all",
    actionType: "all",
    module: "all",
    dateFrom: "",
    dateTo: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        summaryRes,
        hourlyRes,
        recentChanges,
        rawSessions,
        rawPageViews,
        pageTime,
        moduleActivity,
      ] = await Promise.all([
        fetchActivitySummary(selectedDate),
        fetchHourlyActivity(selectedDate),
        fetchRecentChanges(25),
        fetchSessions(),
        fetchPageViews(),
        fetchPageTimeStats(),
        fetchModuleStats(),
      ]);

      setSummary(summaryRes);

      setHourlyData(
        hourlyRes.map((h) => ({
          hour: HOUR_LABELS[h.hour] ?? `${h.hour}`,
          interactions: h.interactions,
        }))
      );

      const feed: LiveActivityItem[] = recentChanges.map((c: RecentChangeRow) => ({
        id: c.id,
        userName: c.user_name ?? "Unknown",
        actionText: `${capitalizeAction(c.action).toLowerCase()} ${c.table_name ?? "record"} ${shortId(c.record_id)}`,
        module: tableToModule(c.table_name ?? ""),
        timeAgo: timeAgo(c.created_at),
      }));
      setLiveFeed(feed);

      // Aggregate sessions by user
      const byUser = new Map<string, { name: string; role: string; sessions: number; lastSeen: number; online: boolean; totalSeconds: number }>();
      const userOptionsMap = new Map<string, string>();
      const now = Date.now();
      const onlineThreshold = 5 * 60 * 1000;
      rawSessions.forEach((s: RawSessionRow) => {
        const uid = s.user_id ?? `session-${s.session_id}`;
        if (s.user_id && s.user_name) userOptionsMap.set(s.user_id, s.user_name);
        const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).getTime() : 0;
        const startedAt = s.started_at ? new Date(s.started_at).getTime() : 0;
        const endedAt = s.ended_at ? new Date(s.ended_at).getTime() : 0;
        const duration = endedAt
          ? Math.max(0, Math.round((endedAt - startedAt) / 1000))
          : lastSeen
          ? Math.max(0, Math.round((lastSeen - startedAt) / 1000))
          : 0;
        const existing = byUser.get(uid);
        if (existing) {
          existing.sessions += 1;
          existing.totalSeconds += duration;
          if (lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
          if (!s.ended_at && lastSeen > now - onlineThreshold) existing.online = true;
        } else {
          byUser.set(uid, {
            name: s.user_name ?? "Unknown",
            role: s.role ?? "—",
            sessions: 1,
            lastSeen,
            online: !s.ended_at && lastSeen > now - onlineThreshold,
            totalSeconds: duration,
          });
        }
      });
      setUsers(
        Array.from(userOptionsMap.entries()).map(([id, name]) => ({ id, name }))
      );

      setSessions(
        Array.from(byUser.values()).map((u, idx) => ({
          id: `${idx}`,
          userName: u.name,
          role: u.role,
          lastSeen: u.lastSeen ? timeAgo(new Date(u.lastSeen)) : "—",
          status: u.online ? "online" : "offline",
          sessions: u.sessions,
          totalTime: formatDuration(u.totalSeconds),
        }))
      );

      // Top users per route
      const routeUsers = new Map<string, Map<string, number>>();
      rawPageViews.forEach((pv: any) => {
        const route = pv.route ?? "unknown";
        const name = pv.user_name ?? "Unknown";
        if (!routeUsers.has(route)) routeUsers.set(route, new Map());
        const users = routeUsers.get(route)!;
        users.set(name, (users.get(name) ?? 0) + 1);
      });

      setPageStats(
        pageTime.map((p, idx) => {
          const users = routeUsers.get(p.route) ?? new Map<string, number>();
          const topUsers = Array.from(users.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);
          return {
            id: `${idx}`,
            pageOrModule: `${p.route} · ${p.module}`,
            visits: p.visits,
            totalTime: formatDuration(p.totalSeconds),
            avgTime: formatDuration(p.visits ? Math.round(p.totalSeconds / p.visits) : 0),
            mostActiveUsers: topUsers.length ? topUsers : ["—"],
          };
        })
      );

      setDataChanges(
        recentChanges.map((c: RecentChangeRow) => ({
          id: c.id,
          time: formatDateTime(c.created_at),
          userName: c.user_name ?? "Unknown",
          action: capitalizeAction(c.action),
          entity: c.table_name ?? "—",
          recordId: shortId(c.record_id),
          module: tableToModule(c.table_name ?? ""),
        }))
      );

      // Top users per module
      const moduleUsers = new Map<string, Map<string, number>>();
      rawPageViews.forEach((pv: any) => {
        const mod = pv.module ?? tableToModule(pv.route ?? "");
        const name = pv.user_name ?? "Unknown";
        if (!moduleUsers.has(mod)) moduleUsers.set(mod, new Map());
        const users = moduleUsers.get(mod)!;
        users.set(name, (users.get(name) ?? 0) + 1);
      });

      setModuleStats(
        moduleActivity.map((m) => {
          const users = moduleUsers.get(m.module) ?? new Map<string, number>();
          const topUsers = Array.from(users.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);
          return {
            module: m.module,
            visits: m.visits,
            crudCount: m.crudCount,
            topUsers: topUsers.length ? topUsers : ["—"],
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime live feed
  useEffect(() => {
    const channel = supabase
      .channel("activity-data-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_data_changes" },
        (payload: any) => {
          const row = payload.new as RecentChangeRow;
          const item: LiveActivityItem = {
            id: row.id,
            userName: row.user_name ?? "Unknown",
            actionText: `${capitalizeAction(row.action).toLowerCase()} ${row.table_name ?? "record"} ${shortId(row.record_id)}`,
            module: tableToModule(row.table_name ?? ""),
            timeAgo: "just now",
          };
          setLiveFeed((prev) => [item, ...prev].slice(0, 50));
          setSummary((prev) => ({ ...prev, crudCount: prev.crudCount + 1 }));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Load logs when filters or pagination change
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const actionMap: Record<string, string> = { Create: "insert", Update: "update", Delete: "delete" };
      const { rows, total } = await fetchLogs(
        {
          userId: logFilters.userId === "all" ? undefined : logFilters.userId,
          action: logFilters.actionType === "all" ? undefined : actionMap[logFilters.actionType],
          module: logFilters.module === "all" ? undefined : logFilters.module,
          dateFrom: logFilters.dateFrom || undefined,
          dateTo: logFilters.dateTo || undefined,
          search: logFilters.search || undefined,
        },
        1,
        25
      );
      if (cancelled) return;
      setLogsTotal(total);
      setLogs(
        rows.map((r) => ({
          id: r.id,
          time: formatDateTime(r.created_at),
          userName: r.user_name ?? "Unknown",
          actionType: capitalizeAction(r.action),
          module: tableToModule(r.table_name ?? ""),
          description: `${r.action ?? "changed"} on ${r.table_name ?? "record"} ${shortId(r.record_id)}`,
        }))
      );
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [logFilters]);

  const filteredSessions = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.userName.toLowerCase().includes(search.toLowerCase()) ||
          s.role.toLowerCase().includes(search.toLowerCase())
      ),
    [sessions, search]
  );

  const filteredPageStats = useMemo(
    () =>
      pageStats.filter((p) => p.pageOrModule.toLowerCase().includes(search.toLowerCase())),
    [pageStats, search]
  );

  const filteredDataChanges = useMemo(
    () =>
      dataChanges.filter(
        (c) =>
          c.userName.toLowerCase().includes(search.toLowerCase()) ||
          c.module.toLowerCase().includes(search.toLowerCase()) ||
          c.entity.toLowerCase().includes(search.toLowerCase())
      ),
    [dataChanges, search]
  );

  const filteredModuleStats = useMemo(
    () =>
      moduleStats.filter((m) => m.module.toLowerCase().includes(search.toLowerCase())),
    [moduleStats, search]
  );

  const handleExportCsv = () => {
    const header = "Time,User,Action Type,Module,Description\n";
    const rows = logs
      .map(
        (l) =>
          `${l.time},${l.userName},${l.actionType},${l.module},"${l.description.replace(/"/g, '""')}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const userOptions = useMemo(() => users, [users]);

  const moduleOptions = useMemo(
    () => Array.from(new Set(moduleStats.map((m) => m.module))),
    [moduleStats]
  );

  const actionTypeOptions = ["Create", "Update", "Delete"];

  const flaggedCount = useMemo(() => {
    // We don't have off_hours flag per row in client state; approximate from summary.
    // A separate query could be added, but this keeps the UI honest with a starter rule.
    return 0;
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            User Activity & System Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track logins, page usage, data changes, and system-wide activity.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          {roleLabel}
        </Badge>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading activity data...
        </div>
      )}

      <KpiCards
        onlineUsers={summary.onlineUsers}
        totalUsers={summary.uniqueUsers}
        offlineUsers={Math.max(0, summary.uniqueUsers - summary.onlineUsers)}
        activeLast30Min={summary.activeSessions}
        pageVisitsToday={summary.pageViews}
        dbActionsToday={summary.crudCount}
        flaggedAnomalies={flaggedCount}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by user, page, or module..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1">
          <TabsTrigger value="overview">Live Overview & Analytics</TabsTrigger>
          <TabsTrigger value="sessions">Logged-In Users & Sessions</TabsTrigger>
          <TabsTrigger value="page-time">Page Time Spent</TabsTrigger>
          <TabsTrigger value="changes">Recent Data Changes</TabsTrigger>
          <TabsTrigger value="modules">Module Activity</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs Explorer</TabsTrigger>
          <TabsTrigger value="settings">Monitoring Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <HourlyActivityChart data={hourlyData} date={selectedDate} />
            </div>
            <div>
              <LiveActivityFeed items={liveFeed} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <SessionsTable sessions={filteredSessions} />
        </TabsContent>

        <TabsContent value="page-time" className="mt-4">
          <PageTimeTable pageStats={filteredPageStats} />
        </TabsContent>

        <TabsContent value="changes" className="mt-4">
          <DataChangesTable
            changes={filteredDataChanges}
            onViewDiff={(id) => console.log("view diff", id)}
          />
        </TabsContent>

        <TabsContent value="modules" className="mt-4">
          <ModuleActivityView moduleStats={filteredModuleStats} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <ActivityLogsExplorer
            logs={logs}
            filters={logFilters}
            userOptions={userOptions}
            actionTypeOptions={actionTypeOptions}
            moduleOptions={moduleOptions}
            totalCount={logsTotal}
            onFiltersChange={setLogFilters}
            onExportCsv={handleExportCsv}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <MonitoringSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserActivityMonitor;
