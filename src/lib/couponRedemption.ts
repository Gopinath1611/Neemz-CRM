// Coupon lookup + redemption for the Payment step.
//
// Reuses the existing Offline Campaign coupons (campaign_coupons) and the
// screening lead mobile number as the matching key. No schema changes.

import { supabase } from "@/integrations/supabase/client";

export interface CouponRecord {
  id: string;
  coupon_code: string | null;
  offer_type: string | null;
  discount_percentage: number | null;
  expiry_date: string | null;
  redeemed: boolean | null;
  redeemed_date: string | null;
  lead_id: string;
  created_at: string;
}

export interface CouponLookup {
  ok: boolean;
  coupon?: CouponRecord;
  reason?: string;
}

/** Last 10 digits, ignoring +91 / spaces / dashes. */
export const phoneKey = (raw: string | null | undefined): string => {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

const isExpired = (c: CouponRecord) =>
  !!c.expiry_date && c.expiry_date < new Date().toISOString().slice(0, 10);

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** Mobile numbers of the screening leads behind the given coupons. */
const leadPhones = async (leadIds: string[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(leadIds.filter(Boolean)));
  if (!unique.length) return map;
  const { data } = await supabase
    .from("screening_leads")
    .select("id, mobile")
    .in("id", unique);
  (data || []).forEach((r: any) => map.set(String(r.id), String(r.mobile || "")));
  return map;
};

/**
 * Resolve a typed coupon code. Prefers an unredeemed, unexpired coupon; when
 * the patient's phone is known, a coupon issued to that phone wins.
 */
export const lookupCouponByCode = async (
  code: string,
  patientPhone?: string | null,
): Promise<CouponLookup> => {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, reason: "Enter a coupon code first" };

  const { data, error } = await supabase
    .from("campaign_coupons")
    .select("*")
    .ilike("coupon_code", trimmed)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, reason: "Could not check the coupon. Please try again." };

  const rows = ((data || []) as unknown as CouponRecord[]);
  if (!rows.length) return { ok: false, reason: `Coupon ${trimmed} not found` };

  const phones = await leadPhones(rows.map((r) => r.lead_id));
  const key = phoneKey(patientPhone);

  const usable = rows.filter((r) => !r.redeemed && !isExpired(r));
  const pool = usable.length ? usable : rows;
  const matchingPhone = key
    ? pool.filter((r) => phoneKey(phones.get(r.lead_id)) === key)
    : [];
  const coupon = (matchingPhone[0] || pool[0]) as CouponRecord;

  if (coupon.redeemed) {
    return { ok: false, reason: `Coupon ${trimmed} has already been redeemed`, coupon };
  }
  if (isExpired(coupon)) {
    return { ok: false, reason: `Coupon ${trimmed} expired on ${formatDate(coupon.expiry_date!)}`, coupon };
  }
  if (key && phones.get(coupon.lead_id) && phoneKey(phones.get(coupon.lead_id)) !== key) {
    return { ok: false, reason: `Coupon ${trimmed} belongs to a different phone number`, coupon };
  }
  if (!coupon.discount_percentage) {
    return { ok: false, reason: `Coupon ${trimmed} has no discount value set`, coupon };
  }
  return { ok: true, coupon };
};

/** Pending, unexpired coupon issued to this phone number (offline campaign leads). */
export const findPendingCouponForPhone = async (
  phone: string | null | undefined,
): Promise<CouponRecord | null> => {
  const key = phoneKey(phone);
  if (key.length < 10) return null;

  const { data: leads } = await supabase
    .from("screening_leads")
    .select("id, mobile")
    .ilike("mobile", `%${key}`);

  const ids = (leads || [])
    .filter((l: any) => phoneKey(l.mobile) === key)
    .map((l: any) => String(l.id));
  if (!ids.length) return null;

  const { data } = await supabase
    .from("campaign_coupons")
    .select("*")
    .in("lead_id", ids)
    .eq("redeemed", false)
    .not("coupon_code", "is", null)
    .order("created_at", { ascending: false });

  const rows = ((data || []) as unknown as CouponRecord[]).filter(
    (c) => !isExpired(c) && !!c.discount_percentage,
  );
  return rows[0] || null;
};

export const markCouponRedeemed = async (couponId: string) => {
  const { error } = await supabase
    .from("campaign_coupons")
    .update({ redeemed: true, redeemed_date: new Date().toISOString().slice(0, 10) })
    .eq("id", couponId);
  return !error;
};

export const couponOfferLabel = (c: CouponRecord): string => {
  const type = (c.offer_type || "discount").replace(/_/g, " ");
  return `${c.discount_percentage || 0}% ${type}`;
};
