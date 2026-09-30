import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
import {
  Download, FileSpreadsheet, FileText, Eye, Loader2, Users, Target, Activity,
  CalendarDays, ShieldCheck, Building2,
} from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Which shared filters a card responds to. */
type FilterKind = "employee" | "department" | "role" | "status";

interface OpsReportDef {
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
  /** Table has no FK join to employees — resolve employee details client-side. */
  needsEmpLookup?: boolean;
  /** Restricted to Admin + HR (performance / financial target data). */
  restricted?: boolean;
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

const num = (v: any) => (v == null || v === "" ? 0 : Number(v));

const empName = (r: any) =>
  [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(" ");

const empCols = (r: any) => ({
  "Employee Code": r.employees?.employee_code ?? "",
  Employee: empName(r),
  Department: r.employees?.department ?? "",
  Designation: r.employees?.designation ?? "",
});

const REPORTS: OpsReportDef[] = [
  {
    key: "staff",
    label: "Staff Directory",
    description: "Operations staff with code, department, designation, join date & status",
    icon: Users,
    table: "employees",
    dateField: "join_date",
    filters: ["employee", "department", "status"],
    filterVals: (r) => ({ employee: r.id, department: r.department, status: r.status }),
    select:
      "id,employee_code,first_name,last_name,phone,email,department,designation,employment_type,join_date,exit_date,status",
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
    }),
  },
  {
    key: "dept_roles",
    label: "Role & Department Setup",
    description: "Operations department sections with role names, labels, order & active state",
    icon: Building2,
    table: "department_roles",
    orderBy: "sort_order",
    filters: ["department"],
    filterVals: (r) => ({ department: r.department }),
    select: "department,role_name,display_label,sort_order,is_active,created_at",
    mapRow: (r) => ({
      Department: title(r.department),
      Role: title(r.role_name),
      "Display Label": r.display_label ?? "",
      "Display Order": r.sort_order ?? "",
      Active: yn(r.is_active),
      "Created On": fmt(r.created_at),
    }),
  },
  {
    key: "kpi_targets",
    label: "KPI & Targets",
    description: "Employee-wise targets: target, achieved, remaining, progress %, points & status",
    icon: Target,
    table: "employee_targets",
    dateField: "period_start",
    restricted: true,
    filters: ["employee", "department", "role", "status"],
    filterVals: (r) => ({
      employee: r.employee_id ?? "",
      department: r.department ?? r.employees?.department ?? "",
      role: r.role ?? "",
      status: r.status ?? "",
    }),
    select:
      "employee_id,department,role,target_type,metric_name,target_value,achieved_value,manual_achieved,manual_override,points_per_unit,unit,period_start,period_end,status,notes,employees(employee_code,first_name,last_name,department,designation,status)",
    mapRow: (r) => {
      const achieved = r.manual_override ? num(r.manual_achieved) : num(r.achieved_value);
      const target = num(r.target_value);
      return {
        ...empCols(r),
        Role: title(r.role),
        "Metric Kind": title(r.target_type),
        Metric: r.metric_name ?? "",
        Unit: r.unit ?? "",
        "Period From": fmt(r.period_start),
        "Period To": fmt(r.period_end),
        Target: target,
        Achieved: achieved,
        Remaining: Math.max(0, target - achieved),
        "Progress (%)": target > 0 ? Number(((achieved / target) * 100).toFixed(1)) : 0,
        Points: Number((achieved * num(r.points_per_unit)).toFixed(2)),
        "Manual Override": yn(r.manual_override),
        Status: title(r.status),
        Notes: r.notes ?? "",
      };
    },
  },
  {
    key: "achievement_log",
    label: "Target Achievement Log",
    description: "Dated achievement entries per employee metric with recorded value",
    icon: Activity,
    table: "employee_target_achievement_logs",
    dateField: "achieved_date",
    restricted: true,
    filters: ["employee", "department"],
    needsEmpLookup: true,
    filterVals: (r) => ({
      employee: r.employee_id ?? "",
      department: r.employees?.department ?? "",
    }),
    select: "employee_id,metric_name,achieved_date,achieved_value,created_at",
    mapRow: (r) => ({
      Date: fmt(r.achieved_date),
      ...empCols(r),
      Metric: r.metric_name ?? "",
      "Achieved Value": num(r.achieved_value),
      "Recorded On": fmt(r.created_at),
    }),
  },
  {
    key: "meetings",
    label: "Meetings",
    description: "Meetings with schedule, organiser, attendees, agenda & action items",
    icon: CalendarDays,
    table: "meetings",
    dateField: "scheduled_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterVals: (r) => ({ status: r.status ?? "" }),
    select:
      "id,title,agenda,scheduled_at,duration_minutes,location,meeting_link,status,frequency,organizer,attendees,decisions,notes,meeting_agenda_items(title,duration_minutes,notes),meeting_action_items(title,assignee_name,due_date,priority,status)",
    mapRow: (r) => ({
      Date: fmt(r.scheduled_at, "dd MMM yyyy, hh:mm a"),
      Meeting: r.title ?? "",
      Status: title(r.status),
      Frequency: title(r.frequency),
      "Duration (Min)": r.duration_minutes ?? "",
      Organiser: r.organizer ?? "",
      Attendees: Array.isArray(r.attendees) ? r.attendees.join(", ") : (r.attendees ?? ""),
      Location: r.location ?? "",
      "Meeting Link": r.meeting_link ?? "",
      Agenda: r.agenda ?? "",
      "Agenda Items": (r.meeting_agenda_items || [])
        .map((a: any) => a.title)
        .filter(Boolean)
        .join("; "),
      "Action Items": (r.meeting_action_items || [])
        .map((a: any) =>
          [a.title, a.assignee_name, a.due_date ? fmt(a.due_date) : "", title(a.status)]
            .filter(Boolean)
            .join(" – ")
        )
        .filter(Boolean)
        .join(" | "),
      Decisions: r.decisions ?? "",
      Notes: r.notes ?? "",
    }),
  },
];

