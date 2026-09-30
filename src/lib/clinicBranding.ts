import { supabase } from "@/integrations/supabase/client";
import type jsPDF from "jspdf";

export interface ClinicBranding {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
}

const DEFAULT_BRANDING: ClinicBranding = {
  name: "Dr Neemz Dentistry",
  address: "Salem, Tamil Nadu",
  phone: "",
  email: "",
  website: "",
  logo_url: "",
};

let cached: ClinicBranding | null = null;
let inflight: Promise<ClinicBranding> | null = null;

export const getCachedClinicBranding = (): ClinicBranding => cached ?? DEFAULT_BRANDING;

export const fetchClinicBranding = async (force = false): Promise<ClinicBranding> => {
  if (!force && cached) return cached;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("clinic_settings")
        .select("clinic_name, address, phone, email, website, logo_url")
        .limit(1)
        .maybeSingle();
      cached = {
        name: (data as any)?.clinic_name?.trim() || DEFAULT_BRANDING.name,
        address: (data as any)?.address?.trim() || DEFAULT_BRANDING.address,
        phone: (data as any)?.phone?.trim() || "",
        email: (data as any)?.email?.trim() || "",
        website: (data as any)?.website?.trim() || "",
        logo_url: (data as any)?.logo_url?.trim() || "",
      };
    } catch {
      cached = DEFAULT_BRANDING;
    } finally {
      inflight = null;
    }
    return cached!;
  })();
  return inflight;
};

const esc = (s: string) =>
  (s || "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

export const buildClinicPrintHeaderHTML = (b: ClinicBranding) => {
  const logo = b.logo_url
    ? `<img src="${esc(b.logo_url)}" alt="logo" style="max-height:64px;max-width:160px;object-fit:contain;margin:0 auto 8px;display:block;" />`
    : `<div style="font-size:28px;line-height:1;margin-bottom:6px;">🦷</div>`;
  const contactLine = [b.phone, b.email, b.website].filter(Boolean).join(" • ");
  return `
    <div class="clinic-brand-header" style="text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:2px solid #1e3a5f;">
      ${logo}
      <div style="font-size:18px;font-weight:700;color:#1e3a5f;letter-spacing:.3px;">${esc(b.name)}</div>
      ${b.address ? `<div style="font-size:11px;color:#555;margin-top:3px;">${esc(b.address)}</div>` : ""}
      ${contactLine ? `<div style="font-size:11px;color:#555;margin-top:2px;">${esc(contactLine)}</div>` : ""}
    </div>`;
};

export const buildClinicPrintFooterHTML = () => `
  <div class="clinic-brand-footer" style="margin-top:36px;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;color:#555;">
    <div style="font-style:italic;color:#888;">Digital Prescription</div>
    <div style="text-align:right;">
      <div style="border-top:1px solid #333;min-width:180px;padding-top:4px;">Signature of Operator</div>
    </div>
  </div>`;

export const buildBrandedPrintHTML = (params: {
  branding: ClinicBranding;
  title: string;
  bodyHtml: string;
  extraStyles?: string;
}) => {
  const { branding, title, bodyHtml, extraStyles = "" } = params;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;margin:0;color:#222;}
      table{width:100%;border-collapse:collapse;margin:10px 0;}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px;}
      th{background:#f1f5f9;}
      h1,h2,h3{color:#1e3a5f;margin:10px 0 6px;}
      @media print{ button{display:none} body{padding:14px} }
      ${extraStyles}
    </style></head><body>
    ${buildClinicPrintHeaderHTML(branding)}
    <div class="clinic-brand-body">${bodyHtml}</div>
    ${buildClinicPrintFooterHTML()}
  </body></html>`;
};

/**
 * Open a print window with the clinic-branded header + body + footer wrapper.
 * Fetches branding from settings (cached) before opening.
 */
export const openBrandedPrintWindow = async (params: {
  title: string;
  bodyHtml: string;
  width?: number;
  height?: number;
  extraStyles?: string;
}) => {
  const branding = await fetchClinicBranding();
  const { title, bodyHtml, width = 800, height = 700, extraStyles } = params;
  const w = window.open("", "_blank", `width=${width},height=${height}`);
  if (!w) return;
  w.document.write(buildBrandedPrintHTML({ branding, title, bodyHtml, extraStyles }));
  w.document.close();
  // Wait for logo image to load before printing
  setTimeout(() => {
    try { w.focus(); w.print(); } catch { /* ignore */ }
  }, 400);
};

/* ---------- jsPDF helpers ---------- */

const loadImageDataUrl = async (url: string): Promise<{ dataUrl: string; w: number; h: number } | null> => {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
};

/**
 * Draws a centered clinic header (logo + name + address + phone) on top of a jsPDF page.
 * Returns the Y coordinate where body content should start.
 */
export const addClinicPdfHeader = async (
  doc: jsPDF,
  branding?: ClinicBranding,
): Promise<number> => {
  const b = branding ?? (await fetchClinicBranding());
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 12;

  // Logo (if available)
  if (b.logo_url) {
    const img = await loadImageDataUrl(b.logo_url);
    if (img && img.w > 0) {
      const maxH = 16;
      const maxW = 38;
      const ratio = img.w / img.h;
      let h = maxH;
      let w = h * ratio;
      if (w > maxW) { w = maxW; h = w / ratio; }
      try {
        const fmt = img.dataUrl.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(img.dataUrl, fmt, (pageWidth - w) / 2, cursorY, w, h);
        cursorY += h + 2;
      } catch { /* fallback below */ }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 95);
  doc.text(b.name, pageWidth / 2, cursorY + 5, { align: "center" });
  cursorY += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  if (b.address) {
    doc.text(b.address, pageWidth / 2, cursorY + 2, { align: "center" });
    cursorY += 5;
  }
  const contact = [b.phone, b.email].filter(Boolean).join(" • ");
  if (contact) {
    doc.text(contact, pageWidth / 2, cursorY + 2, { align: "center" });
    cursorY += 5;
  }

  // Divider line
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.5);
  doc.line(14, cursorY + 2, pageWidth - 14, cursorY + 2);
  doc.setTextColor(0, 0, 0);
  return cursorY + 8;
};

/**
 * Draws "Digital Prescription" tag and "Signature of Operator" line near the bottom.
 */
export const addClinicPdfFooter = (doc: jsPDF, signatureLabel: string = "Signature of Operator") => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 22;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("Digital Prescription", 14, y);
  // Signature line
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.line(pageWidth - 80, y - 2, pageWidth - 14, y - 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(signatureLabel, pageWidth - 14, y + 3, { align: "right" });
  doc.setTextColor(0, 0, 0);
};
