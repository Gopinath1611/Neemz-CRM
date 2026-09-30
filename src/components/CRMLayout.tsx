import { NavLink, Outlet, useLocation } from "react-router-dom";
import BranchSwitcher from "@/components/branch/BranchSwitcher";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Phone,
  PhoneMissed,
  MessageSquare,
  Settings,
  UserPlus,
  Package,
  Boxes,
  CalendarDays,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Bell,
  Search,
  Star,
  Share2,
  Instagram,
  BarChart3,
  MapPin,
  Clock,
  Stethoscope,
  FlaskConical,
  MonitorPlay,
  ShoppingCart,
  Wallet,
  Building2,
  Landmark,
  Megaphone,
  IndianRupee,
  UserCog,
  CalendarCheck,
  CalendarOff,
  BadgeIndianRupee,
  Receipt,
  CreditCard,
  FileText,
  PieChart,
  TrendingDown,
  Target,
  Award,
  Trophy,
  ShieldCheck,
  Trash2,
  ClipboardCheck,
  Pill,
  Mail,
  Workflow,
  PhoneCall,
  Zap,
  Tent,
  Ticket,
  Handshake,
  Calculator,
  Smartphone,
  Globe,
  Briefcase,
  Activity,
  TrendingUp,
  KeyRound,
  GraduationCap,
  Smile,
  Sparkles,
  Download,
  Home,
  BookOpen,
  Send,
  Inbox,
  Palmtree,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, type AppRole } from "@/lib/roleAccess";
import ScrollNav from "@/components/common/ScrollNav";
import { useDepartmentRoles, DEPT_HASH, slugifyRole, prettifyRole } from "@/hooks/useDepartmentRoles";

// Per-department icon + label + accent color for the Operations sub-group heading
const OPS_DEPT_META: Record<string, { label: string; icon: any; colorClass: string }> = {
  clinic: { label: "Clinic Operations", icon: Stethoscope, colorClass: "text-teal-400" },
  sales_marketing: { label: "Sales & Marketing", icon: Megaphone, colorClass: "text-amber-400" },
  finance: { label: "Finance & Accounts", icon: IndianRupee, colorClass: "text-sky-400" },
  hr: { label: "HR & Admin", icon: Users, colorClass: "text-purple-400" },
};

// Staff role → operations department (used to scope the Operations sidebar
// groups so non-admins only see their own department).
const ROLE_TO_OPS_DEPT: Record<string, string> = {
  duty_doctor: "clinic",
  dental_assistant: "clinic",
  receptionist: "clinic",
  digital_marketing_manager: "sales_marketing",
  digital_marketing_executive: "sales_marketing",
  video_editor: "sales_marketing",
  telecaller: "sales_marketing",
  dre: "sales_marketing",
  finance_manager: "finance",
  accountant: "finance",
  hr: "hr",
  hr_manager: "hr",
  hr_executive: "hr",
};


// Pick a sensible icon for a role based on its key
const iconForRole = (roleName: string): any => {
  const k = roleName.toLowerCase();
  if (k.includes("doctor")) return Stethoscope;
  if (k.includes("assistant")) return UserCog;
  if (k.includes("reception")) return Users;
  if (k.includes("housekeep")) return ShieldCheck;
  if (k.includes("video")) return MonitorPlay;
  if (k.includes("telecall") || k.includes("call")) return PhoneCall;
  if (k.includes("digital_marketing_manager") || k.includes("marketing_manager")) return Megaphone;
  if (k.includes("digital_marketing_executive") || k.includes("marketing_executive")) return Share2;
  if (k.includes("relationship")) return Handshake;
  if (k.includes("account_manager")) return Calculator;
  if (k.includes("accountant")) return Receipt;
  if (k.includes("hr_manager")) return Briefcase;
  if (k.includes("hr_executive")) return UserPlus;
  return Users;
};

