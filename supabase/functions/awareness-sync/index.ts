import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGscClient, ptToday, queryAnalytics, resolveProperty, shiftDays } from "../_shared/gsc.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";

async function resolveAccessToken(): Promise<string> {
  const candidates = [
    Deno.env.get("META_PAGE_ACCESS_TOKEN"),
    Deno.env.get("WHATSAPP_ACCESS_TOKEN"),
  ].filter((t): t is string => !!t);
  if (!candidates.length) throw new Error("META_PAGE_ACCESS_TOKEN not configured");

  let lastError = "Meta access token is invalid";
  for (const candidate of candidates) {
    try {
      const res = await fetch(`${GRAPH}/me?fields=id&access_token=${candidate}`);
      const data = await res.json();
      if (res.ok && data?.id) return candidate;
      lastError = data?.error?.message || lastError;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function resolvePageToken(
  userOrPageToken: string,
  configuredPageId: string,
): Promise<{ token: string; pageId: string }> {
  if (configuredPageId) {
    try {
      const r = await fetch(
        `${GRAPH}/${configuredPageId}?fields=id,access_token&access_token=${userOrPageToken}`,
      );
      const d = await r.json();
      if (r.ok && d?.id && d?.access_token) return { token: d.access_token, pageId: d.id };
    } catch (_) { /* continue */ }
    try {
      const p = await fetch(
        `${GRAPH}/${configuredPageId}?fields=id&access_token=${userOrPageToken}`,
      );
      const pd = await p.json();
      if (p.ok && pd?.id) return { token: userOrPageToken, pageId: pd.id };
    } catch (_) { /* continue */ }
  }
  const accRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${userOrPageToken}`,
  );
  const accData = await accRes.json();
  const pages = accData?.data || [];
  if (!pages.length) throw new Error(accData?.error?.message || "No Facebook Pages found for this token");
  const matched = pages.find((p: any) => p.id === configuredPageId) || pages[0];
  return { token: matched.access_token || userOrPageToken, pageId: matched.id };
}

type Row = {
  platform: string;
  content_format: string;
  title: string | null;
  caption: string | null;
  permalink: string | null;
  external_id: string;
  published_at: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  data_source: string;
};

const day = (iso?: string) =>
  (iso ? new Date(iso) : new Date()).toISOString().slice(0, 10);

/** Captions can carry NUL bytes and lone surrogates that Postgres rejects as JSON. */
const clean = (s?: string | null): string | null => {
  if (!s) return null;
  const safe = s
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1")
    .trim();
  return safe.length ? safe : null;
};

/** Facebook rejects some post fields per connection; ask in stages so one refusal
 *  cannot wipe out the whole post list. */
async function facebook(): Promise<{ rows: Row[]; snapshot: any; error?: string; notice?: string }> {
  try {
    const pageIdCfg = Deno.env.get("META_PAGE_ID") || "";
    const base = await resolveAccessToken();
    const { token, pageId } = await resolvePageToken(base, pageIdCfg);
    const url = `${GRAPH}/${pageId}`;
    const notices: string[] = [];

    const pageRes = await fetch(`${url}?fields=name,followers_count&access_token=${token}`);
    const pageData = await pageRes.json();

    // Stage 1 — basics only (text, date, link). Fall back to /feed if needed.
    const basicFields = "id,message,story,created_time,permalink_url";
    let posts: any[] = [];
    let listError = "";
    for (const edge of ["published_posts", "feed"]) {
      const res = await fetch(`${url}/${edge}?fields=${basicFields}&limit=25&access_token=${token}`);
      const data = await res.json();
      if (Array.isArray(data?.data) && data.data.length) {
        posts = data.data;
        if (edge === "feed") notices.push("post list read from the page feed");
        break;
      }
      listError = data?.error?.message || listError;
    }

    if (!posts.length) {
      return {
        rows: [],
        snapshot: {
          platform: "facebook",
          followers: pageData?.followers_count || 0,
          reach: 0,
          impressions: 0,
          engagements: 0,
          content_count: 0,
        },
        error: listError
          ? `Facebook did not return page posts: ${listError}`
          : "Facebook did not return any page posts for this connection.",
      };
    }

    const ids = posts.map((p: any) => p.id).filter(Boolean);
    const engagement: Record<string, { likes: number; comments: number; shares: number }> = {};
    const metrics: Record<string, { reach: number; impressions: number }> = {};

    // Stage 2 — engagement counts (may be refused).
    try {
      const res = await fetch(
        `${GRAPH}/?ids=${ids.join(",")}&fields=likes.summary(true),comments.summary(true),shares&access_token=${token}`,
      );
      const data = await res.json();
      if (data?.error) throw new Error(data.error.message);
      for (const id of ids) {
        const p = data?.[id];
        if (!p) continue;
        engagement[id] = {
          likes: p.likes?.summary?.total_count || 0,
          comments: p.comments?.summary?.total_count || 0,
          shares: p.shares?.count || 0,
        };
      }
    } catch (e) {
      notices.push(`engagement counts unavailable (${e instanceof Error ? e.message : "refused"})`);
    }

    // Stage 3 — per-post views. Asked one post at a time: the batched ids=
    // form makes Meta reject the whole request as an invalid metric.
    // Meta retired post_impressions*/post_views* on Graph v19+; the supported
    // replacement is post_media_view (post_video_views kept as extra signal).
    let insightError = "";
    const CANDIDATE_METRICS = ["post_media_view", "post_video_views"];
    for (const id of ids) {
      const ins: Record<string, number> = {};
      for (const name of CANDIDATE_METRICS) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${id}/insights?metric=${name}&access_token=${token}`,
          );
          const data = await res.json();
          if (data?.error) throw new Error(data.error.message);
          for (const i of data?.data || []) {
            ins[i.name] = Number(i.values?.[0]?.value) || 0;
          }
        } catch (e) {
          insightError = e instanceof Error ? e.message : "refused";
        }
      }
      if (Object.keys(ins).length) {
        metrics[id] = {
          reach: 0, // unique-view metric no longer offered by Meta
          impressions: ins.post_media_view ?? ins.post_video_views ?? 0,
        };
      }
    }
    if (!Object.keys(metrics).length && insightError) {
      notices.push(`view counts unavailable (${insightError})`);
    }

    const rows: Row[] = posts.map((p: any) => {
      const text = p.message || p.story || "";
      const eng = engagement[p.id] || { likes: 0, comments: 0, shares: 0 };
      const met = metrics[p.id] || { reach: 0, impressions: 0 };
      return {
        platform: "facebook",
        content_format: "post",
        title: clean((text || "Untitled post").slice(0, 120)) ?? "Untitled post",
        caption: clean(text),
        permalink: p.permalink_url ?? null,
        external_id: p.id,
        published_at: day(p.created_time),
        reach: met.reach,
        impressions: met.impressions,
        likes: eng.likes,
        comments: eng.comments,
        shares: eng.shares,
        data_source: "platform",
      };
    });

    return {
      rows,
      notice: notices.length ? `${rows.length} posts loaded · ${notices.join("; ")}` : undefined,
      snapshot: {
        platform: "facebook",
        followers: pageData?.followers_count || 0,
        reach: rows.reduce((a, r) => a + r.reach, 0),
        impressions: rows.reduce((a, r) => a + r.impressions, 0),
        engagements: rows.reduce((a, r) => a + r.likes + r.comments + r.shares, 0),
        content_count: rows.length,
      },
    };
  } catch (e) {
    return { rows: [], snapshot: null, error: e instanceof Error ? e.message : "facebook sync failed" };
  }
}

