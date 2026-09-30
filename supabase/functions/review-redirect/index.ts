import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FALLBACK = "https://search.google.com/local/writereview?placeid=ChIJbyDA0IjxqzsRJTRiOfxKRR4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") || "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let target = FALLBACK;
  try {
    const { data: s } = await db.from("clinic_settings").select("google_review_link").limit(1).maybeSingle();
    if (s?.google_review_link?.startsWith("http")) target = s.google_review_link;
    if (UUID.test(t)) {
      const { data: row } = await db.from("review_requests").select("id,status,clicked_at").eq("tracking_token", t).maybeSingle();
      if (row && !row.clicked_at) {
        await db.from("review_requests").update({
          clicked_at: new Date().toISOString(),
          status: row.status === "submitted" ? "submitted" : "clicked",
        }).eq("id", row.id);
      }
    }
  } catch (e) { console.error("[review-redirect]", e); }
  return new Response(null, { status: 302, headers: { Location: target } });
});
