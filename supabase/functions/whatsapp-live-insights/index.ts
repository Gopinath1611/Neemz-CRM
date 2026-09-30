import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v22.0";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type JsonRecord = Record<string, any>;

type ConnectionConfig = {
  provider: string;
  baseUrl: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  webhookToken: string | null;
};

const pickString = (sources: Array<JsonRecord | null | undefined>, keys: string[]) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
};

const parseNumeric = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const safeLower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : "");

// Meta returns messaging limits as tier strings like "TIER_1K" / "TIER_100K" /
// "TIER_UNLIMITED". A naive numeric parse of "TIER_2K" yields 2, which produced
// nonsense ratios such as "3,857 / 2". Map the tier to its real daily limit.
const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: 0,
};

function tierInfo(value: unknown): { label: string; limit: number } {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { label: String(value), limit: value };
  }
  if (typeof value !== "string" || !value.trim()) return { label: "unknown", limit: 0 };
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const normalized = key.startsWith("TIER_") ? key : `TIER_${key}`;
  if (normalized in TIER_LIMITS) {
    return { label: normalized.replace("TIER_", ""), limit: TIER_LIMITS[normalized] };
  }
  // "TIER_5000" style or plain numeric string
  const m = normalized.match(/^TIER_(\d+)(K)?$/);
  if (m) {
    const n = Number(m[1]) * (m[2] ? 1_000 : 1);
    return { label: normalized.replace("TIER_", ""), limit: Number.isFinite(n) ? n : 0 };
  }
  return { label: normalized.replace("TIER_", ""), limit: 0 };
}