async function instagram(): Promise<{ rows: Row[]; snapshot: any; error?: string }> {
  try {
    const igId = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");
    if (!igId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID not configured");
    const base = await resolveAccessToken();
    const { token } = await resolvePageToken(base, Deno.env.get("META_PAGE_ID") || "");
    const url = `${GRAPH}/${igId}`;

    const accRes = await fetch(`${url}?fields=username,followers_count&access_token=${token}`);
    const accData = await accRes.json();

    const mediaRes = await fetch(
      `${url}/media?fields=caption,timestamp,permalink,media_type,like_count,comments_count,insights.metric(impressions,reach)&limit=25&access_token=${token}`,
    );
    const mediaData = await mediaRes.json();

    const rows: Row[] = (mediaData?.data || []).map((m: any) => {
      const ins: Record<string, number> = {};
      for (const i of m.insights?.data || []) ins[i.name] = Number(i.values?.[0]?.value) || 0;
      const fmt = m.media_type === "VIDEO"
        ? "reel"
        : m.media_type === "CAROOUSEL_ALBUM" || m.media_type === "CAROUSEL_ALBUM"
        ? "carousel"
        : "post";
      return {
        platform: "instagram",
        content_format: fmt,
        title: clean((m.caption || "Untitled post").slice(0, 120)) ?? "Untitled post",
        caption: clean(m.caption),
        permalink: m.permalink ?? null,
        external_id: m.id,
        published_at: day(m.timestamp),
        reach: ins.reach || 0,
        impressions: ins.impressions || ins.reach || 0,
        likes: m.like_count || 0,
        comments: m.comments_count || 0,
        shares: 0,
        data_source: "platform",
      };
    });

    return {
      rows,
      snapshot: {
        platform: "instagram",
        followers: accData?.followers_count || 0,
        reach: rows.reduce((a, r) => a + r.reach, 0),
        impressions: rows.reduce((a, r) => a + r.impressions, 0),
        engagements: rows.reduce((a, r) => a + r.likes + r.comments, 0),
        content_count: rows.length,
      },
    };
  } catch (e) {
    return { rows: [], snapshot: null, error: e instanceof Error ? e.message : "instagram sync failed" };
  }
}

async function youtube(): Promise<{ rows: Row[]; snapshot: any; error?: string }> {
  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    const channelId = Deno.env.get("YOUTUBE_CHANNEL_ID");
    if (!apiKey || !channelId) throw new Error("YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID not configured");

    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`,
    );
    const chData = await chRes.json();
    const stats = chData?.items?.[0]?.statistics || {};

    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=25&type=video&key=${apiKey}`,
    );
    const searchData = await searchRes.json();
    const ids = (searchData?.items || []).map((v: any) => v.id?.videoId).filter(Boolean);

    let rows: Row[] = [];
    if (ids.length) {
      const vidRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${ids.join(",")}&key=${apiKey}`,
      );
      const vidData = await vidRes.json();
      rows = (vidData?.items || []).map((v: any) => {
        const dur: string = v.contentDetails?.duration || "";
        const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(dur);
        const secs = (Number(m?.[1] || 0) * 60) + Number(m?.[2] || 0);
        const isShort = secs > 0 && secs <= 60;
        const views = Number(v.statistics?.viewCount || 0);
        return {
          platform: "youtube",
          content_format: isShort ? "short" : "video",
          title: clean((v.snippet?.title || "Untitled video").slice(0, 120)) ?? "Untitled video",
          caption: clean(v.snippet?.description),
          permalink: `https://www.youtube.com/watch?v=${v.id}`,
          external_id: v.id,
          published_at: day(v.snippet?.publishedAt),
          reach: views,
          impressions: views,
          likes: Number(v.statistics?.likeCount || 0),
          comments: Number(v.statistics?.commentCount || 0),
          shares: 0,
          data_source: "platform",
        };
      });
    }

    return {
      rows,
      snapshot: {
        platform: "youtube",
        followers: Number(stats.subscriberCount || 0),
        reach: rows.reduce((a, r) => a + r.reach, 0),
        impressions: rows.reduce((a, r) => a + r.impressions, 0),
        engagements: rows.reduce((a, r) => a + r.likes + r.comments, 0),
        content_count: rows.length,
      },
    };
  } catch (e) {
    return { rows: [], snapshot: null, error: e instanceof Error ? e.message : "youtube sync failed" };
  }
}

