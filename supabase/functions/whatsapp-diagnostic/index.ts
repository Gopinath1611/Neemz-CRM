import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v23.0";
const PHONE_NUMBER_ID = "777081605497413";

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

const isE164Digits = (s: string) => /^\d{8,15}$/.test(s);

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

    const payload = (await req.json().catch(() => ({}))) as JsonRecord;
    const to = String(payload.to || "").replace(/\D/g, "");
    const mode = ((): "hello_world" | "text" | "template" => {
      if (payload.mode === "text") return "text";
      if (payload.mode === "template") return "template";
      return "hello_world";
    })();
    const text = String(payload.text || "").trim();
    const templateName = String(payload.templateName || "").trim();
    const requestedLanguage = String(payload.languageCode || "").trim();
    const bodyParamsIn: string[] = Array.isArray(payload.bodyParams)
      ? payload.bodyParams.map((v: unknown) => String(v ?? "").trim())
      : [];
    const headerImageUrlOverride = String(payload.headerImageUrl || payload.header_media_url || "").trim();
    const headerMediaId = String(payload.headerMediaId || "").trim();
    const pollSeconds = Math.min(120, Math.max(0, Number(payload.pollSeconds ?? 90)));

    if (!to) return json({ ok: false, error: "Recipient (to) is required" }, 400);
    if (mode === "text" && !text) return json({ ok: false, error: "text is required in text mode" }, 400);
    if (mode === "template" && !templateName) return json({ ok: false, error: "templateName is required in template mode" }, 400);

    // Load access token from same source production uses
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
    const accessToken = pickString(
      [credentials, metadata, { access_token: conn?.access_token }, { env: envToken }],
      ["wa_api_key", "access_token", "token", "bearer_token", "env"],
    );

    if (!accessToken) {
      return json({ ok: false, error: "Meta access token missing." }, 400);
    }

    // 1) debug_token
    let tokenDebug: JsonRecord = {};
    try {
      const dbg = await fetch(
        `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
      );
      const dbgBody = await dbg.json().catch(() => ({}));
      const d = dbgBody?.data || {};
      const expiresAt = typeof d.expires_at === "number" ? d.expires_at : null;
      tokenDebug = {
        isValid: !!d.is_valid,
        type: d.type ?? null,
        appId: d.app_id ?? null,
        userId: d.user_id ?? null,
        expiresAt: expiresAt,
        expiresAtIso: expiresAt && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : (expiresAt === 0 ? "never" : null),
        expiresInDays: expiresAt && expiresAt > 0 ? Math.max(0, Math.round((expiresAt * 1000 - Date.now()) / 86400000)) : null,
        dataAccessExpiresAt: d.data_access_expires_at ?? null,
        scopes: Array.isArray(d.scopes) ? d.scopes : [],
        error: dbgBody?.error ?? null,
      };
    } catch (e) {
      tokenDebug = { isValid: false, error: String(e) };
    }

    // 2) environment info
    const environment: JsonRecord = {
      pnid: PHONE_NUMBER_ID,
      recipientE164Valid: isE164Digits(to),
      recipient: to,
    };
    try {
      const pn = await fetch(
        `${GRAPH}/${PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier,whatsapp_business_account`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const pnBody = await pn.json().catch(() => ({}));
      environment.displayPhoneNumber = pnBody?.display_phone_number ?? null;
      environment.verifiedName = pnBody?.verified_name ?? null;
      environment.qualityRating = pnBody?.quality_rating ?? null;
      environment.messagingLimitTier = pnBody?.messaging_limit_tier ?? null;
      environment.wabaId = pnBody?.whatsapp_business_account?.id ?? null;
      environment.pnError = pnBody?.error ?? null;

      if (environment.wabaId) {
        const waba = await fetch(
          `${GRAPH}/${environment.wabaId}?fields=id,name,message_template_namespace`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const wabaBody = await waba.json().catch(() => ({}));
        environment.wabaName = wabaBody?.name ?? null;
        environment.templateNamespace = wabaBody?.message_template_namespace ?? null;
        environment.wabaError = wabaBody?.error ?? null;

        const nums = await fetch(
          `${GRAPH}/${environment.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const numsBody = await nums.json().catch(() => ({}));
        environment.registeredNumbers = Array.isArray(numsBody?.data) ? numsBody.data : [];

        // Webhook subscription check
        try {
          const subs = await fetch(
            `${GRAPH}/${environment.wabaId}/subscribed_apps`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const subsBody = await subs.json().catch(() => ({}));
          environment.subscribedApps = Array.isArray(subsBody?.data) ? subsBody.data : subsBody;
        } catch (e) {
          environment.subscribedAppsError = String(e);
        }
      }
    } catch (e) {
      environment.error = String(e);
    }

    // 3) Build payload
    const countTemplateParams = (body: string): number => {
      const matches = (body || "").match(/\{\{\s*(\d+)\s*\}\}/g) || [];
      const nums = matches.map((m) => Number(m.replace(/[^\d]/g, ""))).filter((n) => Number.isFinite(n));
      return nums.length ? Math.max(...nums) : 0;
    };

    const templateInfo: JsonRecord = {};
    let imageCheck: JsonRecord | null = null;
    let metaBody: JsonRecord;

    if (mode === "template") {
      // Resolve WABA (prefer env, then PN lookup)
      const envWaba = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "";
      let wabaResolved: string | null = envWaba || environment.wabaId || null;
      if (!wabaResolved) return json({ ok: false, error: "Cannot resolve WABA to look up template." }, 400);

      const tplRes = await fetch(
        `${GRAPH}/${wabaResolved}/message_templates?fields=name,status,language,category,components&name=${encodeURIComponent(templateName)}&limit=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const tplBody = await tplRes.json().catch(() => ({}));
      if (!tplRes.ok || tplBody?.error) {
        return json({ ok: false, error: `Template lookup failed: ${tplBody?.error?.message || tplRes.status}`, details: tplBody }, 400);
      }
      const matches: JsonRecord[] = Array.isArray(tplBody?.data)
        ? tplBody.data.filter((t: JsonRecord) => t.name === templateName)
        : [];
      const approved = matches.filter((t) => String(t.status).toUpperCase() === "APPROVED");
      if (approved.length === 0) {
        return json({ ok: false, error: `Template "${templateName}" not APPROVED on WABA ${wabaResolved}.`, details: matches }, 400);
      }
      const selected = requestedLanguage
        ? approved.find((t) => t.language === requestedLanguage) || approved[0]
        : approved[0];
      const comps: JsonRecord[] = Array.isArray(selected.components) ? selected.components : [];
      const headerComp = comps.find((c) => String(c?.type).toUpperCase() === "HEADER");
      const bodyComp = comps.find((c) => String(c?.type).toUpperCase() === "BODY");
      const headerFormat = String(headerComp?.format || "").toUpperCase();
      const headerExample = (() => {
        const ex: any = (headerComp as any)?.example;
        if (!ex) return "";
        const arr = Array.isArray(ex.header_handle) ? ex.header_handle : Array.isArray(ex.header_url) ? ex.header_url : [];
        return typeof arr[0] === "string" ? arr[0] : "";
      })();
      const bodyText = String(bodyComp?.text || "");
      const expectedBodyParams = countTemplateParams(bodyText);
      const bodyParams = bodyParamsIn.length >= expectedBodyParams
        ? bodyParamsIn.slice(0, expectedBodyParams)
        : Array.from({ length: expectedBodyParams }, (_, i) => bodyParamsIn[i] || "Test");

      // NEVER fall back to headerExample (Meta sample header_handle URLs are signed,
      // time-limited, and cannot be re-downloaded by Meta workers for real sends).
      const headerImageUrl = headerImageUrlOverride;

      templateInfo.name = selected.name;
      templateInfo.language = selected.language;
      templateInfo.category = selected.category;
      templateInfo.status = selected.status;
      templateInfo.headerFormat = headerFormat || "NONE";
      templateInfo.headerExample = headerExample;
      templateInfo.headerImageUrlUsed = headerImageUrl || null;
      templateInfo.headerMediaIdUsed = headerMediaId || null;
      templateInfo.expectedBodyParams = expectedBodyParams;
      templateInfo.bodyParams = bodyParams;
      templateInfo.bodyPreview = bodyText.slice(0, 200);

      if (headerFormat === "IMAGE" && !headerImageUrl && !headerMediaId) {
        return json({
          ok: false,
          error: `Template "${selected.name}" has an IMAGE header. Pass either headerMediaId (uploaded via POST /{PNID}/media) or headerImageUrl (permanent public HTTPS JPEG/PNG). Meta sample header_handle URLs are NOT accepted.`,
          templateInfo,
        }, 400);
      }

      // Verify image URL if supplied
      if (headerFormat === "IMAGE" && headerImageUrl) {
        try {
          const imgRes = await fetch(headerImageUrl, { method: "GET", headers: { "User-Agent": "facebookexternalhit/1.1" } });
          const contentType = imgRes.headers.get("content-type");
          const contentLength = imgRes.headers.get("content-length");
          const buf = await imgRes.arrayBuffer();
          const sizeBytes = buf.byteLength;
          const bytes = new Uint8Array(buf.slice(0, 12));
          let magic = "unknown";
          if (bytes[0] === 0xff && bytes[1] === 0xd8) magic = "jpeg";
          else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) magic = "png";
          else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) magic = "gif";
          else if (bytes[0] === 0x3c) magic = "svg-or-html";
          const isMetaCdn = /scontent\.whatsapp\.net|fbcdn\.net/i.test(headerImageUrl);
          const isPublicHttps = /^https:\/\//i.test(headerImageUrl);
          const isSigned = /[?&](oh|oe|_nc_sid|_nc_ohc|Signature|Expires|X-Amz-Signature)=/i.test(headerImageUrl);
          imageCheck = {
            url: headerImageUrl,
            httpStatus: imgRes.status,
            contentTypeHeader: contentType,
            contentLengthHeader: contentLength,
            sizeBytes,
            magicSniff: magic,
            isPublicHttps,
            isSignedOrTimeLimited: isSigned,
            isMetaCdnSampleUrl: isMetaCdn,
            metaAcceptable: imgRes.ok && (magic === "jpeg" || magic === "png") && sizeBytes <= 5 * 1024 * 1024 && !isMetaCdn && !isSigned && isPublicHttps,
            warning: isMetaCdn
              ? "This is a Meta sample header_handle URL (signed, time-limited). Rejected — do not use for real sends."
              : (isSigned ? "URL appears signed/time-limited. Use a permanent unsigned public URL." : null),
          };
          if (imageCheck.metaAcceptable === false) {
            return json({
              ok: false,
              error: "Image URL failed pre-flight validation. See imageCheck for details.",
              templateInfo,
              imageCheck,
            }, 400);
          }
        } catch (e) {
          imageCheck = { url: headerImageUrl, error: String(e) };
          return json({ ok: false, error: `Could not fetch image URL: ${e}`, templateInfo, imageCheck }, 400);
        }
      }

      const components: JsonRecord[] = [];
      if (headerFormat === "IMAGE") {
        const imageParam: JsonRecord = headerMediaId
          ? { id: headerMediaId }
          : { link: headerImageUrl };
        components.push({ type: "header", parameters: [{ type: "image", image: imageParam }] });
      }
      if (bodyParams.length > 0) {
        components.push({ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) });
      }

      metaBody = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: selected.name,
          language: { code: selected.language },
          ...(components.length ? { components } : {}),
        },
      };
    } else if (mode === "hello_world") {
      metaBody = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      };
    } else {
      metaBody = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      };
    }

    const url = `${GRAPH}/${PHONE_NUMBER_ID}/messages`;
    const request = {
      url,
      method: "POST",
      headers: { Authorization: "Bearer ***", "Content-Type": "application/json" },
      body: metaBody,
    };

    console.log("[whatsapp-diagnostic] request", JSON.stringify(request));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaBody),
    });

    const respBody = await res.json().catch(() => ({}));
    const respHeaders = {
      xFbTraceId: res.headers.get("x-fb-trace-id"),
      xFbRequestId: res.headers.get("x-fb-request-id"),
      xBusinessUseCaseUsage: (() => {
        const raw = res.headers.get("x-business-use-case-usage");
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return raw; }
      })(),
    };

    const response = {
      httpStatus: res.status,
      ok: res.ok,
      body: respBody,
      error: respBody?.error ?? null,
      headers: respHeaders,
    };

    const wamid: string | null = respBody?.messages?.[0]?.id ?? null;

    // Persist minimal outbound record so existing webhook status updates land in whatsapp_messages
    if (wamid) {
      try {
        const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey);
        const previewText =
          mode === "hello_world" ? "[diagnostic] hello_world"
          : mode === "template" ? `[diagnostic] template ${templateInfo.name}`
          : `[diagnostic] ${text}`;
        const { data: thread } = await service
          .from("whatsapp_threads")
          .upsert(
            { wa_phone: to, last_message: previewText, last_message_at: new Date().toISOString() },
            { onConflict: "wa_phone" },
          )
          .select("id")
          .single();
        if (thread?.id) {
          await service.from("whatsapp_messages").insert({
            thread_id: thread.id,
            wa_message_id: wamid,
            direction: "out",
            text: previewText,
            payload: { request: metaBody, response: respBody, diagnostic: true },
            status: "accepted",
            status_updated_at: new Date().toISOString(),
          });
        }
      } catch (persistErr) {
        console.error("[whatsapp-diagnostic] persist failed", persistErr);
      }
    }

    // Poll webhook status updates from whatsapp_messages
    const statusTimeline: Array<{ status: string; at: string; error?: unknown }> = [];
    let finalStatus = "accepted";
    if (wamid && pollSeconds > 0) {
      const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey);
      const start = Date.now();
      let lastStatus = "accepted";
      statusTimeline.push({ status: "accepted", at: new Date().toISOString() });
      while (Date.now() - start < pollSeconds * 1000) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: row } = await service
          .from("whatsapp_messages")
          .select("status, status_updated_at, error")
          .eq("wa_message_id", wamid)
          .maybeSingle();
        const s = String(row?.status || "").toLowerCase();
        if (s && s !== lastStatus) {
          statusTimeline.push({ status: s, at: row?.status_updated_at || new Date().toISOString(), error: (row as any)?.error ?? undefined });
          lastStatus = s;
          finalStatus = s;
          if (s === "read" || s === "failed") break;
        }
      }
      finalStatus = lastStatus;
    }

    console.log("[whatsapp-diagnostic] response", JSON.stringify(response));

    return json({
      ok: true,
      tokenDebug,
      environment,
      templateInfo,
      imageCheck,
      request,
      response,
      wamid,
      statusTimeline,
      finalStatus,
      webhookCallbackUrl: `${supabaseUrl}/functions/v1/whatsapp-webhook`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 500);
  }
});
