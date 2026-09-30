import { supabase } from "@/integrations/supabase/client";

export const SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again.";

let authHeadersPromise: Promise<{ Authorization: string }> | null = null;

/**
 * Returns the Authorization header for edge function calls.
 *
 * Refreshes when the cached access token is missing or about to expire, and
 * never falls back to a stale token: if the server has dropped the session
 * (revoked/deleted, e.g. after signing in elsewhere) we clear it locally and
 * surface a friendly "sign in again" error instead of sending a token that
 * edge functions will reject with 401.
 */
async function resolveFunctionAuthHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession();
  let token = data?.session?.access_token ?? null;
  const expiresAt = data?.session?.expires_at ?? 0;
  const expiringSoon = expiresAt > 0 && expiresAt * 1000 - Date.now() < 60_000;

  // A token can be revoked server-side while its local expiry still looks
  // valid. Verify it before invoking protected functions.
  if (token && !expiringSoon) {
    const { data: verified, error: verifyError } = await supabase.auth.getUser(token);
    if (verified?.user && !verifyError) {
      return { Authorization: `Bearer ${token}` };
    }
    token = null;
  }

  if (!token || expiringSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed?.session?.access_token ?? null;

    if (refreshError || !refreshedToken) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const { data: verified, error: verifyError } = await supabase.auth.getUser(refreshedToken);
    if (!verified?.user || verifyError) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    token = refreshedToken;
  }

  if (!token) throw new Error(SESSION_EXPIRED_MESSAGE);
  return { Authorization: `Bearer ${token}` };
}

export function getFunctionAuthHeaders(): Promise<{ Authorization: string }> {
  // Template and insights requests start together. Share one verification /
  // refresh so refresh-token rotation cannot make the sibling request fail.
  if (!authHeadersPromise) {
    authHeadersPromise = resolveFunctionAuthHeaders().finally(() => {
      authHeadersPromise = null;
    });
  }
  return authHeadersPromise;
}
