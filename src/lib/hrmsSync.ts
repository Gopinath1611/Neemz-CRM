import { supabase } from "@/integrations/supabase/client";

/**
 * HRMS data-layer sync: Attendance <-> Leave Management -> Payroll.
 *
 * Single source of truth rules:
 *  - Approved leave writes/adopts the matching attendance rows (status `leave` / `half_day`)
 *    tagged with an idempotent marker in `notes`.
 *  - Rejecting / cancelling a leave reverts exactly those rows.
 *  - Leave balances (`used`) are recomputed from approved requests, and LOP is derived
 *    from attendance `absent` days that have no approved leave covering them.
 *  - Payroll reads a period summary ONLY at payrun generation time.
 *
 * No new tables: reuses attendance_logs, leave_requests, leave_balances, comp_off_requests.
 */

const LEAVE_MARKER = (requestId: string) => `[auto:leave:${requestId}]`;
const ADOPT_MARKER = (requestId: string, prevStatus: string) =>
  `[auto:leave-adopt:${requestId}:${prevStatus || "none"}]`;

export const LOP_TYPE = "LOP";
export const COMP_OFF_TYPE = "Comp Off";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: "Casual Leave",
  "casual leave": "Casual Leave",
  sick: "Sick Leave",
  "sick leave": "Sick Leave",
  earned: "Earned Leave",
  "earned leave": "Earned Leave",
  comp_off: COMP_OFF_TYPE,
  "comp off": COMP_OFF_TYPE,
  compoff: COMP_OFF_TYPE,
  lop: LOP_TYPE,
  unpaid: LOP_TYPE,
  "unpaid leave": LOP_TYPE,
  maternity: "Maternity",
  "maternity leave": "Maternity",
  paternity: "Paternity",
};

/** Canonical label used in leave_balances.leave_type */
export const normalizeLeaveType = (raw?: string | null): string => {
  const key = (raw || "").toLowerCase().trim();
  return LEAVE_TYPE_LABELS[key] || (raw || "").trim() || "Other";
};

/** Unpaid leave types never contribute payable days */
export const isUnpaidLeaveType = (raw?: string | null): boolean => {
  const t = normalizeLeaveType(raw);
  return t === LOP_TYPE;
};

/** Explicit duration_type field (mirrors comp_off_requests) — no days=0.5 inference */
export const isHalfDay = (durationType?: string | null): boolean =>
  (durationType || "").toLowerCase().trim() === "half_day";

const round2 = (n: number) => Math.round(n * 100) / 100;

