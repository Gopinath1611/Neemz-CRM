import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  worked_seconds: number | null;
  hours_worked: number | null;
  status: string;
  late_entry: boolean | null;
  manual_entry: boolean | null;
}

export interface ShiftInfo {
  shift_name: string;
  start_time: string;
  end_time: string;
  weekly_off_days: number[];
}

const DEFAULT_SHIFT: ShiftInfo = {
  shift_name: "General",
  start_time: "09:00:00",
  end_time: "18:00:00",
  weekly_off_days: [0],
};

/** Seconds -> HH:mm:ss */
export const formatDuration = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
};

/** Seconds -> "9h 17m" */
export const formatHoursShort = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export const formatClock = (iso: string | null) =>
  iso ? format(new Date(iso), "hh:mm:ss a") : "—";

/** Minutes of grace before an entry is flagged late. */
export const LATE_GRACE_MINUTES = 15;

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/* ---------------- geo-fence validation helpers ---------------- */

interface GeoZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  applicable_employees: string[] | null;
  applicable_departments: string[] | null;
  applicable_locations: string[] | null;
  excluded_employees: string[] | null;
}

/** Haversine distance in meters */
const distanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const getCurrentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("no-geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });

const GEO_ERROR =
  "Unable to get your current location. Please enable location access and try again.";

export const useMyAttendance = (month: Date) => {
  const { user } = useAuth();
  const { currentBranchId } = useBranch();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [shift, setShift] = useState<ShiftInfo>(DEFAULT_SHIFT);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noEmployee, setNoEmployee] = useState(false);
  const [tick, setTick] = useState(0);
  const monthKey = format(month, "yyyy-MM");
  const employeeIdRef = useRef<string | null>(null);
  const empMetaRef = useRef<{ department: string; location: string }>({
    department: "",
    location: "",
  });

  const today = format(new Date(), "yyyy-MM-dd");

  /* -------- resolve employee + shift -------- */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) return;
      const { data: emp } = await supabase
        .from("employees")
        .select("id, first_name, last_name, department, extra_details")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!emp) {
        setNoEmployee(true);
        setLoading(false);
        return;
      }
      setEmployeeId(emp.id);
      employeeIdRef.current = emp.id;
      empMetaRef.current = {
        department: (emp as { department?: string }).department ?? "",
        location:
          ((emp as { extra_details?: { location?: string } }).extra_details
            ?.location as string) ?? "",
      };
      setEmployeeName(`${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim());

      const { data: sh } = await supabase
        .from("employee_shifts")
        .select("shift_name, start_time, end_time, weekly_off_days")
        .eq("employee_id", emp.id)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && sh) setShift(sh as ShiftInfo);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /* -------- load month records -------- */
  const loadRecords = useCallback(async () => {
    const empId = employeeIdRef.current;
    if (!empId) return;
    const from = format(startOfMonth(month), "yyyy-MM-dd");
    const to = format(endOfMonth(month), "yyyy-MM-dd");
    setLoading(true);
    const [{ data: rows }, { data: hols }] = await Promise.all([
      supabase
        .from("attendance_logs")
        .select(
          "id, employee_id, date, check_in, check_out, check_in_at, check_out_at, worked_seconds, hours_worked, status, late_entry, manual_entry",
        )
        .eq("employee_id", empId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true }),
      supabase
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", from)
        .lte("holiday_date", to),
    ]);
    setRecords((rows as AttendanceRecord[]) ?? []);
    setHolidays(
      new Set(((hols as { holiday_date: string }[]) ?? []).map((h) => h.holiday_date)),
    );
    setLoading(false);
  }, [month]);

  useEffect(() => {
    if (employeeId) loadRecords();
  }, [employeeId, monthKey, loadRecords]);

  /* -------- live ticking (timestamp based, refresh-safe) -------- */
  const todayRecord = useMemo(
    () => records.find((r) => r.date === today) ?? null,
    [records, today],
  );
  const isRunning = !!todayRecord?.check_in_at && !todayRecord?.check_out_at;

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const workedSeconds = useMemo(() => {
    if (!todayRecord) return 0;
    if (todayRecord.check_out_at && todayRecord.check_in_at) {
      return (
        todayRecord.worked_seconds ??
        Math.floor(
          (new Date(todayRecord.check_out_at).getTime() -
            new Date(todayRecord.check_in_at).getTime()) /
            1000,
        )
      );
    }
    if (todayRecord.check_in_at) {
      return Math.floor(
        (Date.now() - new Date(todayRecord.check_in_at).getTime()) / 1000,
      );
    }
    return todayRecord.worked_seconds ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayRecord, tick]);

  const audit = async (
    action: string,
    attendanceId: string | null,
    details: Record<string, unknown>,
  ) => {
    const empId = employeeIdRef.current;
    if (!empId) return;
    await supabase.from("attendance_audit").insert({
      attendance_id: attendanceId,
      employee_id: empId,
      action,
      details: details as never,
      performed_by: user?.id ?? null,
    } as never);
  };


  /* -------- GPS capture + geo-fence validation -------- */
  const validateLocation = useCallback(async (): Promise<{
    lat?: number;
    lng?: number;
    error?: string;
  }> => {
    const empId = employeeIdRef.current;
    if (!empId) return { error: "No employee profile linked to your account." };

    let pos: GeolocationPosition;
    try {
      pos = await getCurrentPosition();
    } catch {
      return { error: GEO_ERROR };
    }
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: GEO_ERROR };

    const { data: zonesRaw } = await supabase
      .from("geofence_zones")
      .select(
        "id, name, latitude, longitude, radius_meters, is_active, applicable_employees, applicable_departments, applicable_locations, excluded_employees",
      )
      .eq("is_active", true);
    const zones = (zonesRaw as unknown as GeoZone[]) ?? [];
    const { department, location } = empMetaRef.current;

    const applicable = zones.filter((z) => {
      if ((z.excluded_employees ?? []).includes(empId)) return false;
      return (
        (z.applicable_employees ?? []).includes(empId) ||
        (!!department && (z.applicable_departments ?? []).includes(department)) ||
        (!!location && (z.applicable_locations ?? []).includes(location))
      );
    });

    if (applicable.length === 0)
      return { error: "You are outside the allowed check-in location." };

    const inside = applicable.some(
      (z) =>
        distanceMeters(lat, lng, Number(z.latitude), Number(z.longitude)) <=
        Number(z.radius_meters ?? 0),
    );
    if (!inside) return { error: "You are outside the allowed check-in location." };

    return { lat, lng };
  }, []);

  /* -------- check in -------- */
  const checkIn = useCallback(async (): Promise<{ error?: string }> => {
    const empId = employeeIdRef.current;
    if (!empId) return { error: "No employee profile linked to your account." };
    if (todayRecord?.check_in_at) return { error: "You have already checked in today." };
    setBusy(true);
    const geo = await validateLocation();
    if (geo.error) {
      setBusy(false);
      return { error: geo.error };
    }
    const now = new Date();
    const late =
      timeToMinutes(format(now, "HH:mm")) >
      timeToMinutes(shift.start_time) + LATE_GRACE_MINUTES;
    const payload = {
      employee_id: empId,
      date: today,
      check_in: format(now, "HH:mm:ss"),
      check_in_at: now.toISOString(),
      check_in_lat: geo.lat,
      check_in_lng: geo.lng,
      status: "present",
      late_entry: late,
      manual_entry: false,
      branch_id: currentBranchId,
      created_by: user?.id ?? null,
    };
    const { data, error } = todayRecord
      ? await supabase
          .from("attendance_logs")
          .update(payload)
          .eq("id", todayRecord.id)
          .select("id")
          .maybeSingle()
      : await supabase.from("attendance_logs").insert(payload).select("id").maybeSingle();
    setBusy(false);
    if (error) return { error: error.message };
    await audit("check_in", data?.id ?? null, { at: payload.check_in_at, late });
    await loadRecords();
    return {};
  }, [todayRecord, shift, today, currentBranchId, user?.id, loadRecords, validateLocation]);

  /* -------- check out -------- */
  const checkOut = useCallback(async (): Promise<{ error?: string }> => {
    if (!todayRecord?.check_in_at) return { error: "Please check in first." };
    if (todayRecord.check_out_at) return { error: "You have already checked out today." };
    setBusy(true);
    const geo = await validateLocation();
    if (geo.error) {
      setBusy(false);
      return { error: geo.error };
    }
    const now = new Date();
    const seconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(todayRecord.check_in_at).getTime()) / 1000),
    );
    const { error } = await supabase
      .from("attendance_logs")
      .update({
        check_out: format(now, "HH:mm:ss"),
        check_out_at: now.toISOString(),
        check_out_lat: geo.lat,
        check_out_lng: geo.lng,
        worked_seconds: seconds,
        hours_worked: Number((seconds / 3600).toFixed(2)),
      })
      .eq("id", todayRecord.id)
      .is("check_out_at", null);
    setBusy(false);
    if (error) return { error: error.message };
    await audit("check_out", todayRecord.id, {
      at: now.toISOString(),
      worked_seconds: seconds,
    });
    await loadRecords();
    return {};
  }, [todayRecord, loadRecords, validateLocation]);

  /* -------- manual entry (missing dates) -------- */
  const submitManualEntry = useCallback(
    async (input: {
      date: string;
      checkIn: string;
      checkOut?: string;
      reason: string;
    }): Promise<{ error?: string; pending?: boolean }> => {
      const empId = employeeIdRef.current;
      if (!empId) return { error: "No employee profile linked to your account." };
      const reason = input.reason.trim();
      if (!input.date) return { error: "Please choose a date." };
      if (input.date > today) return { error: "Manual entry is only allowed for past dates." };
      if (!input.checkIn) return { error: "Check-in time is required." };
      if (!reason) return { error: "Reason / remarks is required." };
      const existing = records.find((r) => r.date === input.date);
      if (existing?.check_in_at)
        return { error: "Attendance already exists for this date." };

      const inAt = new Date(`${input.date}T${input.checkIn}:00`);
      const outAt = input.checkOut ? new Date(`${input.date}T${input.checkOut}:00`) : null;
      if (outAt && outAt <= inAt) return { error: "Check-out must be after check-in." };
      const seconds = outAt
        ? Math.floor((outAt.getTime() - inAt.getTime()) / 1000)
        : null;

      // HR/admin insert directly as approved; others go in as pending approval.
      let approved = false;
      if (user?.id) {
        const { data: hrOrAdmin } = await supabase.rpc("is_hr_or_admin", {
          _user_id: user.id,
        });
        approved = !!hrOrAdmin;
      }

      const late =
        timeToMinutes(input.checkIn) >
        timeToMinutes(shift.start_time) + LATE_GRACE_MINUTES;
      const payload = {
        employee_id: empId,
        date: input.date,
        check_in: `${input.checkIn}:00`,
        check_in_at: inAt.toISOString(),
        check_out: input.checkOut ? `${input.checkOut}:00` : null,
        check_out_at: outAt ? outAt.toISOString() : null,
        worked_seconds: seconds,
        hours_worked: seconds != null ? Number((seconds / 3600).toFixed(2)) : null,
        status: approved ? "present" : "pending",
        late_entry: late,
        manual_entry: true,
        notes: reason,
        branch_id: currentBranchId,
        created_by: user?.id ?? null,
      };
      const { data, error } = existing
        ? await supabase
            .from("attendance_logs")
            .update(payload)
            .eq("id", existing.id)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("attendance_logs")
            .insert(payload)
            .select("id")
            .maybeSingle();
      if (error) return { error: error.message };
      await audit("manual_entry", data?.id ?? existing?.id ?? null, {
        date: input.date,
        check_in: payload.check_in_at,
        check_out: payload.check_out_at,
        reason,
        approved,
      });
      await loadRecords();
      return { pending: !approved };
    },
    [records, today, shift.start_time, currentBranchId, user?.id, loadRecords],
  );

  /* -------- monthly summary -------- */
  const summary = useMemo(() => {
    const presentDays = records.filter((r) => r.check_in_at).length;
    const lateDays = records.filter((r) => r.late_entry).length;
    const holidayWorked = records.filter(
      (r) => r.check_in_at && holidays.has(r.date),
    ).length;
    const totalSeconds = records.reduce((sum, r) => {
      if (r.worked_seconds) return sum + r.worked_seconds;
      if (r.hours_worked) return sum + r.hours_worked * 3600;
      return sum;
    }, 0);
    const monthStart = startOfMonth(month);
    const limit = new Date() < endOfMonth(month) ? new Date() : endOfMonth(month);
    let workingDays = 0;
    for (const d = new Date(monthStart); d <= limit; d.setDate(d.getDate() + 1)) {
      const key = format(d, "yyyy-MM-dd");
      if (shift.weekly_off_days.includes(d.getDay())) continue;
      if (holidays.has(key)) continue;
      workingDays++;
    }
    return {
      presentDays,
      absentDays: Math.max(0, workingDays - presentDays),
      lateDays,
      holidayWorked,
      totalSeconds,
      avgSeconds: presentDays ? totalSeconds / presentDays : 0,
    };
  }, [records, holidays, month, shift.weekly_off_days]);

  return {
    employeeId,
    employeeName,
    shift,
    records,
    holidays,
    todayRecord,
    isRunning,
    workedSeconds,
    summary,
    loading,
    busy,
    noEmployee,
    checkIn,
    checkOut,
    submitManualEntry,
    reload: loadRecords,
  };
};