const useAccessCheck = () => {
  const { roles, moduleAccess } = useAuth();
  const hasCustomAccess = Object.keys(moduleAccess).length > 0;

  return (path: string): boolean => {
    if (roles.includes("admin" as AppRole)) return true;
    if (hasCustomAccess) {
      // Strict mode: only show what admin explicitly granted.
      // Exact match for the full path (including hash sub-items like /operations#clinic-doctor)
      if (moduleAccess[path] === true) return true;
      // Allow deeper sub-paths (e.g., /settings granted shows /settings/clinic too)
      const hasSubAccess = Object.keys(moduleAccess).some(
        (key) =>
          (key.startsWith(path + "/") || key.startsWith(path + "#")) &&
          moduleAccess[key] === true
      );
      if (hasSubAccess) return true;
      // Fallback for dynamic Operations sub-items (e.g., /operations#sales-marketing-dre).
      // If admin granted the parent department hash (/operations#sales-marketing) or the
      // whole /operations module, inherit access so newly-added roles from
      // department_roles show up without needing an explicit toggle per role.
      const hashIdx = path.indexOf("#");
      if (hashIdx > 0) {
        const base = path.slice(0, hashIdx); // "/operations"
        const hash = path.slice(hashIdx + 1); // "sales-marketing-dre"
        // Try progressively shorter hash prefixes ("sales-marketing-dre" -> "sales-marketing")
        const parts = hash.split("-");
        for (let i = parts.length - 1; i > 0; i--) {
          const parentHash = parts.slice(0, i).join("-");
          if (moduleAccess[`${base}#${parentHash}`] === true) return true;
        }
        if (moduleAccess[base] === true) return true;
      }
      // Inherit access from a granted ancestor path (e.g. /settings grants
      // /settings/hrms/attendance-reports).
      const segments = path.split("#")[0].split("/").filter(Boolean);
      for (let i = segments.length - 1; i > 0; i--) {
        if (moduleAccess["/" + segments.slice(0, i).join("/")] === true) return true;
      }
      return false;
    }
    return canAccessRoute(roles as AppRole[], path);
  };
};


interface NavItem {
  to: string;
  icon: any;
  label: string;
  badge?: string;
  children?: NavItem[];
}

interface NavSubGroup {
  id: string;
  label: string;
  icon: any;
  colorClass?: string;
  items: NavItem[];
}

interface NavGroup {
  id: string;
  label: string;
  icon: any;
  items: NavItem[];
  subGroups?: NavSubGroup[];
}

