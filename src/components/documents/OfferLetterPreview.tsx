import { displayVars, fillTokens, OFFER_BRAND, OFFER_CONFIG, type LetterConfig, type OfferClause, type LetterVars } from "@/lib/offerLetterTemplate";

const esc = (s: string) =>
  (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function buildOfferLetterHTML(clauses: OfferClause[], vars: LetterVars, logoUrl?: string, cfg: LetterConfig = OFFER_CONFIG) {
  const d = displayVars(vars);
  const isConfirmation = cfg.kind === "confirmation";
  const themed = true;
  const badge = cfg.kind === "confirmation" ? "CONFIRMATION ORDER" : cfg.kind === "appointment" ? "APPOINTMENT ORDER" : "OFFER LETTER";
  const clauseHtml = clauses.map((c, i) => {
    const filledBody = fillTokens(c.body, vars);
    if (isConfirmation && i === 2) {
      const bodyLines = filledBody.split("\n");
      const referenceValues = bodyLines.slice(0, 3).map((line) => line.split(":").slice(1).join(":").trim());
      const remainder = bodyLines.slice(4).join("\n");
      const referenceLabels = ["Confirmation Order No", "Confirmation Order Date", "Effective Date"];
      return `<div class="clause reference-clause"><h3>${i + 1}. ${esc(c.title)}</h3><div class="clause-content">
        <div class="reference-grid">${referenceLabels.map((label, index) => `<div><b>${label}</b><span>${esc(referenceValues[index] || "")}</span></div>`).join("")}</div>
        <p>${esc(remainder).replace(/\n/g, "<br/>")}</p></div></div>`;
    }
    return `<div class="clause"><h3>${i + 1}. ${esc(c.title)}</h3><div class="clause-content"><p>${esc(filledBody).replace(/\n/g, "<br/>")}</p></div></div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${cfg.docName} - ${esc(d.candidate_name)}</title>
<style>
@page{size:A4;margin:16mm}
body{font-family:Georgia,'Times New Roman',serif;color:#172033;margin:0;font-size:12.5px;line-height:1.55}
.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #155e75;padding-bottom:10px}
.hdr .n{font-size:20px;font-weight:700;letter-spacing:.5px;color:#155e75}
.hdr .t{font-size:11px;color:#5b6472;margin-top:2px}
.hdr img{max-height:60px;max-width:140px;object-fit:contain}
h1{text-align:center;font-size:18px;letter-spacing:4px;margin:18px 0 10px}
.bar{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #cbd1d9;background:#f4f6f8;font-size:11px}
.bar div{padding:6px 8px;border-right:1px solid #cbd1d9}.bar div:last-child{border-right:0}
.bar b{display:block;color:#5b6472;font-weight:600;font-size:10px;text-transform:uppercase}
.clause{margin-top:12px;page-break-inside:avoid}
.clause h3{font-size:13px;margin:0 0 4px;color:#155e75;text-transform:uppercase}.clause p{margin:0;text-align:justify}
.sig{display:flex;justify-content:space-between;margin-top:48px;gap:40px;page-break-inside:avoid}
.sig div{flex:1;border-top:1px solid #172033;padding-top:6px;font-size:11px;text-align:center}
body.confirmation{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.confirmation .confirmation-header{display:flex;align-items:center;justify-content:space-between;gap:18px;background:#7cb342;border:1px solid #7cb342;padding:13px 16px}
.confirmation .confirmation-brand{display:flex;align-items:center;gap:12px;min-width:0}
.confirmation .confirmation-brand img{width:54px;height:54px;object-fit:contain;background:#fff;border-radius:4px;padding:3px}
.confirmation .confirmation-brand .n{font-family:Arial,sans-serif;font-size:19px;font-weight:800;color:#111827;line-height:1.15}
.confirmation .confirmation-brand .t{font-family:Arial,sans-serif;font-size:10px;font-weight:600;color:#263313;margin-top:3px}
.confirmation .confirmation-title{flex:0 0 auto;background:#fff;border:1px solid #5f902e;padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;font-weight:800;color:#111827;letter-spacing:.5px}
.confirmation .bar{margin-top:12px;border-color:#7cb342;background:#f1f8e9}
.confirmation .bar div{border-color:#7cb342;padding:8px 9px}
.confirmation .bar b{color:#34451f;font-weight:700}
.confirmation .clause{margin-top:12px;border:1px solid #7cb342}
.confirmation .clause h3{margin:0;background:#7cb342;color:#111827;border-bottom:1px solid #659b31;padding:7px 10px;font-family:Arial,sans-serif;font-size:11.5px;font-weight:800;letter-spacing:.15px}
.confirmation .clause-content{padding:9px 10px}
.confirmation .reference-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #7cb342;background:#f1f8e9;margin-bottom:10px}
.confirmation .reference-grid div{padding:7px 8px;border-right:1px solid #7cb342}
.confirmation .reference-grid div:last-child{border-right:0}
.confirmation .reference-grid b{display:block;color:#34451f;font-family:Arial,sans-serif;font-size:9px;text-transform:uppercase}
.confirmation .reference-grid span{display:block;color:#111827;font-weight:700;margin-top:2px}
.confirmation .sig div{border-color:#7cb342}
@media print{body.confirmation,.confirmation .confirmation-header,.confirmation .confirmation-title,.confirmation .bar,.confirmation .clause h3,.confirmation .reference-grid{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style></head><body>
${themed ? `<div class="confirmation-header"><div class="confirmation-brand">${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo"/>` : ""}<div><div class="n">${OFFER_BRAND.name}</div><div class="t">${OFFER_BRAND.tagline}</div></div></div><div class="confirmation-title">${badge}</div></div>` : `<div class="hdr"><div><div class="n">${OFFER_BRAND.name}</div><div class="t">${OFFER_BRAND.tagline}</div></div>${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo"/>` : ""}</div><h1>${cfg.title}</h1>`}
<div class="bar">${cfg.bar.map((b) => `<div><b>${esc(b.label)}</b>${esc(d[b.k] || "")}</div>`).join("")}</div>
${clauseHtml}
<div class="sig"><div>${cfg.signLeft}</div><div>${cfg.signRight}</div></div>
</body></html>`.replace("<body>", `<body${themed ? ' class="confirmation"' : ""}>`);
}

export default function OfferLetterPreview({ clauses, vars, logoUrl, cfg = OFFER_CONFIG }: { clauses: OfferClause[]; vars: LetterVars; logoUrl?: string; cfg?: LetterConfig }) {
  const previewHtml = buildOfferLetterHTML(clauses, vars, logoUrl, cfg).replace(/<body([^>]*)>/, '<body$1 style="padding:24px">');
  return (
    <iframe
      title={`${cfg.docName} preview`}
      className="w-full h-[70vh] rounded-md border bg-card"
      srcDoc={previewHtml}
    />
  );
}
