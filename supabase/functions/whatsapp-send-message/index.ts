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

const normalizeTemplateTextParam = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

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
    const { data: { user }, error: userErr } = await caller.auth.getUser(jwt);
    if (userErr || !user) return json({ ok: false, error: "Unauthorized", detail: userErr?.message || "no user for token" }, 401);

    const payload = await req.json().catch(() => ({})) as JsonRecord;
    const to = String(payload.to || "").trim();
    const rawTypeIn = String(payload.type || "").toLowerCase();
    const MEDIA_TYPES = ["image", "document", "sticker", "video", "audio"] as const;
    const type = (rawTypeIn === "text" || (MEDIA_TYPES as readonly string[]).includes(rawTypeIn)
      ? rawTypeIn
      : "template") as "text" | "template" | "image" | "document" | "sticker" | "video" | "audio";
    const dryRun = payload.dryRun === true;
    const messageSource = String(payload.source || "").trim() || null;
    const templateName = String(payload.templateName || "").trim();
    const requestedLanguage = String(payload.languageCode || "").trim();
    const text = String(payload.text || "").trim();
    const customerName = String(payload.customerName || payload.customer_name || payload.name || "").trim();
    let bodyParams: string[] = Array.isArray(payload.bodyParams)
      ? payload.bodyParams.map(normalizeTemplateTextParam)
      : [];
    if (bodyParams.length === 0 && customerName) bodyParams = [customerName];
    let headerParams: string[] = Array.isArray(payload.headerParams)
      ? payload.headerParams.map(normalizeTemplateTextParam)
      : [];
    // Header media is auto-resolved by the backend from public.whatsapp_templates.header_media_url.
    // Callers may still override by passing headerImageUrl / headerVideoUrl / headerDocumentUrl explicitly,
    // or by passing header_media_url which is treated as an image header fallback.
    let headerImageUrl = String(payload.headerImageUrl || payload.header_media_url || "").trim();
    let headerVideoUrl = String(payload.headerVideoUrl || "").trim();
    let headerDocumentUrl = String(payload.headerDocumentUrl || "").trim();
    const buttonUrlParams: string[] = Array.isArray(payload.buttonUrlParams)
      ? payload.buttonUrlParams.map(normalizeTemplateTextParam)
      : [];

    // ---- Send attribution context -------------------------------------------
    // Optional `context` object supplied by the caller so every logged message can
    // be traced back to the exact workflow / campaign / pipeline stage / record.
    // Anything missing is derived from the template name + source, so older
    // callers keep working and simply fall into the coarse buckets.
    const ctxRaw = (payload.context && typeof payload.context === "object") ? payload.context : {};
    const ctxStr = (v: unknown) => {
      const s = String(v ?? "").trim();
      return s ? s : null;
    };
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ctxUuid = (v: unknown) => {
      const s = String(v ?? "").trim();
      return UUID_RE.test(s) ? s : null;
    };
    const VALID_MODULES = new Set(["clinic", "marketing", "bot", "manual", "system"]);
    const deriveModule = (): string => {
      const explicit = String(ctxRaw.module ?? "").trim().toLowerCase();
      if (VALID_MODULES.has(explicit)) return explicit;
      const src = String(messageSource ?? "").trim().toLowerCase();
      if (src === "workflow" || src === "campaign" || src === "camp_coupon_pdf") return "marketing";
      if (src === "single_send") return "manual";
      if (src === "bot" || src === "auto_reply") return "bot";
      if (src === "clinic" || src === "clinic_workflow") return "clinic";
      return "system";
    };
    const deriveKind = (): string => {
      const explicit = String(ctxRaw.messageKind ?? ctxRaw.message_kind ?? "").trim().toLowerCase();
      if (explicit) return explicit;
      const t = String(templateName || "").toLowerCase();
      if (/remind/.test(t)) return "reminder";
      if (/reschedul/.test(t)) return "reschedule";
      if (/cancel/.test(t)) return "cancellation";
      if (/follow/.test(t)) return "followup";
      if (/appointment|app_booking/.test(t)) return "booking";
      if (/review/.test(t)) return "review";
      if (/check[-_]?in/.test(t)) return "checkin";
      if (/check[-_]?out/.test(t)) return "checkout";
      if (/prescription/.test(t)) return "prescription";
      if (/invoice|^inv[-_]|payment_sharing/.test(t)) return "invoice";
      return "other";
    };
    const sendAttribution = {
      send_context: Object.keys(ctxRaw).length ? ctxRaw : null,
      module: deriveModule(),
      message_kind: deriveKind(),
      workflow_id: ctxUuid(ctxRaw.workflowId ?? ctxRaw.workflow_id),
      workflow_run_id: ctxUuid(ctxRaw.workflowRunId ?? ctxRaw.workflow_run_id),
      campaign_id: ctxUuid(ctxRaw.campaignId ?? ctxRaw.campaign_id),
      stage_from: ctxStr(ctxRaw.stageFrom ?? ctxRaw.stage_from),
      stage_to: ctxStr(ctxRaw.stageTo ?? ctxRaw.stage_to),
      appointment_id: ctxUuid(ctxRaw.appointmentId ?? ctxRaw.appointment_id),
      lead_id: ctxUuid(ctxRaw.leadId ?? ctxRaw.lead_id),
      patient_id: ctxUuid(ctxRaw.patientId ?? ctxRaw.patient_id),
    };


    // Holds the approved BODY text of the template so we can render the outbound
    // preview (with variables substituted) for inbox/thread history.
    let templateBodyText = "";



    if (!to) return json({ ok: false, error: "Recipient (to) is required" }, 200);
    if (type === "template" && !templateName) return json({ ok: false, error: "templateName is required for template sends" }, 200);
    if (type === "text" && !text) return json({ ok: false, error: "text body is required for text sends" }, 200);

    // ---- Pre-send recipient validation (format + blacklist) -----------------
    // Numbers that previously came back as Meta error 131026 (undeliverable /
    // not a WhatsApp user) are stored in public.whatsapp_blocked_numbers and are
    // blocked here so we never burn a paid conversation on them again.
    const guardKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
    const guard = createClient(supabaseUrl, guardKey);
    const toDigits = to.replace(/\D/g, "");
    if (toDigits.length < 10 || toDigits.length > 15) {
      return json({
        ok: false,
        blocked: true,
        stage: "precheck",
        error: "Cannot send: recipient phone number is not a valid WhatsApp number (needs country code, 10–15 digits).",
      }, 200);
    }
    if (!dryRun) {
      const { data: blockRow } = await guard
        .from("whatsapp_blocked_numbers")
        .select("wa_phone, reason, error_code, blocked")
        .eq("wa_phone", toDigits)
        .eq("blocked", true)
        .maybeSingle();
      if (blockRow) {
        console.warn("[whatsapp-send-message] blocked recipient", { toDigits, reason: blockRow.reason });
        return json({
          ok: false,
          blocked: true,
          stage: "precheck",
          code: blockRow.error_code ?? 131026,
          error: "Cannot send: Recipient is not on WhatsApp (number blacklisted after a previous undeliverable delivery failure).",
          reason: blockRow.reason ?? null,
        }, 200);
      }
    }

    // ---- Duplicate-send guard ------------------------------------------------
    // Blocks the same template going to the same number twice inside a window,
    // whatever the caller (workflow, campaign, single send). Automation loops and
    // webhook/cron retries used to re-blast identical templates for hours.
    // Callers may opt out per request with allowDuplicate: true.
    const DEDUPE_WINDOW_MS = Number(Deno.env.get("WHATSAPP_DEDUPE_WINDOW_MS") || 24 * 60 * 60 * 1000);
    if (!dryRun && type === "template" && payload.allowDuplicate !== true && DEDUPE_WINDOW_MS > 0) {
      try {
        const sinceISO = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
        const { data: recent } = await guard
          .from("whatsapp_messages")
          .select("id, created_at, status, payload")
          .eq("direction", "out")
          .gte("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(500);
        const dupe = (recent || []).find((row: any) => {
          const req = row?.payload?.request || {};
          const toMatch = String(req.to || "").replace(/\D/g, "") === toDigits;
          const tplMatch = String(req?.template?.name || "").toLowerCase() === templateName.toLowerCase();
          const status = String(row?.status || "").toLowerCase();
          const wasAttempted = status !== "failed" && status !== "undeliverable" && status !== "undelivered";
          return toMatch && tplMatch && wasAttempted;
        });
        if (dupe) {
          console.warn("[whatsapp-send-message] duplicate suppressed", { toDigits, templateName, previous: dupe.created_at });
          return json({
            ok: false,
            duplicate: true,
            stage: "precheck",
            error: `Skipped: template "${templateName}" was already sent to this number at ${dupe.created_at}. Duplicate sends inside the dedupe window are blocked.`,
            previousSentAt: dupe.created_at,
          }, 200);
        }
      } catch (e) {
        console.warn("[whatsapp-send-message] dedupe check failed, allowing send", e);
      }
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
    const phoneNumberId =
      pickString([credentials, metadata], ["wa_phone_id", "phone_number_id"]) || "777081605497413";

    if (!accessToken) return json({ ok: false, error: "Meta access token missing. Save it on the WhatsApp connection or set WHATSAPP_ACCESS_TOKEN." }, 200);

    // ---- Media send branch (image / document) ----
    // Called when frontend attaches a file and clicks Send. We upload the raw
    // bytes to Meta's media endpoint, get a media_id, and send it.
    const rawType = String(payload.type || "").toLowerCase();
    if ((MEDIA_TYPES as readonly string[]).includes(rawType)) {
      try {
        const mediaBase64 = String(payload.mediaBase64 || "").trim();
        const defaultMime: Record<string, string> = {
          image: "image/jpeg", document: "application/octet-stream", sticker: "image/webp",
          video: "video/mp4", audio: "audio/ogg",
        };
        const defaultName: Record<string, string> = {
          image: "image.jpg", document: "file.bin", sticker: "sticker.webp",
          video: "video.mp4", audio: "audio.ogg",
        };
        const mediaMime = String(payload.mediaMime || "").trim() || defaultMime[rawType] || "application/octet-stream";
        const mediaFilename = String(payload.mediaFilename || "").trim() || defaultName[rawType] || "file.bin";
        const caption = String(payload.caption || "").trim();
        const mediaLink = String(payload.mediaUrl || payload.mediaLink || "").trim();
        if (!mediaBase64 && !mediaLink) return json({ ok: false, error: "mediaBase64 or mediaUrl is required for media sends" }, 200);

        let mediaObj: Record<string, unknown>;
        if (mediaBase64) {
          // Decode base64 → Uint8Array
          const bin = Uint8Array.from(atob(mediaBase64), (c) => c.charCodeAt(0));
          const blob = new Blob([bin], { type: mediaMime });

          const form = new FormData();
          form.append("messaging_product", "whatsapp");
          form.append("type", mediaMime);
          form.append("file", blob, mediaFilename);

          const uploadRes = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
          });
          const uploadJson = await uploadRes.json().catch(() => ({} as any));
          if (!uploadRes.ok || !uploadJson?.id) {
            return json({ ok: false, error: uploadJson?.error?.message || `Media upload failed (${uploadRes.status})`, details: uploadJson }, 200);
          }
          mediaObj = { id: uploadJson.id as string };
        } else {
          // Send by public HTTPS link (e.g. Supabase storage public URL)
          mediaObj = { link: mediaLink };
        }

        if (rawType === "document") { (mediaObj as any).filename = mediaFilename; if (caption) (mediaObj as any).caption = caption; }
        if ((rawType === "image" || rawType === "video") && caption) (mediaObj as any).caption = caption;


        const metaBody = {
          messaging_product: "whatsapp",
          to,
          type: rawType,
          [rawType]: mediaObj,
        };

        const sendRes = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(metaBody),
        });
        const sendJson = await sendRes.json().catch(() => ({} as any));
        if (!sendRes.ok || sendJson?.error) {
          return json({ ok: false, error: sendJson?.error?.message || `Send failed (${sendRes.status})`, details: sendJson }, 200);
        }
        const messageId: string | null = sendJson?.messages?.[0]?.id ?? null;

        // Persist outbound record (best-effort).
        try {
          const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const { data: thread } = await admin
            .from("whatsapp_threads")
            .upsert(
              {
                wa_phone: to,
                last_message: caption || `[${rawType}] ${mediaFilename}`,
                last_message_at: new Date().toISOString(),
              },
              { onConflict: "wa_phone" },
            )
            .select("id")
            .single();
          if (thread) {
            await admin.from("whatsapp_messages").insert({
              thread_id: thread.id,
              wa_message_id: messageId,
              direction: "out",
              text: caption || `[${rawType}] ${mediaFilename}`,
              payload: { request: { ...metaBody, source: messageSource }, response: sendJson, _media_id: (mediaObj as any).id ?? null, _media_link: (mediaObj as any).link ?? null, _media_kind: rawType, _media_filename: mediaFilename, _media_mime: mediaMime },
              status: "sent",
              status_updated_at: new Date().toISOString(),
              ...sendAttribution,

            });
          }
        } catch (persistErr) {
          console.error("[whatsapp-send-message] persist media outbound failed", persistErr);
        }

        return json({ ok: true, messageId, mediaId: (mediaObj as any).id ?? null, status: "sent", waResponse: sendJson });
      } catch (mediaErr) {
        const m = mediaErr instanceof Error ? mediaErr.message : "Unknown media error";
        return json({ ok: false, error: m }, 200);
      }
    }


    const countTemplateParams = (body: string): number => {
      const matches = (body || "").match(/\{\{\s*(\d+)\s*\}\}/g) || [];
      const nums = matches.map((m) => Number(m.replace(/[^\d]/g, ""))).filter((n) => Number.isFinite(n));
      return nums.length ? Math.max(...nums) : 0;
    };

    const strictBodyParamCounts: Record<string, number> = {
      appointment_booking_confirmation: 6,
      appointment_booking_confirm: 6,
      app_booking_confirm: 6,
      app_booking_confirm_v2: 5,
      invoice_sharing: 4,
      payment_sharing: 4,
      prescrip_downl: 1,
      prescription_download: 1,
      prescription_download_v2: 1,
      prescription_download_v3: 1,
      patient_payment_receipt: 4,
    };

    // NOTE: We no longer hardcode a required language per template. The approved
    // language is fetched dynamically from public.whatsapp_templates (populated
    // by the sync function from Meta) and matched against the approved list
    // returned by Meta at send-time. This mitigates Meta error 132001 caused by
    // static "en" vs "en_US" mismatches.

    // Optional DB-driven language hint. Populated below.
    let dbLanguageHint: string | null = null;

    let resolvedTemplateName = templateName;
    let resolvedLanguage = requestedLanguage;
    let hdr: { headerFormat: string; headerTextParams: number; urlButtonIndexes: number[] } =
      { headerFormat: "", headerTextParams: 0, urlButtonIndexes: [] };

    if (type === "template") {
      // 1) Fetch stored approved language from local template registry.
      try {
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
        const svc = createClient(supabaseUrl, serviceKey);
        const { data: tplRow } = await svc
          .from("whatsapp_templates")
          .select("language")
          .eq("name", templateName)
          .maybeSingle();
        const stored = String((tplRow as any)?.language || "").trim();
        if (stored) dbLanguageHint = stored;
      } catch (e) {
        console.warn("[whatsapp-send-message] language hint lookup failed", e);
      }

      const wabaId = pickString(
        [credentials, metadata, { env: envWaba }],
        ["wa_waba_id", "waba_id", "business_account_id", "whatsapp_business_account_id", "env"],
      );
      let wabaResolved: string | null = wabaId;
      if (!wabaResolved && phoneNumberId) {
        const lookup = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const lb = await lookup.json().catch(() => ({}));
        wabaResolved = lb?.whatsapp_business_account?.id || null;
      }
      if (!wabaResolved) return json({ ok: false, error: "Could not resolve WhatsApp Business Account ID for template lookup." }, 200);

      const tplRes = await fetch(
        `${GRAPH}/${wabaResolved}/message_templates?fields=name,status,language,components&name=${encodeURIComponent(templateName)}&limit=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const tplBody = await tplRes.json().catch(() => ({}));

      if (!tplRes.ok || tplBody?.error) {
        return json({
          ok: false,
          error: tplBody?.error?.message || `Meta template lookup failed with status ${tplRes.status}`,
          code: tplBody?.error?.code,
          details: tplBody,
        }, 200);
      }

      const matches: Array<{ name: string; status: string; language: string; components?: JsonRecord[] }> =
        Array.isArray(tplBody?.data)
          ? tplBody.data.filter((t: JsonRecord) => t.name === templateName)
          : [];
      if (matches.length === 0) {
        return json({
          ok: false,
          error: `Template "${templateName}" was not found in Meta for this WhatsApp Business Account. Template names are case-sensitive; select or type the exact approved Meta template name.`,
        }, 200);
      }

      const approved = matches.filter(t => String(t.status).toUpperCase() === "APPROVED");
      if (approved.length === 0) {
        const statuses = matches.map(t => `${t.name}:${t.status || "unknown"}`).join(", ");
        return json({
          ok: false,
          error: `Template "${templateName}" exists in Meta but is not approved. Current status: ${statuses || "unknown"}.`,
        }, 200);
      }

      // Dynamic language resolution with fallback chain:
      //   1. Explicit requestedLanguage from caller (exact, case-insensitive)
      //   2. DB stored language hint (exact)
      //   3. Base of requested/DB code (e.g. "en_US" -> "en") against approved
      //   4. First approved language
      const baseOf = (code: string) => (code || "").split(/[_-]/)[0].toLowerCase();
      const findExact = (code: string) =>
        code ? approved.find(t => (t.language || "").toLowerCase() === code.toLowerCase()) : undefined;
      const findByBase = (code: string) => {
        const b = baseOf(code);
        if (!b) return undefined;
        return approved.find(t => (t.language || "").toLowerCase() === b)
          || approved.find(t => baseOf(t.language || "") === b);
      };

      const selectedTemplate =
        findExact(requestedLanguage)
        || findExact(dbLanguageHint || "")
        || findByBase(requestedLanguage)
        || findByBase(dbLanguageHint || "")
        || approved[0];

      if (!selectedTemplate) {
        const languages = approved.map(t => t.language || "unknown").join(", ");
        return json({
          ok: false,
          error: `Could not resolve an approved language for template "${templateName}". Approved languages: ${languages || "none"}.`,
          code: 132001,
          requestPayload: {
            templateName,
            requestedLanguage,
            dbLanguageHint,
            approvedLanguages: approved.map(t => t.language || "unknown"),
          },
        }, 200);
      }
      resolvedTemplateName = selectedTemplate.name;
      resolvedLanguage = selectedTemplate.language;

      // Keep local registry in sync with what Meta actually approved so
      // subsequent sends match without needing the fallback chain.
      if (dbLanguageHint !== resolvedLanguage) {
        try {
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
          const svc = createClient(supabaseUrl, serviceKey);
          await svc
            .from("whatsapp_templates")
            .upsert({ name: resolvedTemplateName, language: resolvedLanguage }, { onConflict: "name" });
        } catch (e) {
          console.warn("[whatsapp-send-message] failed to persist resolved language", e);
        }
      }
      const components = Array.isArray(selectedTemplate.components) ? selectedTemplate.components : [];
      const headerComponent = components.find((c: JsonRecord) => String(c?.type).toUpperCase() === "HEADER");
      const bodyComponent = components.find((c: JsonRecord) => String(c?.type).toUpperCase() === "BODY");
      templateBodyText = String(bodyComponent?.text || "");

      const buttonsComponent = components.find((c: JsonRecord) => String(c?.type).toUpperCase() === "BUTTONS");

      const headerFormat = String(headerComponent?.format || "").toUpperCase();
      const headerTextParams = headerFormat === "TEXT" ? countTemplateParams(String(headerComponent?.text || "")) : 0;
      const expectedBodyParams = countTemplateParams(String(bodyComponent?.text || ""));
      const strictBodyParamCount = strictBodyParamCounts[resolvedTemplateName];

      const buttons: JsonRecord[] = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons : [];
      const urlButtonIndexes: number[] = [];
      buttons.forEach((b, i) => {
        if (String(b?.type).toUpperCase() === "URL" && countTemplateParams(String(b?.url || "")) > 0) {
          urlButtonIndexes.push(i);
        }
      });

      // Diagnostic: dump Meta-approved button structure right before send validation.
      // Confirms whether the current approved template actually has a dynamic URL button.
      console.log("[whatsapp-send-message] APPROVED_TEMPLATE_BUTTONS", {
        templateName: resolvedTemplateName,
        languageCode: resolvedLanguage,
        hasButtonsComponent: !!buttonsComponent,
        buttonCount: buttons.length,
        buttons: buttons.map((b, i) => ({
          index: i,
          type: b?.type,
          text: b?.text,
          url: b?.url,
          phone_number: b?.phone_number,
          urlParamCount: countTemplateParams(String(b?.url || "")),
          example: b?.example,
        })),
        urlButtonIndexes,
        suppliedButtonUrlParams: buttonUrlParams,
      });

      const expectedBodyCount = strictBodyParamCount ?? expectedBodyParams;
      const emptyBodyParamIndexes = bodyParams
        .map((value, index) => (value ? -1 : index + 1))
        .filter((index) => index > 0);
      const emptyHeaderParamIndexes = headerParams
        .map((value, index) => (value ? -1 : index + 1))
        .filter((index) => index > 0);
      const emptyButtonParamIndexes = buttonUrlParams
        .map((value, index) => (value ? -1 : index))
        .filter((index) => index >= 0);
      const validationLogBase = {
        templateName: resolvedTemplateName,
        languageCode: resolvedLanguage,
        approvedTemplate: {
          headerFormat,
          headerTextParams,
          bodyText: String(bodyComponent?.text || ""),
          expectedBodyParams,
          buttons,
          urlButtonIndexes,
        },
        headerParams,
        bodyParams,
        buttonUrlParams,
      };
      const validationErrors: string[] = [];
      if (strictBodyParamCount && expectedBodyParams !== strictBodyParamCount) {
        validationErrors.push(`approved BODY placeholder count ${expectedBodyParams} does not match strict required count ${strictBodyParamCount}`);
      }
      if (bodyParams.length !== expectedBodyCount) {
        validationErrors.push(`BODY parameter count must be exactly ${expectedBodyCount}; received ${bodyParams.length}`);
      }
      if (emptyBodyParamIndexes.length > 0) {
        validationErrors.push(`BODY parameter(s) cannot be empty: ${emptyBodyParamIndexes.join(", ")}`);
      }
      if (!headerComponent && headerParams.length > 0) {
        validationErrors.push(`HEADER parameters were supplied but template has no HEADER component`);
      }
      if (headerFormat !== "TEXT" && headerParams.length > 0) {
        validationErrors.push(`HEADER text parameters were supplied but template HEADER format is ${headerFormat || "none"}`);
      }
      if (headerTextParams !== headerParams.length) {
        validationErrors.push(`HEADER text parameter count must be exactly ${headerTextParams}; received ${headerParams.length}`);
      }
      if (emptyHeaderParamIndexes.length > 0) {
        validationErrors.push(`HEADER parameter(s) cannot be empty: ${emptyHeaderParamIndexes.join(", ")}`);
      }
      if (urlButtonIndexes.length === 0 && buttonUrlParams.some((value) => value.trim())) {
        validationErrors.push(`BUTTON parameters were supplied but template has no parameterized URL buttons`);
      }
      for (const [paramIndex, buttonIndex] of urlButtonIndexes.entries()) {
        if (!buttonUrlParams[paramIndex] || !String(buttonUrlParams[paramIndex]).trim()) {
          validationErrors.push(`URL button #${buttonIndex + 1} needs buttonUrlParams[${paramIndex}]`);
        }
      }
      for (const idx of emptyButtonParamIndexes) {
        if (urlButtonIndexes.includes(idx)) validationErrors.push(`BUTTON parameter at index ${idx} cannot be empty`);
      }
      if (validationErrors.length > 0) {
        console.error("[whatsapp-send-message] TEMPLATE_PAYLOAD_VALIDATION_ERROR", {
          ...validationLogBase,
          validationErrors,
        });
        return json({
          ok: false,
          stage: "template_payload_validation",
          error: `Template payload validation failed: ${validationErrors.join("; ")}.`,
          code: 132018,
          requestPayload: {
            ...validationLogBase,
            validationErrors,
          },
        }, 200);
      }
      if (strictBodyParamCount && expectedBodyParams !== strictBodyParamCount) {
        console.error("[whatsapp-send-message] strict template definition mismatch", {
          resolvedTemplateName,
          resolvedLanguage,
          metaExpectedBodyParams: expectedBodyParams,
          strictBodyParamCount,
          bodyTemplateText: String(bodyComponent?.text || ""),
        });
        return json({
          ok: false,
          error: `Template "${resolvedTemplateName}" in language "${resolvedLanguage}" resolved to ${expectedBodyParams} BODY parameter(s), but this send path requires exactly ${strictBodyParamCount}.`,
          code: 132018,
          requestPayload: {
            templateName: resolvedTemplateName,
            languageCode: resolvedLanguage,
            metaExpectedBodyParams: expectedBodyParams,
            strictBodyParamCount,
            suppliedBodyParams: bodyParams.length,
          },
        }, 200);
      }
      if (strictBodyParamCount && bodyParams.length !== strictBodyParamCount) {
        console.error("[whatsapp-send-message] strict supplied parameter mismatch", {
          resolvedTemplateName,
          resolvedLanguage,
          strictBodyParamCount,
          suppliedBodyParams: bodyParams.length,
          bodyParams,
        });
        return json({
          ok: false,
          error: `Template "${resolvedTemplateName}" requires exactly ${strictBodyParamCount} BODY parameter(s); received ${bodyParams.length}.`,
          code: 132018,
          requestPayload: {
            templateName: resolvedTemplateName,
            languageCode: resolvedLanguage,
            strictBodyParamCount,
            suppliedBodyParams: bodyParams.length,
            bodyParams,
          },
        }, 200);
      }
      if (headerTextParams > 0 && headerParams.length < headerTextParams) {
        return json({ ok: false, error: `Template "${resolvedTemplateName}" needs ${headerTextParams} HEADER text parameter(s). Pass headerParams.`, code: 132000 }, 200);
      }
      // Reject any caller-supplied header URL that is a Meta CDN sample, signed, or non-HTTPS.
      // Meta's sample header_handle URLs are time-limited and cause 131053 "Downloading media from weblink failed / 403 Forbidden".
      const isUnsafeMediaUrl = (u: string) => {
        if (!u) return false;
        if (!/^https:\/\//i.test(u)) return true;
        if (/scontent\.whatsapp\.net|fbcdn\.net|lookaside\.fbsbx/i.test(u)) return true;
        if (/[?&](oh|oe|_nc_sid|_nc_ohc|Signature|Expires|X-Amz-Signature|token)=/i.test(u)) return true;
        return false;
      };
      const dropped: string[] = [];
      if (isUnsafeMediaUrl(headerImageUrl)) { dropped.push(`headerImageUrl=${headerImageUrl}`); headerImageUrl = ""; }
      if (isUnsafeMediaUrl(headerVideoUrl)) { dropped.push(`headerVideoUrl=${headerVideoUrl}`); headerVideoUrl = ""; }
      if (isUnsafeMediaUrl(headerDocumentUrl)) { dropped.push(`headerDocumentUrl=${headerDocumentUrl}`); headerDocumentUrl = ""; }
      if (dropped.length) console.warn("[whatsapp-send-message] dropped unsafe caller-supplied media URL(s)", dropped);

      // Auto-resolve header media from stored template config when caller didn't pass a safe one.
      if ((headerFormat === "IMAGE" && !headerImageUrl) ||
          (headerFormat === "VIDEO" && !headerVideoUrl) ||
          (headerFormat === "DOCUMENT" && !headerDocumentUrl)) {
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
        const service = createClient(supabaseUrl, serviceKey);
        const { data: tplRow } = await service
          .from("whatsapp_templates")
          .select("header_media_url")
          .eq("name", resolvedTemplateName)
          .maybeSingle();
        const storedUrl = String((tplRow as any)?.header_media_url || "").trim();
        if (storedUrl && !isUnsafeMediaUrl(storedUrl)) {
          if (headerFormat === "IMAGE" && !headerImageUrl) headerImageUrl = storedUrl;
          if (headerFormat === "VIDEO" && !headerVideoUrl) headerVideoUrl = storedUrl;
          if (headerFormat === "DOCUMENT" && !headerDocumentUrl) headerDocumentUrl = storedUrl;
        } else if (storedUrl) {
          console.warn("[whatsapp-send-message] stored header_media_url is unsafe, ignoring", { resolvedTemplateName, storedUrl });
        }
      }

      // Fallback: for IMAGE header templates without a per-template header_media_url,
      // use the clinic logo (clinic_settings.logo_url) as the constant header image.
      if (headerFormat === "IMAGE" && !headerImageUrl) {
        try {
          const serviceKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
          const svc2 = createClient(supabaseUrl, serviceKey2);
          const { data: cs } = await svc2
            .from("clinic_settings")
            .select("logo_url")
            .limit(1)
            .maybeSingle();
          const logo = String((cs as any)?.logo_url || "").trim();
          if (logo && !isUnsafeMediaUrl(logo)) {
            headerImageUrl = logo;
            console.log("[whatsapp-send-message] using clinic logo as fallback header image", { resolvedTemplateName, logo });
          }
        } catch (e) {
          console.warn("[whatsapp-send-message] clinic logo fallback lookup failed", e);
        }
      }
      if (headerFormat === "IMAGE" && !headerImageUrl) {
        return json({ ok: false, error: `Template "${resolvedTemplateName}" needs a header IMAGE but no public HTTPS header_media_url is configured on public.whatsapp_templates. Upload the image to the clinic-assets bucket and store the public URL (https://.../storage/v1/object/public/clinic-assets/...).`, code: 132012 }, 200);
      }
      if (headerFormat === "VIDEO" && !headerVideoUrl) {
        return json({ ok: false, error: `Template "${resolvedTemplateName}" needs a header VIDEO but no public HTTPS header_media_url is configured on public.whatsapp_templates.`, code: 132012 }, 200);
      }
      if (headerFormat === "DOCUMENT" && !headerDocumentUrl) {
        return json({ ok: false, error: `Template "${resolvedTemplateName}" needs a header DOCUMENT but no public HTTPS header_media_url is configured on public.whatsapp_templates.`, code: 132012 }, 200);
      }

      // Pre-flight reachability check — HEAD (with GET fallback) using Meta's UA. Refuse to call
      // Meta if the URL is not publicly reachable, so we return a clean validation error
      // instead of Meta's 131053 "Downloading media from weblink failed" appearing on the webhook.
      const mediaUrl = headerImageUrl || headerVideoUrl || headerDocumentUrl;
      if (mediaUrl) {
        const ua = { "User-Agent": "facebookexternalhit/1.1" };
        let reachStatus = 0;
        let reachCT: string | null = null;
        try {
          const h = await fetch(mediaUrl, { method: "HEAD", headers: ua, redirect: "manual" });
          reachStatus = h.status;
          reachCT = h.headers.get("content-type");
          if (!h.ok || (h.status >= 300 && h.status < 400)) {
            const g = await fetch(mediaUrl, { method: "GET", headers: ua, redirect: "manual" });
            reachStatus = g.status;
            reachCT = g.headers.get("content-type");
            try { await g.body?.cancel(); } catch { /* ignore */ }
          }
        } catch (e) {
          console.error("[whatsapp-send-message] media preflight fetch failed", { mediaUrl, error: String(e) });
          return json({ ok: false, error: `Header media URL is not reachable: ${String(e)}. Store a publicly accessible HTTPS URL in whatsapp_templates.header_media_url (e.g. https://<project>.supabase.co/storage/v1/object/public/clinic-assets/whatsapp/<file>).`, code: 131053, mediaUrl }, 200);
        }
        if (reachStatus !== 200) {
          console.error("[whatsapp-send-message] media preflight non-200", { mediaUrl, status: reachStatus, contentType: reachCT });
          return json({ ok: false, error: `Header media URL returned HTTP ${reachStatus} on preflight. Meta would fail with 131053 (Downloading media from weblink failed). URL must be a public, unsigned, unredirected HTTPS object returning 200. URL: ${mediaUrl}`, code: 131053, mediaUrl, preflightStatus: reachStatus }, 200);
        }
        console.log("[whatsapp-send-message] media preflight OK", { templateName: resolvedTemplateName, mediaUrl, status: reachStatus, contentType: reachCT });
      }


      if (strictBodyParamCount) bodyParams = bodyParams.slice(0, strictBodyParamCount);
      else if (expectedBodyParams > 0) bodyParams = bodyParams.slice(0, expectedBodyParams);
      if (headerTextParams > 0) headerParams = headerParams.slice(0, headerTextParams);

      hdr = { headerFormat, headerTextParams, urlButtonIndexes };

      console.log("[whatsapp-send-message] template resolved", {
        resolvedTemplateName, resolvedLanguage, headerFormat, headerTextParams,
        expectedBodyParams, urlButtonIndexes, suppliedBodyParams: bodyParams.length,
      });
    }



    const buildComponents = () => {
      const comps: JsonRecord[] = [];
      if (hdr.headerFormat === "TEXT" && hdr.headerTextParams > 0) {
        comps.push({ type: "header", parameters: headerParams.map((t) => ({ type: "text", text: t })) });
      } else if (hdr.headerFormat === "IMAGE") {
        comps.push({ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] });
      } else if (hdr.headerFormat === "VIDEO") {
        comps.push({ type: "header", parameters: [{ type: "video", video: { link: headerVideoUrl } }] });
      } else if (hdr.headerFormat === "DOCUMENT") {
        comps.push({ type: "header", parameters: [{ type: "document", document: { link: headerDocumentUrl } }] });
      }
      if (bodyParams.length > 0) {
        comps.push({ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) });
      }
      for (const [paramIndex, buttonIndex] of hdr.urlButtonIndexes.entries()) {
        comps.push({
          type: "button",
          sub_type: "url",
          index: String(buttonIndex),
          parameters: [{ type: "text", text: String(buttonUrlParams[paramIndex]) }],
        });
      }
      // Hardcoded static button parameters for templates whose Meta definition
      // uses static (non-parameterized) URL buttons but which we still want to
      // explicitly emit in the payload so Meta never silently drops them.
      const HARDCODED_BUTTON_COMPONENTS: Record<string, JsonRecord[]> = {
        appointment_booking_confirm: [
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              { type: "text", text: "https://maps.google.com/?cid=2181232041685824549" },
            ],
          },
        ],
        // app_booking_confirm: BODY only. Location + Call Now buttons are fully
        // static in Meta's template definition — do NOT emit button components.

      };
      const hardcoded = HARDCODED_BUTTON_COMPONENTS[resolvedTemplateName];
      if (hardcoded && hdr.urlButtonIndexes.length === 0) {
        for (const c of hardcoded) comps.push(c);
      }
      return comps;
    };


    const buildMetaBody = (language: string) => {
      if (type !== "template") {
        return { messaging_product: "whatsapp", to, type: "text", text: { body: text } };
      }
      const comps = buildComponents();
      return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: resolvedTemplateName,
          language: { code: language },
          ...(comps.length ? { components: comps } : {}),
        },
      };
    };

    const metaBody = buildMetaBody(resolvedLanguage);
    const finalComponents = type === "template" && Array.isArray((metaBody as JsonRecord)?.template?.components)
      ? (metaBody as JsonRecord).template.components
      : [];

    const finalHeaderParameters = finalComponents
      .filter((c: JsonRecord) => String(c?.type).toLowerCase() === "header")
      .flatMap((c: JsonRecord) => Array.isArray(c?.parameters) ? c.parameters : []);
    const finalBodyParameters = finalComponents
      .filter((c: JsonRecord) => String(c?.type).toLowerCase() === "body")
      .flatMap((c: JsonRecord) => Array.isArray(c?.parameters) ? c.parameters : []);
    const finalButtonParameters = finalComponents
      .filter((c: JsonRecord) => String(c?.type).toLowerCase() === "button")
      .map((c: JsonRecord) => ({ index: c?.index, sub_type: c?.sub_type, parameters: c?.parameters || [] }));

    console.log("[whatsapp-send-message] Template Name:", resolvedTemplateName);
    console.log("[whatsapp-send-message] Language:", resolvedLanguage);
    console.log("[whatsapp-send-message] Header Parameters:", JSON.stringify(finalHeaderParameters));
    console.log("[whatsapp-send-message] Body Parameters:", JSON.stringify(finalBodyParameters));
    console.log("[whatsapp-send-message] Button Parameters:", JSON.stringify(finalButtonParameters));
    console.log("[whatsapp-send-message] Final Components:", JSON.stringify(finalComponents));
    console.log("[whatsapp-send-message] Final Meta Payload:", JSON.stringify(metaBody));

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        templateName: resolvedTemplateName,
        languageCode: resolvedLanguage,
        headerParameters: finalHeaderParameters,
        bodyParameters: finalBodyParameters,
        buttonParameters: finalButtonParameters,
        finalComponents,
        finalMetaPayload: metaBody,
      }, 200);
    }

    // Structured send log (never logs access token)
    console.log("[whatsapp-send-message] outgoing", JSON.stringify({
      phoneNumberId,
      wabaId: pickString([credentials, metadata, { env: envWaba }], ["wa_waba_id", "waba_id", "business_account_id", "whatsapp_business_account_id", "env"]),
      to,
      templateName: resolvedTemplateName,
      languageCode: resolvedLanguage,
      type,
      payload: metaBody,
    }));

    const doMetaSend = async (body: JsonRecord) => {
      const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const rt = await r.text();
      let parsed: JsonRecord = {};
      try { parsed = rt ? JSON.parse(rt) : {}; } catch { parsed = {}; }
      return { r, rt, parsed };
    };

    let res: Response;
    let rawText = "";
    let waResponse: JsonRecord = {};
    try {
      ({ r: res, rt: rawText, parsed: waResponse } = await doMetaSend(metaBody));

      // Fallback for Meta error 132001 (template/language mismatch): retry once
      // with the base language (strip "_US" / "_UK" suffixes), then with "en".
      if (type === "template" && (!res.ok || waResponse?.error) && Number(waResponse?.error?.code) === 132001) {
        const tried = new Set<string>([resolvedLanguage.toLowerCase()]);
        const base = resolvedLanguage.split(/[_-]/)[0];
        const candidates = [base, "en"].filter(c => c && !tried.has(c.toLowerCase()));
        for (const alt of candidates) {
          console.warn("[whatsapp-send-message] retrying with fallback language", { from: resolvedLanguage, to: alt });
          const altBody = buildMetaBody(alt);
          const attempt = await doMetaSend(altBody);
          tried.add(alt.toLowerCase());
          if (attempt.r.ok && !attempt.parsed?.error) {
            res = attempt.r;
            rawText = attempt.rt;
            waResponse = attempt.parsed;
            resolvedLanguage = alt;
            break;
          }
          if (Number(attempt.parsed?.error?.code) !== 132001) {
            res = attempt.r;
            rawText = attempt.rt;
            waResponse = attempt.parsed;
            break;
          }
        }
      }
    } catch (netErr) {
      const message = netErr instanceof Error ? netErr.message : String(netErr);
      console.error("[whatsapp-send-message] META_ERROR network", { message });
      return json({
        ok: false,
        stage: "meta_network",
        error: `Network error calling Meta Graph API: ${message}`,
        details: { message },
      }, 200);
    }

    console.log("[whatsapp-send-message] response", JSON.stringify({
      httpStatus: res.status,
      ok: res.ok,
      body: waResponse,
      error: waResponse?.error ?? null,
    }));


    if (!res.ok || waResponse?.error) {
      const metaErr = waResponse?.error || {};
      if (Number(metaErr.code) === 190) {
        const t = accessToken || "";
        console.error("[whatsapp-send-message] META_ERROR invalid token", {
          tokenLength: t.length,
          tokenPreview: t ? `${t.slice(0, 4)}…${t.slice(-4)}` : "",
        });
      }
      // Auto-blacklist undeliverable recipients (131026) so future campaigns skip them.
      if (Number(metaErr.code) === 131026) {
        try {
          const nowIso = new Date().toISOString();
          const { data: existing } = await guard
            .from("whatsapp_blocked_numbers")
            .select("id, failure_count")
            .eq("wa_phone", toDigits)
            .maybeSingle();
          if (existing?.id) {
            await guard.from("whatsapp_blocked_numbers").update({
              blocked: true,
              failure_count: (existing.failure_count ?? 0) + 1,
              last_failed_at: nowIso,
              error_code: 131026,
              reason: metaErr.message || "Message undeliverable — recipient is not on WhatsApp.",
              source: "send_api",
            }).eq("id", existing.id);
          } else {
            await guard.from("whatsapp_blocked_numbers").insert({
              wa_phone: toDigits,
              blocked: true,
              error_code: 131026,
              reason: metaErr.message || "Message undeliverable — recipient is not on WhatsApp.",
              source: "send_api",
              first_failed_at: nowIso,
              last_failed_at: nowIso,
            });
          }
          console.log("[whatsapp-send-message] blacklisted 131026 recipient", toDigits);
        } catch (blErr) {
          console.error("[whatsapp-send-message] blacklist write failed", blErr);
        }
      }

      console.error("[whatsapp-send-message] META_ERROR", {
        httpStatus: res.status,
        rawText,
      });

      const friendly = (type === "template" && Number(metaErr.code) === 132001)
        ? `Meta could not find template "${resolvedTemplateName}" in approved language "${resolvedLanguage}" for this phone number. Confirm the template belongs to the same WhatsApp Business Account and is approved in Meta.`
        : (metaErr.message || `Meta API error ${res.status}`);

      // Return 200 so supabase-js delivers this body as `data` to the client
      // instead of throwing FunctionsHttpError and hiding the JSON.
      return json({
        ok: false,
        stage: "meta_send",
        httpStatus: res.status,
        error: friendly,
        code: metaErr.code ?? null,
        subcode: metaErr.error_subcode ?? null,
        type: metaErr.type ?? null,
        fbtrace_id: metaErr.fbtrace_id ?? waResponse?.fbtrace_id ?? null,
        error_data: metaErr.error_data ?? null,
        raw: waResponse,
        rawText: rawText && !Object.keys(waResponse).length ? rawText : undefined,
        requestPayload: {
          templateName: resolvedTemplateName,
          languageCode: resolvedLanguage,
          to,
          type,
          bodyParamCount: bodyParams.length,
          headerFormat: hdr.headerFormat,
        },
      }, 200);
    }

    const messageId: string | null = waResponse?.messages?.[0]?.id ?? null;
    const initialStatus: string = String(waResponse?.messages?.[0]?.message_status || "accepted").toLowerCase();

    // Persist outbound record so UI can track delivery via webhook status updates.
    try {
      const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey);
      const waPhone = to.replace(/\D/g, "");
      const renderTemplateBody = (tpl: string, params: string[]) =>
        tpl.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
          const v = params[Number(n) - 1];
          return v == null || v === "" ? `{{${n}}}` : String(v);
        });
      const renderedTemplate = templateBodyText
        ? renderTemplateBody(templateBodyText, bodyParams)
        : "";
      const previewText = type === "template"
        ? (renderedTemplate || `Sent template: ${resolvedTemplateName}`)
        : text;

      const { data: thread } = await service
        .from("whatsapp_threads")
        .upsert(
          { wa_phone: waPhone, last_message: previewText, last_message_at: new Date().toISOString() },
          { onConflict: "wa_phone" },
        )
        .select("id")
        .single();
      if (thread?.id && messageId) {
        await service.from("whatsapp_messages").insert({
          thread_id: thread.id,
          wa_message_id: messageId,
          direction: "out",
          text: previewText,
          payload: { request: { ...metaBody, source: messageSource }, response: waResponse },
          status: initialStatus,
          status_updated_at: new Date().toISOString(),
          ...sendAttribution,

        });
      }
    } catch (persistErr) {
      console.error("[whatsapp-send-message] persist outbound failed", persistErr);
    }

    return json({ ok: true, messageId, status: initialStatus, waResponse });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 500);
  }
});
