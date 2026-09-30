// Registers / updates an Android companion device for the signed-in staff user.
// New devices land in `pending` and must be approved by an admin before syncing.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, writeAudit } from "../_shared/callAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = await authenticate(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const { userId, admin } = auth.ctx;

    const body = await req.json().catch(() => null);
    const deviceUuid = typeof body?.device_uuid === "string" ? body.device_uuid.trim() : "";
    if (!deviceUuid || deviceUuid.length > 128) {
      return json({ error: "device_uuid is required" }, 400);
    }

    const payload = {
      user_id: userId,
      device_uuid: deviceUuid,
      device_model: typeof body?.device_model === "string" ? body.device_model.slice(0, 120) : null,
      manufacturer: typeof body?.manufacturer === "string" ? body.manufacturer.slice(0, 120) : null,
      android_version: typeof body?.android_version === "string" ? body.android_version.slice(0, 40) : null,
      app_version: typeof body?.app_version === "string" ? body.app_version.slice(0, 40) : null,
      app_version_code: Number.isInteger(body?.app_version_code) ? body.app_version_code : null,
      recording_capability: ["native_recorder", "self_record", "none", "unknown"].includes(body?.recording_capability)
        ? body.recording_capability
        : "unknown",
      battery_optimization_exempt: typeof body?.battery_optimization_exempt === "boolean"
        ? body.battery_optimization_exempt
        : null,
      permission_state: typeof body?.permission_state === "object" && body?.permission_state !== null
        ? body.permission_state
        : {},
      staff_phone: typeof body?.staff_phone === "string" ? body.staff_phone.slice(0, 32) : null,
      last_seen_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from("call_recording_devices")
      .select("id, user_id, status")
      .eq("device_uuid", deviceUuid)
      .maybeSingle();

    if (existing && existing.user_id !== userId) {
      // Hardware handed over to another staff member: close the old row, register fresh.
      await admin
        .from("call_recording_devices")
        .update({ status: "revoked", session_revoked_at: new Date().toISOString() })
        .eq("id", existing.id);
      await admin
        .from("call_recording_devices")
        .update({ device_uuid: `${deviceUuid}:retired:${existing.id}` })
        .eq("id", existing.id);
    }

    const { data: device, error } = await admin
      .from("call_recording_devices")
      .upsert(
        existing && existing.user_id === userId ? { ...payload } : payload,
        { onConflict: "device_uuid" },
      )
      .select("id, status, recording_capability, created_at")
      .single();

    if (error) return json({ error: error.message }, 500);

    await writeAudit(admin, {
      device_id: device.id,
      actor_id: userId,
      action: existing ? "device_reregistered" : "device_registered",
      details: { device_uuid: deviceUuid, model: payload.device_model },
    });

    return json({
      device_id: device.id,
      status: device.status,
      approved: device.status === "approved",
      message: device.status === "approved"
        ? "Device approved"
        : "Device registered, waiting for admin approval",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
