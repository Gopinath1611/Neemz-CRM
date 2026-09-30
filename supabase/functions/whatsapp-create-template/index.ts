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
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const v = source[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
};

/**
 * Submit a WhatsApp message template to Meta for approval.
 * Body shape:
 *   {
 *     name: "appointment_booking_confirmation",
 *     category: "UTILITY" | "MARKETING" | "AUTHENTICATION",
 *     language: "en_US",
 *     body: "Hello {{1}}, ...",
 *     footer?: "Dr Neemz Dentistry",
 *     header?: { format: "TEXT"|"NONE", text?: string },
 *     bodyExamples?: string[]   // sample values for {{1}}, {{2}} ...
 *   }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const name = String(payload?.name || "").trim().toLowerCase();
    const category = String(payload?.category || "").trim().toUpperCase();
    const language = String(payload?.language || "en_US").trim();
    const bodyText = String(payload?.body || "").trim();
    const footer = typeof payload?.footer === "string" ? payload.footer.trim() : "";
    const header = payload?.header || null;
    const bodyExamples: string[] = Array.isArray(payload?.bodyExamples)
      ? payload.bodyExamples.map((s: any) => String(s))
      : [];

    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      return json({ ok: false, error: "Invalid template name (lowercase letters, numbers, underscore)" }, 400);
    }
    if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category)) {
      return json({ ok: false, error: "Invalid category" }, 400);
    }
    if (!bodyText) return json({ ok: false, error: "Body is required" }, 400);

    // Resolve WABA + token from connected_apps (same pattern as list-templates).
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
      ["waba_id", "business_account_id", "whatsapp_business_account_id", "env"],
    );
    const phoneNumberId =
      pickString([credentials, metadata], ["wa_phone_id", "phone_number_id"]) || "777081605497413";

    if (!accessToken) return json({ ok: false, error: "Meta access token missing." }, 400);

    if (!wabaId && phoneNumberId) {
      const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const lookupBody = await lookup.json().catch(() => ({}));
      wabaId = lookupBody?.whatsapp_business_account?.id || null;
    }
    if (!wabaId) return json({ ok: false, error: "Could not resolve WhatsApp Business Account ID." }, 400);

    // Build components.
    const components: JsonRecord[] = [];
    if (header && String(header.format || "").toUpperCase() === "TEXT" && header.text) {
      components.push({ type: "HEADER", format: "TEXT", text: String(header.text) });
    }
    const bodyComp: JsonRecord = { type: "BODY", text: bodyText };
    // Attach example values for variables so Meta doesn't reject with "example missing".
    const varCount = (bodyText.match(/\{\{\s*\d+\s*\}\}/g) || []).length;
    if (varCount > 0) {
      const examples = Array.from({ length: varCount }, (_, i) => bodyExamples[i] || `Sample ${i + 1}`);
      bodyComp.example = { body_text: [examples] };
    }
    components.push(bodyComp);
    if (footer) components.push({ type: "FOOTER", text: footer });

    const metaBody = { name, category, language, components };

    const url = `${GRAPH}/${wabaId}/message_templates`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaBody),
    });
    const respBody = await res.json().catch(() => ({}));

    if (!res.ok || respBody?.error) {
      // Return 200 so supabase.functions.invoke exposes the body to the client.
      // The client checks `ok:false` and shows `error` in a toast.
      return json({
        ok: false,
        error: respBody?.error?.error_user_msg || respBody?.error?.message || `Meta API error ${res.status}`,
        code: respBody?.error?.code,
        subcode: respBody?.error?.error_subcode,
        details: respBody,
        sent: metaBody,
      }, 200);
    }

    return json({
      ok: true,
      id: respBody?.id,
      status: respBody?.status || "PENDING",
      category: respBody?.category || category,
      name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 500);
  }
});