async function graphGet(token: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Meta API error ${res.status}`);
  }
  return data;
}

async function resolveConnection(callerClient: ReturnType<typeof createClient>, _userId: string): Promise<ConnectionConfig | null> {
  // Connections are shared clinic-wide — pick the most recently updated WhatsApp
  // connection regardless of which staff member originally connected it.
  const { data, error } = await callerClient
    .from("connected_apps")
    .select("platform, is_connected, app_credentials, metadata, access_token, updated_at")
    .eq("is_connected", true)
    .or("platform.eq.WhatsApp Business API,platform.eq.WhatsApp API")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const credentials = (data.app_credentials as JsonRecord | null) || {};
  const metadata = (data.metadata as JsonRecord | null) || {};
  const accessToken = pickString([credentials, metadata, { access_token: data.access_token }], [
    "wa_api_key",
    "access_token",
    "token",
    "bearer_token",
  ]);

  return {
    provider: pickString([credentials, metadata], ["wa_provider", "provider"]) || "WhatsApp Business API",
    baseUrl: pickString([credentials, metadata], ["wa_api_url", "api_url", "base_url"]),
    phoneNumberId: pickString([credentials, metadata], ["wa_phone_id", "phone_number_id"]),
    wabaId: pickString([credentials, metadata], ["wa_waba_id", "waba_id", "business_account_id"]),
    accessToken,
    webhookToken: pickString([credentials, metadata], ["wa_webhook_token", "webhook_token"]),
  };
}

// Returns billing/pricing data ONLY when Meta actually reports pricing_analytics.
// No estimation, no fallback rates, no message-count based cost.
function summarizeConversationPricing(analytics: JsonRecord) {
  const pricing = analytics.pricing_analytics as JsonRecord | undefined;
  if (!pricing || typeof pricing !== "object") return null;

  const rates = pricing.cost_per_conversation as JsonRecord | undefined;
  const conversations = pricing.conversation_categories as JsonRecord | undefined;
  if (!rates || !conversations) return null;

  const categories = [
    ["Marketing", "marketing"],
    ["Utility", "utility"],
    ["Authentication", "authentication"],
    ["Service", "service"],
    ["Free Entry Point", "free_entry_point"],
  ] as const;

  const currency = typeof pricing.currency === "string" ? pricing.currency : null;
  if (!currency) return null;

  const rows = categories
    .filter(([, key]) => rates[key] !== undefined && conversations[key] !== undefined)
    .map(([label, key]) => {
      const count = parseNumeric(conversations[key]);
      const rate = parseNumeric(rates[key]);
      return { category: label, count, rate, currency, totalCost: count * rate };
    });

  if (rows.length === 0) return null;
  return { currency, rows };
}



function computeDeliveryBreakdown(campaignStats: { totalSent: number; delivered: number; read: number; responded: number; failed: number }) {
  const delivered = Math.max(campaignStats.delivered, 0);
  const sent = Math.max(campaignStats.totalSent, 0);
  const undelivered = Math.max(sent - delivered, campaignStats.failed, 0);
  return [
    {
      type: "Delivered",
      count: delivered,
      percent: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
    },
    {
      type: "Not Delivered",
      count: undelivered,
      percent: sent > 0 ? Math.round((undelivered / sent) * 100) : 0,
    },
  ];
}

async function fetchMetaWhatsAppData(config: ConnectionConfig, campaignStats: { totalSent: number; delivered: number; read: number; responded: number; failed: number }) {
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      live: false,
      connectionVerified: false,
      reason: "missing_credentials",
      error: "Phone Number ID or access token is missing in the saved WhatsApp connection.",
    };
  }

  try {
    const phoneFields = [
      "id",
      "verified_name",
      "display_phone_number",
      "quality_rating",
      "code_verification_status",
      "name_status",
      "platform_type",
      "status",
      "account_mode",
      "is_official_business_account",
      "messaging_limit_tier",
      "whatsapp_business_manager_messaging_limit",
      "throughput",
      "quality_score",
      "search_visibility",
    ].join(",");

    const phoneData = await graphGet(config.accessToken, config.phoneNumberId, { fields: phoneFields });

    let wabaData: JsonRecord = {};
    if (config.wabaId) {
      try {
        wabaData = await graphGet(config.accessToken, config.wabaId, {
          fields: [
            "id",
            "name",
            "currency",
            "message_template_namespace",
            "review_status",
            "ownership_type",
            "analytics.start(0).end(30).granularity(DAY)",
          ].join(","),
        });
      } catch (_) {
        wabaData = {};
      }
    }

    const pricingBreakdown = summarizeConversationPricing(wabaData.analytics || {});
    const tierRaw = phoneData.messaging_limit_tier
      || phoneData.whatsapp_business_manager_messaging_limit
      || null;
    const tierLabel = tierInfo(tierRaw).label;
    const dailyLimit = tierInfo(tierRaw).limit
      || parseNumeric(phoneData.max_daily_conversations_per_phone)
      || parseNumeric(phoneData.max_daily_conversations_per_business)
      || 0;
    const sentToday = campaignStats.totalSent;
    const remainingQuota = dailyLimit > 0 ? Math.max(dailyLimit - sentToday, 0) : 0;
    const qualityScore = parseNumeric(phoneData.quality_score?.score ?? phoneData.quality_score);
    const deliveryRate = sentToday > 0 ? Number(((campaignStats.delivered / sentToday) * 100).toFixed(1)) : 0;
    const readRate = campaignStats.delivered > 0 ? Number(((campaignStats.read / campaignStats.delivered) * 100).toFixed(1)) : 0;
    const responseRate = campaignStats.delivered > 0 ? Number(((campaignStats.responded / campaignStats.delivered) * 100).toFixed(1)) : 0;

    return {
      live: true,
      connectionVerified: safeLower(phoneData.status) === "connected",
      provider: config.provider,
      accountHealth: {
        status: phoneData.status || "unknown",
        accountMode: phoneData.account_mode || "unknown",
        messageHealth: phoneData.quality_rating || "unknown",
        qualityRating: phoneData.quality_rating || "unknown",
        qualityScore,
        messagingTier: tierLabel,
        messagingTierRaw: tierRaw,
        dailyLimit,
        sentToday,
        remainingQuota,
        displayName: phoneData.verified_name || wabaData.name || "WhatsApp Business",
        phoneNumber: phoneData.display_phone_number || null,
        phoneNumberId: config.phoneNumberId,
        wabaId: config.wabaId,
        lastSyncedAt: new Date().toISOString(),
        nameStatus: phoneData.name_status || null,
        verificationStatus: phoneData.code_verification_status || null,
        searchVisibility: phoneData.search_visibility || null,
        platformType: phoneData.platform_type || null,
        officialBusinessAccount: Boolean(phoneData.is_official_business_account),
        reviewStatus: wabaData.review_status || null,
      },
      analytics30d: {
        totalSent: campaignStats.totalSent,
        delivered: campaignStats.delivered,
        read: campaignStats.read,
        responded: campaignStats.responded,
        failed: campaignStats.failed,
        optOut: 0,
        deliveryRate,
        readRate,
        responseRate,
      },
      pricing: pricingBreakdown
        ? {
            available: true,
            currency: pricingBreakdown.currency,
            currentMonthSpend: pricingBreakdown.rows.reduce((sum, item) => sum + item.totalCost, 0),
            breakdown: pricingBreakdown.rows,
          }
        : { available: false },

      messageThreads: computeDeliveryBreakdown(campaignStats),
      businessProfile: {
        displayName: phoneData.verified_name || wabaData.name || "WhatsApp Business",
        phoneNumber: phoneData.display_phone_number || null,
        phoneNumberId: config.phoneNumberId,
        wabaId: config.wabaId,
        provider: config.provider,
        baseUrl: config.baseUrl,
      },
      raw: {
        phoneData,
        wabaData,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify WhatsApp connection";
    return {
      live: false,
      connectionVerified: false,
      reason: "meta_error",
      error: message,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl) return jsonResponse({ error: "SUPABASE_URL is not configured" }, 500);
    if (!anonKey) return jsonResponse({ error: "SUPABASE_ANON_KEY is not configured" }, 500);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Extract the JWT from the Authorization header and pass it explicitly.
    // In edge-function context there is no persisted client session, so
    // `getUser()` without an argument always returns null → false 401s.
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser(jwt);

    if (userError || !user) {
      console.error("[whatsapp-live-insights] auth.getUser failed", userError?.message);
      return jsonResponse({ error: "Unauthorized", detail: userError?.message || "no user for token" }, 401);
    }

    const connection = await resolveConnection(callerClient, user.id);

    const { data: campaigns, error: campaignsError } = await callerClient
      .from("whatsapp_campaigns")
      .select("sent_count, delivered_count, read_count, response_count, total_recipients")
      .order("created_at", { ascending: false })
      .limit(200);

    if (campaignsError) return jsonResponse({ error: campaignsError.message }, 400);

    const campaignStats = (campaigns || []).reduce(
      (acc, campaign: JsonRecord) => {
        const sent = parseNumeric(campaign.sent_count || campaign.total_recipients);
        acc.totalSent += sent;
        acc.delivered += parseNumeric(campaign.delivered_count);
        acc.read += parseNumeric(campaign.read_count);
        acc.responded += parseNumeric(campaign.response_count);
        acc.failed += Math.max(sent - parseNumeric(campaign.delivered_count), 0);
        return acc;
      },
      { totalSent: 0, delivered: 0, read: 0, responded: 0, failed: 0 }
    );

    if (!connection) {
      return jsonResponse({
        live: false,
        connectionVerified: false,
        connectionExists: false,
        error: "WhatsApp Business API is not connected yet. Please save your provider, phone number ID, WABA ID and access token in Settings → Connected Apps.",
        campaignStats,
      });
    }

    const metaData = await fetchMetaWhatsAppData(connection, campaignStats);

    return jsonResponse({
      live: metaData.live,
      connectionVerified: metaData.connectionVerified,
      connectionExists: true,
      provider: connection.provider,
      connection: {
        provider: connection.provider,
        phoneNumberId: connection.phoneNumberId,
        wabaId: connection.wabaId,
        hasAccessToken: Boolean(connection.accessToken),
        baseUrl: connection.baseUrl,
      },
      campaignStats,
      ...metaData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message, live: false, connectionVerified: false }, 500);
  }
});
