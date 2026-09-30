// Central WhatsApp send helper for Clinic Workflow touchpoints.
//
// Contract:
//   - If an approved Meta template is registered for the given `templateKey`,
//     the message is sent via the `whatsapp-send-message` edge function
//     (real API delivery, logged to whatsapp_messages, visible in inbox).
//   - Otherwise (no template registered, or send fails) it gracefully falls
//     back to opening https://wa.me/<phone>?text=... in a new tab so the
//     workflow buttons never break while more templates are being approved.
//
// Add a new approved template: append it to TEMPLATE_REGISTRY below.

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type WorkflowTemplateKey =
  | "welcome"
  | "appointment_confirmation"
  | "appointment_booking_confirmation"
  | "patient_welcome_flex"
  | "payment_invoice"
  | "prescription_share"
  | "treatment_document"
  | "diagnostic_order"
  | "google_review_request"
  | "camp_coupon_pdf";

interface TemplateBinding {
  /** Exact approved Meta template name */
  name: string;
  /** Approved language code (usually "en" or "en_US") */
  lang: string;
  /** Header format on Meta side */
  header: "none" | "text" | "image" | "video" | "document";
}

// Only add entries here AFTER the template is approved in Meta and (if it has
// a media header) its header_media_url is stored on public.whatsapp_templates.
const TEMPLATE_REGISTRY: Partial<Record<WorkflowTemplateKey, TemplateBinding>> = {
  welcome: { name: "drneemz_welcome", lang: "en", header: "image" },
  appointment_confirmation: { name: "appointment_confirmation", lang: "en", header: "none" },
  appointment_booking_confirmation: { name: "app_booking_confirm_v2", lang: "en", header: "text" },
  patient_welcome_flex: { name: "fl_checkin_welcome", lang: "en_US", header: "none" },
  // payment_invoice: `fl_invoice_ready` — TEXT header (no vars), 4 BODY params
  // (patient, treatment, amount, invoice#), + dynamic URL button whose {{1}}
  // must be supplied via buttonUrlParams[0] (invoice number / document id).
  payment_invoice: { name: "fl_invoice_ready", lang: "en", header: "text" },
  prescription_share: { name: "fl_prescription_ready", lang: "en", header: "text" },
  diagnostic_order: { name: "patient_lab_referral", lang: "en_US", header: "none" },
  google_review_request: { name: "fl_checkout_google_review", lang: "en", header: "text" },
  // camp_coupon_pdf: no header on the approved template,
  // 5 BODY params: name, coupon code, camp name, offer, expiry date.
  camp_coupon_pdf: { name: "camp_coupon_pdf", lang: "en_US", header: "none" },
  // treatment_document:       { name: "treatment_document",       lang: "en", header: "document" },
  // google_review_request:    { name: "google_review_request",    lang: "en", header: "none" },
};

const STRICT_BODY_PARAM_COUNTS: Partial<Record<string, number>> = {
  appointment_booking_confirm: 6,
  app_booking_confirm: 6,
  app_booking_confirm_v2: 5,
  patient_welcome_flex: 4,
  fl_checkin_welcome: 3,
  inv_down: 4,
  inv_down_v2: 4,
  fl_invoice_ready: 4,
  invoice_download_v2: 4,
  invoice_sharing: 4,
  payment_sharing: 4,
  prescrip_downl: 1,
  prescription_download: 1,
  prescription_download_v2: 1,
  prescription_download_v3: 1,
  fl_prescription_download_v3: 1,
  fl_prescription_ready: 3,
  patient_lab_referral: 5,
  patient_payment_receipt: 4,
  google_review_request: 1,
  fl_checkout_google_review: 1,
  camp_coupon_pdf: 5,
};

export interface WhatsAppPatientLike {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  name?: string | null;
}

/**
 * Attribution context attached to every logged send so the "Messages Sent"
 * drill-down can trace a message back to what triggered it.
 * All fields are optional; the backend derives sensible fallbacks.
 */
export interface WhatsAppSendContext {
  module?: "clinic" | "marketing" | "bot" | "manual" | "system";
  messageKind?: string;
  workflowId?: string | null;
  workflowRunId?: string | null;
  campaignId?: string | null;
  stageFrom?: string | null;
  stageTo?: string | null;
  appointmentId?: string | null;
  leadId?: string | null;
  patientId?: string | null;
}

