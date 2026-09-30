import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enrichPageAccessTokenError, resolveMetaPageAccessToken } from "../_shared/metaPageToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scopes the Meta token must hold for full inbox coverage.
const REQUIRED_SCOPES = [
  "pages_messaging",
  "instagram_manage_messages",
  "instagram_basic",
];

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function initials(name: string): string {
  return (name || "?").split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function sentimentOf(text: string): "positive" | "negative" | "neutral" {
  const t = (text || "").toLowerCase();
  const pos = ["thank", "great", "amazing", "best", "love", "good", "awesome", "excellent", "👍", "❤", "😊", "✨"];
  const neg = ["bad", "worst", "expensive", "poor", "rude", "terrible", "hate", "disappoint", "😡", "👎"];
  if (pos.some(w => t.includes(w))) return "positive";
  if (neg.some(w => t.includes(w))) return "negative";
  return "neutral";
}

function enrichPermError(msg: string, scope: string): string {
  if (/\(#200\)|\(#230\)|permission|appropriate role/i.test(msg)) {
    return `${msg} — grant '${scope}' to the Meta token and ensure the connected account is an admin of the Page / linked Instagram professional account.`;
  }
  return msg;
}

// Returns granted scopes, or null when introspection is not possible
// (e.g. token type doesn't expose /me/permissions).
async function fetchGrantedScopes(token: string): Promise<string[] | null> {
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${token}`);
    const j = await r.json();
    if (!Array.isArray(j?.data)) return null;
    return j.data.filter((p: any) => p.status === "granted").map((p: any) => p.permission);
  } catch (_) {
    return null;
  }
}

async function fetchEffectiveGrantedScopes(configuredToken: string, resolvedToken: string): Promise<string[] | null> {
  const scoped = await Promise.all([
    fetchGrantedScopes(resolvedToken),
    resolvedToken === configuredToken ? Promise.resolve(null) : fetchGrantedScopes(configuredToken),
  ]);
  const merged = scoped.flatMap((scopes) => scopes || []);
  return scoped.some((scopes) => scopes !== null) ? Array.from(new Set(merged)) : null;
}

async function fetchFacebook(token: string, pageId: string) {
  const items: any[] = [];
  const postsRes = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/published_posts?fields=id,message,permalink_url,created_time,comments.limit(25){id,from,message,created_time,permalink_url}&limit=15&access_token=${token}`
  );
  const postsData = await postsRes.json();
  for (const p of postsData.data || []) {
    const postTitle = (p.message || "Untitled Post").substring(0, 60);
    for (const c of p.comments?.data || []) {
      items.push({
        id: `fb-c-${c.id}`,
        threadId: c.id,
        platform: "facebook",
        type: "comment",
        userName: c.from?.name || "Facebook User",
        userAvatar: initials(c.from?.name || "FB"),
        content: c.message || "",
        postTitle,
        timestamp: timeAgo(c.created_time),
        rawTime: c.created_time,
        isRead: false,
        isReplied: false,
        sentiment: sentimentOf(c.message || ""),
        permalink: c.permalink_url,
      });
    }
  }
  try {
    const rRes = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/ratings?fields=reviewer,rating,review_text,created_time,recommendation_type&limit=25&access_token=${token}`
    );
    const rData = await rRes.json();
    for (const rv of rData.data || []) {
      const text = rv.review_text || (rv.recommendation_type === "positive" ? "Recommends this clinic" : "Does not recommend");
      items.push({
        id: `fb-r-${rv.created_time}-${rv.reviewer?.name || "anon"}`,
        platform: "facebook",
        type: "review",
        userName: rv.reviewer?.name || "Facebook User",
        userAvatar: initials(rv.reviewer?.name || "FB"),
        content: text,
        timestamp: timeAgo(rv.created_time),
        rawTime: rv.created_time,
        isRead: false,
        isReplied: false,
        sentiment: rv.recommendation_type === "negative" ? "negative" : "positive",
      });
    }
  } catch (_) { /* ratings may be unavailable */ }
  return items;
}

async function fetchFacebookMessages(token: string, pageId: string) {
  const items: any[] = [];
  const r = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=id,updated_time,participants,messages.limit(1){id,message,from,created_time}&limit=20&access_token=${token}`
  );
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  for (const conv of j.data || []) {
    const msg = conv.messages?.data?.[0];
    if (!msg) continue;
    const other = (conv.participants?.data || []).find((p: any) => p.id !== pageId) || conv.participants?.data?.[0];
    if (msg.from?.id === pageId) continue;
    items.push({
      id: `fb-m-${msg.id}`,
      threadId: other?.id,
      platform: "facebook",
      type: "message",
      userName: msg.from?.name || other?.name || "Facebook User",
      userAvatar: initials(msg.from?.name || other?.name || "FB"),
      content: msg.message || "",
      timestamp: timeAgo(msg.created_time || conv.updated_time),
      rawTime: msg.created_time || conv.updated_time,
      isRead: false,
      isReplied: false,
      sentiment: sentimentOf(msg.message || ""),
    });
  }
  return items;
}

async function fetchInstagram(token: string, igId: string) {
  const items: any[] = [];
  const mediaRes = await fetch(
    `https://graph.facebook.com/v19.0/${igId}/media?fields=id,caption,permalink,timestamp,comments.limit(25){id,username,text,timestamp}&limit=15&access_token=${token}`
  );
  const mediaData = await mediaRes.json();
  for (const m of mediaData.data || []) {
    const postTitle = (m.caption || "Untitled Post").substring(0, 60);
    for (const c of m.comments?.data || []) {
      items.push({
        id: `ig-c-${c.id}`,
        threadId: c.id,
        platform: "instagram",
        type: "comment",
        userName: c.username || "Instagram User",
        userAvatar: initials(c.username || "IG"),
        content: c.text || "",
        postTitle,
        timestamp: timeAgo(c.timestamp),
        rawTime: c.timestamp,
        isRead: false,
        isReplied: false,
        sentiment: sentimentOf(c.text || ""),
        permalink: m.permalink,
      });
    }
  }
  try {
    const tagRes = await fetch(
      `https://graph.facebook.com/v19.0/${igId}/tags?fields=id,caption,username,timestamp,permalink&limit=10&access_token=${token}`
    );
    const tagData = await tagRes.json();
    for (const t of tagData.data || []) {
      items.push({
        id: `ig-m-${t.id}`,
        platform: "instagram",
        type: "mention",
        userName: t.username || "Instagram User",
        userAvatar: initials(t.username || "IG"),
        content: t.caption || "(mentioned you in a post)",
        timestamp: timeAgo(t.timestamp),
        rawTime: t.timestamp,
        isRead: false,
        isReplied: false,
        sentiment: sentimentOf(t.caption || ""),
        permalink: t.permalink,
      });
    }
  } catch (_) { /* tags scope may be missing */ }
  return items;
}

const IG_PAGE_SIZE = 10;
const IG_MAX_PAGES = 5;
const IG_MAX_ITEMS = 50;

function isDataVolumeError(msg: string) {
  return /reduce the amount of data/i.test(msg) || /please reduce/i.test(msg);
}

async function fetchInstagramMessages(token: string, pageId: string) {
  const items: any[] = [];

  const buildUrl = (pageSize: number) =>
    `https://graph.facebook.com/v19.0/${pageId}/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(1){id,message,from,created_time}&limit=${pageSize}&access_token=${token}`;

  let pageSize = IG_PAGE_SIZE;
  let next: string | null = buildUrl(pageSize);
  let pages = 0;
  let lastError: string | null = null;

  while (next && pages < IG_MAX_PAGES && items.length < IG_MAX_ITEMS) {
    const r = await fetch(next);
    const j = await r.json();

    if (!r.ok || j.error) {
      const msg = j?.error?.message || `HTTP ${r.status}`;
      // Meta data-volume guard: shrink the batch and retry once per shrink step
      if (isDataVolumeError(msg) && pageSize > 3) {
        pageSize = Math.max(3, Math.floor(pageSize / 2));
        next = buildUrl(pageSize);
        lastError = msg;
        continue;
      }
      if (items.length > 0) break; // keep whatever we already collected
      throw new Error(msg);
    }

    for (const conv of j.data || []) {
      const msg = conv.messages?.data?.[0];
      if (!msg) continue;
      const other = (conv.participants?.data || []).find((p: any) => p.id !== pageId) || conv.participants?.data?.[0];
      if (msg.from?.id === pageId) continue;
      items.push({
        id: `ig-dm-${msg.id}`,
        threadId: other?.id,
        platform: "instagram",
        type: "message",
        userName: msg.from?.name || other?.username || other?.name || "Instagram User",
        userAvatar: initials(msg.from?.name || other?.username || "IG"),
        content: msg.message || "",
        timestamp: timeAgo(msg.created_time || conv.updated_time),
        rawTime: msg.created_time || conv.updated_time,
        isRead: false,
        isReplied: false,
        sentiment: sentimentOf(msg.message || ""),
      });
      if (items.length >= IG_MAX_ITEMS) break;
    }

    pages++;
    next = j.paging?.next || null;
    lastError = null;
  }

  if (items.length === 0 && lastError) throw new Error(lastError);
  return items.slice(0, IG_MAX_ITEMS);
}


async function fetchYouTube(apiKey: string, channelId: string) {
  const items: any[] = [];
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=8&type=video&key=${apiKey}`
  );
  const searchData = await searchRes.json();
  for (const v of searchData.items || []) {
    const videoId = v.id?.videoId;
    if (!videoId) continue;
    const title = (v.snippet?.title || "Video").substring(0, 60);
    const cRes = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=15&order=time&key=${apiKey}`
    );
    const cData = await cRes.json();
    for (const th of cData.items || []) {
      const top = th.snippet?.topLevelComment?.snippet;
      if (!top) continue;
      items.push({
        id: `yt-c-${th.id}`,
        threadId: th.id,
        platform: "youtube",
        type: "comment",
        userName: top.authorDisplayName || "YouTube User",
        userAvatar: initials(top.authorDisplayName || "YT"),
        content: top.textOriginal || top.textDisplay || "",
        postTitle: title,
        timestamp: timeAgo(top.publishedAt),
        rawTime: top.publishedAt,
        isRead: false,
        isReplied: false,
        sentiment: sentimentOf(top.textOriginal || ""),
        permalink: `https://www.youtube.com/watch?v=${videoId}&lc=${th.id}`,
      });
    }
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const errors: Record<string, string> = {};
  let all: any[] = [];
  const counts: Record<string, number> = {};
  let permissions: Record<string, unknown> = { checked: false, granted: [], missing: [] };

  const fbToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const fbPage = Deno.env.get("META_PAGE_ID");
  const igId = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");
  const ytKey = Deno.env.get("YOUTUBE_API_KEY");
  const ytChannel = Deno.env.get("YOUTUBE_CHANNEL_ID");

  if (fbToken && fbPage) {
    try {
      const resolvedMetaPage = await resolveMetaPageAccessToken(fbToken, fbPage);
      const { token, pageId } = resolvedMetaPage;

      // --- Token scope introspection: report exactly which messaging scopes are missing ---
      const granted = await fetchEffectiveGrantedScopes(fbToken, token);
      const canCheck = granted !== null;
      const missing = canCheck ? REQUIRED_SCOPES.filter(s => !granted?.includes(s)) : [];
      permissions = { checked: canCheck, granted: granted ?? [], missing };
      if (canCheck && missing.length) {
        console.warn("[social-inbox] token missing scopes:", missing.join(", "));
      }
      // If introspection failed, attempt calls anyway and let Meta respond.
      const hasScope = (s: string) => !canCheck || granted?.includes(s) === true;

      // Facebook posts/comments/reviews (needs pages_read_engagement — not gated)
      const fbItems = await fetchFacebook(token, pageId)
        .catch(e => { errors.facebook_posts = enrichPageAccessTokenError(enrichPermError((e as Error).message, "pages_read_engagement")); return []; });
      counts.facebook_posts = fbItems.length;
      all = all.concat(fbItems);

      // Facebook Page messages — requires pages_messaging
      if (hasScope("pages_messaging")) {
        const fbMsgs = await fetchFacebookMessages(token, pageId)
          .catch(e => { errors.facebook_messages = enrichPageAccessTokenError(enrichPermError((e as Error).message, "pages_messaging")); return []; });
        counts.facebook_messages = fbMsgs.length;
        all = all.concat(fbMsgs);
      } else {
        counts.facebook_messages = 0;
        errors.facebook_messages = "Missing 'pages_messaging' permission on the Meta token — skipped Facebook messages.";
      }

      const effectiveIgId = igId || resolvedMetaPage.instagramBusinessAccountId;
      if (effectiveIgId) {
        // Instagram comments/mentions
        const igItems = await fetchInstagram(token, effectiveIgId)
          .catch(e => { errors.instagram_posts = enrichPageAccessTokenError(enrichPermError((e as Error).message, "instagram_basic")); return []; });
        counts.instagram_posts = igItems.length;
        all = all.concat(igItems);

        // Instagram DMs — requires instagram_manage_messages
        if (hasScope("instagram_manage_messages")) {
          const igMsgs = await fetchInstagramMessages(token, pageId)
            .catch(e => { errors.instagram_messages = enrichPageAccessTokenError(enrichPermError((e as Error).message, "instagram_manage_messages")); return []; });
          counts.instagram_messages = igMsgs.length;
          all = all.concat(igMsgs);
        } else {
          counts.instagram_messages = 0;
          errors.instagram_messages = "Missing 'instagram_manage_messages' permission on the Meta token — skipped Instagram DMs.";
        }
      } else {
        errors.instagram = "Instagram Business Account ID not configured or discoverable from the connected Page.";
      }
    } catch (e) { errors.facebook = enrichPageAccessTokenError((e as Error).message); }
  } else {
    errors.facebook = "Meta not configured";
  }

  if (ytKey && ytChannel) {
    try {
      const yt = await fetchYouTube(ytKey, ytChannel);
      counts.youtube = yt.length;
      all = all.concat(yt);
    } catch (e) { errors.youtube = (e as Error).message; }
  } else {
    errors.youtube = "YouTube not configured";
  }

  // Fallback scope detection from Meta error codes when introspection was unavailable
  const perm = permissions as { checked: boolean; granted: string[]; missing: string[] };
  const miss = new Set(perm.missing);
  if (/pages_messaging/i.test(errors.facebook_messages || "")) miss.add("pages_messaging");
  if (/instagram_manage_messages/i.test(errors.instagram_messages || "")) miss.add("instagram_manage_messages");
  perm.missing = Array.from(miss);

  all.sort((a, b) => new Date(b.rawTime || 0).getTime() - new Date(a.rawTime || 0).getTime());

  return new Response(JSON.stringify({ items: all, errors, counts, permissions, fetchedAt: new Date().toISOString() }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
