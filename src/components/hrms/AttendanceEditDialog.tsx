import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LATE_GRACE_MINUTES } from "@/hooks/useMyAttendance";

/** Minimum shape of an attendance_logs row needed by the editor. */
export interface EditableAttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  check_in?: string | null;
  check_out?: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  worked_seconds?: number | null;
  hours_worked?: number | null;
  status?: string | null;
  late_entry?: boolean | null;
  notes?: string | null;
}

/** Leave codes written only by hrmsSync from approved leave_requests. */
const LEAVE_STATUSES = new Set(["cl", "sl", "el", "lv", "leave"]);

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half Day" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "week_off", label: "Week Off" },
  { value: "overtime", label: "Overtime" },
  { value: "manual", label: "Manual Entry" },
  { value: "pending", label: "Pending approval" },
  { value: "leave", label: "Leave (see Leave Management)", leaveGuarded: true },
];

const NO_TIME_STATUSES = new Set(["absent", "week_off", "cl", "sl", "el", "lv", "leave"]);

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * Worked seconds between check-in and check-out on the given date.
 * Accepts "HH:mm" or "HH:mm:ss". If check-out is at/before check-in it is
 * treated as past-midnight (overnight shift) and rolled to the next day.
 * Returns null when either time is missing.
 */
const computeWorkedSeconds = (
  date: string,
  inTime: string,
  outTime: string,
): number | null => {
  const inStr = inTime.length === 5 ? `${inTime}:00` : inTime;
  const outStr = outTime.length === 5 ? `${outTime}:00` : outTime;
  const inAt = new Date(`${date}T${inStr}`);
  let outAt = new Date(`${date}T${outStr}`);
  if (Number.isNaN(inAt.getTime()) || Number.isNaN(outAt.getTime())) return null;
  if (outAt.getTime() <= inAt.getTime()) {
    outAt = new Date(outAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return Math.floor((outAt.getTime() - inAt.getTime()) / 1000);
};

/** Prefer the precise timestamp, fall back to the legacy HH:mm:ss column. */
const toTimeInput = (iso?: string | null, legacy?: string | null) => {
  if (iso) return format(new Date(iso), "HH:mm");
  if (legacy) return legacy.slice(0, 5);
  return "";
};

const formatSecs = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: EditableAttendanceRecord | null;
  employeeName?: string;
  /** Shift start "HH:mm:ss" used to recompute the late flag. */
  shiftStart?: string;
  onSaved?: () => void;
}

/**
 * Admin/HR attendance correction dialog. Edits check-in / check-out / status of
 * an existing attendance_logs row, recalculates worked time + late flag, and
 * writes a full before/after entry to attendance_audit.
 */
const AttendanceEditDialog = ({
  open,
  onOpenChange,
  record,
  employeeName,
  shiftStart = "09:00:00",
  onSaved,
}: Props) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [eIn, setEIn] = useState("");
  const [eOut, setEOut] = useState("");
  const [eStatus, setEStatus] = useState("present");
  const [eReason, setEReason] = useState("");

  useEffect(() => {
    if (!open || !record) return;
    setEIn(toTimeInput(record.check_in_at, record.check_in));
    setEOut(toTimeInput(record.check_out_at, record.check_out));
    setEStatus(record.status || "present");
    setEReason("");
  }, [open, record]);

  if (!record) return null;

  const noTimes = NO_TIME_STATUSES.has(eStatus);
  const recordHasLeave = LEAVE_STATUSES.has(String(record.status || ""));

  // Live preview, recomputed from state on every keystroke.
  const previewSeconds =
    noTimes || !eIn || !eOut ? null : computeWorkedSeconds(record.date, eIn, eOut);

  const handleSave = async () => {
    const reason = eReason.trim();
    if (!reason) {
      toast.error("Reason for the correction is required.");
      return;
    }

    let inAt: Date | null = null;
    let outAt: Date | null = null;
    if (!noTimes) {
      if (!eIn) {
        toast.error("Check-in time is required for a working status.");
        return;
      }
      inAt = new Date(`${record.date}T${eIn.length === 5 ? `${eIn}:00` : eIn}`);
      outAt = eOut ? new Date(`${record.date}T${eOut.length === 5 ? `${eOut}:00` : eOut}`) : null;
      // Overnight shift: check-out at/before check-in rolls into the next day.
      if (inAt && outAt && outAt.getTime() <= inAt.getTime()) {
        outAt = new Date(outAt.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    // Recompute worked seconds from the exact timestamps being saved.
    const seconds =
      inAt && outAt ? Math.floor((outAt.getTime() - inAt.getTime()) / 1000) : null;
    const hours = seconds != null ? Number((seconds / 3600).toFixed(2)) : noTimes ? 0 : null;
    const late =
      !!inAt &&
      timeToMinutes(format(inAt, "HH:mm")) >
        timeToMinutes(shiftStart.slice(0, 5)) + LATE_GRACE_MINUTES;

    const payload = {
      check_in: inAt ? format(inAt, "HH:mm:ss") : null,
      check_in_at: inAt ? inAt.toISOString() : null,
      check_out: outAt ? format(outAt, "HH:mm:ss") : null,
      check_out_at: outAt ? outAt.toISOString() : null,
      worked_seconds: noTimes ? 0 : seconds,
      hours_worked: hours,
      overtime_hours: noTimes ? 0 : hours != null ? Math.max(0, Number((hours - 8).toFixed(2))) : 0,
      // "overtime" / "manual" are flags on a normal present day, not real statuses.
      status: eStatus === "overtime" || eStatus === "manual" ? "present" : eStatus,
      late_entry: late,
      manual_entry: true,
      notes: reason,
    };

    setBusy(true);
    const { error } = await supabase
      .from("attendance_logs")
      .update(payload)
      .eq("id", record.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    await supabase.from("attendance_audit").insert({
      attendance_id: record.id,
      employee_id: record.employee_id,
      action: "admin_edit",
      details: {
        date: record.date,
        reason,
        before: {
          check_in: record.check_in_at ?? record.check_in ?? null,
          check_out: record.check_out_at ?? record.check_out ?? null,
          status: record.status ?? null,
          late_entry: record.late_entry ?? null,
          worked_seconds: record.worked_seconds ?? null,
        },
        after: {
          check_in: payload.check_in_at,
          check_out: payload.check_out_at,
          status: payload.status,
          late_entry: payload.late_entry,
          worked_seconds: payload.worked_seconds,
        },
      } as never,
      performed_by: user?.id ?? null,
    } as never);

    setBusy(false);
    toast.success("Attendance corrected");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit attendance{employeeName ? ` — ${employeeName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <Badge variant="secondary">
              {format(new Date(`${record.date}T00:00:00`), "EEEE, d MMM yyyy")}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={eStatus} onValueChange={setEStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem
                    key={s.value}
                    value={s.value}
                    disabled={"leaveGuarded" in s && !recordHasLeave}
                    title={
                      "leaveGuarded" in s && !recordHasLeave
                        ? "Approve a leave request in Leave Management to set this"
                        : undefined
                    }
                  >
                    {s.label}
                  </SelectItem>
                ))}
                {recordHasLeave && !STATUS_OPTIONS.some((s) => s.value === record.status) && (
                  <SelectItem value={record.status as string}>
                    {`Approved leave (${String(record.status).toUpperCase()})`}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {!recordHasLeave && (
              <p className="text-[11px] text-muted-foreground">
                Leave statuses (CL / SL / EL / LV) are set automatically from approved leave
                requests in Leave Management.
              </p>
            )}
            {noTimes && (
              <p className="text-[11px] text-muted-foreground">
                Check-in/out times will be cleared for this status.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ae-in">Check-in time {noTimes ? "" : "*"}</Label>
              <Input
                id="ae-in"
                type="time"
                value={eIn}
                disabled={noTimes}
                onChange={(e) => setEIn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ae-out">Check-out time</Label>
              <Input
                id="ae-out"
                type="time"
                value={eOut}
                disabled={noTimes}
                onChange={(e) => setEOut(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">Worked time (recalculated)</span>
            <span className="font-semibold tabular-nums">
              {noTimes ? "0h 0m" : previewSeconds != null ? formatSecs(previewSeconds) : "—"}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ae-reason">Reason for correction *</Label>
            <Textarea
              id="ae-reason"
              rows={2}
              maxLength={500}
              placeholder="e.g. Forgot to check out — corrected to actual leaving time"
              value={eReason}
              onChange={(e) => setEReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={busy || !eReason.trim()}>
              {busy ? "Saving…" : "Save correction"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AttendanceEditDialog;
