// Admin-only: refresh a single Callyzer recording URL on demand.
// Calls Fetch Call History By Ids and updates callyzer_call_recordings ONLY.
// Never writes call_logs.recording_path.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  callyzerUrl,
  friendlyRangeError,
  getSandboxWindow,
  resolveCallyzerConfig,
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const callLogId = String(body.callLogId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(callLogId)) return json({ error: "callLogId required" }, 400);

  const { data: log } = await admin
    .from("call_logs")
    .select("id, callyzer_log_id, callyzer_environment")
    .eq("id", callLogId)
    .maybeSingle();
  if (!log?.callyzer_log_id) return json({ error: "Not a Callyzer call log" }, 400);

  const { data: settings } = await admin
    .from("callyzer_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const { config, error: cfgError } = resolveCallyzerConfig(settings, {
    environment: log.callyzer_environment,
  });
  if (!config) return json({ error: cfgError }, 400);
  const environment = config.environment;

  const endpoint = callyzerUrl(config, config.paths.historyById);
  const win = getSandboxWindow(settings, config);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unique_ids: [log.callyzer_log_id] }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      const friendly = friendlyRangeError(resp.status, text, win);
      return json(
        { error: friendly ?? `Callyzer API ${resp.status}`, url: endpoint, detail: text.slice(0, 400) },
        friendly ? 400 : 502,
      );
    }
    const parsed = JSON.parse(text);
    const blocks: any[] = Array.isArray(parsed) ? parsed : parsed?.result ?? parsed?.data ?? [];
    let url: string | null = null;
    for (const b of blocks) {
      for (const l of b.logs ?? (Array.isArray(b) ? b : [b])) {
        if (l?.recordingURL) url = String(l.recordingURL);
      }
    }
    if (!url) return json({ ok: false, error: "No recording URL returned by Callyzer", url: endpoint }, 404);

    await admin
      .from("callyzer_call_recordings")
      .upsert({ call_log_id: callLogId, recording_url: url, environment }, { onConflict: "call_log_id" });

    return json({ ok: true, recordingUrl: url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e), url: endpoint }, 500);
  }
});
