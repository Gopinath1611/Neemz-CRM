import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Plus, ChevronLeft, ChevronRight, Search, UserPlus, ArrowRightLeft, Clock, CalendarDays,
  Download, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, startOfWeek, addWeeks } from "date-fns";
import {
  AssignShiftDialog,
  AssignShiftPayload,
  EmployeeOption,
  ShiftOption,
} from "@/components/hrms/AssignShiftDialog";
import {
  EmployeeFilterDialog, ShiftFilterDialog, EMPTY_EMPLOYEE_FILTERS, EMPTY_SHIFT_FILTERS,
  type EmployeeFilters, type ShiftFilters, type FilterOptions,
} from "@/components/hrms/TeamShiftFilters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// weekly_off_days stores 0=Sun..6=Sat; grid shows Mon..Sun
const DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_SHIFT_OPTIONS: ShiftOption[] = [
  { shift_name: "General", start_time: "09:00", end_time: "18:00" },
  { shift_name: "Morning", start_time: "06:00", end_time: "14:00" },
  { shift_name: "Evening", start_time: "14:00", end_time: "22:00" },
  { shift_name: "Night", start_time: "22:00", end_time: "06:00" },
];

interface ShiftGroup {
  key: string;
  shift_name: string;
  start_time: string;
  end_time: string;
}

interface TeamEmployee extends EmployeeOption {
  department: string | null;
  designation: string | null;
  status: string | null;
  extra: Record<string, any>;
}

const groupKey = (s: { shift_name: string; start_time: string; end_time: string }) =>
  `${s.shift_name}|${s.start_time}|${s.end_time}`;

const empMeta = (e: TeamEmployee) => ({
  location: e.status === "active" ? "Branch 1" : (e.extra.location || e.extra.work_location || ""),
  jobTitle: e.extra.job_title || e.extra.role || (e.designation || "").replace(/_/g, " "),
  role: e.extra.role || (e.designation || "").replace(/_/g, " "),
  band: e.extra.band || e.extra.grade || "",
  division: e.extra.division || e.department || "",
});

