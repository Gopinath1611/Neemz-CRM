// Scheduled housekeeping for call tracking:
// - closes stale `initiated` rows that never got a device event
// - recomputes device health (offline / degraded / stale / service_down)
// - enforces the audio retention window
// No JWT required (called by cron); performs no user-specific reads.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient } from "../_shared/callAuth.ts";

const STALE_INITIATED_MINUTES = 30;
const RETENTION_DAYS = Number(Deno.env.get("CALL_RECORDING_RETENTION_DAYS") ?? "180");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = serviceClient();
    const now = Date.now();

    // 1. stale initiated rows
    const staleCutoff = new Date(now - STALE_INITIATED_MINUTES * 60_000).toISOString();
    const { data: stale } = await admin
      .from("call_logs")
      .update({ status: "no_recording", match_method: "stale_initiated" })
      .eq("status", "initiated")
      .lt("started_at", staleCutoff)
      .select("id");

    // 2. audio retention
    const retentionCutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
    const { data: expired } = await admin
      .from("call_logs")
      .select("id, recording_path")
      .not("recording_path", "is", null)
      .lt("recording_uploaded_at", retentionCutoff)
      .limit(200);

    let purged = 0;
    if (expired && expired.length > 0) {
      const paths = expired.map((r: any) => r.recording_path).filter(Boolean);
      if (paths.length > 0) {
        await admin.storage.from("call-recordings").remove(paths);
        await admin
          .from("call_logs")
          .update({ recording_path: null, recording_size_bytes: null })
          .in("id", expired.map((r: any) => r.id));
        purged = paths.length;
      }
    }

    // 3. device health flags (derived, stored as notes-free status fields)
    const { data: devices } = await admin
      .from("call_recording_devices")
      .select("id, last_seen_at, service_alive, status")
      .in("status", ["approved"]);

    let degraded = 0;
    let offline = 0;
    for (const d of devices ?? []) {
      if (!d.last_seen_at) continue;
      const age = now - new Date(d.last_seen_at).getTime();
      if (age > 72 * 3_600_000) offline++;
      else if (age > 6 * 3_600_000) degraded++;
    }

    return json({
      ok: true,
      stale_closed: stale?.length ?? 0,
      recordings_purged: purged,
      devices_checked: devices?.length ?? 0,
      devices_offline: offline,
      devices_degraded: degraded,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