export interface SendClinicWhatsAppArgs {
  patient: WhatsAppPatientLike | null | undefined;
  /** Template key from the registry above. Optional — omit to force text fallback. */
  templateKey?: WorkflowTemplateKey;
  /** Body params for the template (e.g. [patientName]). */
  bodyParams?: string[];
  /** Optional text header parameters for templates with TEXT headers. */
  headerParams?: string[];
  /** Optional URL button parameters, keyed by Meta button index. */
  buttonUrlParams?: string[];
  /** Override header media URL (public HTTPS). Falls back to the stored one on the template row. */
  headerImageUrl?: string;
  headerVideoUrl?: string;
  headerDocumentUrl?: string;
  /** Fallback plain-text message used for the wa.me link when template is unavailable. */
  fallbackText: string;
  /** Optional short label used in the success toast (e.g. "Welcome", "Invoice"). */
  label?: string;
  /** Optional full override for the success toast title (takes precedence over `label`). */
  successToastTitle?: string;
  /** Optional full override for the success toast description. */
  successToastDescription?: string;
  /** Attribution context for the send log. Defaults to the clinic module. */
  context?: WhatsAppSendContext;
}


/** Normalise Indian phone numbers to E.164-ish (+91XXXXXXXXXX) for Meta API. */
export const normaliseIndianPhone = (raw: string | null | undefined): string => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const openWaMe = (phone: string, text: string) => {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
};

const normalizeTemplateTextParam = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const getVerifiedAccessToken = async (): Promise<string | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentToken = sessionData.session?.access_token;

  if (currentToken) {
    const { data: userData, error: userError } = await supabase.auth.getUser(currentToken);
    if (!userError && userData.user) return currentToken;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedToken = refreshedData.session?.access_token;
  if (refreshError || !refreshedToken) return null;

  const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.getUser(refreshedToken);
  return !refreshedUserError && refreshedUserData.user ? refreshedToken : null;
};

const isUnauthorizedFunctionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const context = "context" in error
    ? (error as { context?: { status?: number; response?: { status?: number } } }).context
    : undefined;
  return context?.status === 401 || context?.response?.status === 401;
};

