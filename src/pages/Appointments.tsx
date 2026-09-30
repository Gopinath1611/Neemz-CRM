import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, isAfter, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Plus, Clock, User, Phone, ChevronLeft, ChevronRight, Search, Filter, Upload, CheckCircle2, AlertCircle, Users, MapPin, Trash2, Pencil, Check, X, History as HistoryIcon, CalendarClock, LucideIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import AppointmentForm from "@/components/appointments/AppointmentForm";
import { formatPatientCode } from "@/lib/patientCode";
import BulkAppointmentForm from "@/components/appointments/BulkAppointmentForm";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

export type Appointment = {
  id: string;
  patient_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  type: string;
  doctor: string;
  notes: string | null;
  source: string;
  checkin_time: string | null;
  checkout_time: string | null;
  patients?: {
    first_name: string;
    last_name: string;
    phone: string | null;
    patient_code: number | null;
  };
};

export type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  patient_code?: number | null;
};

const statusColors: Record<string, string> = {
  scheduled: "text-info",
  confirmed: "text-primary",
  "checked-in": "text-warning",
  completed: "text-success",
  cancelled: "text-destructive",
  "no-show": "text-muted-foreground",
  rescheduled: "text-accent-foreground",
};

export const typeLabels: Record<string, string> = {
  consultation: "Consultation",
  "root-canal": "Root Canal",
  cleaning: "Cleaning",
  extraction: "Extraction",
  filling: "Filling",
  "crown-bridge": "Crown & Bridge",
  orthodontics: "Orthodontics",
  checkup: "Check-up",
  emergency: "Emergency",
};

export const timeSlots = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00",
];

