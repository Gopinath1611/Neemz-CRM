import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ChevronDown, ChevronRight, ListChecks, CalendarDays, CheckCircle2, Circle, X, CalendarRange, LayoutGrid, ArrowLeft, Pencil, GripVertical, Check, Target, GraduationCap, Users } from "lucide-react";
import { format, isToday, isTomorrow, isPast, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, subMonths, addWeeks, subWeeks } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  priority: string;
  due_date: string | null;
  date_start: string | null;
  date_end: string | null;
  category: string;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  created_by: string | null;
  assigned_to: string | null;
};

type ChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  due_date: string | null;
  date_end: string | null;
  is_completed: boolean;
  sort_order: number;
};

type CategoryKey = "top_tasks" | "top_learnings" | "train_team";

const CATEGORIES: { key: CategoryKey; label: string; icon: typeof Target; color: string; bg: string }[] = [
  { key: "top_tasks",     label: "Top Tasks",      icon: Target,         color: "text-primary",  bg: "from-primary/20 to-primary/5" },
  { key: "top_learnings", label: "Top Learnings",  icon: GraduationCap,  color: "text-warning",  bg: "from-warning/20 to-warning/5" },
  { key: "train_team",    label: "Train the Team", icon: Users,          color: "text-success",  bg: "from-success/20 to-success/5" },
];

const ROW_COLORS = [
  "bg-blue-500/90 text-white",
  "bg-orange-500/90 text-white",
  "bg-purple-500/90 text-white",
  "bg-emerald-500/90 text-white",
  "bg-pink-500/90 text-white",
  "bg-cyan-500/90 text-white",
  "bg-amber-500/90 text-white",
];

interface Props {
  initialTab?: "todo" | "today" | "calendar";
  departments: { id: string; label: string }[];
  activeDept: string;
  /** Optional ISO date strings (yyyy-MM-dd) to filter tasks by overlap with this range. */
  periodStart?: string;
  periodEnd?: string;
  /** Admin-only: when set, scope the todo list to this user's tasks (created_by OR assigned_to).
   *  Non-admins are always restricted to their own tasks regardless of this prop. */
  viewUserId?: string | null;
  /** Optional label of the focused employee (shown in header so admin knows whose list this is). */
  viewUserLabel?: string | null;
}

