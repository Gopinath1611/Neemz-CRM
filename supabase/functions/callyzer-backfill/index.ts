// One-time / on-demand Callyzer backfill for a date range. Admin only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  callyzerUrl,
  clampToWindow,
  friendlyRangeError,
  getSandboxWindow,
  istDayEndSec,
  istDayStartSec,
  normalizePayload,
  resolveCallyzerConfig,
  upsertCallyzerLogs,
} from "../_shared/callyzer.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimErr } = await userClient.auth.getClaims(token);
  if (claimErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return json({ error: "Admin only" }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const startDate = String(body.startDate ?? "");
  const endDate = String(body.endDate ?? "");
  // Default to a preview: nothing is written unless dryRun is explicitly false.
  const dryRun = body.dryRun !== false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return json({ error: "startDate and endDate must be YYYY-MM-DD" }, 400);
  }

  const { data: settings } = await admin
    .from("callyzer_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const { config, error: cfgError } = resolveCallyzerConfig(settings);
  if (!config) return json({ error: cfgError }, 400);
  const environment = config.environment;

  const endpoint = callyzerUrl(config, config.paths.history);
  // Callyzer v2.x: call_from / call_to are UNIX timestamps (seconds, UTC).
  // Treat the chosen dates as Asia/Kolkata calendar days, clamped to the
  // sandbox window when running in sandbox mode.
  const win = getSandboxWindow(settings, config);
  const range = clampToWindow(istDayStartSec(startDate), istDayEndSec(endDate), win);
  if (range.error) return json({ error: range.error, url: endpoint }, 400);
  const callFrom = range.call_from;
  const callTo = range.call_to;

  const totals = { received: 0, inserted: 0, updated: 0, skipped: 0, ignored: 0, pages: 0 };
  const unknown = new Set<string>();
  let employees: unknown[] = [];
  const ignoreUnmapped = settings?.ignore_unmapped_employees !== false;

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        call_from: callFrom,
        call_to: callTo,
        call_types: ["Incoming", "Outgoing", "Missed", "Rejected"],
        is_exclude_numbers: false,
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      const friendly = friendlyRangeError(resp.status, text, win);
      return json(
        { error: friendly ?? `Callyzer API ${resp.status}`, url: endpoint, detail: text.slice(0, 500) },
        friendly ? 400 : 502,
      );
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "Callyzer returned non-JSON", url: endpoint, detail: text.slice(0, 300) }, 502);
    }
    const { blocks, unrecognized } = normalizePayload(parsed);
    const count = blocks.reduce((n, b) => n + b.calls.length, 0);
    if (count) {
      const r = await upsertCallyzerLogs(admin, blocks, environment, { dryRun, ignoreUnmapped });
      totals.received += r.received;
      totals.inserted += r.inserted;
      totals.updated += r.updated;
      totals.skipped += r.skipped;
      totals.ignored += r.ignored;
      totals.pages = 1;
      employees = r.employees;
      r.unknownCallTypes.forEach((t) => unknown.add(t));
    }
    totals.skipped += unrecognized.length;

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        ...totals,
        employees,
        unknownCallTypes: [...unknown],
        unrecognized: unrecognized.length,
        message: "Preview only — nothing was written.",
      });
    }


    await admin
      .from("callyzer_settings")
      .update({ last_backfill_at: new Date().toISOString() })
      .eq("id", settings?.id ?? "00000000-0000-0000-0000-000000000000");
    await admin.from("callyzer_webhook_logs").insert({
      status: unknown.size || unrecognized.length ? "partial" : "ok",
      message: `Backfill ${startDate} → ${endDate}`,
      environment,
      logs_received: totals.received,
      logs_inserted: totals.inserted,
      logs_updated: totals.updated,
      logs_skipped: totals.skipped,
      unknown_call_types: [...unknown],
    });

    const ignoredEmps = (employees as any[]).filter((e) => e?.ignored > 0);
    if (ignoredEmps.length) {
      await admin.from("callyzer_webhook_logs").insert({
        status: "ignored: unmapped employee",
        message: ignoredEmps.map((e) => `${e.empNumber ?? "unknown"}: ${e.ignored}`).join(", "),
        environment,
        logs_received: totals.ignored,
        logs_inserted: 0,
        logs_updated: 0,
        logs_skipped: totals.ignored,
      });
    }

    return json({ ok: true, dryRun: false, ...totals, employees, unknownCallTypes: [...unknown] });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e), url: endpoint }, 500);
  }
});
