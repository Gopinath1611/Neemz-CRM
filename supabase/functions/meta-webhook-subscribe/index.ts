import { enrichPageAccessTokenError, resolveMetaPageAccessToken } from "../_shared/metaPageToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";

// Instant-messaging + comment + lead-form events we need for the Unified Inbox
// and real-time Meta lead ingestion.
const SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "leadgen",
];

// Requires the extra `pages_manage_metadata` permission on the Meta token.
const OPTIONAL_FIELDS = ["feed"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const configuredToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const configuredPage = Deno.env.get("META_PAGE_ID");
  if (!configuredToken || !configuredPage) {
    return json({ ok: false, error: "META_PAGE_ACCESS_TOKEN / META_PAGE_ID not configured" }, 400);
  }

  try {
    const { token, pageId, pageName, instagramBusinessAccountId } =
      await resolveMetaPageAccessToken(configuredToken, configuredPage);

    const result: Record<string, unknown> = { pageId, pageName, instagramBusinessAccountId };

    if (req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      const fields: string[] = Array.isArray(payload?.fields) && payload.fields.length
        ? payload.fields
        : SUBSCRIBED_FIELDS;
      const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: fields.join(","),
          access_token: token,
        }),
      });
      const j = await r.json().catch(() => ({}));
      result.requestedFields = fields;
      result.subscribe = j?.error ? { ok: false, error: j.error.message } : { ok: true, response: j };
    }


    // Always report current subscription state
    const stateRes = await fetch(
      `${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
    );
    const state = await stateRes.json().catch(() => ({}));
    const apps = Array.isArray(state?.data) ? state.data : [];
    const fields: string[] = apps.flatMap((a: any) => a?.subscribed_fields || []);
    result.subscribedApps = apps.map((a: any) => ({ name: a?.name, fields: a?.subscribed_fields }));
    result.missingFields = SUBSCRIBED_FIELDS.filter((f) => !fields.includes(f));
    result.optionalMissingFields = OPTIONAL_FIELDS.filter((f) => !fields.includes(f));
    result.messagesSubscribed = fields.includes("messages");

    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: enrichPageAccessTokenError((e as Error).message) }, 200);
  }
});
