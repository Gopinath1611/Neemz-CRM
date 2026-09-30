import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("LOCAL_SEO_SITE_URL") || "https://drneemz.com/";
const GOOGLE_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

type SiteEntry = { siteUrl: string; permissionLevel?: string };

// ---- Service-account JWT auth (direct Google Search Console API) ----
async function getServiceAccountAccessToken(): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;

  let sa: {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  try {
    sa = JSON.parse(raw);
  } catch {
    console.error("Service account JSON is not valid JSON");
    return null;
  }

  if (!sa.client_email || !sa.private_key || !sa.token_uri) {
    console.error("Service account JSON missing client_email, private_key or token_uri");
    return null;
  }

  const pem = sa.private_key.replace(/\\n/g, "\n").trim();
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  let keyData: Uint8Array;
  try {
    keyData = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    console.error("Could not decode service account private key");
    return null;
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (err) {
    console.error("Could not import service account private key:", err);
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      sub: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    },
    key,
  );

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    console.error(`Token exchange failed [${res.status}]: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  return (data.access_token as string) || null;
}

async function directGscHeaders(): Promise<Record<string, string> | null> {
  const token = await getServiceAccountAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

function connectorGscHeaders(): Record<string, string> | null {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (!lovableKey || !connKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

type GscClient = {
  baseUrl: string;
  headers: Record<string, string>;
};

async function getGscClient(): Promise<GscClient | null> {
  const direct = await directGscHeaders();
  if (direct) return { baseUrl: GOOGLE_API_BASE, headers: direct };
  const conn = connectorGscHeaders();
  if (conn) return { baseUrl: GATEWAY, headers: conn };
  return null;
}

function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    return target.href.startsWith(new URL(siteUrl).href);
  } catch {
    return false;
  }
}

async function resolveProperty(client: GscClient, selected?: string) {
  const res = await fetch(`${client.baseUrl}/sites`, { headers: client.headers });
  if (!res.ok) throw new Error(`Could not list Search Console properties [${res.status}]: ${await res.text()}`);
  const { siteEntry = [] } = (await res.json()) as { siteEntry?: SiteEntry[] };
  const target = new URL(SITE_URL);
  const matches = siteEntry.filter(
    (e) => e.permissionLevel !== "siteUnverifiedUser" && coversTarget(e.siteUrl, target),
  );
  if (selected) {
    const hit = matches.find((m) => m.siteUrl === selected);
    if (!hit) throw new Error("Selected Search Console property is not verified for this site");
    return { status: "selected" as const, siteUrl: hit.siteUrl };
  }
  if (matches.length === 0) throw new Error("No verified Search Console property covers this site");
  if (matches.length === 1) return { status: "selected" as const, siteUrl: matches[0].siteUrl };
  return { status: "selection_required" as const, candidates: matches.map((m) => m.siteUrl) };
}

async function queryAnalytics(
  client: GscClient,
  siteUrl: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(
    `${client.baseUrl}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: "POST", headers: { ...client.headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`Search Console query failed [${res.status}]: ${text}`);
    throw new Error(`Search Console query failed [${res.status}]: ${text}`);
  }
  return (await res.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
}

// Search Console reports days in America/Los_Angeles (PT). Compute the window in
// PT so our range matches what the Search Console UI shows.
function ptToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Search Console's own default period: 28 complete days ending 3 days back (PT). */
function gscWindow() {
  const endDate = shiftDays(ptToday(), -3);
  const startDate = shiftDays(endDate, -27);
  const prevEnd = shiftDays(startDate, -1);
  const prevStart = shiftDays(prevEnd, -27);
  return { startDate, endDate, prevStart, prevEnd };
}

/** Check only the global User-agent: * block for a blanket Disallow: /.
 *  Specific AI-crawler blocks (Google-Extended, GPTBot, etc.) are ignored. */
function isGlobalCrawlAllowed(robotsTxt: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let inGlobalBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const uaMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (uaMatch) {
      inGlobalBlock = uaMatch[1].trim() === "*";
      continue;
    }

    if (inGlobalBlock) {
      const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
      if (disallowMatch) {
        const path = disallowMatch[1].trim();
        if (path === "/" || path === "") {
          return false;
        }
      }
    }
  }

  return true;
}

