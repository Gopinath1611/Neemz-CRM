import { useMemo, useState } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isAfter,
  startOfDay,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  CalendarDays,
  Footprints,
  UserCog,
  Flame,
  Square,
  SquareDashed,
  Hash,
  LogIn,
  LogOut,
  Timer,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  useMyAttendance,
  formatDuration,
  formatHoursShort,
  formatClock,
  type AttendanceRecord,
} from "@/hooks/useMyAttendance";
import AttendanceEditDialog from "@/components/hrms/AttendanceEditDialog";
import { useAuth } from "@/contexts/AuthContext";

/* ----------------------------- config ----------------------------- */

const LEGEND: { label: string; icon: typeof Footprints; color: string }[] = [
  { label: "Late entry", icon: Footprints, color: "text-amber-500" },
  { label: "Manual entry", icon: UserCog, color: "text-blue-500" },
  { label: "OT", icon: Flame, color: "text-orange-500" },
  { label: "Pending", icon: Square, color: "text-red-500" },
  { label: "Worked on day off/holiday", icon: SquareDashed, color: "text-blue-500" },
];

const PageHeader = ({ title }: { title: string }) => (
  <div className="rounded-lg border-l-4 border-l-primary bg-primary/5 px-4 py-3 mb-4">
    <h1 className="text-xl font-bold tracking-tight">{title}</h1>
  </div>
);

type DayState = "present" | "absent" | "late" | "holidayWorked" | "future" | "off";

const DAY_CLASSES: Record<DayState, string> = {
  present: "bg-green-100 text-green-800 border border-green-300",
  late: "bg-orange-100 text-orange-800 border border-orange-300",
  absent: "bg-red-100 text-red-700 border border-red-300",
  holidayWorked: "bg-blue-100 text-blue-800 border border-blue-300",
  future: "bg-muted/40 text-muted-foreground",
  off: "bg-muted/60 text-muted-foreground",
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </CardContent>
  </Card>
);

/* ----------------------------- component ----------------------------- */