const eachDate = (start: string, end: string): string[] => {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return out;
  for (let d = s; d <= e; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const HALF_DAY_STATUSES = new Set(["half_day", "halfday", "half-day"]);

const ABSENT_STATUSES = new Set(["absent", "lop", "loss_of_pay", "unpaid_leave"]);

// ---------------------------------------------------------------------------
// 1. Leave -> Attendance
// ---------------------------------------------------------------------------

/**
 * Idempotent: writes one attendance row per leave date, tagged with a marker.
 * Re-running after an edit/re-approval updates in place instead of duplicating.
 */
export async function syncApprovedLeaveToAttendance(requestId: string): Promise<void> {
  const { data: req, error } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, duration_type, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !req) return;

  if ((req.status || "").toLowerCase() !== "approved") {
    await removeSyncedAttendance(requestId);
    return;
  }

  const marker = LEAVE_MARKER(requestId);
  const half = isHalfDay((req as any).duration_type);
  const leaveType = normalizeLeaveType(req.leave_type);
  let targetStatus: string;
  if (half) targetStatus = "half_day";
  else if (leaveType === "Casual Leave") targetStatus = "cl";
  else if (leaveType === "Sick Leave") targetStatus = "sl";
  else if (leaveType === "Earned Leave") targetStatus = "el";
  else targetStatus = "lv";
  const dates = eachDate(req.start_date, req.end_date);
  if (dates.length === 0) return;

  // Existing rows for these dates (both auto-created and manually punched)
  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, date, status, notes")
    .eq("employee_id", req.employee_id)
    .in("date", dates);

  const byDate = new Map<string, any>();
  for (const row of existing || []) byDate.set(row.date, row);

  const inserts: any[] = [];
  for (const date of dates) {
    const row = byDate.get(date);
    const note = `${normalizeLeaveType(req.leave_type)}${half ? " (Half Day)" : ""} ${marker}`;

    if (!row) {
      inserts.push({
        employee_id: req.employee_id,
        date,
        status: targetStatus,
        notes: note,
        manual_entry: true,
      });
      continue;
    }

    const notes = row.notes || "";
    if (notes.includes(marker) || notes.includes(`[auto:leave-adopt:${requestId}:`)) {
      // Already synced — refresh status only (handles duration/type edits)
      if (row.status !== targetStatus) {
        await supabase.from("attendance_logs").update({ status: targetStatus }).eq("id", row.id);
      }
      continue;
    }

    // Adopt an absent/blank row so approved leave overrides it; remember prior status.
    const cur = (row.status || "").toLowerCase().trim();
    if (!cur || ABSENT_STATUSES.has(cur)) {
      await supabase
        .from("attendance_logs")
        .update({
          status: targetStatus,
          notes: `${notes ? notes + " " : ""}${note} ${ADOPT_MARKER(requestId, row.status || "")}`.trim(),
        })
        .eq("id", row.id);
    }
    // Present / week-off / holiday rows are left untouched.
  }

  if (inserts.length > 0) {
    await supabase.from("attendance_logs").insert(inserts);
  }
}

/** Reverts attendance rows created or adopted by a leave request (reject / cancel / delete). */
export async function removeSyncedAttendance(requestId: string): Promise<void> {
  const marker = LEAVE_MARKER(requestId);
  const adoptPrefix = `[auto:leave-adopt:${requestId}:`;

  const { data: rows } = await supabase
    .from("attendance_logs")
    .select("id, status, notes")
    .or(`notes.ilike.%${marker}%,notes.ilike.%${adoptPrefix}%`);

  for (const row of rows || []) {
    const notes = row.notes || "";
    const adoptMatch = notes.match(
      new RegExp(`\\[auto:leave-adopt:${requestId}:([^\\]]*)\\]`),
    );
    if (adoptMatch) {
      const prev = adoptMatch[1] === "none" ? "absent" : adoptMatch[1];
      const cleaned = notes
        .replace(adoptMatch[0], "")
        .replace(marker, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      await supabase
        .from("attendance_logs")
        .update({ status: prev, notes: cleaned || null })
        .eq("id", row.id);
    } else {
      // Row was created purely by the leave sync — remove it.
      await supabase.from("attendance_logs").delete().eq("id", row.id);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Attendance + Leave -> Balances
// ---------------------------------------------------------------------------

/**
 * Recomputes `leave_balances.used` for an employee/year:
 *  - approved leave requests (half day counts 0.5)
 *  - approved comp offs consumed
 *  - LOP = absent attendance days with no approved leave covering them
 */
export async function recomputeLeaveBalances(employeeId: string, year: number): Promise<void> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [{ data: reqs }, { data: logs }, { data: balances }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("leave_type, start_date, end_date, days, duration_type, status")
      .eq("employee_id", employeeId)
      .lte("start_date", to)
      .gte("end_date", from),
    supabase
      .from("attendance_logs")
      .select("date, status")
      .eq("employee_id", employeeId)
      .gte("date", from)
      .lte("date", to),
    supabase.from("leave_balances").select("id, leave_type, allocated").eq("employee_id", employeeId).eq("year", year),
  ]);

  const approved = (reqs || []).filter((r) => (r.status || "").toLowerCase() === "approved");

  const used = new Map<string, number>();
  const approvedDates = new Set<string>();
  for (const r of approved) {
    const type = normalizeLeaveType(r.leave_type);
    const dates = eachDate(r.start_date, r.end_date);
    dates.forEach((d) => approvedDates.add(d));
    const amount = isHalfDay((r as any).duration_type) ? 0.5 : Number(r.days || dates.length || 0);
    used.set(type, round2((used.get(type) || 0) + amount));
  }

  // LOP: absent attendance days not covered by an approved leave
  let lop = 0;
  for (const log of logs || []) {
    const s = (log.status || "").toLowerCase().trim();
    if (ABSENT_STATUSES.has(s) && !approvedDates.has(log.date)) lop += 1;
  }
  used.set(LOP_TYPE, round2((used.get(LOP_TYPE) || 0) + lop));

  const existing = new Map<string, any>();
  for (const b of balances || []) existing.set(normalizeLeaveType(b.leave_type), b);

  for (const [type, value] of used.entries()) {
    const row = existing.get(type);
    if (row) {
      await supabase.from("leave_balances").update({ used: value }).eq("id", row.id);
    } else {
      await supabase
        .from("leave_balances")
        .insert({ employee_id: employeeId, year, leave_type: type, allocated: 0, used: value });
    }
  }

  // Zero out balance rows that no longer have usage
  for (const [type, row] of existing.entries()) {
    if (!used.has(type) && Number(row.used || 0) !== 0) {
      await supabase.from("leave_balances").update({ used: 0 }).eq("id", row.id);
    }
  }
}

/** Convenience: approve/reject a leave and keep attendance + balances in sync. */
export async function applyLeaveDecision(
  requestId: string,
  status: string,
  approvedBy = "Admin",
): Promise<void> {
  const { data: req } = await supabase
    .from("leave_requests")
    .select("employee_id, start_date, end_date, leave_type, days")
    .eq("id", requestId)
    .maybeSingle();

  const { error: updErr } = await supabase
    .from("leave_requests")
    .update({ status, approved_by: approvedBy })
    .eq("id", requestId);
  if (updErr) throw updErr;

  const normalized = (status || "").toLowerCase();

  if (normalized === "approved") {
    await syncApprovedLeaveToAttendance(requestId);
  } else {
    await removeSyncedAttendance(requestId);
  }

  if (req?.employee_id) {
    const year = new Date(`${req.start_date}T00:00:00`).getFullYear() || new Date().getFullYear();
    await recomputeLeaveBalances(req.employee_id, year);
    await notifyLeaveDecision(requestId, normalized, approvedBy, req);
  }
}

interface LeaveNotifySource {
  employee_id: string;
  start_date: string;
  end_date?: string | null;
  leave_type?: string | null;
  days?: number | null;
}

/** Logs an in-app notification (and emails when possible) for a leave decision. */
async function notifyLeaveDecision(
  requestId: string,
  status: string,
  approvedBy: string,
  req: LeaveNotifySource,
): Promise<void> {
  try {
    const { data: emp } = await supabase
      .from("employees")
      .select("first_name, last_name, email, employee_code")
      .eq("id", req.employee_id)
      .maybeSingle();

    const name = [emp?.first_name, emp?.last_name].filter(Boolean).join(" ") || "Employee";
    const range = req.end_date && req.end_date !== req.start_date
      ? `${req.start_date} to ${req.end_date}`
      : req.start_date;
    const type = req.leave_type || "Leave";
    const label = status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : status;
    const message = `${name} (${emp?.employee_code || "—"}): ${type} for ${range}${
      req.days ? ` • ${req.days} day(s)` : ""
    } was ${label.toLowerCase()} by ${approvedBy}.`;

    await supabase.from("notifications").insert({
      type: "leave_decision",
      title: `Leave ${label} — ${name}`,
      message,
      entity_type: "leave_request",
      entity_id: requestId,
      severity: status === "rejected" ? "warning" : "info",
    });

    if (emp?.email) {
      await supabase.functions.invoke("send-leave-status-email", {
        body: {
          to: emp.email,
          employee_name: name,
          status: label,
          leave_type: type,
          date_range: range,
          days: req.days ?? null,
          approved_by: approvedBy,
        },
      });
    }
  } catch {
    // Notifications must never block the approval flow.
  }
}


/** Comp off approval: credits/removes the Comp Off balance for the year. */
export async function applyCompOffDecision(
  requestId: string,
  status: string,
  approvedBy = "Admin",
): Promise<void> {
  await supabase.from("comp_off_requests").update({ status, approved_by: approvedBy }).eq("id", requestId);

  const { data: req } = await supabase
    .from("comp_off_requests")
    .select("employee_id, year")
    .eq("id", requestId)
    .maybeSingle();
  if (!req?.employee_id) return;

  const year = req.year || new Date().getFullYear();
  const { data: approvedOffs } = await supabase
    .from("comp_off_requests")
    .select("duration_type, status")
    .eq("employee_id", req.employee_id)
    .eq("year", year);

  const credited = round2(
    (approvedOffs || [])
      .filter((r) => (r.status || "").toLowerCase() === "approved")
      .reduce((sum, r) => sum + (isHalfDay(r.duration_type) ? 0.5 : 1), 0),
  );

  const { data: existing } = await supabase
    .from("leave_balances")
    .select("id")
    .eq("employee_id", req.employee_id)
    .eq("year", year)
    .eq("leave_type", COMP_OFF_TYPE)
    .maybeSingle();

  if (existing) {
    await supabase.from("leave_balances").update({ allocated: credited }).eq("id", existing.id);
  } else {
    await supabase
      .from("leave_balances")
      .insert({ employee_id: req.employee_id, year, leave_type: COMP_OFF_TYPE, allocated: credited, used: 0 });
  }
}

// ---------------------------------------------------------------------------
// 3. Leave -> Payroll (called only at payrun generation time)
// ---------------------------------------------------------------------------

export interface PeriodLeaveSummary {
  paidLeaveDays: number;
  unpaidDays: number;
  lopDays: number;
  halfDayLopDays: number;
  compOffUsed: number;
}

/**
 * Period summary for payroll. Intentionally invoked ONLY from payrun generation
 * (never on attendance/leave sync) to keep compute low.
 */
export async function getPeriodLeaveSummary(
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, PeriodLeaveSummary>> {
  const result = new Map<string, PeriodLeaveSummary>();
  employeeIds.forEach((id) =>
    result.set(id, { paidLeaveDays: 0, unpaidDays: 0, lopDays: 0, halfDayLopDays: 0, compOffUsed: 0 }),
  );
  if (employeeIds.length === 0) return result;

  const [{ data: reqs }, { data: logs }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type, start_date, end_date, days, duration_type, status")
      .in("employee_id", employeeIds)
      .lte("start_date", to)
      .gte("end_date", from),
    supabase
      .from("attendance_logs")
      .select("employee_id, date, status")
      .in("employee_id", employeeIds)
      .gte("date", from)
      .lte("date", to),
  ]);

  const approvedDates = new Map<string, Set<string>>();

  for (const r of reqs || []) {
    if ((r.status || "").toLowerCase() !== "approved") continue;
    const bucket = result.get(r.employee_id);
    if (!bucket) continue;
    const half = isHalfDay((r as any).duration_type);
    const dates = eachDate(r.start_date, r.end_date).filter((d) => d >= from && d <= to);
    if (dates.length === 0) continue;

    const set = approvedDates.get(r.employee_id) || new Set<string>();
    dates.forEach((d) => set.add(d));
    approvedDates.set(r.employee_id, set);

    const amount = half ? 0.5 : dates.length;
    const type = normalizeLeaveType(r.leave_type);
    if (type === LOP_TYPE) bucket.unpaidDays = round2(bucket.unpaidDays + amount);
    else if (type === COMP_OFF_TYPE) bucket.compOffUsed = round2(bucket.compOffUsed + amount);
    else bucket.paidLeaveDays = round2(bucket.paidLeaveDays + amount);
  }

  for (const log of logs || []) {
    const bucket = result.get(log.employee_id);
    if (!bucket) continue;
    const s = (log.status || "").toLowerCase().trim();
    const covered = approvedDates.get(log.employee_id)?.has(log.date);
    if (ABSENT_STATUSES.has(s) && !covered) bucket.lopDays = round2(bucket.lopDays + 1);
    else if (HALF_DAY_STATUSES.has(s) && !covered) bucket.halfDayLopDays = round2(bucket.halfDayLopDays + 0.5);
  }

  return result;
}

/**
 * Working days inside the period with NO attendance record and NO approved
 * leave — i.e. unrecorded absences. Sundays, holidays and future dates are
 * excluded. Applied uniformly to every attendance-tracked employee (admins
 * included) so nobody silently receives a flat full-month salary.
 */
export async function getUnrecordedAbsenceDays(
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  employeeIds.forEach((id) => result.set(id, 0));
  if (employeeIds.length === 0) return result;

  const today = new Date().toISOString().slice(0, 10);
  const effectiveTo = to < today ? to : today;
  if (effectiveTo < from) return result;

  const [{ data: logs }, { data: reqs }, { data: holidays }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("employee_id, date")
      .in("employee_id", employeeIds)
      .gte("date", from)
      .lte("date", effectiveTo),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date, status")
      .in("employee_id", employeeIds)
      .lte("start_date", effectiveTo)
      .gte("end_date", from),
    supabase.from("holidays").select("holiday_date").gte("holiday_date", from).lte("holiday_date", effectiveTo),
  ]);

  const holidaySet = new Set((holidays || []).map((h: any) => h.holiday_date));
  const covered = new Map<string, Set<string>>();
  const addCovered = (empId: string, date: string) => {
    const set = covered.get(empId) || new Set<string>();
    set.add(date);
    covered.set(empId, set);
  };

  (logs || []).forEach((l: any) => addCovered(l.employee_id, l.date));
  (reqs || []).forEach((r: any) => {
    if ((r.status || "").toLowerCase() === "rejected") return;
    eachDate(r.start_date, r.end_date)
      .filter((d) => d >= from && d <= effectiveTo)
      .forEach((d) => addCovered(r.employee_id, d));
  });

  const workingDates = eachDate(from, effectiveTo).filter(
    (d) => new Date(`${d}T00:00:00`).getDay() !== 0 && !holidaySet.has(d),
  );

  for (const id of employeeIds) {
    const set = covered.get(id);
    const missing = workingDates.filter((d) => !set?.has(d)).length;
    result.set(id, missing);
  }

  return result;
}

export interface AttendancePresence {
  /**
   * CALENDAR days used as the pro-rata denominator, capped at the days ELAPSED
   * so far for an in-progress period. Sundays / holidays are NOT excluded —
   * rest days are fully paid, so there are zero weekend deductions.
   */
  workingDays: number;
  /** Total calendar days in the FULL period (N) — reporting only. */
  fullMonthWorkingDays: number;
  /** Present-equivalent days actually punched (present/late = 1, half day = 0.5) */
  presentDays: number;
  /** Paid non-working credit: approved paid leave + elapsed Sundays/holidays */
  paidLeaveDays: number;
  /** Approved paid leave (SL/CL/EL/Comp Off) only — excludes Sunday/holiday credit */
  approvedPaidLeaveDays: number;
  /** Elapsed Sundays + declared holidays credited as paid rest days */
  restDays: number;
  /** Days explicitly marked Absent / LOP in the attendance grid */
  markedLopDays: number;
  /** True when the employee has any attendance log row in the period */
  hasAttendanceData: boolean;
}

/** Attendance grid codes that represent APPROVED PAID leave (never LOP). */
const PAID_LEAVE_STATUSES = new Set([
  "leave", "paid_leave", "cl", "casual_leave", "sl", "sick_leave",
  "el", "earned_leave", "comp_off", "compoff", "co", "maternity", "paternity",
]);

const PRESENT_STATUSES = new Set(["present", "late", "wfh", "work_from_home", "on_duty", "od"]);

/**
 * STRICT attendance-based presence for payroll pro-rata on a CALENDAR-day basis.
 * Denominator = total calendar days in the month (N), capped at elapsed days for
 * an open period. Sundays and declared holidays are auto-credited as paid days,
 * so a fully-present employee reaches 100% with no weekend deduction.
 */

export async function getAttendancePresence(
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, AttendancePresence>> {
  const result = new Map<string, AttendancePresence>();
  if (employeeIds.length === 0) return result;

  const [{ data: logs }, { data: reqs }, { data: holidays }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("employee_id, date, status, check_in_at")
      .in("employee_id", employeeIds)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type, start_date, end_date, duration_type, status")
      .in("employee_id", employeeIds)
      .lte("start_date", to)
      .gte("end_date", from),
    supabase.from("holidays").select("holiday_date").gte("holiday_date", from).lte("holiday_date", to),
  ]);

  const holidaySet = new Set((holidays || []).map((h: any) => h.holiday_date));
  // Cap the calendar-day denominator at elapsed days only (up to today, never
  // beyond the period end) — future days are never counted as loss of pay.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const effectiveTo = to > todayStr ? todayStr : to;
  const elapsedDates = eachDate(from, effectiveTo);
  // Every calendar day counts (Sundays + holidays included) — X / N basis.
  const workingDates = new Set(elapsedDates);
  const workingDays = workingDates.size;
  // Total calendar days in the whole period (N).
  const fullMonthWorkingDays = eachDate(from, to).length;
  // Rest days (Sundays + declared holidays) that have already elapsed are paid
  // in full, so they are credited even without a punch.
  const restDates = elapsedDates.filter(
    (d) => new Date(`${d}T00:00:00`).getDay() === 0 || holidaySet.has(d),
  );

  employeeIds.forEach((id) =>
    result.set(id, {
      workingDays,
      fullMonthWorkingDays,
      presentDays: 0,
      paidLeaveDays: 0,
      approvedPaidLeaveDays: 0,
      restDays: 0,
      markedLopDays: 0,
      hasAttendanceData: false,
    }),
  );

  // STRICT SYNC with the My Attendance dashboard: a day counts as present when a
  // verified check-in exists (`check_in_at`), exactly like the dashboard's
  // "Present days" card. Distinct dates only, so duplicate logs never inflate it.
  // Legacy rows without `check_in_at` fall back to their status.
  const seen = new Map<string, Set<string>>();
  // Dates the grid marks as paid leave (CL/SL/EL/Comp Off) or as Absent/LOP.
  const gridLeaveDates = new Map<string, Set<string>>();
  const gridLopDates = new Map<string, Set<string>>();
  const bump = (m: Map<string, Set<string>>, id: string, date: string) => {
    let set = m.get(id);
    if (!set) { set = new Set<string>(); m.set(id, set); }
    set.add(date);
  };
  for (const log of (logs || []) as Array<{
    employee_id: string;
    date: string;
    status: string | null;
    check_in_at: string | null;
  }>) {
    const bucket = result.get(log.employee_id);
    if (!bucket) continue;
    bucket.hasAttendanceData = true;
    let dates = seen.get(log.employee_id);
    if (!dates) { dates = new Set<string>(); seen.set(log.employee_id, dates); }
    if (dates.has(log.date)) continue;
    const s = (log.status || "").toLowerCase().trim();
    const hasPunch = !!log.check_in_at;
    if (hasPunch) {
      dates.add(log.date);
      bucket.presentDays = round2(
        bucket.presentDays + (HALF_DAY_STATUSES.has(s) ? 0.5 : 1),
      );
    } else if (workingDates.has(log.date)) {
      if (PRESENT_STATUSES.has(s)) {
        dates.add(log.date);
        bucket.presentDays = round2(bucket.presentDays + 1);
      } else if (HALF_DAY_STATUSES.has(s)) {
        dates.add(log.date);
        bucket.presentDays = round2(bucket.presentDays + 0.5);
      } else if (ABSENT_STATUSES.has(s)) {
        bump(gridLopDates, log.employee_id, log.date);
      } else if (PAID_LEAVE_STATUSES.has(s)) {
        bump(gridLeaveDates, log.employee_id, log.date);
      }
    }
  }

  // Approved paid leave (Sick / Casual / Earned / Comp Off) is credited as paid.
  const approvedPaidDates = new Map<string, Set<string>>();
  for (const r of reqs || []) {
    const bucket = result.get(r.employee_id);
    if (!bucket) continue;
    if ((r.status || "").toLowerCase() !== "approved") continue;
    const type = normalizeLeaveType(r.leave_type);
    const dates = eachDate(r.start_date, r.end_date).filter((d) => workingDates.has(d));
    if (dates.length === 0) continue;
    if (type === LOP_TYPE) {
      // Unpaid leave — never payable, counted as LOP (dedup against grid marks).
      dates.forEach((d) => bump(gridLopDates, r.employee_id, d));
      continue;
    }
    dates.forEach((d) => bump(approvedPaidDates, r.employee_id, d));
  }

  for (const [id, b] of result) {
    const punched = seen.get(id);
    // Approved paid leave days that were not already counted as punched days.
    const approved = new Set(
      [...(approvedPaidDates.get(id) ?? [])].filter((d) => !punched?.has(d)),
    );
    // Grid-marked leave (CL/SL/… written straight into attendance) counts once.
    for (const d of gridLeaveDates.get(id) ?? []) if (!punched?.has(d)) approved.add(d);
    b.approvedPaidLeaveDays = round2(approved.size);

    // Rest days (Sundays / holidays) are fully paid — credit any that were not
    // already counted as a punched or paid-leave day. Zero weekend deductions.
    b.restDays = round2(
      restDates.filter((d) => !punched?.has(d) && !approved.has(d)).length,
    );
    b.paidLeaveDays = round2(b.approvedPaidLeaveDays + b.restDays);

    // Explicit Absent / LOP marks, excluding anything already paid.
    b.markedLopDays = round2(
      [...(gridLopDates.get(id) ?? [])].filter(
        (d) => !punched?.has(d) && !approved.has(d) && !restDates.includes(d),
      ).length,
    );

    // Never credit more than the elapsed denominator.
    if (b.presentDays + b.paidLeaveDays > workingDays) {
      const room = Math.max(0, workingDays - b.presentDays);
      b.approvedPaidLeaveDays = round2(Math.min(b.approvedPaidLeaveDays, room));
      b.restDays = round2(Math.max(0, room - b.approvedPaidLeaveDays));
      b.paidLeaveDays = round2(b.approvedPaidLeaveDays + b.restDays);
    }
  }


  return result;
}


/* ------------------------------------------------------------------ */
/* Grace Period Violations (Attendance -> Payroll penalty)             */
/* ------------------------------------------------------------------ */

/**
 * Grace window (minutes) allowed after the assigned shift start before a
 * check-in counts as a Grace Violation. Mirrors LATE_GRACE_MINUTES used by the
 * attendance UI. There is no per-shift grace column in `employee_shifts`, so
 * change this ONE constant to adjust the grace period clinic-wide.
 */
export const GRACE_PERIOD_MINUTES = 15;

/** Violations per calendar month that carry no penalty. */
export const GRACE_FREE_VIOLATIONS = 3;

/** Penalty per penalized day, as a percentage of prorated Gross Pay. */
export const GRACE_PENALTY_PERCENT = 0.25;

export interface GraceViolationSummary {
  /** Total check-ins after shift start + grace inside the period. */
  totalViolations: number;
  /** Violations beyond the free buffer — these attract the penalty. */
  penalizedDays: number;
  /** False when the employee has no shift row covering the period. */
  shiftAssigned: boolean;
  /** Shift start time used for the comparison (HH:MM), when assigned. */
  shiftStart: string | null;
}

const timeToMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

/** Local-clock minutes of a check-in, preferring `check_in` then `check_in_at`. */
const checkInMinutes = (log: any): number | null => {
  const fromTime = timeToMinutes(log?.check_in);
  if (fromTime !== null) return fromTime;
  if (log?.check_in_at) {
    const d = new Date(log.check_in_at);
    if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }
  return null;
};

/**
 * Count Grace Violations for one employee over a period (read-only).
 *
 * Rules: check-in after `shift.start_time + GRACE_PERIOD_MINUTES` is a violation;
 * the first `GRACE_FREE_VIOLATIONS` of the period are free. Employees with no
 * shift assignment are skipped (shiftAssigned = false, zero violations) so no
 * penalty is ever guessed from an assumed start time.
 */
export async function getGraceViolations(
  employeeId: string,
  from: string,
  to: string,
): Promise<GraceViolationSummary> {
  const map = await getGraceViolationSummary([employeeId], from, to);
  return (
    map.get(employeeId) ?? { totalViolations: 0, penalizedDays: 0, shiftAssigned: false, shiftStart: null }
  );
}

/** Batched variant used by payrun generation — one query pair for all employees. */
export async function getGraceViolationSummary(
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, GraceViolationSummary>> {
  const result = new Map<string, GraceViolationSummary>();
  employeeIds.forEach((id) =>
    result.set(id, { totalViolations: 0, penalizedDays: 0, shiftAssigned: false, shiftStart: null }),
  );
  if (employeeIds.length === 0) return result;

  const [{ data: shifts }, { data: logs }] = await Promise.all([
    supabase
      .from("employee_shifts")
      .select("employee_id, start_time, effective_from, effective_to")
      .in("employee_id", employeeIds),
    supabase
      .from("attendance_logs")
      .select("employee_id, date, check_in, check_in_at, status")
      .in("employee_id", employeeIds)
      .gte("date", from)
      .lte("date", to),
  ]);

  // Latest shift whose effective window overlaps the period.
  const shiftFor = new Map<string, { start: string; from: string | null }>();
  for (const s of shifts || []) {
    if (!s.start_time) continue;
    if (s.effective_to && s.effective_to < from) continue;
    if (s.effective_from && s.effective_from > to) continue;
    const current = shiftFor.get(s.employee_id);
    if (!current || (s.effective_from || "") >= (current.from || "")) {
      shiftFor.set(s.employee_id, { start: String(s.start_time).slice(0, 5), from: s.effective_from ?? null });
    }
  }

  for (const [employeeId, shift] of shiftFor) {
    const bucket = result.get(employeeId);
    if (!bucket) continue;
    bucket.shiftAssigned = true;
    bucket.shiftStart = shift.start;
  }

  const countedDates = new Map<string, Set<string>>();
  for (const log of logs || []) {
    const bucket = result.get(log.employee_id);
    const shift = shiftFor.get(log.employee_id);
    if (!bucket || !shift) continue;

    const deadline = (timeToMinutes(shift.start) ?? 0) + GRACE_PERIOD_MINUTES;
    const actual = checkInMinutes(log);
    if (actual === null || actual <= deadline) continue;

    const seen = countedDates.get(log.employee_id) || new Set<string>();
    if (seen.has(log.date)) continue; // one violation per calendar day
    seen.add(log.date);
    countedDates.set(log.employee_id, seen);

    bucket.totalViolations += 1;
  }

  for (const bucket of result.values()) {
    bucket.penalizedDays = Math.max(0, bucket.totalViolations - GRACE_FREE_VIOLATIONS);
  }

  return result;
}
