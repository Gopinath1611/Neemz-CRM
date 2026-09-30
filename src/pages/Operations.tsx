import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Target, TrendingUp, Users, Plus,
  Stethoscope, Megaphone, IndianRupee, UserCog,
  CheckCircle, XCircle, Clock, Trophy, Zap, Settings2, Crown, Medal, Award, Star,
  CalendarIcon, Pencil, Trash2, Sparkles, Download, FileText, FileSpreadsheet, Eye, GripVertical, ChevronUp, ChevronDown
} from "lucide-react";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { useAuth } from "@/contexts/AuthContext";
import { TodoListPanel } from "@/components/operations/TodoListPanel";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, startOfYear, endOfYear, subDays, differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

const departments = [
  { id: "clinic", label: "Clinic", icon: Stethoscope },
  { id: "sales_marketing", label: "Sales & Marketing", icon: Megaphone },
  { id: "finance", label: "Finance", icon: IndianRupee },
  { id: "hr", label: "HR / Admin", icon: UserCog },
];

type PresetKey = "today" | "yesterday" | "week" | "month" | "last7" | "last30" | "year" | "custom";
const presetOptions: { value: PresetKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const DEFAULT_TARGET_KIND_LABELS: Record<"treatment" | "revenue" | "kpi", string> = {
  treatment: "Treatment-wise",
  revenue: "Revenue (₹)",
  kpi: "KPI / Quality",
};

// ---- Staff cards on role pages (live from Settings → Staff) ---------------
// Maps an Operations role (department_roles.role_name / display_label) to the
// staff role keys assigned in Settings → Staff → Manage Roles (user_roles).
const OPS_ROLE_TO_STAFF_ROLES: Record<string, string[]> = {
  doctor: ["duty_doctor", "doctor", "dentist", "consultant_doctor"],
  duty_doctor: ["duty_doctor"],
  dental_assistant: ["dental_assistant", "chairside_assistant", "assistant"],
  receptionist: ["receptionist"],
  housekeeping: ["housekeeping"],
  digital_marketing_manager: ["digital_marketing_manager"],
  digital_marketing_executive: ["digital_marketing_executive"],
  video_editor: ["video_editor"],
  telecaller: ["telecaller"],
  digital_relationship_manager: ["dre"],
  account_manager: ["finance_manager"],
  accountant: ["accountant"],
  hr_manager: ["hr", "hr_manager"],
  hr_executive: ["hr_executive"],
  admin: ["admin"],
};

const staffRolesForOpsRole = (role: any): string[] => {
  if (!role) return [];
  const direct = OPS_ROLE_TO_STAFF_ROLES[role.role_name];
  if (direct) return direct;
  const labelKey = (role.display_label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return OPS_ROLE_TO_STAFF_ROLES[labelKey] || [];
};

const Operations = () => {
  const [activeDept, setActiveDept] = useState("clinic");
  const [activeRole, setActiveRole] = useState<string>("all");
  const [activePeriod, setActivePeriod] = useState<PresetKey>("month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showAddPoints, setShowAddPoints] = useState(false);
  const [showRolesMgr, setShowRolesMgr] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [showAddMetric, setShowAddMetric] = useState<string | null>(null);
  const [showSetTarget, setShowSetTarget] = useState(false);
  const [kpiPage, setKpiPage] = useState(1);
  const [kpiPageSize, setKpiPageSize] = useState(10);
  // Per-employee custom ordering for the KPIs & Targets table (drag to reorder).
  // Stored in localStorage so anyone viewing this employee sees the saved order.
  const [kpiOrderMap, setKpiOrderMap] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem("ops:kpi-order") || "{}"); } catch { return {}; }
  });
  const persistKpiOrder = (next: Record<string, string[]>) => {
    setKpiOrderMap(next);
    try { localStorage.setItem("ops:kpi-order", JSON.stringify(next)); } catch {}
  };
  const [kpiDragIndex, setKpiDragIndex] = useState<number | null>(null);
  const [kpiDragOver, setKpiDragOver] = useState<number | null>(null);
  const [showKpiReport, setShowKpiReport] = useState(false);
  const queryClient = useQueryClient();
  const location = useLocation();
  const { user, roles } = useAuth();
  // Anyone who can reach the Operations page (gated by ProtectedRoute / module
  // access) gets the same management view as the admin: full employee dropdown,
  // leaderboards, role management, target setting, etc. Without this, granting
  // /operations access to a Marketing Manager (or any other role) showed only
  // their own row and hid the executive/employee dropdowns.
  // Managers keep the management view (scoped to their department by the
  // `employees` memo below); individual employees see only their own data.
  const isAdmin = !roles.includes("admin" as any)
    ? ((roles as string[]) || []).some((r) => r.includes("manager") || r === "hr")
    : true;
  const isPlatformAdmin = roles.includes("admin" as any);

  // Per-doctor scoping: which employee record does the logged-in user map to?
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("self");
  // Admin-only: focus on a specific employee inside the All Clinic > Role view
  const [activeEmployeeId, setActiveEmployeeId] = useState<string>("all");

  const deptHashMap: Record<string, string> = {
    clinic: "clinic",
    "sales-marketing": "sales_marketing",
    finance: "finance",
    "hr-admin": "hr",
  };
  // hash → { dept, role_name } for role-specific deep links.
  // Built dynamically below from department_roles so that newly added roles
  // (created via the Roles & KPI manager) become navigable instantly.
  const isRoleHash = (h: string): boolean => {
    if (!h || deptHashMap[h]) return false;
    return Object.keys(deptHashMap).some((dh) => h.startsWith(`${dh}-`));
  };
  // Stub kept for backward compatibility with existing usages below.
  const roleHashMap: Record<string, { dept: string; role: string }> = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        if (typeof key !== "string") return undefined;
        if (!isRoleHash(key)) return undefined;
        const dh = Object.keys(deptHashMap)
          .sort((a, b) => b.length - a.length)
          .find((d) => key.startsWith(`${d}-`));
        if (!dh) return undefined;
        return { dept: deptHashMap[dh], role: key.slice(dh.length + 1).replace(/-/g, "_") };
      },
      has: (_t, key: string) => isRoleHash(key as string),
    },
  ) as any;
  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (!hash) return;
    if (deptHashMap[hash]) {
      setActiveDept(deptHashMap[hash]);
      setActiveRole("all");
      return;
    }
    // Try parsing "<dept-hash>-<role-slug>" by matching the longest dept prefix.
    const deptHashKeys = Object.keys(deptHashMap).sort((a, b) => b.length - a.length);
    for (const dh of deptHashKeys) {
      const prefix = `${dh}-`;
      if (hash.startsWith(prefix)) {
        const roleSlug = hash.slice(prefix.length);
        const roleName = roleSlug.replace(/-/g, "_");
        setActiveDept(deptHashMap[dh]);
        setActiveRole(roleName);
        return;
      }
    }
  }, [location.hash]);

  // When the user deep-links into a specific department dashboard
  // (e.g. /operations#clinic), lock the view to that department and
  // hide the top "department selector" tabs/dropdown.
  const currentHash = location.hash.replace("#", "");
  const deptLocked = !!deptHashMap[currentHash];

  const { periodStart, periodEnd, periodLabel, periodRangeText, targetType } = useMemo(() => {
    const now = new Date();
    let from: Date, to: Date;
    switch (activePeriod) {
      case "today": from = startOfDay(now); to = endOfDay(now); break;
      case "yesterday": { const y = subDays(now, 1); from = startOfDay(y); to = endOfDay(y); break; }
      case "week": from = startOfWeek(now, { weekStartsOn: 1 }); to = endOfWeek(now, { weekStartsOn: 1 }); break;
      case "month": from = startOfMonth(now); to = endOfMonth(now); break;
      case "last7": from = startOfDay(subDays(now, 6)); to = endOfDay(now); break;
      case "last30": from = startOfDay(subDays(now, 29)); to = endOfDay(now); break;
      case "year": from = startOfYear(now); to = endOfYear(now); break;
      case "custom":
        from = customRange?.from ? startOfDay(customRange.from) : startOfMonth(now);
        to = customRange?.to ? endOfDay(customRange.to) : (customRange?.from ? endOfDay(customRange.from) : endOfMonth(now));
        break;
      default: from = startOfMonth(now); to = endOfMonth(now);
    }
    const days = differenceInDays(to, from) + 1;
    const baseLabel = presetOptions.find(p => p.value === activePeriod)?.label || "";
    const rangeText = `${format(from, "dd MMM yyyy")} → ${format(to, "dd MMM yyyy")}`;
    const label = activePeriod === "custom"
      ? rangeText
      : `${baseLabel} · ${rangeText}`;
    const tType = days <= 1 ? "daily" : days <= 7 ? "weekly" : "monthly";
    return {
      periodStart: format(from, "yyyy-MM-dd"),
      periodEnd: format(to, "yyyy-MM-dd"),
      periodLabel: label,
      periodRangeText: rangeText,
      targetType: tType,
    };
  }, [activePeriod, customRange]);

  const [pointsForm, setPointsForm] = useState({
    employee_id: "", points: "", reason: "",
  });
  const [newRole, setNewRole] = useState({ role_name: "", display_label: "" });
  const [dlgDept, setDlgDept] = useState<string>("clinic");
  const [dlgRole, setDlgRole] = useState<string>("all");
  const [newMetric, setNewMetric] = useState({ metric_name: "", unit: "count", default_target: "0", points_per_unit: "1", weight: "1" });
  const [metricEditor, setMetricEditor] = useState<{ mode: "create" | "edit"; id?: string; role_id: string; metric_name: string; unit: string; default_target: string; points_per_unit: string; weight: string; target_kind_id?: string | null } | null>(null);
  const [targetKindEditor, setTargetKindEditor] = useState<{ mode: "create" | "edit"; source: "custom" | "default"; id?: string; role_id: string; kind_label: string; base_kind: string } | null>(null);
  const { treatmentOptions } = useClinicMasters();
  const [targetForm, setTargetForm] = useState({
    employee_id: "",
    period: "monthly" as "daily" | "weekly" | "monthly",
    metric_kind: "treatment" as "treatment" | "revenue" | "kpi",
    metric_name: "",
    target_value: "",
    points_per_unit: "1",
    custom_kind_id: "" as string,
  });

  // Role-specific KPI presets (used when setting targets for non-doctor roles)
  const ROLE_KPI_PRESETS: Record<string, string[]> = {
    dental_assistant: [
      "Sterilization Compliance",
      "Doctor Support Efficiency",
      "Target Visits Achieved",
      "Patient Handling Feedback",
      "Tray Preparation Accuracy",
      "Stock Monitoring",
      "Stock Maintaining",
      "Chair Readiness",
      "Infection Control",
      "Instrument Setup Accuracy",
    ],
    receptionist: [
      "Call Answer Rate",
      "Appointment Booking Accuracy",
      "Patient Greeting & Feedback",
      "Front Desk Cleanliness",
      "Lead Follow-up Closure",
      "Billing Coordination",
      "Waiting Time Management",
    ],
    house_keeping: [
      "Floor Cleaning Compliance",
      "Restroom Hygiene",
      "Waste Segregation",
      "Reception Area Cleanliness",
      "Operatory Cleanliness",
      "Linen & Disposables Restocking",
      "Daily Checklist Adherence",
    ],
    housekeeping: [
      "Floor Cleaning Compliance",
      "Restroom Hygiene",
      "Waste Segregation",
      "Reception Area Cleanliness",
      "Operatory Cleanliness",
      "Linen & Disposables Restocking",
      "Daily Checklist Adherence",
    ],
    doctor: [
      "Treatment Completion Rate",
      "Patient Satisfaction Feedback",
      "Case Documentation Quality",
      "Cross-consultation Referrals",
    ],
    digital_marketing_manager: [
      "Monthly Lead Target",
      "Cost Per Lead",
      "Campaign ROI",
      "Conversion Rate",
      "Team Productivity",
      "Content Calendar Adherence",
      "Brand Engagement Growth",
    ],
    digital_marketing_executive: [
      "Posts Published",
      "Ad Campaigns Launched",
      "Leads Generated",
      "Engagement Rate",
      "Reach & Impressions",
      "Reporting Accuracy",
    ],
    video_editor: [
      "Videos Edited",
      "Reels Delivered",
      "Turnaround Time",
      "Quality Approval Rate",
      "Content Calendar Compliance",
    ],
    telecaller: [
      "Calls Made",
      "Connected Calls",
      "Appointments Booked",
      "Lead Conversion Rate",
      "Follow-up Compliance",
      "Call Quality Score",
    ],
    account_manager: [
      "Monthly Closing Accuracy",
      "Receivables Collection",
      "Payables Management",
      "Audit Compliance",
      "GST / Tax Filing Timeliness",
      "Financial Reporting On-time",
    ],
    accountant: [
      "Daily Entry Accuracy",
      "Bank Reconciliation",
      "Invoice Processing Time",
      "Expense Booking Accuracy",
      "Petty Cash Management",
    ],
    hr_manager: [
      "Recruitment Closure Rate",
      "Employee Retention",
      "Training Completion",
      "Payroll Accuracy",
      "Compliance Adherence",
      "Engagement Score",
    ],
    hr_executive: [
      "Attendance Tracking Accuracy",
      "Onboarding TAT",
      "Leave Processing Time",
      "Document Compliance",
      "Employee Query Resolution",
    ],
  };

  const { data: allEmployees = [], refetch: refetchEmployees } = useQuery({
    queryKey: ["ops-employees"],
    queryFn: async () =>
      (await supabase
        .from("employees")
        .select("*")
        .eq("status", "active")
        .not("user_id", "is", null)
        .order("first_name")).data || [],
  });

  // ---- Strict role-based data scoping ------------------------------------
  // admin    → company-wide view (all departments, all employees)
  // manager  → own department team only
  // employee → own record only
  const scopeTier: "admin" | "manager" | "employee" = useMemo(() => {
    const r = (roles as string[]) || [];
    if (r.includes("admin")) return "admin";
    if (r.some((x) => x.includes("manager") || x === "hr")) return "manager";
    return "employee";
  }, [roles]);

  const selfEmployee = useMemo(() => {
    if (!user) return null;
    const byUserId = allEmployees.find((e: any) => e.user_id === user.id);
    if (byUserId) return byUserId;
    const email = user.email?.toLowerCase();
    if (!email) return null;
    return allEmployees.find((e: any) => (e.email || "").toLowerCase() === email) || null;
  }, [allEmployees, user]);

  // Everything below reads `employees`, so scoping here isolates all KPI,
  // leaderboard, to-do and meeting data without touching any screen UI.
  const employees = useMemo(() => {
    if (scopeTier === "admin") return allEmployees;
    if (!selfEmployee) return [] as any[];
    if (scopeTier === "manager") {
      return allEmployees.filter((e: any) => e.department === selfEmployee.department);
    }
    return allEmployees.filter((e: any) => e.id === selfEmployee.id);
  }, [allEmployees, scopeTier, selfEmployee]);


  // Settings → Staff is the source of truth: profiles + user_roles.
  const { data: staffProfiles = [] } = useQuery<any[]>({
    queryKey: ["ops-staff-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, active")).data || [],
  });
  const { data: staffRoles = [] } = useQuery<any[]>({
    queryKey: ["ops-staff-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("user_id, role")).data || [],
  });

  // Staff emails/phones (same source as Settings → Staff page).
  const { data: staffContactMap = {} as Record<string, { email?: string; phone?: string }> } = useQuery({
    queryKey: ["ops-staff-contacts"],
    queryFn: async () => {
      const map: Record<string, { email?: string; phone?: string }> = {};
      try {
        const resp = await supabase.functions.invoke("manage-admin-users", {
          body: { action: "list" },
          headers: await getFunctionAuthHeaders(),
        });
        if (resp.error) return map;
        const list = (resp.data as any)?.users as Array<{ user_id: string; email?: string; phone?: string }> | undefined;
        list?.forEach((u) => { map[u.user_id] = { email: u.email, phone: u.phone }; });
      } catch { /* non-admin: contact info stays hidden */ }
      return map;
    },
    staleTime: 60_000,
  });

  // Map staff role → operations department + designation (matches department_roles.role_name)
  const STAFF_ROLE_MAP: Record<string, { dept: string; designation: string }> = {
    admin: { dept: "clinic", designation: "admin" },
    duty_doctor: { dept: "clinic", designation: "doctor" },
    dental_assistant: { dept: "clinic", designation: "dental_assistant" },
    receptionist: { dept: "clinic", designation: "receptionist" },
    digital_marketing_manager: { dept: "sales_marketing", designation: "digital_marketing_manager" },
    digital_marketing_executive: { dept: "sales_marketing", designation: "digital_marketing_executive" },
    video_editor: { dept: "sales_marketing", designation: "video_editor" },
    telecaller: { dept: "sales_marketing", designation: "telecaller" },
    dre: { dept: "sales_marketing", designation: "digital_relationship_manager" },
    finance_manager: { dept: "finance", designation: "account_manager" },
    accountant: { dept: "finance", designation: "accountant" },
    hr_manager: { dept: "hr", designation: "hr_manager" },
    hr_executive: { dept: "hr", designation: "hr_executive" },
    hr: { dept: "hr", designation: "hr_manager" },
  };

  // Reverse map: ops designation → list of staff role keys that map to it
  const designationToStaffRoles = useMemo(() => {
    const m: Record<string, string[]> = {};
    Object.entries(STAFF_ROLE_MAP).forEach(([staffRole, info]) => {
      (m[info.designation] ||= []).push(staffRole);
    });
    return m;
  }, []);

  // user_id → set of staff role keys (live from user_roles)
  const rolesByUserId = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    staffRoles.forEach((r: any) => {
      (map[r.user_id] ||= new Set()).add(r.role);
    });
    return map;
  }, [staffRoles]);

  // True if employee belongs under a given ops designation. Prefers live
  // user_roles (so multi-role staff appear under each role); falls back to
  // employees.designation only when the user has no role assignments.
  // Allowed staff roles come from OPS_ROLE_TO_STAFF_ROLES (the same mapping
  // used by the role chips / staff lists) so the Set Target dropdown always
  // matches the staff shown on the role page.
  const employeeMatchesDesignation = (emp: any, designation: string) => {
    if (!emp || !designation) return false;
    const userRoleSet = emp.user_id ? rolesByUserId[emp.user_id] : undefined;
    if (userRoleSet && userRoleSet.size > 0) {
      const allowed = staffRolesForOpsRole({ role_name: designation });
      const effective = allowed.length ? allowed : designationToStaffRoles[designation] || [];
      return effective.some((r) => userRoleSet.has(r));
    }
    return emp.designation === designation;
  };

  // Sync: every Settings staff member must exist as an active employee linked
  // by user_id, with department + designation derived from their role.
  useEffect(() => {
    if (!staffProfiles.length) return;
    const rolesByUser: Record<string, string[]> = {};
    staffRoles.forEach((r: any) => {
      (rolesByUser[r.user_id] ||= []).push(r.role);
    });

    const toInsert: any[] = [];
    const toUpdate: { id: string; patch: any }[] = [];
    const validUserIds = new Set(staffProfiles.map((p: any) => p.id));

    // Deactivate employees whose linked Settings staff no longer exists
    allEmployees.forEach((e: any) => {
      if (e.user_id && !validUserIds.has(e.user_id) && e.status === "active") {
        toUpdate.push({ id: e.id, patch: { status: "inactive" } });
      }
    });

    staffProfiles.forEach((p: any) => {
      const userRoles = rolesByUser[p.id] || [];
      // Pick first role that maps to an operations dept; if none, default to clinic/staff
      const mapped =
        userRoles.map((r) => STAFF_ROLE_MAP[r]).find(Boolean) ||
        { dept: "clinic", designation: "staff" };

      const fullName = (p.full_name || "Unknown").trim();
      const [first, ...rest] = fullName.split(/\s+/);
      const last = rest.join(" ") || "—";

      const existing = allEmployees.find((e: any) => e.user_id === p.id);
      if (!existing) {
        toInsert.push({
          user_id: p.id,
          first_name: first || fullName,
          last_name: last,
          department: mapped.dept,
          designation: mapped.designation,
          status: "active",
          employment_type: "full_time",
        });
      } else {
        const patch: any = {};
        if (existing.department !== mapped.dept) patch.department = mapped.dept;
        if (existing.designation !== mapped.designation) patch.designation = mapped.designation;
        if (existing.status !== "active") patch.status = "active";
        const newFirst = first || fullName;
        if ((existing.first_name || "") !== newFirst) patch.first_name = newFirst;
        if ((existing.last_name || "") !== last) patch.last_name = last;
        if (Object.keys(patch).length) toUpdate.push({ id: existing.id, patch });
      }
    });

    const run = async () => {
      let changed = false;
      if (toInsert.length) {
        const { error } = await supabase.from("employees").insert(toInsert);
        if (error) console.error("[ops-sync] employee insert failed:", error.message, toInsert.map((r) => r.user_id));
        else changed = true;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("employees").update(u.patch).eq("id", u.id);
        if (error) console.error("[ops-sync] employee update failed:", error.message, u.id);
        else changed = true;
      }
      if (changed) refetchEmployees();
    };
    void run();
  }, [staffProfiles, staffRoles, allEmployees]);

  const { data: deptRoles = [] } = useQuery<any[]>({
    queryKey: ["ops-dept-roles"],
    queryFn: async () => ((await (supabase.from as any)("department_roles").select("*").eq("is_active", true).order("sort_order")).data || []) as any[],
  });

  // Live-refresh when roles/staff are added/edited anywhere in the app so the
  // Operations dashboard (and dynamic sidebar) stay in sync.
  useEffect(() => {
    const channel = supabase
      .channel("ops-settings-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "department_roles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ops-dept-roles"] });
          queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ops-staff-roles"] });
          queryClient.invalidateQueries({ queryKey: ["ops-employees"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ops-staff-profiles"] });
          queryClient.invalidateQueries({ queryKey: ["ops-employees"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" },
        () => queryClient.invalidateQueries({ queryKey: ["ops-employees"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "role_metrics" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ops-role-metrics"] });
          queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "role_target_kinds" },
        () => queryClient.invalidateQueries({ queryKey: ["ops-role-target-kinds"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "role_target_kind_overrides" },
        () => queryClient.invalidateQueries({ queryKey: ["ops-role-target-kind-overrides"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "role_hidden_presets" },
        () => queryClient.invalidateQueries({ queryKey: ["ops-role-hidden-presets"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_targets" },
        () => queryClient.invalidateQueries({ queryKey: ["ops-targets"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);


  const { data: roleMetrics = [] } = useQuery<any[]>({
    queryKey: ["ops-role-metrics"],
    queryFn: async () => ((await (supabase.from as any)("role_metrics").select("*").eq("is_active", true)).data || []) as any[],
  });

  const { data: roleTargetKinds = [] } = useQuery<any[]>({
    queryKey: ["ops-role-target-kinds"],
    queryFn: async () => ((await (supabase.from as any)("role_target_kinds").select("*").eq("is_active", true).order("created_at")).data || []) as any[],
  });

  const { data: roleTargetKindOverrides = [] } = useQuery<any[]>({
    queryKey: ["ops-role-target-kind-overrides"],
    queryFn: async () => ((await (supabase.from as any)("role_target_kind_overrides").select("*").order("created_at")).data || []) as any[],
  });

  const { data: roleHiddenPresets = [] } = useQuery<any[]>({
    queryKey: ["ops-role-hidden-presets"],
    queryFn: async () => ((await (supabase.from as any)("role_hidden_presets").select("*")).data || []) as any[],
  });

  const { data: targets = [] } = useQuery({
    queryKey: ["ops-targets"],
    queryFn: async () => (await supabase.from("employee_targets").select("*").order("created_at", { ascending: false })).data || [],
  });

  const canonicalMetricNameByRole = useMemo(() => {
    const map = new Map<string, string>();
    roleMetrics.forEach((metric: any) => {
      const role = deptRoles.find((r: any) => r.id === metric.role_id);
      const roleName = (role?.role_name || "").toLowerCase().trim();
      const metricName = (metric.metric_name || "").trim();
      if (!roleName || !metricName) return;
      map.set(`${roleName}::${metricName.toLowerCase()}`, metricName);
    });
    return map;
  }, [roleMetrics, deptRoles]);

  const syncedTargets = useMemo(
    () => (targets as any[]).map((target: any) => {
      const canonicalMetricName = canonicalMetricNameByRole.get(`${String(target.role || "").toLowerCase().trim()}::${String(target.metric_name || "").toLowerCase().trim()}`);
      return canonicalMetricName && canonicalMetricName !== target.metric_name
        ? { ...target, metric_name: canonicalMetricName }
        : target;
    }),
    [targets, canonicalMetricNameByRole]
  );

  const { data: targetAchievementLogs = [] } = useQuery<any[]>({
    queryKey: ["ops-target-achievement-logs"],
    queryFn: async () => ((await (supabase.from as any)("employee_target_achievement_logs").select("*").order("achieved_date", { ascending: false }).limit(5000)).data || []) as any[],
  });

  const { data: perfLogs = [] } = useQuery({
    queryKey: ["ops-perf-logs"],
    queryFn: async () => (await (supabase.from as any)("performance_logs").select("*").order("log_date", { ascending: false }).limit(500)).data || [],
  });

  const { data: pointsLogs = [] } = useQuery<any[]>({
    queryKey: ["ops-points", periodStart, periodEnd],
    queryFn: async () => ((await (supabase.from as any)("performance_points").select("*").gte("period_date", periodStart).lte("period_date", periodEnd)).data || []) as any[],
  });

  // Live: completed treatments joined with plan to get doctor + completion date
  const { data: completedTreatments = [] } = useQuery<any[]>({
    queryKey: ["ops-completed-treatments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("treatment_plan_items")
        .select("id, treatment_type, doctor, completed_at, status, plan_id, treatment_plans(doctor, patient_id)")
        .eq("status", "completed");
      return (data || []) as any[];
    },
  });

  // Live: billings joined with plan to get doctor + billing items for treatment-wise revenue
  const { data: billingsData = [] } = useQuery<any[]>({
    queryKey: ["ops-billings-doctor"],
    queryFn: async () => {
      const { data } = await supabase
        .from("billings")
        .select("id, total_amount, created_at, patient_id, plan_id, treatment_plans(doctor, patient_id), billing_items(treatment_type, total_price)");
      return (data || []) as any[];
    },
  });

  // Live: patients (for age-group analysis on doctor summary)
  const { data: patientsData = [] } = useQuery<any[]>({
    queryKey: ["ops-patients-min"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, date_of_birth");
      return (data || []) as any[];
    },
  });

  const currentDeptRoles = useMemo(
    () => (activeDept === "all" ? deptRoles : deptRoles.filter((r: any) => r.department === activeDept)),
    [deptRoles, activeDept]
  );

  // Reset role only when user changes dept via tabs (not via hash deep-link)
  const prevDeptRef = (function () {
    // closure-stable ref via useState
    return null;
  })();
  const [prevDept, setPrevDept] = useState(activeDept);
  useEffect(() => {
    if (prevDept !== activeDept) {
      const hash = location.hash.replace("#", "");
      if (!roleHashMap[hash]) {
        const firstRole = deptRoles.find((r: any) => r.department === activeDept);
        setActiveRole(firstRole ? firstRole.id : "all");
      }
      setPrevDept(activeDept);
    }
  }, [activeDept, deptRoles]);

  // Auto-select first role if "all" is somehow active (All role removed from UI)
  useEffect(() => {
    if (activeRole === "all" && currentDeptRoles.length > 0) {
      setActiveRole(currentDeptRoles[0].id);
    }
  }, [activeRole, currentDeptRoles]);

  // Reset focused employee whenever the role filter or dept changes
  useEffect(() => { setActiveEmployeeId("all"); }, [activeRole, activeDept]);

  const getEmpName = (id: string) => {
    const e = employees.find((e: any) => e.id === id);
    return e ? `${e.first_name} ${e.last_name}` : "Unknown";
  };

  // Map the logged-in auth user to an employee record (by user_id, then email).
  const currentUserEmployee = useMemo(() => {
    if (!user) return null;
    const byUserId = employees.find((e: any) => e.user_id === user.id);
    if (byUserId) return byUserId;
    const email = user.email?.toLowerCase();
    if (!email) return null;
    return employees.find((e: any) => (e.email || "").toLowerCase() === email) || null;
  }, [employees, user]);

  // In role-locked sub-modules, non-admin users see ONLY their own data.
  // Admins see a dropdown of all matching employees (selectedEmployeeId).
  const lockedEmployeeId = useMemo(() => {
    const hash = location.hash.replace("#", "");
    if (!roleHashMap[hash]) return null;
    if (isAdmin) {
      return selectedEmployeeId === "self"
        ? (currentUserEmployee?.id ?? null)
        : selectedEmployeeId;
    }
    return currentUserEmployee?.id ?? "__none__"; // none means show empty
  }, [location.hash, isAdmin, selectedEmployeeId, currentUserEmployee]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (activeDept !== "all") list = list.filter((e: any) => e.department === activeDept);
    if (activeRole !== "all") {
      const role = deptRoles.find((r: any) => r.id === activeRole || r.role_name === activeRole);
      if (role) list = list.filter((e: any) => employeeMatchesDesignation(e, role.role_name));
    }
    if (lockedEmployeeId) {
      list = list.filter((e: any) => e.id === lockedEmployeeId);
    } else if (!roleHashMap[location.hash.replace("#", "")] && activeRole !== "all" && activeEmployeeId !== "all") {
      list = list.filter((e: any) => e.id === activeEmployeeId);
    }
    return list;
  }, [employees, activeDept, activeRole, deptRoles, lockedEmployeeId, activeEmployeeId, rolesByUserId]);

  useEffect(() => {
    const nextDept = activeDept === "all" ? "clinic" : activeDept;
    const nextRole = activeRole === "all"
      ? deptRoles.find((r: any) => r.department === nextDept)?.id ?? ""
      : deptRoles.find((r: any) => r.id === activeRole || r.role_name === activeRole)?.id ?? activeRole;
    setDlgDept(nextDept);
    setDlgRole(nextRole);
  }, [activeDept, activeRole, deptRoles]);

  const dlgDeptRoles = useMemo(
    () => deptRoles.filter((r: any) => r.department === dlgDept),
    [deptRoles, dlgDept]
  );

  const selectedDlgRole = useMemo(
    () => deptRoles.find((r: any) => r.id === dlgRole || r.role_name === dlgRole) || null,
    [deptRoles, dlgRole]
  );

  const selectedRoleMetrics = useMemo(
    () => selectedDlgRole ? roleMetrics.filter((m: any) => m.role_id === selectedDlgRole.id) : [],
    [roleMetrics, selectedDlgRole]
  );

  const allowedTargetKinds = useMemo(() => {
    if (!selectedDlgRole) return ["treatment", "revenue", "kpi"] as Array<"treatment" | "revenue" | "kpi">;
    if (selectedDlgRole.department === "clinic") {
      if (selectedDlgRole.role_name === "doctor") return ["treatment", "revenue"] as Array<"treatment" | "revenue" | "kpi">;
      if (["dental_assistant", "receptionist", "housekeeping", "house_keeping"].includes(selectedDlgRole.role_name)) {
        return ["kpi"] as Array<"treatment" | "revenue" | "kpi">;
      }
    }
    return ["treatment", "revenue", "kpi"] as Array<"treatment" | "revenue" | "kpi">;
  }, [selectedDlgRole]);

  const selectedRoleTargetKindOverrides = useMemo(
    () => selectedDlgRole ? roleTargetKindOverrides.filter((item: any) => item.role_id === selectedDlgRole.id) : [],
    [roleTargetKindOverrides, selectedDlgRole]
  );

  const selectedRoleTargetKindOverrideMap = useMemo(
    () => Object.fromEntries(selectedRoleTargetKindOverrides.map((item: any) => [item.base_kind, item])),
    [selectedRoleTargetKindOverrides]
  );

  const visibleDefaultTargetKinds = useMemo(
    () => allowedTargetKinds.filter((kind) => !selectedRoleTargetKindOverrideMap[kind]?.is_hidden),
    [allowedTargetKinds, selectedRoleTargetKindOverrideMap]
  );

  const selectedCustomKind = useMemo(
    () => targetForm.custom_kind_id ? (roleTargetKinds as any[]).find((k) => k.id === targetForm.custom_kind_id) : null,
    [roleTargetKinds, targetForm.custom_kind_id]
  );

  const selectedTargetKindLabel = useMemo(() => {
    if (selectedCustomKind) return selectedCustomKind.kind_label;
    const selectedKind = targetForm.metric_kind as "treatment" | "revenue" | "kpi";
    return selectedRoleTargetKindOverrideMap[selectedKind]?.kind_label || DEFAULT_TARGET_KIND_LABELS[selectedKind] || "Select target type";
  }, [targetForm.metric_kind, selectedRoleTargetKindOverrideMap, selectedCustomKind]);

  const openMetricManager = (mode: "create" | "edit", role: any, metric?: any, targetKindId?: string | null) => {
    setMetricEditor({
      mode,
      id: metric?.id,
      role_id: role.id,
      metric_name: metric?.metric_name ?? "",
      unit: metric?.unit ?? "count",
      default_target: String(metric?.default_target ?? "0"),
      points_per_unit: String(metric?.points_per_unit ?? "1"),
      weight: String(metric?.weight ?? "1"),
      target_kind_id: metric?.target_kind_id ?? targetKindId ?? null,
    });
  };

  useEffect(() => {
    if (!visibleDefaultTargetKinds.length) return;
    if (!allowedTargetKinds.includes(targetForm.metric_kind) || selectedRoleTargetKindOverrideMap[targetForm.metric_kind as "treatment" | "revenue" | "kpi"]?.is_hidden) {
      setEditingTargetId(null);
      setTargetForm((prev) => ({ ...prev, metric_kind: visibleDefaultTargetKinds[0], metric_name: "" }));
    }
  }, [allowedTargetKinds, visibleDefaultTargetKinds, selectedRoleTargetKindOverrideMap, targetForm.metric_kind]);

  // Employee dropdown for Set Target — sourced live from Settings → Staff
  // (profiles + user_roles), the same source as the role-page staff lists.
  // A staff member belongs to the selected ops role if ANY of their assigned
  // staff roles maps to it, regardless of how their employees row's
  // department/designation happened to be synced.
  const dlgEmployees = useMemo(() => {
    const role = dlgRole !== "all"
      ? deptRoles.find((r: any) => r.id === dlgRole || r.role_name === dlgRole)
      : null;
    const allowedStaffRoles = role ? staffRolesForOpsRole(role) : [];

    const empByUserId = new Map<string, any>();
    employees.forEach((e: any) => { if (e.user_id) empByUserId.set(e.user_id, e); });

    // Staff deactivated in Settings → Staff must never appear, even if their
    // employees row is still active or they hold multiple role assignments.
    const inactiveUserIds = new Set<string>(
      staffProfiles.filter((p: any) => p.active === false).map((p: any) => p.id),
    );

    const matched = new Map<string, any>();

    // 1) Live role match from Settings staff assignments.
    if (role && allowedStaffRoles.length) {
      staffProfiles.forEach((p: any) => {
        if (p.active === false) return; // only active Settings staff
        const userRoleSet = rolesByUserId[p.id];
        if (!userRoleSet || !allowedStaffRoles.some((r) => userRoleSet.has(r))) return;
        const emp = empByUserId.get(p.id);
        if (emp) matched.set(emp.id, emp);
      });
    }

    // 2) Department-scoped fallback for manual rows / staff without roles.
    employees.forEach((e: any) => {
      if (matched.has(e.id)) return;
      if (e.user_id && inactiveUserIds.has(e.user_id)) return;
      if (e.department !== dlgDept) return;
      if (role && !employeeMatchesDesignation(e, role.role_name)) return;
      matched.set(e.id, e);
    });

    return Array.from(matched.values());
  }, [employees, dlgDept, dlgRole, deptRoles, rolesByUserId, staffProfiles]);

  const dlgMetrics = useMemo(() => {
    const rolesInScope = dlgRole !== "all"
      ? deptRoles.filter((r: any) => r.id === dlgRole)
      : dlgDeptRoles;
    const seen = new Set<string>();
    const list: any[] = [];
    roleMetrics.forEach((m: any) => {
      if (rolesInScope.some((r: any) => r.id === m.role_id) && !seen.has(m.metric_name)) {
        seen.add(m.metric_name);
        list.push(m);
      }
    });
    return list;
  }, [roleMetrics, deptRoles, dlgDeptRoles, dlgRole]);

  const autoPointsByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    perfLogs.forEach((log: any) => {
      if (log.log_date < periodStart || log.log_date > periodEnd) return;
      const emp = employees.find((e: any) => e.id === log.employee_id);
      if (!emp) return;
      const role = deptRoles.find((r: any) => r.role_name === emp.designation);
      if (!role) return;
      const m = roleMetrics.find((m: any) => m.role_id === role.id && m.metric_name === log.metric_name);
      const ppu = m ? Number(m.points_per_unit) : 1;
      const weight = m ? Number(m.weight) : 1;
      const pts = Number(log.value) * ppu * weight;
      map[log.employee_id] = (map[log.employee_id] || 0) + pts;
    });
    return map;
  }, [perfLogs, employees, deptRoles, roleMetrics, periodStart, periodEnd]);

  const manualPointsByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    pointsLogs.forEach((p: any) => { map[p.employee_id] = (map[p.employee_id] || 0) + Number(p.points); });
    return map;
  }, [pointsLogs]);

  // Build leaderboard from a given employee list
  const buildLeaderboard = (empList: any[]) =>
    empList
      .map((e: any) => {
        const auto = autoPointsByEmp[e.id] || 0;
        const manual = manualPointsByEmp[e.id] || 0;
        const role = deptRoles.find((r: any) => r.role_name === e.designation);
        return {
          id: e.id,
          name: `${e.first_name} ${e.last_name}`,
          role: role?.display_label || e.designation || "—",
          department: e.department,
          autoPoints: Math.round(auto),
          manualPoints: Math.round(manual),
          totalPoints: Math.round(auto + manual),
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

  const leaderboard = useMemo(() => buildLeaderboard(filteredEmployees), [filteredEmployees, autoPointsByEmp, manualPointsByEmp, deptRoles]);

  // Role-wide leaderboard (ignores lockedEmployeeId) so doctors can still
  // see the overall ranking among peers in their role.
  const roleWideEmployees = useMemo(() => {
    if (!roleHashMap[location.hash.replace("#", "")]) return [] as any[];
    const { dept, role } = roleHashMap[location.hash.replace("#", "")];
    return employees.filter((e: any) => employeeMatchesDesignation(e, role));
  }, [employees, location.hash, rolesByUserId]);
  const roleWideLeaderboard = useMemo(
    () => buildLeaderboard(roleWideEmployees),
    [roleWideEmployees, autoPointsByEmp, manualPointsByEmp, deptRoles]
  );

  const filteredTargets = useMemo(() => {
    let list = syncedTargets;
    if (activeDept !== "all") list = list.filter((t: any) => t.department === activeDept);
    if (activeRole !== "all") {
      const role = deptRoles.find((r: any) => r.id === activeRole || r.role_name === activeRole);
      if (role) list = list.filter((t: any) => t.role === role.role_name);
    }
    if (lockedEmployeeId) {
      list = list.filter((t: any) => t.employee_id === lockedEmployeeId);
    }
    return list;
  }, [syncedTargets, activeDept, activeRole, deptRoles, lockedEmployeeId]);

  const addPoints = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("performance_points").insert({
        employee_id: pointsForm.employee_id,
        points: Number(pointsForm.points),
        reason: pointsForm.reason || null,
        source: "manual",
        period_date: format(new Date(), "yyyy-MM-dd"),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Points adjusted"); queryClient.invalidateQueries({ queryKey: ["ops-points"] }); setShowAddPoints(false); setPointsForm({ employee_id: "", points: "", reason: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setEmployeeTarget = useMutation({
    mutationFn: async () => {
      const emp = employees.find((e: any) => e.id === targetForm.employee_id);
      if (!emp) throw new Error("Select an employee");
      const metricName = targetForm.metric_kind === "revenue" ? "Revenue" : targetForm.metric_name;
      if (!metricName) throw new Error("Select a treatment");
      const value = Number(targetForm.target_value);
      if (!value || value <= 0) throw new Error("Enter target value");
      const now = new Date();
      let from: Date, to: Date;
      if (targetForm.period === "daily") { from = startOfDay(now); to = endOfDay(now); }
      else if (targetForm.period === "weekly") { from = startOfWeek(now, { weekStartsOn: 1 }); to = endOfWeek(now, { weekStartsOn: 1 }); }
      else { from = startOfMonth(now); to = endOfMonth(now); }
      const role = deptRoles.find((r: any) => r.role_name === emp.designation);
      const { error } = await supabase.from("employee_targets").insert({
        employee_id: emp.id,
        department: emp.department || "clinic",
        role: emp.designation || (role?.role_name ?? "doctor"),
        metric_name: metricName,
        target_type: targetForm.period,
        target_value: value,
        unit: targetForm.metric_kind === "revenue" ? "inr" : "count",
        points_per_unit: Number(targetForm.points_per_unit) || 1,
        period_start: format(from, "yyyy-MM-dd"),
        period_end: format(to, "yyyy-MM-dd"),
        status: "in_progress",
        achieved_value: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target set");
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
      setShowSetTarget(false);
      setTargetForm({ employee_id: "", period: "monthly", metric_kind: "treatment", metric_name: "", target_value: "", points_per_unit: "1", custom_kind_id: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

  const updateEmployeeTarget = useMutation({
    mutationFn: async () => {
      if (!editingTargetId) throw new Error("No target selected");
      const value = Number(targetForm.target_value);
      if (!value || value <= 0) throw new Error("Enter target value");
      const metricName = targetForm.metric_kind === "revenue" ? "Revenue" : targetForm.metric_name;
      if (!metricName) throw new Error("Select a metric");
      const { error } = await supabase.from("employee_targets").update({
        metric_name: metricName,
        target_type: targetForm.period,
        target_value: value,
        unit: targetForm.metric_kind === "revenue" ? "inr" : "count",
        points_per_unit: Number(targetForm.points_per_unit) || 1,
      }).eq("id", editingTargetId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target updated");
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
      setEditingTargetId(null);
      setTargetForm({ employee_id: "", period: "monthly", metric_kind: "treatment", metric_name: "", target_value: "", points_per_unit: "1", custom_kind_id: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteEmployeeTarget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target deleted");
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Edit Achieved (manual override)
  const [editAchieved, setEditAchieved] = useState<{
    id: string;
    metric_name: string;
    value: string;
    isOverride: boolean;
    visibleDays: number;
    totalDays: number;
    visibleFrom: string;
    visibleTo: string;
    dailyDate: string;
  } | null>(null);

  const { data: editAchievedDayLogs = [] } = useQuery<any[]>({
    queryKey: ["ops-edit-achieved-day-logs", editAchieved?.id, editAchieved?.visibleFrom, editAchieved?.visibleTo],
    enabled: !!editAchieved?.id,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("employee_target_achievement_logs")
        .select("achieved_date, achieved_value")
        .eq("target_id", editAchieved!.id)
        .gte("achieved_date", editAchieved!.visibleFrom)
        .lte("achieved_date", editAchieved!.visibleTo)
        .order("achieved_date", { ascending: false });
      return (data as any[]) || [];
    },
  });

  // View-only Achieved breakdown dialog
  const [viewBreakdown, setViewBreakdown] = useState<{
    targetId: string;
    metric_name: string;
    unit: string;
    visibleFrom: string;
    visibleTo: string;
    isRevenue: boolean;
  } | null>(null);

  const updateAchievedMutation = useMutation({
    mutationFn: async (params: { id: string; value: number | null; visibleFrom?: string; visibleTo?: string; dailyDate?: string }) => {
      const target = syncedTargets.find((row: any) => row.id === params.id);
      if (!target) throw new Error("Target not found");

      const isClear = params.value === null;

      // DAILY ENTRY MODE: write/replace the value for a single date only.
      // Total achieved becomes the SUM of all daily entries — never split a total across days.
      if (!isClear && params.dailyDate) {
        const dateStr = params.dailyDate;
        const { error: delErr } = await (supabase.from as any)("employee_target_achievement_logs")
          .delete()
          .eq("target_id", params.id)
          .eq("achieved_date", dateStr);
        if (delErr) throw delErr;

        const v = Number(params.value || 0);
        if (v > 0) {
          const { error: insErr } = await (supabase.from as any)("employee_target_achievement_logs").insert([{
            target_id: params.id,
            employee_id: target.employee_id,
            metric_name: target.metric_name,
            achieved_date: dateStr,
            achieved_value: v,
          }]);
          if (insErr) throw insErr;
        }

        const { data: allLogs, error: fetchAllError } = await (supabase.from as any)("employee_target_achievement_logs")
          .select("achieved_value")
          .eq("target_id", params.id);
        if (fetchAllError) throw fetchAllError;
        const totalManual = Number(((allLogs || []).reduce((s: number, r: any) => s + Number(r.achieved_value || 0), 0)).toFixed(2));
        const { error: tErr } = await supabase
          .from("employee_targets")
          .update({ manual_override: true, manual_achieved: totalManual })
          .eq("id", params.id);
        if (tErr) throw tErr;
        return;
      }

      const enumerateDates = (from: string, to: string) => {
        const dates: string[] = [];
        let cursor = startOfDay(new Date(from));
        const end = startOfDay(new Date(to));
        while (cursor <= end) {
          dates.push(format(cursor, "yyyy-MM-dd"));
          cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        }
        return dates;
      };

      const splitTotalAcrossDates = (total: number, dates: string[], existingMap: Map<string, number>) => {
        if (dates.length === 0) return [] as { achieved_date: string; achieved_value: number }[];
        const roundedTotal = Math.max(0, Math.round(total * 100));
        const weighted = dates.map((date) => ({ date, value: Math.max(0, Math.round((existingMap.get(date) || 0) * 100)) }));
        const existingSum = weighted.reduce((sum, item) => sum + item.value, 0);

        if (existingSum > 0) {
          const scaled = weighted.map((item) => ({
            date: item.date,
            raw: (item.value / existingSum) * roundedTotal,
          }));
          const base = scaled.map((item) => ({ date: item.date, cents: Math.floor(item.raw), remainder: item.raw - Math.floor(item.raw) }));
          let remaining = roundedTotal - base.reduce((sum, item) => sum + item.cents, 0);
          base
            .sort((a, b) => b.remainder - a.remainder)
            .forEach((item) => {
              if (remaining > 0) {
                item.cents += 1;
                remaining -= 1;
              }
            });
          return base.map((item) => ({ achieved_date: item.date, achieved_value: Number((item.cents / 100).toFixed(2)) }));
        }

        const base = Math.floor(roundedTotal / dates.length);
        let remaining = roundedTotal - base * dates.length;
        return dates.map((date) => {
          const cents = base + (remaining > 0 ? 1 : 0);
          if (remaining > 0) remaining -= 1;
          return { achieved_date: date, achieved_value: Number((cents / 100).toFixed(2)) };
        });
      };

      if (isClear) {
        const { error: deleteError } = await (supabase.from as any)("employee_target_achievement_logs")
          .delete()
          .eq("target_id", params.id);
        if (deleteError) throw deleteError;

        const { error: targetError } = await supabase
          .from("employee_targets")
          .update({ manual_override: false, manual_achieved: null })
          .eq("id", params.id);
        if (targetError) throw targetError;
        return;
      }

      const visibleFrom = params.visibleFrom || target.period_start;
      const visibleTo = params.visibleTo || target.period_end;
      const visibleDates = enumerateDates(visibleFrom, visibleTo);

      const { data: existingVisibleLogs, error: fetchVisibleError } = await (supabase.from as any)("employee_target_achievement_logs")
        .select("achieved_date, achieved_value")
        .eq("target_id", params.id)
        .gte("achieved_date", visibleFrom)
        .lte("achieved_date", visibleTo);
      if (fetchVisibleError) throw fetchVisibleError;

      const existingMap = new Map<string, number>((existingVisibleLogs || []).map((row: any) => [row.achieved_date, Number(row.achieved_value || 0)]));
      const rows = splitTotalAcrossDates(Number(params.value || 0), visibleDates, existingMap)
        .filter((row) => row.achieved_value !== 0)
        .map((row) => ({
          target_id: params.id,
          employee_id: target.employee_id,
          metric_name: target.metric_name,
          achieved_date: row.achieved_date,
          achieved_value: row.achieved_value,
        }));

      const { error: clearVisibleError } = await (supabase.from as any)("employee_target_achievement_logs")
        .delete()
        .eq("target_id", params.id)
        .gte("achieved_date", visibleFrom)
        .lte("achieved_date", visibleTo);
      if (clearVisibleError) throw clearVisibleError;

      if (rows.length > 0) {
        const { error: insertError } = await (supabase.from as any)("employee_target_achievement_logs").insert(rows);
        if (insertError) throw insertError;
      }

      const { data: allLogs, error: fetchAllError } = await (supabase.from as any)("employee_target_achievement_logs")
        .select("achieved_value")
        .eq("target_id", params.id);
      if (fetchAllError) throw fetchAllError;

      const totalManual = Number(((allLogs || []).reduce((sum: number, row: any) => sum + Number(row.achieved_value || 0), 0)).toFixed(2));
      const { error: targetError } = await supabase
        .from("employee_targets")
        .update({ manual_override: true, manual_achieved: totalManual })
        .eq("id", params.id);
      if (targetError) throw targetError;
    },
    onSuccess: () => {
      toast.success("Achieved value updated");
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
      queryClient.invalidateQueries({ queryKey: ["ops-target-achievement-logs"] });
      setEditAchieved(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Bulk add suggested KPI presets for an employee's role
  const addSuggestedKpis = useMutation({
    mutationFn: async (employee: any) => {
      const roleKey = (employee.designation || "").toLowerCase();
      const presets = ROLE_KPI_PRESETS[roleKey] || [];
      if (presets.length === 0) throw new Error("No suggestions available for this role");
      const now = new Date();
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      const existing = new Set(
        (syncedTargets || [])
          .filter((t: any) => t.employee_id === employee.id && t.period_start === format(from, "yyyy-MM-dd"))
          .map((t: any) => (t.metric_name || "").toLowerCase().trim())
      );
      const rows = presets
        .filter((name) => !existing.has(name.toLowerCase().trim()))
        .map((name) => ({
          employee_id: employee.id,
          department: employee.department || "clinic",
          role: employee.designation || "staff",
          metric_name: name,
          target_type: "monthly",
          target_value: 100,
          unit: "count",
          points_per_unit: 1,
          period_start: format(from, "yyyy-MM-dd"),
          period_end: format(to, "yyyy-MM-dd"),
          status: "in_progress",
          achieved_value: 0,
        }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("employee_targets").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count: any) => {
      if (count === 0) toast.info("All suggested KPIs already added");
      else toast.success(`Added ${count} suggested KPI${count !== 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addRole = useMutation({
    mutationFn: async () => {
      if (activeDept === "all") throw new Error("Select a specific department first");
      const role_name = newRole.role_name.toLowerCase().replace(/\s+/g, "_");
      const { error } = await (supabase.from as any)("department_roles").insert({
        department: activeDept,
        role_name,
        display_label: newRole.display_label || newRole.role_name,
        sort_order: deptRoles.filter((r: any) => r.department === activeDept).length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role added"); queryClient.invalidateQueries({ queryKey: ["ops-dept-roles"] }); setShowAddRole(false); setNewRole({ role_name: "", display_label: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const addMetric = useMutation({
    mutationFn: async () => {
      if (!showAddMetric) throw new Error("No role selected");
      const { error } = await (supabase.from as any)("role_metrics").insert({
        role_id: showAddMetric,
        metric_name: newMetric.metric_name,
        unit: newMetric.unit,
        default_target: Number(newMetric.default_target),
        points_per_unit: Number(newMetric.points_per_unit),
        weight: Number(newMetric.weight),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Metric added"); queryClient.invalidateQueries({ queryKey: ["ops-role-metrics"] }); setShowAddMetric(null); setNewMetric({ metric_name: "", unit: "count", default_target: "0", points_per_unit: "1", weight: "1" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMetric = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase.from as any)("role_metrics").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Metric removed"); queryClient.invalidateQueries({ queryKey: ["ops-role-metrics"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMetric = useMutation({
    mutationFn: async () => {
      if (!metricEditor?.id) throw new Error("Missing metric id");
      // Capture old metric_name + role to cascade renames into existing employee_targets
      const oldRow = roleMetrics.find((m: any) => m.id === metricEditor.id);
      const oldName: string | undefined = oldRow?.metric_name;
      const newName = metricEditor.metric_name;
      const newPpu = Number(metricEditor.points_per_unit);
      const newMonthlyTarget = Number(metricEditor.default_target);
      const { error } = await (supabase.from as any)("role_metrics").update({
        metric_name: newName,
        unit: metricEditor.unit,
        default_target: newMonthlyTarget,
        points_per_unit: newPpu,
        weight: Number(metricEditor.weight),
        target_kind_id: metricEditor.target_kind_id ?? null,
      }).eq("id", metricEditor.id);
      if (error) throw error;

      // Find affected employees for this role and cascade to existing employee_targets
      const role = deptRoles.find((r: any) => r.id === metricEditor.role_id);
      if (oldName && role) {
        const oldMetricName = oldName.trim();
        const empIds = (employees as any[])
          .filter((e: any) => employeeMatchesDesignation(e, role.role_name))
          .map((e: any) => e.id);
        if (empIds.length && oldMetricName) {
          // Update each existing target row, scaling target_value to its target_type
          const { data: rows } = await (supabase.from as any)("employee_targets")
            .select("id, target_type")
            .in("employee_id", empIds)
            .ilike("metric_name", oldMetricName);
          for (const r of (rows || []) as any[]) {
            const scaled = r.target_type === "daily" ? Math.round(newMonthlyTarget / 30)
              : r.target_type === "weekly" ? Math.round(newMonthlyTarget / 4)
              : Math.round(newMonthlyTarget);
            await (supabase.from as any)("employee_targets").update({
              metric_name: newName,
              points_per_unit: newPpu,
              target_value: scaled,
            }).eq("id", r.id);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Metric updated — synced to targets");
      queryClient.invalidateQueries({ queryKey: ["ops-role-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });
      setMetricEditor(null);
    },
    onError: (e: any) => toast.error(e.message),
  });


  // Inline quick-edit of target & points-per-unit directly inside the metric dropdown.
  // Stored value is canonical MONTHLY in role_metrics.default_target.
  // When applied to outer form, scaled by current period (daily=1/30, weekly=1/4, monthly=1).
  const [inlineMetricEdit, setInlineMetricEdit] = useState<Record<string, { target: string; ppu: string }>>({});
  const periodScale = (p: string) => p === "daily" ? 1/30 : p === "weekly" ? 1/4 : 1;
  const scaleToPeriod = (monthlyVal: number, period: string) => Math.round(monthlyVal * periodScale(period));
  const scaleToMonthly = (val: number, period: string) => Math.round(val / periodScale(period));
  const getMetricFormValues = (metricName: string, sourcePeriod: string, outputPeriod = sourcePeriod) => {
    if (!metricName || metricName === "__custom__") return null;
    const managed = selectedRoleMetrics.find((m: any) => m.metric_name === metricName);
    const draftKey = managed?.id || `new:${metricName}`;
    const draft = inlineMetricEdit[draftKey];

    if (draft) {
      const monthlyTarget = scaleToMonthly(Number(draft.target) || 0, sourcePeriod);
      return {
        target_value: String(scaleToPeriod(monthlyTarget, outputPeriod)),
        points_per_unit: String(draft.ppu || managed?.points_per_unit || 1),
      };
    }

    if (managed) {
      return {
        target_value: String(scaleToPeriod(Number(managed.default_target || 0), outputPeriod)),
        points_per_unit: String(managed.points_per_unit ?? 1),
      };
    }

    return null;
  };

  const quickUpsertMetric = useMutation({
    mutationFn: async (p: { existingId?: string; role_id: string; metric_name: string; unit: string; default_target: number; points_per_unit: number; target_kind_id?: string | null }) => {
      if (p.existingId) {
        const { error } = await (supabase.from as any)("role_metrics").update({
          default_target: p.default_target,
          points_per_unit: p.points_per_unit,
          target_kind_id: p.target_kind_id ?? null,
        }).eq("id", p.existingId);
        if (error) throw error;
        // Cascade target_value + points_per_unit into existing employee_targets for this role + metric
        const role = deptRoles.find((r: any) => r.id === p.role_id);
        if (role) {
          const empIds = (employees as any[])
            .filter((e: any) => employeeMatchesDesignation(e, role.role_name))
            .map((e: any) => e.id);
          if (empIds.length) {
            const { data: rows } = await (supabase.from as any)("employee_targets")
              .select("id, target_type")
              .in("employee_id", empIds)
              .eq("metric_name", p.metric_name);
            for (const r of (rows || []) as any[]) {
              const scaled = r.target_type === "daily" ? Math.round(p.default_target / 30)
                : r.target_type === "weekly" ? Math.round(p.default_target / 4)
                : Math.round(p.default_target);
              await (supabase.from as any)("employee_targets").update({
                points_per_unit: p.points_per_unit,
                target_value: scaled,
              }).eq("id", r.id);
            }
          }
        }
      } else {
        const { error } = await (supabase.from as any)("role_metrics").insert({
          role_id: p.role_id,
          metric_name: p.metric_name,
          unit: p.unit,
          default_target: p.default_target,
          points_per_unit: p.points_per_unit,
          weight: 1,
          target_kind_id: p.target_kind_id ?? null,
        });
        if (error) throw error;
      }
      return p;

    },
    onSuccess: (p) => {
      toast.success("Saved — synced to targets");
      queryClient.invalidateQueries({ queryKey: ["ops-role-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["ops-targets"] });

      setTargetForm((prev) => ({
        ...prev,
        metric_name: p.metric_name,
        target_value: String(scaleToPeriod(p.default_target, prev.period)),
        points_per_unit: String(p.points_per_unit),
      }));
      const key = p.existingId || `new:${p.metric_name}`;
      setInlineMetricEdit((prev) => { const n = { ...prev }; delete n[key]; return n; });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upsertMetricFromEditor = useMutation({
    mutationFn: async () => {
      if (!metricEditor) throw new Error("No editor");
      const payload = {
        role_id: metricEditor.role_id,
        metric_name: metricEditor.metric_name,
        unit: metricEditor.unit,
        default_target: Number(metricEditor.default_target),
        points_per_unit: Number(metricEditor.points_per_unit),
        weight: Number(metricEditor.weight),
        target_kind_id: metricEditor.target_kind_id ?? null,
      };
      const { error } = await (supabase.from as any)("role_metrics").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Metric added"); queryClient.invalidateQueries({ queryKey: ["ops-role-metrics"] }); setMetricEditor(null); },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- Custom Target Kinds (Target Type categories) per role ----
  const upsertTargetKind = useMutation({
    mutationFn: async (payload: { id?: string; role_id: string; kind_label: string; base_kind: string }) => {
      if (payload.id) {
        const { error } = await (supabase.from as any)("role_target_kinds")
          .update({ kind_label: payload.kind_label, base_kind: payload.base_kind })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("role_target_kinds")
          .insert({ role_id: payload.role_id, kind_label: payload.kind_label, base_kind: payload.base_kind });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Target type saved"); queryClient.invalidateQueries({ queryKey: ["ops-role-target-kinds"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTargetKind = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase.from as any)("role_target_kinds").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Target type removed"); queryClient.invalidateQueries({ queryKey: ["ops-role-target-kinds"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const upsertDefaultTargetKindOverride = useMutation({
    mutationFn: async (payload: { role_id: string; base_kind: "treatment" | "revenue" | "kpi"; kind_label: string; is_hidden?: boolean }) => {
      const existing = roleTargetKindOverrides.find((item: any) => item.role_id === payload.role_id && item.base_kind === payload.base_kind);
      if (existing) {
        const { error } = await (supabase.from as any)("role_target_kind_overrides")
          .update({ kind_label: payload.kind_label, is_hidden: payload.is_hidden ?? false })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase.from as any)("role_target_kind_overrides")
        .insert({ role_id: payload.role_id, base_kind: payload.base_kind, kind_label: payload.kind_label, is_hidden: payload.is_hidden ?? false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target type saved");
      queryClient.invalidateQueries({ queryKey: ["ops-role-target-kind-overrides"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDefaultTargetKindOverride = useMutation({
    mutationFn: async (payload: { role_id: string; base_kind: "treatment" | "revenue" | "kpi" }) => {
      const existing = roleTargetKindOverrides.find((item: any) => item.role_id === payload.role_id && item.base_kind === payload.base_kind);
      if (existing) {
        const { error } = await (supabase.from as any)("role_target_kind_overrides")
          .update({ kind_label: existing.kind_label || DEFAULT_TARGET_KIND_LABELS[payload.base_kind], is_hidden: true })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase.from as any)("role_target_kind_overrides")
        .insert({ role_id: payload.role_id, base_kind: payload.base_kind, kind_label: DEFAULT_TARGET_KIND_LABELS[payload.base_kind], is_hidden: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target type removed");
      queryClient.invalidateQueries({ queryKey: ["ops-role-target-kind-overrides"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hidePreset = useMutation({
    mutationFn: async (payload: { role_id: string; preset_name: string; preset_kind: string }) => {
      const { error } = await (supabase.from as any)("role_hidden_presets").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed from list"); queryClient.invalidateQueries({ queryKey: ["ops-role-hidden-presets"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const unhidePreset = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase.from as any)("role_hidden_presets").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ops-role-hidden-presets"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Restrict KPI status counts to targets that overlap the selected date range
  const periodScopedTargets = useMemo(
    () => filteredTargets.filter((t: any) => !(t.period_end < periodStart || t.period_start > periodEnd)),
    [filteredTargets, periodStart, periodEnd]
  );
  // NOTE: statusCounts and totalPointsInScope are now derived from computedSummaryByTarget
  // (defined after lockedKpiBreakdown) so they reflect live, date-filtered achievements
  // instead of the stale `status` column on employee_targets. See below.
  // For role-locked sub-modules, the leaderboard panel always shows the
  // full role-wide ranking so doctors can see where they stand among peers.
  const displayLeaderboard = roleHashMap[location.hash.replace("#", "")] ? roleWideLeaderboard : leaderboard;
  const myEmpId = currentUserEmployee?.id;

  // When the user came in via a role deep-link (e.g. #clinic-doctor),
  // lock the view to that role only — hide dept selector and role buttons.
  const roleLocked = !!roleHashMap[currentHash];
  const lockedRoleLabel = roleLocked
    ? deptRoles.find((r: any) => r.role_name === roleHashMap[currentHash].role)?.display_label
    : null;

  // Pool of employees that match the locked role (used for admin's dropdown)
  const lockedRolePool = useMemo(() => {
    if (!roleLocked) return [] as any[];
    const { dept, role } = roleHashMap[currentHash];
    return employees.filter((e: any) => employeeMatchesDesignation(e, role));
  }, [roleLocked, currentHash, employees, rolesByUserId]);

  // Admin: when entering a role-locked view, if "self" doesn't map to an employee
  // in this role's pool, auto-select the first employee so the panel isn't empty.
  useEffect(() => {
    if (!roleLocked || !isAdmin) return;
    if (lockedRolePool.length === 0) return;
    if (selectedEmployeeId === "self") {
      const selfInPool = currentUserEmployee && lockedRolePool.some((e: any) => e.id === currentUserEmployee.id);
      if (!selfInPool) setSelectedEmployeeId(lockedRolePool[0].id);
    } else if (!lockedRolePool.some((e: any) => e.id === selectedEmployeeId)) {
      setSelectedEmployeeId(lockedRolePool[0].id);
    }
  }, [roleLocked, isAdmin, currentHash, lockedRolePool, currentUserEmployee, selectedEmployeeId]);

  const lockedEmpName = lockedEmployeeId && lockedEmployeeId !== "__none__"
    ? getEmpName(lockedEmployeeId)
    : null;
  const lockedEmployee = lockedEmployeeId && lockedEmployeeId !== "__none__"
    ? employees.find((e: any) => e.id === lockedEmployeeId)
    : null;
  const lockedEmpDesignation = lockedEmployee
    ? (deptRoles.find((r: any) => r.role_name === lockedEmployee.designation)?.display_label
        || lockedEmployee.designation?.replace(/_/g, " ")
        || lockedRoleLabel)
    : null;

  // Determine the "focused" employee for the detailed KPI breakdown.
  // 1) Role-locked sub-module (doctor login) → that employee.
  // 2) All Clinic > Role > specific employee picked → that employee.
  const focusedEmployee = useMemo(() => {
    if (roleLocked && lockedEmployee) return lockedEmployee;
    if (!roleLocked && activeRole !== "all" && activeEmployeeId !== "all") {
      return employees.find((e: any) => e.id === activeEmployeeId) || null;
    }
    return null;
  }, [roleLocked, lockedEmployee, activeRole, activeEmployeeId, employees]);

  const focusedDesignation = focusedEmployee
    ? (deptRoles.find((r: any) => r.role_name === focusedEmployee.designation)?.display_label
        || focusedEmployee.designation?.replace(/_/g, " "))
    : null;

  // ---- Live staff directory (Settings → Staff: profiles + user_roles) -----
  const staffDirectory = useMemo(
    () =>
      staffProfiles
        .filter((p: any) => p.active !== false)
        .map((p: any) => ({
        id: p.id,
        full_name: (p.full_name || "Unknown").trim(),
        email: staffContactMap[p.id]?.email || "",
        phone: staffContactMap[p.id]?.phone || "",
        roles: rolesByUserId[p.id] ? Array.from(rolesByUserId[p.id]) as string[] : [],
      })),
    [staffProfiles, staffContactMap, rolesByUserId],
  );

  // The ops role currently in focus (locked sub-page or selected role chip).
  const activeOpsRole = useMemo(() => {
    if (roleLocked) {
      return deptRoles.find((r: any) => r.role_name === roleHashMap[currentHash]?.role) || null;
    }
    if (activeRole !== "all") {
      return deptRoles.find((r: any) => r.id === activeRole || r.role_name === activeRole) || null;
    }
    return null;
  }, [roleLocked, currentHash, activeRole, deptRoles]);

  // Actual Settings staff assigned to the focused role.
  const roleStaffList = useMemo(() => {
    if (!activeOpsRole) return [] as any[];
    const allowed = staffRolesForOpsRole(activeOpsRole);
    if (!allowed.length) return [] as any[];
    return staffDirectory
      .filter((s) => s.roles.some((r) => allowed.includes(r)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [activeOpsRole, staffDirectory]);

  // Per-role assigned staff counts (drives the role chip counters).
  const staffCountByRoleId = useMemo(() => {
    const m: Record<string, number> = {};
    deptRoles.forEach((r: any) => {
      const allowed = staffRolesForOpsRole(r);
      m[r.id] = allowed.length
        ? staffDirectory.filter((s) => s.roles.some((x) => allowed.includes(x))).length
        : 0;
    });
    return m;
  }, [deptRoles, staffDirectory]);

  // Helper: does this employee match the doctor name on a record?
  const matchesEmployee = (doctorStr: string | null | undefined, emp: any) => {
    if (!doctorStr || !emp) return false;
    const d = doctorStr.toLowerCase().trim().replace(/^dr\.?\s*/i, "");
    const full = `${emp.first_name} ${emp.last_name}`.toLowerCase().trim();
    const first = (emp.first_name || "").toLowerCase().trim();
    return d === full || d === first;
  };

  // Build per-metric KPI breakdown — driven by the targets the user actually set
  // for this employee in the current period. Achieved is computed live from
  // completed treatments and billings.
  const lockedKpiBreakdown = useMemo(() => {
    if (!focusedEmployee) return [] as any[];
    const empTargets = syncedTargets.filter((t: any) =>
      t.employee_id === focusedEmployee.id &&
      // Target must overlap the selected dashboard window
      !(t.period_end < periodStart || t.period_start > periodEnd)
    );
    return empTargets.map((t: any) => {
      const isRevenue = (t.unit === "inr") || (t.metric_name?.toLowerCase() === "revenue");
      const targetLogs = targetAchievementLogs.filter((log: any) => log.target_id === t.id);
      const hasLoggedManualValues = targetLogs.length > 0;
      const manualOverride = !!t.manual_override || hasLoggedManualValues;

      // Achievements are now computed within the dashboard window
      // (intersected with the target's own validity range).
      const achStart = t.period_start > periodStart ? t.period_start : periodStart;
      const achEnd = t.period_end < periodEnd ? t.period_end : periodEnd;
      const totalTargetDays = Math.max(1, differenceInDays(new Date(t.period_end), new Date(t.period_start)) + 1);
      const visibleDays = Math.max(1, differenceInDays(new Date(achEnd), new Date(achStart)) + 1);

      let achieved = 0;
      if (manualOverride) {
        if (hasLoggedManualValues) {
          achieved = targetLogs.reduce((sum: number, log: any) => {
            if (log.achieved_date < achStart || log.achieved_date > achEnd) return sum;
            return sum + Number(log.achieved_value || 0);
          }, 0);
        } else {
          achieved = Math.round((Number(t.manual_achieved || 0) / totalTargetDays) * visibleDays);
        }
      } else if (isRevenue) {
        achieved = billingsData.reduce((sum: number, b: any) => {
          const created = (b.created_at || "").slice(0, 10);
          if (created < achStart || created > achEnd) return sum;
          const doctor = b.treatment_plans?.doctor;
          if (!matchesEmployee(doctor, focusedEmployee)) return sum;
          return sum + Number(b.total_amount || 0);
        }, 0);
      } else {
        const targetName = (t.metric_name || "").toLowerCase().trim();
        achieved = completedTreatments.reduce((cnt: number, item: any) => {
          const completed = (item.completed_at || "").slice(0, 10);
          if (!completed || completed < achStart || completed > achEnd) return cnt;
          const doctor = item.doctor || item.treatment_plans?.doctor;
          if (!matchesEmployee(doctor, focusedEmployee)) return cnt;
          if ((item.treatment_type || "").toLowerCase().trim() !== targetName) return cnt;
          return cnt + 1;
        }, 0);
      }

      // Scale the stored target value to the dashboard window length.
      const perDayTarget = Number(t.target_value || 0) / totalTargetDays;
      const scaledTargetRaw = perDayTarget * visibleDays;
      // Counts are integers; revenue stays numeric (rounded).
      const target = isRevenue
        ? Math.round(scaledTargetRaw)
        : Math.max(0, Math.round(scaledTargetRaw));

      const remaining = Math.max(target - achieved, 0);
      const ppu = Number(t.points_per_unit || 1);
      const points = isRevenue
        ? Math.round((achieved / 1000) * ppu)
        : Math.round(achieved * ppu);
      const progress = target > 0 ? Math.min(Math.round((achieved / target) * 100), 100) : 0;
      const status = target > 0 && achieved >= target
        ? (achieved > target ? "exceeded" : "achieved")
        : achieved > 0 ? "in_progress" : "pending";
      return {
        targetId: t.id,
        manualOverride,
        metric_name: t.metric_name,
        unit: t.unit,
        target,
        achieved: isRevenue ? Math.round(achieved) : achieved,
        remaining: isRevenue ? Math.round(remaining) : remaining,
        points,
        progress,
        status,
        visibleDays,
        totalDays: totalTargetDays,
        visibleFrom: achStart,
        visibleTo: achEnd,
        // Display the dashboard window granularity, not the stored target's period
        period: visibleDays === 1 ? "daily" : visibleDays <= 7 ? "weekly" : visibleDays <= 31 ? "monthly" : "custom",
      };
    });
  }, [focusedEmployee, syncedTargets, targetAchievementLogs, billingsData, completedTreatments, periodStart, periodEnd]);

  // Apply the user-defined drag-to-reorder ordering for the focused employee.
  // Unknown/new targets are appended in their original order.
  const orderedKpiBreakdown = useMemo(() => {
    if (!focusedEmployee) return lockedKpiBreakdown;
    const order = kpiOrderMap[focusedEmployee.id] || [];
    if (order.length === 0) return lockedKpiBreakdown;
    const byId = new Map(lockedKpiBreakdown.map((k: any) => [k.targetId, k]));
    const out: any[] = [];
    order.forEach((id) => {
      if (byId.has(id)) { out.push(byId.get(id)); byId.delete(id); }
    });
    byId.forEach((v) => out.push(v));
    return out;
  }, [lockedKpiBreakdown, kpiOrderMap, focusedEmployee]);

  const reorderKpi = (from: number, to: number) => {
    if (!focusedEmployee || from === to || from < 0 || to < 0) return;
    const ids = orderedKpiBreakdown.map((k: any) => k.targetId);
    if (from >= ids.length || to >= ids.length) return;
    const [m] = ids.splice(from, 1);
    ids.splice(to, 0, m);
    persistKpiOrder({ ...kpiOrderMap, [focusedEmployee.id]: ids });
  };

  // Generic per-target computation that mirrors lockedKpiBreakdown but works for ALL targets
  // in the active dept/role/employee filter. Used to derive accurate top-card stats
  // (Total Points, Achieved, In Progress, Missed) that respect the current date filter
  // and live achievement data (logs / billings / completed treatments).
  const computedSummaryByTarget = useMemo(() => {
    const out: Record<string, { achieved: number; target: number; status: string; points: number; employee_id: string }> = {};
    periodScopedTargets.forEach((t: any) => {
      const emp = employees.find((e: any) => e.id === t.employee_id);
      if (!emp) return;
      const isRevenue = (t.unit === "inr") || (t.metric_name?.toLowerCase() === "revenue");
      const targetLogs = targetAchievementLogs.filter((log: any) => log.target_id === t.id);
      const hasLoggedManual = targetLogs.length > 0;
      const manualOverride = !!t.manual_override || hasLoggedManual;
      const achStart = t.period_start > periodStart ? t.period_start : periodStart;
      const achEnd = t.period_end < periodEnd ? t.period_end : periodEnd;
      const totalDays = Math.max(1, differenceInDays(new Date(t.period_end), new Date(t.period_start)) + 1);
      const visibleDays = Math.max(1, differenceInDays(new Date(achEnd), new Date(achStart)) + 1);

      let achieved = 0;
      if (manualOverride) {
        if (hasLoggedManual) {
          achieved = targetLogs.reduce((sum: number, log: any) => {
            if (log.achieved_date < achStart || log.achieved_date > achEnd) return sum;
            return sum + Number(log.achieved_value || 0);
          }, 0);
        } else {
          achieved = Math.round((Number(t.manual_achieved || 0) / totalDays) * visibleDays);
        }
      } else if (isRevenue) {
        achieved = billingsData.reduce((sum: number, b: any) => {
          const created = (b.created_at || "").slice(0, 10);
          if (created < achStart || created > achEnd) return sum;
          if (!matchesEmployee(b.treatment_plans?.doctor, emp)) return sum;
          return sum + Number(b.total_amount || 0);
        }, 0);
      } else {
        const targetName = (t.metric_name || "").toLowerCase().trim();
        achieved = completedTreatments.reduce((cnt: number, item: any) => {
          const completed = (item.completed_at || "").slice(0, 10);
          if (!completed || completed < achStart || completed > achEnd) return cnt;
          if (!matchesEmployee(item.doctor || item.treatment_plans?.doctor, emp)) return cnt;
          if ((item.treatment_type || "").toLowerCase().trim() !== targetName) return cnt;
          return cnt + 1;
        }, 0);
      }

      const perDayTarget = Number(t.target_value || 0) / totalDays;
      const scaledTargetRaw = perDayTarget * visibleDays;
      const target = isRevenue ? Math.round(scaledTargetRaw) : Math.max(0, Math.round(scaledTargetRaw));
      const ppu = Number(t.points_per_unit || 1);
      const points = isRevenue ? Math.round((achieved / 1000) * ppu) : Math.round(achieved * ppu);

      // Status decision: if visible window is fully past, missed targets are "missed";
      // otherwise pending targets stay "in_progress"/"pending".
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const windowEnded = achEnd < todayStr;
      let status: string;
      if (target > 0 && achieved >= target) {
        status = achieved > target ? "exceeded" : "achieved";
      } else if (achieved > 0) {
        status = "in_progress";
      } else if (windowEnded) {
        status = "missed";
      } else {
        status = "in_progress";
      }
      out[t.id] = { achieved, target, status, points, employee_id: t.employee_id };
    });
    return out;
  }, [periodScopedTargets, employees, targetAchievementLogs, billingsData, completedTreatments, periodStart, periodEnd]);

  // Status counts derived from live, date-filtered achievements (replaces stale t.status).
  const statusCounts = useMemo(() => {
    const c = { in_progress: 0, achieved: 0, exceeded: 0, missed: 0, pending: 0 } as Record<string, number>;
    Object.values(computedSummaryByTarget).forEach((s) => {
      if (s.status === "achieved") c.achieved += 1;
      else if (s.status === "exceeded") c.exceeded += 1;
      else if (s.status === "in_progress") c.in_progress += 1;
      else if (s.status === "missed") c.missed += 1;
      else c.pending += 1;
    });
    return c;
  }, [computedSummaryByTarget]);

  // Total points in scope: auto KPI points (date-filtered, live) + manual bonus/penalty
  // logged within the same window. Restricted to employees in the current leaderboard.
  const totalPointsInScope = useMemo(() => {
    const empIds = new Set(leaderboard.map((e: any) => e.id));
    let auto = 0;
    Object.values(computedSummaryByTarget).forEach((s) => {
      if (empIds.has(s.employee_id)) auto += Number(s.points || 0);
    });
    const manual = (pointsLogs || []).reduce((sum: number, p: any) => {
      if (!empIds.has(p.employee_id)) return sum;
      const d = (p.created_at || p.log_date || "").slice(0, 10);
      if (d && (d < periodStart || d > periodEnd)) return sum;
      return sum + Number(p.points || 0);
    }, 0);
    return Math.round(auto + manual);
  }, [computedSummaryByTarget, leaderboard, pointsLogs, periodStart, periodEnd]);

  // Compute day-by-day Achieved breakdown for the view-only dialog
  const viewBreakdownRows = useMemo(() => {
    if (!viewBreakdown || !focusedEmployee) return [] as { date: string; value: number; source: string; detail?: string }[];
    const t = syncedTargets.find((x: any) => x.id === viewBreakdown.targetId);
    if (!t) return [];
    const { visibleFrom, visibleTo, isRevenue } = viewBreakdown;
    const targetLogs = targetAchievementLogs.filter((l: any) => l.target_id === t.id);
    const hasManual = targetLogs.length > 0 || !!t.manual_override;
    const rows: { date: string; value: number; source: string; detail?: string }[] = [];
    if (hasManual) {
      targetLogs
        .filter((l: any) => l.achieved_date >= visibleFrom && l.achieved_date <= visibleTo)
        .sort((a: any, b: any) => a.achieved_date.localeCompare(b.achieved_date))
        .forEach((l: any) => rows.push({ date: l.achieved_date, value: Number(l.achieved_value || 0), source: "Manual entry" }));
    } else if (isRevenue) {
      billingsData.forEach((b: any) => {
        const d = (b.created_at || "").slice(0, 10);
        if (d < visibleFrom || d > visibleTo) return;
        if (!matchesEmployee(b.treatment_plans?.doctor, focusedEmployee)) return;
        rows.push({ date: d, value: Number(b.total_amount || 0), source: "Billing", detail: b.invoice_number || b.id });
      });
    } else {
      const targetName = (t.metric_name || "").toLowerCase().trim();
      completedTreatments.forEach((item: any) => {
        const d = (item.completed_at || "").slice(0, 10);
        if (!d || d < visibleFrom || d > visibleTo) return;
        if (!matchesEmployee(item.doctor || item.treatment_plans?.doctor, focusedEmployee)) return;
        if ((item.treatment_type || "").toLowerCase().trim() !== targetName) return;
        rows.push({ date: d, value: 1, source: "Treatment", detail: item.patient_name || item.patient_id || "" });
      });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [viewBreakdown, syncedTargets, targetAchievementLogs, billingsData, completedTreatments, focusedEmployee]);

  const downloadKpiExcel = () => {
    if (!lockedKpiBreakdown.length) { toast.error("No KPI data to export"); return; }
    const rows = lockedKpiBreakdown.map((k: any) => ({
      "KPI / Metric": k.metric_name,
      Period: k.period,
      Target: k.target,
      Achieved: k.achieved,
      Remaining: k.remaining,
      "Progress (%)": k.progress,
      Points: k.points,
      Status: String(k.status).replace(/_/g, " "),
      Unit: k.unit,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPIs & Targets");
    const empName = focusedEmployee ? `${focusedEmployee.first_name}_${focusedEmployee.last_name}` : "kpis";
    XLSX.writeFile(wb, `KPIs_${empName}_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const downloadKpiPdf = async () => {
    if (!lockedKpiBreakdown.length) { toast.error("No KPI data to export"); return; }
    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = await addClinicPdfHeader(doc, branding);
    const empName = focusedEmployee ? `${focusedEmployee.first_name} ${focusedEmployee.last_name}` : "";
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`KPIs & Targets${empName ? " · " + empName : ""}`, 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${periodLabel}`, 14, startY + 6);
    autoTable(doc, {
      startY: startY + 12,
      head: [["KPI / Metric", "Period", "Target", "Achieved", "Remaining", "Progress %", "Points", "Status"]],
      body: lockedKpiBreakdown.map((k: any) => [
        k.metric_name, k.period, `${k.target} ${k.unit || ""}`.trim(),
        String(k.achieved), String(k.remaining), `${k.progress}%`, String(k.points),
        String(k.status).replace(/_/g, " "),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 58, 95] },
      margin: { bottom: 30 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });
    doc.save(`KPIs_${empName.replace(/\s+/g, "_") || "report"}_${format(new Date(), "yyyyMMdd")}.pdf`);
  };


  const rankIcon = (i: number) => {
    if (i === 0) return <Crown size={16} className="text-warning" />;
    if (i === 1) return <Medal size={16} className="text-muted-foreground" />;
    if (i === 2) return <Award size={16} className="text-accent" />;
    return <Star size={14} className="text-muted-foreground/40" />;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Target className="text-primary" size={24} />
            {roleLocked
              ? (lockedEmpName || lockedRoleLabel)
              : deptLocked
                ? `${departments.find(d => d.id === activeDept)?.label} Dashboard`
                : "Operations"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {roleLocked
              ? (lockedEmpDesignation || lockedRoleLabel || "")
              : deptLocked
                ? `${departments.find(d => d.id === activeDept)?.label} performance, points & leaderboard`
                : "Department-wise performance, points & leaderboard"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!roleLocked && !deptLocked && (
            <Select value={activeDept} onValueChange={setActiveDept}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <div className="flex items-center gap-2"><d.icon size={14} />{d.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1.5 min-w-[200px] justify-start font-normal", activePeriod === "custom" && "border-primary text-primary")}>
                <CalendarIcon size={14} />
                <span className="truncate">{periodLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 flex" align="end">
              <div className="flex flex-col border-r p-2 gap-1 min-w-[140px] bg-muted/30">
                {presetOptions.map((p) => (
                  <Button
                    key={p.value}
                    variant={activePeriod === p.value ? "default" : "ghost"}
                    size="sm"
                    className="justify-start text-xs h-8"
                    onClick={() => {
                      setActivePeriod(p.value);
                      if (p.value !== "custom") setCalendarOpen(false);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="p-2">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={(range) => {
                    setCustomRange(range);
                    setActivePeriod("custom");
                    if (range?.from && range?.to) setTimeout(() => setCalendarOpen(false), 200);
                  }}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                <div className="flex items-center justify-between px-2 pt-1 text-xs text-muted-foreground">
                  <span>{customRange?.from ? format(customRange.from, "dd MMM yyyy") : "Start"} → {customRange?.to ? format(customRange.to, "dd MMM yyyy") : "End"}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setCustomRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }); setActivePeriod("month"); }}>Reset</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {!roleLocked && (
            <Button variant="outline" size="sm" onClick={() => setShowRolesMgr(true)} className="gap-1.5">
              <Settings2 size={14} /> Roles & KPIs
            </Button>
          )}
        </div>
      </div>

      {!roleLocked && activeDept !== "all" && currentDeptRoles.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground mr-2">Role:</span>
              {currentDeptRoles.map((r: any) => {
                const count = staffCountByRoleId[r.id] ?? 0;
                const isActive = activeRole === r.id || activeRole === r.role_name;
                return (
                  <Button key={r.id} size="sm" variant={isActive ? "default" : "outline"} className="h-7 text-xs" onClick={() => setActiveRole(r.id)}>
                    {r.display_label} <span className="ml-1 opacity-60">({count})</span>
                  </Button>
                );
              })}
{isAdmin && activeRole !== "all" && (() => {
                // Use the same live staff list that drives the role tab count.
                const pool = roleStaffList.map((staff: any) => {
                  const emp = allEmployees.find((e: any) => e.user_id === staff.id);
                  return emp || staff;
                });
                if (pool.length === 0) return null;
                return (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-semibold text-muted-foreground">Employee:</span>
                    <Select value={activeEmployeeId} onValueChange={setActiveEmployeeId}>
                      <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All ({pool.length})</SelectItem>
                        {pool.map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff assigned to this role — live from Settings → Staff (profiles + user_roles) */}
      {(roleLocked || activeRole !== "all") && activeOpsRole && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} className="text-primary" />
              {activeOpsRole.display_label || activeOpsRole.role_name} Staff
              <Badge variant="outline" className="text-[10px]">{roleStaffList.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roleStaffList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No staff assigned to this role yet. Add staff under Settings → Staff with this role.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleStaffList.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {(() => {
        const summaries = Object.values(computedSummaryByTarget);
        const totalKpiCount = summaries.length;
        const achievedKpiCount = statusCounts.achieved + statusCounts.exceeded;
        const untouchedKpiCount = totalKpiCount - achievedKpiCount - statusCounts.in_progress - statusCounts.missed;
        const notTouchedCount = statusCounts.missed + Math.max(0, untouchedKpiCount);
        const overallPct = totalKpiCount > 0 ? Math.min(Math.round((achievedKpiCount / totalKpiCount) * 100), 100) : 0;
        return (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-success"><Target size={16} /><span className="text-xs text-muted-foreground">Target vs Achieved</span></div>
                <p className="text-2xl font-bold font-display mt-1">
                  <span className="text-success">{achievedKpiCount}</span>
                  <span className="text-sm text-muted-foreground"> / {totalKpiCount}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-warning"><Clock size={16} /><span className="text-xs text-muted-foreground">In Progress</span></div>
                <p className="text-2xl font-bold font-display mt-1">{statusCounts.in_progress}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-destructive"><XCircle size={16} /><span className="text-xs text-muted-foreground">Missed</span></div>
                <p className="text-2xl font-bold font-display mt-1">{notTouchedCount}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-warning"><Trophy size={16} /><span className="text-xs text-muted-foreground">Total Points</span></div>
                <p className="text-2xl font-bold font-display mt-1">{totalPointsInScope.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-primary"><Target size={16} /><span className="text-xs text-muted-foreground">Overall Progress</span></div>
                <p className="text-2xl font-bold font-display mt-1">{overallPct}<span className="text-sm text-muted-foreground ml-1">%</span></p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full transition-all", overallPct >= 100 ? "bg-success" : overallPct >= 50 ? "bg-primary" : "bg-warning")} style={{ width: `${overallPct}%` }} />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="space-y-4">
          {!roleHashMap[currentHash] && (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="default" className="gap-1" onClick={() => setShowSetTarget(true)}>
                <Target size={14} /> Set Target
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAddPoints(true)}>
                <Plus size={14} /> Adjust Points
              </Button>
            </div>
          )}

          {focusedEmployee && lockedKpiBreakdown.length > 0 && (() => {
            const treatmentRows = lockedKpiBreakdown.filter((k: any) => (k.unit || "").toLowerCase() !== "inr" && (k.metric_name || "").toLowerCase() !== "revenue");
            const revenueRows = lockedKpiBreakdown.filter((k: any) => (k.unit || "").toLowerCase() === "inr" || (k.metric_name || "").toLowerCase() === "revenue");
            const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
            const tTarget = sum(treatmentRows, "target");
            const tAchieved = sum(treatmentRows, "achieved");
            const tProgress = tTarget > 0 ? Math.min(Math.round((tAchieved / tTarget) * 100), 100) : 0;
            const tAchievedCount = treatmentRows.filter((r: any) => r.status === "achieved" || r.status === "exceeded").length;
            const tInProgress = treatmentRows.filter((r: any) => r.status === "in_progress").length;
            const rTarget = sum(revenueRows, "target");
            const rAchieved = sum(revenueRows, "achieved");
            const rProgress = rTarget > 0 ? Math.min(Math.round((rAchieved / rTarget) * 100), 100) : 0;
            const rAchievedCount = revenueRows.filter((r: any) => r.status === "achieved" || r.status === "exceeded").length;
            const rInProgress = revenueRows.filter((r: any) => r.status === "in_progress").length;
            const totalPts = sum(lockedKpiBreakdown, "points");
            const empAuto = autoPointsByEmp[focusedEmployee.id] || 0;
            const empManual = manualPointsByEmp[focusedEmployee.id] || 0;
            const overall = Math.round(empAuto + empManual);
            const desig = (focusedEmployee.designation || "").toLowerCase();
            const isDoctor = desig === "doctor" || desig === "duty_doctor" || desig.includes("doctor");
            const totalKpis = lockedKpiBreakdown.length;
            const achievedKpis = lockedKpiBreakdown.filter((r: any) => r.status === "achieved" || r.status === "exceeded").length;
            const inProgressKpis = lockedKpiBreakdown.filter((r: any) => r.status === "in_progress").length;
            const overallProgress = totalKpis > 0 ? Math.round(lockedKpiBreakdown.reduce((s: number, r: any) => s + Number(r.progress || 0), 0) / totalKpis) : 0;
            return (
              <div className="grid gap-3 md:grid-cols-3">
                {isDoctor && (
                  <Card className="shadow-card border-primary/20">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-primary"><Stethoscope size={16} /><span className="text-xs font-semibold text-muted-foreground">Treatment Progress</span></div>
                        <Badge variant="outline" className="text-[10px]">{treatmentRows.length} KPI{treatmentRows.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <p className="text-2xl font-bold font-display">{tProgress}<span className="text-sm text-muted-foreground ml-1">%</span></p>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${tProgress}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span><span className="text-success font-medium">{tAchieved.toLocaleString("en-IN")}</span> / {tTarget.toLocaleString("en-IN")}</span>
                        <span><CheckCircle size={10} className="inline text-success mr-0.5" />{tAchievedCount} · <Clock size={10} className="inline text-warning mr-0.5" />{tInProgress}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {isDoctor && (
                  <Card className="shadow-card border-success/20">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-success"><IndianRupee size={16} /><span className="text-xs font-semibold text-muted-foreground">Revenue Progress</span></div>
                        <Badge variant="outline" className="text-[10px]">{revenueRows.length} KPI{revenueRows.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <p className="text-2xl font-bold font-display">{rProgress}<span className="text-sm text-muted-foreground ml-1">%</span></p>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-success transition-all" style={{ width: `${rProgress}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>₹<span className="text-success font-medium">{rAchieved.toLocaleString("en-IN")}</span> / ₹{rTarget.toLocaleString("en-IN")}</span>
                        <span><CheckCircle size={10} className="inline text-success mr-0.5" />{rAchievedCount} · <Clock size={10} className="inline text-warning mr-0.5" />{rInProgress}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Doctor FY-style summary — overall lifetime view for the focused doctor */}
          {focusedEmployee && (() => {
            const desig = (focusedEmployee.designation || "").toLowerCase();
            const isDoctor = desig === "doctor" || desig === "duty_doctor" || desig.includes("doctor");
            return isDoctor;
          })() && (() => {
            // Completed treatments by this doctor within the selected period
            const docTreatments = completedTreatments.filter((t: any) => {
              const doctor = t.doctor || t.treatment_plans?.doctor;
              if (!matchesEmployee(doctor, focusedEmployee)) return false;
              const completed = (t.completed_at || "").slice(0, 10);
              if (!completed) return false;
              return completed >= periodStart && completed <= periodEnd;
            });
            // Billings tied to this doctor within the selected period
            const docBillings = billingsData.filter((b: any) => {
              if (!matchesEmployee(b.treatment_plans?.doctor, focusedEmployee)) return false;
              const created = (b.created_at || "").slice(0, 10);
              if (!created) return false;
              return created >= periodStart && created <= periodEnd;
            });

            // Total patients seen (unique patient_ids across treatments + billings)
            const patientIds = new Set<string>();
            docTreatments.forEach((t: any) => {
              const pid = t.treatment_plans?.patient_id;
              if (pid) patientIds.add(pid);
            });
            docBillings.forEach((b: any) => {
              const pid = b.patient_id || b.treatment_plans?.patient_id;
              if (pid) patientIds.add(pid);
            });
            const totalPatients = patientIds.size;

            // Total revenue & treatments lifetime
            const totalRevenue = docBillings.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
            const totalTreatments = docTreatments.length;

            // Monthly performance — by treatment count + revenue
            const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const monthly: Record<string, { label: string; treatments: number; revenue: number }> = {};
            docTreatments.forEach((t: any) => {
              if (!t.completed_at) return;
              const d = new Date(t.completed_at);
              const key = `${d.getFullYear()}-${d.getMonth()}`;
              if (!monthly[key]) monthly[key] = { label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, treatments: 0, revenue: 0 };
              monthly[key].treatments += 1;
            });
            docBillings.forEach((b: any) => {
              if (!b.created_at) return;
              const d = new Date(b.created_at);
              const key = `${d.getFullYear()}-${d.getMonth()}`;
              if (!monthly[key]) monthly[key] = { label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, treatments: 0, revenue: 0 };
              monthly[key].revenue += Number(b.total_amount || 0);
            });
            const monthEntries = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
            const monthChartData = monthEntries.map(([, v]) => v);
            // Best month by combined score (treatments count weighted equal to revenue/1000)
            let bestMonth: { label: string; treatments: number; revenue: number } | null = null;
            monthEntries.forEach(([, v]) => {
              const score = v.treatments + v.revenue / 1000;
              const bestScore = bestMonth ? bestMonth.treatments + bestMonth.revenue / 1000 : -1;
              if (score > bestScore) bestMonth = v;
            });

            // Top treatment
            const tCounts: Record<string, number> = {};
            docTreatments.forEach((t: any) => {
              const name = (t.treatment_type || "").trim();
              if (!name) return;
              tCounts[name] = (tCounts[name] || 0) + 1;
            });
            const topTreatmentEntry = Object.entries(tCounts).sort((a, b) => b[1] - a[1])[0];
            const topTreatment = topTreatmentEntry ? { name: topTreatmentEntry[0], count: topTreatmentEntry[1] } : null;

            // Age group analysis
            const patientsById: Record<string, any> = {};
            patientsData.forEach((p: any) => { patientsById[p.id] = p; });
            const ageBucketOf = (dob: string | null | undefined): "Kids (0-17)" | "Adult (18-59)" | "Senior (60+)" | null => {
              if (!dob) return null;
              const d = new Date(dob);
              if (isNaN(d.getTime())) return null;
              const now = new Date();
              let age = now.getFullYear() - d.getFullYear();
              const m = now.getMonth() - d.getMonth();
              if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
              if (age < 0) return null;
              if (age <= 17) return "Kids (0-17)";
              if (age <= 59) return "Adult (18-59)";
              return "Senior (60+)";
            };
            const ageBuckets: Record<string, number> = { "Kids (0-17)": 0, "Adult (18-59)": 0, "Senior (60+)": 0 };
            patientIds.forEach((pid) => {
              const bucket = ageBucketOf(patientsById[pid]?.date_of_birth);
              if (bucket) ageBuckets[bucket] += 1;
            });
            const topAgeEntry = Object.entries(ageBuckets).sort((a, b) => b[1] - a[1])[0];
            const topAge = topAgeEntry && topAgeEntry[1] > 0 ? { name: topAgeEntry[0], count: topAgeEntry[1] } : null;

            return (
              <Card className="shadow-card border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp size={16} className="text-primary" />
                    {focusedEmployee.first_name} {focusedEmployee.last_name} — Doctor Overview
                    <Badge variant="outline" className="text-[10px] ml-2">All-time</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-primary"><Users size={14} /><span className="text-xs text-muted-foreground">Total Patients</span></div>
                      <p className="text-2xl font-bold font-display mt-1">{totalPatients.toLocaleString("en-IN")}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{totalTreatments} treatments · ₹{totalRevenue.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-success"><Trophy size={14} /><span className="text-xs text-muted-foreground">Best Month</span></div>
                      <p className="text-2xl font-bold font-display mt-1">{bestMonth ? (bestMonth as any).label : "—"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{bestMonth ? `${(bestMonth as any).treatments} treatments · ₹${Math.round((bestMonth as any).revenue).toLocaleString("en-IN")}` : "No data yet"}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-warning"><Star size={14} /><span className="text-xs text-muted-foreground">Top Age Group</span></div>
                      <p className="text-xl font-bold font-display mt-1 truncate">{topAge ? topAge.name : "—"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{topAge ? `${topAge.count} patients · Kids ${ageBuckets["Kids (0-17)"]} · Adult ${ageBuckets["Adult (18-59)"]} · Senior ${ageBuckets["Senior (60+)"]}` : "Add patient DOBs"}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-accent"><Stethoscope size={14} /><span className="text-xs text-muted-foreground">Top Treatment</span></div>
                      <p className="text-xl font-bold font-display mt-1 truncate">{topTreatment ? topTreatment.name : "—"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{topTreatment ? `${topTreatment.count} completed` : "No completions yet"}</p>
                    </div>
                  </div>

                  {monthChartData.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Performance</p>
                      <DoctorMonthlyChart data={monthChartData} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {focusedEmployee && (
            <Card className="shadow-card border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-display flex items-center gap-2 flex-1 min-w-0">
                    <Target size={16} className="text-primary" />
                    <span className="truncate">{roleLocked ? "My KPIs & Targets" : `KPIs & Targets · ${focusedEmployee.first_name} ${focusedEmployee.last_name}`}</span>
                    {focusedDesignation && !roleLocked && (
                      <span className="text-xs font-normal text-muted-foreground">({focusedDesignation})</span>
                    )}
                    <span className="text-xs font-normal text-muted-foreground ml-1">· {periodLabel}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={lockedKpiBreakdown.length === 0}
                      onClick={() => setShowKpiReport(true)}
                    >
                      <TrendingUp size={14} /> Report
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1" disabled={lockedKpiBreakdown.length === 0}>
                          <Download size={14} /> Download
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={downloadKpiPdf}>
                          <FileText size={14} className="mr-2" /> Download as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={downloadKpiExcel}>
                          <FileSpreadsheet size={14} className="mr-2" /> Download as Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {lockedKpiBreakdown.length === 0 ? (() => {
                  const roleKey = (focusedEmployee.designation || "").toLowerCase();
                  const suggestions = ROLE_KPI_PRESETS[roleKey] || [];
                  return (
                    <div className="px-4 py-6 space-y-4">
                      <p className="text-center text-sm text-muted-foreground">
                        No KPI metrics configured yet for this role.
                      </p>
                      {suggestions.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-accent" />
                              <span className="text-sm font-semibold">Suggested KPIs for {focusedDesignation || "this role"}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1"
                              disabled={addSuggestedKpis.isPending}
                              onClick={() => addSuggestedKpis.mutate(focusedEmployee)}
                            >
                              <Plus size={14} /> Add all suggested
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {suggestions.map((s) => (
                              <Badge key={s} variant="outline" className="text-xs font-normal py-1.5 px-2.5">
                                {s}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Defaults to monthly, target 100, 1 point per unit. You can edit each KPI after adding, or use <span className="font-medium">Set Target</span> to add custom KPIs.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <>
                  <div className="overflow-auto max-h-[520px]">
                    <table className="w-full min-w-[900px]">
                      <thead className="sticky top-0 bg-secondary/80 backdrop-blur z-10">
                        <tr className="border-b border-border">
                          <th className="px-1 py-3 w-8" aria-label="Drag to reorder"></th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground w-12">S.No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">KPI / Metric</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Period</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Target</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Achieved</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Remaining</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-[160px]">Progress</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Points</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground w-[60px]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {usePagedSlice(orderedKpiBreakdown, kpiPage, kpiPageSize).map((k, idx) => {
                          const globalIdx = (kpiPage - 1) * kpiPageSize + idx;
                          return (
                          <tr
                            key={k.targetId}
                            className={cn(
                              "hover:bg-secondary/30 transition-colors",
                              kpiDragIndex === globalIdx && "opacity-40",
                              kpiDragOver === globalIdx && kpiDragIndex !== null && kpiDragIndex !== globalIdx && "bg-primary/10"
                            )}
                            onDragOver={(e) => { e.preventDefault(); if (kpiDragOver !== globalIdx) setKpiDragOver(globalIdx); }}
                            onDragLeave={() => { if (kpiDragOver === globalIdx) setKpiDragOver(null); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (kpiDragIndex !== null) reorderKpi(kpiDragIndex, globalIdx);
                              setKpiDragIndex(null); setKpiDragOver(null);
                            }}
                          >
                            <td className="px-1 py-3 align-middle w-14">
                              <div className="flex items-center justify-center gap-0.5">
                                <span
                                  draggable
                                  onDragStart={(e) => { setKpiDragIndex(globalIdx); e.dataTransfer.effectAllowed = "move"; }}
                                  onDragEnd={() => { setKpiDragIndex(null); setKpiDragOver(null); }}
                                  className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing select-none"
                                  title="Drag to reorder"
                                >
                                  <GripVertical size={14} />
                                </span>
                                <div className="flex flex-col">
                                  <button
                                    type="button"
                                    title="Move up"
                                    disabled={globalIdx === 0}
                                    onClick={() => reorderKpi(globalIdx, globalIdx - 1)}
                                    className="h-3.5 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronUp size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Move down"
                                    disabled={globalIdx >= orderedKpiBreakdown.length - 1}
                                    onClick={() => reorderKpi(globalIdx, globalIdx + 1)}
                                    className="h-3.5 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronDown size={12} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center text-xs text-muted-foreground">{globalIdx + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium">{k.metric_name}</td>
                            <td className="px-4 py-3 text-center"><Badge variant="outline" className="text-[10px] capitalize">{k.period}</Badge></td>
                            <td className="px-4 py-3 text-sm text-right">{k.target.toLocaleString("en-IN")} <span className="text-[10px] text-muted-foreground">{k.unit}</span></td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-success">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 justify-end hover:underline focus:outline-none focus:underline"
                                title="View breakdown"
                                onClick={() => setViewBreakdown({
                                  targetId: k.targetId,
                                  metric_name: k.metric_name,
                                  unit: k.unit,
                                  visibleFrom: k.visibleFrom,
                                  visibleTo: k.visibleTo,
                                  isRevenue: (k.unit || "").toLowerCase() === "inr" || (k.metric_name || "").toLowerCase() === "revenue",
                                })}
                              >
                                {k.manualOverride && (
                                  <Star size={12} className="text-warning fill-warning" aria-label="Manually edited" />
                                )}
                                {k.achieved.toLocaleString("en-IN")}
                                <Eye size={11} className="text-muted-foreground ml-0.5" />
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-warning">{k.remaining.toLocaleString("en-IN")}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full transition-all",
                                      k.progress >= 100 ? "bg-success" : k.progress >= 50 ? "bg-primary" : "bg-warning"
                                    )}
                                    style={{ width: `${k.progress}%` }}
                                  />
                                </div>
                                <span className="text-[11px] text-muted-foreground w-10 text-right">{k.progress}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-primary">{k.points.toLocaleString("en-IN")}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] capitalize",
                                  k.status === "achieved" || k.status === "exceeded" ? "border-success text-success" :
                                  k.status === "missed" ? "border-destructive text-destructive" :
                                  k.status === "in_progress" ? "border-warning text-warning" :
                                  "border-muted-foreground text-muted-foreground"
                                )}
                              >
                                {k.status.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  title="Edit achieved value"
                                  onClick={() => {
                                    const today = format(new Date(), "yyyy-MM-dd");
                                    const clamped = today < k.visibleFrom ? k.visibleFrom : today > k.visibleTo ? k.visibleTo : today;
                                    setEditAchieved({
                                      id: k.targetId,
                                      metric_name: k.metric_name,
                                      value: "",
                                      isOverride: k.manualOverride,
                                      visibleDays: k.visibleDays,
                                      totalDays: k.totalDays,
                                      visibleFrom: k.visibleFrom,
                                      visibleTo: k.visibleTo,
                                      dailyDate: clamped,
                                    });
                                  }}
                                >
                                  <Pencil size={13} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete target"
                                  onClick={() => {
                                    if (confirm(`Delete target "${k.metric_name}"? This will also remove it from the employee's login view.`)) {
                                      deleteEmployeeTarget.mutate(k.targetId);
                                    }
                                  }}
                                  hidden={roleLocked || !isAdmin}
                                  style={(roleLocked || !isAdmin) ? { display: "none" } : undefined}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={kpiPage}
                    pageSize={kpiPageSize}
                    total={lockedKpiBreakdown.length}
                    onPageChange={setKpiPage}
                    onPageSizeChange={setKpiPageSize}
                    label="KPIs"
                    className="border-t"
                  />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* KPI Report popup with charts + downloads */}
          <Dialog open={showKpiReport} onOpenChange={setShowKpiReport}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary" />
                  KPI Report {focusedEmployee ? `· ${focusedEmployee.first_name} ${focusedEmployee.last_name}` : ""}
                  <span className="text-xs font-normal text-muted-foreground ml-1">· {periodLabel}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total KPIs</p>
                    <p className="text-2xl font-bold">{lockedKpiBreakdown.length}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total Points</p>
                    <p className="text-2xl font-bold text-primary">{lockedKpiBreakdown.reduce((s, k) => s + (k.points || 0), 0).toLocaleString("en-IN")}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Avg Progress</p>
                    <p className="text-2xl font-bold text-success">{lockedKpiBreakdown.length ? Math.round(lockedKpiBreakdown.reduce((s, k) => s + (k.progress || 0), 0) / lockedKpiBreakdown.length) : 0}%</p>
                  </CardContent></Card>
                </div>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Target vs Achieved</CardTitle></CardHeader>
                  <CardContent className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={lockedKpiBreakdown.map(k => ({ name: k.metric_name, Target: k.target, Achieved: k.achieved }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Target" fill="hsl(var(--muted-foreground))" />
                        <Bar dataKey="Achieved" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Progress % by KPI</CardTitle></CardHeader>
                  <CardContent className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={lockedKpiBreakdown.map(k => ({ name: k.metric_name, Progress: k.progress }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="Progress" fill="hsl(var(--success))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setShowKpiReport(false)}>Close</Button>
                <Button variant="outline" className="gap-1" onClick={downloadKpiExcel}><FileSpreadsheet size={14} /> Excel</Button>
                <Button className="gap-1" onClick={downloadKpiPdf}><FileText size={14} /> PDF</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* To-Do List: Top Tasks, Top Learnings, Train the Team
              Show inside each role/employee scope (doctor, dental assistant, receptionist, housekeeping, etc.)
              Hide on the "All Clinics" overview (activeDept !== "all" with activeRole === "all" and no focused employee). */}
          {(roleLocked || activeRole !== "all") && (
            <TodoListPanel
              initialTab="todo"
              departments={departments.filter(d => d.id !== "all").map(d => ({ id: d.id, label: d.label }))}
              activeDept={activeDept === "all" ? "clinic" : activeDept}
              periodStart={periodStart}
              periodEnd={periodEnd}
              viewUserId={focusedEmployee?.user_id || null}
              viewUserLabel={focusedEmployee ? `${focusedEmployee.first_name || ""} ${focusedEmployee.last_name || ""}`.trim() : null}
            />
          )}

          {!roleLocked && displayLeaderboard.length >= 1 && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              {displayLeaderboard.slice(0, 3).map((e, i) => (
                <Card key={e.id} className={`shadow-card ${i === 0 ? "ring-2 ring-warning/40 bg-warning/5" : ""} ${e.id === myEmpId ? "ring-2 ring-primary/60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {rankIcon(i)}
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rank #{i + 1}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{e.role}</Badge>
                    </div>
                    <p className="text-base font-semibold mt-2 font-display">{e.name}{e.id === myEmpId && <span className="ml-1 text-[10px] text-primary">(You)</span>}</p>
                    <p className="text-3xl font-bold text-primary mt-1">{e.totalPoints.toLocaleString("en-IN")}<span className="text-sm text-muted-foreground ml-1">pts</span></p>
                    <div className="text-[11px] text-muted-foreground mt-1.5 flex gap-3">
                      <span>Auto: {e.autoPoints}</span>
                      <span>Bonus: {e.manualPoints >= 0 ? "+" : ""}{e.manualPoints}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!roleLocked && (
          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base font-display flex items-center gap-2"><Trophy size={16} className="text-warning" /> Full Rankings</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-16">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Role</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Auto Points</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Bonus</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayLeaderboard.map((e, i) => (
                      <tr key={e.id} className={`hover:bg-secondary/30 transition-colors ${e.id === myEmpId ? "bg-primary/10" : i < 3 ? "bg-warning/5" : ""}`}>
                        <td className="px-4 py-3 text-sm font-bold flex items-center gap-1.5">{rankIcon(i)} {i + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium">{e.name}{e.id === myEmpId && <span className="ml-1 text-[10px] text-primary">(You)</span>}</td>
                        <td className="px-4 py-3 text-xs"><Badge variant="outline" className="text-[10px]">{e.role}</Badge></td>
                        <td className="px-4 py-3 text-sm text-right">{e.autoPoints.toLocaleString("en-IN")}</td>
                        <td className={`px-4 py-3 text-sm text-right ${e.manualPoints > 0 ? "text-success" : e.manualPoints < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {e.manualPoints > 0 ? "+" : ""}{e.manualPoints}
                        </td>
                        <td className="px-4 py-3 text-base text-right font-bold text-primary">{e.totalPoints.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                    {displayLeaderboard.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {activeDept === "all" ? "Select a department to see the leaderboard." : "No employees found in this filter. Add employees and log performance to populate the leaderboard."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          )}
      </div>

      <Dialog open={showAddPoints} onOpenChange={setShowAddPoints}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Points (Bonus / Penalty)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Select value={dlgDept} onValueChange={(v) => { setDlgDept(v); setDlgRole("all"); setPointsForm({ ...pointsForm, employee_id: "" }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {departments.filter(d => d.id !== "all").map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={dlgRole} onValueChange={(v) => { setDlgRole(v); setPointsForm({ ...pointsForm, employee_id: "" }); }}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {dlgDeptRoles.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.display_label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Employee {dlgRole !== "all" && <span className="text-xs text-muted-foreground">({dlgEmployees.length})</span>}</Label>
              <Select value={pointsForm.employee_id} onValueChange={(v) => setPointsForm({ ...pointsForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder={dlgEmployees.length ? "Select employee" : "No employees in this role"} /></SelectTrigger>
                <SelectContent>
                  {dlgEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.designation ? ` — ${e.designation.replace(/_/g, " ")}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Points (negative for penalty)</Label>
              <Input type="number" value={pointsForm.points} onChange={(e) => setPointsForm({ ...pointsForm, points: e.target.value })} placeholder="e.g. 50 or -20" />
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={pointsForm.reason} onChange={(e) => setPointsForm({ ...pointsForm, reason: e.target.value })} placeholder="e.g. Outstanding patient feedback" />
            </div>
            <Button className="w-full" onClick={() => addPoints.mutate()} disabled={!pointsForm.employee_id || !pointsForm.points}>Apply</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRolesMgr} onOpenChange={setShowRolesMgr}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 size={18} /> Roles & KPI Metrics</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {activeDept === "all" ? "Select a department from the filter to manage its roles." : `Managing roles for: ${departments.find(d => d.id === activeDept)?.label}`}
              </p>
              {activeDept !== "all" && (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAddRole(true)}>
                  <Plus size={14} /> Add Role
                </Button>
              )}
            </div>
            {currentDeptRoles.map((role: any) => {
              const metrics = roleMetrics.filter((m: any) => m.role_id === role.id);
              return (
                <Card key={role.id} className="shadow-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-display">{role.display_label}</CardTitle>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setShowAddMetric(role.id)}>
                        <Plus size={14} /> Add Metric
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {metrics.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No metrics configured</p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div>
                              <p className="text-sm font-medium">{m.metric_name}</p>
                              <p className="text-xs text-muted-foreground">{m.points_per_unit} pts/{m.unit} · weight {m.weight}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setMetricEditor({ mode: "edit", id: m.id, role_id: m.role_id, metric_name: m.metric_name, unit: m.unit, default_target: String(m.default_target), points_per_unit: String(m.points_per_unit), weight: String(m.weight) })}>
                                <Settings2 size={14} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMetric.mutate(m.id)}>
                                <Zap size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {currentDeptRoles.length === 0 && (
              <Card className="shadow-card"><CardContent className="p-6 text-center text-sm text-muted-foreground">
                No roles configured for this department
              </CardContent></Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRole} onOpenChange={setShowAddRole}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role Name (internal)</Label>
              <Input value={newRole.role_name} onChange={(e) => setNewRole({ ...newRole, role_name: e.target.value })} placeholder="e.g. senior_doctor" />
            </div>
            <div>
              <Label>Display Label</Label>
              <Input value={newRole.display_label} onChange={(e) => setNewRole({ ...newRole, display_label: e.target.value })} placeholder="e.g. Senior Doctor" />
            </div>
            <Button className="w-full" onClick={() => addRole.mutate()} disabled={!newRole.role_name}>Add Role</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showAddMetric} onOpenChange={(v) => !v && setShowAddMetric(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Metric</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Metric Name</Label>
              <Input value={newMetric.metric_name} onChange={(e) => setNewMetric({ ...newMetric, metric_name: e.target.value })} placeholder="e.g. Patients Seen" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Unit</Label>
                <Select value={newMetric.unit} onValueChange={(v) => setNewMetric({ ...newMetric, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="inr">₹</SelectItem>
                    <SelectItem value="%">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default Target</Label>
                <Input type="number" value={newMetric.default_target} onChange={(e) => setNewMetric({ ...newMetric, default_target: e.target.value })} />
              </div>
              <div>
                <Label>Points/Unit</Label>
                <Input type="number" value={newMetric.points_per_unit} onChange={(e) => setNewMetric({ ...newMetric, points_per_unit: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Weight</Label>
              <Input type="number" value={newMetric.weight} onChange={(e) => setNewMetric({ ...newMetric, weight: e.target.value })} placeholder="1" />
            </div>
            <Button className="w-full" onClick={() => addMetric.mutate()} disabled={!newMetric.metric_name}>Add Metric</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!metricEditor} onOpenChange={(v) => !v && setMetricEditor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{metricEditor?.mode === "edit" ? "Edit Metric" : "Add Metric"}</DialogTitle></DialogHeader>
          {metricEditor && (
            <div className="space-y-3">
              <div>
                <Label>Metric Name</Label>
                <Input value={metricEditor.metric_name} onChange={(e) => setMetricEditor({ ...metricEditor, metric_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Unit</Label>
                  <Select value={metricEditor.unit} onValueChange={(v) => setMetricEditor({ ...metricEditor, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">Count</SelectItem>
                      <SelectItem value="inr">₹</SelectItem>
                      <SelectItem value="%">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Default Target</Label>
                  <Input type="number" value={metricEditor.default_target} onChange={(e) => setMetricEditor({ ...metricEditor, default_target: e.target.value })} />
                </div>
                <div>
                  <Label>Points/Unit</Label>
                  <Input type="number" value={metricEditor.points_per_unit} onChange={(e) => setMetricEditor({ ...metricEditor, points_per_unit: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Weight</Label>
                <Input type="number" value={metricEditor.weight} onChange={(e) => setMetricEditor({ ...metricEditor, weight: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => metricEditor.mode === "edit" ? updateMetric.mutate() : upsertMetricFromEditor.mutate()} disabled={!metricEditor.metric_name}>
                  {metricEditor.mode === "edit" ? "Update" : "Add"}
                </Button>
                {metricEditor.mode === "edit" && (
                  <Button variant="outline" onClick={() => metricEditor.id && deleteMetric.mutate(metricEditor.id)}>Delete</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!targetKindEditor} onOpenChange={(v) => !v && setTargetKindEditor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{targetKindEditor?.mode === "edit" ? "Edit Target Type" : "Add Target Type"}</DialogTitle></DialogHeader>
          {targetKindEditor && (
            <div className="space-y-3">
              <div>
                <Label>Label</Label>
                <Input
                  autoFocus
                  value={targetKindEditor.kind_label}
                  onChange={(e) => setTargetKindEditor({ ...targetKindEditor, kind_label: e.target.value })}
                  placeholder={targetKindEditor.source === "default" ? "Rename this target type" : "e.g. Chair Readiness, Sterilization"}
                />
              </div>
              {targetKindEditor.source === "custom" && (
                <div>
                  <Label>Based on</Label>
                  <Select value={targetKindEditor.base_kind} onValueChange={(v) => setTargetKindEditor({ ...targetKindEditor, base_kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kpi">KPI / Quality</SelectItem>
                      <SelectItem value="treatment">Treatment-wise</SelectItem>
                      <SelectItem value="revenue">Revenue (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Determines how metric inputs behave for this target type.</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!targetKindEditor.kind_label.trim()}
                  onClick={() => {
                    if (targetKindEditor.source === "default") {
                      upsertDefaultTargetKindOverride.mutate({
                        role_id: targetKindEditor.role_id,
                        base_kind: targetKindEditor.base_kind as "treatment" | "revenue" | "kpi",
                        kind_label: targetKindEditor.kind_label.trim(),
                        is_hidden: false,
                      }, { onSuccess: () => setTargetKindEditor(null) });
                      return;
                    }
                    upsertTargetKind.mutate({
                      id: targetKindEditor.id,
                      role_id: targetKindEditor.role_id,
                      kind_label: targetKindEditor.kind_label.trim(),
                      base_kind: targetKindEditor.base_kind,
                    }, { onSuccess: () => setTargetKindEditor(null) });
                  }}
                >
                  {targetKindEditor.mode === "edit" ? "Update" : "Add"}
                </Button>
                {targetKindEditor.mode === "edit" && (
                  <Button variant="outline" onClick={() => {
                    if (confirm(`Delete target type "${targetKindEditor.kind_label}"?`)) {
                      if (targetKindEditor.source === "default") {
                        deleteDefaultTargetKindOverride.mutate({
                          role_id: targetKindEditor.role_id,
                          base_kind: targetKindEditor.base_kind as "treatment" | "revenue" | "kpi",
                        }, { onSuccess: () => setTargetKindEditor(null) });
                        return;
                      }
                      if (targetKindEditor.id) deleteTargetKind.mutate(targetKindEditor.id, { onSuccess: () => setTargetKindEditor(null) });
                    }
                  }}>Delete</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSetTarget} onOpenChange={(open) => { setShowSetTarget(open); if (!open) setEditingTargetId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Target size={18} /> {editingTargetId ? "Edit Target" : "Set Target"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Select value={dlgDept} onValueChange={(v) => {
                  const nextRoleId = deptRoles.find((r: any) => r.department === v)?.id ?? "";
                  setDlgDept(v);
                  setDlgRole(nextRoleId);
                  setEditingTargetId(null);
                  setTargetForm({ ...targetForm, employee_id: "", metric_name: "" });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {departments.filter(d => d.id !== "all").map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={dlgRole} onValueChange={(v) => {
                  setDlgRole(v);
                  setEditingTargetId(null);
                  setTargetForm({ ...targetForm, employee_id: "", metric_name: "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {dlgDeptRoles.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.display_label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Employee {dlgRole !== "all" && <span className="text-xs text-muted-foreground">({dlgEmployees.length})</span>}</Label>
              <Select value={targetForm.employee_id} onValueChange={(v) => setTargetForm({ ...targetForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder={dlgEmployees.length ? "Select employee" : "No employees in this role"} /></SelectTrigger>
                <SelectContent className="max-h-[260px] overflow-y-auto">
                  {dlgEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.designation ? ` — ${e.designation.replace(/_/g, " ")}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period</Label>
                <Select value={targetForm.period} onValueChange={(v: any) => {
                  const nextMetricValues = getMetricFormValues(targetForm.metric_name, targetForm.period, v);
                  let newTarget = nextMetricValues?.target_value ?? targetForm.target_value;
                  if (!nextMetricValues && targetForm.target_value) {
                    const monthly = scaleToMonthly(Number(targetForm.target_value), targetForm.period);
                    newTarget = String(scaleToPeriod(monthly, v));
                  }
                  setTargetForm({
                    ...targetForm,
                    period: v,
                    target_value: newTarget,
                    points_per_unit: nextMetricValues?.points_per_unit ?? targetForm.points_per_unit,
                  });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Type</Label>
                <Select value={targetForm.custom_kind_id ? `custom:${targetForm.custom_kind_id}` : targetForm.metric_kind} onValueChange={(v: any) => {
                  if (v.startsWith("custom:")) {
                    const id = v.slice(7);
                    const k = (roleTargetKinds as any[]).find((x) => x.id === id);
                    setTargetForm({ ...targetForm, metric_kind: (k?.base_kind || "kpi") as any, custom_kind_id: id, metric_name: "" });
                  } else {
                    setTargetForm({ ...targetForm, metric_kind: v, custom_kind_id: "", metric_name: "" });
                  }
                }}>
                  <SelectTrigger><span className="truncate">{selectedTargetKindLabel}</span></SelectTrigger>
                  <SelectContent className="max-h-[320px] overflow-y-auto">
                    {selectedDlgRole && visibleDefaultTargetKinds.map((kind) => {
                      const override = selectedRoleTargetKindOverrideMap[kind];
                      const label = override?.kind_label || DEFAULT_TARGET_KIND_LABELS[kind];
                      return (
                        <div key={kind} className="relative group">
                          <SelectItem value={kind} className="pr-16">
                            <span className="font-medium truncate block">{label}</span>
                          </SelectItem>
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button
                              type="button"
                              title="Edit target type"
                              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background"
                              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                setTargetKindEditor({
                                  mode: "edit",
                                  source: "default",
                                  role_id: selectedDlgRole.id,
                                  kind_label: label,
                                  base_kind: kind,
                                });
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              title="Delete target type"
                              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (confirm(`Delete target type "${label}"?`)) {
                                  deleteDefaultTargetKindOverride.mutate({ role_id: selectedDlgRole.id, base_kind: kind });
                                }
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {selectedDlgRole && (() => {
                      const customKinds = (roleTargetKinds as any[]).filter((k) => k.role_id === selectedDlgRole.id);
                      return (
                        <>
                          {customKinds.length > 0 && (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Custom target types — ✎ edit, 🗑 delete
                              </div>
                              {customKinds.map((k: any) => (
                                <div key={k.id} className="relative group">
                                  <SelectItem value={`custom:${k.id}`} className="pr-16">
                                    <span className="font-medium truncate block">{k.kind_label}</span>
                                    <span className="text-[10px] text-muted-foreground truncate block">based on {k.base_kind}</span>
                                  </SelectItem>
                                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Edit target type"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background"
                                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        setTargetKindEditor({ mode: "edit", source: "custom", id: k.id, role_id: selectedDlgRole.id, kind_label: k.kind_label, base_kind: k.base_kind });
                                      }}
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete target type"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        if (confirm(`Delete target type "${k.kind_label}"?`)) deleteTargetKind.mutate(k.id);
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                          <div className="my-1 h-px bg-border" />
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm text-primary hover:bg-accent rounded-sm"
                            onClick={(e) => {
                              e.preventDefault();
                              setTargetKindEditor({ mode: "create", source: "custom", role_id: selectedDlgRole.id, kind_label: "", base_kind: allowedTargetKinds[0] || "kpi" });
                            }}
                          >
                            <Plus size={14} /> Add target type
                          </button>
                        </>
                      );
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(targetForm.metric_kind === "treatment" || targetForm.metric_kind === "kpi" || !!targetForm.custom_kind_id) && (() => {
              const selectedRole = selectedDlgRole;
              const roleKey = selectedRole?.role_name || "";
              const customKind = selectedCustomKind;
              const isCustom = !!customKind;
              const isKpi = !isCustom && targetForm.metric_kind === "kpi";
              const isTreatment = !isCustom && targetForm.metric_kind === "treatment";
              const treatmentLabels = treatmentOptions.map((t) => t.label);
              const customKindLabel = customKind?.kind_label || "";
              const managedMetricsForKind = selectedRoleMetrics.filter((m: any) => {
                const isRevenueMetric = (m.unit || "").toLowerCase() === "inr" || (m.metric_name || "").toLowerCase() === "revenue";
                if (isRevenueMetric) return false;
                const linkedId = (m as any).target_kind_id || null;
                if (isCustom) return linkedId === customKind!.id;
                // For default Treatment / KPI, exclude metrics scoped to a custom kind
                if (linkedId) return false;
                const isTreatmentMetric = treatmentLabels.includes(m.metric_name);
                return isKpi ? !isTreatmentMetric : (isTreatmentMetric || roleKey === "doctor");
              });
              const presetKindLabel = isCustom ? `custom:${customKind!.id}` : (isKpi ? "kpi" : "treatment");
              const hiddenForRole = (roleHiddenPresets as any[])
                .filter((h) => selectedRole && h.role_id === selectedRole.id && h.preset_kind === presetKindLabel);
              const hiddenSet = new Set(hiddenForRole.map((h) => h.preset_name));
              const managedNames = new Set(managedMetricsForKind.map((m: any) => m.metric_name));
              const presets = Array.from(new Set(
                isCustom
                  ? managedMetricsForKind.map((m: any) => m.metric_name)
                  : isKpi
                    ? [...(ROLE_KPI_PRESETS[roleKey] || []), ...managedMetricsForKind.map((m: any) => m.metric_name)]
                    : [...treatmentLabels, ...managedMetricsForKind.map((m: any) => m.metric_name)]
              )).filter((p) => !hiddenSet.has(p));

              // Existing saved targets for this role + (optional) employee, matching this metric kind
              const empIdsInRole = new Set(dlgEmployees.map((e: any) => e.id));
              const savedHere = (syncedTargets as any[]).filter((t: any) => {
                if (!empIdsInRole.has(t.employee_id)) return false;
                if (targetForm.employee_id && t.employee_id !== targetForm.employee_id) return false;
                const isRev = (t.unit || "").toLowerCase() === "inr" || (t.metric_name || "").toLowerCase() === "revenue";
                if (isRev) return false;
                if (isCustom) return managedNames.has(t.metric_name);
                if (isKpi) return ROLE_KPI_PRESETS[roleKey]?.includes(t.metric_name) || !treatmentOptions.some((to) => to.label === t.metric_name);
                return treatmentOptions.some((to) => to.label === t.metric_name);
              });

              const metricLabel = isCustom ? `${customKindLabel} Metric` : (isKpi ? "KPI Metric" : "Treatment");
              const placeholderLabel = isCustom ? `Select ${customKindLabel.toLowerCase()} metric` : (isKpi ? "Select KPI metric" : "Select treatment");
              const customPlaceholder = isCustom ? `Custom ${customKindLabel.toLowerCase()} metric` : (isKpi ? "Custom metric" : "Custom treatment");
              const addLabel = isCustom ? `${customKindLabel} metric` : (isKpi ? "KPI metric" : "treatment");

              return (
                <div>
                  <Label>{metricLabel} {selectedRole && <span className="text-xs text-muted-foreground">({selectedRole.display_label})</span>}</Label>
                  {presets.length === 0 && !isKpi && !isCustom ? (
                    <Input value={targetForm.metric_name} onChange={(e) => setTargetForm({ ...targetForm, metric_name: e.target.value })} placeholder="Type metric name" />
                  ) : (
                    <Select
                      value={targetForm.metric_name}
                      onValueChange={(v) => {
                        const nextMetricValues = getMetricFormValues(v, targetForm.period);
                        setTargetForm({
                          ...targetForm,
                          metric_name: v,
                          target_value: nextMetricValues?.target_value ?? (v === "__custom__" ? targetForm.target_value : ""),
                          points_per_unit: nextMetricValues?.points_per_unit ?? (v === "__custom__" ? targetForm.points_per_unit : "1"),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <span className={cn("truncate", !targetForm.metric_name && "text-muted-foreground")}>
                          {targetForm.metric_name
                            ? targetForm.metric_name === "__custom__"
                              ? customPlaceholder
                              : targetForm.metric_name
                            : placeholderLabel}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-[320px] overflow-y-auto">
                        {selectedRole && (
                          <>
                            <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Manage {addLabel}s
                            </div>
                            {managedMetricsForKind.map((m: any) => {
                                // Display value scaled to currently-selected period (canonical stored value is monthly)
                                const monthlyDefault = Number(m.default_target ?? 0);
                                const periodDefault = scaleToPeriod(monthlyDefault, targetForm.period);
                                const draft = inlineMetricEdit[m.id];
                                const tVal = draft?.target ?? String(periodDefault);
                                const pVal = draft?.ppu ?? String(m.points_per_unit ?? 1);
                                const dirty = !!draft && (tVal !== String(periodDefault) || pVal !== String(m.points_per_unit ?? 1));
                                return (
                                <div key={m.id} className="relative group px-2 py-1.5 hover:bg-accent/50 rounded-sm">
                                  <button
                                    type="button"
                                    className="w-full text-left"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const nextMetricValues = getMetricFormValues(m.metric_name, targetForm.period);
                                      setTargetForm((prev) => ({
                                        ...prev,
                                        metric_name: m.metric_name,
                                        target_value: nextMetricValues?.target_value ?? String(scaleToPeriod(monthlyDefault, prev.period)),
                                        points_per_unit: nextMetricValues?.points_per_unit ?? String(m.points_per_unit ?? prev.points_per_unit ?? "1"),
                                      }));
                                    }}
                                  >
                                    <span className="font-medium text-sm truncate block">{m.metric_name}</span>
                                  </button>
                                  <div className="mt-1 flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      type="number"
                                      value={tVal}
                                      onChange={(e) => {
                                        const nextTarget = e.target.value;
                                        setInlineMetricEdit((prev) => ({ ...prev, [m.id]: { target: nextTarget, ppu: pVal } }));
                                        setTargetForm((prev) => ({ ...prev, metric_name: m.metric_name, target_value: nextTarget, points_per_unit: pVal }));
                                      }}
                                      className="h-7 text-xs px-2 w-20"
                                      placeholder={`Target/${targetForm.period === 'daily' ? 'day' : targetForm.period === 'weekly' ? 'wk' : 'mo'}`}
                                    />
                                    <span className="text-[10px] text-muted-foreground">×</span>
                                    <Input
                                      type="number"
                                      value={pVal}
                                      onChange={(e) => {
                                        const nextPpu = e.target.value;
                                        setInlineMetricEdit((prev) => ({ ...prev, [m.id]: { target: tVal, ppu: nextPpu } }));
                                        setTargetForm((prev) => ({ ...prev, metric_name: m.metric_name, target_value: tVal, points_per_unit: nextPpu }));
                                      }}
                                      className="h-7 text-xs px-2 w-16"
                                      placeholder="pts"
                                    />
                                    <span className="text-[10px] text-muted-foreground">pts/{m.unit}</span>
                                    {dirty && (
                                      <Button
                                        size="sm"
                                        type="button"
                                        className="h-7 px-2 text-xs ml-auto"
                                        onClick={(e) => {
                                          e.preventDefault(); e.stopPropagation();
                                          // Convert input value (in current period) back to canonical monthly
                                          const monthly = scaleToMonthly(Number(tVal) || 0, targetForm.period);
                                          quickUpsertMetric.mutate({
                                            existingId: m.id,
                                            role_id: m.role_id,
                                            metric_name: m.metric_name,
                                            unit: m.unit,
                                            default_target: monthly,
                                            points_per_unit: Number(pVal) || 1,
                                            target_kind_id: customKind?.id || null,
                                          });
                                        }}
                                      >
                                        Save
                                      </Button>
                                    )}
                                    <button
                                      type="button"
                                      title="Open full editor"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background ml-auto"
                                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        openMetricManager("edit", selectedRole, m, customKind?.id || null);
                                      }}
                                      style={{ marginLeft: dirty ? 0 : 'auto' }}
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete metric"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        if (confirm(`Delete metric "${m.metric_name}"?`)) deleteMetric.mutate(m.id);
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                                );
                              })}
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm text-primary hover:bg-accent rounded-sm"
                              onClick={(e) => {
                                e.preventDefault();
                                openMetricManager("create", selectedRole, undefined, customKind?.id || null);
                              }}
                            >
                              <Plus size={14} /> Add {addLabel}
                            </button>
                            <div className="my-1 h-px bg-border" />
                          </>
                        )}
                        {savedHere.length > 0 && (
                          <>
                            <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Saved targets — click ✎ to edit, 🗑 to delete
                            </div>
                            {savedHere.map((t: any) => {
                              const emp = employees.find((e: any) => e.id === t.employee_id);
                              return (
                                <div key={t.id} className="relative group">
                                  <SelectItem value={t.metric_name} className="pr-16">
                                    <span className="font-medium truncate block">{t.metric_name}</span>
                                    <span className="text-[10px] text-muted-foreground truncate block">
                                      {emp?.first_name} {emp?.last_name} · {t.target_type} · {Number(t.target_value).toLocaleString()} · {t.points_per_unit} pts
                                    </span>
                                  </SelectItem>
                                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Edit"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background"
                                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        setEditingTargetId(t.id);
                                        setTargetForm((prev) => ({
                                          ...prev,
                                          employee_id: t.employee_id,
                                          period: t.target_type,
                                          metric_kind: isKpi ? "kpi" : "treatment",
                                          metric_name: t.metric_name,
                                          target_value: String(t.target_value),
                                          points_per_unit: String(t.points_per_unit),
                                        }));
                                      }}
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        if (confirm(`Delete target "${t.metric_name}"?`)) deleteEmployeeTarget.mutate(t.id);
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="my-1 h-px bg-border" />
                            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {isKpi ? "Add new KPI" : "Add new treatment"}
                            </div>
                          </>
                        )}
                        {presets.map((p) => {
                          const managed = managedMetricsForKind.find((m: any) => m.metric_name === p);
                          if (!selectedRole) return <SelectItem key={p} value={p}>{p}</SelectItem>;
                          // Skip presets that are already shown in the managed section above
                          if (managed) return null;
                          const draftKey = `new:${p}`;
                          const draft = inlineMetricEdit[draftKey];
                          const tVal = draft?.target ?? "";
                          const pVal = draft?.ppu ?? "1";
                          const dirty = !!draft && tVal !== "" && (Number(tVal) > 0);
                          return (
                            <div key={p} className="relative group px-2 py-1.5 hover:bg-accent/50 rounded-sm">
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const nextMetricValues = getMetricFormValues(p, targetForm.period);
                                  setTargetForm((prev) => ({
                                    ...prev,
                                    metric_name: p,
                                    target_value: nextMetricValues?.target_value ?? "",
                                    points_per_unit: nextMetricValues?.points_per_unit ?? "1",
                                  }));
                                }}
                              >
                                <span className="font-medium text-sm truncate block">{p}</span>
                              </button>
                              <div className="mt-1 flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                <Input
                                  type="number"
                                  value={tVal}
                                  onChange={(e) => {
                                    const nextTarget = e.target.value;
                                    setInlineMetricEdit((prev) => ({ ...prev, [draftKey]: { target: nextTarget, ppu: pVal } }));
                                    setTargetForm((prev) => ({ ...prev, metric_name: p, target_value: nextTarget, points_per_unit: pVal }));
                                  }}
                                  className="h-7 text-xs px-2 w-20"
                                  placeholder={`Target/${targetForm.period === 'daily' ? 'day' : targetForm.period === 'weekly' ? 'wk' : 'mo'}`}
                                />
                                <span className="text-[10px] text-muted-foreground">×</span>
                                <Input
                                  type="number"
                                  value={pVal}
                                  onChange={(e) => {
                                    const nextPpu = e.target.value;
                                    setInlineMetricEdit((prev) => ({ ...prev, [draftKey]: { target: tVal, ppu: nextPpu } }));
                                    setTargetForm((prev) => ({ ...prev, metric_name: p, target_value: tVal, points_per_unit: nextPpu }));
                                  }}
                                  className="h-7 text-xs px-2 w-16"
                                  placeholder="pts"
                                />
                                <span className="text-[10px] text-muted-foreground">pts/{isKpi ? "%" : "count"}</span>
                                {dirty && (
                                  <Button
                                    size="sm"
                                    type="button"
                                    className="h-7 px-2 text-xs ml-auto"
                                    onClick={(e) => {
                                      e.preventDefault(); e.stopPropagation();
                                      const monthly = scaleToMonthly(Number(tVal) || 0, targetForm.period);
                                      quickUpsertMetric.mutate({
                                        role_id: selectedRole.id,
                                        metric_name: p,
                                        unit: isKpi ? "%" : "count",
                                        default_target: monthly,
                                        points_per_unit: Number(pVal) || 1,
                                        target_kind_id: customKind?.id || null,
                                      });
                                    }}
                                  >
                                    Save
                                  </Button>
                                )}
                                <button
                                  type="button"
                                  title="Open full editor"
                                  className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background"
                                  style={{ marginLeft: dirty ? 0 : 'auto' }}
                                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onClick={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    openMetricManager("create", selectedRole, { metric_name: p, unit: isKpi ? "%" : "count", default_target: 0, points_per_unit: 1, weight: 1 }, customKind?.id || null);
                                  }}
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  title="Delete"
                                  className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onClick={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    if (!confirm(`Remove "${p}" from this role's list?`)) return;
                                    hidePreset.mutate({ role_id: selectedRole.id, preset_name: p, preset_kind: presetKindLabel });
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {isKpi && <SelectItem value="__custom__">+ Custom metric…</SelectItem>}
                      </SelectContent>
                    </Select>
                  )}
                  {targetForm.metric_name === "__custom__" && (
                    <Input
                      className="mt-2"
                      autoFocus
                      placeholder="Enter custom KPI name"
                      onChange={(e) => setTargetForm({ ...targetForm, metric_name: e.target.value })}
                    />
                  )}
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{targetForm.metric_kind === "revenue" ? "Target Revenue (₹)" : "Target Count"}</Label>
                <Input
                  type="number"
                  value={targetForm.target_value}
                  onChange={(e) => setTargetForm({ ...targetForm, target_value: e.target.value })}
                  placeholder={targetForm.metric_kind === "revenue" ? "e.g. 500000" : "e.g. 20"}
                />
              </div>
              <div>
                <Label>Points per {targetForm.metric_kind === "revenue" ? "₹1,000" : "Unit"}</Label>
                <Input
                  type="number"
                  value={targetForm.points_per_unit}
                  onChange={(e) => setTargetForm({ ...targetForm, points_per_unit: e.target.value })}
                  placeholder="e.g. 5"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Achieved is auto-pulled from completed treatments & billings under this doctor's name in the selected period.
            </p>
            <div className="flex gap-2">
              {editingTargetId && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setEditingTargetId(null);
                    setTargetForm({ employee_id: "", period: "monthly", metric_kind: "treatment", metric_name: "", target_value: "", points_per_unit: "1", custom_kind_id: "" });
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={() => editingTargetId ? updateEmployeeTarget.mutate() : setEmployeeTarget.mutate()}
                disabled={!targetForm.employee_id || !targetForm.target_value || ((targetForm.metric_kind === "treatment" || targetForm.metric_kind === "kpi") && (!targetForm.metric_name || targetForm.metric_name === "__custom__"))}
              >
                {editingTargetId ? "Update Target" : "Save Target"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* View-only Achieved Breakdown Dialog */}
      <Dialog open={!!viewBreakdown} onOpenChange={(v) => !v && setViewBreakdown(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={16} /> Achieved Breakdown
            </DialogTitle>
          </DialogHeader>
          {viewBreakdown && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <div>KPI: <span className="font-medium text-foreground">{viewBreakdown.metric_name}</span></div>
                <div>Range: <span className="font-medium text-foreground">{format(new Date(viewBreakdown.visibleFrom), "dd MMM yyyy")} → {format(new Date(viewBreakdown.visibleTo), "dd MMM yyyy")}</span></div>
              </div>
              <div className="border border-border rounded-md max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Source</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Detail</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewBreakdownRows.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">No achievements recorded in this range.</td></tr>
                    ) : viewBreakdownRows.map((r, i) => (
                      <tr key={i} className="hover:bg-secondary/30">
                        <td className="px-3 py-2 text-xs">{format(new Date(r.date), "dd MMM yyyy")}</td>
                        <td className="px-3 py-2 text-xs">{r.source}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[160px]">{r.detail || "—"}</td>
                        <td className="px-3 py-2 text-xs text-right font-medium text-success">
                          {viewBreakdown.isRevenue ? `₹${Number(r.value).toLocaleString("en-IN")}` : Number(r.value).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {viewBreakdownRows.length > 0 && (
                    <tfoot className="bg-secondary/30">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-right">Total</td>
                        <td className="px-3 py-2 text-xs text-right font-bold text-success">
                          {viewBreakdown.isRevenue
                            ? `₹${viewBreakdownRows.reduce((s, r) => s + r.value, 0).toLocaleString("en-IN")}`
                            : viewBreakdownRows.reduce((s, r) => s + r.value, 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">View-only. Use the edit (pencil) action in the table to modify values.</p>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setViewBreakdown(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Achieved (manual override) Dialog */}
      <Dialog open={!!editAchieved} onOpenChange={(v) => !v && setEditAchieved(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={16} /> Edit Achieved Value
            </DialogTitle>
          </DialogHeader>
          {editAchieved && (() => {
            const dayLogs = (editAchievedDayLogs || []) as { achieved_date: string; achieved_value: number }[];
            const totalAchieved = Number((dayLogs.reduce((s, r) => s + Number(r.achieved_value || 0), 0)).toFixed(2));
            const existingForDate = dayLogs.find((r) => r.achieved_date === editAchieved.dailyDate);
            return (
              <div className="space-y-4">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>KPI: <span className="font-medium text-foreground">{editAchieved.metric_name}</span></div>
                  <div>Range: <span className="font-medium text-foreground">{format(new Date(editAchieved.visibleFrom), "dd MMM yyyy")} → {format(new Date(editAchieved.visibleTo), "dd MMM yyyy")}</span></div>
                  <div>Total achieved (sum of daily): <span className="font-medium text-foreground">{totalAchieved.toLocaleString("en-IN")}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={editAchieved.dailyDate}
                      min={editAchieved.visibleFrom}
                      max={editAchieved.visibleTo}
                      onChange={(e) => {
                        const d = e.target.value;
                        const existing = dayLogs.find((r) => r.achieved_date === d);
                        setEditAchieved({ ...editAchieved, dailyDate: d, value: existing ? String(existing.achieved_value) : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Value for this day</Label>
                    <Input
                      type="number"
                      value={editAchieved.value}
                      placeholder={existingForDate ? String(existingForDate.achieved_value) : "0"}
                      onChange={(e) => setEditAchieved({ ...editAchieved, value: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Star size={10} className="text-warning fill-warning" />
                  Each entry is stored for that day only. The total achieved is the sum of all daily entries.
                </p>

                {dayLogs.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                    {dayLogs.map((r) => (
                      <div key={r.achieved_date} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">{format(new Date(r.achieved_date), "dd MMM yyyy")}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{Number(r.achieved_value).toLocaleString("en-IN")}</span>
                          <Button
                            size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                            onClick={() => setEditAchieved({ ...editAchieved, dailyDate: r.achieved_date, value: String(r.achieved_value) })}
                          >Edit</Button>
                          <Button
                            size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-destructive"
                            onClick={() => updateAchievedMutation.mutate({ id: editAchieved.id, value: 0, dailyDate: r.achieved_date })}
                            disabled={updateAchievedMutation.isPending}
                          >Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between gap-2 pt-2">
                  <div>
                    {editAchieved.isOverride && (
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={() => updateAchievedMutation.mutate({ id: editAchieved.id, value: null })}
                        disabled={updateAchievedMutation.isPending}
                      >Reset to Auto</Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditAchieved(null)}>Close</Button>
                    <Button
                      type="button" size="sm"
                      onClick={() => updateAchievedMutation.mutate({
                        id: editAchieved.id,
                        value: Number(editAchieved.value || 0),
                        dailyDate: editAchieved.dailyDate,
                      })}
                      disabled={updateAchievedMutation.isPending || !editAchieved.dailyDate}
                    >Save day</Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function DoctorMonthlyChart({ data }: { data: { label: string; treatments: number; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
        <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
        <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
        <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey="treatments" fill="hsl(var(--primary))" name="Treatments" radius={[4,4,0,0]} />
        <Bar yAxisId="right" dataKey="revenue" fill="hsl(var(--success))" name="Revenue (₹)" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default Operations;

