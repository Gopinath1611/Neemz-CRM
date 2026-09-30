// Upserts the "fl_invoice_ready" WhatsApp template on Meta.
//
//   HEADER  : TEXT — "Invoice Generated 🧾"
//   BODY    : 4 variables — {{1}} patient, {{2}} treatment, {{3}} amount, {{4}} invoice #
//   FOOTER  : "Smile Confident With Roots"
//   BUTTONS :
//     1. URL (dynamic) "Download Invoice PDF" →
//        https://kumtrpubuupvwgbwsqix.supabase.co/functions/v1/patient-doc/{{1}}
//        Button-scoped {{1}} is the invoice number / document id.
//
// Send-side code passes `buttonUrlParams: [invoiceNumber]` which matches {{1}}.

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

const TEMPLATE_NAME = "fl_invoice_ready";
const LANGUAGE = "en";
const CATEGORY = "UTILITY";

const HEADER_TEXT = "Invoice Generated";

const BODY_TEXT =
  "Dear {{1}}, your invoice for {{2}} has been generated. 🧾\n\n" +
  "💰 Amount: Rs. {{3}}\n" +
  "🆔 Invoice No: {{4}}\n\n" +
  "Tap below to download your invoice. 👇";

const FOOTER_TEXT = "Smile Confident With Roots";

const BODY_EXAMPLES = ["Rahul", "Root Canal", "4500", "INV-1024"];
const URL_BUTTON_EXAMPLE = "INV-1024";

const BUTTONS = [
  {
    type: "URL",
    text: "Download Invoice PDF",
    url: `${DOWNLOAD_URL_BASE}{{1}}`,
    example: [URL_BUTTON_EXAMPLE],
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

    // 1) Delete any prior versions on Meta.
    const delRes = await fetch(
      `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME })}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const delBody = await delRes.json().catch(() => ({}));
    console.log("[upsert-fl-invoice-ready] delete", { status: delRes.status, body: delBody });

    const components: JsonRecord[] = [
      { type: "HEADER", format: "TEXT", text: HEADER_TEXT },
      { type: "BODY", text: BODY_TEXT, example: { body_text: [BODY_EXAMPLES] } },
      { type: "FOOTER", text: FOOTER_TEXT },
      { type: "BUTTONS", buttons: BUTTONS },
    ];

    const createBody = { name: TEMPLATE_NAME, language: LANGUAGE, category: CATEGORY, components };
    const outgoingButtonsComp = components.find((c) => String(c?.type).toUpperCase() === "BUTTONS");
    const outgoingButtons = Array.isArray(outgoingButtonsComp?.buttons) ? outgoingButtonsComp!.buttons : [];
    console.log("[upsert-fl-invoice-ready] BUTTONS (outgoing)", JSON.stringify({
      present: !!outgoingButtonsComp,
      count: outgoingButtons.length,
      buttons: outgoingButtons,
    }, null, 2));
    console.log("[upsert-fl-invoice-ready] create payload", JSON.stringify(createBody, null, 2));

    const createRes = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const createResBody = await createRes.json().catch(() => ({}));
    console.log("[upsert-fl-invoice-ready] Meta create response RAW", JSON.stringify({ status: createRes.status, body: createResBody }, null, 2));

    if (!createRes.ok || createResBody?.error) {
      return json({
        ok: false,
        error: createResBody?.error?.error_user_msg || createResBody?.error?.message || `Meta create failed ${createRes.status}`,
        code: createResBody?.error?.code,
        details: createResBody,
        sent: createBody,
      }, 200);
    }

    // Refresh local cache row so the synced template reflects the new BUTTONS.
    await service.from("whatsapp_templates").delete().eq("name", TEMPLATE_NAME);

    // Verify: re-fetch from Meta and confirm the URL button is present.
    let verify: JsonRecord | null = null;
    try {
      const verifyRes = await fetch(
        `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME, fields: "name,status,language,components" })}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const vb = await verifyRes.json().catch(() => ({}));
      console.log("[upsert-fl-invoice-ready] Meta verify response RAW", JSON.stringify(vb, null, 2));
      const tpl = Array.isArray(vb?.data) ? vb.data.find((t: any) => t?.language === LANGUAGE) || vb.data[0] : null;
      const btnComp = Array.isArray(tpl?.components)
        ? tpl.components.find((c: any) => String(c?.type).toUpperCase() === "BUTTONS")
        : null;
      const buttons = Array.isArray(btnComp?.buttons) ? btnComp.buttons : [];
      console.log("[upsert-fl-invoice-ready] BUTTONS (verified from Meta)", JSON.stringify({
        present: !!btnComp,
        count: buttons.length,
        buttons,
      }, null, 2));
      verify = {
        status: tpl?.status || null,
        buttonsLength: buttons.length,
        firstButton: buttons[0] || null,
        buttons,
      };
    } catch (e) {
      console.warn("[upsert-fl-invoice-ready] verify failed", e);
    }

    return json({
      ok: true,
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      status: createResBody?.status || "PENDING",
      id: createResBody?.id,
      verify,
      note: "Submitted fl_invoice_ready (TEXT header + 4 body vars + dynamic 'Download Invoice PDF' URL button) to Meta.",
    });
  } catch (e) {
    console.error("[upsert-fl-invoice-ready] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