export default function OperationsDownloadReports() {
  const { toast } = useToast();
  const { roles } = useAuth();
  const dr = useDateRangeFilter("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [employee, setEmployee] = useState("all");
  const [department, setDepartment] = useState("all");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; name: string; department: string | null }[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, any>>({});

  /** KPI & achievement data is performance + ₹ target data: Admin and HR only. */
  const canSeeRestricted = useMemo(
    () => roles.includes("admin" as any) || roles.includes("hr" as any),
    [roles]
  );

  const visibleReports = useMemo(
    () => REPORTS.filter((r) => !r.restricted || canSeeRestricted),
    [canSeeRestricted]
  );

  useEffect(() => {
    (async () => {
      const [{ data: emps }, { data: dept }] = await Promise.all([
        supabase
          .from("employees")
          .select("id,employee_code,first_name,last_name,department,designation")
          .order("first_name"),
        supabase.from("department_roles").select("role_name,department"),
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
      const rs = new Set<string>();
      (dept || []).forEach((r: any) => r.role_name && rs.add(r.role_name));
      setRoleOptions([...rs].sort());
    })();
  }, []);

  const departmentOptions = useMemo(() => {
    const s = new Set<string>();
    employeeOptions.forEach((e) => e.department && s.add(e.department));
    return [...s].sort();
  }, [employeeOptions]);

  const activeFilters = useMemo(
    () => ({ employee, department, role, status }),
    [employee, department, role, status]
  );

  const dateLabel = () => {
    if (dr.preset === "all") return "All Time";
    if (dr.range.from && dr.range.to) return `${format(dr.range.from, "dd MMM yyyy")} – ${format(dr.range.to, "dd MMM yyyy")}`;
    return dr.preset;
  };

  const applySharedFilters = (def: OpsReportDef, rows: any[]) => {
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
  const fetchData = async (def: OpsReportDef) => {
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

  const buildRows = (def: OpsReportDef, data: any[]): Record<string, any>[] => {
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

  const openPreview = async (def: OpsReportDef) => {
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

  const downloadExcel = async (def: OpsReportDef, presetRows?: Record<string, any>[]) => {
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

  const downloadPDF = async (def: OpsReportDef, presetRows?: Record<string, any>[]) => {
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
      for (const def of visibleReports) {
        try {
          const rows = buildRows(def, await fetchData(def));
          totalRows += rows.length;
          const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No records for current selection" }]);
          XLSX.utils.book_append_sheet(wb, ws, def.label.substring(0, 31));
        } catch (e: any) {
          errors.push(`${def.label}: ${e.message}`);
        }
      }
      XLSX.writeFile(wb, `Operations_All_Reports_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast({
        title: "Downloaded",
        description: errors.length ? `${totalRows} records. Errors: ${errors.join("; ")}` : `All reports (${totalRows} total records)`,
        variant: errors.length ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const previewDef = visibleReports.find((r) => r.key === previewKey);

  const clearFilters = () => { setEmployee("all"); setDepartment("all"); setRole("all"); setStatus("all"); };
  const filtersActive = employee !== "all" || department !== "all" || role !== "all" || status !== "all";

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Download className="h-7 w-7 text-primary" /> Operations Download Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Preview, then export every Operations menu as Excel or PDF for any date range. Live data, always accurate.
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
            Date range applies to dated reports. Role &amp; Department Setup always exports in full.
            {!canSeeRestricted && " KPI & Targets and Target Achievement Log are restricted to Admin and HR."}
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
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>{title(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="achieved">Achieved</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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
        {visibleReports.map((def) => {
          const Icon = def.icon;
          const xlsxBusy = busy === def.key + "_xlsx";
          const pdfBusy = busy === def.key + "_pdf";
          return (
            <Card key={def.key} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {def.label}
                  {def.restricted && (
                    <Badge variant="outline" className="ml-auto gap-1 text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> Admin / HR
                    </Badge>
                  )}
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
