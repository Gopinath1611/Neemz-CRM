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

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await caller.auth.getUser(jwt);
    if (userError || !user) {
      console.error("[whatsapp-list-templates] auth.getUser failed", userError?.message);
      return json({ ok: false, error: "Unauthorized", detail: userError?.message || "no user for token" }, 401);
    }

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
    const wabaIdSaved = pickString(
      [credentials, metadata, { env: envWaba }],
      ["wa_waba_id", "waba_id", "business_account_id", "whatsapp_business_account_id", "env"],
    );
    const phoneNumberId =
      pickString([credentials, metadata], ["wa_phone_id", "phone_number_id"]) || "777081605497413";

    if (!accessToken) return json({ ok: false, error: "Meta access token missing. Save it on the WhatsApp connection or set WHATSAPP_ACCESS_TOKEN." }, 400);

    // Derive WABA ID from the phone number when not saved. A WABA ID is
    // required here; phone-number and Meta app IDs do not expose
    // `message_templates` and Meta returns OAuth error #100 for those IDs.
    let wabaId = wabaIdSaved;
    if (!wabaId && phoneNumberId) {
      const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const lookupBody = await lookup.json().catch(() => ({}));
      wabaId = lookupBody?.whatsapp_business_account?.id || null;
    }

    if (!wabaId) return json({ ok: false, error: "Could not resolve WhatsApp Business Account ID. Save waba_id on the connection or set WHATSAPP_BUSINESS_ACCOUNT_ID secret." }, 400);

    const fetchTemplates = async (id: string) => {
      const r = await fetch(`${GRAPH}/${id}/message_templates?fields=name,status,category,language,components&limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { res: r, body: await r.json().catch(() => ({})) };
    };

    let { res, body } = await fetchTemplates(wabaId);

    // Saved ID may not be a WhatsApp Business Account (e.g. a phone number or app ID).
    // Re-derive the real WABA from the phone number and retry once.
    if ((!res.ok || body?.error) && body?.error?.code === 100 && phoneNumberId) {
      const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const lookupBody = await lookup.json().catch(() => ({}));
      const derived = lookupBody?.whatsapp_business_account?.id;
      console.warn("[whatsapp-list-templates] saved WABA invalid", wabaId, "derived", derived);
      if (derived && derived !== wabaId) {
        wabaId = derived;
        ({ res, body } = await fetchTemplates(derived));
      }
    }

    if (!res.ok || body?.error) {
      // Return 200 so the client can show the message instead of crashing.
      return json({
        ok: false,
        error: body?.error?.code === 100
          ? `The saved WhatsApp Business Account ID (${wabaId}) is not valid. Please update the WABA ID on the WhatsApp connection.`
          : body?.error?.message || `Meta API error ${res.status}`,
        code: body?.error?.code,
        details: body,
      }, 200);
    }

    const templates = Array.isArray(body?.data)
      ? body.data.map((t: JsonRecord) => {
          const comps: JsonRecord[] = Array.isArray(t.components) ? t.components : [];
          const bodyComp = comps.find((c) => String(c?.type).toUpperCase() === "BODY");
          const headerComp = comps.find((c) => String(c?.type).toUpperCase() === "HEADER");
          const footerComp = comps.find((c) => String(c?.type).toUpperCase() === "FOOTER");
          const buttonsComp: any = comps.find((c) => String(c?.type).toUpperCase() === "BUTTONS");
          const headerExample = (() => {
            const ex: any = (headerComp as any)?.example;
            if (!ex) return "";
            const arr = Array.isArray(ex.header_handle) ? ex.header_handle : Array.isArray(ex.header_url) ? ex.header_url : [];
            return typeof arr[0] === "string" ? arr[0] : "";
          })();

          // Parse BUTTONS component — support PHONE_NUMBER, URL, QUICK_REPLY.
          // Meta returns buttons either as `buttonsComp.buttons: [...]` or, on older
          // shapes, as sibling entries with `sub_type`. Handle both defensively so
          // CTA buttons never silently sync as [].
          const rawButtons: any[] = Array.isArray(buttonsComp?.buttons)
            ? buttonsComp.buttons
            : Array.isArray(buttonsComp)
              ? buttonsComp
              : [];
          const parsedButtons = rawButtons.map((b: any) => {
            const type = String(b?.type || b?.sub_type || "").toUpperCase();
            const out: JsonRecord = { type, text: typeof b?.text === "string" ? b.text : "" };
            if (type === "URL") {
              out.url = typeof b?.url === "string" ? b.url : "";
              if (Array.isArray(b?.example)) out.example = b.example;
            } else if (type === "PHONE_NUMBER") {
              out.phone_number = typeof b?.phone_number === "string" ? b.phone_number : "";
            }
            // QUICK_REPLY has only type + text.
            return out;
          });

          console.log("[whatsapp-list-templates] parse", JSON.stringify({
            name: t.name,
            language: t.language,
            componentsCount: comps.length,
            componentTypes: comps.map((c) => String(c?.type || "").toUpperCase()),
            buttonsComponentFound: !!buttonsComp,
            buttonsParsed: parsedButtons.length,
            buttons: parsedButtons,
          }));

          return {
            name: t.name,
            status: t.status,
            category: t.category,
            language: t.language,
            body: typeof bodyComp?.text === "string" ? bodyComp.text : "",
            header_format: headerComp ? String((headerComp as any).format || "").toUpperCase() : "",
            header_text: headerComp && typeof (headerComp as any).text === "string" ? (headerComp as any).text : "",
            header_example: headerExample,
            footer_text: footerComp && typeof (footerComp as any).text === "string" ? (footerComp as any).text : "",
            buttons: parsedButtons,
            components: comps,
          };
        })
      : [];
    // Persist Meta's approved category/status so cost estimates can group by category.
    // Read-only mirror of Meta data — does not touch send logic.
    try {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (serviceKey && templates.length) {
        const admin = createClient(supabaseUrl, serviceKey);
        for (const t of templates) {
          if (!t.name) continue;
          const { data: existing } = await admin
            .from("whatsapp_templates")
            .select("id")
            .ilike("name", t.name)
            .limit(1)
            .maybeSingle();
          const patch = {
            category: t.category ? String(t.category).toUpperCase() : null,
            status: t.status ? String(t.status).toUpperCase() : null,
            language: t.language || null,
          };
          if (existing?.id) {
            await admin.from("whatsapp_templates").update(patch).eq("id", existing.id);
          } else {
            await admin.from("whatsapp_templates").insert({ name: t.name, body: t.body || "", ...patch });
          }
        }
      }
    } catch (syncErr) {
      console.warn("[whatsapp-list-templates] category persist skipped", String(syncErr));
    }

    return json({ ok: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 500);
  }
});
