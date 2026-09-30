// Admin-only: compare Callyzer's own call counts vs what the CRM stored (last 7 days).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  callyzerUrl,
  clampToWindow,
  friendlyRangeError,
  getSandboxWindow,
  istDayEndSec,
  istDayStartSec,
  resolveCallyzerConfig,
} from "../_shared/callyzer.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const dayKey = (iso: string) =>
  new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: claims.claims.sub as string,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "Admin only" }, 403);

  const { data: settings } = await admin
    .from("callyzer_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const { config, error: cfgError } = resolveCallyzerConfig(settings);
  const environment = config?.environment ?? settings?.environment ?? "sandbox";

  const end = new Date();
  const start = new Date(end.getTime() - 6 * 86400000);
  const startDate = dayKey(start.toISOString());
  const endDate = dayKey(end.toISOString());

  // CRM side
  const { data: crmRows } = await admin
    .from("call_logs")
    .select("started_at, source")
    .gte("started_at", new Date(`${startDate}T00:00:00+05:30`).toISOString())
    .lte("started_at", new Date(`${endDate}T23:59:59+05:30`).toISOString());
  const crm = new Map<string, { total: number; callyzer: number }>();
  for (const r of crmRows ?? []) {
    if (!r.started_at) continue;
    const k = dayKey(r.started_at);
    const cur = crm.get(k) ?? { total: 0, callyzer: 0 };
    cur.total++;
    if (r.source === "callyzer") cur.callyzer++;
    crm.set(k, cur);
  }

  // Callyzer side (day-wise analytics); tolerate failure and still return CRM counts.
  let callyzerByDay: Record<string, number> = {};
  let apiError: string | null = null;
  const win = config ? getSandboxWindow(settings, config) : null;
  const range = clampToWindow(istDayStartSec(startDate), istDayEndSec(endDate), win);
  const endpoint = config ? callyzerUrl(config, config.paths.daywise) : null;
  if (config && endpoint && !range.error) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ call_from: range.call_from, call_to: range.call_to }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        apiError = friendlyRangeError(resp.status, text, win) ??
          `Callyzer API ${resp.status} at ${endpoint}: ${text.slice(0, 300)}`;
      } else {
        const parsed = JSON.parse(text);
        const rows: any[] = Array.isArray(parsed)
          ? parsed
          : parsed?.result ?? parsed?.data ?? [];
        for (const row of rows) {
          const k = String(row.date ?? row.call_date ?? row.day ?? "").slice(0, 10);
          const v = Number(row.total_calls ?? row.totalCalls ?? row.total ?? 0) || 0;
          if (k) callyzerByDay[k] = v;
        }
      }
    } catch (e) {
      apiError = `Request to ${endpoint} failed: ${String((e as Error)?.message ?? e)}`;
    }
  } else if (range.error) {
    apiError = range.error;
  } else {
    apiError = cfgError ?? "Callyzer not configured";
  }

  const days: any[] = [];
  for (let d = new Date(`${startDate}T00:00:00Z`); dayKey(d.toISOString()) <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    const c = crm.get(k) ?? { total: 0, callyzer: 0 };
    const outsideWindow = !!win && (k < win.fromDate || k > win.toDate);
    days.push({
      date: k,
      crmTotal: c.total,
      crmCallyzer: c.callyzer,
      outsideWindow,
      callyzerTotal: outsideWindow ? null : callyzerByDay[k] ?? null,
      difference: !outsideWindow && callyzerByDay[k] != null ? callyzerByDay[k] - c.total : null,
    });
  }

  return json({
    ok: true,
    environment,
    startDate,
    endDate,
    days,
    apiError,
    sandboxWindow: win ? { from: win.fromDate, to: win.toDate } : null,
  });
});
