// Public redirect endpoint used by WhatsApp CTA URL buttons.
// URL shape:  /functions/v1/patient-doc/<bucket-path>
// Example:    /functions/v1/patient-doc/invoices/INV_123_1720000000000.pdf
//
// It signs the object in the private `patient-documents` bucket for 7 days
// and 302-redirects the caller to the signed URL. This lets Meta template
// URL buttons (which cannot template query strings) still deliver private PDFs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "patient-documents";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    // Strip the "/functions/v1/patient-doc/" prefix to get the object path.
    const marker = "/patient-doc/";
    const idx = url.pathname.indexOf(marker);
    const objectPath = idx >= 0
      ? decodeURIComponent(url.pathname.slice(idx + marker.length))
      : "";

    if (!objectPath || objectPath.includes("..")) {
      return new Response("Not found", { status: 404, headers: cors });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await service.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, TTL_SECONDS);

    if (error || !data?.signedUrl) {
      console.error("[patient-doc] sign failed", { objectPath, error });
      return new Response("Document unavailable", { status: 404, headers: cors });
    }

    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: data.signedUrl },
    });
  } catch (e) {
    console.error("[patient-doc] fatal", e);
    return new Response("Server error", { status: 500, headers: cors });
  }
});
