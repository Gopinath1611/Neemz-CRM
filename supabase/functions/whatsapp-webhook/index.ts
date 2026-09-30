import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with
 * the Meta App Secret). Strictly enforced: missing secret, missing header or a
 * mismatching digest all reject the request.
 */
async function hmacHex(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  return Array.from(sigBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, header: string | null): Promise<{ ok: boolean; reason?: string }> {
  // Primary secret plus optional secondary — lets us accept events signed by
  // either Meta app while webhook subscriptions are migrated between apps.
  const configured = [
    Deno.env.get("WHATSAPP_APP_SECRET"),
    Deno.env.get("WHATSAPP_APP_SECRET_SECONDARY"),
    Deno.env.get("META_APP_SECRET"),
  ].filter((s): s is string => !!s);
  if (!configured.length) return { ok: false, reason: "app_secret_not_configured" };
  if (!header || !header.startsWith("sha256=")) return { ok: false, reason: "missing_signature" };

  const provided = header.slice("sha256=".length).trim().toLowerCase();
  // Accept each secret with or without stray whitespace/quotes (common paste artefacts).
  const candidates = Array.from(new Set(
    configured.flatMap((raw) => [
      raw,
      raw.trim(),
      raw.trim().replace(/^["']|["']$/g, ""),
    ]).filter(Boolean),
  ));

  for (const secret of candidates) {
    const expected = await hmacHex(secret, rawBody);
    if (expected.length !== provided.length) continue;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    if (diff === 0) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

/** Delivery-funnel ranking so out-of-order receipts never downgrade a status. */
const STATUS_RANK: Record<string, number> = {
  accepted: 1,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  undeliverable: 5,
  deleted: 5,
};

function normalizeMessageStatus(status: unknown): string {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "undelivered" || s === "undeliverable") return "failed";
  return s;
}


/** Meta template review results → our whatsapp_templates.status values. */
function normalizeTemplateStatus(status: unknown): string | null {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "pending" || s === "pending_deletion" || s === "in_appeal") return "pending";
  if (s === "paused" || s === "disabled" || s === "flagged") return s;
  return s;
}

async function handleTemplateStatusUpdate(value: Record<string, any>) {
  const name: string = String(value?.message_template_name || "").trim();
  const language: string | null = value?.message_template_language
    ? String(value.message_template_language)
    : null;
  const status = normalizeTemplateStatus(value?.event ?? value?.new_template_status ?? value?.message_template_status);
  if (!name || !status) {
    console.warn("[whatsapp-webhook] template update ignored (missing name/status)", JSON.stringify(value));
    return;
  }

  let q = supabase
    .from("whatsapp_templates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("name", name);
  if (language) q = q.eq("language", language);

  const { data, error } = await q.select("id");
  if (error) {
    console.error("[whatsapp-webhook] template status update error", error, { name, language, status });
    return;
  }
  if (!data?.length && language) {
    // Locale mismatch (e.g. stored as en, Meta reports en_US) — fall back to name only.
    const { error: fbErr } = await supabase
      .from("whatsapp_templates")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("name", name);
    if (fbErr) console.error("[whatsapp-webhook] template fallback update error", fbErr, { name, status });
  }
  console.log("[whatsapp-webhook] template status synced", { name, language, status, matched: data?.length ?? 0 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // ---- Meta webhook verification (GET) ----
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    console.log("[whatsapp-webhook] verify", { mode, tokenMatches: token === expected });
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  // ---- Incoming events (POST) ----
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();

  const sig = await verifySignature(rawBody, req.headers.get("x-hub-signature-256"));
  if (!sig.ok) {
    // Diagnostic context (no secrets): which WABA/phone/app these events claim
    // to concern, so we can tell whether they come from a different Meta app.
    let diag: Record<string, unknown> = {};
    try {
      const b = JSON.parse(rawBody);
      const entries = Array.isArray(b?.entry) ? b.entry : [];
      diag = {
        object: b?.object ?? null,
        entryIds: entries.map((e: any) => e?.id ?? null),
        fields: entries.flatMap((e: any) =>
          (Array.isArray(e?.changes) ? e.changes : []).map((c: any) => c?.field ?? null)),
        phoneNumberIds: entries.flatMap((e: any) =>
          (Array.isArray(e?.changes) ? e.changes : []).map((c: any) => c?.value?.metadata?.phone_number_id ?? null)),
      };
    } catch { /* body not JSON — nothing to add */ }
    console.error("[whatsapp-webhook] rejected unsigned/invalid payload", { reason: sig.reason, ...diag });
    return new Response(JSON.stringify({ error: "invalid signature", reason: sig.reason }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (e) {
    console.error("[whatsapp-webhook] malformed JSON payload", e, rawBody.slice(0, 500));
    // 200 so Meta does not retry an unparseable payload forever.
    return new Response(JSON.stringify({ ok: false, error: "malformed payload" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body?.object !== "whatsapp_business_account" && body?.entry === undefined) {
    console.warn("[whatsapp-webhook] unexpected payload shape", JSON.stringify(body).slice(0, 500));
  }
  console.log("[whatsapp-webhook] POST payload", JSON.stringify(body));

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  let inserted = 0;
  let statusUpdates = 0;
  let templateUpdates = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const field = String(change?.field || "");
      const value = change?.value ?? {};

      // ---- Template review results (approved / rejected / paused) ----
      if (field === "message_template_status_update" || field === "template_status_update") {
        try {
          await handleTemplateStatusUpdate(value);
          templateUpdates++;
        } catch (e) {
          console.error("[whatsapp-webhook] template handler error", e);
          errors.push("template_handler");
        }
        continue;
      }

      const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
      const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
      const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];

      if (statuses.length) {
        console.log("[whatsapp-webhook] statuses received", statuses.length, JSON.stringify(statuses));
        for (const st of statuses) {
          const waMessageId: string | null = st?.id ?? null;
          const status: string = normalizeMessageStatus(st?.status);
          if (!waMessageId || !status) {
            console.warn("[whatsapp-webhook] status skipped (missing id/status)", JSON.stringify(st));
            continue;
          }
          // Meta's receipt timestamp (seconds) when present, else now.
          const tsSec = Number(st?.timestamp);
          const statusTs = Number.isFinite(tsSec) && tsSec > 0
            ? new Date(tsSec * 1000).toISOString()
            : new Date().toISOString();

          const { data: current } = await supabase
            .from("whatsapp_messages")
            .select("id, status")
            .eq("wa_message_id", waMessageId)
            .maybeSingle();

          const currentRank = STATUS_RANK[normalizeMessageStatus(current?.status)] ?? 0;
          const nextRank = STATUS_RANK[status] ?? 0;
          if (current && nextRank && currentRank > nextRank) {
            console.log("[whatsapp-webhook] status downgrade ignored", {
              waMessageId,
              current: current.status,
              incoming: status,
            });
            continue;
          }

          // Extract structured error info from Meta's error payload (failed statuses).
          const stErrors: any[] = Array.isArray(st?.errors) ? st.errors : [];
          const firstErr = stErrors[0];
          const errCode = firstErr?.code != null && Number.isFinite(Number(firstErr.code))
            ? Number(firstErr.code)
            : null;
          const errMsg = firstErr?.error_data?.details || firstErr?.title || firstErr?.message || null;

          const { error: updErr } = await supabase
            .from("whatsapp_messages")
            .update({
              status,
              status_updated_at: statusTs,
              // Per-stage timestamps (Meta's event timestamp).
              ...(status === "sent" ? { sent_at: statusTs } : {}),
              ...(status === "delivered" ? { delivered_at: statusTs } : {}),
              ...(status === "read" ? { read_at: statusTs } : {}),
              ...(stErrors.length ? { error: stErrors } : {}),
              ...(errCode != null ? { error_code: errCode } : {}),
              ...(errMsg ? { error_message: errMsg } : {}),
            })
            .eq("wa_message_id", waMessageId);
          if (updErr) {
            console.error("[whatsapp-webhook] status update error", updErr, { waMessageId, status });
            errors.push("status_update");
          } else {
            statusUpdates++;
            console.log("[whatsapp-webhook] status updated", { waMessageId, status, statusTs, matched: !!current });
          }


          // ---- Auto-blacklist undeliverable recipients (Meta code 131026) ----
          if (status === "failed" || status === "undeliverable") {
            const errArr: any[] = Array.isArray(st?.errors) ? st.errors : [];
            const has131026 = errArr.some((e) => Number(e?.code) === 131026);
            const recipient = String(st?.recipient_id || "").replace(/\D/g, "");
            if (has131026 && recipient) {
              try {
                const reason = errArr.find((e) => Number(e?.code) === 131026);
                const nowIso = new Date().toISOString();
                const { data: existing } = await supabase
                  .from("whatsapp_blocked_numbers")
                  .select("id, failure_count")
                  .eq("wa_phone", recipient)
                  .maybeSingle();
                const payload = {
                  blocked: true,
                  error_code: 131026,
                  reason: reason?.error_data?.details || reason?.title || reason?.message
                    || "Message undeliverable — recipient is not on WhatsApp.",
                  source: "webhook",
                  last_failed_at: nowIso,
                };
                if (existing?.id) {
                  await supabase
                    .from("whatsapp_blocked_numbers")
                    .update({ ...payload, failure_count: (existing.failure_count ?? 0) + 1 })
                    .eq("id", existing.id);
                } else {
                  await supabase
                    .from("whatsapp_blocked_numbers")
                    .insert({ ...payload, wa_phone: recipient, first_failed_at: nowIso });
                }
                console.log("[whatsapp-webhook] blacklisted recipient (131026)", recipient);
              } catch (blErr) {
                console.error("[whatsapp-webhook] blacklist write failed", blErr);
                errors.push("blacklist_write");
              }
            }
          }
        }

      }

      for (const msg of messages) {
        try {
          const fromPhone: string = String(msg?.from || "").trim();
          if (!fromPhone) continue;
          const contact = contacts.find((c) => c?.wa_id === fromPhone);
          const displayName = contact?.profile?.name || null;
          const waMessageId: string | null = msg?.id ?? null;

          const text: string =
            msg?.text?.body ??
            msg?.button?.text ??
            msg?.interactive?.button_reply?.title ??
            msg?.interactive?.list_reply?.title ??
            (msg?.document?.filename ? `[document] ${msg.document.filename}` : (msg?.type ? `[${msg.type}]` : ""));

          // For media messages, resolve the Meta media URL so we have a record of it.
          // The URL itself is short-lived + requires a bearer token, so the frontend
          // reads media via the whatsapp-media proxy using this media_id.
          const mediaTypes = ["image", "sticker", "video", "audio", "document"] as const;
          const mediaKind = mediaTypes.find((t) => msg?.[t]);
          let mediaId: string | null = null;
          let mediaUrl: string | null = null;
          let mediaMime: string | null = null;
          let mediaFilename: string | null = null;
          if (mediaKind) {
            const mObj = msg?.[mediaKind] || {};
            mediaId = mObj?.id ?? null;
            mediaMime = mObj?.mime_type ?? null;
            mediaFilename = mObj?.filename ?? null;
            const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
            if (mediaId && token) {
              try {
                const r = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(mediaId)}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (r.ok) {
                  const info = await r.json();
                  mediaUrl = info?.url ?? null;
                  if (!mediaMime) mediaMime = info?.mime_type ?? null;
                }
              } catch (e) {
                console.warn("[whatsapp-webhook] media url resolve failed", e);
              }
            }
          }
          const enrichedPayload = mediaKind
            ? { ...msg, _media_kind: mediaKind, _media_id: mediaId, _media_url: mediaUrl, _media_mime: mediaMime, _media_filename: mediaFilename }
            : msg;


          // Upsert thread
          const { data: thread, error: threadErr } = await supabase
            .from("whatsapp_threads")
            .upsert(
              {
                wa_phone: fromPhone,
                display_name: displayName ?? undefined,
                last_message: text,
                last_message_at: new Date().toISOString(),
              },
              { onConflict: "wa_phone" },
            )
            .select("id, unread_count")
            .single();

          if (threadErr || !thread) {
            console.error("[whatsapp-webhook] thread upsert error", threadErr);
            errors.push("thread_upsert");
            continue;
          }

          // Bump unread
          await supabase
            .from("whatsapp_threads")
            .update({ unread_count: (thread.unread_count ?? 0) + 1 })
            .eq("id", thread.id);

          // Insert message (idempotent via wa_message_id UNIQUE)
          const { error: msgErr } = await supabase
            .from("whatsapp_messages")
            .insert({
              thread_id: thread.id,
              wa_message_id: waMessageId,
              direction: "in",
              text,
              payload: enrichedPayload,
            });


          if (msgErr) {
            // Duplicate delivery is fine
            if (!String(msgErr.message || "").toLowerCase().includes("duplicate")) {
              console.error("[whatsapp-webhook] message insert error", msgErr);
              errors.push("message_insert");
            }
          } else {
            inserted++;
          }
        } catch (e) {
          console.error("[whatsapp-webhook] handler error", e);
          errors.push("message_handler");
        }
      }
    }
  }

  // Record webhook health so the UI can surface a broken status pipeline
  // (e.g. signature rejections mean this stamp never advances).
  try {
    const nowIso = new Date().toISOString();
    const { data: waApp } = await supabase
      .from("connected_apps")
      .select("id, metadata")
      .eq("platform", "WhatsApp Business API")
      .maybeSingle();
    if (waApp?.id) {
      const prevMeta = waApp.metadata && typeof waApp.metadata === "object" ? waApp.metadata : {};
      await supabase
        .from("connected_apps")
        .update({
          metadata: {
            ...prevMeta,
            last_webhook_received_at: nowIso,
            ...(statusUpdates > 0 ? { last_status_event_at: nowIso } : {}),
          },
        })
        .eq("id", waApp.id);
    }
  } catch (healthErr) {
    console.warn("[whatsapp-webhook] health stamp failed", healthErr);
  }

  console.log("[whatsapp-webhook] processed", { inserted, statusUpdates, templateUpdates, errors: errors.length });
  return new Response(JSON.stringify({ ok: true, inserted, statusUpdates, templateUpdates, errors }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
