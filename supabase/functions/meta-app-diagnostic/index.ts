import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveMetaPageAccessToken } from "../_shared/metaPageToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";
const REQUIRED_SCOPES = [
  "leads_retrieval",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_manage_messages",
  "instagram_basic",
];

function mask(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "****";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url);
    return await r.json();
  } catch (e) {
    return { error: { message: (e as Error).message } };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
  const pageId = Deno.env.get("META_PAGE_ID") ?? "";
  const igId = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID") ?? "";

  const config = {
    tokenPresent: !!token,
    tokenFingerprint: mask(token),
    pageIdPresent: !!pageId,
    pageId: pageId || null,
    instagramAccountPresent: !!igId,
    instagramAccountId: igId || null,
    verifyTokenPresent: !!Deno.env.get("META_VERIFY_TOKEN"),
  };

  if (!token) {
    return new Response(JSON.stringify({
      ok: false,
      error: "META_PAGE_ACCESS_TOKEN is not configured in the backend.",
      config,
      checkedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }

  // 1. Inspect the token with itself — returns app_id + application name.
  const debug = await getJson(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
  );
  const d = debug?.data ?? {};
  const debugError: string | null = debug?.error?.message ?? d?.error?.message ?? null;

  const appId: string | null = d.app_id ? String(d.app_id) : null;
  let appName: string | null = d.application ?? null;

  // 2. Authoritative app name (may be blocked for some token types).
  if (appId) {
    const app = await getJson(`${GRAPH}/${appId}?fields=id,name&access_token=${encodeURIComponent(token)}`);
    if (app?.name) appName = app.name;
  }

  // 3. Token owner (page or user name) for extra confirmation.
  let ownerName: string | null = null;
  const me = await getJson(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  if (me?.name) ownerName = me.name;

  const expiresAt = d.expires_at ? (d.expires_at === 0 ? null : new Date(d.expires_at * 1000).toISOString()) : null;

  let resolvedPage: Record<string, unknown> | null = null;
  let resolvedToken = token;
  let resolvedPageError: string | null = null;
  try {
    const resolved = await resolveMetaPageAccessToken(token, pageId);
    resolvedToken = resolved.token;
    resolvedPage = {
      id: resolved.pageId,
      name: resolved.pageName,
      instagramBusinessAccountId: resolved.instagramBusinessAccountId,
      tokenSource: resolved.source,
      tokenFingerprint: mask(resolved.token),
    };
  } catch (error) {
    resolvedPageError = error instanceof Error ? error.message : String(error);
  }

  // 4. Granted permissions. Prefer checking the resolved Page token because that is
  // what the messaging endpoints use; fall back to the configured token scopes.
  const resolvedPerms = await getJson(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(resolvedToken)}`);
  const configuredPerms = resolvedToken === token
    ? resolvedPerms
    : await getJson(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`);
  const resolvedGranted: string[] = Array.isArray(resolvedPerms?.data)
    ? resolvedPerms.data.filter((p: any) => p.status === "granted").map((p: any) => p.permission)
    : [];
  const configuredGranted: string[] = Array.isArray(configuredPerms?.data)
    ? configuredPerms.data.filter((p: any) => p.status === "granted").map((p: any) => p.permission)
    : Array.isArray(d.scopes) ? d.scopes : [];
  const granted = Array.from(new Set([...resolvedGranted, ...configuredGranted]));
  const permissionsChecked = Array.isArray(resolvedPerms?.data) || Array.isArray(configuredPerms?.data) || Array.isArray(d.scopes);
  const missing = permissionsChecked ? REQUIRED_SCOPES.filter((s) => !granted.includes(s)) : [];

  return new Response(JSON.stringify({
    ok: !!appId,
    app: {
      id: appId,
      name: appName,
    },
    token: {
      type: d.type ?? null,
      isValid: d.is_valid ?? null,
      ownerName,
      ownerId: d.user_id ? String(d.user_id) : (me?.id ? String(me.id) : null),
      expiresAt,
      neverExpires: d.expires_at === 0,
      dataAccessExpiresAt: d.data_access_expires_at
        ? new Date(d.data_access_expires_at * 1000).toISOString()
        : null,
    },
    permissions: {
      checked: permissionsChecked,
      granted,
      missing,
      required: REQUIRED_SCOPES,
    },
    resolvedPage,
    config,
    error: resolvedPageError || (appId ? null : (debugError || "Meta did not return an app id for this token.")),
    checkedAt: new Date().toISOString(),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
});
