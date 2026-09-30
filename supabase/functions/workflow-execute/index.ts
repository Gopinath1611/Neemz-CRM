// Workflow execution engine
// Runs the configured action nodes of every ACTIVE workflow mapped to a Meta form.
// Called by meta-lead-webhook after a lead is ingested, and can be invoked manually
// for testing: POST { form_id, lead_id?, contact: { name, phone, email, city }, meta_lead_id? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v23.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Any = Record<string, any>;

const slug = (s: string) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function fillTokens(raw: unknown, lead: Any): string {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  const map: Record<string, string> = {
    name: lead.name || "",
    full_name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    city: lead.city || "",
    source: lead.source || "",
    treatment: lead.treatment_interest || "",
  };
  v = v.replace(/\{\{?\s*([a-z_]+)\s*\}?\}/gi, (m, key) => {
    const k = String(key).toLowerCase();
    return k in map ? map[k] : m;
  });
  return v.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

async function resolveWaCredentials(admin: Any) {
  const { data: conn } = await admin
    .from("connected_apps")
    .select("app_credentials, metadata, access_token, updated_at")
    .eq("is_connected", true)
    .or("platform.eq.WhatsApp Business API,platform.eq.WhatsApp API")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const credentials = (conn?.app_credentials as Any) || {};
  const metadata = (conn?.metadata as Any) || {};
  const pick = (keys: string[]) => {
    for (const src of [credentials, metadata, { access_token: conn?.access_token }]) {
      for (const k of keys) {
        const v = (src as Any)?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
    return "";
  };
  const accessToken = pick(["wa_api_key", "access_token", "token", "bearer_token"]) ||
    Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  const phoneNumberId = pick(["wa_phone_id", "phone_number_id"]) || "777081605497413";
  const wabaId = pick(["wa_business_account_id", "waba_id", "business_account_id"]) ||
    Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "";
  return { accessToken, phoneNumberId, wabaId };
}

/** Fetch the approved template definition from Meta so we can build valid components. */
async function fetchTemplateDef(accessToken: string, wabaId: string, name: string, preferredLang: string) {
  if (!wabaId) return null;
  try {
    const url = `${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(name)}&limit=50&fields=name,language,status,components`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = await res.json().catch(() => ({}));
    const list: Any[] = Array.isArray(j?.data) ? j.data.filter((t: Any) => t?.name === name) : [];
    if (!list.length) return null;
    const approved = list.filter((t) => String(t.status).toUpperCase() === "APPROVED");
    const pool = approved.length ? approved : list;
    return pool.find((t) => t.language === preferredLang) ||
      pool.find((t) => String(t.language || "").startsWith(String(preferredLang || "").split("_")[0])) ||
      pool[0];
  } catch (_) {
    return null;
  }
}

const countVars = (text: string) => {
  const found = new Set<number>();
  for (const m of String(text || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(Number(m[1]));
  return found.size ? Math.max(...found) : 0;
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = (await req.json().catch(() => ({}))) as Any;
    const formId = String(payload.form_id || "").trim();
    const workflowIdIn = String(payload.workflow_id || "").trim();
    const metaLeadId = payload.meta_lead_id ? String(payload.meta_lead_id) : null;
    const contact = (payload.contact || {}) as Any;
    let leadId = payload.lead_id ? String(payload.lead_id) : null;

    if (!formId && !workflowIdIn) return json({ ok: false, error: "form_id or workflow_id is required" }, 200);

    // Resolve the lead record (source of truth for tokens/CRM updates)
    let lead: Any = {
      id: leadId,
      name: contact.name || "",
      phone: String(contact.phone || "").replace(/[^\d+]/g, ""),
      email: contact.email || null,
      city: contact.city || null,
      source: contact.source || "Facebook Ads",
      treatment_interest: contact.treatment_interest || "Consultation",
    };
    if (leadId) {
      const { data } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (data) lead = { ...lead, ...data };
    } else if (lead.phone) {
      const { data } = await admin.from("leads").select("*").eq("phone", lead.phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) { lead = { ...lead, ...data }; leadId = data.id; }
    }

    // Find active workflows for this form
    let wfQuery = admin.from("workflows").select("id, name, status, config, meta_form_id");
    wfQuery = workflowIdIn ? wfQuery.eq("id", workflowIdIn) : wfQuery.eq("meta_form_id", formId).eq("status", true);
    const { data: workflows, error: wfErr } = await wfQuery;
    if (wfErr) throw wfErr;
    if (!workflows || workflows.length === 0) return json({ ok: true, matched: 0, executed: [] });

    const executed: Any[] = [];

    for (const wf of workflows) {
      const nodes: Any[] = Array.isArray((wf.config as Any)?.action_nodes) ? (wf.config as Any).action_nodes : [];
      const logs: Any[] = [];
      let allOk = true;
      // Attribution captured while the workflow runs, attached to every message
      // this workflow logs so the send breakdown can trace it back exactly.
      let lastRunId: string | null = null;
      let stageFrom: string | null = null;
      let stageTo: string | null = null;

      const logStep = async (step: string, status: "success" | "failed") => {
        logs.push({ step, status });
        const { data: runRow } = await admin.from("workflow_runs").insert({
          workflow_id: wf.id,
          contact_name: lead.name || null,
          contact_phone: lead.phone || null,
          step,
          status,
          meta_lead_id: metaLeadId,
        }).select("id").maybeSingle();
        if (runRow?.id) lastRunId = String(runRow.id);
      };

      await logStep(`Trigger: lead received${formId ? ` (form ${formId})` : ""}`, "success");


      for (const node of nodes) {
        const key = String(node?.key || "");
        const cfg = (node?.config || {}) as Any;
        try {
          if (key === "add_update_crm") {
            if (!leadId) throw new Error("No lead record to update");
            const update: Any = { updated_at: new Date().toISOString() };

            // Stage-safe: only set the stage on first ingestion. Never overwrite a
            // stage/status a human already moved past "New Lead(s)".
            let keptStage: string | null = null;
            if (cfg.stage) {
              const { data: fresh } = await admin
                .from("leads")
                .select("status")
                .eq("id", leadId)
                .maybeSingle();
              const current = slug(String(fresh?.status ?? ""));
              stageFrom = String(fresh?.status ?? "") || null;
              const isNew = !current || current === "new_lead" || current === "new_leads";
              if (isNew) {
                update.status = slug(cfg.stage);
                stageTo = update.status;
              } else keptStage = String(fresh?.status ?? "");
            }


            if (cfg.pipeline) update.source = cfg.pipeline;
            if (!cfg.skipLeadValueChange && Number(cfg.leadValue) > 0) update.estimated_value = Number(cfg.leadValue);
            const { error } = await admin.from("leads").update(update).eq("id", leadId);
            if (error) throw error;
            lead = { ...lead, ...update };
            await logStep(
              keptStage
                ? `CRM updated → ${cfg.pipeline || "Pipeline"} (stage kept: ${keptStage})`
                : `CRM updated → ${cfg.pipeline || "Pipeline"} • ${cfg.stage || "Stage"}`,
              "success",
            );

          } else if (key === "assign_staff") {
            if (!leadId) throw new Error("No lead record to assign");
            if (cfg.onlyUnassigned && lead.assigned_to) {
              await logStep(`Assign skipped (already assigned to ${lead.assigned_to})`, "success");
            } else {
              const { error } = await admin.from("leads").update({ assigned_to: cfg.staffName || null }).eq("id", leadId);
              if (error) throw error;
              lead.assigned_to = cfg.staffName;
              await logStep(`Assigned to ${cfg.staffName || "staff"}`, "success");
            }
          } else if (key === "remove_assigned_staff") {
            if (leadId) await admin.from("leads").update({ assigned_to: null }).eq("id", leadId);
            lead.assigned_to = null;
            await logStep("Assigned staff removed", "success");
          } else if (key === "whatsapp_message") {
            const templateName = String(cfg.templateName || "").trim();
            if (!templateName) throw new Error("No template configured");
            if (!lead.phone) throw new Error("Lead has no phone number");
            const { accessToken, phoneNumberId, wabaId } = await resolveWaCredentials(admin);
            if (!accessToken) throw new Error("WhatsApp access token missing");

            const requestedLang = String(cfg.language || "en").trim() || "en";
            const def = await fetchTemplateDef(accessToken, wabaId, templateName, requestedLang);
            const langCode = def?.language || requestedLang;
            const defComponents: Any[] = Array.isArray(def?.components) ? def!.components : [];
            const headerComp = defComponents.find((c) => String(c?.type).toUpperCase() === "HEADER");
            const bodyComp = defComponents.find((c) => String(c?.type).toUpperCase() === "BODY");
            const buttonsComp = defComponents.find((c) => String(c?.type).toUpperCase() === "BUTTONS");

            // Configured variables (1-indexed map from the workflow editor)
            const vars = (cfg.variables || {}) as Any;
            const configured = Object.keys(vars)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => fillTokens(vars[k], lead));

            // Required body params come from the approved template text when available
            const requiredBody = bodyComp ? countVars(bodyComp.text || "") : configured.length;
            const fallbackName = lead.name || "there";
            const bodyParams: string[] = [];
            for (let i = 0; i < requiredBody; i++) {
              bodyParams.push(configured[i] || (i === 0 ? fallbackName : "-"));
            }

            const components: Any[] = [];

            // HEADER
            if (headerComp) {
              const fmt = String(headerComp.format || "TEXT").toUpperCase();
              if (fmt === "TEXT") {
                const headerVars = countVars(headerComp.text || "");
                if (headerVars > 0) {
                  const hp = Array.isArray(cfg.headerParams) ? cfg.headerParams : [];
                  components.push({
                    type: "header",
                    parameters: Array.from({ length: headerVars }, (_, i) => ({
                      type: "text",
                      text: fillTokens(hp[i], lead) || fallbackName,
                    })),
                  });
                }
              } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
                let mediaUrl = String(cfg.headerMediaUrl || "").trim();
                if (!mediaUrl) {
                  const { data: tpl } = await admin
                    .from("whatsapp_templates")
                    .select("header_media_url")
                    .eq("name", templateName)
                    .maybeSingle();
                  mediaUrl = String(tpl?.header_media_url || "").trim();
                }
                if (!mediaUrl) {
                  const example = headerComp?.example?.header_handle;
                  if (Array.isArray(example) && example[0]) mediaUrl = String(example[0]);
                }
                if (!mediaUrl) throw new Error(`Template ${templateName} needs a ${fmt.toLowerCase()} header URL`);
                const kind = fmt.toLowerCase();
                components.push({
                  type: "header",
                  parameters: [{
                    type: kind,
                    [kind]: kind === "document" ? { link: mediaUrl, filename: `${templateName}.pdf` } : { link: mediaUrl },
                  }],
                });
              }
            }

            // BODY
            if (bodyParams.length) {
              components.push({ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t || "-" })) });
            }

            // Dynamic URL buttons
            const buttons: Any[] = Array.isArray(buttonsComp?.buttons) ? buttonsComp.buttons : [];
            buttons.forEach((btn, idx) => {
              if (String(btn?.type).toUpperCase() === "URL" && countVars(btn?.url || "") > 0) {
                const bp = Array.isArray(cfg.buttonUrlParams) ? cfg.buttonUrlParams : [];
                components.push({
                  type: "button",
                  sub_type: "url",
                  index: String(idx),
                  parameters: [{ type: "text", text: fillTokens(bp[idx], lead) || lead.id || "1" }],
                });
              }
            });

            const to = lead.phone.replace(/^\+/, "");
            const metaBody: Any = {
              messaging_product: "whatsapp",
              to,
              type: "template",
              template: {
                name: templateName,
                language: { code: langCode },
                ...(components.length ? { components } : {}),
              },
            };
            const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(metaBody),
            });
            const resJson = await res.json().catch(() => ({}));
            if (!res.ok || resJson?.error) {
              const e = resJson?.error;
              const detail = [e?.message, e?.error_data?.details, e?.code != null ? `code ${e.code}` : null]
                .filter(Boolean).join(" · ");
              throw new Error(detail || `WhatsApp send failed (${res.status})`);
            }

            // Store the rendered template text (variables filled) so chat history
            // shows the real message instead of "[template] name".
            const renderedText = (() => {
              const raw = String(bodyComp?.text || "");
              if (!raw) return `[template] ${templateName}`;
              return raw.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m: string, n: string) => bodyParams[Number(n) - 1] ?? "").trim();
            })();

            // Persist outbound message (best-effort)
            try {
              const { data: thread } = await admin
                .from("whatsapp_threads")
                .upsert({ wa_phone: to, last_message: renderedText, last_message_at: new Date().toISOString() }, { onConflict: "wa_phone" })
                .select("id")
                .single();
              if (thread) {
                await admin.from("whatsapp_messages").insert({
                  thread_id: thread.id,
                  wa_message_id: resJson?.messages?.[0]?.id ?? null,
                  direction: "out",
                  text: renderedText,
                  payload: { request: { ...metaBody, source: "workflow" }, response: resJson },
                  status: "sent",
                  status_updated_at: new Date().toISOString(),
                  module: "marketing",
                  message_kind: "workflow_template",
                  workflow_id: wf.id,
                  workflow_run_id: lastRunId,
                  lead_id: leadId,
                  stage_from: stageFrom,
                  stage_to: stageTo,
                  send_context: {
                    workflow_name: wf.name ?? null,
                    form_id: formId || null,
                    meta_lead_id: metaLeadId,
                    template_name: templateName,
                    node_key: key,
                  },
                });

              }
            } catch (_) { /* ignore */ }
            await logStep(`WhatsApp template sent → ${templateName}`, "success");
          } else {
            await logStep(`Skipped unsupported action: ${node?.title || key}`, "success");
          }
        } catch (err) {
          allOk = false;
          const msg = err instanceof Error ? err.message : "Unknown error";
          await logStep(`${node?.title || key} failed: ${msg}`, "failed");
        }
      }

      // Counters: every triggered contact counts; completed only on a clean run
      const { data: current } = await admin
        .from("workflows")
        .select("total_contacts, completed")
        .eq("id", wf.id)
        .maybeSingle();
      await admin
        .from("workflows")
        .update({
          total_contacts: (current?.total_contacts || 0) + 1,
          completed: (current?.completed || 0) + (allOk ? 1 : 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", wf.id);

      executed.push({ workflow_id: wf.id, workflow: wf.name, ok: allOk, steps: logs });
    }

    return json({ ok: true, matched: workflows.length, lead_id: leadId, executed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("workflow-execute error:", msg);
    return json({ ok: false, error: msg }, 200);
  }
});