// ---- On-page SEO checks against the live published site ----
async function runOnPageChecks() {
  const checklist: Array<{ item: string; done: boolean; score: number; detail?: string }> = [];
  let html = "";
  let ok = false;
  try {
    const res = await fetch(SITE_URL, { headers: { "User-Agent": "LovableSEOBot/1.0" } });
    ok = res.ok;
    html = await res.text();
  } catch (err) {
    console.error("Site fetch failed", err);
  }

  const push = (item: string, done: boolean, detail?: string) =>
    checklist.push({ item, done, score: done ? 100 : 0, detail });

  push("Homepage reachable", ok);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  push(
    "Page title set (not default)",
    !!title && title.length <= 60 && !/lovable app/i.test(title),
    title || undefined,
  );

  const desc = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0] || "";
  const descContent = desc.match(/content=["']([^"']*)["']/i)?.[1] || "";
  push(
    "Meta description set (under 160 chars)",
    !!descContent && descContent.length <= 160 && !/lovable generated project/i.test(descContent),
    descContent || undefined,
  );

  push("Canonical tag present", /rel=["']canonical["']/i.test(html));
  push("Open Graph tags present", /property=["']og:title["']/i.test(html));
  push("Responsive viewport meta", /name=["']viewport["']/i.test(html));
  push("Structured data (JSON-LD)", /application\/ld\+json/i.test(html));

  let robotsOk = false;
  let sitemapOk = false;
  try {
    const origin = new URL(SITE_URL).origin;
    const robots = await fetch(`${origin}/robots.txt`);
    const robotsTxt = robots.ok ? await robots.text() : "";
    robotsOk = robots.ok && isGlobalCrawlAllowed(robotsTxt);
    const sitemap = await fetch(`${origin}/sitemap.xml`);
    const sitemapXml = sitemap.ok ? await sitemap.text() : "";
    sitemapOk = sitemap.ok && /<urlset|<sitemapindex/i.test(sitemapXml);
  } catch (err) {
    console.error("robots/sitemap check failed", err);
  }
  push("robots.txt allows crawling", robotsOk);
  push("sitemap.xml published", sitemapOk);

  return checklist;
}

// ---- Deterministic keyword opportunities (real numbers, no guessing) ----
type RankingRow = {
  keyword: string;
  position: number;
  clicks: number;
  impressions: number;
  ctr: number;
};

function computeOpportunities(rankings: RankingRow[], siteCtr: number) {
  const nearPageOne = rankings
    .filter((r) => r.position > 10 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map(
      (r) =>
        `"${r.keyword}" sits at position ${r.position} (page 2) with ${r.impressions} impressions and ${r.clicks} clicks — a small content or internal-link push could move it to page 1.`,
    );

  const lowCtr = rankings
    .filter((r) => r.impressions >= 50 && r.ctr < Math.max(1, siteCtr * 0.5) && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map(
      (r) =>
        `"${r.keyword}" gets ${r.impressions} impressions at position ${r.position} but only ${r.ctr}% CTR (site average ${siteCtr}%) — rewrite the page title and meta description for this term.`,
    );

  const zeroClick = rankings
    .filter((r) => r.clicks === 0 && r.impressions >= 100)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map(
      (r) =>
        `"${r.keyword}" shows ${r.impressions} impressions with zero clicks at position ${r.position} — no page answers this query well yet.`,
    );

  return { nearPageOne, lowCtr, zeroClick };
}

// ---- AI suggestions grounded in the snapshot ----
async function generateSuggestions(payload: unknown): Promise<string[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return [];
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a local SEO consultant for a dental clinic in Salem, Tamil Nadu. You are given real Google Search Console keyword data (query, average position, clicks, impressions, CTR), pre-computed opportunity lists, and on-page audit results. Return 4-6 concrete prioritised actions. HARD RULES: every suggestion must name an actual keyword from the supplied data in quotes and cite its real numbers (position, impressions, clicks or CTR). Never give generic advice and never invent a keyword or number that is not in the data. Reply as a JSON array of plain strings only, no markdown.",
          },
          { role: "user", content: JSON.stringify(payload).slice(0, 12000) },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`AI suggestions failed [${res.status}]: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return text ? [text] : [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
  } catch (err) {
    console.error("AI suggestions error", err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const selectedProperty: string | undefined = body?.site_url;

    const client = await getGscClient();
    const sources = { gsc: false, gbp: false, semrush: false };
    let gscProperty: string | null = null;
    let rankings: Array<Record<string, unknown>> = [];
    let topPages: Array<Record<string, unknown>> = [];
    let totals: Record<string, unknown> = {};
    let gscError: string | null = null;

    const win = gscWindow();
    const rangeEnd = win.endDate;
    const rangeStart = win.startDate;
    const SEARCH_TYPE = "web";

    if (client) {
      try {
        const resolution = await resolveProperty(client, selectedProperty);
        if (resolution.status === "selection_required") {
          return new Response(
            JSON.stringify({ status: "selection_required", candidates: resolution.candidates }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        gscProperty = resolution.siteUrl;

        // Explicit search type + dataState so results match Search Console's
        // "Web" search type and include the most recent (fresh) days.
        const base = {
          startDate: rangeStart,
          endDate: rangeEnd,
          type: SEARCH_TYPE,
          dataState: "all",
          rowLimit: 100,
        };
        const [siteTotals, queries, pages, prev] = await Promise.all([
          // Dimensionless query = true site-level totals (not a top-N sum).
          queryAnalytics(client, gscProperty, {
            startDate: rangeStart,
            endDate: rangeEnd,
            type: SEARCH_TYPE,
            dataState: "all",
          }),
          queryAnalytics(client, gscProperty, { ...base, dimensions: ["query"] }),
          queryAnalytics(client, gscProperty, { ...base, dimensions: ["page"] }),
          queryAnalytics(client, gscProperty, {
            startDate: win.prevStart,
            endDate: win.prevEnd,
            type: SEARCH_TYPE,
            dataState: "all",
            dimensions: ["query"],
            rowLimit: 100,
          }),
        ]);

        const prevMap = new Map<string, number>();
        for (const r of prev.rows ?? []) prevMap.set(r.keys[0], r.position);

        rankings = (queries.rows ?? []).map((r) => {
          const keyword = r.keys[0];
          const position = Math.round(r.position * 10) / 10;
          const before = prevMap.get(keyword);
          const delta = before ? Math.round((before - position) * 10) / 10 : 0;
          return {
            keyword,
            position,
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: Math.round(r.ctr * 1000) / 10,
            change: delta > 0 ? `+${delta}` : `${delta}`,
            trend: delta > 0.2 ? "up" : delta < -0.2 ? "down" : "stable",
          };
        });

        topPages = (pages.rows ?? []).map((r) => ({
          page: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: Math.round(r.position * 10) / 10,
        }));

        const siteRow = siteTotals.rows?.[0];
        const clicks = Number(siteRow?.clicks ?? 0);
        const impressions = Number(siteRow?.impressions ?? 0);
        const avgPosition = siteRow ? Math.round(Number(siteRow.position) * 10) / 10 : null;
        totals = {
          clicks,
          impressions,
          ctr: siteRow
            ? Math.round(Number(siteRow.ctr) * 1000) / 10
            : impressions
              ? Math.round((clicks / impressions) * 1000) / 10
              : 0,
          avgPosition,
          queryCount: rankings.length,
          searchType: SEARCH_TYPE,
          timezone: "America/Los_Angeles",
        };
        sources.gsc = true;
      } catch (err) {
        gscError = err instanceof Error ? err.message : String(err);
        console.error("GSC step failed:", gscError);
      }
    } else {
      gscError = "Google Search Console is not connected";
    }

    const checklist = await runOnPageChecks();

    const opportunities = computeOpportunities(
      rankings as unknown as RankingRow[],
      Number(totals.ctr ?? 0),
    );
    totals = { ...totals, opportunities };

    const aiSuggestions = await generateSuggestions({
      site: SITE_URL,
      totals: {
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr: totals.ctr,
        avgPosition: totals.avgPosition,
      },
      dateRange: { start: rangeStart, end: rangeEnd },
      keywords: rankings.slice(0, 50),
      opportunities,
      topPages: topPages.slice(0, 10),
      checklist,
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("local_seo_snapshots")
      .insert({
        site_url: SITE_URL,
        gsc_property: gscProperty,
        range_start: rangeStart,
        range_end: rangeEnd,
        totals,
        rankings,
        top_pages: topPages,
        checklist,
        ai_suggestions: aiSuggestions,
        sources: { ...sources, gsc_error: gscError },
      })
      .select()
      .single();

    if (error) throw new Error(`Could not save snapshot: ${error.message}`);

    return new Response(JSON.stringify({ status: "ok", snapshot: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("local-seo-sync failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