export async function sendClinicWhatsApp({
  patient,
  templateKey,
  bodyParams,
  headerParams,
  buttonUrlParams,
  headerImageUrl,
  headerVideoUrl,
  headerDocumentUrl,
  fallbackText,
  label,
  successToastTitle,
  successToastDescription,
  context,
}: SendClinicWhatsAppArgs): Promise<{ ok: boolean; via: "template" | "wa.me" | "none" }> {

  const phone = normaliseIndianPhone(patient?.phone);
  if (!phone) {
    toast({
      title: "No phone number",
      description: "Patient phone is missing. Add it in Check-in first.",
      variant: "destructive",
    });
    return { ok: false, via: "none" };
  }

  const binding = templateKey ? TEMPLATE_REGISTRY[templateKey] : undefined;

  // Derive a default body param (patient first name) if caller didn't specify.
  const inferredName =
    patient?.first_name?.trim() ||
    patient?.name?.split(" ")[0] ||
    "there";
  const finalBodyParams = bodyParams && bodyParams.length > 0
    ? bodyParams.map(normalizeTemplateTextParam)
    : [inferredName];

  if (binding) {
    try {
      const requiredCount = STRICT_BODY_PARAM_COUNTS[binding.name];
      const emptyBodyParamIndexes = finalBodyParams
        .map((value, index) => (value ? -1 : index + 1))
        .filter((index) => index > 0);
      if (requiredCount && (finalBodyParams.length !== requiredCount || emptyBodyParamIndexes.length > 0)) {
        console.error("[sendClinicWhatsApp] strict template param mismatch", {
          templateName: binding.name,
          languageCode: binding.lang,
          requiredCount,
          suppliedCount: finalBodyParams.length,
          emptyBodyParamIndexes,
          bodyParams: finalBodyParams,
        });
        toast({
          title: "WhatsApp send failed",
          description: emptyBodyParamIndexes.length
            ? `${binding.name} has empty body parameter(s): ${emptyBodyParamIndexes.join(", ")}.`
            : `${binding.name} requires exactly ${requiredCount} body parameters; got ${finalBodyParams.length}.`,
          variant: "destructive",
        });
        return { ok: false, via: "none" };
      }

      const payload: Record<string, unknown> = {
        to: phone,
        type: "template",
        templateName: binding.name,
        languageCode: binding.lang,
        bodyParams: finalBodyParams,
      };
      if (headerParams?.length) payload.headerParams = headerParams.map(normalizeTemplateTextParam);
      if (buttonUrlParams?.length) payload.buttonUrlParams = buttonUrlParams.map(normalizeTemplateTextParam);
      // Every clinic-workflow touchpoint is attributed to the clinic module unless
      // the caller overrides it (e.g. camp coupons are marketing). `source` is left
      // untouched so existing category/source reporting keeps its current meaning.
      payload.context = { module: "clinic", ...(context || {}) };


      if (headerImageUrl) payload.headerImageUrl = headerImageUrl;
      if (headerVideoUrl) payload.headerVideoUrl = headerVideoUrl;
      if (headerDocumentUrl) payload.headerDocumentUrl = headerDocumentUrl;

      console.log("[sendClinicWhatsApp] invoking whatsapp-send-message", payload);
      const accessToken = await getVerifiedAccessToken();
      if (!accessToken) {
        toast({
          title: "Session expired",
          description: "Please sign in again to send WhatsApp messages.",
          variant: "destructive",
        });
        return { ok: false, via: "none" };
      }
      let { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: payload,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // A session can be revoked between validation and invocation (for example,
      // after refresh-token rotation in another tab). Refresh and retry once.
      if (isUnauthorizedFunctionError(error)) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
        const retryToken = refreshedData.session?.access_token;
        if (!refreshError && retryToken) {
          const retry = await supabase.functions.invoke("whatsapp-send-message", {
            body: payload,
            headers: { Authorization: `Bearer ${retryToken}` },
          });
          data = retry.data;
          error = retry.error;
        }
      }

      // Edge function now returns HTTP 200 with { ok: false, ... } on Meta errors,
      // so `data` carries the full Meta payload. `error` only fires on true HTTP failures.
      let errBody: any = null;
      if (error && (error as any).context?.response) {
        try {
          errBody = await (error as any).context.response.clone().json();
        } catch {
          try { errBody = await (error as any).context.response.clone().text(); } catch { /* ignore */ }
        }
      }
      const res = (data ?? errBody) as {
        ok?: boolean; error?: string; code?: number | null; subcode?: number | null;
        fbtrace_id?: string | null; error_data?: unknown; details?: unknown;
        stage?: string; raw?: unknown; messageId?: string;
      } | null;

      console.log("[sendClinicWhatsApp] edge response", { data, error, errBody });

      if (error || !res?.ok) {
        console.error("[Meta API error]", { error, res, errBody });
        const parts: string[] = [];
        if (res?.error) parts.push(res.error);
        if (res?.code != null) parts.push(`code ${res.code}`);
        if (res?.subcode != null) parts.push(`subcode ${res.subcode}`);
        if (res?.fbtrace_id) parts.push(`trace ${res.fbtrace_id}`);
        const detail = parts.length
          ? parts.join(" · ")
          : (typeof errBody === "string" ? errBody : (error?.message || "Meta API rejected the request"));
        toast({
          title: `Template send failed: ${binding.name}`,
          description: `${detail}. Opened WhatsApp text fallback.`,
          variant: "destructive",
        });
        openWaMe(phone, fallbackText);
        return { ok: true, via: "wa.me" };
      }


      toast({
        title: successToastTitle || `${label || "WhatsApp"} sent ✓`,
        description: successToastDescription || `Delivered to +${phone} via ${binding.name}`,
      });
      return { ok: true, via: "template" };
    } catch (err: any) {
      console.error("[sendClinicWhatsApp] unexpected exception", err);
      toast({
        title: "WhatsApp send failed",
        description: err?.message || "Unexpected error calling Meta API.",
        variant: "destructive",
      });
      return { ok: false, via: "none" };
    }
  }

  // No template registered for this touchpoint yet — safe fallback.
  openWaMe(phone, fallbackText);
  return { ok: true, via: "wa.me" };
}

/** Small util for check-in "Welcome" quick action. */
export function buildWelcomeText(firstName: string, clinicName = "our clinic") {
  return `Hi ${firstName}, welcome to ${clinicName}! We're glad to have you here. 😊`;
}