export const navGroups: NavGroup[] = [
  {
    id: "clinic",
    label: "Clinic",
    icon: Building2,
    items: [
      { to: "/appointments", icon: CalendarDays, label: "Appointments" },
      { to: "/clinic-workflow", icon: Stethoscope, label: "Clinic Workflow", badge: "NEW" },
      { to: "/pending-treatments", icon: Clock, label: "Pending Treatments", badge: "NEW" },
      
      { to: "/ortho-treatment", icon: Smile, label: "Ortho Treatment", badge: "NEW" },
      { to: "/emi-insurance", icon: CreditCard, label: "EMI & Insurance", badge: "NEW" },
      
      { to: "/external-referrals", icon: FlaskConical, label: "External Referrals", badge: "NEW" },
      { to: "/patient-database", icon: Users, label: "Patient Database" },
      { to: "/lab-orders", icon: FlaskConical, label: "Lab Orders" },
      { to: "/pharmacy", icon: Pill, label: "Pharmacy" },
      { to: "/patient-education", icon: MonitorPlay, label: "Patient Education" },
      { to: "/sterilization", icon: ShieldCheck, label: "Sterilization", badge: "NEW" },
      { to: "/waste-management", icon: Trash2, label: "Waste Mgmt", badge: "NEW" },
      { to: "/inventory", icon: Package, label: "Inventory" },
      { to: "/purchases", icon: ShoppingCart, label: "Purchases" },
      { to: "/expenses", icon: Wallet, label: "Expenses" },
      { to: "/patient-portal", icon: Smartphone, label: "Patient Portal" },
    ],
    subGroups: [
      {
        id: "clinic-quality",
        label: "Quality Control",
        icon: ClipboardCheck,
        items: [
          { to: "/quality-control", icon: ShieldCheck, label: "QC Dashboard", badge: "NEW" },
          { to: "/quality-control#doctor", icon: Stethoscope, label: "Doctor Quality" },
          { to: "/quality-control#lab", icon: FlaskConical, label: "Lab Quality" },
          { to: "/quality-control#pharma", icon: Pill, label: "Pharma Quality" },
          { to: "/quality-control#housekeeping", icon: Sparkles, label: "Housekeeping Quality", badge: "NEW" },
        ],
      },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageSquare,
    items: [
      { to: "/clinic-whatsapp/inbox", icon: MessageSquare, label: "Inbox", badge: "NEW" },
      { to: "/clinic-whatsapp/single-send", icon: Send, label: "Single Send", badge: "NEW" },
    ],
  },
  {
    id: "sales",
    label: "Sales & Marketing",
    icon: Megaphone,
    subGroups: [
      {
        id: "lead-awareness",
        label: "Lead Awareness",
        icon: Megaphone,
        items: [
          { to: "/connected-platforms", icon: Globe, label: "Connected Platforms", badge: "NEW" },
          { to: "/social-media", icon: Instagram, label: "Social Media" },
          { to: "/local-seo", icon: MapPin, label: "Local SEO" },
        ],
      },
      {
        id: "lead-management",
        label: "Lead Management",
        icon: UserPlus,
        items: [
          { to: "/pipeline", icon: GitBranch, label: "Pipeline" },
          { to: "/followups", icon: CalendarCheck, label: "Follow-ups" },
          { to: "/appointments", icon: CalendarDays, label: "Appointments" },
          { to: "/call-logs", icon: Phone, label: "Call Logs" },
          { to: "/contacts", icon: Users, label: "Contacts" },
        ],
      },
      {
        id: "lead-automation",
        label: "Lead Automation",
        icon: Zap,
        items: [
          { to: "/lead-automation", icon: Zap, label: "Automation Hub", badge: "NEW" },
          { to: "/automation-email", icon: Mail, label: "Email" },
          { to: "/automation-whatsapp", icon: MessageSquare, label: "WhatsApp API" },
          { to: "/automation-workflow", icon: Workflow, label: "Workflow" },
          { to: "/automation-sms", icon: Phone, label: "SMS" },
          { to: "/automation-ivr", icon: PhoneCall, label: "IVR" },
        ],
      },
      {
        id: "offline-campaigns",
        label: "Offline Campaigns",
        icon: Tent,
        items: [
          { to: "/offline-campaigns", icon: LayoutDashboard, label: "CEO Dashboard", badge: "NEW" },
          { to: "/offline-campaigns#institutions", icon: Building2, label: "Institutions" },
          { to: "/offline-campaigns#campaigns", icon: Target, label: "Campaigns" },
          { to: "/offline-campaigns#leads", icon: Users, label: "Screening Leads" },
          { to: "/offline-campaigns#coupons", icon: Ticket, label: "Coupons & Offers" },
          { to: "/offline-campaigns#followups", icon: PhoneCall, label: "Follow-ups" },
          { to: "/offline-campaigns#partnerships", icon: Handshake, label: "Corporate Partners" },
          { to: "/offline-campaigns#roi", icon: Calculator, label: "ROI Calculator" },
        ],
      },
    ],
    items: [
      { to: "/referrals", icon: Share2, label: "Referrals" },
      { to: "/reviews", icon: Star, label: "Reviews" },
      { to: "/whatsapp", icon: MessageSquare, label: "WhatsApp" },
    ],
  },
  {
    id: "fy-projection",
    label: "FY Projection",
    icon: Target,
    items: [
      { to: "/fy-projection/overview", icon: PieChart, label: "Overview", badge: "NEW" },
    ],
    subGroups: [
      {
        id: "fy-clinic",
        label: "Clinic Module",
        icon: Stethoscope,
        items: [
          { to: "/fy-projection/clinic/patient", icon: Users, label: "Patient Target" },
          { to: "/fy-projection/clinic/treatment", icon: Stethoscope, label: "Treatment Target" },
          { to: "/fy-projection/clinic/chair", icon: Activity, label: "Chair Utilization" },
          { to: "/fy-projection/clinic/doctor", icon: UserCog, label: "Doctor Target" },
        ],
      },
      {
        id: "fy-marketing",
        label: "Marketing Module",
        icon: Megaphone,
        items: [
          { to: "/fy-projection/marketing/ads", icon: Megaphone, label: "Ad Target" },
          { to: "/fy-projection/marketing/social", icon: Instagram, label: "Social Media Target" },
          { to: "/fy-projection/marketing/camps", icon: Tent, label: "Offline Camp Target" },
        ],
      },
      {
        id: "fy-sales",
        label: "Sales Module",
        icon: TrendingUp,
        items: [
          { to: "/fy-projection/sales/target", icon: Target, label: "Sales Target" },
          { to: "/fy-projection/sales/pre", icon: Target, label: "PRE Target" },
          { to: "/fy-projection/sales/treatment", icon: Target, label: "Treatment-wise Target" },
        ],
      },
      {
        id: "fy-recruitment",
        label: "Recruitment Module",
        icon: UserCog,
        items: [
          { to: "/fy-projection/recruitment/plan", icon: UserPlus, label: "Recruitment Target" },
        ],
      },
      {
        id: "fy-finance",
        label: "Finance Module",
        icon: IndianRupee,
        items: [
          { to: "/fy-projection/finance/topline", icon: TrendingUp, label: "Topline" },
          { to: "/fy-projection/finance/treatment-revenue", icon: Stethoscope, label: "Treatment Revenue" },
          { to: "/fy-projection/finance/digital-roi", icon: Megaphone, label: "Digital Marketing ROI" },
          { to: "/fy-projection/finance/offline-roi", icon: MapPin, label: "Offline Camp ROI" },
        ],
      },
      {
        id: "fy-plans",
        label: "Plans & Reports",
        icon: CalendarDays,
        items: [
          { to: "/fy-projection/monthly", icon: CalendarDays, label: "Monthly Plan" },
          { to: "/fy-projection/profit", icon: TrendingUp, label: "Profit Forecast" },
          { to: "/fy-projection/variance", icon: BarChart3, label: "Variance" },
        ],
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: IndianRupee,
    items: [
      { to: "/finance", icon: PieChart, label: "Finance Dashboard", badge: "NEW" },
      { to: "/cash-drawer", icon: Wallet, label: "Cash Drawer", badge: "NEW" },
      { to: "/finance/deposits", icon: Landmark, label: "Deposits" },
      { to: "/finance#revenue", icon: IndianRupee, label: "Revenue" },
      { to: "/finance#billing", icon: Receipt, label: "Billing & Invoicing" },
      { to: "/finance#payments", icon: CreditCard, label: "Payments" },
      { to: "/finance#receivables", icon: Clock, label: "Receivables" },
      { to: "/finance#expenses", icon: TrendingDown, label: "Expenses" },
      { to: "/finance#pnl", icon: Target, label: "Profit & Loss" },
      { to: "/finance#vendor", icon: ShoppingCart, label: "Vendor Payments" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Users,
    items: [],
    subGroups: [
      // Per-department role sub-groups are injected dynamically from
      // department_roles in CRMLayout (so newly added roles appear here live).
    ],
  },
  {
    id: "hrms",
    label: "HRMS",
    icon: UserCog,
    items: [
      { to: "/hrms/home", icon: Home, label: "Home" },
      {
        to: "/hrms/inbox",
        icon: Inbox,
        label: "Inbox",
        children: [
          { to: "/hrms/inbox/leaves", icon: Palmtree, label: "Leaves" },
          { to: "/hrms/inbox/comp-off", icon: CalendarCheck, label: "Comp off request" },
          { to: "/hrms/inbox/expenses", icon: Receipt, label: "Expenses & reimbursements" },
          { to: "/hrms/inbox/attendance", icon: ClipboardCheck, label: "Attendance Tracker" },
        ],
      },
      { to: "/employees", icon: Users, label: "Employees" },
      { to: "/recruitment", icon: Briefcase, label: "Recruitment", badge: "NEW" },
      { to: "/licenses", icon: KeyRound, label: "License & Renewals", badge: "NEW" },
      { to: "/job-descriptions", icon: Briefcase, label: "Job Descriptions", badge: "NEW" },
      { to: "/training", icon: GraduationCap, label: "Training", badge: "NEW" },
      { to: "/document-management", icon: FileText, label: "Document Management", badge: "NEW" },
      { to: "/assets", icon: Boxes, label: "Assets", badge: "NEW" },
    ],
    subGroups: [

      {
        id: "hrms-attendance",
        label: "Attendance",
        icon: CalendarCheck,
        items: [
          { to: "/attendance/my", icon: Clock, label: "My Attendance" },
          { to: "/attendance/team", icon: Users, label: "My Team Attendance" },
          { to: "/attendance/my-shift", icon: Clock, label: "My Shift" },
          { to: "/attendance/team-shift", icon: Users, label: "My Team Shift" },
        ],
      },
      {
        id: "hrms-leave",
        label: "Leave Management",
        icon: CalendarOff,
        items: [
          { to: "/leave/my", icon: CalendarOff, label: "My Leaves" },
          { to: "/leave/team", icon: Users, label: "My Team Leaves" },
          { to: "/leave/holidays", icon: CalendarDays, label: "Holidays" },
          { to: "/leave/rollover", icon: ChevronRight, label: "Leave Roll Over" },
          { to: "/leave/comp-off", icon: Award, label: "Comp Off Request" },
          { to: "/leave/customization", icon: Settings, label: "Customization Balance" },
        ],
      },
      {
        id: "hrms-payroll",
        label: "Payroll & Payslips",
        icon: BadgeIndianRupee,
        items: [
          { to: "/payroll", icon: BarChart3, label: "Dashboard" },
          { to: "/payroll/payruns", icon: Calculator, label: "Payruns" },
          { to: "/payroll/form-16", icon: FileText, label: "Form 16" },
          { to: "/payroll/payslips", icon: Receipt, label: "Payslips" },
          
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    items: [],
    subGroups: [
      {
        id: "reports-sales-marketing",
        label: "Sales & Marketing Reports",
        icon: Megaphone,
        items: [
          { to: "/reports/lead-generation", icon: BarChart3, label: "Lead Generation Reports", badge: "NEW" },
          { to: "/reports/lead-awareness", icon: Megaphone, label: "Lead Awareness Reports" },
          {
            to: "/call-logs",
            icon: PhoneCall,
            label: "Telecaller Reports",
            children: [
              { to: "/reports/telecaller/periodic", icon: BarChart3, label: "Periodic Reports" },
              { to: "/call-logs#employee-reports", icon: UserCog, label: "Employee Reports" },
            ],
          },
          { to: "/reports/sales-marketing/download-reports", icon: Download, label: "Download Reports", badge: "NEW" },
        ],
      },
      {
        id: "reports-clinical",
        label: "Clinical Reports",
        icon: Stethoscope,
        items: [
          { to: "/download-reports", icon: Download, label: "Download Reports" },
          { to: "/productivity-report", icon: Activity, label: "Productivity Report" },
        ],
      },
      {
        id: "reports-finance",
        label: "Finance Reports",
        icon: IndianRupee,
        items: [
          { to: "/finance/download-reports", icon: Download, label: "Download Reports" },
        ],
      },
      {
        id: "reports-hr",
        label: "HR Reports",
        icon: UserCog,
        items: [
          { to: "/hrms/reports?tab=organization", icon: Building2, label: "Organization Reports" },
          { to: "/hrms/reports?tab=attendance", icon: Clock, label: "Attendance Tracker" },
          { to: "/hrms/reports?tab=leave", icon: CalendarOff, label: "Leave Tracker" },
          { to: "/hrms/reports?tab=payroll", icon: BadgeIndianRupee, label: "Payroll Reports" },
          { to: "/hrms/reports?tab=statutory", icon: ShieldCheck, label: "Statutory Reports" },
          { to: "/reports/hrms/download-reports", icon: Download, label: "Download Reports", badge: "NEW" },
        ],
      },
      {
        id: "reports-operations",
        label: "Operations Reports",
        icon: Users,
        items: [
          { to: "/reports/operations/download-reports", icon: Download, label: "Download Reports", badge: "NEW" },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    items: [{ to: "/settings", icon: Settings, label: "General Settings" }],
    subGroups: [
      {
        id: "settings-hrms",
        label: "HRMS Settings",
        icon: UserCog,
        items: [
          { to: "/attendance/geo-fencing", icon: MapPin, label: "Geo Fencing" },
          { to: "/settings/hrms/attendance-reports", icon: Clock, label: "Attendance Tracker Reports Settings" },
          { to: "/settings/hrms/leave-reports", icon: CalendarOff, label: "Leave Tracker Reports Settings" },
          { to: "/settings/hrms/payroll-reports", icon: BadgeIndianRupee, label: "Payroll Reports Settings" },
        ],
      },
    ],
  },
  {
    id: "admin-governance",
    label: "Admin & Governance",
    icon: ShieldCheck,
    items: [],
    subGroups: [
      {
        id: "admin-activity",
        label: "Monitoring",
        icon: Activity,
        items: [
          { to: "/user-activity-monitor", icon: Activity, label: "User Activity Monitor", badge: "NEW" },
        ],
      },
      {
        id: "admin-insights",
        label: "Insights & Documentation",
        icon: BookOpen,
        items: [
          { to: "/analytics", icon: BarChart3, label: "AI Analytics" },
          { to: "/user-manual", icon: BookOpen, label: "User Manual" },
          { to: "/system-documentation", icon: FileText, label: "System Documentation" },
        ],
      },
    ],
  },
];

const standaloneItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/operations", icon: BarChart3, label: "Operations Dashboard", badge: "NEW" },
];

const bottomItems: NavItem[] = [
  // AI Analytics, User Manual and System Documentation moved to
  // Admin & Governance → Insights & Documentation
];

const CRMLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const { user, roles, signOut } = useAuth();
  const checkAccess = useAccessCheck();
  const [attPending, setAttPending] = useState(0);
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count } = await supabase
        .from("attendance_regularization_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setAttPending(count ?? 0);
    };
    load();
    const ch = supabase
      .channel("att-reg-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_regularization_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const flattenNavItems = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => [item, ...flattenNavItems(item.children ?? [])]);

  // Hash-aware active matching: hash items (e.g. /operations#clinic-doctor)
  // only count as active when both the pathname and the hash match.
  const isPathActive = (to: string) => {
    const [rawPath, rawHash] = to.split("#");
    const itemPath = rawPath || to;
    if (rawHash !== undefined) {
      const pathMatches =
        location.pathname === itemPath || location.pathname.startsWith("/employees/");
      return pathMatches && location.hash === `#${rawHash}`;
    }
    const basePath = itemPath.split("?")[0];
    return location.pathname === basePath;
  };

  // Auto-expand groups that contain the active route
  const getInitialOpen = () => {
    const open: Record<string, boolean> = {};
    navGroups.forEach((g) => {
      const allItems = [
        ...flattenNavItems(g.items),
        ...(g.subGroups?.flatMap((sg) => flattenNavItems(sg.items)) ?? []),
      ];
      const hasActive = allItems.some((item) => {
        const itemPath = item.to.split("#")[0] || item.to;
        return location.pathname === itemPath;
      });
      open[g.id] = hasActive;
      g.subGroups?.forEach((sg) => {
        open[sg.id] = flattenNavItems(sg.items).some((item) => isPathActive(item.to));
        sg.items.forEach((item) => {
          if (item.children?.some((child) => isPathActive(child.to))) open[`nav-${item.to}`] = true;
        });
      });
    });
    return open;
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(getInitialOpen);

  // Live-fetched department roles → become Operations sub-groups so any role
  // added in Settings/Operations role manager appears here automatically.
  const { data: deptRolesLive = [] } = useDepartmentRoles();

  // Departments the current user is allowed to see in Operations.
  // Admin (or users with no mappable role) see everything.
  const allowedOpsDepts = useMemo<Set<string> | null>(() => {
    if (roles.includes("admin" as AppRole)) return null;
    const depts = roles
      .map((r) => ROLE_TO_OPS_DEPT[r as string])
      .filter(Boolean) as string[];
    return depts.length ? new Set(depts) : null;
  }, [roles]);

  const effectiveNavGroups = useMemo<NavGroup[]>(() => {
    // Group roles by department
    const byDept = new Map<string, typeof deptRolesLive>();
    deptRolesLive.forEach((r) => {
      if (!r.is_active) return;
      const arr = byDept.get(r.department) ?? [];
      arr.push(r);
      byDept.set(r.department, arr);
    });

    const dynamicSubGroups: NavSubGroup[] = [];
    // Preserve a stable department order
    const deptOrder = ["clinic", "sales_marketing", "finance", "hr"];
    const allDepts = [
      ...deptOrder.filter((d) => byDept.has(d)),
      ...Array.from(byDept.keys()).filter((d) => !deptOrder.includes(d)),
    ].filter((d) => !allowedOpsDepts || allowedOpsDepts.has(d));
    allDepts.forEach((dept) => {
      const meta = OPS_DEPT_META[dept] ?? {
        label: prettifyRole(dept),
        icon: Users,
        colorClass: "text-sidebar-foreground/70",
      };
      const hashPrefix = DEPT_HASH[dept] ?? dept.replace(/_/g, "-");
      const items: NavItem[] = (byDept.get(dept) ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => ({
          to: `/operations#${hashPrefix}-${slugifyRole(r.role_name)}`,
          icon: iconForRole(r.role_name),
          label: r.display_label?.trim() || prettifyRole(r.role_name),
        }));
      // Keep Meetings inside HR & Admin section as requested
      if (dept === "hr") {
        items.push({ to: "/meetings", icon: CalendarDays, label: "Meetings", badge: "NEW" });
      }
      if (items.length === 0) return;
      dynamicSubGroups.push({
        id: `operations-${hashPrefix}`,
        label: meta.label,
        icon: meta.icon,
        colorClass: meta.colorClass,
        items,
      });
    });

    return navGroups.map((g) => {
      if (g.id !== "operations") return g;
      return {
        ...g,
        subGroups: [...dynamicSubGroups],
      };
    });
  }, [deptRolesLive, allowedOpsDepts]);


  // Keep the parent group + sub-group of the active item expanded (never
  // collapses anything the user opened manually).
  useEffect(() => {
    const toOpen: Record<string, boolean> = {};
    effectiveNavGroups.forEach((g) => {
      const groupHasActive =
        flattenNavItems(g.items).some((i) => isPathActive(i.to)) ||
        (g.subGroups ?? []).some((sg) => flattenNavItems(sg.items).some((i) => isPathActive(i.to)));
      if (groupHasActive) toOpen[g.id] = true;
      (g.subGroups ?? []).forEach((sg) => {
        if (flattenNavItems(sg.items).some((i) => isPathActive(i.to))) toOpen[sg.id] = true;
        sg.items.forEach((item) => {
          if (item.children?.some((child) => isPathActive(child.to))) toOpen[`nav-${item.to}`] = true;
        });
      });
    });
    if (Object.keys(toOpen).length === 0) return;
    setOpenGroups((prev) => {
      const missing = Object.keys(toOpen).some((k) => !prev[k]);
      return missing ? { ...prev, ...toOpen } : prev;
    });
  }, [location.pathname, location.hash, effectiveNavGroups]);


  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNavItem = (item: NavItem) => {
    const hasHash = item.to.includes("#");
    let itemPath = item.to.split("#")[0] || item.to;
    const itemHash = item.to.split("#")[1] || "";

    // Detailed Employee deep links: route to last viewed employee detail page
    let resolvedTo = item.to;
    if (itemPath === "/employees" && hasHash) {
      const lastId = typeof window !== "undefined" ? localStorage.getItem("last_employee_id") : null;
      if (lastId) {
        resolvedTo = `/employees/${lastId}#${itemHash}`;
      }
    }

    const isItemActive = hasHash
      ? (location.pathname === itemPath || location.pathname.startsWith("/employees/")) && location.hash === `#${itemHash}`
      : item.to === "/" ? location.pathname === "/" : location.pathname === item.to;

    return (
      <NavLink
        key={item.to}
        to={resolvedTo}
        end={item.to === "/"}
        onClick={(e) => {
          if (itemPath === "/employees" && hasHash && resolvedTo === item.to) {
            // No employee selected yet — go to list so user can pick
            e.preventDefault();
            window.location.href = "/employees";
            return;
          }
          setSidebarOpen(false);
        }}
        title={sidebarCollapsed ? item.label : undefined}
        className={() =>
          `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
            sidebarCollapsed ? "justify-center px-2" : ""
          } ${
            isItemActive
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          }`
        }
      >
      <item.icon size={16} className="shrink-0" />
      {!sidebarCollapsed && item.label}
      {!sidebarCollapsed && (item.to === "/hrms/inbox/attendance" ? (attPending ? String(attPending) : undefined) : item.badge) && (
        <Badge className="ml-auto bg-accent/20 text-accent text-[10px] px-1.5 py-0 border-0">
          {item.to === "/hrms/inbox/attendance" ? attPending : item.badge}
        </Badge>
      )}
    </NavLink>
    );
  };

  const renderNestedNavItem = (item: NavItem) => {
    if (!item.children?.length) return renderNavItem(item);
    const nestedId = `nav-${item.to}`;
    const isOpen = openGroups[nestedId] ?? false;
    const hasActive = item.children.some((child) => isPathActive(child.to));
    return (
      <div key={nestedId}>
        <button
          type="button"
          onClick={() => toggleGroup(nestedId)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
            hasActive
              ? "bg-sidebar-accent/50 text-primary"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          }`}
        >
          <item.icon size={16} className="shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {isOpen && (
          <div className="ml-3 mt-1 space-y-1 border-l border-sidebar-border/30 pl-2">
            {item.children.map(renderNavItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 lg:static lg:translate-x-0 ${
          sidebarCollapsed ? "w-16" : "w-64"
        } ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-primary">
            <span className="text-sm font-bold text-primary-foreground font-display">DN</span>
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-sidebar-primary-foreground font-display truncate">
                Dr Neemz
              </h1>
              <p className="text-xs text-sidebar-foreground/60 truncate">Dentistry · Salem</p>
            </div>
          )}
          <button
            className="ml-auto lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Collapse toggle arrow */}
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="hidden lg:flex items-center justify-center h-8 mx-2 mt-2 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft size={18} className={`transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`} />
          {!sidebarCollapsed && <span className="text-xs ml-1">Minimize</span>}
        </button>

        <nav className="flex-1 overflow-y-auto scrollable px-3 py-4 space-y-3 scroll-smooth">
          {/* Dashboard */}
          {standaloneItems.filter(i => checkAccess(i.to)).map(renderNavItem)}

          {/* Grouped modules */}
          {effectiveNavGroups.map((group) => {
            const isAdmin = roles.includes("admin" as AppRole);
            // Admin-only HRMS items (non-admin staff only see personal items)
            const ADMIN_ONLY_HRMS_PATHS = new Set<string>([
              "/recruitment", "/licenses", "/job-descriptions", "/training", "/document-management",
              "/attendance/team", "/attendance/team-shift", "/attendance/geo-fencing",
              "/leave/team", "/leave/rollover", "/leave/customization",
              "/payroll", "/payroll/payruns", "/payroll/form-16",
            ]);
            const ADMIN_ONLY_SUBGROUPS = new Set<string>(["hrms-detailed-employee", "hrms-reports"]);
            const isHrmsAdminOnly = (to: string) =>
              ADMIN_ONLY_HRMS_PATHS.has(to) || to.startsWith("/hrms/reports") || to.startsWith("/employees#");

            const visibleItems = group.items.filter(
              (i) => checkAccess(i.to) && (isAdmin || !isHrmsAdminOnly(i.to))
            );
            const visibleSubGroups = (group.subGroups ?? [])
              .filter((sg) => isAdmin || !ADMIN_ONLY_SUBGROUPS.has(sg.id))
              .map((sg) => ({
                ...sg,
                items: sg.items.reduce<NavItem[]>((items, item) => {
                  const children = item.children?.filter(
                    (child) => checkAccess(child.to) && (isAdmin || !isHrmsAdminOnly(child.to)),
                  );
                  if ((checkAccess(item.to) && (isAdmin || !isHrmsAdminOnly(item.to))) || children?.length) {
                    items.push({ ...item, children });
                  }
                  return items;
                }, []),
              }))
              .filter((sg) => sg.items.length > 0);

            if (visibleItems.length === 0 && visibleSubGroups.length === 0) return null;

            const flatVisibleItems = flattenNavItems(visibleItems);
            const allGroupItems = group.id === "sales"
              ? [...visibleSubGroups.flatMap((sg) => flattenNavItems(sg.items)), ...flatVisibleItems]
              : [...flatVisibleItems, ...visibleSubGroups.flatMap((sg) => flattenNavItems(sg.items))];
            const isOpen = openGroups[group.id] ?? false;
            const hasActive = allGroupItems.some((item) => isPathActive(item.to));

            return (
              <div key={group.id} className="py-1">
                {sidebarCollapsed ? (
                  <div className="flex flex-col items-center gap-1">
                    <div
                      title={group.label}
                      className={`flex items-center justify-center w-10 h-8 rounded-md text-[9px] font-bold uppercase tracking-wider mb-1 ${
                        hasActive ? "text-primary bg-sidebar-accent/40" : "text-sidebar-foreground/40"
                      }`}
                    >
                      <group.icon size={14} />
                    </div>
                    {allGroupItems.map(renderNavItem)}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                        hasActive
                          ? "text-primary bg-sidebar-accent/40"
                          : "text-sidebar-foreground/65 hover:text-sidebar-foreground/95 hover:bg-sidebar-accent/30"
                      }`}
                    >
                      <group.icon size={15} className="shrink-0" />
                      <span className="flex-1 text-left">{group.label}</span>
                      {isOpen ? (
                        <ChevronDown size={14} className="shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="ml-2 pl-2 border-l border-sidebar-border/40 space-y-1 mt-1 animate-accordion-down overflow-hidden">

                        {group.id === "clinic" ? (
                          <>
                            {visibleItems.map(renderNavItem)}
                            {visibleSubGroups.map((sg) => {
                              const sgOpen = openGroups[sg.id] ?? false;
                              const sgActive = flattenNavItems(sg.items).some((item) => isPathActive(item.to));
                              return (
                                <div key={sg.id}>
                                  <button
                                    onClick={() => toggleGroup(sg.id)}
                                    className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-[11px] font-semibold tracking-wide transition-colors ${
                                      sgActive
                                        ? "text-primary bg-sidebar-accent/30"
                                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground/95 hover:bg-sidebar-accent/20"
                                    }`}
                                  >
                                    <sg.icon size={13} className={cn("shrink-0", sg.colorClass)} />
                                    <span className="flex-1 text-left">{sg.label}</span>
                                    {sgOpen ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
                                  </button>
                                  {sgOpen && (
                                    <div className="ml-2 pl-2 border-l border-sidebar-border/30 space-y-1 mt-1 animate-accordion-down overflow-hidden">
                                      {sg.items.map(renderNestedNavItem)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <>
                            {group.id !== "sales" && visibleItems
                              .slice(0, group.id === "hrms" ? 3 : 1)
                              .map(group.id === "hrms" ? renderNestedNavItem : renderNavItem)}
                            {visibleSubGroups.map((sg) => {
                              const sgOpen = openGroups[sg.id] ?? false;
                              const sgActive = flattenNavItems(sg.items).some((item) => isPathActive(item.to));
                              return (
                                <div key={sg.id}>
                                  <button
                                    onClick={() => toggleGroup(sg.id)}
                                    className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-[11px] font-semibold tracking-wide transition-colors ${
                                      sgActive
                                        ? "text-primary bg-sidebar-accent/30"
                                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground/95 hover:bg-sidebar-accent/20"
                                    }`}
                                  >
                                    <sg.icon size={13} className={cn("shrink-0", sg.colorClass)} />
                                    <span className="flex-1 text-left">{sg.label}</span>
                                    {sgOpen ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
                                  </button>
                                    {sgOpen && (
                                      <div className="ml-2 pl-2 border-l border-sidebar-border/30 space-y-1 mt-1 animate-accordion-down overflow-hidden">

                                      {sg.items.map(renderNestedNavItem)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {group.id === "sales"
                              ? visibleItems.map(renderNavItem)
                              : visibleItems.slice(group.id === "hrms" ? 3 : 1).map(renderNavItem)}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Separator */}
          {(() => {
            const visibleBottom = bottomItems.filter(i => checkAccess(i.to));
            return visibleBottom.length > 0 ? (
              <div className="pt-4 mt-3 border-t border-sidebar-border space-y-1">
                {visibleBottom.map(renderNavItem)}
              </div>
            ) : null;
          })()}
        </nav>

        <div className={`border-t border-sidebar-border p-3 space-y-2 ${sidebarCollapsed ? "flex flex-col items-center" : ""}`}>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
              {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-primary-foreground truncate">
                  {user?.user_metadata?.full_name || user?.email}
                </p>
                <p className="text-xs text-sidebar-foreground/50 capitalize">
                  {roles[0]?.replace(/_/g, ' ') || 'Staff'}
                </p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground"
              onClick={signOut}
            >
              Sign Out
            </Button>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>

          {["/leads", "/patient-database", "/contacts", "/whatsapp-campaigns", "/sms-campaigns", "/email-campaigns", "/offline-campaigns"].some(p => location.pathname.startsWith(p)) ? (
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search leads, patients, campaigns..."
                className="pl-9 bg-secondary border-0 h-9 text-sm"
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}


          <div className="ml-auto flex items-center gap-2">
            <BranchSwitcher />
            <Button variant="ghost" size="icon" className="relative text-muted-foreground">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollable py-4 lg:py-6 scroll-smooth" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="page-shell">
            <Outlet />
          </div>
          <ScrollNav />
        </main>
      </div>
    </div>
  );
};

export default CRMLayout;
