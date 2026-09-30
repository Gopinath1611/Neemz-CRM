import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v23.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type JsonRecord = Record<string, any>;

const pickString = (sources: Array<JsonRecord | null | undefined>, keys: string[]) => {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const k of keys) {
      const v = src[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const { name, language } = await req.json().catch(() => ({}));
    if (!name || typeof name !== "string") {
      return json({ ok: false, error: "Template `name` is required." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey);

    // Resolve credentials the same way other WA functions do.
    const { data: conn } = await caller
      .from("connected_apps")
      .select("app_credentials, metadata, access_token, updated_at")
      .eq("is_connected", true)
      .or("platform.eq.WhatsApp Business API,platform.eq.WhatsApp API")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const credentials = (conn?.app_credentials as JsonRecord | null) || {};
    const metadata = (conn?.metadata as JsonRecord | null) || {};
    const envToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const envWaba = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "";
    const accessToken = pickString(
      [credentials, metadata, { access_token: conn?.access_token }, { env: envToken }],
      ["wa_api_key", "access_token", "token", "bearer_token", "env"],
    );
    let wabaId = pickString(
      [credentials, metadata, { env: envWaba }],
      ["wa_waba_id", "waba_id", "business_account_id", "whatsapp_business_account_id", "env"],
    );
    const phoneNumberId = pickString([credentials, metadata], ["wa_phone_id", "phone_number_id"]) || "777081605497413";

    if (!accessToken) return json({ ok: false, error: "Meta access token missing." }, 400);

    if (!wabaId && phoneNumberId) {
      const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const lb = await lookup.json().catch(() => ({}));
      wabaId = lb?.whatsapp_business_account?.id || null;
    }
    if (!wabaId) return json({ ok: false, error: "Could not resolve WABA ID." }, 400);

    // Meta DELETE: name-only removes ALL languages; hsm_id would target one language.
    const qs = new URLSearchParams({ name });
    const url = `${GRAPH}/${wabaId}/message_templates?${qs.toString()}`;
    console.log("[whatsapp-delete-template] DELETE", { url, name, language });

    const metaRes = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const metaBody = await metaRes.json().catch(() => ({}));
    console.log("[whatsapp-delete-template] meta response", { status: metaRes.status, body: metaBody });

    const metaSuccess = metaRes.ok && metaBody?.success !== false && !metaBody?.error;

    if (!metaSuccess) {
      const errMsg = metaBody?.error?.message || `Meta delete failed (${metaRes.status})`;
      const code = metaBody?.error?.code ?? null;
      // Not-found on Meta (code 100 / 33) — safe to purge locally too.
      const notFound = code === 100 || code === 33 || metaRes.status === 404;
      if (notFound) {
        const q = service.from("whatsapp_templates").delete().eq("name", name);
        await (language ? q.eq("language", language) : q);
        return json({ ok: true, purgedLocalOnly: true, note: "Template not found on Meta — removed local row(s).", meta: metaBody });
      }
      return json({ ok: false, error: errMsg, code, details: metaBody }, 200);
    }

    // Meta confirmed — remove local rows.
    const q = service.from("whatsapp_templates").delete().eq("name", name);
    const { error: delErr } = await (language ? q.eq("language", language) : q);
    if (delErr) return json({ ok: false, error: `Meta deleted OK but local delete failed: ${delErr.message}` }, 200);

    return json({ ok: true, name, language: language || null, meta: metaBody });
  } catch (e) {
    console.error("[whatsapp-delete-template] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
