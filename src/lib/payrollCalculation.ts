import { supabase } from "@/integrations/supabase/client";
import {
  getPeriodLeaveSummary,
  getGraceViolationSummary,
  getAttendancePresence,
  GRACE_FREE_VIOLATIONS,
  GRACE_PENALTY_PERCENT,
  GRACE_PERIOD_MINUTES,
} from "@/lib/hrmsSync";

/**
 * Payroll calculation utility.
 * Maps active Employees + the Leave Management period summary (LOP, unpaid leave,
 * comp off) into per-employee payroll rows for a given payrun and rolls the totals
 * up onto the payrun itself. The leave summary is read once, here, at generation time.
 */


const normalizeEmploymentType = (v?: string | null): string => {
  const s = (v || "").toLowerCase().trim();
  if (["permanent", "full_time", "full-time", "full time"].includes(s)) return "permanent";
  if (["contract", "contractual"].includes(s)) return "contract";
  if (["intern", "internship", "trainee"].includes(s)) return "intern";
  if (["part_time", "part-time", "part time"].includes(s)) return "part_time";
  return s;
};

const employeeLocation = (emp: any): string =>
  (emp?.extra_details?.location || "").toString().trim().toLowerCase();

/**
 * Attendance-based pro-rata applies to EVERY employee (admins included) unless
 * they are explicitly configured as a non-attendance worker via
 * extra_details.attendance_exempt = true (or pay_type "fixed"/"non_attendance").
 */
const isAttendanceExempt = (emp: any): boolean => {
  const extra = (emp?.extra_details ?? {}) as any;
  if (extra.attendance_exempt === true || extra.attendance_exempt === "true") return true;
  const payType = String(extra.pay_type ?? "").toLowerCase().replace(/[\s-]/g, "_").trim();
  return payType === "fixed" || payType === "non_attendance";
};


type PaySchedule = "monthly" | "weekly" | "bi_weekly" | "annually";

const SCHEDULE_TO_MONTHLY: Record<PaySchedule, number> = {
  monthly: 1,
  weekly: 52 / 12,
  bi_weekly: 26 / 12,
  annually: 1 / 12,
};

const SCHEDULE_LABEL: Record<PaySchedule, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  bi_weekly: "Bi-Weekly",
  annually: "Annually",
};

const normalizeSchedule = (v?: string | null): PaySchedule => {
  const s = (v || "").toLowerCase().replace(/[\s-]/g, "_").trim();
  if (["weekly", "week"].includes(s)) return "weekly";
  if (["bi_weekly", "biweekly", "fortnightly"].includes(s)) return "bi_weekly";
  if (["annually", "annual", "yearly", "year"].includes(s)) return "annually";
  return "monthly";
};

export interface PayrunCalcResult {
  employees: number;
  totalPayableDays: number;
  totalLopDays: number;
  totalCtc: number;
  totalGross: number;
  totalNet: number;
}

export interface PayrunLike {
  id: string;
  pay_period_month: number;
  pay_period_year: number;
  pay_period_start: string;
  pay_period_end: string;
  location?: string | null;
  employment_type?: string | null;
}

/**
 * Fetch active employees (filtered by the payrun's employment type / location),
 * compute payable & LOP days from attendance logs for the pay period, compute
 * Gross = (Basic Salary / Days in Month) * Payable Days, persist one payroll
 * row per employee, and update the payrun totals.
 */
