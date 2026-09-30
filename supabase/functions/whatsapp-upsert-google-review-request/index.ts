// Upserts the "google_review_request" WhatsApp template on Meta with a static Google Review URL button.
//
//   HEADER  : (none)
//   BODY    : 2 variables — {{1}} patient name, {{2}} clinic name
//   FOOTER  : (none)
//   BUTTONS :
//     1. URL (static) "Leave Google Review" → clinic_settings.google_review_link
//
// The send-side code still passes only bodyParams (no buttonUrlParams), because the
// button URL is fully static and hosted by Meta in the template.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v23.0";

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

const TEMPLATE_NAME = "fl_checkout_google_review";
const LANGUAGE = "en";
const CATEGORY = "MARKETING";

const HEADER_TEXT = "Thank You for Visiting";
const FOOTER_TEXT = "Smile Confident With Roots";

const BODY_TEXT =
  "Dear {{1}}, thank you for choosing Dr Neemz Dentistry Pvt Ltd today.\n" +
  "We'd love your feedback—it only takes a minute!";

const BODY_EXAMPLES = ["Priya"];

const STATIC_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJbyDA0IjxqzsRJTRiOfxKRR4";
const CALL_PHONE_NUMBER = "+917448560350";

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

    const payload = await req.json().catch(() => ({}));
    const googleReviewLink = String(payload?.google_review_link || "").trim();

    // Use static configured URL (not from clinic_settings) — spec requires exact URL.
    const reviewUrl = STATIC_REVIEW_URL;

    const { accessToken, wabaId } = await resolveConn(caller);
    if (!accessToken) return json({ ok: false, error: "Meta access token missing." }, 400);
    if (!wabaId) return json({ ok: false, error: "Could not resolve WABA ID." }, 400);

    // 1) Delete any prior version on Meta.
    const delRes = await fetch(
      `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME })}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const delBody = await delRes.json().catch(() => ({}));
    console.log("[upsert-fl-checkout-google-review] delete", { status: delRes.status, body: delBody });

    const components: JsonRecord[] = [
      { type: "HEADER", format: "TEXT", text: HEADER_TEXT },
      { type: "BODY", text: BODY_TEXT, example: { body_text: [BODY_EXAMPLES] } },
      { type: "FOOTER", text: FOOTER_TEXT },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Google Review", url: reviewUrl },
          { type: "PHONE_NUMBER", text: "Call Now", phone_number: CALL_PHONE_NUMBER },
        ],
      },
    ];

    const createBody = { name: TEMPLATE_NAME, language: LANGUAGE, category: CATEGORY, components };
    console.log("[upsert-checkout-v3] create payload", JSON.stringify(createBody, null, 2));

    const createRes = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const createResBody = await createRes.json().catch(() => ({}));
    console.log("[upsert-checkout-v3] create response", { status: createRes.status, body: createResBody });

    if (!createRes.ok || createResBody?.error) {
      return json({
        ok: false,
        error: createResBody?.error?.error_user_msg || createResBody?.error?.message || `Meta create failed ${createRes.status}`,
        code: createResBody?.error?.code,
        details: createResBody,
        sent: createBody,
      }, 200);
    }

    // Purge local row so the next send re-syncs the new component structure.
    await service.from("whatsapp_templates").delete().eq("name", TEMPLATE_NAME);

    return json({
      ok: true,
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      status: createResBody?.status || "PENDING",
      id: createResBody?.id,
      note: "Submitted google_review_request (2 body vars + static Google Review URL button) to Meta. Approval usually takes 1-2 minutes.",
    });
  } catch (e) {
    console.error("[upsert-checkout-v3] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
