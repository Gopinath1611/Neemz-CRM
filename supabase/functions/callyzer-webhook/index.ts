// Callyzer raw call-log webhook. Public endpoint (Callyzer cannot send a Supabase JWT),
// protected by a shared token stored in callyzer_settings.webhook_secret.
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    await supabase.from("callyzer_webhook_logs").insert({
      status: "error",
      message: "Invalid JSON body",
    });
    return json({ error: "Invalid JSON" }, 400);
  }

  const { data: settings } = await supabase
    .from("callyzer_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const url = new URL(req.url);
  const provided =
    req.headers.get("x-callyzer-token") ||
    url.searchParams.get("token") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  if (settings?.webhook_secret && provided !== settings.webhook_secret) {
    await supabase.from("callyzer_webhook_logs").insert({
      status: "error",
      message: "Invalid webhook token",
      payload: raw as never,
      environment: settings?.environment ?? null,
    });
    return json({ error: "Unauthorized" }, 401);
  }

  if (settings && settings.is_enabled === false) {
    await supabase.from("callyzer_webhook_logs").insert({
      status: "skipped",
      message: "Integration disabled in settings",
      payload: raw as never,
      environment: settings.environment,
    });
    return json({ ok: true, skipped: true });
  }

  const environment = settings?.environment ?? "sandbox";
  // Accepts the v2.x snake_case format and the legacy camelCase logs[] format.
  // Anything unrecognized is kept in the webhook log and flagged partial.
  const { blocks, unrecognized, reasons } = normalizePayload(raw);

  try {
    const ignoreUnmapped = settings?.ignore_unmapped_employees !== false;
    const r = await upsertCallyzerLogs(supabase, blocks, environment, { ignoreUnmapped });
    const status =
      r.unknownCallTypes.length || r.unmatchedTelecallers.length || unrecognized.length
        ? "partial"
        : "ok";
    const notes: string[] = [];
    if (unrecognized.length)
      notes.push(
        `Unrecognized payload entries kept raw: ${unrecognized.length}` +
          (reasons.length ? ` (${reasons.join("; ")})` : ""),
      );
    if (r.unmatchedTelecallers.length)
      notes.push(`Unmapped employee numbers: ${r.unmatchedTelecallers.join(", ")}`);
    if (r.unknownCallTypes.length)
      notes.push(`Unknown call types stored as raw: ${r.unknownCallTypes.join(", ")}`);
    if (r.ignored) notes.push(`Ignored calls from unmapped employees: ${r.ignored}`);

    await supabase.from("callyzer_webhook_logs").insert({
      status,
      message: notes.join(" | ") || null,
      payload: raw as never,
      environment,
      logs_received: r.received,
      logs_inserted: r.inserted,
      logs_updated: r.updated,
      logs_skipped: r.skipped + unrecognized.length,
      unknown_call_types: r.unknownCallTypes,
    });

    // Ignored (unmapped employee) calls: emp_number and count only, no payload.
    const ignoredEmps = r.employees.filter((e) => e.ignored > 0);
    if (ignoredEmps.length) {
      await supabase.from("callyzer_webhook_logs").insert({
        status: "ignored: unmapped employee",
        message: ignoredEmps.map((e) => `${e.empNumber ?? "unknown"}: ${e.ignored}`).join(", "),
        environment,
        logs_received: r.ignored,
        logs_inserted: 0,
        logs_updated: 0,
        logs_skipped: r.ignored,
      });
    }

    await supabase
      .from("callyzer_settings")
      .update({ last_webhook_at: new Date().toISOString() })
      .eq("id", settings?.id ?? "00000000-0000-0000-0000-000000000000");

    return json({ ok: true, ...r });
  } catch (e) {
    await supabase.from("callyzer_webhook_logs").insert({
      status: "error",
      message: String((e as Error)?.message ?? e),
      payload: raw as never,
      environment,
    });
    return json({ error: "Processing failed" }, 500);
  }
});
