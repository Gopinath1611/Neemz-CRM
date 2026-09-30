// Proxies WhatsApp media (image/sticker/video/document) by media ID.
// Meta media URLs are short-lived and require the WABA access token to fetch,
// so we resolve + stream on demand and let the browser <img> tag consume this.
const GRAPH = "https://graph.facebook.com/v23.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("missing id", { status: 400, headers: corsHeaders });
    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    if (!token) return new Response("missing token", { status: 500, headers: corsHeaders });

    const infoRes = await fetch(`${GRAPH}/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!infoRes.ok) return new Response(`graph info ${infoRes.status}`, { status: 502, headers: corsHeaders });
    const info = await infoRes.json();
    const mediaUrl: string = info?.url;
    if (!mediaUrl) return new Response("no url", { status: 502, headers: corsHeaders });

    const mediaRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!mediaRes.ok) return new Response(`fetch ${mediaRes.status}`, { status: 502, headers: corsHeaders });

    const contentType = mediaRes.headers.get("content-type") || info?.mime_type || "application/octet-stream";
    return new Response(mediaRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: corsHeaders });
  }
});
