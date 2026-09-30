import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v22.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    if (!wabaId || !token) {
      return json({ ok: false, error: "Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN secrets." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = `${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language,components&limit=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));

    if (!res.ok || body?.error) {
      return json({
        ok: false,
        error: body?.error?.message || `Meta API error ${res.status}`,
        details: body,
      }, 400);
    }

    const templates: Array<any> = Array.isArray(body?.data) ? body.data : [];
    const rows = templates.map((t) => {
      const bodyComp = Array.isArray(t.components)
        ? t.components.find((c: any) => String(c?.type).toUpperCase() === "BODY")
        : null;
      return {
        name: t.name,
        status: t.status,
        category: t.category,
        language: t.language,
        body: bodyComp?.text ?? null,
      };
    });

    let upserted = 0;
    let pruned = 0;
    if (rows.length) {
      const { error } = await supabase
        .from("whatsapp_templates")
        .upsert(rows, { onConflict: "name" });
      if (error) return json({ ok: false, error: error.message }, 400);
      upserted = rows.length;
    }

    // Prune local rows that no longer exist on Meta (two-way sync).
    const liveNames = rows.map((r) => r.name).filter(Boolean);
    if (liveNames.length) {
      const { data: deleted, error: pruneErr } = await supabase
        .from("whatsapp_templates")
        .delete()
        .not("name", "in", `(${liveNames.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(",")})`)
        .select("name");
      if (!pruneErr && Array.isArray(deleted)) pruned = deleted.length;
    }

    return json({ ok: true, count: upserted, pruned, templates: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 500);
  }
});
