// Version check for the Android companion app.
// GET/POST -> { latest_version, latest_version_code, min_supported_version_code, apk_url, changelog, force_update }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/callAuth.ts";

const APK_BUCKET = "call-recordings";

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
    const { admin } = auth.ctx;

    const { data: release, error } = await admin
      .from("app_releases")
      .select("version_name, version_code, min_supported_version_code, apk_path, changelog, force_update")
      .eq("platform", "android")
      .order("is_latest", { ascending: false })
      .order("version_code", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!release) {
      return json({
        latest_version: null,
        latest_version_code: null,
        min_supported_version_code: 1,
        apk_url: null,
        changelog: null,
        force_update: false,
      });
    }

    let apkUrl: string | null = null;
    if (release.apk_path) {
      const { data: signed } = await admin.storage
        .from(APK_BUCKET)
        .createSignedUrl(release.apk_path, 60 * 30);
      apkUrl = signed?.signedUrl ?? null;
    }

    return json({
      latest_version: release.version_name,
      latest_version_code: release.version_code,
      min_supported_version_code: release.min_supported_version_code,
      apk_url: apkUrl,
      changelog: release.changelog,
      force_update: release.force_update,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
