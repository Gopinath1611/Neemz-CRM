import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { attendanceBreakdown } from "@/lib/payslipPdf";
import { fetchClinicBranding, getCachedClinicBranding, type ClinicBranding } from "@/lib/clinicBranding";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

interface Props {
  record: any | null;
  onClose: () => void;
}

/* The slip is styled inline (print document, fixed black-on-white) so the
   on-screen view and the printed copy are identical. */
const INK = "#172033";
const MUTED_INK = "#5b6472";
const LINE = "#cbd1d9";
const SOFT = "#f4f6f8";
const ACCENT = "#155e75";

const S = {
  doc: {
    background: "#fff",
    color: INK,
    border: `1px solid ${INK}`,
    padding: 30,
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 11,
    lineHeight: 1.45,
    maxWidth: 794,
    minHeight: 1000,
    margin: "0 auto",
    boxSizing: "border-box",
  } as React.CSSProperties,
  sectionLabel: {
    marginBottom: 8,
    color: MUTED_INK,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  th: {
    borderBottom: `1px solid ${INK}`,
    padding: "8px 10px",
    background: SOFT,
    textAlign: "left" as const,
    fontSize: 10,
    fontWeight: 700,
  },
  td: { borderBottom: `1px solid ${LINE}`, padding: "8px 10px" },
  num: {
    borderBottom: `1px solid ${LINE}`,
    padding: "8px 10px",
    textAlign: "right" as const,
    whiteSpace: "nowrap" as const,
    fontVariantNumeric: "tabular-nums",
  },
};

export default function SalarySlipDocument({ record, onClose }: Props) {
  const [branding, setBranding] = useState<ClinicBranding>(getCachedClinicBranding());
  const slipRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchClinicBranding().then(setBranding); }, []);

  if (!record) return null;
  const emp = record.employees || {};
  const b = attendanceBreakdown(record);
  const period = `${MONTHS[(record.month || 1) - 1]} ${record.year || ""}`;

  // Same split already used by the existing payslip (no formula changes).
  const monthly = b.monthlyBase || Number(record.gross_salary || 0);
  const basic = Math.round(monthly * 0.5);
  const hra = Math.round(monthly * 0.2);
  const conveyance = Math.round(monthly * 0.08);
  const medical = Math.round(monthly * 0.05);
  const special = Math.round(monthly - basic - hra - conveyance - medical);
  const earnings: [string, number][] = [
    ["Basic Pay", basic], ["Medical Allowance", medical], ["Housing Allowance (HRA)", hra],
    ["Conveyance Allowance", conveyance], ["Special / Food Allowance", special], ["Overtime Allowance", 0],
  ];
  const pf = Number(record.pf_deduction || 0);
  const esi = Number(record.esi_deduction || 0);
  const tax = Number(record.tax_deduction || 0);
  const other = Number(record.other_deductions || 0);
  const deductions: [string, number][] = [
    ["EPF / PF", pf], ["ESI / Health Insurance", esi], ["Loss of Pay (LOP)", b.lopAmount],
    ["Loan Repayment", 0], ["Advance Repayment", 0], ["Professional Tax", tax],
    ...(other > 0 ? [["Other Deductions", other] as [string, number]] : []),
  ];
  const totalE = earnings.reduce((s, [, v]) => s + v, 0);
  const totalD = deductions.reduce((s, [, v]) => s + v, 0);
  const net = Math.max(0, totalE - totalD);
  const rows = Math.max(earnings.length, deductions.length);

  const acct = String(emp.bank_account_number || "").trim();
  const acctMasked = acct ? (acct.length > 4 ? `XXXX${acct.slice(-4)}` : acct) : "-";
  const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "-";
  const cap = (s: any) => String(s || "-").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const meta: [string, string, string, string][] = [
    ["Employee Id", emp.employee_code || "-", "Name", name],
    ["Department", cap(emp.department), "Designation", cap(emp.designation)],
    ["Days Worked", String(b.daysWorked), "Bank Acct / Cheque Number", acctMasked],
    ["Casual Leave", String(b.paidLeaveDays), "Earned Leave", "0"],
    ["Overtime Hours", "0", "", ""],
  ];

  const print = () => {
    const html = slipRef.current?.outerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Payslip - ${name} - ${period}</title>
      <style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
      </head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 400);
  };

  const contact = [branding.phone, branding.email, branding.website].filter(Boolean).join(" • ");
  /* Payslip header shows the full legal name even though Clinic Settings stores the short name. */
  const displayName = branding.name === "Dr Neemz Dentistry" ? "Dr Neemz Dentistry Pvt Ltd" : branding.name;

  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b bg-background px-5 py-4 pr-12">
          <div>
            <DialogTitle>Salary Slip</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">{name} · {period}</p>
          </div>
          <Button size="sm" onClick={print}><Printer className="mr-2 h-4 w-4" /> Print / Download PDF</Button>
        </DialogHeader>
        <div className="max-h-[calc(94vh-73px)] overflow-auto bg-muted/40 p-3 sm:p-6">
          <div ref={slipRef} style={S.doc}>
            <div style={{ position: "relative", textAlign: "center", borderBottom: `2px solid ${INK}`, padding: "2px 110px 18px", minHeight: 86 }}>
              {branding.logo_url && (
                <img src={branding.logo_url} alt="Clinic logo" style={{ position: "absolute", right: 2, top: 0, width: 72, height: 72, objectFit: "contain" }} />
              )}
              <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: ".2px" }}>{displayName}</div>
              {branding.address && <div style={{ marginTop: 5, color: MUTED_INK, fontSize: 10 }}>{branding.address}</div>}
              {contact && <div style={{ marginTop: 3, color: MUTED_INK, fontSize: 10 }}>{contact}</div>}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${LINE}`, padding: "15px 2px 13px" }}>
              <div>
                <div style={{ color: MUTED_INK, fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>Monthly pay statement</div>
                <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800 }}>Payslip for the period of {period}</div>
              </div>
              <div style={{ border: `1px solid ${LINE}`, padding: "5px 9px", color: MUTED_INK, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px" }}>
                Employee Copy
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={S.sectionLabel}>Employee details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${LINE}` }}>
                {meta.flatMap(([k1, v1, k2, v2], i) => [
                  <div key={`${k1}-${i}`} style={{ display: "grid", gridTemplateColumns: "44% 56%", borderBottom: i === meta.length - 1 ? "none" : `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, minHeight: 35 }}>
                    <div style={{ padding: "9px 10px", background: SOFT, fontWeight: 700 }}>{k1}</div>
                    <div style={{ padding: "9px 10px", fontWeight: 600 }}>{v1}</div>
                  </div>,
                  <div key={`${k2 || "empty"}-${i}`} style={{ display: "grid", gridTemplateColumns: "48% 52%", borderBottom: i === meta.length - 1 ? "none" : `1px solid ${LINE}`, minHeight: 35 }}>
                    <div style={{ padding: "9px 10px", background: SOFT, fontWeight: k2 ? 700 : 400 }}>{k2}</div>
                    <div style={{ padding: "9px 10px", fontWeight: k2 ? 600 : 400 }}>{v2}</div>
                  </div>,
                ])}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={S.sectionLabel}>Salary breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${INK}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderRight: `1px solid ${INK}` }}>
                  <colgroup><col style={{ width: "52%" }} /><col style={{ width: "24%" }} /><col style={{ width: "24%" }} /></colgroup>
                  <thead><tr><th style={S.th}>Earnings</th><th style={{ ...S.th, textAlign: "right" }}>MTD</th><th style={{ ...S.th, textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {Array.from({ length: rows }).map((_, i) => {
                      const entry = earnings[i];
                      return <tr key={i}><td style={S.td}>{entry?.[0] ?? ""}</td><td style={S.num}>{entry ? money(entry[1]) : ""}</td><td style={S.num}>{entry ? money(entry[1]) : ""}</td></tr>;
                    })}
                    <tr style={{ background: SOFT, fontWeight: 800 }}><td style={{ ...S.td, borderBottom: "none" }}>Total Earnings (Rounded)</td><td style={{ ...S.num, borderBottom: "none" }}>{money(totalE)}</td><td style={{ ...S.num, borderBottom: "none" }}>{money(totalE)}</td></tr>
                  </tbody>
                </table>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup><col style={{ width: "52%" }} /><col style={{ width: "24%" }} /><col style={{ width: "24%" }} /></colgroup>
                  <thead><tr><th style={S.th}>Deductions</th><th style={{ ...S.th, textAlign: "right" }}>MTD</th><th style={{ ...S.th, textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {Array.from({ length: rows }).map((_, i) => {
                      const entry = deductions[i];
                      return <tr key={i}><td style={S.td}>{entry?.[0] ?? ""}</td><td style={S.num}>{entry ? money(entry[1]) : ""}</td><td style={S.num}>{entry ? money(entry[1]) : ""}</td></tr>;
                    })}
                    <tr style={{ background: SOFT, fontWeight: 800 }}><td style={{ ...S.td, borderBottom: "none" }}>Total Deductions (Rounded)</td><td style={{ ...S.num, borderBottom: "none" }}>{money(totalD)}</td><td style={{ ...S.num, borderBottom: "none" }}>{money(totalD)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${INK}`, borderTop: "none", background: SOFT, padding: "12px 14px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Net Pay (Rounded)</div>
                  <div style={{ marginTop: 2, color: MUTED_INK, fontSize: 9 }}>Total earnings less total deductions</div>
                </div>
                <div style={{ color: ACCENT, fontSize: 19, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(net)}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 90, gap: 60 }}>
              <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 6, width: "42%", textAlign: "center", color: MUTED_INK, fontSize: 10 }}>Employer's Signature / Authorized Signatory</div>
              <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 6, width: "42%", textAlign: "center", color: MUTED_INK, fontSize: 10 }}>Employee's Signature</div>
            </div>

            <div style={{ marginTop: 34, borderTop: `1px solid ${LINE}`, paddingTop: 8, textAlign: "center", color: MUTED_INK, fontSize: 8.5 }}>
              This is a confidential payroll document intended solely for the employee named above.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
