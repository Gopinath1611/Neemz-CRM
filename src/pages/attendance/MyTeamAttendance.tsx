import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  CalendarIcon, ChevronLeft, ChevronRight, Download, Filter, Users, Plus, X, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns";
import { toast } from "sonner";
import AttendanceEditDialog from "@/components/hrms/AttendanceEditDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const STATUS_LEGEND = [
  { code: "P", label: "Present", color: "bg-green-500 text-white" },
  { code: "A", label: "Absent", color: "bg-red-500 text-white" },
  { code: "L", label: "Late", color: "bg-amber-500 text-white" },
  { code: "WO", label: "Week Off", color: "bg-gray-400 text-white" },
  { code: "HD", label: "Half Day", color: "bg-blue-500 text-white" },
  { code: "CL", label: "Casual Leave", color: "bg-teal-500 text-white" },
  { code: "SL", label: "Sick Leave", color: "bg-teal-500 text-white" },
  { code: "EL", label: "Earned Leave", color: "bg-teal-500 text-white" },
  { code: "LV", label: "Leave", color: "bg-teal-500 text-white" },
  { code: "OT", label: "Overtime", color: "bg-purple-500 text-white" },
  { code: "M", label: "Manual", color: "bg-orange-500 text-white" },
];
const colorFor = (code: string) => STATUS_LEGEND.find((s) => s.code === code)?.color || "bg-muted";

const codeFor = (log: any | null, isWeekOff: boolean, isFuture: boolean) => {
  if (isFuture) return "";
  if (!log) return isWeekOff ? "WO" : "";
  if (log.overtime_hours > 0) return "OT";
  if (log.status === "late") return "L";
  if (log.status === "half_day") return "HD";
  if (log.status === "cl") return "CL";
  if (log.status === "sl") return "SL";
  if (log.status === "el") return "EL";
  if (log.status === "lv" || log.status === "leave") return "LV";
  if (log.status === "week_off") return "WO";
  if (log.status === "absent") return "A";
  return "P";
};

const PAGE_SIZES = [10, 25, 50, 100];