const uniqSorted = (values: (string | null | undefined)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v && !!v.trim()))).sort();

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const MyTeamShift = () => {
  const [employees, setEmployees] = useState<TeamEmployee[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // View + filters
  const [view, setView] = useState<"employee" | "shift">("shift");
  const [empFilterOpen, setEmpFilterOpen] = useState(false);
  const [shiftFilterOpen, setShiftFilterOpen] = useState(false);
  const [empFilters, setEmpFilters] = useState<EmployeeFilters>(EMPTY_EMPLOYEE_FILTERS);
  const [shiftFilters, setShiftFilters] = useState<ShiftFilters>(EMPTY_SHIFT_FILTERS);

  // Cell detail modal
  const [cellModal, setCellModal] = useState<{ group: ShiftGroup; dayIndex: number; date: Date } | null>(null);
  const [search, setSearch] = useState("");
  const [assignEmpId, setAssignEmpId] = useState("");

  // New assignment dialog
  const [open, setOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<{ employee_id?: string; shift_name?: string }>({});

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const { data: emps } = await supabase.from("employees").select("id, first_name, last_name, employee_code, department, designation, status, extra_details").order("first_name");
    setEmployees(((emps || []) as any[]).map((e) => ({
      id: e.id, first_name: e.first_name, last_name: e.last_name, employee_code: e.employee_code,
      department: e.department, designation: e.designation, status: e.status,
      extra: (e.extra_details && typeof e.extra_details === "object" ? e.extra_details : {}) as Record<string, any>,
    })));
    const { data: sh } = await supabase.from("employee_shifts").select("*, employees(first_name, last_name, employee_code)").order("effective_from", { ascending: false });
    setShifts(sh || []);
  };


  const weekDates = useMemo(() => DAY_INDEXES.map((_, i) => addDays(weekStart, i)), [weekStart]);

  // Latest shift row per employee
  const currentShiftByEmp = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of shifts) {
      if (!map.has(s.employee_id)) map.set(s.employee_id, s);
    }
    return map;
  }, [shifts]);

  // Distinct shift groups from current assignments merged with defaults
  const shiftGroups = useMemo<ShiftGroup[]>(() => {
    const map = new Map<string, ShiftGroup>();
    for (const s of [...DEFAULT_SHIFT_OPTIONS, ...shifts]) {
      const k = groupKey(s);
      if (!map.has(k)) map.set(k, { key: k, shift_name: s.shift_name, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) });
    }
    return Array.from(map.values()).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [shifts]);

  const shiftOptions = useMemo<ShiftOption[]>(() => shiftGroups.map((g) => ({ shift_name: g.shift_name, start_time: g.start_time, end_time: g.end_time })), [shiftGroups]);

  const coversDate = (s: any, dateStr: string) =>
    s.effective_from <= dateStr && (!s.effective_to || s.effective_to >= dateStr);

  // Employees working a given shift group on a given day
  const employeesForCell = (group: ShiftGroup, dayIndex: number, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const list: { employee: any; shift: any }[] = [];
    currentShiftByEmp.forEach((s, empId) => {
      if (groupKey(s) !== group.key) return;
      if (!coversDate(s, dateStr)) return;
      if ((s.weekly_off_days || []).includes(dayIndex)) return;
      const emp = employees.find((e) => e.id === empId) || s.employees;
      if (emp) list.push({ employee: emp.id ? emp : { id: empId, ...emp }, shift: s });
    });
    return list;
  };

  const activeEmployees = useMemo<EmployeeOption[]>(
    () => employees.filter((e) => e.status === "active").map(({ id, first_name, last_name, employee_code }) => ({ id, first_name, last_name, employee_code })),
    [employees]
  );

  const filterOptions = useMemo<FilterOptions>(() => ({
    locations: uniqSorted(employees.map((e) => empMeta(e).location)),
    jobTitles: uniqSorted(employees.map((e) => empMeta(e).jobTitle)),
    departments: uniqSorted(employees.map((e) => e.department)),
    roles: uniqSorted(employees.map((e) => empMeta(e).role)),
    bands: uniqSorted(employees.map((e) => empMeta(e).band)),
    divisions: uniqSorted(employees.map((e) => empMeta(e).division)),
    shifts: uniqSorted(shiftGroups.map((g) => g.shift_name)),
  }), [employees, shiftGroups]);

  // ---- Employee view rows ----
  const employeeRows = useMemo(() => {
    const q = empFilters.q.trim().toLowerCase();
    return employees
      .map((e) => {
        const meta = empMeta(e);
        const s = currentShiftByEmp.get(e.id);
        return {
          emp: e,
          meta,
          shiftName: s?.shift_name || "",
          timing: s ? `${String(s.start_time).slice(0, 5)} - ${String(s.end_time).slice(0, 5)}` : "—",
          offDays: (s?.weekly_off_days || []) as number[],
          effective: s ? `${s.effective_from}${s.effective_to ? ` → ${s.effective_to}` : ""}` : "—",
        };
      })
      .filter(({ emp, meta, shiftName }) => {
        if (q && !`${emp.first_name || ""} ${emp.last_name || ""} ${emp.employee_code || ""}`.toLowerCase().includes(q)) return false;
        if (empFilters.status && (emp.status || "") !== empFilters.status) return false;
        if (empFilters.location && meta.location !== empFilters.location) return false;
        if (empFilters.jobTitle && meta.jobTitle !== empFilters.jobTitle) return false;
        if (empFilters.department && (emp.department || "") !== empFilters.department) return false;
        if (empFilters.role && meta.role !== empFilters.role) return false;
        if (empFilters.band && meta.band !== empFilters.band) return false;
        if (empFilters.division && meta.division !== empFilters.division) return false;
        if (empFilters.shift && shiftName !== empFilters.shift) return false;
        return true;
      });
  }, [employees, currentShiftByEmp, empFilters]);

  // ---- Shift view groups (filtered) ----
  const visibleShiftGroups = useMemo(() => {
    if (!shiftFilters.shiftName && !shiftFilters.department && !shiftFilters.location) return shiftGroups;
    const empById = new Map(employees.map((e) => [e.id, e]));
    return shiftGroups.filter((g) => {
      if (shiftFilters.shiftName && g.shift_name !== shiftFilters.shiftName) return false;
      if (!shiftFilters.department && !shiftFilters.location) return true;
      let match = false;
      currentShiftByEmp.forEach((s, empId) => {
        if (match || groupKey(s) !== g.key) return;
        const e = empById.get(empId);
        if (!e) return;
        const meta = empMeta(e);
        if (shiftFilters.department && (e.department || "") !== shiftFilters.department) return;
        if (shiftFilters.location && meta.location !== shiftFilters.location) return;
        match = true;
      });
      return match;
    });
  }, [shiftGroups, shiftFilters, employees, currentShiftByEmp]);

  const handleExport = () => {
    const stamp = format(new Date(), "yyyy-MM-dd");
    if (view === "employee") {
      const rows: (string | number)[][] = [[
        "Employee", "Employee ID", "Department", "Job Title", "Location", "Status", "Shift", "Timing", "Weekly Off", "Effective",
      ]];
      employeeRows.forEach(({ emp, meta, shiftName, timing, offDays, effective }) => rows.push([
        `${emp.first_name || ""} ${emp.last_name || ""}`.trim(), emp.employee_code || "", emp.department || "",
        meta.jobTitle, meta.location, emp.status || "", shiftName || "Unassigned", timing,
        offDays.map((d) => DAY_LABELS[DAY_INDEXES.indexOf(d)]).filter(Boolean).join(" / "), effective,
      ]));
      downloadCsv(`team-shifts-employee-view-${stamp}.csv`, rows);
    } else {
      const rows: (string | number)[][] = [["Shift", "Timing", ...weekDates.map((d, i) => `${DAY_LABELS[i]} ${format(d, "dd MMM")}`)]];
      visibleShiftGroups.forEach((g) => rows.push([
        g.shift_name, `${g.start_time} - ${g.end_time}`,
        ...DAY_INDEXES.map((dayIndex, i) => employeesForCell(g, dayIndex, weekDates[i]).length),
      ]));
      downloadCsv(`team-shifts-shift-view-${stamp}.csv`, rows);
    }
    toast.success("Export downloaded");
  };



  // ---- New shift assignment ----
  const openAssignDialog = (initials?: { employee_id?: string; shift_name?: string }) => {
    setDialogInitial(initials || {});
    setOpen(true);
  };

  const handleSave = async (payload: AssignShiftPayload) => {
    const existing = currentShiftByEmp.get(payload.employee_id);
    const { error } = existing
      ? await supabase.from("employee_shifts").update(payload).eq("id", existing.id)
      : await supabase.from("employee_shifts").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Shift assigned"); setOpen(false); setDialogInitial({}); fetchAll(); }
  };


  // ---- Cell modal actions ----
  const openCell = (group: ShiftGroup, dayIndex: number, date: Date) => {
    setCellModal({ group, dayIndex, date });
    setSearch("");
    setAssignEmpId("");
  };

  const moveEmployee = async (empId: string, target: ShiftGroup) => {
    if (!cellModal) return;
    const existing = currentShiftByEmp.get(empId);
    const payload = {
      shift_name: target.shift_name,
      start_time: target.start_time,
      end_time: target.end_time,
    };
    const { error } = existing
      ? await supabase.from("employee_shifts").update(payload).eq("id", existing.id)
      : await supabase.from("employee_shifts").insert({
          employee_id: empId, ...payload, weekly_off_days: [0],
          effective_from: format(new Date(), "yyyy-MM-dd"),
        });
    if (error) toast.error(error.message);
    else { toast.success("Employee moved"); fetchAll(); }
  };

  const assignToThisShift = async () => {
    if (!cellModal || !assignEmpId) return;
    await moveEmployee(assignEmpId, cellModal.group);
    setAssignEmpId("");
  };

  const cellEmployees = cellModal ? employeesForCell(cellModal.group, cellModal.dayIndex, cellModal.date) : [];
  const filteredCellEmployees = cellEmployees.filter(({ employee }) =>
    `${employee.first_name} ${employee.last_name} ${employee.employee_code}`.toLowerCase().includes(search.toLowerCase())
  );
  const assignableEmployees = cellModal
    ? employees.filter((e) => {
        const s = currentShiftByEmp.get(e.id);
        return !s || groupKey(s) !== cellModal.group.key;
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> My Team Shift</h1>
          <p className="text-sm text-muted-foreground">Weekly roster — click a shift card to view & manage assignments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border overflow-hidden">
            <Button
              size="sm"
              variant={view === "employee" ? "default" : "ghost"}
              className="rounded-none gap-1.5"
              onClick={() => { setView("employee"); setEmpFilterOpen(true); }}
            >
              <Users size={15} /> Employee View
            </Button>
            <Button
              size="sm"
              variant={view === "shift" ? "default" : "ghost"}
              className="rounded-none gap-1.5"
              onClick={() => { setView("shift"); setShiftFilterOpen(true); }}
            >
              <CalendarDays size={15} /> Shift View
            </Button>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => (view === "employee" ? setEmpFilterOpen(true) : setShiftFilterOpen(true))}>
            <SlidersHorizontal size={15} /> Filters
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}><Download size={15} /> Export</Button>
          {view === "shift" && (
            <>
              <div className="flex items-center gap-1 rounded-md border px-1 py-0.5">
                <Button size="icon" variant="ghost" onClick={() => setWeekStart((w) => addWeeks(w, -1))}><ChevronLeft size={16} /></Button>
                <span className="text-sm font-medium px-2 whitespace-nowrap">
                  {format(weekDates[0], "dd MMM")} – {format(weekDates[6], "dd MMM yyyy")}
                </span>
                <Button size="icon" variant="ghost" onClick={() => setWeekStart((w) => addWeeks(w, 1))}><ChevronRight size={16} /></Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This Week</Button>
            </>
          )}
          <Button size="sm" onClick={() => openAssignDialog()} className="gap-2"><Plus size={16} /> Assign Shift</Button>
        </div>
      </div>

      {view === "employee" ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Weekly Off</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeRows.map(({ emp, meta, shiftName, timing, offDays }) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{emp.first_name} {emp.last_name}</div>
                    <div className="text-xs text-muted-foreground">{emp.employee_code}</div>
                  </TableCell>
                  <TableCell className="capitalize text-sm">{emp.department || "—"}</TableCell>
                  <TableCell className="capitalize text-sm">{meta.jobTitle || "—"}</TableCell>
                  <TableCell className="text-sm">{meta.location || "—"}</TableCell>
                  <TableCell className="text-sm">{shiftName || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{timing}</TableCell>
                  <TableCell className="text-sm">{offDays.map((d) => DAY_LABELS[DAY_INDEXES.indexOf(d)]).filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={emp.status === "active" ? "secondary" : "outline"} className="capitalize font-normal">{emp.status || "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openAssignDialog({ employee_id: emp.id, shift_name: shiftName || undefined })}>
                      {shiftName ? "Edit" : "Assign"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {employeeRows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No employees match the current filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : visibleShiftGroups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
          No shifts match the current filters. Click "Assign Shift" to create a roster entry.
        </CardContent></Card>
      ) : (

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-44 border-b">Shift</th>
                {weekDates.map((d, i) => {
                  const isToday = format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  return (
                    <th key={i} className={`p-3 text-center border-b border-l ${isToday ? "bg-primary/5" : ""}`}>
                      <div className="text-xs font-semibold uppercase tracking-wide">{DAY_LABELS[i]}</div>
                      <div className={`text-xs ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{format(d, "dd MMM")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleShiftGroups.map((group) => (
                <tr key={group.key}>
                  <td className="p-3 align-top border-b">
                    <div className="font-medium text-sm">{group.shift_name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock size={12} /> {group.start_time} - {group.end_time}
                    </div>
                  </td>
                  {DAY_INDEXES.map((dayIndex, i) => {
                    const cellEmps = employeesForCell(group, dayIndex, weekDates[i]);
                    const isToday = format(weekDates[i], "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                    return (
                      <td key={i} className={`p-2 align-top border-b border-l ${isToday ? "bg-primary/5" : ""}`}>
                        <button
                          type="button"
                          onClick={() => openCell(group, dayIndex, weekDates[i])}
                          className={`w-full text-left rounded-md border p-2.5 transition hover:border-primary hover:shadow-sm ${
                            cellEmps.length === 0 ? "opacity-50 bg-muted/30" : "bg-card"
                          }`}
                        >
                          <div className="text-xs font-medium truncate">{group.shift_name}</div>
                          <div className="text-[11px] text-muted-foreground">{group.start_time} - {group.end_time}</div>
                          <div className="flex items-center gap-1 mt-1.5 text-xs font-semibold text-primary">
                            <Users size={13} /> {cellEmps.length}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cell detail modal */}
      <Dialog open={!!cellModal} onOpenChange={(o) => { if (!o) setCellModal(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {cellModal?.group.shift_name}
              <Badge variant="outline" className="gap-1 font-normal">
                <Clock size={12} /> {cellModal?.group.start_time} - {cellModal?.group.end_time}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {cellModal && `${DAY_LABELS[DAY_INDEXES.indexOf(cellModal.dayIndex)]}, ${format(cellModal.date, "dd MMM yyyy")}`}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input placeholder="Search employees..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {filteredCellEmployees.map(({ employee }) => (
                <div key={employee.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {(employee.first_name?.[0] || "?").toUpperCase()}{(employee.last_name?.[0] || "").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{employee.first_name} {employee.last_name}</div>
                      <div className="text-xs text-muted-foreground">{employee.employee_code}</div>
                    </div>
                  </div>
                  {shiftGroups.length > 1 && (
                    <Select onValueChange={(k) => {
                      const target = shiftGroups.find((g) => g.key === k);
                      if (target) moveEmployee(employee.id, target);
                    }}>
                      <SelectTrigger className="w-32 h-8 text-xs gap-1">
                        <ArrowRightLeft size={12} className="shrink-0" />
                        <SelectValue placeholder="Move to" />
                      </SelectTrigger>
                      <SelectContent>
                        {shiftGroups.filter((g) => g.key !== cellModal?.group.key).map((g) => (
                          <SelectItem key={g.key} value={g.key}>{g.shift_name} ({g.start_time}-{g.end_time})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              {filteredCellEmployees.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  {cellEmployees.length === 0 ? "No employees on this shift for this day." : "No matches found."}
                </div>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                <UserPlus size={13} /> Assign employee to this shift
              </Label>
              <div className="flex gap-2">
                <Select value={assignEmpId} onValueChange={setAssignEmpId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {assignableEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (!cellModal || !assignEmpId) return;
                    setCellModal(null);
                    openAssignDialog({ employee_id: assignEmpId, shift_name: cellModal.group.shift_name });
                    setAssignEmpId("");
                  }}
                  disabled={!assignEmpId}
                >
                  Assign
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter dialogs */}
      <EmployeeFilterDialog
        open={empFilterOpen}
        onOpenChange={setEmpFilterOpen}
        value={empFilters}
        options={filterOptions}
        onApply={setEmpFilters}
      />
      <ShiftFilterDialog
        open={shiftFilterOpen}
        onOpenChange={setShiftFilterOpen}
        value={shiftFilters}
        options={filterOptions}
        onApply={setShiftFilters}
      />

      {/* New assignment dialog */}
      <AssignShiftDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setDialogInitial({}); }}
        employees={activeEmployees}
        shiftOptions={shiftOptions}
        initialEmployeeId={dialogInitial.employee_id}
        initialShiftName={dialogInitial.shift_name}
        onSave={handleSave}
      />

    </div>
  );
};

export default MyTeamShift;
