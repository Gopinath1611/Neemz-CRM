// Re-run stored webhook payloads (status partial/error) through the current
// parser. Admin only. Idempotent: upsertCallyzerLogs dedupes on
// callyzer_log_id, so re-processing updates rows instead of duplicating them.
// Payloads are never deleted.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizePayload, upsertCallyzerLogs } from "../_shared/callyzer.ts";

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
    body = {};
  }
  const dryRun = body.dryRun !== false;

  const { data: settings } = await admin
    .from("callyzer_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const environment = settings?.environment ?? "sandbox";
  const ignoreUnmapped = settings?.ignore_unmapped_employees !== false;

  const { data: logs, error: logErr } = await admin
    .from("callyzer_webhook_logs")
    .select("id, status, payload, received_at")
    .in("status", ["partial", "error"])
    .not("payload", "is", null)
    .order("received_at", { ascending: true })
    .limit(500);
  if (logErr) return json({ error: logErr.message }, 500);

  const totals = {
    logs: 0,
    received: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    ignored: 0,
  };
  const unknown = new Set<string>();
  const reasons = new Set<string>();
  const employees = new Map<string, any>();

  for (const log of logs ?? []) {
    const { blocks, unrecognized, reasons: why } = normalizePayload(log.payload);
    why.forEach((r) => reasons.add(r));
    const count = blocks.reduce((n, b) => n + b.calls.length, 0);
    if (!count && !unrecognized.length) continue;
    totals.logs++;

    let r: Awaited<ReturnType<typeof upsertCallyzerLogs>> | null = null;
    if (count) {
      r = await upsertCallyzerLogs(admin, blocks, environment, { dryRun, ignoreUnmapped });
      totals.received += r.received;
      totals.inserted += r.inserted;
      totals.updated += r.updated;
      totals.skipped += r.skipped;
      totals.ignored += r.ignored;
      r.unknownCallTypes.forEach((t) => unknown.add(t));
      for (const e of r.employees) {
        const key = e.empNumber ?? e.empName ?? "unknown";
        const prev = employees.get(key) ?? { ...e, found: 0, inserted: 0, updated: 0, skipped: 0, ignored: 0 };
        employees.set(key, {
          ...prev,
          mapped: e.mapped,
          empName: e.empName ?? prev.empName,
          found: prev.found + e.found,
          inserted: prev.inserted + e.inserted,
          updated: prev.updated + e.updated,
          skipped: prev.skipped + e.skipped,
          ignored: prev.ignored + e.ignored,
        });
      }
    }
    totals.skipped += unrecognized.length;

    if (!dryRun && r) {
      const notes: string[] = [`Reprocessed ${new Date().toISOString()}`];
      if (unrecognized.length) notes.push(`Still unrecognized: ${unrecognized.length} — ${why.join("; ")}`);
      if (r.ignored) notes.push(`Ignored (unmapped employee): ${r.ignored}`);
      await admin
        .from("callyzer_webhook_logs")
        .update({
          status: unrecognized.length || r.unknownCallTypes.length ? "partial" : "ok",
          message: notes.join(" | "),
          logs_received: r.received,
          logs_inserted: r.inserted,
          logs_updated: r.updated,
          logs_skipped: r.skipped + unrecognized.length,
          unknown_call_types: r.unknownCallTypes,
        })
        .eq("id", log.id);
    }
  }

  return json({
    ok: true,
    dryRun,
    ...totals,
    employees: [...employees.values()],
    unknownCallTypes: [...unknown],
    reasons: [...reasons],
    message: dryRun
      ? "Preview only — nothing was written."
      : `Reprocessed ${totals.logs} stored payload(s).`,
  });
});