const MyTeamAttendance = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Record<string, number[]>>({});
  const [shiftStarts, setShiftStarts] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [month, setMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "payperiod">("calendar");
  const [selectedCell, setSelectedCell] = useState<{ employee: any; date: string; log: any | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { hasRole } = useAuth();
  const canEditAttendance = hasRole("admin") || hasRole("hr");

  // Filter drawer state
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftLocation, setDraftLocation] = useState("all");
  const [draftJobTitle, setDraftJobTitle] = useState("all");
  const [draftDepartment, setDraftDepartment] = useState("all");
  const [draftRole, setDraftRole] = useState("all");
  const [draftBand, setDraftBand] = useState("");
  const [draftDivision, setDraftDivision] = useState("");
  const [draftStatuses, setDraftStatuses] = useState<string[]>(["Active"]);

  // Applied filters
  const [searchId, setSearchId] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [jobTitleFilter, setJobTitleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [locations, setLocations] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add-entry form
  const [entryType, setEntryType] = useState("present");
  const [entryIn, setEntryIn] = useState("09:00");
  const [entryOut, setEntryOut] = useState("18:00");
  const [entryNotes, setEntryNotes] = useState("");
  const navigate = useNavigate();

  /** Leave statuses are only allowed when hrmsSync already wrote one for the day. */
  const hasApprovedLeave = (log: any | null) =>
    !!log && ["cl", "sl", "el", "lv", "leave"].includes(String(log.status || ""));

  useEffect(() => { fetchAll(); }, [month]);

  const fetchAll = async () => {
    const { data: emps } = await supabase.from("employees")
      .select("id, first_name, last_name, employee_code, department, designation, extra_details")
      .eq("status", "active").order("first_name");
    if (emps) {
      setEmployees(emps);
      setLocations(Array.from(new Set(emps.map((e: any) => e.extra_details?.location).filter(Boolean))) as string[]);
      setJobTitles(Array.from(new Set(emps.map((e: any) => e.designation).filter(Boolean))) as string[]);
      setDepartments(Array.from(new Set(emps.map((e: any) => e.department).filter(Boolean))) as string[]);
    }

    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    const { data: lg } = await supabase.from("attendance_logs").select("*").gte("date", start).lte("date", end);
    setLogs(lg || []);

    const { data: sh } = await supabase.from("employee_shifts").select("employee_id, weekly_off_days, effective_from, start_time")
      .order("effective_from", { ascending: false });
    const map: Record<string, number[]> = {};
    const startMap: Record<string, string> = {};
    sh?.forEach((s: any) => {
      if (!map[s.employee_id]) map[s.employee_id] = s.weekly_off_days || [0];
      if (!startMap[s.employee_id] && s.start_time) startMap[s.employee_id] = s.start_time;
    });
    setShifts(map);
    setShiftStarts(startMap);
  };

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  const headerLabel = viewMode === "calendar"
    ? format(month, "MMMM yyyy")
    : `${format(startOfMonth(month), "d MMM yyyy")} - ${format(endOfMonth(month), "d MMM yyyy")}`;

  const logMap = useMemo(() => {
    const m: Record<string, any> = {};
    logs.forEach((l) => { m[`${l.employee_id}_${l.date}`] = l; });
    return m;
  }, [logs]);

  const filteredEmps = useMemo(() => employees.filter((e) => {
    if (searchId && !`${e.employee_code} ${e.first_name} ${e.last_name}`.toLowerCase().includes(searchId.toLowerCase())) return false;
    if (locationFilter !== "all" && e.extra_details?.location !== locationFilter) return false;
    if (jobTitleFilter !== "all" && e.designation !== jobTitleFilter) return false;
    if (departmentFilter !== "all" && e.department !== departmentFilter) return false;
    return true;
  }), [employees, searchId, locationFilter, jobTitleFilter, departmentFilter]);

  const total = filteredEmps.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedEmps = useMemo(
    () => filteredEmps.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredEmps, safePage, pageSize],
  );
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, safePage * pageSize);

  const applyFilters = () => {
    setSearchId(draftName);
    setLocationFilter(draftLocation);
    setJobTitleFilter(draftJobTitle);
    setDepartmentFilter(draftDepartment);
    setPage(1);
    setFilterOpen(false);
  };

  const resetAndApply = () => {
    setDraftName(""); setDraftLocation("all"); setDraftJobTitle("all"); setDraftDepartment("all");
    setDraftRole("all"); setDraftBand(""); setDraftDivision(""); setDraftStatuses(["Active"]);
    setSearchId(""); setLocationFilter("all"); setJobTitleFilter("all"); setDepartmentFilter("all");
    setPage(1);
    setFilterOpen(false);
  };

  const handleExport = () => {
    const headers = ["Employee Code", "Name", ...days.map((d) => format(d, "dd"))];
    const rows = filteredEmps.map((e) => {
      const woDays = shifts[e.id] || [0];
      const cells = days.map((d) => {
        const log = logMap[`${e.id}_${format(d, "yyyy-MM-dd")}`];
        return codeFor(log, woDays.includes(d.getDay()), d > new Date());
      });
      return [e.employee_code || "", `${e.first_name} ${e.last_name}`, ...cells];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `team-attendance-${format(month, "yyyy-MM")}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  const handleSaveEntry = async () => {
    if (!selectedCell) return;
    if (entryType === "leave") {
      toast.info("Leave is managed in Leave Management — approve the request there.");
      return;
    }
    const hrs = (() => {
      const [h1, m1] = entryIn.split(":").map(Number);
      const [h2, m2] = entryOut.split(":").map(Number);
      return Math.max(0, (h2 + m2 / 60) - (h1 + m1 / 60));
    })();
    const noTimes = entryType === "week_off" || entryType === "absent";
    // "overtime" / "manual" are presentation flags on a normal present day.
    const status =
      entryType === "week_off" ? "week_off"
      : entryType === "overtime" || entryType === "manual" ? "present"
      : entryType;
    const { error } = await supabase.from("attendance_logs").upsert({
      employee_id: selectedCell.employee.id, date: selectedCell.date,
      check_in: noTimes ? null : entryIn,
      check_out: noTimes ? null : entryOut,
      status,
      hours_worked: noTimes ? 0 : Math.round(hrs * 100) / 100,
      overtime_hours: noTimes ? 0 : Math.max(0, Math.round((hrs - 8) * 100) / 100),
      manual_entry: true,
      notes: entryNotes || null,
    }, { onConflict: "employee_id,date" });
    if (error) toast.error(error.message); else { toast.success("Saved"); setSelectedCell(null); fetchAll(); }
  };

  const handleEditSaved = async () => {
    await fetchAll();
    const logId = selectedCell?.log?.id;
    if (logId) {
      const { data } = await supabase.from("attendance_logs").select("*").eq("id", logId).maybeSingle();
      if (data) setSelectedCell((prev) => (prev ? { ...prev, log: data } : prev));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> My Team Attendance</h1>
          <p className="text-sm text-muted-foreground">Monthly attendance grid for all team members</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={16} /></Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2"><CalendarIcon size={16} />{headerLabel}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={month} onSelect={(d) => d && setMonth(d)} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></Button>

          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setViewMode("calendar")}
              className={cn("px-3 py-1.5 text-xs font-medium", viewMode === "calendar" ? "bg-primary text-primary-foreground" : "bg-background")}
            >Calendar view</button>
            <button
              onClick={() => setViewMode("payperiod")}
              className={cn("px-3 py-1.5 text-xs font-medium border-l", viewMode === "payperiod" ? "bg-primary text-primary-foreground" : "bg-background")}
            >[100] Pay period view</button>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)} className="gap-2"><Filter size={16} /> Filter</Button>
          <Button variant="outline" onClick={handleExport} className="gap-2"><Download size={16} /> Export</Button>
        </div>
      </div>

      {/* Legend */}
      <Card><CardContent className="pt-4 flex flex-wrap items-center gap-3">
        {STATUS_LEGEND.map((s) => (
          <div key={s.code} className="flex items-center gap-1 text-xs">
            <span className={cn("w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center", s.color)}>{s.code}</span>
            {s.label}
          </div>
        ))}
      </CardContent></Card>

      {/* Grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-muted/50 z-10 min-w-[180px]">Employee</th>
                {days.map((d) => {
                  const isWO = d.getDay() === 0;
                  return (
                    <th key={d.toISOString()} className={cn("p-1 min-w-[36px] font-semibold", isWO && "text-red-500")}>
                      <div>{format(d, "dd")}</div>
                      <div className="text-[9px] font-normal">{format(d, "EEE").charAt(0)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedEmps.map((e) => {
                const woDays = shifts[e.id] || [0];
                return (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 sticky left-0 bg-background z-10 border-r">
                      <div className="font-medium">{e.first_name} {e.last_name}</div>
                      <div className="text-[10px] text-muted-foreground">{e.employee_code}</div>
                    </td>
                    {days.map((d) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const log = logMap[`${e.id}_${dateStr}`];
                      const isWeekOff = woDays.includes(d.getDay());
                      const isFuture = d > new Date();
                      const code = codeFor(log, isWeekOff, isFuture);
                      return (
                        <td key={dateStr} className="p-0.5 text-center">
                          <button
                            onClick={() => { setSelectedCell({ employee: e, date: dateStr, log }); setEntryIn(log?.check_in || "09:00"); setEntryOut(log?.check_out || "18:00"); setEntryType(log?.status || "present"); setEntryNotes(log?.notes || ""); }}
                            className={cn("w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center mx-auto", code ? colorFor(code) : "bg-muted/30")}
                          >{code}</button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {total === 0 && (
                <tr><td colSpan={days.length + 1} className="text-center p-8 text-muted-foreground">No attendance records to display</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>

        {/* Pagination */}
        <div className="flex items-center justify-end gap-4 border-t px-4 py-2 text-xs">
          <span className="text-muted-foreground">Items per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="font-medium">{rangeStart} - {rangeEnd} of {total}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={14} /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage >= totalPages || total === 0} onClick={() => setPage(safePage + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      </Card>

      {/* Filter drawer */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
          <SheetHeader className="bg-primary text-primary-foreground px-4 py-3 flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-primary-foreground text-base">Filter</SheetTitle>
            <button onClick={() => setFilterOpen(false)} aria-label="Close filter"><X size={18} /></button>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <Label className="text-xs">Employee name or ID</Label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Search…" />
            </div>
            <div>
              <Label className="text-xs">Locations</Label>
              <Select value={draftLocation} onValueChange={setDraftLocation}>
                <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Job titles</Label>
              <Select value={draftJobTitle} onValueChange={setDraftJobTitle}>
                <SelectTrigger><SelectValue placeholder="All job titles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All job titles</SelectItem>
                  {jobTitles.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Departments</Label>
              <Select value={draftDepartment} onValueChange={setDraftDepartment}>
                <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Roles</Label>
              <Select value={draftRole} onValueChange={setDraftRole}>
                <SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bands</Label>
              <Input value={draftBand} onChange={(e) => setDraftBand(e.target.value)} placeholder="Enter band" />
            </div>
            <div>
              <Label className="text-xs">Divisions</Label>
              <Input value={draftDivision} onChange={(e) => setDraftDivision(e.target.value)} placeholder="Enter division" />
            </div>
            <div>
              <Label className="text-xs">Employee status</Label>
              <div className="mt-1 flex flex-wrap gap-2 rounded-md border p-2 min-h-[42px]">
                {draftStatuses.length === 0 && <span className="text-xs text-muted-foreground self-center">None selected</span>}
                {draftStatuses.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <button
                      onPointerDown={(ev) => { ev.preventDefault(); setDraftStatuses((prev) => prev.filter((x) => x !== s)); }}
                      aria-label={`Remove ${s}`}
                    ><X size={12} /></button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t p-4 flex gap-2">
            <Button className="flex-1" onClick={applyFilters}>APPLY</Button>
            <Button variant="destructive" className="flex-1" onClick={resetAndApply}>RESET &amp; APPLY</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Right-side detail/add-entry sheet */}
      <Sheet open={!!selectedCell} onOpenChange={(o) => !o && setSelectedCell(null)}>
        <SheetContent className="w-[400px] sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>{selectedCell?.employee.first_name} {selectedCell?.employee.last_name}</SheetTitle>
          </SheetHeader>
          {selectedCell && (
            <div className="mt-4 space-y-4">
              <div className="text-sm text-muted-foreground">{format(new Date(selectedCell.date + "T00:00:00"), "EEEE, dd MMM yyyy")}</div>
              {selectedCell.log ? (
                <Card><CardContent className="pt-4 text-sm space-y-1">
                  <div>Check In: <Badge variant="outline">{selectedCell.log.check_in || "—"}</Badge></div>
                  <div>Check Out: <Badge variant="outline">{selectedCell.log.check_out || "—"}</Badge></div>
                  <div>Hours: {selectedCell.log.hours_worked || 0}h • OT: {selectedCell.log.overtime_hours || 0}h</div>
                  <div>Status: <Badge>{selectedCell.log.status}</Badge></div>
                  {canEditAttendance && (
                    <div className="pt-2 flex justify-end">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
                        <PenLine size={14} /> Edit entry
                      </Button>
                    </div>
                  )}
                </CardContent></Card>
              ) : <p className="text-sm text-muted-foreground">No entry yet for this day.</p>}

              <div className="border-t pt-4 space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2"><Plus size={16} /> Add / Update Entry</Label>
                <div>
                  <Label className="text-xs">Entry Type</Label>
                  <Select value={entryType} onValueChange={setEntryType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Full Day (Present)</SelectItem>
                      <SelectItem value="half_day">Half Day</SelectItem>
                      <SelectItem value="late">Late Entry</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="week_off">Week Off</SelectItem>
                      <SelectItem value="overtime">Overtime</SelectItem>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                      <SelectItem
                        value="leave"
                        disabled={!hasApprovedLeave(selectedCell.log)}
                        title="Approve a leave request in Leave Management to set this"
                      >
                        Leave (see Leave Management)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!hasApprovedLeave(selectedCell.log) && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-primary underline"
                      onClick={() => navigate("/leave")}
                    >
                      Leave statuses (CL / SL / EL / LV) come from approved leave requests — open Leave Management
                    </button>
                  )}
                </div>
                {entryType !== "week_off" && entryType !== "absent" && entryType !== "leave" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Check In</Label><Input type="time" value={entryIn} onChange={(e) => setEntryIn(e.target.value)} /></div>
                    <div><Label className="text-xs">Check Out</Label><Input type="time" value={entryOut} onChange={(e) => setEntryOut(e.target.value)} /></div>
                  </div>
                )}
                <div><Label className="text-xs">Notes (manual entry)</Label><Input value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder="Optional" /></div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveEntry} className="flex-1">Mark Whole Day</Button>
                  <Button variant="outline" onClick={() => setSelectedCell(null)}>Close</Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Admin/HR edit dialog for the selected day's log */}
      <AttendanceEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        record={selectedCell?.log ?? null}
        employeeName={selectedCell ? `${selectedCell.employee.first_name} ${selectedCell.employee.last_name}` : undefined}
        shiftStart={selectedCell ? shiftStarts[selectedCell.employee.id] : undefined}
        onSaved={handleEditSaved}
      />
    </div>
  );
};

export default MyTeamAttendance;