/** Google organic search (Search Console). Search Console publishes data with a
 *  2-3 day lag, so the window end is clamped and the clamp is reported. */
async function seo(
  fromDate?: string,
  toDate?: string,
): Promise<{ rows: Row[]; snapshot: any; error?: string; notice?: string }> {
  try {
    const client = await getGscClient();
    if (!client) return { rows: [], snapshot: null, error: "Google Search Console is not connected" };

    const site = Deno.env.get("LOCAL_SEO_SITE_URL") || "https://drneemz.com/";
    const property = await resolveProperty(client, site);

    // Latest day Search Console can answer for.
    const latest = shiftDays(ptToday(), -3);
    const requestedEnd = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : latest;
    const endDate = requestedEnd > latest ? latest : requestedEnd;
    const startDate = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)
      ? fromDate
      : shiftDays(endDate, -27);

    const notices: string[] = [];
    if (requestedEnd > latest) {
      notices.push(`Google publishes search data about 3 days late, so this period is counted up to ${endDate}`);
    }
    if (startDate > endDate) {
      return {
        rows: [],
        snapshot: null,
        notice: "Google has not published search data for this period yet — it arrives about 3 days late",
      };
    }

    const base = { startDate, endDate, type: "web", dataState: "all" };
    const [siteTotals, queries] = await Promise.all([
      queryAnalytics(client, property, base),
      queryAnalytics(client, property, { ...base, dimensions: ["query"], rowLimit: 5 }),
    ]);

    const total = siteTotals.rows?.[0];
    const clicks = Number(total?.clicks ?? 0);
    const impressions = Number(total?.impressions ?? 0);
    const ctr = total ? Math.round(Number(total.ctr) * 1000) / 10 : 0;
    const position = total ? Math.round(Number(total.position) * 10) / 10 : null;

    const topQueries = (queries.rows ?? []).map((r) => ({
      keyword: r.keys?.[0] || "",
      clicks: Number(r.clicks || 0),
      impressions: Number(r.impressions || 0),
      ctr: Math.round(Number(r.ctr) * 1000) / 10,
      position: Math.round(Number(r.position) * 10) / 10,
    }));

    const rows: Row[] = topQueries.map((q) => ({
      platform: "seo",
      content_format: "article",
      title: q.keyword,
      caption: `Google Search · position ${q.position} · CTR ${q.ctr}%`,
      permalink: null,
      external_id: `query:${q.keyword}`,
      published_at: endDate,
      reach: q.clicks,
      impressions: q.impressions,
      likes: 0,
      comments: 0,
      shares: 0,
      data_source: "platform",
    }));

    if (!impressions && !rows.length) {
      return {
        rows: [],
        snapshot: null,
        notice: "Google Search Console returned no search data for this period yet (data arrives about 3 days late)",
      };
    }

    return {
      rows,
      snapshot: {
        platform: "seo",
        followers: 0,
        reach: clicks,
        impressions,
        engagements: clicks,
        content_count: topQueries.length,
        raw: {
          clicks,
          impressions,
          ctr,
          avg_position: position,
          range_start: startDate,
          range_end: endDate,
          property,
          top_queries: topQueries,
        },
      },
      notice: notices.length ? notices.join(" · ") : undefined,
    };
  } catch (e) {
    return { rows: [], snapshot: null, error: e instanceof Error ? e.message : "seo sync failed" };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Require a signed-in caller.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const [fb, ig, yt, se] = await Promise.all([
      facebook(),
      instagram(),
      youtube(),
      seo(body?.from, body?.to),
    ]);
    const results = [fb, ig, yt, se];
    const rows = results.flatMap((r) => r.rows);
    const errors: Record<string, string> = {};
    const notices: Record<string, string> = {};
    for (const [name, r] of [["facebook", fb], ["instagram", ig], ["youtube", yt], ["seo", se]] as const) {
      if (r.error) errors[name] = r.error;
      const notice = (r as { notice?: string }).notice;
      if (notice) notices[name] = notice;
    }

    let upserted = 0;
    if (rows.length) {
      const { error } = await admin
        .from("awareness_content")
        .upsert(rows, { onConflict: "platform,external_id" });
      if (error) {
        console.error("awareness_content upsert failed:", error.message);
        return new Response(
          JSON.stringify({ error: "Could not save content", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      upserted = rows.length;
    }

    const snapshots = results
      .map((r) => r.snapshot)
      .filter(Boolean)
      .map((s: any) => ({ ...s, snapshot_date: day() }));

    if (snapshots.length) {
      const { error } = await admin
        .from("awareness_snapshots")
        .upsert(snapshots, { onConflict: "platform,snapshot_date" });
      if (error) console.error("awareness_snapshots upsert failed:", error.message);
    }

    return new Response(
      JSON.stringify({ ok: true, upserted, snapshots: snapshots.length, errors, notices }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("awareness-sync failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
