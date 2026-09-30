import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks,
} from "date-fns";

/**
 * READ-ONLY Task Report.
 * Queries existing ops_tasks (Operations module) + employees. No writes, no schema changes.
 */

type PeriodKey = "this_week" | "last_week" | "this_month" | "last_month";

const PERIODS: { key: PeriodKey; label: string; range: () => { start: Date; end: Date } }[] = [
  { key: "this_week", label: "This Week", range: () => ({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { key: "last_week", label: "Last Week", range: () => ({ start: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), end: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }) }) },
  { key: "this_month", label: "This Month", range: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
  { key: "last_month", label: "Last Month", range: () => ({ start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }) },
];

type TaskStatus = "completed" | "pending" | "missed";

interface TaskRow {
  id: string;
  title: string;
  department: string | null;
  category: string | null;
  priority: string | null;
  dueDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  assignee: string;
  status: TaskStatus;
}

interface Props {
  fromDate?: string;
  toDate?: string;
}

const STATUS_META: Record<TaskStatus, { label: string; className: string; icon: any }> = {
  completed: { label: "Completed", className: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  pending: { label: "Pending", className: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock3 },
  missed: { label: "Missed", className: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
};

export default function TaskReport({ fromDate, toDate }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const customRange = fromDate && toDate ? { start: new Date(fromDate), end: new Date(toDate) } : null;

  const activeRange = useMemo(() => {
    if (customRange) return customRange;
    return PERIODS.find((p) => p.key === period)!.range();
  }, [period, fromDate, toDate]);

  const rangeLabel = `${format(activeRange.start, "d MMM yyyy")} - ${format(activeRange.end, "d MMM yyyy")}`;

  const generate = async () => {
    setLoading(true);
    const start = format(activeRange.start, "yyyy-MM-dd");
    const end = format(activeRange.end, "yyyy-MM-dd");

    // Tasks whose due date OR creation date falls in the selected period
    const [tasks, emps] = await Promise.all([
      supabase.from("ops_tasks")
        .select("id, title, department, category, priority, due_date, created_at, completed_at, is_completed, assigned_to")
        .or(`and(due_date.gte.${start},due_date.lte.${end}),and(created_at.gte.${start},created_at.lte.${end})`)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("employees")
        .select("id, user_id, first_name, last_name, employee_code"),
    ]);
    if (tasks.error) { toast.error(tasks.error.message); setLoading(false); return; }
    if (emps.error) { toast.error(emps.error.message); setLoading(false); return; }

    // ops_tasks.assigned_to stores the auth user id (employees.user_id); key by both
    const empMap = new Map<string, string>();
    for (const e of emps.data ?? []) {
      const name = `${e.first_name} ${e.last_name || ""}`.trim() || e.employee_code || "—";
      empMap.set(e.id, name);
      if (e.user_id) empMap.set(e.user_id, name);
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const mapped: TaskRow[] = (tasks.data ?? []).map((t: any) => {
      let status: TaskStatus = "pending";
      if (t.is_completed) status = "completed";
      else if (t.due_date && t.due_date < today) status = "missed";
      return {
        id: t.id,
        title: t.title || "Untitled Task",
        department: t.department,
        category: t.category,
        priority: t.priority,
        dueDate: t.due_date,
        createdAt: t.created_at,
        completedAt: t.completed_at,
        assignee: t.assigned_to ? empMap.get(t.assigned_to) ?? "Unknown" : "Unassigned",
        status,
      };
    });

    setRows(mapped);
    setGenerated(true);
    setLoading(false);
    toast.success(`Task report generated for ${rangeLabel}`);
  };

  useEffect(() => {
    if (generated) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, fromDate, toDate]);

  const counts = useMemo(() => ({
    completed: rows.filter((r) => r.status === "completed").length,
    pending: rows.filter((r) => r.status === "pending").length,
    missed: rows.filter((r) => r.status === "missed").length,
  }), [rows]);

  const downloadCSV = () => {
    if (!generated) { toast.error("Click Generate Report first"); return; }
    const header = ["Date (Due)", "Task Name", "Department", "Category", "Priority", "Assigned To", "Status", "Completed At"];
    const body = rows.map((r) => [
      r.dueDate ? format(new Date(r.dueDate), "yyyy-MM-dd") : "",
      r.title, r.department ?? "", r.category ?? "", r.priority ?? "",
      r.assignee, STATUS_META[r.status].label,
      r.completedAt ? format(new Date(r.completedAt), "yyyy-MM-dd HH:mm") : "",
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-report-${format(activeRange.start, "yyyyMMdd")}-${format(activeRange.end, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Task Report exported as CSV");
  };

  return (
    <div className="space-y-4 pt-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)} disabled={!!customRange}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={downloadCSV}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{rangeLabel}</span>
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background py-10 text-center text-sm text-muted-foreground">
          Select a period and click <strong>Generate Report</strong> to load tasks from the Operations module.
        </div>
      ) : (
        <>
          {/* Status summary */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Completed: {counts.completed}
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Clock3 className="h-3 w-3 mr-1" /> Pending: {counts.pending}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="h-3 w-3 mr-1" /> Missed: {counts.missed}
            </Badge>
            <Badge variant="outline">Total: {rows.length}</Badge>
          </div>

          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference / Task Name</TableHead>
                  <TableHead>Assigned Details</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {r.dueDate ? format(new Date(r.dueDate), "d MMM yyyy") : "—"}
                        <div className="text-xs text-muted-foreground">
                          {r.dueDate ? "Due date" : r.createdAt ? `Created ${format(new Date(r.createdAt), "d MMM yyyy")}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.department, r.category].filter(Boolean).join(" · ") || "—"}
                          {r.priority && <span className="ml-1 capitalize">({r.priority})</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{r.assignee}</div>
                        {r.completedAt && (
                          <div className="text-xs text-muted-foreground">
                            Done {format(new Date(r.completedAt), "d MMM yyyy, h:mm a")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={meta.className}>
                          <meta.icon className="h-3 w-3 mr-1" /> {meta.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                      No tasks found for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
