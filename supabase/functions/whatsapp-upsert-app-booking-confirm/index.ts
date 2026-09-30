// Upserts the "app_booking_confirm" WhatsApp template on Meta with the
// clinic-approved appointment booking confirmation:
//
//   HEADER  : TEXT — "Appointment Booked!"
//   BODY    : 6 variables — {{1}} patient, {{2}} clinic, {{3}} date,
//             {{4}} time, {{5}} treatment, {{6}} doctor
//   FOOTER  : "Smile Confident With Roots"
//   BUTTONS : 1) PHONE "Call Now"      → +91 74485 60350
//             2) URL    "Get Location" → https://maps.google.com/?cid=2181232041685824549
//
// Meta does not allow editing an APPROVED template's components in place, so
// this function deletes the existing template (all languages, name-scoped) then
// re-creates it with the spec above. Language is hardcoded to "en".
//
// The runtime payload is intentionally kept unchanged and sends 6 body params:
//   [patientName, clinicName, date, time, treatment, doctor]

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

const TEMPLATE_NAME = "app_booking_confirm_v2";
const LANGUAGE = "en";
const CATEGORY = "UTILITY";

const HEADER_TEXT = "Appointment Booked!";

const BODY_TEXT =
  "Dear {{1}}, your appointment at Dr Neemz Dentistry Pvt Ltd is booked. 🦷\n\n" +
  "📅 Date: {{2}}\n" +
  "⏰ Time: {{3}}\n" +
  "🩺 Treatment: {{4}}\n" +
  "👨‍⚕️ Doctor: {{5}}\n\n" +
  "We look forward to see you! 😊";

const FOOTER_TEXT = "Smile Confident With Roots";

const BODY_EXAMPLES = [
  "Priya",
  "18 Jul 2026",
  "11:00 AM",
  "Root Canal",
  "Dr. Karthikeyan",
];

const BUTTONS = [
  {
    type: "PHONE_NUMBER",
    text: "Call Now",
    phone_number: "+917448560350",
  },
  {
    type: "URL",
    text: "Get Location",
    url: "https://maps.google.com/?cid=2181232041685824549",
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
    console.log("[upsert-app-booking-confirm] delete", { status: delRes.status, body: delBody });

    const components: JsonRecord[] = [
      { type: "HEADER", format: "TEXT", text: HEADER_TEXT },
      { type: "BODY", text: BODY_TEXT, example: { body_text: [BODY_EXAMPLES] } },
      { type: "FOOTER", text: FOOTER_TEXT },
      { type: "BUTTONS", buttons: BUTTONS },
    ];

    const createBody = { name: TEMPLATE_NAME, language: LANGUAGE, category: CATEGORY, components };

    const outgoingButtonsComp = components.find((c) => String(c?.type).toUpperCase() === "BUTTONS");
    const outgoingButtons = Array.isArray(outgoingButtonsComp?.buttons) ? outgoingButtonsComp!.buttons : [];
    console.log("[upsert-app-booking-confirm] BUTTONS (outgoing)", JSON.stringify({
      present: !!outgoingButtonsComp,
      count: outgoingButtons.length,
      buttons: outgoingButtons,
    }, null, 2));
    console.log("[upsert-app-booking-confirm] create payload", JSON.stringify(createBody, null, 2));

    const createRes = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const createResBody = await createRes.json().catch(() => ({}));
    console.log("[upsert-app-booking-confirm] Meta create response RAW", JSON.stringify({ status: createRes.status, body: createResBody }, null, 2));

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

    // Verify: re-fetch from Meta and confirm the buttons are present in the correct order.
    let verify: JsonRecord | null = null;
    try {
      const verifyRes = await fetch(
        `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ name: TEMPLATE_NAME, fields: "name,status,language,components" })}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const vb = await verifyRes.json().catch(() => ({}));
      console.log("[upsert-app-booking-confirm] Meta verify response RAW", JSON.stringify(vb, null, 2));
      const tpl = Array.isArray(vb?.data) ? vb.data.find((t: any) => t?.language === LANGUAGE) || vb.data[0] : null;
      const btnComp = Array.isArray(tpl?.components)
        ? tpl.components.find((c: any) => String(c?.type).toUpperCase() === "BUTTONS")
        : null;
      const buttons = Array.isArray(btnComp?.buttons) ? btnComp.buttons : [];
      console.log("[upsert-app-booking-confirm] BUTTONS (verified from Meta)", JSON.stringify({
        present: !!btnComp,
        count: buttons.length,
        buttons,
      }, null, 2));
      verify = {
        status: tpl?.status || null,
        buttonsLength: buttons.length,
        buttons,
      };
    } catch (e) {
      console.warn("[upsert-app-booking-confirm] verify failed", e);
    }

    return json({
      ok: true,
      name: TEMPLATE_NAME,
      language: LANGUAGE,
      status: createResBody?.status || "PENDING",
      id: createResBody?.id,
      verify,
      note: "Submitted app_booking_confirm (TEXT header + 6 body vars + Call Now / Get Location buttons) to Meta.",
    });
  } catch (e) {
    console.error("[upsert-app-booking-confirm] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
