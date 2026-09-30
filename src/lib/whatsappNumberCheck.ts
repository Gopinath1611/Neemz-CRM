import { supabase } from "@/integrations/supabase/client";

export const NOT_ON_WHATSAPP_MESSAGE = "Cannot send: Recipient is not on WhatsApp";

export interface RecipientCheck {
  input: string;
  phone: string;
  ok: boolean;
  code?: "invalid_format" | "blacklisted";
  reason?: string;
}

export const normalizeWhatsAppPhone = (raw: string | null | undefined): string => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
};

export const isValidWhatsAppFormat = (phone: string): boolean => {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  return true;
};

const fetchBlockedMap = async (phones: string[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(phones.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);

    // 1. Check whatsapp_blocked_numbers table
    const { data, error } = await (supabase as any)
      .from("whatsapp_blocked_numbers")
      .select("wa_phone, reason, blocked")
      .in("wa_phone", chunk)
      .eq("blocked", true);

    if (!error && data) {
      (data as any[]).forEach((r: any) => {
        map.set(String(r.wa_phone), String(r.reason || NOT_ON_WHATSAPP_MESSAGE));
      });
    }

    // 2. Check past failed messages in whatsapp_messages with error code 131026
    const { data: failedData, error: failedError } = await (supabase as any)
      .from("whatsapp_messages")
      .select("recipient_phone, error_code")
      .in("recipient_phone", chunk)
      .eq("error_code", "131026");

    if (!failedError && failedData) {
      (failedData as any[]).forEach((r: any) => {
        map.set(String(r.recipient_phone), NOT_ON_WHATSAPP_MESSAGE);
      });
    }
  }
  return map;
};

export const checkWhatsAppRecipient = async (raw: string): Promise<RecipientCheck> => {
  const phone = normalizeWhatsAppPhone(raw);
  if (!phone || !isValidWhatsAppFormat(phone)) {
    return {
      input: raw,
      phone,
      ok: false,
      code: "invalid_format",
      reason: "Enter a valid WhatsApp number with country code (e.g. 919876543210).",
    };
  }
  const blocked = await fetchBlockedMap([phone]);
  if (blocked.has(phone)) {
    return { input: raw, phone, ok: false, code: "blacklisted", reason: blocked.get(phone) };
  }
  return { input: raw, phone, ok: true };
};
