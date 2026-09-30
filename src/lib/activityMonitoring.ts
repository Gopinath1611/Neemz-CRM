import { supabase } from "@/integrations/supabase/client";

// Supabase enforces a hard cap of 1000 rows per request. Use range-based
// pagination internally whenever a query could exceed that limit.
const SUPABASE_ROW_CAP = 1000;

// Cast to `any` because the new activity_* tables are not yet part of the
// generated Supabase types. This keeps callers strongly typed while we wait
// for the schema types to be regenerated.
const db = supabase as any;

export interface ActivitySummary {
  pageViews: number;
  crudCount: number;
  onlineUsers: number;
  activeSessions: number;
  uniqueUsers: number;
}

export interface HourlyActivityPoint {
  hour: number;
  interactions: number;
}

export interface RecentChangeRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  table_name: string | null;
  record_id: string | null;
  action: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface SessionRow {
  id: string;
  session_id: string;
  user_id: string | null;
  user_name: string | null;
  role: string | null;
  started_at: string;
  last_seen_at: string | null;
  ended_at: string | null;
  [key: string]: unknown;
}

export interface PageTimeStat {
  route: string;
  module: string;
  visits: number;
  totalSeconds: number;
}

export interface ModuleStat {
  module: string;
  visits: number;
  crudCount: number;
}

