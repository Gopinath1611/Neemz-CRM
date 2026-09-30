// Shared Google Search Console access helpers.
// Auth order: service-account JWT (direct Google API) -> Lovable connector gateway.
import { create } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const GOOGLE_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export type GscClient = { baseUrl: string; headers: Record<string, string> };
type SiteEntry = { siteUrl: string; permissionLevel?: string };

async function serviceAccountToken(): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;

  let sa: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    console.error("Search Console service account JSON is not valid JSON");
    return null;
  }
  if (!sa.client_email || !sa.private_key || !sa.token_uri) {
    console.error("Search Console service account JSON is incomplete");
    return null;
  }

  const b64 = sa.private_key
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  let key: CryptoKey;
  try {
    const keyData = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    key = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (err) {
    console.error("Could not import Search Console service account key:", err);
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
    console.error(`Search Console token exchange failed [${res.status}]`);
    return null;
  }
  const data = await res.json();
  return (data.access_token as string) || null;
}

export async function getGscClient(): Promise<GscClient | null> {
  const token = await serviceAccountToken();
  if (token) return { baseUrl: GOOGLE_API_BASE, headers: { Authorization: `Bearer ${token}` } };

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (lovableKey && connKey) {
    return {
      baseUrl: GATEWAY,
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
    };
  }
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

/** Resolve the verified property that covers siteUrl. Picks the exact root
 *  URL-prefix when several verified properties match. */
export async function resolveProperty(client: GscClient, siteUrl: string): Promise<string> {
  const res = await fetch(`${client.baseUrl}/sites`, { headers: client.headers });
  if (!res.ok) {
    throw new Error(`Could not list Search Console properties [${res.status}]: ${await res.text()}`);
  }
  const { siteEntry = [] } = (await res.json()) as { siteEntry?: SiteEntry[] };
  const target = new URL(siteUrl);
  const matches = siteEntry.filter(
    (e) => e.permissionLevel !== "siteUnverifiedUser" && coversTarget(e.siteUrl, target),
  );
  if (!matches.length) throw new Error("No verified Search Console property covers this site");
  const exact = matches.find((m) => m.siteUrl === target.href);
  return (exact || matches[0]).siteUrl;
}

export type AnalyticsRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function queryAnalytics(
  client: GscClient,
  property: string,
  body: Record<string, unknown>,
): Promise<{ rows?: AnalyticsRow[] }> {
  const res = await fetch(
    `${client.baseUrl}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { ...client.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search Console query failed [${res.status}]: ${text}`);
  }
  return await res.json();
}

/** Search Console reports days in America/Los_Angeles. */
export function ptToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function shiftDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}
