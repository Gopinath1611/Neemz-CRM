import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // ---- Meta webhook verification (GET) ----
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  // ---- Incoming Meta events (POST): Instagram + Facebook Page ----
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "malformed payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // `object` tells us the source: "instagram" | "page"
  const platform: "instagram" | "facebook" = body?.object === "page" ? "facebook" : "instagram";
  const pageId = Deno.env.get("META_PAGE_ID") || "";

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const rows: Record<string, unknown>[] = [];

  for (const entry of entries) {
    // Direct messages / Page inbox messages
    for (const ev of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      if (ev?.message?.is_echo) continue; // skip our own replies
      const senderId = ev?.sender?.id ?? null;
      if (pageId && senderId === pageId) continue; // skip page-authored messages
      const text = ev?.message?.text ?? "";
      if (!text && !ev?.message?.attachments) continue;
      rows.push({
        platform,
        sender_name: senderId,
        message: text || "[attachment]",
        message_type: "dm",
        status: "new",
      });
    }

    // Comments: IG uses field "comments", FB Page uses field "feed"
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const field = ch?.field;
      const v = ch?.value ?? {};
      if (field === "comments") {
        rows.push({
          platform,
          sender_name: v?.from?.username ?? v?.from?.id ?? null,
          message: v?.text ?? "",
          message_type: "comment",
          status: "new",
        });
      } else if (field === "feed" && v?.item === "comment" && v?.verb !== "remove") {
        if (pageId && v?.from?.id === pageId) continue;
        rows.push({
          platform: "facebook",
          sender_name: v?.from?.name ?? v?.from?.id ?? null,
          message: v?.message ?? "",
          message_type: "comment",
          status: "new",
        });
      }
    }
  }

  let inserted = 0;
  if (rows.length) {
    const { error } = await supabase.from("social_messages").insert(rows);
    if (error) {
      console.error("[instagram-webhook] insert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted = rows.length;
  }

  return new Response(JSON.stringify({ ok: true, inserted }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