export const TodoListPanel = ({ initialTab = "todo", departments, activeDept, periodStart, periodEnd, viewUserId, viewUserLabel }: Props) => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  // Effective user whose tasks we are viewing. Non-admins can only see their own.
  const scopedUserId = isAdmin ? (viewUserId || user?.id || null) : (user?.id || null);
  const isViewingOther = isAdmin && !!viewUserId && viewUserId !== user?.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskDraft, setEditTaskDraft] = useState<{ title: string; date_start: string; date_end: string }>({ title: "", date_start: "", date_end: "" });
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editChecklistDraft, setEditChecklistDraft] = useState<{ title: string; due_date: string; date_end: string }>({ title: "", due_date: "", date_end: "" });
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const [calendarAnchor, setCalendarAnchor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Quick add states
  const [quickAddCategory, setQuickAddCategory] = useState<CategoryKey | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [inlineChecklist, setInlineChecklist] = useState<Record<string, { title: string; due_date: string }>>({});

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["ops-tasks", scopedUserId, isAdmin, isViewingOther],
    enabled: !!scopedUserId,
    queryFn: async () => {
      let query = (supabase.from as any)("ops_tasks").select("*");
      // If admin without a focused employee → see all. Otherwise scope to that user's tasks.
      if (!(isAdmin && !viewUserId)) {
        query = query.or(`created_by.eq.${scopedUserId},assigned_to.eq.${scopedUserId}`);
      }
      const { data, error } = await query
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const { data: checklists = [] } = useQuery<ChecklistItem[]>({
    queryKey: ["ops-task-checklist", scopedUserId, tasks.map(t => t.id).join(",")],
    enabled: !!scopedUserId && tasks.length > 0,
    queryFn: async () => {
      const ids = tasks.map(t => t.id);
      if (ids.length === 0) return [];
      const { data, error } = await (supabase.from as any)("ops_task_checklist")
        .select("*").in("task_id", ids).order("sort_order");
      if (error) throw error;
      return (data || []) as ChecklistItem[];
    },
  });

  const checklistByTask = useMemo(() => {
    const map: Record<string, ChecklistItem[]> = {};
    checklists.forEach(c => { (map[c.task_id] ||= []).push(c); });
    return map;
  }, [checklists]);

  // Filter tasks by department and (optionally) by date range overlap
  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (activeDept !== "all") list = list.filter(t => !t.department || t.department === activeDept);
    if (periodStart && periodEnd) {
      list = list.filter(t => {
        const start = (t.date_start || t.due_date || "").slice(0, 10);
        const end = (t.date_end || t.due_date || t.date_start || "").slice(0, 10);
        // Undated tasks always shown so user doesn't lose them
        if (!start && !end) return true;
        const s = start || end;
        const e = end || start;
        return !(e < periodStart || s > periodEnd);
      });
    }
    return list;
  }, [tasks, activeDept, periodStart, periodEnd]);

  const tasksByCategory = useMemo(() => {
    const map: Record<CategoryKey, Task[]> = { top_tasks: [], top_learnings: [], train_team: [] };
    visibleTasks.forEach(t => {
      const k = (CATEGORIES.find(c => c.key === t.category)?.key) || "top_tasks";
      map[k].push(t);
    });
    return map;
  }, [visibleTasks]);

  // Mutations
  const quickAddTask = useMutation({
    mutationFn: async ({ category, title }: { category: CategoryKey; title: string }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const sort_order = tasksByCategory[category]?.length || 0;
      const { error } = await (supabase.from as any)("ops_tasks").insert({
        title,
        category,
        department: activeDept !== "all" ? activeDept : "general",
        priority: "medium",
        sort_order,
        created_by: user.id,
        // When admin focuses on an employee, assign the task to them so it appears in their own login.
        assigned_to: isViewingOther && viewUserId ? viewUserId : user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-tasks"] });
      setQuickAddTitle("");
      setQuickAddCategory(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await (supabase.from as any)("ops_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-tasks"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await (supabase.from as any)("ops_tasks").update({
        is_completed, completed_at: is_completed ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-tasks"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleChecklist = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await (supabase.from as any)("ops_task_checklist").update({
        is_completed, completed_at: is_completed ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-task-checklist"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateChecklist = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ChecklistItem> }) => {
      const { error } = await (supabase.from as any)("ops_task_checklist").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-task-checklist"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("ops_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Task removed"); qc.invalidateQueries({ queryKey: ["ops-tasks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteChecklist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("ops_task_checklist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-task-checklist"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const addInlineChecklist = useMutation({
    mutationFn: async (taskId: string) => {
      const v = inlineChecklist[taskId];
      if (!v?.title?.trim()) throw new Error("Enter title");
      const sort_order = (checklistByTask[taskId]?.length || 0);
      const { error } = await (supabase.from as any)("ops_task_checklist").insert({
        task_id: taskId, title: v.title, due_date: v.due_date || null, sort_order,
      });
      if (error) throw error;
    },
    onSuccess: (_, taskId) => {
      qc.invalidateQueries({ queryKey: ["ops-task-checklist"] });
      setInlineChecklist(s => ({ ...s, [taskId]: { title: "", due_date: "" } }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Reorder tasks within a category (move up / down)
  const reorderTask = useMutation({
    mutationFn: async ({ id, direction, category }: { id: string; direction: "up" | "down"; category: CategoryKey }) => {
      const list = tasksByCategory[category];
      const idx = list.findIndex(t => t.id === id);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return;
      const a = list[idx], b = list[swapIdx];
      const aSort = a.sort_order ?? idx;
      const bSort = b.sort_order ?? swapIdx;
      await (supabase.from as any)("ops_tasks").update({ sort_order: bSort }).eq("id", a.id);
      await (supabase.from as any)("ops_tasks").update({ sort_order: aSort }).eq("id", b.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-tasks"] }),
  });

  // Today + Tomorrow tasks/items
  const todayTomorrow = useMemo(() => {
    const items: { type: "task" | "checklist"; data: any; parent?: Task; when: "today" | "tomorrow" | "overdue" }[] = [];
    visibleTasks.forEach(t => {
      if (t.is_completed) return;
      const tDate = t.due_date || t.date_start;
      if (tDate) {
        const d = parseISO(tDate);
        if (isToday(d)) items.push({ type: "task", data: t, when: "today" });
        else if (isTomorrow(d)) items.push({ type: "task", data: t, when: "tomorrow" });
        else if (isPast(d)) items.push({ type: "task", data: t, when: "overdue" });
      }
      (checklistByTask[t.id] || []).forEach(c => {
        if (c.is_completed || !c.due_date) return;
        const d = parseISO(c.due_date);
        if (isToday(d)) items.push({ type: "checklist", data: c, parent: t, when: "today" });
        else if (isTomorrow(d)) items.push({ type: "checklist", data: c, parent: t, when: "tomorrow" });
        else if (isPast(d)) items.push({ type: "checklist", data: c, parent: t, when: "overdue" });
      });
    });
    return items;
  }, [visibleTasks, checklistByTask]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, { task?: Task; checklist?: ChecklistItem; parent?: Task }[]> = {};
    visibleTasks.forEach(t => {
      const tDate = t.due_date || t.date_start;
      if (tDate) (map[tDate] ||= []).push({ task: t });
      (checklistByTask[t.id] || []).forEach(c => {
        if (c.due_date) (map[c.due_date] ||= []).push({ checklist: c, parent: t });
      });
    });
    return map;
  }, [visibleTasks, checklistByTask]);

  const calendarRange = useMemo(() => {
    if (calendarMode === "month") {
      const start = startOfWeek(startOfMonth(calendarAnchor), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(calendarAnchor), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
    return eachDayOfInterval({ start: startOfWeek(calendarAnchor, { weekStartsOn: 1 }), end: endOfWeek(calendarAnchor, { weekStartsOn: 1 }) });
  }, [calendarMode, calendarAnchor]);

  if (!user) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Please sign in to manage tasks.</CardContent></Card>;
  }

  const startEditTask = (t: Task) => {
    setEditingTaskId(t.id);
    setEditTaskDraft({ title: t.title, date_start: t.date_start || "", date_end: t.date_end || "" });
  };
  const saveEditTask = () => {
    if (!editingTaskId || !editTaskDraft.title.trim()) return;
    updateTask.mutate({
      id: editingTaskId,
      patch: {
        title: editTaskDraft.title,
        date_start: editTaskDraft.date_start || null,
        date_end: editTaskDraft.date_end || null,
      } as any,
    });
    setEditingTaskId(null);
  };

  const startEditChecklist = (c: ChecklistItem) => {
    setEditingChecklistId(c.id);
    setEditChecklistDraft({ title: c.title, due_date: c.due_date || "", date_end: c.date_end || "" });
  };
  const saveEditChecklist = () => {
    if (!editingChecklistId || !editChecklistDraft.title.trim()) return;
    updateChecklist.mutate({
      id: editingChecklistId,
      patch: {
        title: editChecklistDraft.title,
        due_date: editChecklistDraft.due_date || null,
        date_end: editChecklistDraft.date_end || null,
      } as any,
    });
    setEditingChecklistId(null);
  };

  // ============== CATEGORY GRID (Projects view) ==============
  const renderCategoryGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        const list = tasksByCategory[cat.key];
        const completed = list.filter(t => t.is_completed).length;
        const pct = list.length > 0 ? Math.round((completed / list.length) * 100) : 0;
        return (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 text-left transition-all hover:scale-[1.02] hover:shadow-lg",
              cat.bg,
            )}
          >
            <div className="flex items-start justify-between">
              <div className={cn("p-2.5 rounded-lg bg-background/60", cat.color)}>
                <Icon size={22} />
              </div>
              <Badge variant="secondary" className="text-xs">{list.length}</Badge>
            </div>
            <h3 className="font-display text-lg font-bold mt-3">{cat.label}</h3>
            <p className="text-xs text-muted-foreground mt-1">{completed}/{list.length} completed · {pct}%</p>
            <div className="mt-3 h-1.5 bg-background/60 rounded-full overflow-hidden">
              <div className={cn("h-full transition-all", cat.color.replace("text-", "bg-"))} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 text-xs font-medium flex items-center gap-1 opacity-70 group-hover:opacity-100">
              Open <ChevronRight size={12} />
            </div>
          </button>
        );
      })}
    </div>
  );

  // ============== CATEGORY DETAIL ==============
  const renderCategoryDetail = (cat: typeof CATEGORIES[number]) => {
    const list = tasksByCategory[cat.key];
    const completed = list.filter(t => t.is_completed).length;
    const pct = list.length > 0 ? Math.round((completed / list.length) * 100) : 0;
    const Icon = cat.icon;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setActiveCategory(null)} className="gap-2">
            <ArrowLeft size={16} /> Back to Projects
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setQuickAddCategory(cat.key)}>
            <Plus size={14} /> Add Item
          </Button>
        </div>

        <Card className="border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-secondary", cat.color)}>
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl font-display">{cat.label}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{completed}/{list.length} completed · {pct}%</p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-500 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Click a task row to open sub-tasks. Use the pencil icon to edit an item.</p>
          </CardHeader>

          <CardContent className="space-y-2">
            {list.map((t, idx) => {
              const items = checklistByTask[t.id] || [];
              const itemDone = items.filter(i => i.is_completed).length;
              const expanded = expandedTasks[t.id] || false;
              const isEditing = editingTaskId === t.id;
              const rowColor = ROW_COLORS[idx % ROW_COLORS.length];

              return (
                <div key={t.id} className="space-y-1.5">
                  {/* Task row */}
                  <div className={cn("rounded-lg overflow-hidden transition-all", rowColor, t.is_completed && "opacity-60")}>
                    <div className="flex items-center gap-2 p-3">
                      <span className="font-bold text-base w-6 text-center">{idx + 1}.</span>
                      {isEditing ? (
                        <div className="flex-1 space-y-2">
                          <Textarea
                            value={editTaskDraft.title}
                            onChange={(e) => setEditTaskDraft({ ...editTaskDraft, title: e.target.value })}
                            className="bg-background/95 text-foreground text-sm min-h-[60px]"
                            autoFocus
                          />
                          <div className="flex items-center gap-2 text-xs">
                            <CalendarDays size={14} />
                            <Input type="date" value={editTaskDraft.date_start}
                              onChange={(e) => setEditTaskDraft({ ...editTaskDraft, date_start: e.target.value })}
                              className="h-8 bg-background/95 text-foreground w-[150px]" />
                            <span>→</span>
                            <Input type="date" value={editTaskDraft.date_end}
                              onChange={(e) => setEditTaskDraft({ ...editTaskDraft, date_end: e.target.value })}
                              className="h-8 bg-background/95 text-foreground w-[150px]" />
                          </div>
                        </div>
                      ) : (
                        <button
                          className="flex-1 text-left font-semibold text-sm"
                          onClick={() => setExpandedTasks(s => ({ ...s, [t.id]: !expanded }))}
                        >
                          <span className={cn(t.is_completed && "line-through")}>{t.title}</span>
                          {(t.date_start || t.date_end) && (
                            <span className="ml-2 text-xs opacity-90">
                              {t.date_start && format(parseISO(t.date_start), "MMM d")}
                              {t.date_end && ` → ${format(parseISO(t.date_end), "MMM d")}`}
                            </span>
                          )}
                        </button>
                      )}

                      {!isEditing && (
                        <>
                          {items.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs bg-background/20 px-2 py-1 rounded">
                              <span>{itemDone}/{items.length}</span>
                              <div className="w-12 h-1 bg-background/30 rounded-full overflow-hidden">
                                <div className="h-full bg-background" style={{ width: `${(itemDone / items.length) * 100}%` }} />
                              </div>
                            </div>
                          )}
                          <button onClick={() => setExpandedTasks(s => ({ ...s, [t.id]: !expanded }))} className="p-1 hover:bg-background/20 rounded">
                            {expanded ? <ChevronDown size={16} /> : <ChevronDown size={16} className="-rotate-90" />}
                          </button>
                          <button onClick={() => startEditTask(t)} className="p-1 hover:bg-background/20 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => { if (confirm("Delete this task?")) deleteTask.mutate(t.id); }}
                            className="p-1 hover:bg-background/20 rounded text-destructive-foreground" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {isEditing && (
                        <>
                          <button onClick={saveEditTask} className="p-1 hover:bg-background/20 rounded" title="Save">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setEditingTaskId(null)} className="p-1 hover:bg-background/20 rounded" title="Cancel">
                            <X size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reorder buttons (small, below row) */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 ml-10 -mt-1 mb-1">
                      <button onClick={() => reorderTask.mutate({ id: t.id, direction: "up", category: cat.key })}
                        disabled={idx === 0}
                        className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center gap-0.5">
                        <GripVertical size={10} /> Reorder
                      </button>
                      <button onClick={() => toggleTask.mutate({ id: t.id, is_completed: !t.is_completed })}
                        className="text-[10px] text-muted-foreground hover:text-foreground ml-auto">
                        {t.is_completed ? "Mark incomplete" : "Mark complete"}
                      </button>
                    </div>
                  )}

                  {/* Sub-tasks */}
                  {expanded && (
                    <div className="ml-6 space-y-1.5 border-l-2 border-border pl-3 pb-2">
                      {items.map(c => {
                        const cEditing = editingChecklistId === c.id;
                        return (
                          <div key={c.id} className="rounded-md border bg-card">
                            {cEditing ? (
                              <div className="p-2 space-y-2">
                                <Input
                                  value={editChecklistDraft.title}
                                  onChange={(e) => setEditChecklistDraft({ ...editChecklistDraft, title: e.target.value })}
                                  className="h-8 text-sm"
                                  autoFocus
                                />
                                <div className="flex items-center gap-2">
                                  <CalendarDays size={14} className="text-muted-foreground" />
                                  <Input type="date" value={editChecklistDraft.due_date}
                                    onChange={(e) => setEditChecklistDraft({ ...editChecklistDraft, due_date: e.target.value })}
                                    className="h-8 text-xs w-[150px]" />
                                  <span>→</span>
                                  <Input type="date" value={editChecklistDraft.date_end}
                                    onChange={(e) => setEditChecklistDraft({ ...editChecklistDraft, date_end: e.target.value })}
                                    className="h-8 text-xs w-[150px]" />
                                  <Button size="sm" className="h-8 ml-auto" onClick={saveEditChecklist}>Save</Button>
                                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingChecklistId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 p-2 group">
                                <button onClick={() => toggleChecklist.mutate({ id: c.id, is_completed: !c.is_completed })}>
                                  {c.is_completed
                                    ? <CheckCircle2 size={16} className="text-success fill-success/20" />
                                    : <Circle size={16} className="text-muted-foreground hover:text-primary" />}
                                </button>
                                <span className={cn("text-sm flex-1", c.is_completed && "line-through text-muted-foreground")}>
                                  {c.title}
                                </span>
                                {(c.due_date || c.date_end) && (
                                  <span className={cn("text-[10px]", c.due_date && isPast(parseISO(c.due_date)) && !c.is_completed ? "text-destructive" : "text-muted-foreground")}>
                                    {c.due_date && format(parseISO(c.due_date), "MMM d")}
                                    {c.date_end && ` → ${format(parseISO(c.date_end), "MMM d")}`}
                                  </span>
                                )}
                                <button onClick={() => startEditChecklist(c)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-secondary rounded">
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => deleteChecklist.mutate(c.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-secondary rounded text-destructive">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Inline add sub-task */}
                      <div className="flex items-center gap-2 pt-1">
                        <Plus size={14} className="text-muted-foreground" />
                        <Input
                          value={inlineChecklist[t.id]?.title || ""}
                          onChange={(e) => setInlineChecklist(s => ({ ...s, [t.id]: { ...(s[t.id] || { title: "", due_date: "" }), title: e.target.value } }))}
                          placeholder="Add sub-task..."
                          className="h-8 text-xs flex-1"
                          onKeyDown={(e) => { if (e.key === "Enter") addInlineChecklist.mutate(t.id); }}
                        />
                        <Input
                          type="date"
                          value={inlineChecklist[t.id]?.due_date || ""}
                          onChange={(e) => setInlineChecklist(s => ({ ...s, [t.id]: { ...(s[t.id] || { title: "", due_date: "" }), due_date: e.target.value } }))}
                          className="h-8 text-xs w-[140px]"
                        />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => addInlineChecklist.mutate(t.id)}>Add</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Quick add task */}
            {quickAddCategory === cat.key ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-primary/40">
                <Plus size={16} className="text-primary" />
                <Input
                  autoFocus
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  placeholder="New task title..."
                  className="h-9 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && quickAddTitle.trim()) quickAddTask.mutate({ category: cat.key, title: quickAddTitle.trim() });
                    if (e.key === "Escape") { setQuickAddCategory(null); setQuickAddTitle(""); }
                  }}
                />
                <Button size="sm" disabled={!quickAddTitle.trim()}
                  onClick={() => quickAddTask.mutate({ category: cat.key, title: quickAddTitle.trim() })}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setQuickAddCategory(null); setQuickAddTitle(""); }}>Cancel</Button>
              </div>
            ) : (
              <button
                onClick={() => setQuickAddCategory(cat.key)}
                className="w-full text-sm text-muted-foreground hover:text-foreground border-2 border-dashed rounded-lg py-3 flex items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                <Plus size={16} /> Add new task
              </button>
            )}

            {list.length === 0 && quickAddCategory !== cat.key && (
              <p className="text-center text-sm text-muted-foreground py-4">No tasks yet in this section.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const pendingCount = visibleTasks.filter(t => !t.is_completed).length;

  return (
    <div className="space-y-4">
      {isViewingOther && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center gap-2">
          <Users size={14} className="text-primary" />
          <span className="text-foreground/80">
            Viewing To-Do, Today &amp; Calendar of <span className="font-semibold text-primary">{viewUserLabel || "selected employee"}</span>. Only this employee sees these tasks in their own login.
          </span>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setActiveCategory(null); }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="todo" className="gap-1"><ListChecks size={14} /> To-Do List ({pendingCount})</TabsTrigger>
            <TabsTrigger value="today" className="gap-1"><CalendarDays size={14} /> Today + Tomorrow ({todayTomorrow.length})</TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1"><LayoutGrid size={14} /> Calendar</TabsTrigger>
          </TabsList>
        </div>

        {/* TO-DO LIST: Projects grid OR detail */}
        <TabsContent value="todo" className="mt-4">
          {activeCategory
            ? renderCategoryDetail(CATEGORIES.find(c => c.key === activeCategory)!)
            : renderCategoryGrid()}
        </TabsContent>

        {/* TODAY + TOMORROW */}
        <TabsContent value="today" className="space-y-4 mt-4">
          {(["overdue", "today", "tomorrow"] as const).map(when => {
            const list = todayTomorrow.filter(i => i.when === when);
            if (list.length === 0) return null;
            const labels = { overdue: "Overdue", today: "Today", tomorrow: "Tomorrow" };
            const colors = { overdue: "text-destructive", today: "text-primary", tomorrow: "text-warning" };
            return (
              <div key={when}>
                <h3 className={cn("text-sm font-semibold uppercase tracking-wide mb-2 flex items-center gap-2", colors[when])}>
                  <CalendarRange size={14} /> {labels[when]} ({list.length})
                </h3>
                <div className="space-y-2">
                  {list.map((item, i) => (
                    <Card key={i} className="shadow-card">
                      <CardContent className="p-3 flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (item.type === "task") toggleTask.mutate({ id: item.data.id, is_completed: true });
                            else toggleChecklist.mutate({ id: item.data.id, is_completed: true });
                          }}
                        >
                          <Circle size={18} className="text-muted-foreground hover:text-primary" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.data.title}</p>
                          {item.parent && (
                            <p className="text-[10px] text-muted-foreground">in: {item.parent.title}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {item.type === "task" ? "Task" : "Item"}
                        </Badge>
                        {item.data.due_date && (
                          <span className="text-[10px] text-muted-foreground">{format(parseISO(item.data.due_date), "dd MMM")}</span>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {todayTomorrow.length === 0 && (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              🎉 Nothing due today or tomorrow. Great job!
            </CardContent></Card>
          )}
        </TabsContent>

        {/* CALENDAR */}
        <TabsContent value="calendar" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() =>
                    setCalendarAnchor(calendarMode === "month" ? subMonths(calendarAnchor, 1) : subWeeks(calendarAnchor, 1))
                  }>‹</Button>
                  <CardTitle className="text-base font-display min-w-[180px] text-center">
                    {calendarMode === "month"
                      ? format(calendarAnchor, "MMMM yyyy")
                      : `${format(startOfWeek(calendarAnchor, { weekStartsOn: 1 }), "dd MMM")} – ${format(endOfWeek(calendarAnchor, { weekStartsOn: 1 }), "dd MMM yyyy")}`}
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={() =>
                    setCalendarAnchor(calendarMode === "month" ? addMonths(calendarAnchor, 1) : addWeeks(calendarAnchor, 1))
                  }>›</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCalendarAnchor(new Date())}>Today</Button>
                </div>
                <div className="flex gap-1 bg-secondary p-0.5 rounded-md">
                  <Button size="sm" variant={calendarMode === "month" ? "default" : "ghost"} className="h-7 text-xs"
                    onClick={() => setCalendarMode("month")}>Month</Button>
                  <Button size="sm" variant={calendarMode === "week" ? "default" : "ghost"} className="h-7 text-xs"
                    onClick={() => setCalendarMode("week")}>Week</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1 grid-cols-7">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                  <div key={d} className="text-[10px] font-semibold text-center text-muted-foreground py-1">{d}</div>
                ))}
                {calendarRange.map(day => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayItems = itemsByDate[key] || [];
                  const isCurrentMonth = calendarMode === "week" || day.getMonth() === calendarAnchor.getMonth();
                  const isSel = selectedDay && isSameDay(day, selectedDay);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "border rounded-md p-1.5 text-left min-h-[70px] flex flex-col gap-0.5 transition-colors hover:bg-accent/30",
                        !isCurrentMonth && "opacity-40",
                        isToday(day) && "bg-primary/5 border-primary/40",
                        isSel && "ring-2 ring-primary",
                      )}
                    >
                      <span className={cn("text-[11px] font-semibold", isToday(day) && "text-primary")}>{format(day, "d")}</span>
                      <div className="space-y-0.5 overflow-hidden">
                        {dayItems.slice(0, 3).map((it, i) => {
                          const completed = it.task?.is_completed || it.checklist?.is_completed;
                          return (
                            <div key={i} className={cn(
                              "text-[9px] truncate px-1 py-0.5 rounded",
                              it.task ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning",
                              completed && "line-through opacity-60"
                            )}>
                              {it.task?.title || it.checklist?.title}
                            </div>
                          );
                        })}
                        {dayItems.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{dayItems.length - 3} more</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selectedDay && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center justify-between">
                  <span>{format(selectedDay, "EEEE, dd MMM yyyy")}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedDay(null)}><X size={14} /></Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(itemsByDate[format(selectedDay, "yyyy-MM-dd")] || []).map((it, i) => {
                  const completed = it.task?.is_completed || it.checklist?.is_completed;
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded border">
                      <button onClick={() => {
                        if (it.task) toggleTask.mutate({ id: it.task.id, is_completed: !it.task.is_completed });
                        else if (it.checklist) toggleChecklist.mutate({ id: it.checklist.id, is_completed: !it.checklist.is_completed });
                      }}>
                        {completed ? <CheckCircle2 size={16} className="text-success" /> : <Circle size={16} className="text-muted-foreground" />}
                      </button>
                      <div className="flex-1">
                        <p className={cn("text-sm", completed && "line-through text-muted-foreground")}>{it.task?.title || it.checklist?.title}</p>
                        {it.parent && <p className="text-[10px] text-muted-foreground">in: {it.parent.title}</p>}
                      </div>
                      <Badge variant="outline" className="text-[10px]">{it.task ? "Task" : "Item"}</Badge>
                    </div>
                  );
                })}
                {(itemsByDate[format(selectedDay, "yyyy-MM-dd")] || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No tasks scheduled for this day.</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
