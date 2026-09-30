import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const inr = (n: any) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

export interface AttendanceBreakdown {
  /** Total calendar days in the month (N) */
  totalDays: number;
  /** Calendar days elapsed / counted as the pro-rata denominator */
  countedDays: number;
  daysWorked: number;
  paidLeaveDays: number;
  restDays: number;
  lopDays: number;
  lopAmount: number;
  /** Configured monthly base salary */
  monthlyBase: number;
  /** Monthly Base / N */
  dailyRate: number;
  pct: number;
  openPeriodNote: string | null;
}


/**
 * Attendance breakdown for a payslip. Prefers the machine-readable
 * `[breakdown:...]` token written by the payrun engine and falls back to the
 * stored day counts for legacy rows.
 */
export function attendanceBreakdown(record: any): AttendanceBreakdown {
  const notes = String(record?.notes || "");
  const m = notes.match(/\[breakdown:([^\]]+)\]/);
  const kv: Record<string, number> = {};
  if (m) {
    for (const part of m[1].split(";")) {
      const [k, v] = part.split("=");
      kv[k] = Number(v) || 0;
    }
  }
  const countedDays = kv.elapsed || Number(record?.working_days || 0);
  const paidLeaveDays = kv.paid ?? 0;
  const restDays = kv.rest ?? 0;
  const daysWorked =
    kv.worked ?? Math.max(0, Number(record?.present_days || 0) - paidLeaveDays - restDays);
  const lopDays = kv.lop ?? Number(record?.leave_days || 0);
  const payable = daysWorked + paidLeaveDays + restDays;
  const now = new Date();
  const isOpen =
    Number(record?.year) === now.getFullYear() && Number(record?.month) === now.getMonth() + 1;
  const monthAndYear = new Date(Number(record?.year || now.getFullYear()), Number(record?.month || 1), 0);
  // Total calendar days of the target month is the authoritative denominator
  // (31 for August). Token values (kv.n / kv.total) from older rows are only a
  // last-resort fallback — never let a stale 28-day figure win.
  const calendarDays = monthAndYear.getDate() || 0;
  const totalDays = calendarDays || kv.n || kv.total || countedDays;
  const monthlyBase = kv.base || Number(record?.ctc || record?.base_salary || 0);
  // Daily Rate is always recomputed as Monthly Base / N so old token rates
  // (or flat ₹1,000/day estimates) can never leak into the arithmetic.
  const dailyRate = totalDays > 0 ? Math.round((monthlyBase / totalDays) * 100) / 100 : 0;
  // LOP deduction is always LOP Days x Daily Rate; the stored token amount is
  // only used when it already matches this exact formula.
  const recomputedLop = Math.round(dailyRate * lopDays * 100) / 100;
  const lopAmount =
    kv.lopamt != null && Math.abs(Number(kv.lopamt) - recomputedLop) < 0.01
      ? Number(kv.lopamt)
      : recomputedLop;
  return {
    totalDays: Number(totalDays) || 0,
    countedDays: Number(countedDays) || 0,
    daysWorked: Number(daysWorked) || 0,
    paidLeaveDays: Number(paidLeaveDays) || 0,
    restDays: Number(restDays) || 0,
    lopDays: Number(lopDays) || 0,
    lopAmount: Number(lopAmount) || 0,
    monthlyBase: Number(monthlyBase) || 0,
    dailyRate: Number(dailyRate) || 0,
    pct: countedDays > 0 ? Math.round((payable / countedDays) * 1000) / 10 : 0,
    openPeriodNote: isOpen
      ? "Period in progress - calendar days counted up to today; Sundays and holidays are fully paid."
      : null,
  };
}


/** Legacy one-line summary kept for compatibility. */
export function proRataSummary(record: any): { line: string; openPeriodNote: string | null } {
  const b = attendanceBreakdown(record);
  return {
    line: `Pro-rata: ${b.daysWorked + b.paidLeaveDays + b.restDays} / ${b.countedDays} calendar days (${b.pct}%)`,
    openPeriodNote: b.openPeriodNote,
  };
}

