// AI Smile Design - tooth detection + before/after image generation
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function callGateway(body: any) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway ${res.status}: ${text}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, image_url, treatments, photo_type } = await req.json();

    if (action === "detect_teeth") {
      // Vision analysis - return FDI mapping with conditions
      const data = await callGateway({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a dental AI. Analyze the dental photo and identify visible teeth using FDI notation (11-48). Return JSON only.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is a ${photo_type || "smile"} photo. Identify each visible tooth (FDI number) and any visible condition (caries, missing, discoloration, malalignment, broken, healthy). Respond strictly as JSON: { "teeth": [{"fdi": "11", "condition": "healthy", "notes": ""}] }`,
              },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
      });

      const content = data.choices?.[0]?.message?.content || "{}";
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { teeth: [] };

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_simulation") {
      // Edit the photo to show post-treatment result
      const treatmentList = (treatments || [])
        .map((t: any) => `Tooth ${t.tooth}: ${t.treatment}${t.shade ? ` (shade ${t.shade})` : ""}`)
        .join(", ");

      const prompt = `Edit this dental photo to show the EXPECTED post-treatment result. Apply these treatments realistically: ${treatmentList}. 
- Whitening/Bleaching: brighten teeth to natural white shade
- Crown/Veneer: smooth, well-shaped white teeth
- Implant/Bridge: fill missing tooth gaps with natural-looking teeth
- Alignment: straighten crooked teeth
Keep face, lips, and skin natural and unchanged. Only modify teeth area. Photo-realistic result.`;

      const data = await callGateway({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        modalities: ["image", "text"],
      });

      const generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      return new Response(JSON.stringify({ image_url: generatedImage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("smile-design-ai error:", e);
    const msg = e.message || String(e);
    let status = 500;
    if (msg.includes("429")) status = 429;
    if (msg.includes("402")) status = 402;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
