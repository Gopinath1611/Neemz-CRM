// Generates and uploads patient-facing PDFs (invoice, prescription) to the
// private `patient-documents` bucket, then returns a signed HTTPS URL that
// Meta can pull for the WhatsApp DOCUMENT header.
//
// Meta downloads the document at send time, so a short-lived signed URL
// (24 h) is fine — the file itself stays private after Meta has cached it.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } from "@/lib/clinicBranding";

const BUCKET = "patient-documents";
const SIGNED_TTL_SECONDS = 60 * 60 * 24; // 24h — Meta caches after fetch

const fmt2 = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const safeSegment = (s: string) => String(s || "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "doc";

async function uploadPdfBlob(path: string, pdf: jsPDF): Promise<string> {
  const blob = pdf.output("blob");
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) throw new Error(`Signed URL failed: ${signErr?.message || "unknown"}`);
  return signed.signedUrl;
}

export interface InvoicePdfInput {
  billing: {
    id: string;
    invoice_number?: string | null;
    created_at: string;
    subtotal?: number | null;
    discount_amount?: number | null;
    total_amount: number;
    amount_paid?: number | null;
  };
  items: Array<{
    treatment_type: string;
    description?: string | null;
    quantity?: number | null;
    unit_price: number;
    total_price: number;
  }>;
  patientName: string;
  patientPhone?: string | null;
}

export async function generateInvoicePdfSignedUrl(input: InvoicePdfInput): Promise<string> {
  const branding = await fetchClinicBranding();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const headerEnd = await addClinicPdfHeader(doc, branding);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", pageWidth - 14, headerEnd, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const invNo = input.billing.invoice_number || input.billing.id.slice(0, 8);
  doc.text(`Invoice #: ${invNo}`, pageWidth - 14, headerEnd + 6, { align: "right" });
  doc.text(`Date: ${format(new Date(input.billing.created_at), "dd MMM yyyy")}`, pageWidth - 14, headerEnd + 11, { align: "right" });

  const blockY = headerEnd + 16;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Patient", 14, blockY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${input.patientName}`, 14, blockY + 6);
  if (input.patientPhone) doc.text(`Phone: ${input.patientPhone}`, 14, blockY + 11);

  const balance = Number(input.billing.total_amount || 0) - Number(input.billing.amount_paid || 0);

  autoTable(doc, {
    startY: blockY + 20,
    head: [["#", "Treatment / Item", "Qty", "Unit Price", "Total"]],
    body: input.items.map((it, i) => [
      i + 1,
      `${it.treatment_type}${it.description ? ` - ${it.description}` : ""}`,
      String(it.quantity || 1),
      `Rs.${fmt2(it.unit_price)}`,
      `Rs.${fmt2(it.total_price)}`,
    ]),
    theme: "grid",
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 12 },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    margin: { bottom: 30 },
    didDrawPage: () => addClinicPdfFooter(doc),
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 120;
  doc.setDrawColor(200);
  doc.line(pageWidth / 2, finalY + 5, pageWidth - 14, finalY + 5);
  doc.setFontSize(10);
  doc.text("Subtotal:", pageWidth / 2 + 10, finalY + 14);
  doc.text(`Rs.${fmt2(input.billing.subtotal ?? input.billing.total_amount)}`, pageWidth - 14, finalY + 14, { align: "right" });
  if ((input.billing.discount_amount ?? 0) > 0) {
    doc.text("Discount:", pageWidth / 2 + 10, finalY + 21);
    doc.text(`-Rs.${fmt2(input.billing.discount_amount)}`, pageWidth - 14, finalY + 21, { align: "right" });
  }
  const totalY = finalY + ((input.billing.discount_amount ?? 0) > 0 ? 30 : 22);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Grand Total:", pageWidth / 2 + 10, totalY);
  doc.text(`Rs.${fmt2(input.billing.total_amount)}`, pageWidth - 14, totalY, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Paid:", pageWidth / 2 + 10, totalY + 8);
  doc.text(`Rs.${fmt2(input.billing.amount_paid || 0)}`, pageWidth - 14, totalY + 8, { align: "right" });
  doc.text("Balance:", pageWidth / 2 + 10, totalY + 15);
  doc.text(`Rs.${fmt2(balance)}`, pageWidth - 14, totalY + 15, { align: "right" });

  const path = `invoices/${safeSegment(invNo)}_${Date.now()}.pdf`;
  return uploadPdfBlob(path, doc);
}

/**
 * Same as generateInvoicePdfSignedUrl, but returns the storage object path
 * (e.g. "invoices/INV123_1720000000000.pdf") instead of a signed URL.
 * Used as the dynamic URL-button suffix for the invoice WhatsApp template,
 * whose approved button URL points at /functions/v1/patient-doc/{{1}}.
 */
export async function generateInvoicePdfPath(input: InvoicePdfInput): Promise<string> {
  // Reuse the signed-url generator to build + upload the PDF, then derive the
  // object path from the returned signed URL so we don't duplicate rendering.
  const signedUrl = await generateInvoicePdfSignedUrl(input);
  const match = signedUrl.match(/\/patient-documents\/([^?]+)/);
  if (!match) throw new Error("Could not derive invoice PDF path from signed URL");
  return decodeURIComponent(match[1]);
}

const derivePatientDocumentPath = (signedUrl: string, label: string): string => {
  const match = signedUrl.match(/\/patient-documents\/([^?]+)/);
  if (!match) throw new Error(`Could not derive ${label} PDF path from signed URL`);
  return decodeURIComponent(match[1]);
};

export interface PrescriptionPdfInput {
  patientName: string;
  patientPhone?: string | null;
  doctorName: string;
  date: Date;
  items: Array<{ name: string; dosage?: string | null; days?: number | null; notes?: string | null }>;
}

export async function generatePrescriptionPdfSignedUrl(input: PrescriptionPdfInput): Promise<string> {
  const branding = await fetchClinicBranding();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const headerEnd = await addClinicPdfHeader(doc, branding);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PRESCRIPTION", pageWidth - 14, headerEnd, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${format(input.date, "dd MMM yyyy")}`, pageWidth - 14, headerEnd + 6, { align: "right" });
  doc.text(`Doctor: ${input.doctorName}`, pageWidth - 14, headerEnd + 11, { align: "right" });

  const blockY = headerEnd + 16;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Patient", 14, blockY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${input.patientName}`, 14, blockY + 6);
  if (input.patientPhone) doc.text(`Phone: ${input.patientPhone}`, 14, blockY + 11);

  autoTable(doc, {
    startY: blockY + 20,
    head: [["#", "Medicine", "Dosage", "Days", "Notes"]],
    body: input.items.length
      ? input.items.map((it, i) => [
          i + 1,
          it.name,
          it.dosage || "—",
          it.days ? String(it.days) : "—",
          it.notes || "—",
        ])
      : [["—", "No medicines listed", "—", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 12 } },
    margin: { bottom: 30 },
    didDrawPage: () => addClinicPdfFooter(doc, "Doctor's Signature"),
  });

  const path = `prescriptions/${safeSegment(input.patientName)}_${Date.now()}.pdf`;
  return uploadPdfBlob(path, doc);
}

/**
 * Returns the storage object path for the WhatsApp dynamic URL button.
 * The `patient-doc` edge function signs this private object and redirects
 * patients to the generated prescription PDF.
 */
export async function generatePrescriptionPdfPath(input: PrescriptionPdfInput): Promise<string> {
  const signedUrl = await generatePrescriptionPdfSignedUrl(input);
  return derivePatientDocumentPath(signedUrl, "prescription");
}
