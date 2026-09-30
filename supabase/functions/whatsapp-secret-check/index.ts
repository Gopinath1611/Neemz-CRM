import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Diagnostic: verifies whether the configured WHATSAPP_APP_SECRET /
 * WHATSAPP_APP_SECRET_SECONDARY values
 *   a) reproduce the X-Hub-Signature-256 of the last rejected live webhook
 *      event (proving they belong to the app that signs our webhook events), and
 *   b) work as appsecret_proof with our WhatsApp access token (proving they
 *      belong to the "Dr Neemz CRM" app that issued the token).
 * Returns booleans only — never echoes secret material.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const c = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  const { data: { user } } = await c.auth.getUser(jwt);
  if (!user) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: cors });

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: waApp } = await service
    .from("connected_apps")
    .select("metadata")
    .eq("platform", "WhatsApp Business API")
    .maybeSingle();
  const meta: any = waApp?.metadata || {};
  const sample = meta.wa_last_rejected_sample as { body?: string; signature?: string; at?: string } | undefined;

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";

  const secrets: Record<string, string> = {};
  const prim = Deno.env.get("WHATSAPP_APP_SECRET");
  const sec = Deno.env.get("WHATSAPP_APP_SECRET_SECONDARY");
  if (prim) secrets.WHATSAPP_APP_SECRET = prim;
  if (sec) secrets.WHATSAPP_APP_SECRET_SECONDARY = sec;

  const result: Record<string, any> = {
    sample_present: !!sample?.body && !!sample?.signature,
    sample_at: sample?.at ?? null,
    checks: {} as Record<string, any>,
  };

  for (const [name, rawSecret] of Object.entries(secrets)) {
    const variants = Array.from(new Set([
      rawSecret,
      rawSecret.trim(),
      rawSecret.trim().replace(/^["']|["']$/g, ""),
    ].filter(Boolean)));

    // a) Does this secret reproduce the rejected event's signature?
    let matchesSample: boolean | null = null;
    if (sample?.body && sample?.signature) {
      for (const v of variants) {
        if ((await hmacHex(v, sample.body)) === sample.signature.toLowerCase()) {
          matchesSample = true;
          break;
        }
        matchesSample = false;
      }
    }

    // b) Does this secret work as appsecret_proof with our access token?
    //    (Only true for the secret of the app that issued the token.)
    let worksWithToken: boolean | null = null;
    if (accessToken) {
      for (const v of variants) {
        const proof = await hmacHex(v, accessToken);
        try {
          const r = await fetch(
            `https://graph.facebook.com/v23.0/me?access_token=${encodeURIComponent(accessToken)}&appsecret_proof=${proof}`,
          );
          const body = await r.json().catch(() => ({}));
          if (r.ok && body?.id) {
            worksWithToken = true;
            break;
          }
          // 190/OAuthException means proof rejected; keep trying variants
          worksWithToken = false;
        } catch {
          worksWithToken = null;
        }
      }
    }

    result.checks[name] = {
      configured: true,
      matches_rejected_event_signature: matchesSample,
      belongs_to_token_app_dr_neemz_crm: worksWithToken,
    };
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
