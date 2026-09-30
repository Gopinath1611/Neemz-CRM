import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enrichPageAccessTokenError, resolveMetaPageAccessToken } from "../_shared/metaPageToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function postJSON(url: string, body: Record<string, any>) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data?.error?.message || data?.error || `HTTP ${r.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let platformForError = "";
  try {
    const body = await req.json();
    const { platform, type, threadId, message } = body || {};
    platformForError = String(platform || "");

    if (!platform || !type || !threadId || !message) {
      return new Response(JSON.stringify({ error: "platform, type, threadId, message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fbToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
    const fbPage = Deno.env.get("META_PAGE_ID");

    if (platform === "facebook" || platform === "instagram") {
      if (!fbToken || !fbPage) throw new Error("Meta page not configured");
      const { token, pageId } = await resolveMetaPageAccessToken(fbToken, fbPage);

      if (type === "comment" || type === "mention" || type === "review") {
        // Reply to a comment (FB & IG both use {comment-id}/comments OR /replies on IG)
        const endpoint = platform === "instagram"
          ? `https://graph.facebook.com/v19.0/${threadId}/replies?access_token=${token}`
          : `https://graph.facebook.com/v19.0/${threadId}/comments?access_token=${token}`;
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ message }),
        });
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`);
        return new Response(JSON.stringify({ ok: true, id: data.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (type === "message") {
        // Direct message back to the user. threadId here is the recipient PSID/IGSID.
        const url = `https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${token}`;
        const payload: Record<string, any> = {
          recipient: { id: threadId },
          message: { text: message },
          messaging_type: "RESPONSE",
        };
        const data = await postJSON(url, payload);
        return new Response(JSON.stringify({ ok: true, id: data.message_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (platform === "youtube") {
      // YouTube write API requires OAuth user token, not an API key.
      throw new Error("YouTube replies need OAuth login. Use the 'Open' link to reply on YouTube directly.");
    }

    throw new Error(`Unsupported platform/type combination: ${platform}/${type}`);
  } catch (e) {
    let msg = (e as Error).message;
    // Enrich Meta permission failures with actionable scope guidance
    if (/\(#200\)|\(#230\)|permission|appropriate role/i.test(msg)) {
      const scope = msg.includes("instagram") || platformForError === "instagram"
        ? "instagram_manage_messages"
        : "pages_messaging";
      msg = `${msg} — grant '${scope}' to the Meta token (and make sure the connected account is a Page admin).`;
      console.error("[social-reply] permission failure:", msg);
    }
    msg = enrichPageAccessTokenError(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
