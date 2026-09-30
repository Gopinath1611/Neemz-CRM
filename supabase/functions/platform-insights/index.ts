import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";

// Picks the first Meta credential Graph API still accepts, mirroring meta-ads.
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

async function resolvePageToken(userOrPageToken: string, configuredPageId: string): Promise<{ token: string; pageId: string }> {
  let directError = "";
  if (configuredPageId) {
    // 1) Try to mint a dedicated page token (works for user/system-user tokens).
    try {
      const tokenRes = await fetch(
        `${GRAPH}/${configuredPageId}?fields=id,access_token&access_token=${userOrPageToken}`
      );
      const tokenData = await tokenRes.json();
      if (tokenRes.ok && tokenData?.id && tokenData?.access_token) {
        return { token: tokenData.access_token, pageId: tokenData.id };
      }
      directError = tokenData?.error?.message || "";
    } catch (_) { /* continue */ }

    // 2) The token may already BE the page token (access_token field is then
    // not readable) — verify the page node is reachable and use it as-is.
    try {
      const probe = await fetch(`${GRAPH}/${configuredPageId}?fields=id,name,followers_count&access_token=${userOrPageToken}`);
      const probeData = await probe.json();
      if (probe.ok && probeData?.id) {
        return { token: userOrPageToken, pageId: probeData.id };
      }
      directError = probeData?.error?.message || directError;
    } catch (_) { /* fall through to page discovery */ }
  }


  // Otherwise treat as user token, fetch managed pages
  const accountsRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${userOrPageToken}`
  );
  const accountsData = await accountsRes.json();
  const pages = accountsData?.data || [];
  if (pages.length === 0) {
    const reason = accountsData?.error?.message || directError;
    throw new Error(
      `No Facebook Pages found for this token.${reason ? ` Meta says: ${reason}.` : ""} Make sure the token has pages_show_list and pages_read_engagement, and that META_PAGE_ID is correct.`
    );
  }
  const matched = pages.find((p: any) => p.id === configuredPageId) || pages[0];
  return { token: matched.access_token || userOrPageToken, pageId: matched.id };
}


async function fetchMetaInsights(userOrPageToken: string, configuredPageId: string) {
  const { token: pageAccessToken, pageId } = await resolvePageToken(userOrPageToken, configuredPageId);
  const baseUrl = `https://graph.facebook.com/v19.0/${pageId}`;

  // Page info
  const pageRes = await fetch(
    `${baseUrl}?fields=name,followers_count,about,category,link,picture&access_token=${pageAccessToken}`
  );
  const pageData = await pageRes.json();

  // Page insights — only metrics that are widely supported
  const insightsRes = await fetch(
    `${baseUrl}/insights?metric=page_post_engagements,page_views_total,page_total_actions&period=day&date_preset=last_28_days&access_token=${pageAccessToken}`
  );
  const insightsData = await insightsRes.json();

  // Use published_posts (works with pages_manage_posts) instead of /posts (which needs pages_read_engagement)
  const postsRes = await fetch(
    `${baseUrl}/published_posts?fields=message,created_time,likes.summary(true),comments.summary(true),shares,permalink_url&limit=10&access_token=${pageAccessToken}`
  );
  const postsData = await postsRes.json();

  // Total post count
  const postCountRes = await fetch(
    `${baseUrl}/published_posts?summary=total_count&limit=1&access_token=${pageAccessToken}`
  );
  const postCountData = await postCountRes.json();
  const totalPosts = postCountData?.summary?.total_count ?? (postsData.data?.length || 0);

  // Sum insights values across the 28-day period
  const insights: Record<string, number> = {};
  if (insightsData.data) {
    for (const metric of insightsData.data) {
      const sum = (metric.values || []).reduce((acc: number, v: any) => acc + (Number(v.value) || 0), 0);
      insights[metric.name] = sum;
    }
  }

  // Sum likes/comments across recent posts as engagement proxy if insights blocked
  const recentLikes = (postsData.data || []).reduce((a: number, p: any) => a + (p.likes?.summary?.total_count || 0), 0);
  const recentComments = (postsData.data || []).reduce((a: number, p: any) => a + (p.comments?.summary?.total_count || 0), 0);
  const recentShares = (postsData.data || []).reduce((a: number, p: any) => a + (p.shares?.count || 0), 0);

  const posts = (postsData.data || []).map((p: any) => ({
    title: (p.message || "Untitled Post").substring(0, 80),
    type: "Post",
    date: new Date(p.created_time).toLocaleDateString(),
    likes: String(p.likes?.summary?.total_count || 0),
    comments: String(p.comments?.summary?.total_count || 0),
    shares: String(p.shares?.count || 0),
    reach: "-",
    permalink: p.permalink_url,
  }));

  return {
    platform: "meta",
    overview: [
      { label: "Followers", value: formatNumber(pageData.followers_count || 0), icon: "Users" },
      { label: "Total Posts", value: formatNumber(totalPosts), icon: "Image" },
      { label: "Page Views (28d)", value: formatNumber(insights.page_views_total || 0), icon: "Eye" },
      { label: "Engagements (28d)", value: formatNumber(insights.page_post_engagements || 0), icon: "Share2" },
      { label: "Recent Likes", value: formatNumber(recentLikes), icon: "Heart" },
      { label: "Recent Comments", value: formatNumber(recentComments), icon: "MessageCircle" },
    ],
    topPosts: posts,
    pageName: pageData.name,
    pageCategory: pageData.category,
    pagePicture: pageData.picture?.data?.url,
    raw: { pageData, insights, insightsError: insightsData.error || null },
  };
}

