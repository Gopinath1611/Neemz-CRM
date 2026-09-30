import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
import {
  Download, FileSpreadsheet, FileText, Eye, Loader2, Users, CalendarCheck, Clock, MapPin,
  CalendarOff, CalendarDays, Award, Briefcase, UserPlus, KeyRound, GraduationCap, Boxes,
  FolderOpen, ScrollText, Repeat,
} from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Which shared filters a card responds to. */
type FilterKind = "employee" | "department" | "leaveType" | "status";

interface HRReportDef {
  key: string;
  label: string;
  description: string;
  icon: any;
  table: string;
  select: string;
  /** Omit for master lists that have no meaningful transaction date. */
  dateField?: string;
  dateIsTimestamp?: boolean;
  /** Fallback ordering column when there is no date field. */
  orderBy?: string;
  filters?: FilterKind[];
  /** Table has no FK to employees — resolve employee details client-side. */
  needsEmpLookup?: boolean;
  /** Read the value each shared filter should compare against. */
  filterVals?: (r: any) => Partial<Record<FilterKind, string>>;
  mapRow?: (r: any) => Record<string, any>;
}

const fmt = (val: any, f = "dd MMM yyyy") => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return format(d, f);
};

const title = (v: any) =>
  typeof v === "string" ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : (v ?? "");

const yn = (v: any) => (v === true ? "Yes" : v === false ? "No" : "");