const MyAttendance = () => {
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<"calendar" | "payPeriod">("calendar");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leftFilter, setLeftFilter] = useState("this-month");
  const [chartFilter, setChartFilter] = useState("this-month");
  const [detailDay, setDetailDay] = useState<Date | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [mDate, setMDate] = useState("");
  const [mIn, setMIn] = useState("");
  const [mOut, setMOut] = useState("");
  const [mReason, setMReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const { hasRole } = useAuth();
  const canEditAttendance = hasRole("admin") || hasRole("hr");

  const {
    shift,
    records,
    holidays,
    todayRecord,
    isRunning,
    workedSeconds,
    summary,
    busy,
    noEmployee,
    checkIn,
    checkOut,
    submitManualEntry,
    reload,
  } = useMyAttendance(month);

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }),
    [month],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach((r) => map.set(r.date, r));
    return map;
  }, [records]);

  const dayState = (d: Date): DayState => {
    const key = format(d, "yyyy-MM-dd");
    const rec = byDate.get(key);
    if (rec?.check_in_at) {
      if (holidays.has(key) || shift.weekly_off_days.includes(d.getDay()))
        return "holidayWorked";
      return rec.late_entry ? "late" : "present";
    }
    if (isAfter(startOfDay(d), startOfDay(new Date()))) return "future";
    if (holidays.has(key) || shift.weekly_off_days.includes(d.getDay())) return "off";
    return "absent";
  };

  const recSeconds = (r?: AttendanceRecord | null) =>
    r ? r.worked_seconds || Math.round((r.hours_worked || 0) * 3600) : 0;

  const headerLabel =
    viewMode === "calendar"
      ? format(month, "MMMM yyyy")
      : `${format(startOfMonth(month), "d MMM yyyy")} - ${format(endOfMonth(month), "d MMM yyyy")}`;

  const selectedDate = isSameMonth(new Date(), month) ? new Date() : startOfMonth(month);

  const rangeDays = useMemo(() => {
    if (leftFilter === "today") return days.filter((d) => isSameDay(d, new Date()));
    if (leftFilter === "this-week") {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return days.filter((d) => d >= startOfDay(start) && d <= now);
    }
    return days;
  }, [days, leftFilter]);

  const gridRows = useMemo(
    () =>
      rangeDays
        .filter((d) => byDate.get(format(d, "yyyy-MM-dd"))?.check_in_at)
        .map((d) => ({ date: d, rec: byDate.get(format(d, "yyyy-MM-dd"))! }))
        .reverse(),
    [rangeDays, byDate],
  );

  const chartDays = useMemo(() => {
    if (chartFilter === "today") return days.filter((d) => isSameDay(d, new Date()));
    if (chartFilter === "this-week") {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return days.filter((d) => d >= startOfDay(start) && d <= now);
    }
    return days;
  }, [days, chartFilter]);

  const chartData = useMemo(
    () =>
      chartDays.map((d) => {
        const rec = byDate.get(format(d, "yyyy-MM-dd"));
        const secs = isSameDay(d, new Date()) && isRunning ? workedSeconds : recSeconds(rec);
        return {
          day: format(d, "EEE dd"),
          hours: secs ? Number((secs / 3600).toFixed(2)) : null,
          checkIn: formatClock(rec?.check_in_at ?? null),
          checkOut: formatClock(rec?.check_out_at ?? null),
          worked: secs ? formatHoursShort(secs) : "—",
        };
      }),
    [chartDays, byDate, isRunning, workedSeconds],
  );

  const detailRec = detailDay ? byDate.get(format(detailDay, "yyyy-MM-dd")) : null;

  const todayStatus = !todayRecord?.check_in_at
    ? "Not checked in"
    : todayRecord.check_out_at
      ? "Completed"
      : todayRecord.late_entry
        ? "Late entry"
        : "Present";

  const handleCheckIn = async () => {
    const { error } = await checkIn();
    if (error) toast.error(error);
    else toast.success("Checked in successfully");
  };

  const handleCheckOut = async () => {
    const { error } = await checkOut();
    if (error) toast.error(error);
    else toast.success("Checked out successfully");
  };

  const handleManualSubmit = async () => {
    setManualBusy(true);
    const { error, pending } = await submitManualEntry({
      date: mDate,
      checkIn: mIn,
      checkOut: mOut || undefined,
      reason: mReason,
    });
    setManualBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      pending
        ? "Manual entry submitted — pending HR/admin approval"
        : "Manual attendance entry added",
    );
    setManualOpen(false);
    setMDate("");
    setMIn("");
    setMOut("");
    setMReason("");
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader title="My attendance" />

      {/* ---------- Check in / out control ---------- */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="rounded-lg bg-primary/5 border px-4 py-3 min-w-[170px]">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Timer size={13} /> Worked today
              </p>
              <p className="text-2xl font-bold tabular-nums tracking-tight">
                {formatDuration(workedSeconds)}
              </p>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">
                Checked in:{" "}
                <span className="font-medium text-foreground">
                  {formatClock(todayRecord?.check_in_at ?? null)}
                </span>
              </p>
              <p className="text-muted-foreground">
                Checked out:{" "}
                <span className="font-medium text-foreground">
                  {formatClock(todayRecord?.check_out_at ?? null)}
                </span>
              </p>
              <Badge
                variant={todayStatus === "Completed" ? "secondary" : "default"}
                className="mt-1"
              >
                {todayStatus}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCheckIn}
              disabled={busy || noEmployee || !!todayRecord?.check_in_at}
              className="gap-2"
            >
              <LogIn size={16} /> Check In
            </Button>
            <Button
              variant="outline"
              onClick={handleCheckOut}
              disabled={busy || noEmployee || !isRunning}
              className="gap-2"
            >
              <LogOut size={16} /> Check Out
            </Button>
            <Button
              variant="secondary"
              onClick={() => setManualOpen(true)}
              disabled={noEmployee}
              className="gap-2"
            >
              <PenLine size={16} /> Manual Entry
            </Button>
          </div>
        </CardContent>
        {noEmployee && (
          <CardContent className="pt-0 pb-4">
            <p className="text-xs text-destructive">
              Your login is not linked to an employee record. Ask HR to link your account
              to enable attendance marking.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ---------- Manual entry dialog ---------- */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manual attendance entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              For a missed check-in on a past date. Entries from non-admin users are
              marked pending until HR/admin approval.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="me-date">Date *</Label>
              <Input
                id="me-date"
                type="date"
                value={mDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setMDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="me-in">Check-in time *</Label>
                <Input
                  id="me-in"
                  type="time"
                  value={mIn}
                  onChange={(e) => setMIn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="me-out">Check-out time</Label>
                <Input
                  id="me-out"
                  type="time"
                  value={mOut}
                  onChange={(e) => setMOut(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-reason">Reason / remarks *</Label>
              <Textarea
                id="me-reason"
                rows={3}
                maxLength={500}
                placeholder="e.g. Forgot to check in — was at front desk"
                value={mReason}
                onChange={(e) => setMReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setManualOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleManualSubmit}
                disabled={manualBusy || !mDate || !mIn || !mReason.trim()}
              >
                {manualBusy ? "Saving…" : "Submit entry"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Summary cards ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Present days" value={String(summary.presentDays)} />
        <SummaryCard label="Absent days" value={String(summary.absentDays)} />
        <SummaryCard label="Late days" value={String(summary.lateDays)} />
        <SummaryCard label="Holiday worked" value={String(summary.holidayWorked)} />
        <SummaryCard label="Avg working hours" value={formatHoursShort(summary.avgSeconds)} />
        <SummaryCard label="Total working hours" value={formatHoursShort(summary.totalSeconds)} />
      </div>

      {/* ---------- Attendance details card (calendar strip) ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Attendance details
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === "calendar" ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                title="Calendar view"
                onClick={() => setViewMode("calendar")}
              >
                <CalendarDays size={16} />
              </Button>
              <Button
                variant={viewMode === "payPeriod" ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                title="Pay period view"
                onClick={() => setViewMode("payPeriod")}
              >
                <Hash size={16} />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* top bar controls */}
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 min-w-[190px] justify-center">
                  <CalendarIcon size={15} />
                  {headerLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={month}
                  onSelect={(d) => {
                    if (d) setMonth(startOfMonth(d));
                    setPickerOpen(false);
                  }}
                  month={month}
                  onMonthChange={(m) => setMonth(startOfMonth(m))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  {...({
                    captionLayout: "dropdown-buttons",
                    fromYear: 2000,
                    toYear: new Date().getFullYear() + 5,
                  } as any)}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <l.icon size={14} className={l.color} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>

          {/* horizontal scrollable grid */}
          <div className="overflow-x-auto pb-2 -mx-1 px-1">
            <div className="flex gap-2 min-w-max">
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const rec = byDate.get(key);
                const state = dayState(d);
                const secs =
                  isSameDay(d, new Date()) && isRunning ? workedSeconds : recSeconds(rec);
                return (
                  <button
                    type="button"
                    key={d.toISOString()}
                    onClick={() => setDetailDay(d)}
                    className="flex flex-col items-center gap-1.5 w-[68px] shrink-0 focus:outline-none"
                  >
                    <div className="text-[11px] font-medium text-muted-foreground leading-tight text-center">
                      <div>{format(d, "EEE")}</div>
                      <div>{format(d, "MMM dd")}</div>
                    </div>
                    <div
                      className={cn(
                        "h-9 w-full rounded-md flex items-center justify-center text-[11px] font-medium",
                        DAY_CLASSES[state],
                      )}
                    >
                      {secs ? formatHoursShort(secs) : state === "absent" ? "A" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- two column mid section ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* left: first in / last out */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">First in / Last out</CardTitle>
              <Select value={leftFilter} onValueChange={setLeftFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this-week">This week</SelectItem>
                  <SelectItem value="this-month">This month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 px-2">Date</th>
                    <th className="text-left font-medium py-2 px-2">First in</th>
                    <th className="text-left font-medium py-2 px-2">Last out</th>
                    <th className="text-left font-medium py-2 px-2">Worked time</th>
                    <th className="text-left font-medium py-2 px-2">Status</th>
                    <th className="text-left font-medium py-2 px-2">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {gridRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No attendance records yet
                      </td>
                    </tr>
                  )}
                  {gridRows.map(({ date, rec }) => {
                    const secs =
                      isSameDay(date, new Date()) && isRunning ? workedSeconds : recSeconds(rec);
                    return (
                      <tr key={rec.id} className="border-b last:border-0">
                        <td className="py-2 px-2">{format(date, "dd MMM")}</td>
                        <td className="py-2 px-2">{formatClock(rec.check_in_at)}</td>
                        <td className="py-2 px-2">{formatClock(rec.check_out_at)}</td>
                        <td className="py-2 px-2">{secs ? formatHoursShort(secs) : "—"}</td>
                        <td className="py-2 px-2 capitalize">
                          {rec.check_out_at ? "Completed" : "In progress"}
                        </td>
                        <td className="py-2 px-2">
                          {rec.late_entry ? (
                            <Badge variant="destructive" className="text-[10px]">
                              Late
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* right: entry / exit details */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Entry / Exit details</CardTitle>
              <span className="text-xs text-muted-foreground">
                {format(selectedDate, "d MMM yyyy")}
              </span>
            </div>
            <Badge variant="secondary" className="w-fit mt-1 text-xs">
              {shift.shift_name} shift ({shift.start_time.slice(0, 5)} -{" "}
              {shift.end_time.slice(0, 5)})
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">Check in</p>
                <p className="text-base font-semibold">
                  {formatClock(todayRecord?.check_in_at ?? null)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">Check out</p>
                <p className="text-base font-semibold">
                  {formatClock(todayRecord?.check_out_at ?? null)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Worked time</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatDuration(workedSeconds)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Attendance status</span>
              <Badge variant={todayStatus === "Completed" ? "secondary" : "default"}>
                {todayStatus}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- bottom: total in-time analytics ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Total in-time</CardTitle>
            <Select value={chartFilter} onValueChange={setChartFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this-week">This week</SelectItem>
                <SelectItem value="this-month">This month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis
                  label={{
                    value: "Approximate hours",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11 },
                  }}
                  domain={[0, 20]}
                  ticks={[0, 5, 10, 15, 20]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: any) => [`${v} h`, "Worked"]}
                  labelFormatter={(label: string) => {
                    const row = chartData.find((c) => c.day === label);
                    if (!row) return label;
                    return `${label} · In ${row.checkIn} · Out ${row.checkOut} · ${row.worked}`;
                  }}
                />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ---------- day detail dialog ---------- */}
      <Dialog open={!!detailDay} onOpenChange={(o) => !o && setDetailDay(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {detailDay ? format(detailDay, "EEEE, d MMM yyyy") : "Attendance"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shift</span>
              <span>
                {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check in</span>
              <span>{formatClock(detailRec?.check_in_at ?? null)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check out</span>
              <span>{formatClock(detailRec?.check_out_at ?? null)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Worked time</span>
              <span>
                {recSeconds(detailRec) ? formatHoursShort(recSeconds(detailRec)) : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="secondary" className="capitalize">
                {detailDay ? dayState(detailDay).replace("holidayWorked", "holiday worked") : "—"}
              </Badge>
            </div>
          </div>
          {detailRec && canEditAttendance && (
            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setEditOpen(true)}
              >
                <PenLine size={14} /> Edit
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- admin edit dialog ---------- */}
      <AttendanceEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        record={detailRec ?? null}
        shiftStart={shift.start_time}
        onSaved={() => reload()}
      />
    </div>
  );
};

export default MyAttendance;