async function fetchInstagramInsights(pageAccessToken: string, igAccountId: string) {
  const baseUrl = `https://graph.facebook.com/v19.0/${igAccountId}`;

  // Account info
  const accountRes = await fetch(
    `${baseUrl}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url&access_token=${pageAccessToken}`
  );
  const accountData = await accountRes.json();

  // Account-level insights (last 30 days)
  const insightsRes = await fetch(
    `${baseUrl}/insights?metric=impressions,reach,profile_views,website_clicks&period=days_28&access_token=${pageAccessToken}`
  );
  const insightsData = await insightsRes.json();

  const insights: Record<string, any> = {};
  if (insightsData.data) {
    for (const metric of insightsData.data) {
      const values = metric.values;
      if (values && values.length > 0) {
        insights[metric.name] = values[values.length - 1].value;
      }
    }
  }

  // Recent media
  const mediaRes = await fetch(
    `${baseUrl}/media?fields=caption,timestamp,like_count,comments_count,media_type,insights.metric(impressions,reach,saved)&limit=5&access_token=${pageAccessToken}`
  );
  const mediaData = await mediaRes.json();

  const posts = (mediaData.data || []).map((m: any) => {
    const mediaInsights: Record<string, number> = {};
    if (m.insights?.data) {
      for (const i of m.insights.data) {
        mediaInsights[i.name] = i.values?.[0]?.value || 0;
      }
    }
    return {
      title: (m.caption || "Untitled").substring(0, 60),
      type: m.media_type === "VIDEO" ? "Reel/Video" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Image",
      date: new Date(m.timestamp).toLocaleDateString(),
      likes: String(m.like_count || 0),
      comments: String(m.comments_count || 0),
      shares: "-",
      reach: formatNumber(mediaInsights.reach || mediaInsights.impressions || 0),
    };
  });

  return {
    platform: "instagram",
    overview: [
      { label: "Followers", value: formatNumber(accountData.followers_count || 0), icon: "Users" },
      { label: "Following", value: formatNumber(accountData.follows_count || 0), icon: "UserPlus" },
      { label: "Posts", value: formatNumber(accountData.media_count || 0), icon: "Image" },
      { label: "Reach (28d)", value: formatNumber(insights.reach || 0), icon: "Eye" },
      { label: "Impressions (28d)", value: formatNumber(insights.impressions || 0), icon: "BarChart3" },
      { label: "Profile Views (28d)", value: formatNumber(insights.profile_views || 0), icon: "MousePointerClick" },
    ],
    topPosts: posts,
    username: accountData.username,
    profilePicture: accountData.profile_picture_url,
    raw: { accountData, insights },
  };
}

async function fetchYouTubeInsights(apiKey: string, channelId: string) {
  // Channel stats
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`
  );
  const channelData = await channelRes.json();
  const channel = channelData.items?.[0];
  const stats = channel?.statistics || {};

  // Recent videos
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=5&type=video&key=${apiKey}`
  );
  const searchData = await searchRes.json();

  let posts: any[] = [];
  if (searchData.items && searchData.items.length > 0) {
    const videoIds = searchData.items.map((v: any) => v.id.videoId).join(",");
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${apiKey}`
    );
    const videosData = await videosRes.json();

    posts = (videosData.items || []).map((v: any) => ({
      title: (v.snippet?.title || "Untitled").substring(0, 60),
      type: "Video",
      date: new Date(v.snippet?.publishedAt).toLocaleDateString(),
      likes: String(v.statistics?.likeCount || 0),
      comments: String(v.statistics?.commentCount || 0),
      shares: "-",
      reach: `${formatNumber(Number(v.statistics?.viewCount || 0))} views`,
    }));
  }

  return {
    platform: "youtube",
    overview: [
      { label: "Subscribers", value: formatNumber(Number(stats.subscriberCount || 0)), icon: "Users" },
      { label: "Total Views", value: formatNumber(Number(stats.viewCount || 0)), icon: "Play" },
      { label: "Total Videos", value: formatNumber(Number(stats.videoCount || 0)), icon: "Video" },
      { label: "Channel Name", value: channel?.snippet?.title || "N/A", icon: "Globe" },
    ],
    topPosts: posts,
    channelTitle: channel?.snippet?.title,
    channelThumbnail: channel?.snippet?.thumbnails?.default?.url,
    raw: { stats },
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return String(num);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform } = await req.json();

    if (!platform) {
      return new Response(JSON.stringify({ error: "platform is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any;

    if (platform === "meta" || platform === "facebook") {
      const pageId = Deno.env.get("META_PAGE_ID");
      if (!pageId) {
        return new Response(JSON.stringify({ error: "META_PAGE_ID not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = await resolveAccessToken();
      result = await fetchMetaInsights(token, pageId);
    } else if (platform === "instagram") {
      const igId = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");
      if (!igId) {
        return new Response(JSON.stringify({ error: "INSTAGRAM_BUSINESS_ACCOUNT_ID not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pageToken = (await resolvePageToken(await resolveAccessToken(), Deno.env.get("META_PAGE_ID") || "")).token;
      result = await fetchInstagramInsights(pageToken, igId);
    } else if (platform === "youtube") {
      const apiKey = Deno.env.get("YOUTUBE_API_KEY");
      const channelId = Deno.env.get("YOUTUBE_CHANNEL_ID");
      if (!apiKey || !channelId) {
        return new Response(JSON.stringify({ error: "YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = await fetchYouTubeInsights(apiKey, channelId);
    } else {
      return new Response(JSON.stringify({ error: `Platform '${platform}' is not supported for live insights` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching insights:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    // Return 200 with a fallback payload so the UI shows the reason instead of
    // crashing on a non-2xx response (blank screen).
    return new Response(
      JSON.stringify({ error: message, fallback: true, overview: [], topPosts: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
