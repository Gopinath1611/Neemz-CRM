// Heartbeat + batch call-event sync from the Android companion app.
// Idempotent by client_uuid; server derives identity from the JWT only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, normalizePhone, requireApprovedDevice } from "../_shared/callAuth.ts";

const CALL_TYPES = ["incoming", "outgoing", "missed", "rejected"];
const STATUSES = ["initiated", "completed", "missed", "failed", "no_recording"];
const MATCH_WINDOW_MINUTES = 10;

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
    if (!deviceUuid) return json({ error: "device_uuid is required" }, 400);

    const gate = await requireApprovedDevice(
      admin,
      userId,
      deviceUuid,
      Number.isInteger(body?.app_version_code) ? body.app_version_code : null,
    );
    if (!gate.ok) return json({ error: gate.error, code: gate.code }, gate.status);
    const device = gate.device as Record<string, any>;

    const events = Array.isArray(body?.events) ? body.events.slice(0, 200) : [];
    const now = new Date().toISOString();

    // ---- heartbeat portion ----
    const heartbeat: Record<string, unknown> = {
      last_seen_at: now,
      app_version: typeof body?.app_version === "string" ? body.app_version.slice(0, 40) : device.app_version,
      app_version_code: Number.isInteger(body?.app_version_code) ? body.app_version_code : device.app_version_code,
      battery_optimization_exempt: typeof body?.battery_optimization_exempt === "boolean"
        ? body.battery_optimization_exempt
        : device.battery_optimization_exempt,
      permission_state: typeof body?.permission_state === "object" && body?.permission_state !== null
        ? body.permission_state
        : device.permission_state,
      service_alive: typeof body?.service_alive === "boolean" ? body.service_alive : device.service_alive,
      pending_events: Number.isInteger(body?.pending_events) ? body.pending_events : device.pending_events,
      pending_audio: Number.isInteger(body?.pending_audio) ? body.pending_audio : device.pending_audio,
      recording_capability: ["native_recorder", "self_record", "none", "unknown"].includes(body?.recording_capability)
        ? body.recording_capability
        : device.recording_capability,
    };

    const results: Array<Record<string, unknown>> = [];
    const needsAudio: string[] = [];

    for (const raw of events) {
      const clientUuid = typeof raw?.client_uuid === "string" ? raw.client_uuid.trim() : "";
      if (!clientUuid) {
        results.push({ client_uuid: raw?.client_uuid ?? null, ok: false, error: "client_uuid required" });
        continue;
      }

      const phone = typeof raw?.phone === "string" ? raw.phone.slice(0, 32) : null;
      const normalized = normalizePhone(phone);
      const callType = CALL_TYPES.includes(raw?.call_type) ? raw.call_type : "outgoing";
      const status = STATUSES.includes(raw?.status) ? raw.status : "completed";
      const startedAt = typeof raw?.started_at === "string" ? raw.started_at : now;
      const endedAt = typeof raw?.ended_at === "string" ? raw.ended_at : null;
      const duration = Number.isInteger(raw?.duration_seconds) && raw.duration_seconds >= 0
        ? raw.duration_seconds
        : 0;
      const simSlot = Number.isInteger(raw?.sim_slot) ? raw.sim_slot : null;
      const hasAudio = raw?.has_audio === true;

      // Existing row for this client_uuid? -> patch (idempotent retry / later enrichment)
      const { data: existing } = await admin
        .from("call_logs")
        .select("id, lead_id, manually_assigned, recording_path")
        .eq("client_uuid", clientUuid)
        .maybeSingle();

      if (existing) {
        const patch: Record<string, unknown> = {
          call_type: callType,
          status,
          ended_at: endedAt,
          duration_seconds: duration,
          sim_slot: simSlot,
        };
        const { error: upErr } = await admin.from("call_logs").update(patch).eq("id", existing.id);
        if (upErr) {
          results.push({ client_uuid: clientUuid, ok: false, error: upErr.message });
          continue;
        }
        if (hasAudio && !existing.recording_path) needsAudio.push(clientUuid);
        results.push({ client_uuid: clientUuid, ok: true, id: existing.id, matched: !!existing.lead_id });
        continue;
      }

      // Merge with a CRM-initiated row for the same phone in the time window.
      let mergeTargetId: string | null = null;
      let leadId: string | null = null;
      let matchMethod: string | null = null;

      if (normalized) {
        const windowStart = new Date(new Date(startedAt).getTime() - MATCH_WINDOW_MINUTES * 60_000).toISOString();
        const windowEnd = new Date(new Date(startedAt).getTime() + MATCH_WINDOW_MINUTES * 60_000).toISOString();

        const { data: pending } = await admin
          .from("call_logs")
          .select("id, lead_id")
          .eq("normalized_phone", normalized)
          .eq("telecaller_id", userId)
          .eq("status", "initiated")
          .is("client_uuid", null)
          .gte("started_at", windowStart)
          .lte("started_at", windowEnd)
          .order("started_at", { ascending: false })
          .limit(1);

        if (pending && pending.length > 0) {
          mergeTargetId = pending[0].id;
          leadId = pending[0].lead_id;
          matchMethod = "crm_initiated_merge";
        } else {
          const { data: leads } = await admin
            .from("leads")
            .select("id")
            .filter("phone", "ilike", `%${normalized}%`)
            .limit(2);
          if (leads && leads.length === 1) {
            leadId = leads[0].id;
            matchMethod = "phone_exact";
          } else if (leads && leads.length > 1) {
            matchMethod = "ambiguous";
          } else {
            matchMethod = "unmatched";
          }
        }
      } else {
        matchMethod = "no_phone";
      }

      if (mergeTargetId) {
        const { error: mergeErr } = await admin
          .from("call_logs")
          .update({
            client_uuid: clientUuid,
            device_id: device.id,
            call_type: callType,
            status,
            started_at: startedAt,
            ended_at: endedAt,
            duration_seconds: duration,
            sim_slot: simSlot,
            source: "android",
            match_method: matchMethod,
          })
          .eq("id", mergeTargetId);
        if (mergeErr) {
          results.push({ client_uuid: clientUuid, ok: false, error: mergeErr.message });
          continue;
        }
        if (hasAudio) needsAudio.push(clientUuid);
        results.push({ client_uuid: clientUuid, ok: true, id: mergeTargetId, matched: !!leadId });
        continue;
      }

      const { data: inserted, error: insErr } = await admin
        .from("call_logs")
        .insert({
          client_uuid: clientUuid,
          lead_id: leadId,
          telecaller_id: userId,
          device_id: device.id,
          phone,
          call_type: callType,
          status,
          source: "android",
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: duration,
          sim_slot: simSlot,
          match_method: matchMethod,
        })
        .select("id")
        .single();

      if (insErr) {
        results.push({ client_uuid: clientUuid, ok: false, error: insErr.message });
        continue;
      }
      if (hasAudio) needsAudio.push(clientUuid);
      results.push({ client_uuid: clientUuid, ok: true, id: inserted.id, matched: !!leadId });
    }

    const failures = results.filter((r) => r.ok === false).length;
    heartbeat.consecutive_sync_failures = failures > 0 ? (device.consecutive_sync_failures ?? 0) + 1 : 0;
    if (events.length > 0 && failures === 0) heartbeat.last_metadata_sync_at = now;
    if (events.length > 0) heartbeat.last_call_detected_at = now;

    await admin.from("call_recording_devices").update(heartbeat).eq("id", device.id);

    return json({
      ok: true,
      server_time: now,
      accepted: results.filter((r) => r.ok).length,
      rejected: failures,
      results,
      needs_audio: needsAudio,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
