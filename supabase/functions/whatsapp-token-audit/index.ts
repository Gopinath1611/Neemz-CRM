import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const G = "https://graph.facebook.com/v23.0";
const APP_ID = "1436600324896173";
const PNID = "777081605497413";
const WABA = "1303942691475826";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const c = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  const { data: { user } } = await c.auth.getUser(jwt);
  if (!user) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: cors });

  const { data: conn } = await c.from("connected_apps")
    .select("app_credentials, metadata, access_token, updated_at")
    .eq("is_connected", true)
    .or("platform.eq.WhatsApp Business API,platform.eq.WhatsApp API")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const cred: any = conn?.app_credentials || {};
  const meta: any = conn?.metadata || {};
  const envTok = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  const dbTok = cred.wa_api_key || cred.access_token || meta.access_token || conn?.access_token || "";

  const probe = async (label: string, tok: string) => {
    if (!tok) return { label, source_present: false };
    const H = { Authorization: `Bearer ${tok}` };
    const j = async (u: string, opts: any = {}) => {
      try {
        const r = await fetch(u, opts);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      } catch (e) { return { error: String(e) }; }
    };
    return {
      label,
      source_present: true,
      token_prefix: tok.slice(0, 10) + "..." + tok.slice(-4),
      length: tok.length,
      matches_env_and_db: (envTok && dbTok) ? envTok === dbTok : null,
      debug_token: await j(`${G}/debug_token?input_token=${encodeURIComponent(tok)}&access_token=${encodeURIComponent(tok)}`),
      me: await j(`${G}/me?fields=id,name`, { headers: H }),
      app: await j(`${G}/${APP_ID}?fields=id,name`, { headers: H }),
      system_user: await j(`${G}/122108640080628438?fields=id,name`, { headers: H }),
      phone_number: await j(`${G}/${PNID}?fields=id,display_phone_number,verified_name,whatsapp_business_account,quality_rating`, { headers: H }),
      waba_direct: await j(`${G}/${WABA}?fields=id,name,owner_business_info,message_template_namespace,currency,timezone_id`, { headers: H }),
      waba_phone_numbers: await j(`${G}/${WABA}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: H }),
      waba_subscribed_apps: await j(`${G}/${WABA}/subscribed_apps`, { headers: H }),
      waba_subscribed_apps_full: await j(`${G}/${WABA}/subscribed_apps?fields=whatsapp_business_api_data{id,name,link,category},override_callback_uri`, { headers: H }),
      subscribe_attempt_POST: await j(`${G}/${WABA}/subscribed_apps`, { method: "POST", headers: H }),
      waba_subscribed_apps_after: await j(`${G}/${WABA}/subscribed_apps`, { headers: H }),
      app_owned_wabas: await j(`${G}/${APP_ID}/owned_whatsapp_business_accounts`, { headers: H }),
      app_client_wabas: await j(`${G}/${APP_ID}/client_whatsapp_business_accounts`, { headers: H }),
      system_user_assets: await j(`${G}/122108640080628438/assigned_business_asset_groups`, { headers: H }),
    };
  };

  const result: any = {
    expected: { APP_ID, PNID, WABA, system_user_name: "Denzo" },
    env_token: await probe("env WHATSAPP_ACCESS_TOKEN", envTok),
  };
  if (dbTok && dbTok !== envTok) {
    result.db_token = await probe("connected_apps token", dbTok);
  } else {
    result.db_token_note = dbTok ? "identical to env token" : "no db token";
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