export async function generatePayrunEmployees(payrun: PayrunLike): Promise<PayrunCalcResult> {
  // 1. Active employees from the Employees module
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, last_name, employment_type, status, base_salary, extra_details")
    .eq("status", "active");
  if (empError) throw empError;

  // Hard rule: inactive employees are never included in a payrun, even if the
  // query above ever changes — status must be exactly "active".
  let list = ((employees ?? []) as any[]).filter(
    (e) => String(e.status || "").toLowerCase().trim() === "active"
  );


  // Filter by employment type (normalized — CRM uses full_time/part_time)
  if (payrun.employment_type && payrun.employment_type !== "all") {
    const want = normalizeEmploymentType(payrun.employment_type);
    list = list.filter((e) => normalizeEmploymentType(e.employment_type) === want);
  }

  // Filter by location — employees tag a free-text location in extra_details;
  // employees without a location tag are always included.
  if (payrun.location && payrun.location !== "all") {
    const wantLoc = payrun.location.toLowerCase().trim();
    list = list.filter((e) => {
      const loc = employeeLocation(e);
      return !loc || loc.includes(wantLoc) || wantLoc.includes(loc);
    });
  }

  const daysInMonth = new Date(payrun.pay_period_year, payrun.pay_period_month, 0).getDate();

  const employeeIds = list.map((e) => e.id);

  // 2a. STRICT attendance presence — actual punched days per employee
  //     (Sundays + holidays excluded from the working-day denominator).
  const presence = await getAttendancePresence(
    employeeIds,
    payrun.pay_period_start,
    payrun.pay_period_end,
  );

  // 2b. Leave Management summary — fetched ONCE here at payrun generation time
  //     (never on attendance/leave sync) so LOP / unpaid / comp-off flow straight
  //     into the payslip without manual entry.
  const leaveSummary = await getPeriodLeaveSummary(
    employeeIds,
    payrun.pay_period_start,
    payrun.pay_period_end,
  );

  // 2c. Grace Period Violations (attendance check-in vs assigned shift start).
  //      Penalty base is the PRORATED gross computed below.
  const graceSummary = await getGraceViolationSummary(
    employeeIds,
    payrun.pay_period_start,
    payrun.pay_period_end,
  );

  // 3. Compute payable / LOP days per employee
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = list.map((emp) => {
    const summary = leaveSummary.get(emp.id) ?? {
      paidLeaveDays: 0,
      unpaidDays: 0,
      lopDays: 0,
      halfDayLopDays: 0,
      compOffUsed: 0,
    };

    // Compensation: extra_details.pay_rate + pay_schedule, fallback base_salary
    const extra = (emp.extra_details ?? {}) as any;
    const rawRate = Number(String(extra.pay_rate ?? "").replace(/[^0-9.-]/g, ""));
    const hasRate = Number.isFinite(rawRate) && rawRate > 0;
    const fallback = Number(emp.base_salary || 0);
    const schedule = normalizeSchedule(extra.pay_schedule);
    const monthly = hasRate
      ? round2(rawRate * SCHEDULE_TO_MONTHLY[schedule])
      : round2(fallback);
    const compensationMissing = !(monthly > 0);

    // Attendance logs are the single source of truth for payable days.
    const att = presence.get(emp.id) ?? { workingDays: 0, fullMonthWorkingDays: 0, presentDays: 0, paidLeaveDays: 0, approvedPaidLeaveDays: 0, restDays: 0, markedLopDays: 0, hasAttendanceData: false };
    const workingDays = att.workingDays > 0 ? att.workingDays : daysInMonth;
    const fullWorkingDays = att.fullMonthWorkingDays > 0 ? att.fullMonthWorkingDays : workingDays;
    // Exemption applies ONLY when the employee has no attendance records at all.
    // Once any punch exists (e.g. admin Gopinath with 24 days), the pro-rata
    // ratio Days Worked / Working Days governs — never a flat full-month payout.
    const exempt = isAttendanceExempt(emp) && !att.hasAttendanceData;

    // Exempt employees (explicitly toggled non-attendance with no logs) are paid
    // in full; everyone else is strictly prorated on actual attendance.
    const payableRaw = exempt
      ? workingDays
      : Math.min(workingDays, round2(att.presentDays + att.paidLeaveDays));
    const lopDaysRaw = round2(Math.max(0, workingDays - payableRaw));

    const payableDays = compensationMissing ? 0 : Math.round(payableRaw);
    const lopDays = Math.round(lopDaysRaw);

    // Daily Rate = Monthly Base / total calendar days in the month (N).
    // Never a 26/28/30-day divisor and never the elapsed-day count.
    const perDay = daysInMonth > 0 ? monthly / daysInMonth : 0;
    const lopAmount = round2(perDay * lopDaysRaw);
    // Net formula: Monthly Base - (LOP Days * Daily Rate). LOP is baked into
    // Gross so statutory/other deductions stay separate.
    const gross = compensationMissing ? 0 : round2(Math.max(0, monthly - lopAmount));


    // Grace Violation penalty: 0.25% of prorated gross per penalized day
    const grace = graceSummary.get(emp.id) ?? {
      totalViolations: 0,
      penalizedDays: 0,
      shiftAssigned: false,
      shiftStart: null,
    };
    const gracePenalty = compensationMissing
      ? 0
      : round2((GRACE_PENALTY_PERCENT / 100) * gross * grace.penalizedDays);

    const statutoryDeductions = 0;
    const totalDeductions = round2(statutoryDeductions + gracePenalty);
    const net = round2(Math.max(0, gross - totalDeductions));

    const noteParts: string[] = [];
    if (compensationMissing) noteParts.push("⚠ Compensation not set");
    if (hasRate && schedule !== "monthly")
      noteParts.push(`⚠ Normalized from ${SCHEDULE_LABEL[schedule]}`);
    noteParts.push(
      workingDays < fullWorkingDays
        ? `Attendance: ${att.presentDays} present + ${att.approvedPaidLeaveDays} paid leave + ${att.restDays} rest of ${workingDays} calendar days elapsed (${fullWorkingDays} in full month)`
        : `Attendance: ${att.presentDays} present + ${att.approvedPaidLeaveDays} paid leave + ${att.restDays} rest of ${workingDays} calendar days`,
    );
    // Machine-readable breakdown consumed by the payslip modal / PDF.
    noteParts.push(
      `[breakdown:total=${fullWorkingDays};elapsed=${workingDays};worked=${att.presentDays};paid=${att.approvedPaidLeaveDays};rest=${att.restDays};lop=${lopDaysRaw};lopamt=${lopAmount};base=${monthly};n=${daysInMonth};rate=${round2(perDay)}]`,
    );

    if (lopDaysRaw > 0)
      noteParts.push(`LOP: ${lopDaysRaw} days x ₹${round2(perDay).toLocaleString("en-IN")}/day = ₹${lopAmount.toLocaleString("en-IN")} (already applied in Gross Pay)`);

    if (exempt) noteParts.push("Non-attendance worker — fixed salary, attendance pro-rata skipped");

    
    if (!grace.shiftAssigned) {
      noteParts.push("Shift not assigned — grace tracking unavailable");
    } else if (gracePenalty > 0) {
      noteParts.push(
        `Grace Violation: ${grace.penalizedDays} days beyond allowed ${GRACE_FREE_VIOLATIONS} = ₹${gracePenalty.toLocaleString("en-IN")} deducted (${grace.totalViolations} total violations, shift ${grace.shiftStart} + ${GRACE_PERIOD_MINUTES}m grace)`,
      );
    } else if (grace.totalViolations > 0) {
      noteParts.push(
        `Grace Violation: ${grace.totalViolations} violation(s) — within the ${GRACE_FREE_VIOLATIONS} free days, no penalty`,
      );
    }

    if (summary.unpaidDays) noteParts.push(`Unpaid leave ${summary.unpaidDays}d`);
    if (summary.halfDayLopDays) noteParts.push(`Half-day ${summary.halfDayLopDays}d`);
    if (summary.compOffUsed) noteParts.push(`Comp off used ${summary.compOffUsed}d`);
    if (summary.paidLeaveDays) noteParts.push(`Paid leave ${summary.paidLeaveDays}d`);

    return {
      payrun_id: payrun.id,
      employee_id: emp.id,
      month: payrun.pay_period_month,
      year: payrun.pay_period_year,
      working_days: workingDays,
      present_days: payableDays,
      leave_days: lopDays,
      base_salary: monthly,
      gross_salary: gross,
      net_salary: net,
      other_deductions: totalDeductions,
      total_deductions: totalDeductions,
      tax_deduction: 0,
      ctc: monthly,
      payment_status: "pending",
      notes: noteParts.length > 0 ? noteParts.join(" • ") : null,
    };
  });




  // 4. Persist payroll rows for this payrun. The table enforces
  //    UNIQUE (employee_id, month, year), so upsert on that key — this
  //    re-computes and adopts any legacy rows for the same period.
  const { error: delError } = await supabase.from("payroll").delete().eq("payrun_id", payrun.id);
  if (delError) throw delError;
  if (rows.length > 0) {
    const { error: insError } = await supabase
      .from("payroll")
      .upsert(rows, { onConflict: "employee_id,month,year" });
    if (insError) throw insError;
  }

  // 5. Roll totals up onto the payrun
  const result: PayrunCalcResult = rows.reduce(
    (acc, r) => ({
      employees: acc.employees + 1,
      totalPayableDays: round2(acc.totalPayableDays + Number(r.present_days || 0)),
      totalLopDays: round2(acc.totalLopDays + Number(r.leave_days || 0)),
      totalCtc: round2(acc.totalCtc + Number(r.ctc || 0)),
      totalGross: round2(acc.totalGross + Number(r.gross_salary || 0)),
      totalNet: round2(acc.totalNet + Number(r.net_salary || 0)),
    }),
    { employees: 0, totalPayableDays: 0, totalLopDays: 0, totalCtc: 0, totalGross: 0, totalNet: 0 },
  );

  const { error: updError } = await supabase
    .from("payruns")
    .update({
      total_employees: result.employees,
      total_ctc: result.totalCtc,
      total_net_pay: result.totalNet,
      total_deductions: rows.reduce((a, r) => a + Number(r.other_deductions || 0), 0),
      total_tax: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payrun.id);
  if (updError) throw updError;

  return result;
}
