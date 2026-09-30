/**
 * Shared helpers to render a *real* preview of a WhatsApp template message
 * (header / body with the values actually sent / footer / buttons) instead of
 * the raw `[template] name` placeholder that gets stored on the message row.
 *
 * Template definitions come from `whatsapp_templates` first; when a row has an
 * empty body (several do) we fall back once to the `whatsapp-list-templates`
 * edge function, which returns the components straight from Meta, and cache the
 * result in memory for the rest of the session.
 */
import { supabase } from "@/integrations/supabase/client";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";

export type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

export type TemplateDef = {
  name: string;
  language?: string;
  category?: string;
  body: string;
  header_format?: string;
  header_text?: string;
  header_example?: string;
  footer_text?: string;
  buttons: TemplateButton[];
};

export type SentTemplateInfo = {
  name: string;
  bodyParams: string[];
  headerParams: string[];
  headerMediaLink?: string;
  buttonUrlParams: string[];
};

/** Pull the template name + the parameter values that were actually sent. */
export const extractSentTemplate = (payload: any): SentTemplateInfo | null => {
  const tpl = payload?.request?.template || payload?.template;
  const name = typeof tpl?.name === "string" ? tpl.name : "";
  if (!name) return null;
  const comps: any[] = Array.isArray(tpl?.components) ? tpl.components : [];
  const bodyParams: string[] = [];
  const headerParams: string[] = [];
  const buttonUrlParams: string[] = [];
  let headerMediaLink: string | undefined;

  for (const c of comps) {
    const type = String(c?.type || "").toLowerCase();
    const params: any[] = Array.isArray(c?.parameters) ? c.parameters : [];
    if (type === "body") {
      params.forEach((p) => bodyParams.push(String(p?.text ?? p?.payload ?? "")));
    } else if (type === "header") {
      params.forEach((p) => {
        const link = p?.image?.link || p?.document?.link || p?.video?.link;
        if (typeof link === "string" && link) headerMediaLink = link;
        if (typeof p?.text === "string") headerParams.push(p.text);
      });
    } else if (type === "button" && String(c?.sub_type || "").toLowerCase() === "url") {
      const p = params[0];
      buttonUrlParams.push(String(p?.text ?? p?.payload ?? ""));
    }
  }

  return { name, bodyParams, headerParams, buttonUrlParams, headerMediaLink };
};

/** Replace {{1}}, {{2}}… positionally with the values that were sent. */
export const fillTemplateText = (text: string, params: string[]): string =>
  String(text || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const v = params[Number(n) - 1];
      return v == null || v === "" ? "" : v;
    })
    .trim();

// ---- Definition cache -------------------------------------------------------

const cache = new Map<string, TemplateDef>();
let metaFetch: Promise<void> | null = null;
let dbFetch: Promise<void> | null = null;

const normalizeMeta = (t: any): TemplateDef => ({
  name: String(t?.name || ""),
  language: t?.language,
  category: t?.category,
  body: String(t?.body || ""),
  header_format: t?.header_format,
  header_text: t?.header_text,
  header_example: t?.header_example,
  footer_text: t?.footer_text,
  buttons: Array.isArray(t?.buttons) ? t.buttons : [],
});

const loadFromDb = async () => {
  if (!dbFetch) {
    dbFetch = (async () => {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("name, body, language, category, header_media_url");
      for (const row of data || []) {
        const name = String((row as any).name || "");
        if (!name || cache.has(name)) continue;
        if (!String((row as any).body || "").trim()) continue; // let Meta fill it in
        cache.set(name, {
          name,
          language: (row as any).language,
          category: (row as any).category,
          body: String((row as any).body || ""),
          header_example: (row as any).header_media_url || undefined,
          buttons: [],
        });
      }
    })().catch(() => { /* ignore */ });
  }
  await dbFetch;
};

const loadFromMeta = async () => {
  if (!metaFetch) {
    metaFetch = (async () => {
      const headers = await getFunctionAuthHeaders();
      const { data } = await supabase.functions.invoke("whatsapp-list-templates", { body: {}, headers });
      const list = (data as any)?.templates;
      if (!Array.isArray(list)) return;
      for (const t of list) {
        const def = normalizeMeta(t);
        if (def.name) cache.set(def.name, def); // Meta is the richest source
      }
    })().catch(() => { /* ignore */ });
  }
  await metaFetch;
};

/**
 * Resolve template definitions for the given names. Reads the DB rows, then
 * pulls from Meta when anything is still missing or lacks components.
 */
export const resolveTemplateDefs = async (names: string[]): Promise<Map<string, TemplateDef>> => {
  const wanted = Array.from(new Set(names.filter(Boolean)));
  if (!wanted.length) return new Map(cache);
  await loadFromDb();
  const needsMeta = wanted.some((n) => {
    const def = cache.get(n);
    return !def || !def.body || !def.buttons.length;
  });
  if (needsMeta) await loadFromMeta();
  return new Map(cache);
};

/** Seed the cache from an already-loaded template list (e.g. the inbox page). */
export const seedTemplateDefs = (templates: any[]) => {
  for (const t of templates || []) {
    const def = normalizeMeta(t);
    if (def.name) cache.set(def.name, def);
  }
};
