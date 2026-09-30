import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ListChecks, CalendarClock, AlertTriangle, CheckCircle2, Clock, Search,
  CalendarIcon, Phone, Mail, SlidersHorizontal, X,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isBefore, isAfter, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, subMonths, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import { OpportunityDetail } from "@/components/pipeline/OpportunityDetail";

const statusBadgeColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  done: "bg-success/10 text-success border-success/20",
};

const FollowUps = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [assignedStaff, setAssignedStaff] = useState("all");
  const [sortBy, setSortBy] = useState("added_asc");
  const [treatmentFilter, setTreatmentFilter] = useState("all");


  const { data: followUps = [], isLoading } = useQuery({
    queryKey: ["follow-ups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_ups")
        .select("*, leads(id, name, phone, email, source, treatment_interest, city, status, lead_score, estimated_value, notes, ai_priority, assigned_to, assigned_to_id, assigned_to_name, age, dental_problem, follow_up_date, created_at, updated_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Owner id for a lead — same fallback logic as the Pipeline "Owner" column
  // (assigned_to_id is the canonical field; assigned_to is legacy)
  const leadOwnerId = (lead: any) => lead?.assigned_to_id || lead?.assigned_to || null;

  // Unique owner ids actually assigned to the follow-up leads (mirrors Pipeline "Owner" column)
  const ownerIds = useMemo(
    () => Array.from(new Set(followUps.map((f: any) => leadOwnerId(f.leads)).filter(Boolean))) as string[],
    [followUps]
  );

  // Owner names straight from the leads (assigned_to_name), keyed by owner id
  const ownerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    followUps.forEach((f: any) => {
      const id = leadOwnerId(f.leads);
      if (id && f.leads?.assigned_to_name && !map[id]) map[id] = f.leads.assigned_to_name;
    });
    return map;
  }, [followUps]);

  // Fetch profiles only for those owners — no full staff table fetch
  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["followup-staff", ownerIds],
    enabled: ownerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ownerIds).order("full_name");
      return data || [];
    },
  });

  // Final dropdown options: every unique owner id from the leads, named via
  // profiles when available, else the lead's assigned_to_name, else "Unnamed".
  const staff = useMemo(() => {
    const nameById: Record<string, string> = { ...ownerNameById };
    staffProfiles.forEach((p: any) => { if (p.full_name) nameById[p.id] = p.full_name; });
    return ownerIds
      .map((id) => ({ id, full_name: nameById[id] || "Unnamed" }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [ownerIds, staffProfiles, ownerNameById]);


  const changeStatus = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase.from("follow_ups").update({
        status: newStatus,
        completed_at: newStatus === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      toast({ title: "Status updated" });
    },
  });

  // Date range calculation
  const getDateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: endOfDay(now) };
      case "yesterday": return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case "7days": return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case "this_week": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
      case "this_month": return { from: startOfMonth(now), to: endOfDay(now) };
      case "last_month": return { from: startOfMonth(subMonths(now, 1)), to: endOfDay(startOfMonth(now)) };
      case "this_year": return { from: startOfYear(now), to: endOfDay(now) };
      case "custom": return { from: customFrom, to: customTo };
      default: return { from: undefined, to: undefined };
    }
  }, [datePreset, customFrom, customTo]);

  const bucketOf = (f: any) => {
    if (f.status === "done") return "completed";
    const d = new Date(f.due_date);
    if (isToday(d)) return "due_today";
    if (isBefore(d, startOfDay(new Date()))) return "overdue";
    return "upcoming";
  };

  // Distinct treatments
  const treatmentOptions = useMemo(() => {
    const set = new Set<string>();
    followUps.forEach((f: any) => {
      const t = f.leads?.treatment_interest?.trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [followUps]);

  // Stats
  const stats = useMemo(() => {
    const base = assignedStaff === "all" ? followUps : followUps.filter((f: any) => leadOwnerId(f.leads) === assignedStaff);
    return {
      all: base.length,
      due_today: base.filter((f: any) => bucketOf(f) === "due_today").length,
      upcoming: base.filter((f: any) => bucketOf(f) === "upcoming").length,
      overdue: base.filter((f: any) => bucketOf(f) === "overdue").length,
      completed: base.filter((f: any) => bucketOf(f) === "completed").length,
    };
  }, [followUps, assignedStaff]);

  // Filtering
  const filtered = useMemo(() => {
    const { from: dateFrom, to: dateTo } = getDateRange;
    const rows = followUps.filter((f: any) => {
      const lead = f.leads;
      const matchesSearch = !search ||
        lead?.name?.toLowerCase().includes(search.toLowerCase()) ||
        lead?.phone?.includes(search) ||
        f.note?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filterStatus === "all" || bucketOf(f) === filterStatus;
      const matchesStaff = assignedStaff === "all" || leadOwnerId(lead) === assignedStaff;
      const matchesTreatment = treatmentFilter === "all" || (lead?.treatment_interest?.trim() || "") === treatmentFilter;
      const dueDate = new Date(f.due_date);
      const matchesDateFrom = !dateFrom || isAfter(dueDate, startOfDay(dateFrom));
      const matchesDateTo = !dateTo || isBefore(dueDate, endOfDay(dateTo));
      return matchesSearch && matchesStatus && matchesStaff && matchesTreatment && matchesDateFrom && matchesDateTo;
    });
    const sorted = [...rows];
    sorted.sort((a: any, b: any) => {
      switch (sortBy) {
        case "added_desc": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "due_asc": return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case "due_desc": return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        case "name_asc": return (a.leads?.name || "").localeCompare(b.leads?.name || "");
        case "name_desc": return (b.leads?.name || "").localeCompare(a.leads?.name || "");
        case "treatment_asc": return (a.leads?.treatment_interest || "").localeCompare(b.leads?.treatment_interest || "");
        case "treatment_desc": return (b.leads?.treatment_interest || "").localeCompare(a.leads?.treatment_interest || "");
        default: return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
    });
    return sorted;
  }, [followUps, search, filterStatus, assignedStaff, treatmentFilter, sortBy, getDateRange]);


  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  useMemo(() => { setCurrentPage(1); }, [filtered.length]);

  const clearFilters = () => {
    setSearch(""); setFilterStatus("all"); setDatePreset("all"); setCustomFrom(undefined); setCustomTo(undefined);
  };

  const activeFilterCount = (filterStatus !== "all" ? 1 : 0) + (datePreset !== "all" ? 1 : 0);

  const statusFilters = [
    { label: "All", value: "all", count: stats.all, icon: ListChecks, tone: "text-primary", ring: "border-primary ring-1 ring-primary", soft: "bg-primary/5" },
    { label: "Due Today", value: "due_today", count: stats.due_today, icon: CalendarClock, tone: "text-primary", ring: "border-primary ring-1 ring-primary", soft: "bg-primary/5" },
    { label: "Upcoming", value: "upcoming", count: stats.upcoming, icon: Clock, tone: "text-primary", ring: "border-primary ring-1 ring-primary", soft: "bg-primary/5" },
    { label: "Overdue", value: "overdue", count: stats.overdue, icon: AlertTriangle, tone: "text-warning", ring: "border-warning ring-1 ring-warning", soft: "bg-warning/5" },
    { label: "Completed", value: "completed", count: stats.completed, icon: CheckCircle2, tone: "text-success", ring: "border-success ring-1 ring-success", soft: "bg-success/5" },
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-2 h-1.5 w-6 rounded-full bg-success" />
          <div>
            <h1 className="text-2xl font-bold font-display">Follow-up</h1>
            <p className="text-sm text-muted-foreground mt-0.5">You have total {stats.all} Tasks</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={assignedStaff} onValueChange={setAssignedStaff}>
            <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="Select assigned staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assigned staff</SelectItem>
              {staff.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name || "Unnamed"}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={treatmentFilter} onValueChange={(v) => { setTreatmentFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="All treatments" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All treatments</SelectItem>
              {treatmentOptions.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="added_asc">Date Added (ASC)</SelectItem>
              <SelectItem value="added_desc">Date Added (DESC)</SelectItem>
              <SelectItem value="due_asc">Due Date (ASC)</SelectItem>
              <SelectItem value="due_desc">Due Date (DESC)</SelectItem>
              <SelectItem value="treatment_asc">Treatment (A–Z)</SelectItem>
              <SelectItem value="treatment_desc">Treatment (Z–A)</SelectItem>
              <SelectItem value="name_asc">Name (A–Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z–A)</SelectItem>
            </SelectContent>
          </Select>

        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {statusFilters.map((sf) => {
          const active = filterStatus === sf.value;
          return (
            <button key={sf.value} type="button" onClick={() => setFilterStatus(sf.value)} className="text-left">
              <Card className={cn("shadow-card transition-all hover:shadow-card-hover", active ? sf.ring : "border-border", !active && sf.soft)}>
                <CardContent className="p-4 flex flex-col items-center gap-1">
                  <sf.icon size={16} className={sf.tone} />
                  <p className={cn("text-sm font-semibold", sf.tone)}>{sf.label}</p>
                  <p className={cn("text-2xl font-bold font-display", sf.tone)}>{sf.count}</p>
                  {active && <Badge className="text-[10px] h-4 px-2 rounded-full">Selected</Badge>}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>


      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name / phone / note..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-52" />
        </div>

        <Select value={datePreset} onValueChange={v => { setDatePreset(v); if (v !== "custom") { setCustomFrom(undefined); setCustomTo(undefined); } }}>
          <SelectTrigger className="h-8 text-xs w-[140px]"><CalendarIcon size={12} className="mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {datePreset === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs", !customFrom && "text-muted-foreground")}>
                  {customFrom ? format(customFrom, "dd MMM yy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs", !customTo && "text-muted-foreground")}>
                  {customTo ? format(customTo, "dd MMM yy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </>
        )}


        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={clearFilters}>
            <X size={12} className="mr-1" /> Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Treatment</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && paginated.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No follow-ups found</TableCell></TableRow>
              )}
              {paginated.map((f: any) => {
                const lead = f.leads;
                const dueDate = new Date(f.due_date);
                const isOverdue = f.status === "pending" && isBefore(dueDate, startOfDay(new Date()));
                const isDueToday = f.status === "pending" && isToday(dueDate);
                return (
                  <TableRow key={f.id} className={cn(isOverdue && "bg-destructive/5", isDueToday && "bg-warning/5")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                          {lead?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
                        </div>
                        <div>
                          <p
                            className={cn("text-sm font-medium cursor-pointer hover:text-primary hover:underline", f.status === "done" && "line-through text-muted-foreground")}
                            onClick={() => setSelectedLeadId(f.lead_id)}
                          >{lead?.name || "—"}</p>
                          {lead?.city && <p className="text-[10px] text-muted-foreground">{lead.city}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs"><Phone size={10} className="text-muted-foreground" /> {lead?.phone || "—"}</div>
                        {lead?.email && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Mail size={10} /> {lead.email}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{lead?.treatment_interest || "—"}</TableCell>
                    <TableCell className="text-xs">{lead?.source || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{f.note || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(f.created_at), "dd MMM yy")}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-xs font-medium",
                        isOverdue && "text-destructive",
                        isDueToday && "text-warning",
                        !isOverdue && !isDueToday && "text-muted-foreground"
                      )}>
                        {format(dueDate, "dd MMM yyyy")}
                        {isOverdue && <span className="ml-1 text-[10px]">(Overdue)</span>}
                        {isDueToday && <span className="ml-1 text-[10px]">(Today)</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select value={f.status} onValueChange={(v) => changeStatus.mutate({ id: f.id, newStatus: v })}>
                        <SelectTrigger className={cn("h-7 text-[11px] w-[120px]", statusBadgeColors[f.status])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.created_by || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
            </p>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="h-7 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 rows</SelectItem>
                <SelectItem value="20">20 rows</SelectItem>
                <SelectItem value="30">30 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
                <SelectItem value="100">100 rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
              return (
                <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setCurrentPage(page)}>
                  {page}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {selectedLeadId && (() => {
        const followUp = followUps.find((f: any) => f.lead_id === selectedLeadId);
        const lead = followUp?.leads;
        if (!lead) return null;
        return (
          <OpportunityDetail
            lead={{ ...lead, id: selectedLeadId }}
            open={true}
            onOpenChange={(open) => { if (!open) setSelectedLeadId(null); }}
          />
        );
      })()}
    </div>
  );
};

export default FollowUps;