const formatTime12 = (time: string | null) => {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

const InlineTimeEditor = ({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) => {
  const [val, setVal] = useState(value);
  const [hStr = "09", mStr = "00"] = (val || "09:00").split(":");
  const h24 = parseInt(hStr) || 0;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = String(h24 % 12 || 12).padStart(2, "0");
  const setParts = (nh12: string, nm: string, nap: string) => {
    let nh = parseInt(nh12) % 12;
    if (nap === "PM") nh += 12;
    setVal(`${String(nh).padStart(2, "0")}:${nm}`);
  };
  return (
    <div className="flex items-center gap-1">
      <Select value={h12} onValueChange={(v) => setParts(v, mStr, ampm)}>
        <SelectTrigger className="h-7 w-[52px] text-[11px] px-1"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-56">
          {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((v) => (
            <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[11px]">:</span>
      <Select value={mStr} onValueChange={(v) => setParts(h12, v, ampm)}>
        <SelectTrigger className="h-7 w-[52px] text-[11px] px-1"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-56">
          {["00","05","10","15","20","25","30","35","40","45","50","55"].map((v) => (
            <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={ampm} onValueChange={(v) => setParts(h12, mStr, v)}>
        <SelectTrigger className="h-7 w-[56px] text-[11px] px-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="AM" className="text-xs">AM</SelectItem>
          <SelectItem value="PM" className="text-xs">PM</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-success" onClick={() => onSave(`${val}:00`)}>
        <Check size={14} />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onCancel}>
        <X size={14} />
      </Button>
    </div>
  );
};

const Appointments = () => {
  type KpiCard = {
    key: string;
    source: null | "followup";
    label: string;
    count: number;
    icon: LucideIcon;
    bg: string;
    fg: string;
    footer?: string;
    breakdown?: Array<{ label: string; count: number; fg: string }>;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Persist month & selected date across navigation within the session.
  const readSessionDate = (key: string, fallback: Date) => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? new Date(raw) : fallback;
    } catch { return fallback; }
  };
  const [currentMonth, setCurrentMonth] = useState<Date>(() => readSessionDate("appointments:currentMonth", new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => readSessionDate("appointments:selectedDate", new Date()));
  useEffect(() => { try { sessionStorage.setItem("appointments:currentMonth", currentMonth.toISOString()); } catch {} }, [currentMonth]);
  useEffect(() => { try { sessionStorage.setItem("appointments:selectedDate", selectedDate.toISOString()); } catch {} }, [selectedDate]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [filterSource, setFilterSource] = useState<"all" | "new" | "followup">("all");
  const [editPatientId, setEditPatientId] = useState<string | null>(null);
  const [editPatientData, setEditPatientData] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState<string>("");
  const [editingCheckField, setEditingCheckField] = useState<{ id: string; field: "checkin_time" | "checkout_time" } | null>(null);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleStart, setRescheduleStart] = useState<string>("");
  const [rescheduleReason, setRescheduleReason] = useState<string>("");
  const [historyAppt, setHistoryAppt] = useState<Appointment | null>(null);
  const [rescheduledSheetOpen, setRescheduledSheetOpen] = useState(false);
  const [rescheduledTab, setRescheduledTab] = useState<"all" | "source" | "followup">("all");
  const [rescheduledSearch, setRescheduledSearch] = useState("");

  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useDateRangeFilter("today", "appointments");

  // Query window: cover both visible month AND active filter range
  const monthStartDateObj = startOfMonth(currentMonth);
  const monthEndDateObj = endOfMonth(currentMonth);
  const queryFromObj = range.from && range.from < monthStartDateObj ? range.from : monthStartDateObj;
  const queryToObj = range.to && range.to > monthEndDateObj ? range.to : monthEndDateObj;
  const queryFrom = format(queryFromObj, "yyyy-MM-dd");
  const queryTo = format(queryToObj, "yyyy-MM-dd");

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", queryFrom, queryTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name, phone, patient_code)")
        .gte("appointment_date", queryFrom)
        .lte("appointment_date", queryTo)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data as Appointment[];
    },
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, patient_code")
        .order("first_name")
        .range(0, 49999);
      if (error) throw error;
      return data as Patient[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("appointments-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => {
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        queryClient.invalidateQueries({ queryKey: ["patients"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { doctorOptions, doctorNames, treatmentOptions, sourceOptions } = useClinicMasters();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "checked-in") {
        updates.checkin_time = format(new Date(), "HH:mm:ss");
      } else if (status === "completed") {
        updates.checkout_time = format(new Date(), "HH:mm:ss");
      }
      const { error } = await supabase.from("appointments").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Status updated" });
    },
  });

  const rescheduleTime = useMutation({
    mutationFn: async ({ id, start_time, end_time }: { id: string; start_time: string; end_time: string }) => {
      const { error } = await supabase.from("appointments").update({ start_time, end_time }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["appointments"] });
      toast({ title: "Appointment rescheduled" });
      setEditingTimeId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rescheduleFull = useMutation({
    mutationFn: async ({ appt, newDate, newStart, reason }: { appt: Appointment; newDate: string; newStart: string; reason: string }) => {
      // compute duration from existing start/end (default 30m)
      const toSec = (t: string) => {
        const [h, m, s] = (t || "00:00:00").split(":").map(Number);
        return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
      };
      const dur = Math.max(toSec(appt.end_time) - toSec(appt.start_time), 30 * 60);
      const [sh, sm] = newStart.split(":").map(Number);
      const startSec = sh * 3600 + sm * 60;
      const endSec = startSec + dur;
      const eh = Math.floor(endSec / 3600) % 24;
      const em = Math.floor((endSec % 3600) / 60);
      const newStartTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`;
      const newEndTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;

      const { data: userData } = await supabase.auth.getUser();
      const { error: histErr } = await supabase.from("appointment_reschedules").insert({
        appointment_id: appt.id,
        old_date: appt.appointment_date,
        old_start_time: appt.start_time,
        old_end_time: appt.end_time,
        new_date: newDate,
        new_start_time: newStartTime,
        new_end_time: newEndTime,
        reason: reason || null,
        rescheduled_by: userData.user?.id ?? null,
      });
      if (histErr) throw histErr;

      const { error } = await supabase.from("appointments").update({
        appointment_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        status: "rescheduled",
      }).eq("id", appt.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["appointments"] });
      toast({ title: "Appointment rescheduled" });
      setRescheduleAppt(null);
      setRescheduleDate("");
      setRescheduleStart("");
      setRescheduleReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: rescheduleHistory = [] } = useQuery({
    queryKey: ["appointment_reschedules", historyAppt?.id],
    enabled: !!historyAppt?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_reschedules")
        .select("*")
        .eq("appointment_id", historyAppt!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const updateCheckTime = useMutation({
    mutationFn: async ({ id, field, time }: { id: string; field: "checkin_time" | "checkout_time"; time: string }) => {
      const payload: any = { [field]: time };
      const { error } = await supabase.from("appointments").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["appointments"] });
      toast({ title: "Time updated" });
      setEditingCheckField(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Appointment deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Fetch districts for edit form
  const { data: districts = [] } = useQuery({
    queryKey: ["districts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("districts").select("id, name, state, country").order("name");
      if (error) throw error;
      return data as { id: string; name: string; state: string; country: string }[];
    },
  });

  const openEditPatient = async (patientId: string) => {
    const { data } = await supabase.from("patients").select("*").eq("id", patientId).single();
    if (data) {
      setEditPatientData({ ...data });
      setEditPatientId(patientId);
    }
  };

  const saveEditPatient = async () => {
    if (!editPatientId || !editPatientData) return;
    setEditLoading(true);
    try {
      const { error } = await supabase.from("patients").update({
        first_name: editPatientData.first_name,
        last_name: editPatientData.last_name,
        phone: editPatientData.phone,
        email: editPatientData.email,
        gender: editPatientData.gender,
        date_of_birth: editPatientData.date_of_birth,
        location: editPatientData.location,
        district: editPatientData.district,
        address: editPatientData.address,
        medical_notes: editPatientData.medical_notes,
      }).eq("id", editPatientId);
      if (error) throw error;
      toast({ title: "Patient updated!" });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setEditPatientId(null);
      setEditPatientData(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  const uniqueDoctors = doctorNames;

  // Calendar helpers (reuse query window month bounds)
  const calendarStart = startOfWeek(monthStartDateObj, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEndDateObj, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getAppointmentsForDate = (date: Date) =>
    appointments.filter((a) => a.appointment_date === format(date, "yyyy-MM-dd"));

  // When a date-range preset is active, table shows the range; otherwise the selected day
  const rangeActive = preset !== "all";
  const listFromStr = rangeActive && range.from ? format(range.from, "yyyy-MM-dd") : null;
  const listToStr = rangeActive && range.to ? format(range.to, "yyyy-MM-dd") : null;

  const baseListAppointments = rangeActive && listFromStr && listToStr
    ? appointments.filter((a) => a.appointment_date >= listFromStr && a.appointment_date <= listToStr)
    : appointments;

  // Stats — all reflect the current scope (selected day OR active range)
  const statsApts = baseListAppointments;
  const todayCount = statsApts.length;
  // Upcoming (today live workload): today's appointments not yet checked-in/completed/cancelled/no-show
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const upcomingCount = appointments.filter(
    (a) => a.appointment_date === todayStr && (a.status === "scheduled" || a.status === "confirmed"),
  ).length;
  const checkedInCount = statsApts.filter((a) => a.status === "checked-in").length;
  const completedCount = statsApts.filter((a) => a.status === "completed").length;

  // Filtered list for table
  const matchesStatusFilter = (status: string, id: string) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "upcoming") return status === "scheduled" || status === "confirmed";
    if (filterStatus === "new") return true; // handled separately via newPatientApptIds below
    return status === filterStatus;
  };
  const selectedDateAppointments = baseListAppointments
    .filter((a) => matchesStatusFilter(a.status, a.id))
    .filter((a) => filterDoctor === "all" || a.doctor === filterDoctor)
    .filter((a) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = `${a.patients?.first_name ?? ""} ${a.patients?.last_name ?? ""}`.toLowerCase();
      const phone = (a.patients?.phone ?? "").toLowerCase();
      const codeNum = a.patients?.patient_code ?? null;
      const codeFormatted = formatPatientCode(codeNum).toLowerCase();
      const codeRaw = codeNum != null ? String(codeNum) : "";
      const doctor = (a.doctor ?? "").toLowerCase();
      const type = (a.type ?? "").toLowerCase();
      const status = (a.status ?? "").toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        codeFormatted.includes(q) ||
        codeRaw.includes(q) ||
        doctor.includes(q) ||
        type.includes(q) ||
        status.includes(q)
      );
    });

  // followUpVisitIds (computed below) drives the source filter + sort.
  // The plain filtered list is `selectedDateAppointments`; the final list applies source + ordering.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterStatus, filterDoctor, filterSource, preset, customFrom, customTo, queryFrom, queryTo]);


  // Follow-up visibility: fetch all appointments for patients in current scope to compute next/prev visits
  const patientIdsInScope = useMemo(
    () => Array.from(new Set(baseListAppointments.map((a) => a.patient_id))),
    [baseListAppointments],
  );

  const { data: relatedAppointments = [] } = useQuery({
    queryKey: ["appointments-related", patientIdsInScope.slice().sort().join(",")],
    enabled: patientIdsInScope.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, appointment_date, start_time, type, doctor, status")
        .in("patient_id", patientIdsInScope);
      if (error) throw error;
      return data as Array<{ id: string; patient_id: string; appointment_date: string; start_time: string; type: string; doctor: string; status: string }>;
    },
  });

  const { nextFollowUpByApptId, followUpVisitIds, prevCompletedByApptId, newPatientApptIds } = useMemo(() => {
    const byPatient = new Map<string, typeof relatedAppointments>();
    relatedAppointments.forEach((r) => {
      const arr = byPatient.get(r.patient_id) ?? [];
      arr.push(r);
      byPatient.set(r.patient_id, arr);
    });
    const cmp = (a: { appointment_date: string; start_time: string }, b: { appointment_date: string; start_time: string }) => {
      if (a.appointment_date !== b.appointment_date) return a.appointment_date < b.appointment_date ? -1 : 1;
      return (a.start_time || "") < (b.start_time || "") ? -1 : 1;
    };
    const nextMap: Record<string, typeof relatedAppointments[number]> = {};
    const prevMap: Record<string, typeof relatedAppointments[number]> = {};
    const fuSet = new Set<string>();
    const newSet = new Set<string>();
    byPatient.forEach((list) => {
      const sorted = list.slice().sort(cmp);
      if (sorted.length > 0) newSet.add(sorted[0].id); // patient's earliest-ever appointment = first-visit
      sorted.forEach((curr) => {
        if (curr.status === "completed") {
          const next = sorted.find(
            (x) =>
              x.id !== curr.id &&
              (x.status === "scheduled" || x.status === "confirmed") &&
              cmp(x, curr) > 0,
          );
          if (next) nextMap[curr.id] = next;
        }
        if (curr.status === "scheduled" || curr.status === "confirmed") {
          const prevCompleted = [...sorted].reverse().find((x) => x.status === "completed" && cmp(x, curr) < 0);
          if (prevCompleted) {
            fuSet.add(curr.id);
            prevMap[curr.id] = prevCompleted;
          }
        }
      });
    });
    return { nextFollowUpByApptId: nextMap, followUpVisitIds: fuSet, prevCompletedByApptId: prevMap, newPatientApptIds: newSet };
  }, [relatedAppointments]);

  const newPatientCount = useMemo(
    () => baseListAppointments.filter((a) => newPatientApptIds.has(a.id)).length,
    [baseListAppointments, newPatientApptIds],
  );

  // Apply Appointment Source filter + clinic sort order. Read-only — no DB changes.
  const rescheduledCount = useMemo(
    () =>
      baseListAppointments.filter(
        (a) => followUpVisitIds.has(a.id) || (a.status === "completed" && nextFollowUpByApptId[a.id]),
      ).length,
    [baseListAppointments, followUpVisitIds, nextFollowUpByApptId],
  );
  const sourceFilteredAppointments = useMemo(() => {
    let list = selectedDateAppointments;
    if (filterStatus === "new") list = list.filter((a) => newPatientApptIds.has(a.id));
    if (filterSource === "all") return list;
    if (filterSource === "followup")
      return list.filter(
        (a) => followUpVisitIds.has(a.id) || (a.status === "completed" && nextFollowUpByApptId[a.id]),
      );
    return list.filter(
      (a) => !followUpVisitIds.has(a.id) && !(a.status === "completed" && nextFollowUpByApptId[a.id]),
    );
  }, [selectedDateAppointments, filterSource, filterStatus, followUpVisitIds, nextFollowUpByApptId, newPatientApptIds]);

  // KPI card breakdowns — read-only, reuse existing computed data
  const completedAppointments = useMemo(() => statsApts.filter((a) => a.status === "completed"), [statsApts]);
  const completedNewCount = useMemo(
    () => completedAppointments.filter((a) => newPatientApptIds.has(a.id)).length,
    [completedAppointments, newPatientApptIds],
  );
  const completedFollowUpCount = useMemo(
    () => Math.max(0, completedAppointments.length - completedNewCount),
    [completedAppointments, completedNewCount],
  );

  const upcomingAppointments = useMemo(
    () => appointments.filter((a) => a.appointment_date === todayStr && (a.status === "scheduled" || a.status === "confirmed")),
    [appointments, todayStr],
  );
  const upcomingNewCount = useMemo(
    () => upcomingAppointments.filter((a) => newPatientApptIds.has(a.id)).length,
    [upcomingAppointments, newPatientApptIds],
  );
  const upcomingFollowUpCount = useMemo(
    () => Math.max(0, upcomingAppointments.length - upcomingNewCount),
    [upcomingAppointments, upcomingNewCount],
  );

  const rescheduledFromTodayCount = useMemo(
    () => baseListAppointments.filter((a) => a.status === "completed" && nextFollowUpByApptId[a.id]).length,
    [baseListAppointments, nextFollowUpByApptId],
  );
  const rescheduledFutureFollowUpCount = useMemo(
    () => baseListAppointments.filter((a) => followUpVisitIds.has(a.id)).length,
    [baseListAppointments, followUpVisitIds],
  );


  const statusOrder: Record<string, number> = {
    "checked-in": 1,
    "in-consultation": 2,
    scheduled: 3,
    confirmed: 3,
    completed: 5,
    rescheduled: 6,
    cancelled: 7,
    "no-show": 8,
  };
  const sortedAppointments = useMemo(() => {
    return sourceFilteredAppointments.slice().sort((a, b) => {
      // Order strictly by appointment date, then start_time (AM → PM)
      if (a.appointment_date !== b.appointment_date) {
        return a.appointment_date < b.appointment_date ? -1 : 1;
      }
      const at = a.start_time || "";
      const bt = b.start_time || "";
      if (at !== bt) return at < bt ? -1 : 1;
      return 0;
    });
  }, [sourceFilteredAppointments]);

  const totalAppointmentPages = Math.max(1, Math.ceil(sortedAppointments.length / pageSize));
  useEffect(() => {
    if (page > totalAppointmentPages) setPage(totalAppointmentPages);
  }, [page, totalAppointmentPages]);
  const pagedAppointments = usePagedSlice(sortedAppointments, page, pageSize);


  const listTitle = rangeActive
    ? preset === "today" ? "Today"
      : preset === "tomorrow" ? "Tomorrow"
      : preset === "week" ? "This Week"
      : preset === "month" ? "This Month"
      : range.from && range.to ? (range.from.getTime() === range.to.getTime() || format(range.from, "yyyy-MM-dd") === format(range.to, "yyyy-MM-dd") ? format(range.from, "dd MMM yyyy") : `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM yyyy")}`) : "Range"
    : "All Time";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Appointments</h1>
          <p className="text-sm text-muted-foreground">Manage patient appointments and scheduling</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SmartDateFilter
            preset={preset} onPresetChange={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
          />
          <Button variant="outline" className="gap-2" onClick={() => setBulkDialogOpen(true)}>
            <Upload size={16} /> Bulk Book
          </Button>
          <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setDialogOpen(true)}>
            <Plus size={16} /> Book Appointment
          </Button>
        </div>
      </div>

      {/* Stats + Calendar Row */}
      <div className="grid grid-cols-1 gap-4">
        {/* Stats Cards (clickable filters) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { key: "all", source: null, label: rangeActive ? listTitle : isToday(selectedDate) ? "Today" : format(selectedDate, "dd MMM"), count: todayCount, icon: CalendarIcon, bg: "bg-primary/10", fg: "text-primary", footer: "Today's Appointment Schedule" },
            { key: "new", source: null, label: "New Patients", count: newPatientCount, icon: User, bg: "bg-info/10", fg: "text-info", footer: "Today's First Visits" },
            { key: "upcoming", source: null, label: "Upcoming (Today)", count: upcomingCount, icon: AlertCircle, bg: "bg-accent/10", fg: "text-accent", breakdown: [
              { label: "New Patients", count: upcomingNewCount, fg: "text-info" },
              { label: "Follow-up", count: upcomingFollowUpCount, fg: "text-accent-foreground" },
            ]},
            { key: "__rescheduled__", source: "followup" as const, label: "Rescheduled", count: rescheduledCount, icon: CalendarClock, bg: "bg-purple-100", fg: "text-purple-700", breakdown: [
              { label: "From Today's Visits", count: rescheduledFromTodayCount, fg: "text-purple-700" },
              { label: "Future Follow-ups", count: rescheduledFutureFollowUpCount, fg: "text-purple-600" },
            ]},
            { key: "checked-in", source: null, label: "Checked In", count: checkedInCount, icon: Users, bg: "bg-warning/10", fg: "text-warning" },
            { key: "completed", source: null, label: "Completed", count: completedCount, icon: CheckCircle2, bg: "bg-success/10", fg: "text-success", breakdown: [
              { label: "New Patients", count: completedNewCount, fg: "text-info" },
              { label: "Follow-up Patients", count: completedFollowUpCount, fg: "text-success" },
            ]},
          ] as KpiCard[]).map((s) => {
            const isResched = s.key === "__rescheduled__";
            const active = isResched ? filterSource === "followup" : (filterStatus === s.key && filterSource === "all");
            const Icon = s.icon;
            const onActivate = () => {
              if (isResched) {
                setRescheduledSheetOpen(true);
              } else {
                if (s.key === "upcoming") setPreset("today");
                setFilterStatus(s.key);
                setFilterSource("all");
              }
            };
            return (
              <Card
                key={s.key}
                role="button"
                tabIndex={0}
                onClick={onActivate}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } }}
                className={cn(
                  "shadow-card cursor-pointer transition-all select-none h-full",
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"
                )}
              >
                <CardContent className="p-3 flex flex-col gap-1.5 h-full">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", s.bg)}>
                      <Icon size={16} className={s.fg} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-bold text-foreground leading-tight">{s.count}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                    </div>
                  </div>
                  {s.breakdown && s.breakdown.length > 0 && (
                    <div className="space-y-0.5 pt-1 border-t border-border/40">
                      {s.breakdown.map((line, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] leading-tight">
                          <span className="text-muted-foreground">{line.label}</span>
                          <span className={cn("font-semibold", line.fg)}>{line.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.footer && !s.breakdown && (
                    <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-1 leading-tight">{s.footer}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>


        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "all", label: "All" },
            { key: "scheduled", label: "Scheduled" },
            { key: "upcoming", label: "Upcoming" },
            { key: "checked-in", label: "Checked In" },
            { key: "in-consultation", label: "In Consultation" },
            { key: "completed", label: "Completed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "no-show", label: "No Show" },
          ] as const).map((c) => (
            <Button
              key={c.key}
              size="sm"
              variant={filterStatus === c.key ? "default" : "outline"}
              className="h-7 text-[11px] px-2.5"
              onClick={() => setFilterStatus(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>


        {/* Table Section */}
        <Card className="shadow-card">
          <CardHeader className="pb-3 pt-3 px-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-display">
                  {listTitle}
                  <Badge variant="secondary" className="ml-2 text-[10px]">{sortedAppointments.length} appointments</Badge>
                </CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search patient..."
                    className="pl-8 h-8 text-xs w-40"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <User size={12} className="mr-1" />
                    <SelectValue placeholder="All Doctors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Doctors</SelectItem>
                    {uniqueDoctors.map((doc) => (
                      <SelectItem key={doc} value={doc}>{doc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterSource} onValueChange={(v) => setFilterSource(v as "all" | "new" | "followup")}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <CalendarClock size={12} className="mr-1" />
                    <SelectValue placeholder="Appointment Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="new">New Appointment</SelectItem>
                    <SelectItem value="followup">Doctor Follow-up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : sortedAppointments.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarIcon size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {filterSource === "followup"
                    ? "No Rescheduled Patients"
                    : filterStatus === "new"
                    ? "No New Patients"
                    : filterStatus === "upcoming"
                    ? "No Upcoming Patients"
                    : filterStatus === "completed"
                    ? "No Completed Patients"
                    : filterStatus === "checked-in"
                    ? "No Checked-In Patients"
                    : "No appointments for this day"}
                </p>
                {filterSource !== "followup" && filterStatus !== "new" && (
                  <Button variant="link" className="text-xs mt-1" onClick={() => setDialogOpen(true)}>
                    + Book one now
                  </Button>
                )}
              </div>


            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/5">
                      <TableHead className="text-[11px] font-semibold w-10 text-center">SI No</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Date</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">P.ID</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Patient Name</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Mobile Number</TableHead>
                      <TableHead className="text-[11px] font-semibold text-right">Appt.Time ↑↓</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Doctor</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Treatment</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Appt. Type</TableHead>
                      <TableHead className="text-[11px] font-semibold text-right">Checkin ↑↓</TableHead>
                      <TableHead className="text-[11px] font-semibold text-right">Checkout ↑↓</TableHead>
                      <TableHead className="text-[11px] font-semibold text-left">Status</TableHead>
                      <TableHead className="text-[11px] font-semibold w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedAppointments.map((apt, idx) => (
                      <TableRow key={apt.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs py-3 text-center">{idx + 1}</TableCell>
                        <TableCell className="text-xs py-3">{format(parseISO(apt.appointment_date), "dd-MM-yyyy")}</TableCell>
                        <TableCell className="text-xs py-3">
                          <span 
                            className="text-primary underline cursor-pointer font-medium hover:text-primary/80"
                            onClick={() => navigate(`/clinic-workflow/${apt.patient_id}?date=${apt.appointment_date}`)}
                          >
                            {formatPatientCode(apt.patients?.patient_code)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs py-3 font-medium">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-foreground underline cursor-pointer hover:text-primary"
                              onClick={() => openEditPatient(apt.patient_id)}
                            >
                              {apt.patients?.first_name} {apt.patients?.last_name}
                            </span>
                            {(followUpVisitIds.has(apt.id) || (apt.status === "completed" && nextFollowUpByApptId[apt.id])) && (
                              <Badge
                                variant="outline"
                                title={
                                  apt.status === "completed" && nextFollowUpByApptId[apt.id]
                                    ? `Rescheduled to ${format(parseISO(nextFollowUpByApptId[apt.id].appointment_date), "dd MMM")} · ${formatTime12(nextFollowUpByApptId[apt.id].start_time)} · ${typeLabels[nextFollowUpByApptId[apt.id].type] || nextFollowUpByApptId[apt.id].type} · ${nextFollowUpByApptId[apt.id].doctor}`
                                    : "Doctor scheduled this patient's next follow-up during the previous consultation."
                                }
                                className="text-[9px] font-semibold px-1.5 py-0 border-purple-300 text-purple-700 bg-purple-50"
                              >
                                RESCHEDULED
                              </Badge>
                            )}

                          </div>
                        </TableCell>

                        <TableCell className="text-xs py-3">{apt.patients?.phone || "—"}</TableCell>
                        <TableCell className="text-xs py-3 text-right">
                          {editingTimeId === apt.id ? (() => {
                            const [hStr = "09", mStr = "00"] = (editingTimeValue || "09:00").split(":");
                            const h24 = parseInt(hStr) || 0;
                            const ampm = h24 >= 12 ? "PM" : "AM";
                            const h12 = String(h24 % 12 || 12).padStart(2, "0");
                            const setParts = (nh12: string, nm: string, nap: string) => {
                              let nh = parseInt(nh12) % 12;
                              if (nap === "PM") nh += 12;
                              setEditingTimeValue(`${String(nh).padStart(2, "0")}:${nm}`);
                            };
                            return (
                              <div className="flex items-center justify-end gap-1">
                                <Select value={h12} onValueChange={(v) => setParts(v, mStr, ampm)}>
                                  <SelectTrigger className="h-7 w-[52px] text-[11px] px-1"><SelectValue /></SelectTrigger>
                                  <SelectContent className="max-h-56">
                                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((v) => (
                                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-[11px]">:</span>
                                <Select value={mStr} onValueChange={(v) => setParts(h12, v, ampm)}>
                                  <SelectTrigger className="h-7 w-[52px] text-[11px] px-1"><SelectValue /></SelectTrigger>
                                  <SelectContent className="max-h-56">
                                    {["00","05","10","15","20","25","30","35","40","45","50","55"].map((v) => (
                                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select value={ampm} onValueChange={(v) => setParts(h12, mStr, v)}>
                                  <SelectTrigger className="h-7 w-[56px] text-[11px] px-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="AM" className="text-xs">AM</SelectItem>
                                    <SelectItem value="PM" className="text-xs">PM</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-success"
                                  onClick={() => {
                                    if (!editingTimeValue) return;
                                    const toSec = (t: string) => {
                                      const [hh, mm, ss] = t.split(":").map(Number);
                                      return (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);
                                    };
                                    const dur = Math.max(0, toSec(apt.end_time || apt.start_time) - toSec(apt.start_time));
                                    const newStart = `${editingTimeValue}:00`;
                                    const endSec = toSec(newStart) + dur;
                                    const eh = Math.floor(endSec / 3600) % 24;
                                    const em = Math.floor((endSec % 3600) / 60);
                                    const newEnd = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;
                                    rescheduleTime.mutate({ id: apt.id, start_time: newStart, end_time: newEnd });
                                  }}
                                  disabled={rescheduleTime.isPending}
                                >
                                  <Check size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  onClick={() => setEditingTimeId(null)}
                                >
                                  <X size={14} />
                                </Button>
                              </div>
                            );
                          })() : (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-primary group"
                              onClick={() => {
                                setEditingTimeId(apt.id);
                                setEditingTimeValue((apt.start_time || "09:00").slice(0, 5));
                              }}
                              title="Click to reschedule time"
                            >
                              <span>{formatTime12(apt.start_time)}</span>
                              <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-3">{apt.doctor || "—"}</TableCell>
                        <TableCell className="text-xs py-3">{typeLabels[apt.type] || apt.type}</TableCell>
                        <TableCell className="text-xs py-3">
                          {followUpVisitIds.has(apt.id) ? (
                            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 border-purple-300 text-purple-700 bg-purple-50">
                              FOLLOW-UP
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-3 text-right">
                          {editingCheckField?.id === apt.id && editingCheckField.field === "checkin_time" ? (
                            <InlineTimeEditor
                              value={(apt.checkin_time || format(new Date(), "HH:mm")).slice(0, 5)}
                              onSave={(t) => updateCheckTime.mutate({ id: apt.id, field: "checkin_time", time: t })}
                              onCancel={() => setEditingCheckField(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-primary group"
                              onClick={() => setEditingCheckField({ id: apt.id, field: "checkin_time" })}
                              title="Click to edit check-in time"
                            >
                              <span>{formatTime12(apt.checkin_time)}</span>
                              <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-3 text-right">
                          {editingCheckField?.id === apt.id && editingCheckField.field === "checkout_time" ? (
                            <InlineTimeEditor
                              value={(apt.checkout_time || format(new Date(), "HH:mm")).slice(0, 5)}
                              onSave={(t) => updateCheckTime.mutate({ id: apt.id, field: "checkout_time", time: t })}
                              onCancel={() => setEditingCheckField(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-primary group"
                              onClick={() => setEditingCheckField({ id: apt.id, field: "checkout_time" })}
                              title="Click to edit check-out time"
                            >
                              <span>{formatTime12(apt.checkout_time)}</span>
                              <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <Select
                            value={apt.status}
                            onValueChange={(v) => {
                              if (v === "rescheduled") {
                                setRescheduleAppt(apt);
                                setRescheduleDate(apt.appointment_date);
                                setRescheduleStart((apt.start_time || "09:00:00").slice(0, 5));
                                setRescheduleReason("");
                              } else {
                                updateStatus.mutate({ id: apt.id, status: v });
                              }
                            }}
                          >
                            <SelectTrigger className={cn("h-6 w-24 text-[10px] border-0 font-semibold rounded-full px-2", statusColors[apt.status])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="checked-in">Checked In</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="rescheduled">Reschedule</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="no-show">No Show</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  title="Reschedule history & next visit"
                                  onClick={() => setHistoryAppt(apt)}
                                >
                                  <HistoryIcon size={14} />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-72 p-3 text-xs">
                                <div className="font-semibold text-sm mb-2">
                                  {apt.patients?.first_name} {apt.patients?.last_name}
                                </div>
                                <div className="space-y-2">
                                  {prevCompletedByApptId[apt.id] && (
                                    <>
                                      <div>
                                        <p className="text-[9px] uppercase text-muted-foreground font-semibold">Original Visit</p>
                                        <p className="font-medium">{format(parseISO(prevCompletedByApptId[apt.id].appointment_date), "dd MMM yyyy")} · {formatTime12(prevCompletedByApptId[apt.id].start_time)}</p>
                                        <p className="text-muted-foreground text-[11px]">{prevCompletedByApptId[apt.id].doctor} · {typeLabels[prevCompletedByApptId[apt.id].type] || prevCompletedByApptId[apt.id].type}</p>
                                      </div>
                                      <div className="text-center text-muted-foreground">↓</div>
                                    </>
                                  )}
                                  <div>
                                    <p className="text-[9px] uppercase text-primary font-semibold">Current Appointment</p>
                                    <p className="font-medium">{format(parseISO(apt.appointment_date), "dd MMM yyyy")} · {formatTime12(apt.start_time)}</p>
                                    <p className="text-muted-foreground text-[11px]">{apt.doctor || "—"} · {typeLabels[apt.type] || apt.type}</p>
                                  </div>
                                  {nextFollowUpByApptId[apt.id] && (
                                    <>
                                      <div className="text-center text-muted-foreground">↓</div>
                                      <div>
                                        <p className="text-[9px] uppercase text-purple-700 font-semibold">Next Appointment</p>
                                        <p className="font-medium">{format(parseISO(nextFollowUpByApptId[apt.id].appointment_date), "dd MMM yyyy")} · {formatTime12(nextFollowUpByApptId[apt.id].start_time)}</p>
                                        <p className="text-muted-foreground text-[11px]">{nextFollowUpByApptId[apt.id].doctor} · {typeLabels[nextFollowUpByApptId[apt.id].type] || nextFollowUpByApptId[apt.id].type}</p>
                                      </div>
                                    </>
                                  )}
                                  {!prevCompletedByApptId[apt.id] && !nextFollowUpByApptId[apt.id] && (
                                    <p className="text-muted-foreground text-[11px]">No linked visits.</p>
                                  )}
                                </div>
                                <div className="mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                                  Click icon to open full reschedule history.
                                </div>
                              </PopoverContent>

                            </Popover>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 size={14} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Appointment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {apt.patients?.first_name} {apt.patients?.last_name} — {formatTime12(apt.start_time)} appointment will be permanently deleted.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteAppointment.mutate(apt.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination page={page} pageSize={pageSize} total={selectedDateAppointments.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="appointments" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Single Appointment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Book New Appointment</DialogTitle>
          </DialogHeader>
          <AppointmentForm
            patients={patients}
            selectedDate={selectedDate}
            doctorOptions={doctorOptions}
            treatmentOptions={treatmentOptions}
            sourceOptions={sourceOptions}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["appointments"] });
              queryClient.invalidateQueries({ queryKey: ["patients"] });
              setDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Bulk Appointment Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Bulk Book Appointments</DialogTitle>
          </DialogHeader>
          <BulkAppointmentForm
            patients={patients}
            doctorOptions={doctorOptions}
            treatmentOptions={treatmentOptions}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["appointments"] });
              queryClient.invalidateQueries({ queryKey: ["patients"] });
              setBulkDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
      {/* Edit Patient Dialog */}
      <Dialog open={!!editPatientId} onOpenChange={(open) => { if (!open) { setEditPatientId(null); setEditPatientData(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Patient Details</DialogTitle>
          </DialogHeader>
          {editPatientData && (
            <div className="space-y-3 pt-2">
              <div className="p-2 bg-secondary/50 rounded-md text-center">
                <span className="text-xs text-muted-foreground">Patient ID: </span>
                <span className="text-sm font-bold text-primary">{formatPatientCode(editPatientData.patient_code)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">First Name *</Label>
                  <Input className="text-xs" value={editPatientData.first_name} onChange={(e) => setEditPatientData({ ...editPatientData, first_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name *</Label>
                  <Input className="text-xs" value={editPatientData.last_name} onChange={(e) => setEditPatientData({ ...editPatientData, last_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mobile</Label>
                <Input className="text-xs" value={editPatientData.phone || ""} onChange={(e) => setEditPatientData({ ...editPatientData, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input className="text-xs" value={editPatientData.email || ""} onChange={(e) => setEditPatientData({ ...editPatientData, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Gender</Label>
                  <Select value={editPatientData.gender || "other"} onValueChange={(v) => setEditPatientData({ ...editPatientData, gender: v })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date of Birth</Label>
                  <Input type="date" className="text-xs" max={format(new Date(), "yyyy-MM-dd")} value={editPatientData.date_of_birth || ""} onChange={(e) => setEditPatientData({ ...editPatientData, date_of_birth: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><MapPin size={10} /> Location</Label>
                  <Input className="text-xs" placeholder="Area / Locality" value={editPatientData.location || ""} onChange={(e) => setEditPatientData({ ...editPatientData, location: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">District</Label>
                  <Select value={editPatientData.district || ""} onValueChange={(v) => setEditPatientData({ ...editPatientData, district: v })}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {districts.map((d) => (
                        <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Textarea className="text-xs" rows={2} value={editPatientData.address || ""} onChange={(e) => setEditPatientData({ ...editPatientData, address: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Medical Notes</Label>
                <Textarea className="text-xs" rows={2} value={editPatientData.medical_notes || ""} onChange={(e) => setEditPatientData({ ...editPatientData, medical_notes: e.target.value })} />
              </div>
              <Button className="w-full gradient-primary text-primary-foreground" onClick={saveEditPatient} disabled={editLoading}>
                {editLoading ? "Saving..." : "Update Patient"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={!!rescheduleAppt} onOpenChange={(o) => { if (!o) setRescheduleAppt(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Reschedule Appointment</DialogTitle>
          </DialogHeader>
          {rescheduleAppt && (
            <div className="space-y-3 pt-2">
              <div className="p-2 bg-secondary/50 rounded-md text-xs">
                <div><span className="text-muted-foreground">Patient: </span><span className="font-medium">{rescheduleAppt.patients?.first_name} {rescheduleAppt.patients?.last_name}</span></div>
                <div><span className="text-muted-foreground">Current: </span>{format(parseISO(rescheduleAppt.appointment_date), "dd MMM yyyy")} at {formatTime12(rescheduleAppt.start_time)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">New Date *</Label>
                  <Input type="date" className="text-xs" value={rescheduleDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setRescheduleDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">New Time *</Label>
                  <Select value={rescheduleStart} onValueChange={setRescheduleStart}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Pick time" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {timeSlots.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{formatTime12(t + ":00")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea className="text-xs" rows={2} value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} placeholder="Why is this being rescheduled?" />
              </div>
              <Button
                className="w-full gradient-primary text-primary-foreground"
                disabled={!rescheduleDate || !rescheduleStart || rescheduleFull.isPending}
                onClick={() => rescheduleFull.mutate({ appt: rescheduleAppt, newDate: rescheduleDate, newStart: rescheduleStart, reason: rescheduleReason })}
              >
                {rescheduleFull.isPending ? "Saving..." : "Confirm Reschedule"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule History Dialog */}
      <Dialog open={!!historyAppt} onOpenChange={(o) => { if (!o) setHistoryAppt(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Reschedule History</DialogTitle>
          </DialogHeader>
          {historyAppt && (
            <div className="space-y-2 pt-2">
              <div className="p-2 bg-secondary/50 rounded-md text-xs">
                <div><span className="text-muted-foreground">Patient: </span><span className="font-medium">{historyAppt.patients?.first_name} {historyAppt.patients?.last_name}</span></div>
                <div><span className="text-muted-foreground">Current: </span>{format(parseISO(historyAppt.appointment_date), "dd MMM yyyy")} at {formatTime12(historyAppt.start_time)}</div>
              </div>
              {rescheduleHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No reschedule history.</p>
              ) : (
                <div className="space-y-2">
                  {rescheduleHistory.map((h: any) => (
                    <div key={h.id} className="border rounded-md p-2 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-primary">{format(new Date(h.created_at), "dd MMM yyyy, hh:mm a")}</span>
                      </div>
                      <div className="text-muted-foreground">
                        <span className="line-through">{format(parseISO(h.old_date), "dd MMM yyyy")} {formatTime12(h.old_start_time)}</span>
                        <span className="mx-2">→</span>
                        <span className="text-foreground font-medium">{format(parseISO(h.new_date), "dd MMM yyyy")} {formatTime12(h.new_start_time)}</span>
                      </div>
                      {h.reason && <div className="mt-1 text-muted-foreground"><span className="font-medium">Reason:</span> {h.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rescheduled Drill-Down Sheet */}
      <Sheet open={rescheduledSheetOpen} onOpenChange={setRescheduledSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="sticky top-0 z-10 bg-background border-b px-5 py-4">
            <SheetTitle className="font-display text-lg flex items-center gap-2">
              <CalendarClock size={18} className="text-purple-600" />
              Rescheduled Appointments Detailed View
            </SheetTitle>
            <SheetDescription className="text-xs">
              {listTitle} · Rescheduled patients within current scope
            </SheetDescription>
          </SheetHeader>

          {(() => {
            const sourceList = baseListAppointments.filter(
              (a) => a.status === "completed" && nextFollowUpByApptId[a.id],
            );
            const followupList = baseListAppointments.filter((a) => followUpVisitIds.has(a.id));
            const matches = (a: Appointment) => {
              if (!rescheduledSearch.trim()) return true;
              const q = rescheduledSearch.toLowerCase().trim();
              const name = `${a.patients?.first_name ?? ""} ${a.patients?.last_name ?? ""}`.toLowerCase();
              const pid = formatPatientCode(a.patients?.patient_code).toLowerCase();
              const doc = (a.doctor ?? "").toLowerCase();
              const tr = (typeLabels[a.type] || a.type || "").toLowerCase();
              return name.includes(q) || pid.includes(q) || doc.includes(q) || tr.includes(q);
            };
            const sortedSource = sourceList
              .filter(matches)
              .slice()
              .sort((a, b) => (b.appointment_date + (b.start_time || "")).localeCompare(a.appointment_date + (a.start_time || "")));
            const sortedFollowup = followupList
              .filter(matches)
              .slice()
              .sort((a, b) => (a.appointment_date + (a.start_time || "")).localeCompare(b.appointment_date + (b.start_time || "")));

            const showSource = rescheduledTab === "all" || rescheduledTab === "source";
            const showFollowup = rescheduledTab === "all" || rescheduledTab === "followup";

            return (
              <div className="px-5 py-4 space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border bg-purple-50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Rescheduled</p>
                    <p className="text-lg font-bold text-purple-700">{sourceList.length + followupList.length}</p>
                  </div>
                  <div className="rounded-md border bg-blue-50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Source Visits</p>
                    <p className="text-lg font-bold text-blue-700">{sourceList.length}</p>
                  </div>
                  <div className="rounded-md border bg-orange-50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Follow-up Visits</p>
                    <p className="text-lg font-bold text-orange-700">{followupList.length}</p>
                  </div>
                </div>

                {/* Tabs + Search */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sticky top-0 bg-background pb-2">
                  <Tabs value={rescheduledTab} onValueChange={(v) => setRescheduledTab(v as typeof rescheduledTab)}>
                    <TabsList className="h-8">
                      <TabsTrigger value="all" className="text-xs h-7">All</TabsTrigger>
                      <TabsTrigger value="source" className="text-xs h-7">Source Visits</TabsTrigger>
                      <TabsTrigger value="followup" className="text-xs h-7">Follow-up Visits</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search name, ID, doctor, treatment..."
                      className="pl-8 h-8 text-xs"
                      value={rescheduledSearch}
                      onChange={(e) => setRescheduledSearch(e.target.value)}
                    />
                  </div>
                </div>

                {sortedSource.length === 0 && sortedFollowup.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    No rescheduled patients in current scope.
                  </div>
                )}

                {/* Section 1: Source Visits */}
                {showSource && sortedSource.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-foreground">Rescheduled From Today</h3>
                      <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700 bg-blue-50">
                        SOURCE VISIT
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">({sortedSource.length})</span>
                    </div>
                    <div className="space-y-2">
                      {sortedSource.map((apt) => {
                        const next = nextFollowUpByApptId[apt.id];
                        return (
                          <div key={apt.id} className="rounded-md border bg-card p-3 text-xs space-y-1.5 hover:border-primary/40 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-foreground">
                                  {apt.patients?.first_name} {apt.patients?.last_name}
                                  <span className="ml-2 text-muted-foreground text-[10px]">{formatPatientCode(apt.patients?.patient_code)}</span>
                                </div>
                                <div className="text-muted-foreground text-[11px] flex items-center gap-1 mt-0.5">
                                  <Phone size={10} /> {apt.patients?.phone || "—"}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={() => { setHistoryAppt(apt); setRescheduledSheetOpen(false); }}
                              >
                                <HistoryIcon size={12} className="mr-1" /> View
                              </Button>
                            </div>
                            <div className="pt-1.5 border-t space-y-1.5">
                              <div>
                                <p className="text-[10px] text-blue-700 uppercase font-semibold">Original Visit (Completed)</p>
                                <p className="font-medium">{format(parseISO(apt.appointment_date), "dd MMM yyyy")} · {formatTime12(apt.start_time)}</p>
                                <p className="text-muted-foreground text-[11px]">{apt.doctor || "—"} · {typeLabels[apt.type] || apt.type}</p>
                              </div>
                              {next && (
                                <>
                                  <div className="text-center text-muted-foreground text-sm leading-none">↓</div>
                                  <div>
                                    <p className="text-[10px] text-purple-700 uppercase font-semibold">Next Appointment</p>
                                    <p className="font-medium">{format(parseISO(next.appointment_date), "dd MMM yyyy")} · {formatTime12(next.start_time)}</p>
                                    <p className="text-muted-foreground text-[11px]">{next.doctor || "—"} · {typeLabels[next.type] || next.type}</p>
                                  </div>
                                </>
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 2: Follow-up Visits */}
                {showFollowup && sortedFollowup.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-foreground">Upcoming Rescheduled Visits</h3>
                      <Badge variant="outline" className="text-[9px] border-orange-300 text-orange-700 bg-orange-50">
                        FOLLOW-UP VISIT
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">({sortedFollowup.length})</span>
                    </div>
                    <div className="space-y-2">
                      {sortedFollowup.map((apt) => {
                        const prev = prevCompletedByApptId[apt.id];
                        return (
                          <div key={apt.id} className="rounded-md border bg-card p-3 text-xs space-y-1.5 hover:border-primary/40 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-foreground">
                                  {apt.patients?.first_name} {apt.patients?.last_name}
                                  <span className="ml-2 text-muted-foreground text-[10px]">{formatPatientCode(apt.patients?.patient_code)}</span>
                                </div>
                                <div className="text-muted-foreground text-[11px] flex items-center gap-1 mt-0.5">
                                  <Phone size={10} /> {apt.patients?.phone || "—"}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={() => { setHistoryAppt(apt); setRescheduledSheetOpen(false); }}
                              >
                                <HistoryIcon size={12} className="mr-1" /> View
                              </Button>
                            </div>
                            <div className="pt-1.5 border-t space-y-1.5">
                              <div>
                                <p className="text-[10px] text-blue-700 uppercase font-semibold">Original Visit</p>
                                <p className="font-medium">{prev ? `${format(parseISO(prev.appointment_date), "dd MMM yyyy")} · ${formatTime12(prev.start_time)}` : "—"}</p>
                                <p className="text-muted-foreground text-[11px]">{prev ? `${prev.doctor || "—"} · ${typeLabels[prev.type] || prev.type}` : ""}</p>
                              </div>
                              <div className="text-center text-muted-foreground text-sm leading-none">↓</div>
                              <div>
                                <p className="text-[10px] text-purple-700 uppercase font-semibold">Current Appointment</p>
                                <p className="font-medium">{format(parseISO(apt.appointment_date), "dd MMM yyyy")} · {formatTime12(apt.start_time)}</p>
                                <p className="text-muted-foreground text-[11px]">{apt.doctor || "—"} · {typeLabels[apt.type] || apt.type}</p>
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Appointments;