const EMP = "employees(employee_code,first_name,last_name,department,designation,status)";
const empName = (r: any) =>
  [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(" ");
const empCols = (r: any) => ({
  "Employee Code": r.employees?.employee_code ?? "",
  Employee: empName(r),
  Department: r.employees?.department ?? "",
  Designation: r.employees?.designation ?? "",
});
const empFilterVals = (r: any) => ({
  employee: r.employee_id ?? "",
  department: r.employees?.department ?? "",
});

const REPORTS: HRReportDef[] = [
  {
    key: "employees",
    label: "Employees (Master)",
    description: "Employee master with code, department, designation, join date & contact",
    icon: Users,
    table: "employees",
    dateField: "join_date",
    filters: ["employee", "department", "status"],
    filterVals: (r) => ({ employee: r.id, department: r.department, status: r.status }),
    select:
      "id,employee_code,first_name,last_name,email,phone,gender,date_of_birth,department,designation,employment_type,join_date,exit_date,status,address,emergency_contact_name,emergency_contact_phone",
    mapRow: (r) => ({
      "Employee Code": r.employee_code ?? "",
      Name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      Department: r.department ?? "",
      Designation: r.designation ?? "",
      "Employment Type": title(r.employment_type),
      "Join Date": fmt(r.join_date),
      "Exit Date": fmt(r.exit_date),
      Status: title(r.status),
      Phone: r.phone ?? "",
      Email: r.email ?? "",
      Gender: title(r.gender),
      "Date of Birth": fmt(r.date_of_birth),
      Address: r.address ?? "",
      "Emergency Contact": r.emergency_contact_name ?? "",
      "Emergency Phone": r.emergency_contact_phone ?? "",
    }),
  },
  {
    key: "attendance",
    label: "Attendance Log",
    description: "Flattened daily attendance: check-in/out, hours, late & manual entries",
    icon: CalendarCheck,
    table: "attendance_logs",
    dateField: "date",
    filters: ["employee", "department", "status"],
    filterVals: (r) => ({ ...empFilterVals(r), status: r.status }),
    select: `date,check_in,check_out,check_in_at,check_out_at,status,hours_worked,overtime_hours,worked_seconds,late_entry,manual_entry,check_in_lat,check_in_lng,notes,${EMP}`,
    mapRow: (r) => ({
      Date: fmt(r.date),
      ...empCols(r),
      "Check In": r.check_in ?? (r.check_in_at ? fmt(r.check_in_at, "hh:mm a") : ""),
      "Check Out": r.check_out ?? (r.check_out_at ? fmt(r.check_out_at, "hh:mm a") : ""),
      Status: title(r.status),
      "Hours Worked": r.hours_worked ?? (r.worked_seconds ? Number((r.worked_seconds / 3600).toFixed(2)) : 0),
      "Overtime Hours": r.overtime_hours ?? 0,
      "Late Entry": yn(r.late_entry),
      "Manual Entry": yn(r.manual_entry),
      "Geo Latitude": r.check_in_lat ?? "",
      "Geo Longitude": r.check_in_lng ?? "",
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "shifts",
    label: "Shift Assignments",
    description: "Roster flattened to one row per employee shift with timings & weekly offs",
    icon: Clock,
    table: "employee_shifts",
    dateField: "effective_from",
    filters: ["employee", "department"],
    filterVals: empFilterVals,
    select: `shift_name,start_time,end_time,weekly_off_days,effective_from,effective_to,notes,${EMP}`,
    mapRow: (r) => ({
      ...empCols(r),
      Shift: r.shift_name ?? "",
      "Start Time": r.start_time ?? "",
      "End Time": r.end_time ?? "",
      "Weekly Off Days": Array.isArray(r.weekly_off_days) ? r.weekly_off_days.join(", ") : "",
      "Effective From": fmt(r.effective_from),
      "Effective To": fmt(r.effective_to),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "geofence",
    label: "Geo Fencing Zones",
    description: "Full list of geo-fence zones with coordinates, radius & applicability",
    icon: MapPin,
    table: "geofence_zones",
    orderBy: "created_at",
    select:
      "name,place_address,latitude,longitude,radius_meters,applicable_departments,applicable_locations,is_active,created_at",
    mapRow: (r) => ({
      Zone: r.name ?? "",
      Address: r.place_address ?? "",
      Latitude: r.latitude ?? "",
      Longitude: r.longitude ?? "",
      "Radius (m)": r.radius_meters ?? "",
      Departments: Array.isArray(r.applicable_departments) ? r.applicable_departments.join(", ") : "",
      Locations: Array.isArray(r.applicable_locations) ? r.applicable_locations.join(", ") : "",
      Active: yn(r.is_active),
      "Created On": fmt(r.created_at),
    }),
  },
  {
    key: "leave_requests",
    label: "Leave Requests",
    description: "Applied leaves with type, dates, days, status & approver",
    icon: CalendarOff,
    table: "leave_requests",
    dateField: "start_date",
    filters: ["employee", "department", "leaveType", "status"],
    filterVals: (r) => ({ ...empFilterVals(r), leaveType: r.leave_type, status: r.status }),
    select: `start_date,end_date,leave_type,duration_type,days,reason,status,approved_by,reporting_person,year,created_at,${EMP}`,
    mapRow: (r) => ({
      ...empCols(r),
      "Leave Type": title(r.leave_type),
      "From Date": fmt(r.start_date),
      "To Date": fmt(r.end_date),
      Duration: title(r.duration_type),
      Days: r.days ?? 0,
      Status: title(r.status),
      Reason: r.reason ?? "",
      "Approved By": r.approved_by ?? "",
      "Reporting Person": r.reporting_person ?? "",
      Year: r.year ?? "",
      "Applied On": fmt(r.created_at),
    }),
  },
  {
    key: "leave_balances",
    label: "Leave Balances",
    description: "Per employee per leave type: allocated, used & remaining balance",
    icon: CalendarOff,
    table: "leave_balances",
    orderBy: "created_at",
    filters: ["employee", "department", "leaveType"],
    filterVals: (r) => ({ ...empFilterVals(r), leaveType: r.leave_type }),
    needsEmpLookup: true,
    select: "year,leave_type,allocated,used,notes,employee_id",
    mapRow: (r) => ({
      ...empCols(r),
      Year: r.year ?? "",
      "Leave Type": title(r.leave_type),
      Allocated: r.allocated ?? 0,
      Used: r.used ?? 0,
      Balance: Number(r.allocated ?? 0) - Number(r.used ?? 0),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "leave_rollovers",
    label: "Leave Roll Over",
    description: "Carry forward, enhancement & encashment between financial years",
    icon: Repeat,
    table: "leave_rollovers",
    orderBy: "created_at",
    filters: ["employee", "department", "leaveType"],
    filterVals: (r) => ({ ...empFilterVals(r), leaveType: r.leave_type }),
    needsEmpLookup: true,
    select: "from_year,to_year,leave_type,remaining_unused,carry_forward,enhancement,encashment,notes,employee_id",
    mapRow: (r) => ({
      ...empCols(r),
      "From Year": r.from_year ?? "",
      "To Year": r.to_year ?? "",
      "Leave Type": title(r.leave_type),
      "Remaining Unused": r.remaining_unused ?? 0,
      "Carry Forward": r.carry_forward ?? 0,
      Enhancement: r.enhancement ?? 0,
      Encashment: r.encashment ?? 0,
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "comp_off",
    label: "Comp Off Requests",
    description: "Comp-off requests with worked date, expiry, status & approver",
    icon: Award,
    table: "comp_off_requests",
    dateField: "working_date",
    filters: ["employee", "department", "status"],
    filterVals: (r) => ({ ...empFilterVals(r), status: r.status }),
    needsEmpLookup: true,
    select: "working_date,expiry_date,duration_type,year,reason,status,approved_by,created_at,employee_id",
    mapRow: (r) => ({
      ...empCols(r),
      "Worked Date": fmt(r.working_date),
      "Expiry Date": fmt(r.expiry_date),
      Duration: title(r.duration_type),
      Year: r.year ?? "",
      Status: title(r.status),
      Reason: r.reason ?? "",
      "Approved By": r.approved_by ?? "",
      "Applied On": fmt(r.created_at),
    }),
  },
  {
    key: "holidays",
    label: "Holidays",
    description: "Holiday calendar with date, duration, type & location",
    icon: CalendarDays,
    table: "holidays",
    dateField: "holiday_date",
    select: "holiday_date,name,duration,type,location,description",
    mapRow: (r) => ({
      Date: fmt(r.holiday_date),
      Holiday: r.name ?? "",
      Duration: title(r.duration),
      Type: title(r.type),
      Location: r.location ?? "",
      Description: r.description ?? "",
    }),
  },
  {
    key: "job_openings",
    label: "Recruitment — Job Openings",
    description: "Openings with department, experience, salary band, status & counts",
    icon: Briefcase,
    table: "job_openings",
    dateField: "posted_date",
    filters: ["department", "status"],
    filterVals: (r) => ({ department: r.department, status: r.status }),
    select:
      "posted_date,closing_date,title,department,designation,job_type,experience_min,experience_max,salary_min,salary_max,location,openings_count,filled_count,hiring_source,status,requirements",
    mapRow: (r) => ({
      "Posted On": fmt(r.posted_date),
      "Closing On": fmt(r.closing_date),
      Title: r.title ?? "",
      Department: r.department ?? "",
      Designation: r.designation ?? "",
      "Job Type": title(r.job_type),
      "Experience (Min)": r.experience_min ?? "",
      "Experience (Max)": r.experience_max ?? "",
      "Salary Min": r.salary_min ?? "",
      "Salary Max": r.salary_max ?? "",
      Location: r.location ?? "",
      Openings: r.openings_count ?? 0,
      Filled: r.filled_count ?? 0,
      "Hiring Source": title(r.hiring_source),
      Status: title(r.status),
      Requirements: r.requirements ?? "",
    }),
  },
  {
    key: "candidates",
    label: "Recruitment — Candidates",
    description: "Candidate pipeline with stage, source, experience, CTC & rating",
    icon: UserPlus,
    table: "recruitment_candidates",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterVals: (r) => ({ status: r.status }),
    select:
      "created_at,full_name,phone,email,current_company,current_designation,experience_years,current_ctc,expected_ctc,notice_period_days,location,skills,source,current_stage,status,rating,date_of_joining,offer_amount,rejection_reason,job_openings(title,department)",
    mapRow: (r) => ({
      "Added On": fmt(r.created_at),
      Candidate: r.full_name ?? "",
      "Applied For": r.job_openings?.title ?? "",
      Department: r.job_openings?.department ?? "",
      Phone: r.phone ?? "",
      Email: r.email ?? "",
      "Current Company": r.current_company ?? "",
      "Current Designation": r.current_designation ?? "",
      "Experience (Yrs)": r.experience_years ?? "",
      "Current CTC": r.current_ctc ?? "",
      "Expected CTC": r.expected_ctc ?? "",
      "Notice Period (Days)": r.notice_period_days ?? "",
      Location: r.location ?? "",
      Skills: Array.isArray(r.skills) ? r.skills.join(", ") : (r.skills ?? ""),
      Source: title(r.source),
      Stage: title(r.current_stage),
      Status: title(r.status),
      Rating: r.rating ?? "",
      "Offer Amount": r.offer_amount ?? "",
      "Date of Joining": fmt(r.date_of_joining),
      "Rejection Reason": r.rejection_reason ?? "",
    }),
  },
  {
    key: "licenses",
    label: "License & Renewals",
    description: "Licenses with vendor, seats, cost, start & expiry dates",
    icon: KeyRound,
    table: "licenses",
    orderBy: "expiry_date",
    filters: ["status"],
    filterVals: (r) => ({ status: r.status }),
    select:
      "workspace_name,vendor,license_type,account_email,seats,cost,currency,purchase_date,license_start_date,expiry_date,reminder_days,auto_renew,status,notes",
    mapRow: (r) => ({
      Workspace: r.workspace_name ?? "",
      Vendor: r.vendor ?? "",
      "License Type": title(r.license_type),
      "Account Email": r.account_email ?? "",
      Seats: r.seats ?? "",
      Cost: r.cost ?? "",
      Currency: r.currency ?? "",
      "Purchase Date": fmt(r.purchase_date),
      "Start Date": fmt(r.license_start_date),
      "Expiry Date": fmt(r.expiry_date),
      "Reminder (Days)": r.reminder_days ?? "",
      "Auto Renew": yn(r.auto_renew),
      Status: title(r.status),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "job_descriptions",
    label: "Job Descriptions",
    description: "Role-wise JD with responsibilities, requirements & KPIs",
    icon: ScrollText,
    table: "jd_roles",
    orderBy: "sort_order",
    select: "title,job_description,responsibilities,requirements,kpis,is_active,sort_order,jd_departments(name)",
    mapRow: (r) => ({
      Department: r.jd_departments?.name ?? "",
      Role: r.title ?? "",
      "Job Description": r.job_description ?? "",
      Responsibilities: r.responsibilities ?? "",
      Requirements: r.requirements ?? "",
      KPIs: Array.isArray(r.kpis) ? r.kpis.map((k: any) => (typeof k === "string" ? k : k?.name ?? JSON.stringify(k))).join("; ") : "",
      Active: yn(r.is_active),
    }),
  },
  {
    key: "training_programs",
    label: "Training Programs",
    description: "Program master with category, duration & active state",
    icon: GraduationCap,
    table: "training_programs",
    orderBy: "sort_order",
    select: "name,category,description,duration_hours,is_active,created_at",
    mapRow: (r) => ({
      Program: r.name ?? "",
      Category: title(r.category),
      "Duration (Hours)": r.duration_hours ?? "",
      Description: r.description ?? "",
      Active: yn(r.is_active),
      "Created On": fmt(r.created_at),
    }),
  },
  {
    key: "employee_trainings",
    label: "Employee Trainings",
    description: "Employee-wise training records with trainer, score & certificate expiry",
    icon: GraduationCap,
    table: "employee_trainings",
    dateField: "start_date",
    filters: ["employee", "department", "status"],
    filterVals: (r) => ({ ...empFilterVals(r), status: r.status }),
    select: `start_date,completion_date,status,trainer_name,score,certificate_expiry_date,notes,employee_id,training_programs(name,category),${EMP}`,
    mapRow: (r) => ({
      ...empCols(r),
      Program: r.training_programs?.name ?? "",
      Category: title(r.training_programs?.category),
      "Start Date": fmt(r.start_date),
      "Completion Date": fmt(r.completion_date),
      Status: title(r.status),
      Trainer: r.trainer_name ?? "",
      Score: r.score ?? "",
      "Certificate Expiry": fmt(r.certificate_expiry_date),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "document_categories",
    label: "Document Categories",
    description: "Document category master with expiry requirement & active state",
    icon: FolderOpen,
    table: "document_categories",
    orderBy: "sort_order",
    select: "name,description,requires_expiry,is_active,created_at",
    mapRow: (r) => ({
      Category: r.name ?? "",
      Description: r.description ?? "",
      "Requires Expiry": yn(r.requires_expiry),
      Active: yn(r.is_active),
      "Created On": fmt(r.created_at),
    }),
  },
  {
    key: "employee_documents",
    label: "Employee Documents",
    description: "Uploaded employee documents with category, issue & expiry dates",
    icon: FileText,
    table: "employee_documents",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["employee", "department"],
    filterVals: empFilterVals,
    select: `created_at,document_name,issue_date,expiry_date,reminder_days,notes,employee_id,document_categories(name),${EMP}`,
    mapRow: (r) => ({
      ...empCols(r),
      Category: r.document_categories?.name ?? "",
      Document: r.document_name ?? "",
      "Issue Date": fmt(r.issue_date),
      "Expiry Date": fmt(r.expiry_date),
      "Reminder (Days)": r.reminder_days ?? "",
      "Uploaded On": fmt(r.created_at),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "assets",
    label: "Assets",
    description: "Assets with category, quantity, assigned employee & status",
    icon: Boxes,
    table: "assets",
    dateField: "assigned_date",
    filters: ["status"],
    filterVals: (r) => ({ status: r.status }),
    select: "assigned_date,asset_name,category,quantity,status,notes,employees(employee_code,first_name,last_name,department,designation,status)",
    mapRow: (r) => ({
      Asset: r.asset_name ?? "",
      Category: title(r.category),
      Quantity: r.quantity ?? "",
      "Assigned To": empName(r),
      "Employee Code": r.employees?.employee_code ?? "",
      Department: r.employees?.department ?? "",
      "Assigned Date": fmt(r.assigned_date),
      Status: title(r.status),
      Notes: r.notes ?? "",
    }),
  },
];

export default function HRMSDownloadReports() {
  const { toast } = useToast();
  const dr = useDateRangeFilter("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [employee, setEmployee] = useState("all");
  const [department, setDepartment] = useState("all");
  const [leaveType, setLeaveType] = useState("all");
  const [status, setStatus] = useState("all");

  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; name: string; department: string | null }[]>([]);
  const [leaveTypeOptions, setLeaveTypeOptions] = useState<string[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      const [{ data: emps }, { data: lv }] = await Promise.all([
        supabase.from("employees").select("id,employee_code,first_name,last_name,department,designation").order("first_name"),
        supabase.from("leave_requests").select("leave_type"),
      ]);
      setEmployeeOptions(
        (emps || []).map((e: any) => ({
          id: e.id,
          name: `${[e.first_name, e.last_name].filter(Boolean).join(" ")}${e.employee_code ? ` (${e.employee_code})` : ""}`,
          department: e.department,
        }))
      );
      const map: Record<string, any> = {};
      (emps || []).forEach((e: any) => { map[e.id] = e; });
      setEmpMap(map);
      const types = new Set<string>();
      (lv || []).forEach((r: any) => r.leave_type && types.add(r.leave_type));
      setLeaveTypeOptions([...types].sort());
    })();
  }, []);

  const departmentOptions = useMemo(() => {
    const s = new Set<string>();
    employeeOptions.forEach((e) => e.department && s.add(e.department));
    return [...s].sort();
  }, [employeeOptions]);

  const activeFilters = useMemo(
    () => ({ employee, department, leaveType, status }),
    [employee, department, leaveType, status]
  );

  const dateLabel = () => {
    if (dr.preset === "all") return "All Time";
    if (dr.range.from && dr.range.to) return `${format(dr.range.from, "dd MMM yyyy")} – ${format(dr.range.to, "dd MMM yyyy")}`;
    return dr.preset;
  };

  const applySharedFilters = (def: HRReportDef, rows: any[]) => {
    if (!def.filters?.length || !def.filterVals) return rows;
    return rows.filter((r) => {
      const vals = def.filterVals!(r);
      for (const kind of def.filters!) {
        const selected = (activeFilters as any)[kind] as string;
        if (!selected || selected === "all") continue;
        const val = vals[kind];
        if (val == null) return false;
        if (String(val).toLowerCase() !== selected.toLowerCase()) return false;
      }
      return true;
    });
  };

  /** Paged read so tables above the 1,000-row cap export fully. */
  const fetchData = async (def: HRReportDef) => {
    const PAGE = 1000;
    const orderCol = def.dateField ?? def.orderBy ?? "created_at";
    const out: any[] = [];
    for (let page = 0; page < 30; page++) {
      let q: any = (supabase as any)
        .from(def.table)
        .select(def.select)
        .order(orderCol, { ascending: !def.dateField })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (def.dateField) {
        if (dr.range.from) {
          const v = def.dateIsTimestamp ? dr.range.from.toISOString() : dr.range.from.toISOString().split("T")[0];
          q = q.gte(def.dateField, v);
        }
        if (dr.range.to) {
          const v = def.dateIsTimestamp ? dr.range.to.toISOString() : dr.range.to.toISOString().split("T")[0];
          q = q.lte(def.dateField, v);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  };

  const buildRows = (def: HRReportDef, data: any[]): Record<string, any>[] => {
    const enriched = def.needsEmpLookup
      ? data.map((r: any) => ({ ...r, employees: r.employees ?? empMap[r.employee_id] ?? null }))
      : data;
    const rows = applySharedFilters(def, enriched);
    if (def.mapRow) return rows.map(def.mapRow);
    return rows.map((r) => {
      const out: Record<string, any> = {};
      Object.entries(r).forEach(([k, v]) => {
        const key = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (v == null) out[key] = "";
        else if (Array.isArray(v)) out[key] = v.join(", ");
        else if (typeof v === "object") out[key] = JSON.stringify(v);
        else out[key] = v;
      });
      return out;
    });
  };

  const openPreview = async (def: HRReportDef) => {
    setPreviewKey(def.key);
    setPreviewLoading(true);
    setPreviewRows([]);
    try {
      setPreviewRows(buildRows(def, await fetchData(def)));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setPreviewKey(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const writeExcel = (label: string, rows: Record<string, any>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));
    XLSX.writeFile(wb, `${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  const writePDF = async (label: string, rows: Record<string, any>[]) => {
    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = await addClinicPdfHeader(doc, branding);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${label} Report`, 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(
      `Period: ${dateLabel()}  |  Total: ${rows.length}  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`,
      14,
      startY + 6
    );
    doc.setTextColor(0);
    const cols = Object.keys(rows[0]);
    autoTable(doc, {
      head: [cols],
      body: rows.map((r) => cols.map((c) => String(r[c] ?? ""))),
      startY: startY + 12,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 95], fontSize: 8 },
      margin: { bottom: 30 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });
    doc.save(`${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const downloadExcel = async (def: HRReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_xlsx");
    try {
      const rows = presetRows ?? buildRows(def, await fetchData(def));
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records for the current selection.` }); return; }
      writeExcel(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const downloadPDF = async (def: HRReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_pdf");
    try {
      const rows = presetRows ?? buildRows(def, await fetchData(def));
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records for the current selection.` }); return; }
      await writePDF(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const downloadAllExcel = async () => {
    setBusy("all_xlsx");
    try {
      const wb = XLSX.utils.book_new();
      let totalRows = 0;
      const errors: string[] = [];
      for (const def of REPORTS) {
        try {
          const rows = buildRows(def, await fetchData(def));
          totalRows += rows.length;
          const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No records for current selection" }]);
          XLSX.utils.book_append_sheet(wb, ws, def.label.substring(0, 31));
        } catch (e: any) {
          errors.push(`${def.label}: ${e.message}`);
        }
      }
      XLSX.writeFile(wb, `HRMS_All_Reports_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast({
        title: "Downloaded",
        description: errors.length ? `${totalRows} records. Errors: ${errors.join("; ")}` : `All reports (${totalRows} total records)`,
        variant: errors.length ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const previewDef = REPORTS.find((r) => r.key === previewKey);

  const clearFilters = () => { setEmployee("all"); setDepartment("all"); setLeaveType("all"); setStatus("all"); };
  const filtersActive = employee !== "all" || department !== "all" || leaveType !== "all" || status !== "all";

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Download className="h-7 w-7 text-primary" /> HRMS Download Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Preview, then export every HRMS menu as Excel or PDF for any date range. Live data, always accurate.
          </p>
        </div>
        <Button onClick={downloadAllExcel} disabled={!!busy}>
          {busy === "all_xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Download All (Excel)
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Date range applies to dated reports. Master lists (Geo Fencing, Job Descriptions, Balances, Roll Over, Categories, Programs, Licenses) always export in full.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter
              preset={dr.preset}
              onPresetChange={dr.setPreset}
              customFrom={dr.customFrom}
              customTo={dr.customTo}
              onCustomFromChange={dr.setCustomFrom}
              onCustomToChange={dr.setCustomTo}
              hideTomorrow
              showYesterday
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Select value={employee} onValueChange={setEmployee}>
              <SelectTrigger><SelectValue placeholder="Employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employeeOptions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departmentOptions.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger><SelectValue placeholder="Leave Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Leave Types</SelectItem>
                {leaveTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{title(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Selected: <Badge variant="secondary">{dateLabel()}</Badge>
            {filtersActive && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((def) => {
          const Icon = def.icon;
          const xlsxBusy = busy === def.key + "_xlsx";
          const pdfBusy = busy === def.key + "_pdf";
          return (
            <Card key={def.key} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {def.label}
                </CardTitle>
                <CardDescription className="text-xs">{def.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="default" onClick={() => openPreview(def)} disabled={!!busy}>
                  <Eye className="h-4 w-4" />
                  View
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadExcel(def)} disabled={!!busy}>
                  {xlsxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadPDF(def)} disabled={!!busy}>
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {previewDef && (
        <ReportPreviewDialog
          open={!!previewKey}
          onOpenChange={(o) => !o && setPreviewKey(null)}
          title={previewDef.label}
          periodLabel={dateLabel()}
          rows={previewRows}
          loading={previewLoading}
          busy={busy}
          busyKey={previewDef.key}
          onDownloadExcel={() => downloadExcel(previewDef, previewRows)}
          onDownloadPDF={() => downloadPDF(previewDef, previewRows)}
        />
      )}
    </div>
  );
}
