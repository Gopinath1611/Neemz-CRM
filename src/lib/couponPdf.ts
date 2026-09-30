import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { fetchClinicBranding } from "@/lib/clinicBranding";

const BUCKET = "clinic-assets";

export interface CouponPdfInput {
  couponCode: string;
  patientName: string;
  institutionName?: string | null;
  offerType: string;
  discountPercentage: number;
  expiryDate?: string | null;
  recommendedTreatment?: string | null;
}

const prettify = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/** Generates a branded coupon PDF, uploads it and returns a public download URL. */
export async function generateCouponPdfUrl(input: CouponPdfInput): Promise<string> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 50;
  let clinicName = "Dental Clinic";
  try {
    const b = await fetchClinicBranding();
    clinicName = b.name || clinicName;
  } catch { /* noop */ }
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(clinicName, pageWidth / 2, y, { align: "center" });
  y += 24;
  doc.setFontSize(14);
  doc.setTextColor(70);
  doc.text("Dental Camp Coupon", pageWidth / 2, y, { align: "center" });
  y += 16;

  // Coupon card
  const cardX = 50;
  const cardW = pageWidth - 100;
  const cardY = y + 10;
  const cardH = 200;
  doc.setDrawColor(180);
  doc.setLineWidth(1.2);
  doc.roundedRect(cardX, cardY, cardW, cardH, 10, 10);

  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text("COUPON CODE", cardX + 20, cardY + 30);
  doc.setFontSize(26);
  doc.setTextColor(20);
  doc.text(input.couponCode, cardX + 20, cardY + 60);

  doc.setFontSize(12);
  doc.setTextColor(40);
  const rows: [string, string][] = [
    ["Patient Name", input.patientName || "-"],
    ["Institution", input.institutionName || "-"],
    ["Offer", `${prettify(input.offerType)}${input.discountPercentage ? ` + ${input.discountPercentage}% OFF` : ""}`],
    ["Recommended", input.recommendedTreatment || "Dental Consultation"],
    ["Valid Till", input.expiryDate || "-"],
  ];
  let ry = cardY + 90;
  rows.forEach(([label, value]) => {
    doc.setTextColor(110);
    doc.text(`${label}:`, cardX + 20, ry);
    doc.setTextColor(20);
    doc.text(String(value), cardX + 130, ry);
    ry += 20;
  });

  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Show this coupon at the clinic reception to redeem your offer.", cardX + 20, cardY + cardH + 25);

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("Authorised Signatory", pageWidth - 60, cardY + cardH + 90, { align: "right" });

  const blob = doc.output("blob");
  const path = `coupons/${input.couponCode}-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
