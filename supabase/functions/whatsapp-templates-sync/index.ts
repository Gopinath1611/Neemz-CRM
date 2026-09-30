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

const countTemplateParams = (body: string): number => {
  const matches = (body || "").match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  const nums = matches.map((m) => Number(m.replace(/[^\d]/g, ""))).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey);

    // Resolve credentials the same way whatsapp-send-message does.
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

    // Fetch all templates from Meta (paginated).
    const templates: JsonRecord[] = [];
    let next: string | null =
      `${GRAPH}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=200`;
    while (next) {
      const res = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) {
        return json({ ok: false, error: body?.error?.message || `Meta lookup failed (${res.status})`, details: body }, 400);
      }
      if (Array.isArray(body?.data)) templates.push(...body.data);
      next = body?.paging?.next || null;
    }

    // Existing rows keyed by name+language.
    const { data: existingRows } = await service
      .from("whatsapp_templates")
      .select("name, language, header_media_url");
    const existing = new Map<string, { header_media_url: string | null }>();
    for (const r of (existingRows || []) as any[]) {
      existing.set(`${r.name}::${r.language}`, { header_media_url: r.header_media_url });
    }

    const publicBase = `${supabaseUrl}/storage/v1/object/public/clinic-assets/whatsapp`;

    // Helper: check if a candidate public image exists (HEAD 200).
    const checkImage = async (fname: string): Promise<string | null> => {
      const url = `${publicBase}/${fname}`;
      try {
        const h = await fetch(url, { method: "HEAD" });
        if (h.status === 200) return url;
      } catch { /* ignore */ }
      return null;
    };

    const report = {
      configured: [] as any[],       // ✓ newly created + image auto-populated
      missingImage: [] as any[],     // ⚠ row created / present but no image
      alreadyConfigured: [] as any[],// ✓ already had a header_media_url
      skippedNonImage: [] as any[],  // templates without IMAGE header (info)
      skippedNotApproved: [] as any[],
    };

    for (const t of templates) {
      const name = String(t?.name || "");
      const language = String(t?.language || "");
      const status = String(t?.status || "").toUpperCase();
      const category = t?.category ? String(t.category) : null;
      const components: JsonRecord[] = Array.isArray(t?.components) ? t.components : [];
      const header = components.find((c) => String(c?.type).toUpperCase() === "HEADER");
      const bodyComp = components.find((c) => String(c?.type).toUpperCase() === "BODY");
      const headerFormat = String(header?.format || "").toUpperCase();
      const bodyVars = countTemplateParams(String(bodyComp?.text || ""));
      const bodyText = String(bodyComp?.text || "");

      if (status !== "APPROVED") {
        report.skippedNotApproved.push({ name, language, status });
        continue;
      }
      if (headerFormat !== "IMAGE") {
        report.skippedNonImage.push({ name, language, headerFormat: headerFormat || "NONE" });
        continue;
      }

      const key = `${name}::${language}`;
      const existingRow = existing.get(key);

      if (existingRow) {
        if (existingRow.header_media_url && existingRow.header_media_url.trim()) {
          report.alreadyConfigured.push({ name, language, header_media_url: existingRow.header_media_url });
        } else {
          // Row exists but no image — try auto-detect but do NOT overwrite anything else.
          const candidates = [`${name}.jpg`, `${name.replaceAll("_", "-")}.jpg`, `${name}.png`];
          let found: string | null = null;
          for (const c of candidates) { found = await checkImage(c); if (found) break; }
          if (found) {
            await service.from("whatsapp_templates")
              .update({ header_media_url: found })
              .eq("name", name).eq("language", language);
            report.configured.push({ name, language, header_media_url: found, action: "image_attached" });
          } else {
            report.missingImage.push({
              name, language,
              expectedPath: `clinic-assets/whatsapp/${name}.jpg`,
            });
          }
        }
        continue;
      }

      // Missing row — auto-create.
      const candidates = [`${name}.jpg`, `${name.replaceAll("_", "-")}.jpg`, `${name}.png`];
      let found: string | null = null;
      for (const c of candidates) { found = await checkImage(c); if (found) break; }

      const insertRow = {
        name,
        language,
        status,
        category,
        body: bodyText,
        header_media_url: found,
      };
      const { error: insErr } = await service.from("whatsapp_templates").insert(insertRow);
      if (insErr) {
        report.missingImage.push({ name, language, error: insErr.message });
        continue;
      }
      if (found) {
        report.configured.push({ name, language, header_media_url: found, bodyVars, action: "row_created_with_image" });
      } else {
        report.missingImage.push({
          name, language, bodyVars,
          expectedPath: `clinic-assets/whatsapp/${name}.jpg`,
          action: "row_created_without_image",
        });
      }
    }

    const summary = {
      totalMetaTemplates: templates.length,
      approvedImageTemplates:
        report.configured.length + report.missingImage.length + report.alreadyConfigured.length,
      configuredCount: report.configured.length,
      alreadyConfiguredCount: report.alreadyConfigured.length,
      missingImageCount: report.missingImage.length,
      skippedNonImageCount: report.skippedNonImage.length,
      skippedNotApprovedCount: report.skippedNotApproved.length,
    };

    return json({ ok: true, wabaId, summary, report });
  } catch (e) {
    console.error("[whatsapp-templates-sync] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