/** Builds a clean single-page payslip PDF for one payroll record. */
export function buildPayslipDoc(record: any) {
  const doc = new jsPDF();
  const emp = record?.employees || {};
  const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "Employee";
  const period = `${MONTHS[(record?.month || 1) - 1]} ${record?.year || ""}`;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Dr Neemz Dentistry Pvt Ltd", 105, 18, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Salem, Tamil Nadu", 105, 24, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Payslip - ${period}`, 105, 33, { align: "center" });
  doc.setDrawColor(200);
  doc.line(14, 37, 196, 37);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const designation = String(emp.designation || "").replace(/_/g, " ");
  doc.text(`Employee: ${name}`, 14, 46);
  doc.text(`Code: ${emp.employee_code || "-"}`, 130, 46);
  doc.text(`Designation: ${designation || "-"}`, 14, 52);
  doc.text(`Department: ${emp.department || "-"}`, 130, 52);
  const b = attendanceBreakdown(record);
  doc.text(`Total Calendar Days: ${b.totalDays}`, 14, 58);
  doc.text(`Status: ${record?.payment_status || "pending"}`, 130, 58);
  doc.text(`Days Worked: ${b.daysWorked}`, 14, 64);
  doc.text(`Paid Leave (SL/CL): ${b.paidLeaveDays}`, 130, 64);
  doc.text(`Paid Rest Days (Sun/Holiday): ${b.restDays}`, 14, 70);
  doc.text(
    `LOP Days Deducted: ${b.lopDays}${b.lopAmount ? ` (${inr(b.lopAmount)})` : ""}`,
    130,
    70,
  );
  doc.text(`Monthly Base: ${inr(b.monthlyBase)}`, 14, 76);
  doc.text(`Daily Rate (Base / ${b.totalDays}): ${inr(b.dailyRate)}`, 130, 76);
  doc.text(
    `Pro-rata: ${b.daysWorked + b.paidLeaveDays + b.restDays} / ${b.totalDays} calendar days (${b.totalDays > 0 ? Math.round(((b.daysWorked + b.paidLeaveDays + b.restDays) / b.totalDays) * 1000) / 10 : 0}%)`,
    14,
    82,
  );
  let infoBottom = 82;
  if (b.openPeriodNote) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(b.openPeriodNote, 14, 87);
    doc.setTextColor(0);
    doc.setFontSize(10);
    infoBottom = 87;
  }

  // Earnings breakdown — percentages are constant for every employee,
  // only the configured monthly base changes.
  const monthly = b.monthlyBase || Number(record?.gross_salary || 0);
  const basic = Math.round(monthly * 0.5);
  const hra = Math.round(monthly * 0.2);
  const conveyance = Math.round(monthly * 0.08);
  const medical = Math.round(monthly * 0.05);
  const special = Math.round(monthly - basic - hra - conveyance - medical);
  const totalEarnings = basic + hra + conveyance + medical + special;
  const otherDed =
    Number(record?.pf_deduction || 0) +
    Number(record?.esi_deduction || 0) +
    Number(record?.tax_deduction || 0) +
    Number(record?.other_deductions || 0);
  const liveTotalDeductions = Math.round((otherDed + b.lopAmount) * 100) / 100;


  autoTable(doc, {
    startY: infoBottom + 8,
    head: [["Earnings", "Amount", "Deductions", "Amount"]],
    body: [
      ["Basic (50%)", inr(basic), "PF", inr(record?.pf_deduction)],
      ["House Rent Allowance (20%)", inr(hra), "ESI", inr(record?.esi_deduction)],
      ["Conveyance Allowance (8%)", inr(conveyance), "Tax", inr(record?.tax_deduction)],
      ["Fixed Medical Allowance (5%)", inr(medical), "Other Deductions", inr(record?.other_deductions)],
      [
        "Special Allowance (17%)",
        inr(special),
        `LOP (${b.lopDays} x ${inr(b.dailyRate)})`,
        inr(b.lopAmount),
      ],

      [
        { content: "Total Earnings", styles: { fontStyle: "bold" } } as any,
        { content: inr(totalEarnings), styles: { fontStyle: "bold" } } as any,
        { content: "Total Deductions", styles: { fontStyle: "bold" } } as any,
        { content: inr(liveTotalDeductions), styles: { fontStyle: "bold" } } as any,
      ],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  });

  // Net is always recomputed live: Monthly Base - (LOP Days x Daily Rate) - other deductions.
  const liveGross = Math.max(0, Math.round((b.monthlyBase - b.lopAmount) * 100) / 100);
  const liveNet = Math.max(0, Math.round((b.monthlyBase - b.lopAmount - otherDed) * 100) / 100);

  const y = ((doc as any).lastAutoTable?.finalY || 120) + 12;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Gross Salary: ${inr(liveGross)}`, 14, y);
  doc.setFontSize(12);
  doc.text(`Net Salary: ${inr(liveNet)}`, 14, y + 8);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(
    `Formula: Net = Monthly Base ${inr(b.monthlyBase)} - (LOP Days ${b.lopDays} x Daily Rate ${inr(b.dailyRate)} = ${inr(b.lopAmount)})${otherDed > 0 ? ` - Other Deductions ${inr(otherDed)}` : ""} = ${inr(liveNet)}`,
    14,
    y + 16,
  );
  doc.setTextColor(0);



  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("This is a system generated payslip and does not require a signature.", 14, y + 24);

  return { doc, fileName: `Payslip_${name.replace(/\s+/g, "_")}_${period.replace(/\s+/g, "_")}.pdf` };
}

export function downloadPayslipPDF(record: any) {
  const { doc, fileName } = buildPayslipDoc(record);
  doc.save(fileName);
  return fileName;
}

export function payslipPdfBase64(record: any) {
  const { doc, fileName } = buildPayslipDoc(record);
  const dataUri = doc.output("datauristring");
  return { base64: dataUri.split(",")[1], fileName };
}
