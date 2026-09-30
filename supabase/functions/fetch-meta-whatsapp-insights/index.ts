// Fetches verified WhatsApp pricing analytics (volume + cost) directly from Meta.
// Token: META_WHATSAPP_SYSTEM_USER_ACCESS_TOKEN secret if set, else the saved WhatsApp connection.
// WABA: META_WABA_ID secret if set, else the saved connection, else 1303942691475826.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v22.0";
const DEFAULT_WABA = "1303942691475826";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const pick = (srcs: any[], keys: string[]) => {
  for (const s of srcs) for (const k of keys) if (s && typeof s[k] === "string" && s[k].trim()) return s[k].trim();
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, reason: "unauthorized", error: "Sign in required" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return json({ ok: false, reason: "unauthorized", error: "Sign in required" }, 401);

    const body = await req.json().catch(() => ({}));
    const now = Math.floor(Date.now() / 1000);
    const end = Number.isFinite(Number(body?.end)) && Number(body.end) > 0 ? Math.floor(Number(body.end)) : now;
    const start = Number.isFinite(Number(body?.start)) && Number(body.start) > 0 ? Math.floor(Number(body.start)) : end - 30 * 86400;
    if (start >= end || end - start > 366 * 86400) return json({ ok: false, reason: "bad_range", error: "Invalid date range" }, 400);

    const { data: conn } = await sb
      .from("connected_apps")
      .select("app_credentials, metadata, access_token")
      .eq("is_connected", true)
      .or("platform.eq.WhatsApp Business API,platform.eq.WhatsApp API")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const srcs = [conn?.app_credentials, conn?.metadata, { access_token: conn?.access_token }];
    const token = Deno.env.get("META_WHATSAPP_SYSTEM_USER_ACCESS_TOKEN") ||
      pick(srcs, ["wa_api_key", "access_token", "token", "bearer_token"]);
    const waba = Deno.env.get("META_WABA_ID") || pick(srcs, ["wa_waba_id", "waba_id", "business_account_id"]) || DEFAULT_WABA;
    if (!token) return json({ ok: false, reason: "missing_token", error: "No WhatsApp access token configured." });

    const field = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY)` +
      `.metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`;
    const url = new URL(`${GRAPH}/${waba}`);
    url.searchParams.set("fields", field);
    url.searchParams.set("access_token", token);
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const perm = /permission|scope|#10|#200|OAuth|access token/i.test(msg);
      return json({ ok: false, reason: perm ? "permission" : "meta_error", status: res.status, error: msg, wabaId: waba });
    }

    const rows: Record<string, { category: string; type: string; volume: number; cost: number }> = {};
    let currency = "INR";
    for (const block of data?.pricing_analytics?.data ?? []) {
      for (const p of block?.data_points ?? []) {
        const category = String(p.pricing_category || "UNKNOWN").toUpperCase();
        const type = String(p.pricing_type || "UNKNOWN").toUpperCase();
        const key = `${category}|${type}`;
        rows[key] ??= { category, type, volume: 0, cost: 0 };
        rows[key].volume += Number(p.volume) || 0;
        rows[key].cost += Number(p.cost) || 0;
        if (p.currency) currency = p.currency;
      }
    }
    const list = Object.values(rows);
    const paid = list.filter((r) => r.type === "REGULAR");
    const free = list.filter((r) => r.type !== "REGULAR");
    return json({
      ok: true, wabaId: waba, start, end, currency,
      paid, free,
      totalCost: list.reduce((s, r) => s + r.cost, 0),
      totalVolume: list.reduce((s, r) => s + r.volume, 0),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, reason: "server_error", error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
