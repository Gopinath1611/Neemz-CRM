// Upserts the "appointment_booking_confirmation" WhatsApp template on Meta
// with the exact approved structure requested by the clinic:
//
//   HEADER  : IMAGE (uses the hosted clinic logo from clinic_settings.logo_url)
//   BODY    : 4 variables — {{1}} patient, {{2}} date, {{3}} time, {{4}} doctor
//   FOOTER  : "Smile Confident with Roots"
//   BUTTONS : 1) URL  "View Location"  → Google Maps deep link
//             2) PHONE "Call Now"       → +91 74485 60350
//             3) URL  "Visit Website"  → https://drneemz.com
//
// Meta does not allow editing an APPROVED template's buttons/header in place,
// so this function deletes the existing template (all languages, name-scoped)
// then re-creates it with the new spec. Language is hardcoded to "en".
//
// The IMAGE header requires a Meta "header_handle" produced by the resumable
// upload API — we download the clinic logo, POST it through the App-scoped
// upload session, then reference the returned handle in components.example.

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

const TEMPLATE_NAME = "appointment_booking_confirmation";
const LANGUAGE = "en";
const CATEGORY = "UTILITY";

const BODY_TEXT =
  "Hello {{1}},\n\n" +
  "Your appointment at {{2}} is confirmed! 🦷\n\n" +
  "📅 Date: {{3}}\n" +
  "⏰ Time: {{4}}\n" +
  "🦷 Treatment: {{5}}\n\n" +
  "Please arrive 10 minutes prior to your scheduled time. We look forward to seeing you! 😊";

const FOOTER_TEXT = "Smile Confident with Roots";

const BUTTONS = [
  {
    type: "URL",
    text: "View Location",
    url: "https://www.google.com/maps/place/Dr+Neemz+Dentistry/@11.6648987,78.1484214,16z/data=!3m1!4b1!4m6!3m5!1s0x3babf188d0c0206f:0x1e454afc39623425!8m2!3d11.6648987!4d78.1484214!16s%2Fg%2F11w4kkh96_",
  },
  {
    type: "PHONE_NUMBER",
    text: "Call Now",
    phone_number: "+917448560350",
  },
  {
    type: "URL",
    text: "Visit Website",
    url: "https://drneemz.com",
  },
];

const BODY_EXAMPLES = ["Rahul", "Dr Neemz Dentistry Salem", "12 Jul 2026", "10:30 AM", "Root Canal"];

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
  const appId = pickString([credentials, metadata], ["wa_app_id", "app_id", "meta_app_id"]) || Deno.env.get("META_APP_ID") || "";

  if (!wabaId && phoneNumberId && accessToken) {
    const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const lb = await lookup.json().catch(() => ({}));
    wabaId = lb?.whatsapp_business_account?.id || null;
  }
  return { accessToken, wabaId, phoneNumberId, appId };
}

async function uploadImageHandle(appId: string, accessToken: string, imageUrl: string) {
  // 1) Download the image bytes.
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download logo (${imgRes.status})`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const fileLength = bytes.byteLength;

  // 2) Start a resumable upload session on the App node.
  const sessRes = await fetch(
    `${GRAPH}/${appId}/uploads?file_name=logo&file_length=${fileLength}&file_type=${encodeURIComponent(contentType)}`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const sessBody = await sessRes.json().catch(() => ({}));
  if (!sessRes.ok || !sessBody?.id) {
    throw new Error(`Upload session failed: ${sessBody?.error?.message || sessRes.status}`);
  }
  const sessionId = String(sessBody.id).replace(/^upload:/, "");

  // 3) POST the raw bytes with file_offset:0 → returns `{ h: <handle> }`.
  const upRes = await fetch(`${GRAPH}/upload:${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "Content-Type": contentType,
    },
    body: bytes,
  });
  const upBody = await upRes.json().catch(() => ({}));
  if (!upRes.ok || !upBody?.h) {
    throw new Error(`Upload failed: ${upBody?.error?.message || upRes.status}`);
  }
  return upBody.h as string;
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

    const { accessToken, wabaId, appId } = await resolveConn(caller);
    if (!accessToken) return json({ ok: false, error: "Meta access token missing." }, 400);
    if (!wabaId) return json({ ok: false, error: "Could not resolve WABA ID." }, 400);

    // Look up clinic logo (the constant header image).
    const { data: clinic } = await service
      .from("clinic_settings")
      .select("logo_url")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const logoUrl = clinic?.logo_url as string | undefined;
    if (!logoUrl) return json({ ok: false, error: "Clinic logo not set. Upload it in Settings → Clinic → Logo first." }, 400);

    // 1) Delete any existing versions of this template on Meta (all languages).
    const delRes = await fetch(
      `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME })}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const delBody = await delRes.json().catch(() => ({}));
    console.log("[upsert-appointment-template] delete", { status: delRes.status, body: delBody });

    // 2) Build the header IMAGE handle via resumable upload (needs App ID).
    let headerComponent: JsonRecord;
    if (!appId) {
      console.warn("[upsert-appointment-template] META_APP_ID not configured — falling back to TEXT header");
      headerComponent = { type: "HEADER", format: "TEXT", text: "Dr Neemz Dentistry" };
    } else {
      const handle = await uploadImageHandle(appId, accessToken, logoUrl);
      headerComponent = {
        type: "HEADER",
        format: "IMAGE",
        example: { header_handle: [handle] },
      };
    }

    // 3) Build components in the exact Meta order: HEADER, BODY, FOOTER, BUTTONS.
    const components: JsonRecord[] = [
      headerComponent,
      {
        type: "BODY",
        text: BODY_TEXT,
        example: { body_text: [BODY_EXAMPLES] },
      },
      { type: "FOOTER", text: FOOTER_TEXT },
      { type: "BUTTONS", buttons: BUTTONS },
    ];

    const createBody = {
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      category: CATEGORY,
      components,
    };

    console.log("[upsert-appointment-template] create payload", JSON.stringify(createBody, null, 2));

    const createRes = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const createResBody = await createRes.json().catch(() => ({}));
    console.log("[upsert-appointment-template] create response", { status: createRes.status, body: createResBody });

    if (!createRes.ok || createResBody?.error) {
      return json({
        ok: false,
        error: createResBody?.error?.error_user_msg || createResBody?.error?.message || `Meta create failed ${createRes.status}`,
        code: createResBody?.error?.code,
        details: createResBody,
        sent: createBody,
      }, 200);
    }

    // Purge local rows for this template name so the next sync repopulates the fresh version.
    await service.from("whatsapp_templates").delete().eq("name", TEMPLATE_NAME);

    return json({
      ok: true,
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      status: createResBody?.status || "PENDING",
      id: createResBody?.id,
      buttonUrls: BUTTONS,
      note: "Deleted prior versions and re-submitted with the new map URL. Meta may take ~1-2 minutes to approve.",
    });
  } catch (e) {
    console.error("[upsert-appointment-template] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
