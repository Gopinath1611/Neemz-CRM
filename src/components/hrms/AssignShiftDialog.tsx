import { useEffect, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Clock, CalendarDays, StickyNote, Save, X } from "lucide-react";

export interface EmployeeOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employee_code: string | null;
}

export interface ShiftOption {
  shift_name: string;
  start_time: string;
  end_time: string;
}

export interface AssignShiftPayload {
  employee_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  weekly_off_days: number[];
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

interface AssignShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeOption[];
  shiftOptions: ShiftOption[];
  initialEmployeeId?: string;
  initialShiftName?: string;
  onSave: (payload: AssignShiftPayload) => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// DB weekly_off_days uses 0=Sun..6=Sat. Default working days = Mon-Sat.
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

const format12h = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  if ([h, m].some((n) => Number.isNaN(n))) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};

const toTimeInput = (time: string) => time?.slice(0, 5) || "09:00";

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export function AssignShiftDialog({
  open,
  onOpenChange,
  employees,
  shiftOptions,
  initialEmployeeId,
  initialShiftName,
  onSave,
}: AssignShiftDialogProps) {
  // Deduplicate shifts by name; keep the first occurrence as the canonical record.
  const uniqueShifts = useMemo(() => {
    const map = new Map<string, ShiftOption>();
    for (const s of shiftOptions) {
      if (!map.has(s.shift_name)) {
        map.set(s.shift_name, s);
      }
    }
    return Array.from(map.values());
  }, [shiftOptions]);

  const [employeeId, setEmployeeId] = useState(initialEmployeeId || "");
  const [shiftName, setShiftName] = useState(initialShiftName || "General");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("09:00");
  const [manualEndTime, setManualEndTime] = useState("18:00");
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [notes, setNotes] = useState("");

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId],
  );

  const selectedShift = useMemo(
    () => uniqueShifts.find((s) => s.shift_name === shiftName) || uniqueShifts[0],
    [uniqueShifts, shiftName],
  );

  // Reset form whenever the dialog opens with new initial values.
  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployeeId || "");
    setShiftName(initialShiftName || "General");
    setStartDate(todayStr());
    setEndDate("");
    setWorkingDays(DEFAULT_WORKING_DAYS);
    setNotes("");

    const initialOption =
      uniqueShifts.find((s) => s.shift_name === (initialShiftName || "General")) ||
      uniqueShifts[0];
    setManualStartTime(toTimeInput(initialOption?.start_time || "09:00"));
    setManualEndTime(toTimeInput(initialOption?.end_time || "18:00"));
  }, [open, initialEmployeeId, initialShiftName, uniqueShifts]);

  // Auto-fill manual time inputs when the shift dropdown selection changes.
  useEffect(() => {
    if (!selectedShift) return;
    setManualStartTime(toTimeInput(selectedShift.start_time));
    setManualEndTime(toTimeInput(selectedShift.end_time));
  }, [selectedShift?.shift_name]);

  const toggleWorkingDay = (day: number) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  // Quick date range helpers
  const setMonthlyRange = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(fmtDate(first));
    setEndDate(fmtDate(last));
  };

  const setSameAsStart = () => {
    if (startDate) setEndDate(startDate);
  };

  const setCustomAll = () => {
    setEndDate("");
  };

  const handleSave = () => {
    if (!employeeId) return;
    if (!shiftName.trim()) return;

    const weeklyOffDays = [0, 1, 2, 3, 4, 5, 6].filter(
      (d) => !workingDays.includes(d),
    );

    onSave({
      employee_id: employeeId,
      shift_name: shiftName,
      start_time: manualStartTime,
      end_time: manualEndTime,
      weekly_off_days: weeklyOffDays,
      effective_from: startDate,
      effective_to: endDate || null,
      notes: notes.trim() || null,
    });
  };

  const employeeLocked = Boolean(initialEmployeeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Assign Shift
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <User className="h-4 w-4 text-muted-foreground" /> Employee *
            </Label>
            {employeeLocked && selectedEmployee ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
                <span className="text-sm font-medium">
                  {selectedEmployee.first_name} {selectedEmployee.last_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({selectedEmployee.employee_code})
                </span>
              </div>
            ) : (
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} ({e.employee_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Shift Name */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" /> Shift Name *
            </Label>
            <Select value={shiftName} onValueChange={setShiftName}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select shift" />
              </SelectTrigger>
              <SelectContent>
                {uniqueShifts.map((s) => (
                  <SelectItem key={s.shift_name} value={s.shift_name}>
                    {s.shift_name} ({s.start_time.slice(0, 5)} -{" "}
                    {s.end_time.slice(0, 5)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Clock className="h-3.5 w-3.5" />
              {format12h(manualStartTime)} - {format12h(manualEndTime)}
            </div>
          </div>

          {/* Manual Time Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" /> Start Time *
              </Label>
              <Input
                type="time"
                value={manualStartTime}
                onChange={(e) => setManualStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" /> End Time *
              </Label>
              <Input
                type="time"
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-muted-foreground" /> Date Range *
              </Label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={setMonthlyRange}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition"
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={setSameAsStart}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition"
                >
                  Same as Start
                </button>
                <button
                  type="button"
                  onClick={setCustomAll}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition"
                >
                  Custom / All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Working Days */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Working Days</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, index) => {
                const day = index; // 0=Sun..6=Sat
                const checked = workingDays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWorkingDay(day)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      checked
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    aria-pressed={checked}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Default: Monday to Saturday working, Sunday off.
            </p>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <StickyNote className="h-4 w-4 text-muted-foreground" /> Remarks / Notes
            </Label>
            <Textarea
              placeholder="Add management remarks (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="gap-1.5"
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!employeeId || !shiftName.trim() || !startDate || !manualStartTime || !manualEndTime}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" /> Save Shift
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
