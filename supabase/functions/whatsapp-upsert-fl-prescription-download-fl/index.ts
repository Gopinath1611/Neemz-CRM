// Upserts the "fl_prescription_ready" WhatsApp template on Meta.
//
//   HEADER  : TEXT — "Prescription Ready"
//   BODY    : 3 variables — {{1}} patient, {{2}} doctor, {{3}} date
//   FOOTER  : "Smile Confident With Roots"
//   BUTTONS :
//     1. URL (dynamic) "Download Prescription PDF" →
//        https://kumtrpubuupvwgbwsqix.supabase.co/functions/v1/patient-doc/{{1}}
//        Button-scoped {{1}} is the storage path of the generated PDF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v23.0";
const PROJECT_REF = "kumtrpubuupvwgbwsqix";
const DOWNLOAD_URL_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/patient-doc/`;

const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

const TEMPLATE_NAME = "fl_prescription_ready";
const LANGUAGE = "en";
const CATEGORY = "UTILITY";

const HEADER_TEXT = "Prescription Ready";

const BODY_TEXT =
  "Dear {{1}}, your prescription from Dr {{2}} is ready.\n\n" +
  "📅 Date: {{3}}\n\n" +
  "Tap the button below to download your prescription.";

const FOOTER_TEXT = "Smile Confident With Roots";

const BODY_EXAMPLES = ["Priya", "Karthikeyan", "18 Jul 2026"];
const URL_BUTTON_EXAMPLE = "prescriptions/Button_1784029091630.pdf";

const BUTTONS = [
  {
    type: "URL",
    text: "Download Prescription PDF",
    url: `${DOWNLOAD_URL_BASE}{{1}}`,
    example: [`${DOWNLOAD_URL_BASE}${URL_BUTTON_EXAMPLE}`],
  },
];

async function resolveConn(caller: any) {
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

  if (!wabaId && phoneNumberId && accessToken) {
    const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const lb = await lookup.json().catch(() => ({}));
    wabaId = lb?.whatsapp_business_account?.id || null;
  }
  return { accessToken, wabaId, phoneNumberId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
    const service = createClient(supabaseUrl, serviceKey);

    const { accessToken, wabaId } = await resolveConn(caller);
    if (!accessToken) return json({ ok: false, error: "Meta access token missing." }, 400);
    if (!wabaId) return json({ ok: false, error: "Could not resolve WABA ID." }, 400);

    const delRes = await fetch(
      `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME })}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const delBody = await delRes.json().catch(() => ({}));
    console.log("[upsert-fl-prescription-ready] delete", { status: delRes.status, body: delBody });

    const components: JsonRecord[] = [
      { type: "HEADER", format: "TEXT", text: HEADER_TEXT },
      { type: "BODY", text: BODY_TEXT, example: { body_text: [BODY_EXAMPLES] } },
      { type: "FOOTER", text: FOOTER_TEXT },
      { type: "BUTTONS", buttons: BUTTONS },
    ];

    const createBody = { name: TEMPLATE_NAME, language: LANGUAGE, category: CATEGORY, components };
    console.log("[upsert-fl-prescription-ready] create payload", JSON.stringify(createBody, null, 2));

    const createRes = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const createResBody = await createRes.json().catch(() => ({}));
    console.log("[upsert-fl-prescription-ready] Meta create response RAW", JSON.stringify({ status: createRes.status, body: createResBody }, null, 2));

    if (!createRes.ok || createResBody?.error) {
      return json({
        ok: false,
        error: createResBody?.error?.error_user_msg || createResBody?.error?.message || `Meta create failed ${createRes.status}`,
        code: createResBody?.error?.code,
        details: createResBody,
        sent: createBody,
      }, 200);
    }

    await service.from("whatsapp_templates").delete().eq("name", TEMPLATE_NAME);

    let verify: JsonRecord | null = null;
    try {
      const verifyRes = await fetch(
        `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME, fields: "name,status,language,components" })}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const vb = await verifyRes.json().catch(() => ({}));
      const tpl = Array.isArray(vb?.data) ? vb.data.find((t: any) => t?.language === LANGUAGE) || vb.data[0] : null;
      const btnComp = Array.isArray(tpl?.components)
        ? tpl.components.find((c: any) => String(c?.type).toUpperCase() === "BUTTONS")
        : null;
      const buttons = Array.isArray(btnComp?.buttons) ? btnComp.buttons : [];
      verify = {
        status: tpl?.status || null,
        buttonsLength: buttons.length,
        firstButton: buttons[0] || null,
        buttons,
      };
    } catch (e) {
      console.warn("[upsert-fl-prescription-ready] verify failed", e);
    }

    return json({
      ok: true,
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      status: createResBody?.status || "PENDING",
      id: createResBody?.id,
      verify,
      note: "Submitted fl_prescription_ready (TEXT header + 3 body vars + dynamic 'Download Prescription PDF' URL button) to Meta.",
    });
  } catch (e) {
    console.error("[upsert-fl-prescription-ready] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
