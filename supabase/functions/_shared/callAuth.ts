// Shared auth/device helpers for the call-tracking endpoints (Android companion app).
import { createClient } from "npm:@supabase/supabase-js@2";

export const MIN_SUPPORTED_FALLBACK = 1;

export type AuthContext = {
  userId: string;
  admin: ReturnType<typeof createClient>;
};

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Validates the bearer JWT in-code and returns the caller's user id. */
export async function authenticate(req: Request): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = authHeader.replace("Bearer ", "");
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await anon.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, ctx: { userId: data.claims.sub as string, admin: serviceClient() } };
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-10);
}

/**
 * Loads the device row and enforces the approval + version gates.
 * Returns a 403/401/426 style rejection instead of throwing.
 */
export async function requireApprovedDevice(
  admin: ReturnType<typeof createClient>,
  userId: string,
  deviceUuid: string,
  versionCode?: number | null,
): Promise<
  | { ok: true; device: Record<string, unknown> }
  | { ok: false; status: number; error: string; code: string }
> {
  const { data: device, error } = await admin
    .from("call_recording_devices")
    .select("*")
    .eq("device_uuid", deviceUuid)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message, code: "device_lookup_failed" };
  if (!device) {
    return { ok: false, status: 403, error: "Device is not registered", code: "device_not_registered" };
  }
  if (device.user_id !== userId) {
    return { ok: false, status: 403, error: "Device belongs to another user", code: "device_owner_mismatch" };
  }
  if (device.status === "blocked" || device.status === "revoked") {
    return { ok: false, status: 401, error: "Device access revoked", code: "device_revoked" };
  }
  if (device.status !== "approved") {
    return { ok: false, status: 403, error: "Device awaiting admin approval", code: "device_not_approved" };
  }
  if (device.session_revoked_at) {
    return { ok: false, status: 401, error: "Session revoked, sign in again", code: "session_revoked" };
  }

  if (typeof versionCode === "number") {
    const { data: release } = await admin
      .from("app_releases")
      .select("min_supported_version_code")
      .eq("platform", "android")
      .order("version_code", { ascending: false })
      .limit(1)
      .maybeSingle();
    const minSupported = release?.min_supported_version_code ?? MIN_SUPPORTED_FALLBACK;
    if (versionCode < minSupported) {
      return { ok: false, status: 426, error: "App update required", code: "upgrade_required" };
    }
  }

  return { ok: true, device };
}

export async function writeAudit(
  admin: ReturnType<typeof createClient>,
  row: {
    call_log_id?: string | null;
    device_id?: string | null;
    actor_id?: string | null;
    action: string;
    details?: Record<string, unknown>;
  },
) {
  await admin.from("call_log_audit").insert({
    call_log_id: row.call_log_id ?? null,
    device_id: row.device_id ?? null,
    actor_id: row.actor_id ?? null,
    action: row.action,
    details: row.details ?? {},
  });
}