export interface ActivityLogFilters {
  userId?: string;
  module?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/**
 * Maps a known application route to a human-friendly module name used for
 * grouping in the monitoring dashboards. Unmatched routes fall back to
 * "Other".
 */
export function routeToModule(route: string): string {
  if (!route) return "Other";
  const path = route.split("?")[0].toLowerCase();

  const rules: Array<{ match: RegExp; module: string }> = [
    { match: /^\/clinic-workflow/, module: "Clinic" },
    { match: /^\/appointments?/, module: "Clinic" },
    { match: /^\/patients?/, module: "Clinic" },
    { match: /^\/finance/, module: "Finance" },
    { match: /^\/invoices?/, module: "Finance" },
    { match: /^\/expenses?/, module: "Finance" },
    { match: /^\/leads?/, module: "Sales & Marketing" },
    { match: /^\/pipeline/, module: "Sales & Marketing" },
    { match: /^\/campaigns?/, module: "Sales & Marketing" },
    { match: /^\/marketing/, module: "Sales & Marketing" },
    { match: /^\/employees?/, module: "HR" },
    { match: /^\/payroll/, module: "HR" },
    { match: /^\/attendance/, module: "HR" },
    { match: /^\/leave/, module: "HR" },
    { match: /^\/settings/, module: "Admin & Governance" },
    { match: /^\/admin/, module: "Admin & Governance" },
    { match: /^\/users?/, module: "Admin & Governance" },
    { match: /^\/roles?/, module: "Admin & Governance" },
    { match: /^\/dashboard/, module: "Dashboard" },
    { match: /^\/reports?/, module: "Reports" },
    { match: /^\/monitoring/, module: "Admin & Governance" },
  ];

  const found = rules.find((r) => r.match.test(path));
  return found ? found.module : "Other";
}

/**
 * Maps a recorded table name to a module name for CRUD change rows.
 * The trigger stores the raw table name in the module column, so this
 * helper derives the same module groups used for page views.
 */
export function tableToModule(tableName: string): string {
  if (!tableName) return "Other";
  const t = tableName.toLowerCase();
  if (["patients", "appointments", "treatment_plans", "treatment_plan_items"].includes(t)) return "Clinic";
  if (["billings", "billing_payments", "expenses"].includes(t)) return "Finance";
  return "Other";
}

/** Formats a duration in seconds as a short human-readable string, e.g. "2h 15m". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0 || Number.isNaN(seconds)) return "0s";
  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Returns a human readable relative time string, e.g. "5m ago". */
export function timeAgo(date: string | Date): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - then.getTime();
  if (Number.isNaN(diffMs)) return "";
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y ago`;
}

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Fetches all rows for a query using range pagination to work around the 1000-row cap. */
async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  // Safety cap to avoid runaway loops in pathological cases.
  const maxIterations = 50;

  for (let i = 0; i < maxIterations; i++) {
    const to = from + SUPABASE_ROW_CAP - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) {
      console.error("[activityMonitoring] pagination error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < SUPABASE_ROW_CAP) break;
    from += SUPABASE_ROW_CAP;
  }

  return results;
}

/** Summary metrics for the monitoring dashboard for a given date (YYYY-MM-DD). */
export async function fetchActivitySummary(date: string): Promise<ActivitySummary> {
  const { start, end } = dayRange(date);

  try {
    const [pageViews, crudChanges, sessions] = await Promise.all([
      fetchAllRows((from, to) =>
        db
          .from("activity_page_views")
          .select("id, user_id", { count: "exact" })
          .gte("started_at", start)
          .lte("started_at", end)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        db
          .from("activity_data_changes")
          .select("id", { count: "exact" })
          .gte("created_at", start)
          .lte("created_at", end)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        db
          .from("activity_sessions")
          .select("id, user_id, last_seen_at, ended_at")
          .gte("started_at", start)
          .lte("started_at", end)
          .range(from, to)
      ),
    ]);

    const uniqueUsers = new Set(pageViews.map((p: any) => p.user_id).filter(Boolean)).size;
    const onlineThreshold = Date.now() - 3 * 60 * 1000; // active in the last 3 minutes
    const onlineUsers = new Set(
      sessions
        .filter((s: any) => !s.ended_at && s.last_seen_at && new Date(s.last_seen_at).getTime() > onlineThreshold)
        .map((s: any) => s.user_id)
        .filter(Boolean)
    ).size;
    const activeSessions = sessions.filter((s: any) => !s.ended_at).length;

    return {
      pageViews: pageViews.length,
      crudCount: crudChanges.length,
      onlineUsers,
      activeSessions,
      uniqueUsers,
    };
  } catch (err) {
    console.error("[activityMonitoring] fetchActivitySummary failed:", err);
    return { pageViews: 0, crudCount: 0, onlineUsers: 0, activeSessions: 0, uniqueUsers: 0 };
  }
}

/** Returns interaction counts bucketed by hour (0-23) for a given date. */
export async function fetchHourlyActivity(date: string): Promise<HourlyActivityPoint[]> {
  const { start, end } = dayRange(date);
  const buckets: HourlyActivityPoint[] = Array.from({ length: 24 }, (_, hour) => ({ hour, interactions: 0 }));

  try {
    const rows = await fetchAllRows((from, to) =>
      db
        .from("activity_page_views")
        .select("started_at")
        .gte("started_at", start)
        .lte("started_at", end)
        .range(from, to)
    );

    const crudRows = await fetchAllRows((from, to) =>
      db
        .from("activity_data_changes")
        .select("created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .range(from, to)
    );

    rows.forEach((row: any) => {
      const hour = new Date(row.started_at).getHours();
      if (buckets[hour]) buckets[hour].interactions += 1;
    });
    crudRows.forEach((row: any) => {
      const hour = new Date(row.created_at).getHours();
      if (buckets[hour]) buckets[hour].interactions += 1;
    });

    return buckets;
  } catch (err) {
    console.error("[activityMonitoring] fetchHourlyActivity failed:", err);
    return buckets;
  }
}

/** Returns the most recent CRUD change rows, newest first. */
export async function fetchRecentChanges(limit = 50): Promise<RecentChangeRow[]> {
  try {
    const { data, error } = await db
      .from("activity_data_changes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as RecentChangeRow[];
  } catch (err) {
    console.error("[activityMonitoring] fetchRecentChanges failed:", err);
    return [];
  }
}

/** Returns raw page view rows, most recent first. */
export async function fetchPageViews(): Promise<any[]> {
  try {
    const rows = await fetchAllRows((from, to) =>
      db
        .from("activity_page_views")
        .select("id, user_id, user_name, route, module, duration_seconds, started_at, ended_at")
        .order("started_at", { ascending: false })
        .range(from, to)
    );
    return rows ?? [];
  } catch (err) {
    console.error("[activityMonitoring] fetchPageViews failed:", err);
    return [];
  }
}

/** Returns all recorded user sessions, most recent first. */
export async function fetchSessions(): Promise<SessionRow[]> {
  try {
    const rows = await fetchAllRows((from, to) =>
      db
        .from("activity_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .range(from, to)
    );
    return rows as SessionRow[];
  } catch (err) {
    console.error("[activityMonitoring] fetchSessions failed:", err);
    return [];
  }
}

/** Aggregates page view time / visit counts by route and derived module. */
export async function fetchPageTimeStats(): Promise<PageTimeStat[]> {
  try {
    const rows = await fetchAllRows((from, to) =>
      db
        .from("activity_page_views")
        .select("route, duration_seconds")
        .range(from, to)
    );

    const map = new Map<string, PageTimeStat>();
    rows.forEach((row: any) => {
      const route = row.route ?? "unknown";
      const existing = map.get(route) ?? {
        route,
        module: routeToModule(route),
        visits: 0,
        totalSeconds: 0,
      };
      existing.visits += 1;
      existing.totalSeconds += row.duration_seconds ?? 0;
      map.set(route, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.visits - a.visits);
  } catch (err) {
    console.error("[activityMonitoring] fetchPageTimeStats failed:", err);
    return [];
  }
}

/** Aggregates visits and CRUD activity grouped by module. */
export async function fetchModuleStats(): Promise<ModuleStat[]> {
  try {
    const [views, changes] = await Promise.all([
      fetchAllRows((from, to) =>
        db.from("activity_page_views").select("route").range(from, to)
      ),
      fetchAllRows((from, to) =>
        db.from("activity_data_changes").select("table_name, module").range(from, to)
      ),
    ]);

    const map = new Map<string, ModuleStat>();

    const ensure = (module: string) => {
      if (!map.has(module)) map.set(module, { module, visits: 0, crudCount: 0 });
      return map.get(module)!;
    };

    views.forEach((row: any) => {
      const module = routeToModule(row.route ?? "");
      ensure(module).visits += 1;
    });

    changes.forEach((row: any) => {
      const module = tableToModule(row.table_name ?? row.module ?? "");
      ensure(module).crudCount += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.visits + b.crudCount - (a.visits + a.crudCount));
  } catch (err) {
    console.error("[activityMonitoring] fetchModuleStats failed:", err);
    return [];
  }
}

/** Paginated, filterable query across activity logs (CRUD changes + page views combined by relevance to filters). */
export async function fetchLogs(
  filters: ActivityLogFilters = {},
  page = 1,
  pageSize = 25
): Promise<{ rows: RecentChangeRow[]; total: number }> {
  try {
    let query = db.from("activity_data_changes").select("*", { count: "exact" });

    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
    if (filters.search) query = query.ilike("table_name", `%${filters.search}%`);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    let rows = (data ?? []) as RecentChangeRow[];
    if (filters.module) {
      rows = rows.filter((r) => tableToModule(r.table_name ?? "") === filters.module);
    }

    return { rows, total: count ?? rows.length };
  } catch (err) {
    console.error("[activityMonitoring] fetchLogs failed:", err);
    return { rows: [], total: 0 };
  }
}
