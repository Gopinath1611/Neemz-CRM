// Issues a short-lived signed upload URL for a call recording, then finalizes the row.
// POST { device_uuid, client_uuid, mime, size_bytes }            -> signed upload URL
// POST { device_uuid, client_uuid, finalize: true, path }        -> attaches the file to the call log
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireApprovedDevice, writeAudit } from "../_shared/callAuth.ts";

const BUCKET = "call-recordings";
const MAX_SIZE = 200 * 1024 * 1024; // 200 MB

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
    const clientUuid = typeof body?.client_uuid === "string" ? body.client_uuid.trim() : "";
    if (!deviceUuid || !clientUuid) {
      return json({ error: "device_uuid and client_uuid are required" }, 400);
    }

    const gate = await requireApprovedDevice(
      admin,
      userId,
      deviceUuid,
      Number.isInteger(body?.app_version_code) ? body.app_version_code : null,
    );
    if (!gate.ok) return json({ error: gate.error, code: gate.code }, gate.status);
    const device = gate.device as Record<string, any>;

    const { data: log, error: logErr } = await admin
      .from("call_logs")
      .select("id, telecaller_id, recording_path")
      .eq("client_uuid", clientUuid)
      .maybeSingle();
    if (logErr) return json({ error: logErr.message }, 500);
    if (!log) return json({ error: "Call log not found, sync metadata first", code: "log_missing" }, 404);
    if (log.telecaller_id !== userId) return json({ error: "Not your call log" }, 403);

    // ---- finalize ----
    if (body?.finalize === true) {
      const path = typeof body?.path === "string" ? body.path : "";
      if (!path.startsWith(`${userId}/`)) return json({ error: "Invalid path" }, 400);

      const { error: upErr } = await admin
        .from("call_logs")
        .update({
          recording_path: path,
          recording_uploaded_at: new Date().toISOString(),
          recording_size_bytes: Number.isInteger(body?.size_bytes) ? body.size_bytes : null,
          status: "completed",
        })
        .eq("id", log.id);
      if (upErr) return json({ error: upErr.message }, 500);

      await admin
        .from("call_recording_devices")
        .update({ last_audio_sync_at: new Date().toISOString() })
        .eq("id", device.id);

      await writeAudit(admin, {
        call_log_id: log.id,
        device_id: device.id,
        actor_id: userId,
        action: "recording_uploaded",
        details: { path },
      });

      return json({ ok: true, call_log_id: log.id, recording_path: path });
    }

    // ---- issue signed upload URL ----
    if (log.recording_path) {
      return json({ ok: true, already_uploaded: true, recording_path: log.recording_path });
    }
    const size = Number.isInteger(body?.size_bytes) ? body.size_bytes : 0;
    if (size > MAX_SIZE) return json({ error: "Recording too large" }, 413);

    const ext = typeof body?.mime === "string" && body.mime.includes("mp4") ? "m4a" : "mp3";
    const path = `${userId}/${clientUuid}.${ext}`;

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr) return json({ error: signErr.message }, 500);

    return json({
      ok: true,
      bucket: BUCKET,
      path,
      token: signed?.token,
      signed_url: signed?.signedUrl,
      call_log_id: log.id,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
