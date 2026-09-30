// Verify the Callyzer connection for the current environment. Admin only.
// Calls the configured History endpoint with a tiny 24h window and reports the
// exact URL tried, HTTP status and Callyzer's response body so it can be
// compared with the Callyzer API documentation.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  callyzerUrl,
  clampToWindow,
  friendlyRangeError,
  getSandboxWindow,
  istDayStartSec,
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

  const { data: settings } = await admin
    .from("callyzer_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const { config, error: cfgError } = resolveCallyzerConfig(settings);
  if (!config) {
    await admin
      .from("callyzer_settings")
      .update({ last_verify_error: cfgError ?? "Not configured", updated_at: new Date().toISOString() })
      .eq("id", settings?.id ?? "");
    return json({ ok: false, environment: settings?.environment ?? "sandbox", error: cfgError }, 400);
  }

  const endpoint = callyzerUrl(config, config.paths.history);
  const win = getSandboxWindow(settings, config);
  // Today in IST, from start of day up to now, clamped to the sandbox window.
  const istToday = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  const range = clampToWindow(istDayStartSec(istToday), nowSec, win);
  if (range.error) {
    await admin
      .from("callyzer_settings")
      .update({ last_verify_error: range.error, updated_at: new Date().toISOString() })
      .eq("id", settings?.id ?? "");
    return json({ ok: false, environment: config.environment, url: endpoint, error: range.error }, 400);
  }
  const payload = {
    call_from: range.call_from,
    call_to: range.call_to,
    call_types: ["Incoming", "Outgoing", "Missed", "Rejected"],
    is_exclude_numbers: false,
  };

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();

    if (resp.ok) {
      await admin
        .from("callyzer_settings")
        .update({
          last_verified_at: new Date().toISOString(),
          last_verify_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings?.id ?? "");
      return json({
        ok: true,
        environment: config.environment,
        url: endpoint,
        status: resp.status,
        body: text.slice(0, 1000),
      });
    }

    const friendly = friendlyRangeError(resp.status, text, win);
    const errMsg = friendly ?? `HTTP ${resp.status} from ${endpoint}: ${text.slice(0, 500)}`;
    await admin
      .from("callyzer_settings")
      .update({ last_verify_error: errMsg, updated_at: new Date().toISOString() })
      .eq("id", settings?.id ?? "");
    return json(
      {
        ok: false,
        environment: config.environment,
        url: endpoint,
        status: resp.status,
        error: friendly ?? undefined,
        body: text.slice(0, 1000),
      },
      502,
    );
  } catch (e) {
    const errMsg = `Request to ${endpoint} failed: ${String((e as Error)?.message ?? e)}`;
    await admin
      .from("callyzer_settings")
      .update({ last_verify_error: errMsg, updated_at: new Date().toISOString() })
      .eq("id", settings?.id ?? "");
    return json({ ok: false, environment: config.environment, url: endpoint, error: errMsg }, 502);
  }
});
