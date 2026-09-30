// Upserts the "prescription_download" WhatsApp template on Meta.
//
//   HEADER  : none
//   BODY    : 1 variable — {{1}} patient name
//   FOOTER  : "Smile Confident with Roots"
//   BUTTONS : 1 URL button — "Download Prescription" pointing to the
//             public patient-doc redirect function with {{1}} as the
//             dynamic private PDF object path.
//
// After creation the local `whatsapp_templates` cache row is cleared so the
// send-side validator re-fetches Meta's fresh shape (with the parameterized
// URL button) on the next sync.

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

const TEMPLATE_NAME = "prescription_download_v3";
const LANGUAGE = "en_US";
const CATEGORY = "UTILITY";

const BODY_TEXT =
  "Hello {{1}},\n\n" +
  "Your prescription has been generated successfully.\n\n" +
  "Tap the \"Download Prescription\" button below to securely view and download your prescription.\n\n" +
  "Thank you,\n" +
  "Dr Neemz Dentistry";

const FOOTER_TEXT = "Smile Confident with Roots";
const BODY_EXAMPLES = ["Rahul"];
const URL_BUTTON_EXAMPLE_PATH = "prescriptions/sample_prescription.pdf";

const BUTTONS = [
  {
    type: "URL",
    text: "Download Prescription",
    url: `${DOWNLOAD_URL_BASE}{{1}}`,
    example: [`${DOWNLOAD_URL_BASE}${URL_BUTTON_EXAMPLE_PATH}`],
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

    const reqBody = await req.json().catch(() => ({} as JsonRecord));
    const skipDelete = reqBody?.skipDelete === true;

    // Delete any existing template with the same name so we can resubmit cleanly.
    // Skipped when caller passes { skipDelete: true } — useful when Meta is still
    // in the language-deletion cooldown from a prior run.
    if (!skipDelete) {
      const delRes = await fetch(
        `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME })}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const delBody = await delRes.json().catch(() => ({}));
      console.log("[upsert-prescription-template] delete", { status: delRes.status, body: delBody });
    } else {
      console.log("[upsert-prescription-template] delete skipped (skipDelete=true)");
    }

    const components: JsonRecord[] = [
      { type: "BODY", text: BODY_TEXT, example: { body_text: [BODY_EXAMPLES] } },
      { type: "FOOTER", text: FOOTER_TEXT },
      { type: "BUTTONS", buttons: BUTTONS },
    ];

    const createBody = { name: TEMPLATE_NAME, language: LANGUAGE, category: CATEGORY, components };
    console.log("[upsert-prescription-template] create payload", JSON.stringify(createBody, null, 2));

    const createRes = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const createResBody = await createRes.json().catch(() => ({}));
    console.log("[upsert-prescription-template] create response", { status: createRes.status, body: createResBody });

    if (!createRes.ok || createResBody?.error) {
      return json({
        ok: false,
        error: createResBody?.error?.error_user_msg || createResBody?.error?.message || `Meta create failed ${createRes.status}`,
        code: createResBody?.error?.code,
        details: createResBody,
        sent: createBody,
      }, 200);
    }

    // Wipe stale local cache so the send-side validator picks up the fresh
    // Meta shape (with the parameterized URL button) on the next sync.
    await service.from("whatsapp_templates").delete().eq("name", TEMPLATE_NAME);

    return json({
      ok: true,
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      status: createResBody?.status || "PENDING",
      id: createResBody?.id,
      note: "Submitted prescription_download_v3 (1 body var + 1 dynamic Download Prescription URL button through patient-doc redirect) to Meta. After Meta approves, click Sync Templates so the local cache picks up the new BUTTONS component.",
    });
  } catch (e) {
    console.error("[upsert-prescription-template] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
