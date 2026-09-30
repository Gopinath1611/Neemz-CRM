import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { resolveMetaPageAccessToken } from "../_shared/metaPageToken.ts";

const GRAPH = "https://graph.facebook.com/v19.0";
const Body = z.object({
  post_id: z.string().uuid(),
  platforms: z.array(z.enum(["facebook", "instagram"])).min(1),
});

class MetaError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function graph(path: string, token: string, params: Record<string, string> = {}, method: "GET" | "POST" = "POST") {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${GRAPH}/${path}?${qs}` : `${GRAPH}/${path}`;
  const r = await fetch(url, method === "GET" ? {} : { method: "POST", body: qs });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) {
    const e = data?.error || {};
    const code = String(e.code ?? r.status);
    let msg = e.error_user_msg || e.message || `Meta HTTP ${r.status}`;
    if (code === "190") msg = `Meta login expired – reconnect in Connected Platforms (${msg})`;
    if (code === "10" || code === "200") msg = `Missing Meta permission – reconnect with publishing permission (${msg})`;
    if (code === "4" || code === "17" || code === "32" || code === "613") msg = `Meta rate limit reached – try again later (${msg})`;
    throw new MetaError(msg, code);
  }
  return data;
}

type Media = { url: string; type: string };
const isVideo = (m: Media) => m.type?.startsWith("video/");
const isImage = (m: Media) => m.type?.startsWith("image/");

async function publishFacebook(pageId: string, token: string, text: string, link: string | null, media: Media[], postType: string) {
  const images = media.filter(isImage);
  const videos = media.filter(isVideo);
  let id: string;
  if (videos.length) {
    const r = await graph(`${pageId}/videos`, token, { file_url: videos[0].url, description: text });
    id = r.id;
  } else if (images.length === 1) {
    const r = await graph(`${pageId}/photos`, token, { url: images[0].url, caption: text });
    id = r.post_id || r.id;
  } else if (images.length > 1) {
    const ids: string[] = [];
    for (const img of images) {
      const r = await graph(`${pageId}/photos`, token, { url: img.url, published: "false" });
      ids.push(r.id);
    }
    const params: Record<string, string> = { message: text };
    ids.forEach((mid, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: mid })));
    const r = await graph(`${pageId}/feed`, token, params);
    id = r.id;
  } else {
    const params: Record<string, string> = { message: text };
    if (link) params.link = link;
    const r = await graph(`${pageId}/feed`, token, params);
    id = r.id;
  }
  let permalink: string | null = null;
  try { permalink = (await graph(id, token, { fields: "permalink_url" }, "GET")).permalink_url ?? null; } catch { /* optional */ }
  return { id, permalink };
}

async function waitReady(containerId: string, token: string) {
  for (let i = 0; i < 30; i++) {
    const r = await graph(containerId, token, { fields: "status_code,status" }, "GET");
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new MetaError(`Instagram media processing failed: ${r.status || r.status_code}`, "media_error");
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new MetaError("Instagram video is still processing after 90 seconds – try again shortly", "timeout");
}

async function publishInstagram(igId: string, token: string, caption: string, media: Media[], postType: string) {
  if (!media.length) throw new MetaError("Instagram needs at least one photo or video", "validation");
  let creationId: string;
  if (postType === "Story") {
    const m = media[0];
    const r = await graph(`${igId}/media`, token, isVideo(m) ? { media_type: "STORIES", video_url: m.url } : { media_type: "STORIES", image_url: m.url });
    creationId = r.id;
    await waitReady(creationId, token);
  } else if (media.length > 1) {
    if (media.length > 10) throw new MetaError("Instagram carousels allow at most 10 items", "validation");
    const children: string[] = [];
    for (const m of media) {
      const r = await graph(`${igId}/media`, token, isVideo(m) ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" } : { image_url: m.url, is_carousel_item: "true" });
      if (isVideo(m)) await waitReady(r.id, token);
      children.push(r.id);
    }
    const r = await graph(`${igId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption });
    creationId = r.id;
    await waitReady(creationId, token);
  } else if (isVideo(media[0])) {
    const r = await graph(`${igId}/media`, token, { media_type: "REELS", video_url: media[0].url, caption });
    creationId = r.id;
    await waitReady(creationId, token);
  } else if (isImage(media[0])) {
    const r = await graph(`${igId}/media`, token, { image_url: media[0].url, caption });
    creationId = r.id;
  } else {
    throw new MetaError("Instagram only accepts images (JPG/PNG) and videos (MP4/MOV)", "validation");
  }
  const pub = await graph(`${igId}/media_publish`, token, { creation_id: creationId });
  let permalink: string | null = null;
  try { permalink = (await graph(pub.id, token, { fields: "permalink" }, "GET")).permalink ?? null; } catch { /* optional */ }
  return { id: pub.id, permalink };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Not signed in" }, 401);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { post_id, platforms } = parsed.data;

    const { data: post } = await admin.from("social_posts").select("*").eq("id", post_id).maybeSingle();
    if (!post) return json({ error: "Post not found" }, 404);
    const { data: isMkt } = await admin.rpc("is_marketing_admin", { _user_id: user.id });
    if (post.created_by !== user.id && !isMkt) return json({ error: "Not allowed to publish this post" }, 403);

    await admin.from("social_posts").update({ status: "publishing" }).eq("id", post_id);

    // Meta token: connected Meta login (has publishing permissions) first, then backend secret.
    const { data: app } = await admin.from("connected_apps").select("access_token")
      .eq("platform", "Meta (Facebook & Instagram)").eq("is_connected", true).not("access_token", "is", null)
      .order("verified_at", { ascending: false }).limit(1).maybeSingle();
    let rawToken = app?.access_token || Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";

    const text = [post.caption, post.hashtags].filter(Boolean).join("\n\n");
    const media: Media[] = Array.isArray(post.media) ? post.media : [];
    const results: any[] = [];

    let page: { token: string; pageId: string; igId: string | null } | null = null;
    let pageError: string | null = null;
    try {
      const r = await resolveMetaPageAccessToken(rawToken, Deno.env.get("META_PAGE_ID") || "");
      page = { token: r.token, pageId: r.pageId, igId: Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID") || r.instagramBusinessAccountId };
    } catch (e) {
      pageError = e instanceof Error ? e.message : String(e);
    }

    for (const platform of platforms) {
      const attempted_at = new Date().toISOString();
      let row: any = { post_id, platform, attempted_at };
      try {
        if (!page) throw new MetaError(pageError || "Meta Page is not connected", "no_page");
        let out;
        if (platform === "facebook") {
          out = await publishFacebook(page.pageId, page.token, text, post.link_url, media, post.post_type || "");
        } else {
          if (!page.igId) throw new MetaError("No Instagram Business account is linked to the Facebook Page", "no_ig");
          out = await publishInstagram(page.igId, page.token, text, media, post.post_type || "");
        }
        row = { ...row, status: "published", external_post_id: out.id, permalink: out.permalink, error_code: null, error_message: null, published_at: new Date().toISOString() };
      } catch (e) {
        row = { ...row, status: "failed", error_code: e instanceof MetaError ? e.code : "unknown", error_message: e instanceof Error ? e.message : String(e) };
        console.error(`[social-publish] ${platform} failed`, row.error_code, row.error_message);
      }
      await admin.from("social_post_targets").upsert(row, { onConflict: "post_id,platform" });
      results.push(row);
    }

    const ok = results.filter((r) => r.status === "published").length;
    const status = ok === results.length ? "published" : ok === 0 ? "failed" : "partial";
    await admin.from("social_posts").update({ status }).eq("id", post_id);
    return json({ status, results });
  } catch (e) {
    console.error("[social-publish] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
