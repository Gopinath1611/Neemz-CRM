import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageSquare, MoreHorizontal, LayoutGrid, List, CalendarIcon, X, Search, SlidersHorizontal, Download, Upload, FileSpreadsheet, RefreshCw, Bell, Plus, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isAfter, isBefore, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, subMonths, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import { OpportunityDetail, allStages } from "@/components/pipeline/OpportunityDetail";
import * as XLSX from "xlsx";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { useAuth } from "@/contexts/AuthContext";
import { LeadOwnerSelect } from "@/components/pipeline/LeadOwnerSelect";
import { useCurrentCrmUser } from "@/hooks/useCrmUsers";
import { logLeadActivity, auditPatch } from "@/lib/leadAudit";
import { usePermissions } from "@/hooks/usePermissions";

type ViewMode = "kanban" | "list";

interface PipelineStage {
  id: string;
  title: string;
  color: string;
  statuses: string[];
}

const stages: PipelineStage[] = [
  { id: "new", title: "New Leads", color: "bg-primary", statuses: ["new_lead"] },
  { id: "interested", title: "Interested", color: "bg-info", statuses: ["interested", "contacted"] },
  { id: "callback", title: "Callback", color: "bg-warning", statuses: ["callback", "not_reachable", "not_clicking", "partially_looking", "reschedule"] },
  { id: "booked", title: "Appointment Booked", color: "bg-accent", statuses: ["consultation_booked"] },
  { id: "diagnosed", title: "Diagnosed", color: "bg-accent", statuses: ["diagnosed", "treatment_started"] },
  { id: "completed", title: "Treatment Done", color: "bg-success", statuses: ["treatment_completed"] },
  { id: "lost", title: "Not Interested / Lost", color: "bg-destructive", statuses: ["not_interested", "lost"] },
];

const unknownStage: PipelineStage = { id: "unknown", title: "Unknown", color: "bg-muted-foreground", statuses: [] };
const stageForStatus = (status: string) => stages.find(s => s.statuses.includes(status)) || unknownStage;
// Exact stage label for a lead status (e.g. "Reschedule" instead of the "Callback" group)
const exactStageLabel = (status: string) => allStages.find(s => s.value === status)?.label || "";

const sourceColors: Record<string, string> = {
  "Google Ads": "bg-source-google", "Instagram": "bg-source-meta", "Facebook Ads": "bg-source-meta",
  "Website": "bg-source-website", "Walk-in": "bg-source-walkin", "Referral": "bg-accent",
  "WhatsApp": "bg-success", "Dental Camp": "bg-warning", "Meta Ads": "bg-source-meta",
};

const allSources = ["Instagram", "Facebook Ads", "Google Ads", "Meta Ads", "Website", "Dental Camp", "WhatsApp", "Walk-in", "Referral"];
const defaultTreatments = ["Cleaning", "Root Canal", "Implant", "Invisalign", "Braces", "Kids Dentistry", "Teeth Whitening", "Wisdom Tooth"];

const treatmentValues: Record<string, number> = {
  "Cleaning": 3000, "Root Canal": 12000, "Implant": 85000, "Invisalign": 150000,
  "Braces": 45000, "Kids Dentistry": 5000, "Teeth Whitening": 8000, "Wisdom Tooth": 5000,
};

const calcScore = (t: string, s: string) => {
  const base = treatmentValues[t] || 5000;
  const mult: Record<string, number> = { "Google Ads": 1.3, "Instagram": 1.2, "Facebook Ads": 1.1, "Meta Ads": 1.2, "Referral": 1.4, "Website": 1.0, "WhatsApp": 0.9, "Walk-in": 0.8, "Dental Camp": 0.7 };
  return Math.round((base / 1000) * (mult[s] || 1));
};
const calcPriority = (score: number) => score >= 100 ? "critical" : score >= 50 ? "high" : score >= 20 ? "medium" : "low";

const priorityColors: Record<string, string> = {
  hot: "bg-destructive/10 text-destructive border-destructive/20",
  warm: "bg-warning/10 text-warning border-warning/20",
  cold: "bg-info/10 text-info border-info/20",
  won: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning border-warning/20",
  medium: "bg-info/10 text-info border-info/20",
  low: "bg-muted text-muted-foreground border-border",
};

// Recruitment/hiring lead forms never belong in the sales pipeline.
const HR_FORM_PATTERN = /\b(job|jobs|hiring|hire|recruit\w*|telecalling|telecaller|assistant|vacancy|walk[-\s]?in\s+interview|career)\b/i;
const isRecruitmentLead = (l: any) => {
  const haystack = [
    l?.meta_form_name,
    l?.campaign_name,
    l?.source,
    (l?.notes || "").match(/Form:\s*([^.\n]+)/i)?.[1],
    (l?.notes || "").match(/Campaign:\s*([^.\n]+)/i)?.[1],
  ]
    .filter(Boolean)
    .join(" | ");
  return HR_FORM_PATTERN.test(haystack);
};

const Pipeline = () => {
  const perms = usePermissions("/pipeline");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { treatmentNames } = useClinicMasters();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const currentUser = useCurrentCrmUser();
  const allTreatments = useMemo(() => {
    const masterSet = new Set(treatmentNames);
    defaultTreatments.forEach(t => masterSet.add(t));
    return [...masterSet];
  }, [treatmentNames]);
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterTreatment, setFilterTreatment] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [filterExactStage, setFilterExactStage] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterCampaigns, setFilterCampaigns] = useState<string[]>([]);
  const [filterFormName, setFilterFormName] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; withExport: boolean } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", age: "", email: "", city: "", dental_problem: "", treatment_interest: "", source: "", notes: "" });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["pipeline-leads"],
    queryFn: async () => {
      // Only show leads that came from Meta campaign forms configured as a
      // trigger in a Lead Automation workflow (plus leads added manually here).
      const { data: wfs } = await supabase
        .from("workflows")
        .select("meta_form_id")
        .not("meta_form_id", "is", null);
      const formIds = Array.from(
        new Set((wfs || []).map((w: any) => w.meta_form_id).filter(Boolean))
      ) as string[];

      // Pipeline shows leads created on/after 30 Jul 2026 only (IST cutoff)
      const CUTOFF_ISO = "2026-07-29T18:30:00.000Z";

      // Fetch ALL leads in pages (Supabase caps a single request at 1000 rows)
      const CHUNK = 1000;
      let from = 0;
      const all: any[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from("leads")
          .select("*")
          .gte("created_at", CUTOFF_ISO)
          .order("created_at", { ascending: false })
          .range(from, from + CHUNK - 1);
        // No form filter here: leads from new or unattached Meta forms must
        // still load, and are tagged with `_formLinked` below.
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < CHUNK) break;
        from += CHUNK;
      }
      // Keep leads from forms that aren't wired to a workflow yet — they show a
      // "Campaign form not linked" badge instead of silently disappearing.
      // Recruitment/HR forms stay out of the sales pipeline.
      return all
        .map((l: any) => ({
          ...l,
          _formLinked: !l.meta_form_id || formIds.includes(String(l.meta_form_id)),
        }))
        .filter((l: any) => !isRecruitmentLead(l));
    },
    refetchInterval: 30000,
  });

  // Campaign column: map lead.meta_form_id -> active Lead Automation name
  const { data: campaignByForm = {} } = useQuery({
    queryKey: ["pipeline-campaign-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workflows")
        .select("name, meta_form_id, status")
        .not("meta_form_id", "is", null);
      const map: Record<string, string> = {};
      (data || []).forEach((w: any) => {
        const isActive = w.status === true || w.status === "active" || w.status === "Active";
        if (isActive && w.meta_form_id) map[String(w.meta_form_id)] = w.name;
      });

      return map;
    },
    refetchInterval: 60000,
  });

  // Form Name column: map lead.meta_form_id -> Meta lead form name
  const { data: formNameById = {} } = useQuery({
    queryKey: ["pipeline-form-names"],
    queryFn: async () => {
      const map: Record<string, string> = {};
      try {
        const { data } = await supabase.functions.invoke("meta-ads", { body: { action: "list_lead_forms" } });
        (data?.forms || []).forEach((f: any) => {
          if (f?.id) map[String(f.id)] = f.name || "";
        });
      } catch { /* silent — fallback to form id */ }
      return map;
    },
    refetchInterval: 300000,
    staleTime: 120000,
  });





  // Live sync: trigger Meta lead sync to CRM on mount + every 60s so new
  // workflow-driven leads land in Pipeline without opening Workflow Builder.
  useEffect(() => {
    let cancelled = false;
    const syncMeta = async () => {
      try {
        await supabase.functions.invoke("meta-ads", { body: { action: "sync_leads_to_crm" } });
        if (!cancelled) queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      } catch { /* silent */ }
    };
    syncMeta();
    const intv = setInterval(syncMeta, 60000);
    return () => { cancelled = true; clearInterval(intv); };
  }, [queryClient]);

  // Realtime: refresh pipeline the moment a lead is inserted/updated/deleted.
  useEffect(() => {
    const channel = supabase
      .channel("pipeline-leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead updated" });
    },
  });

  // "Appointment Booked" must come from an actual appointment. Admins may
  // override with a confirmation; other roles are blocked.
  const [confirmBooked, setConfirmBooked] = useState<{ id: string; status: string } | null>(null);

  const hasAppointmentForLead = async (phone: string) => {
    if (!phone) return false;
    const { data: patients } = await supabase.from("patients").select("id").eq("phone", phone);
    if (!patients || patients.length === 0) return false;
    const { data: apts } = await supabase
      .from("appointments")
      .select("id")
      .in("patient_id", patients.map(p => p.id))
      .limit(1);
    return !!(apts && apts.length > 0);
  };

  const moveStage = async (lead: any, status: string) => {
    if (status === "consultation_booked" && !(await hasAppointmentForLead(lead.phone))) {
      if (!isAdmin) {
        toast({
          title: "Book an appointment instead",
          description: "This stage is set automatically when an appointment is booked for the lead.",
          variant: "destructive",
        });
        return;
      }
      setConfirmBooked({ id: lead.id, status });
      return;
    }
    updateStatus.mutate({ id: lead.id, status });
  };



  const assignOwner = useMutation({
    mutationFn: async ({ lead, userId, userName }: { lead: any; userId: string | null; userName: string | null }) => {
      const { error } = await supabase.from("leads").update({
        assigned_to_id: userId,
        assigned_to_name: userName,
        ...auditPatch(currentUser),
        updated_at: new Date().toISOString(),
      } as any).eq("id", lead.id);
      if (error) throw error;
      await logLeadActivity({
        leadId: lead.id,
        action: "assignment",
        description: userName
          ? `Lead assigned to ${userName} by ${currentUser.name}`
          : `Lead unassigned by ${currentUser.name}`,
        field: "assigned_to",
        oldValue: lead.assigned_to_name || null,
        newValue: userName,
      }, currentUser);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead owner updated" });
    },
    onError: (e: any) => toast({ title: "Could not assign", description: e.message, variant: "destructive" }),
  });



  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      // Chunk the ids — a single .in() with thousands of UUIDs blows the URL
      // length limit and the request fails with 400 Bad Request.
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { error } = await supabase.from("leads").delete().in("id", slice);
        if (error) throw error;
      }
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSelectedIds(new Set());
      toast({ title: `${ids.length} lead${ids.length > 1 ? "s" : ""} deleted` });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const addLead = useMutation({
    mutationFn: async (f: typeof addForm) => {
      const score = calcScore(f.treatment_interest, f.source);
      const { error } = await supabase.from("leads").insert({
        name: f.name, phone: f.phone,
        age: f.age ? parseInt(f.age) : null,
        email: f.email || null, city: f.city || null,
        dental_problem: f.dental_problem || null,
        treatment_interest: f.treatment_interest, source: f.source,
        lead_score: score, estimated_value: treatmentValues[f.treatment_interest] || 0,
        ai_priority: calcPriority(score), notes: f.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setAddOpen(false);
      setAddForm({ name: "", phone: "", age: "", email: "", city: "", dental_problem: "", treatment_interest: "", source: "", notes: "" });
      toast({ title: "Lead added" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const handleBulkDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmDelete({ ids, withExport: false });
  };
  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getDateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: endOfDay(now) };
      case "yesterday": return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case "7days": return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case "30days": return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      case "this_week": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
      case "this_month": return { from: startOfMonth(now), to: endOfDay(now) };
      case "last_month": return { from: startOfMonth(subMonths(now, 1)), to: endOfDay(startOfMonth(now)) };
      case "this_year": return { from: startOfYear(now), to: endOfDay(now) };
      case "custom": return { from: customFrom, to: customTo };
      default: return { from: undefined, to: undefined };
    }
  }, [datePreset, customFrom, customTo]);

  const recencyTs = (l: any) => (l.created_at ? new Date(l.created_at).getTime() : 0);


  const campaignLabelOf = (lead: any) => {
    const map = campaignByForm as Record<string, string>;
    const byForm = lead.meta_form_id ? map[String(lead.meta_form_id)] : "";
    const fromNotes = (lead.notes || "").match(/Campaign:\s*([^.\n]+)/i)?.[1]?.trim();
    return (byForm || (fromNotes && fromNotes !== "—" ? fromNotes : "") || "").trim();
  };

  const formLabelOf = (lead: any) => {
    const names = formNameById as Record<string, string>;
    const fid = lead.meta_form_id ? String(lead.meta_form_id) : "";
    const stored = (lead.meta_form_name || "").trim();
    const fromNotes = (lead.notes || "").match(/Form:\s*([^.\n]+)/i)?.[1]?.trim();
    const notesName = fromNotes && fromNotes !== "—" && !/^\d+$/.test(fromNotes) ? fromNotes : "";
    return (stored || (fid && names[fid]) || notesName || "").trim();
  };

  const treatmentOptions = useMemo(() => {
    const set = new Set<string>(allTreatments);
    leads.forEach((l: any) => { const t = (l.treatment_interest || "").trim(); if (t) set.add(t); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allTreatments, leads]);

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l: any) => { const c = campaignLabelOf(l); if (c) set.add(c); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [leads, campaignByForm]);

  const formNameOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l: any) => { const f = formLabelOf(l); if (f) set.add(f); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [leads, formNameById]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l: any) => { const c = (l.city || "").trim(); if (c) set.add(c); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l: any) => { const o = (l.assigned_to_name || "").trim(); if (o) set.add(o); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filtered = useMemo(() => {
    const { from: dateFrom, to: dateTo } = getDateRange;
    return leads.filter((lead: any) => {
      const matchesSearch = !search || lead.name?.toLowerCase().includes(search.toLowerCase()) || lead.phone?.includes(search);
      const matchesSource = filterSource === "all" || lead.source === filterSource;
      const matchesTreatment = filterTreatment === "all" || lead.treatment_interest === filterTreatment;
      const matchesPriority = filterPriority === "all" || lead.ai_priority === filterPriority;
      const matchesStage = filterStage === "all" || stageForStatus(lead.status).id === filterStage;
      const matchesExactStage = filterExactStage === "all" || lead.status === filterExactStage;
      const matchesLocation = filterLocation === "all" || (lead.city || "").trim() === filterLocation;
      const matchesOwner = filterOwner === "all" || (lead.assigned_to_name || "").trim() === filterOwner;
      const matchesCampaign = filterCampaigns.length === 0 || filterCampaigns.includes(campaignLabelOf(lead));
      const matchesForm = filterFormName === "all" || formLabelOf(lead) === filterFormName;
      const createdAt = new Date(lead.created_at);
      const matchesDateFrom = !dateFrom || isAfter(createdAt, startOfDay(dateFrom));
      const matchesDateTo = !dateTo || isBefore(createdAt, endOfDay(dateTo));
      return matchesSearch && matchesSource && matchesTreatment && matchesPriority && matchesStage && matchesExactStage && matchesLocation && matchesOwner && matchesCampaign && matchesForm && matchesDateFrom && matchesDateTo;
    }).slice().sort((a: any, b: any) => recencyTs(b) - recencyTs(a));
  }, [leads, search, filterSource, filterTreatment, filterPriority, filterStage, filterExactStage, filterLocation, filterOwner, filterCampaigns, filterFormName, getDateRange, campaignByForm, formNameById]);

  const activeFilterCount = [filterSource, filterTreatment, filterPriority, filterStage, filterExactStage, filterLocation, filterOwner, filterFormName].filter(f => f !== "all").length + (datePreset !== "all" ? 1 : 0) + (filterCampaigns.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setFilterSource("all"); setFilterTreatment("all"); setFilterPriority("all"); setFilterStage("all"); setFilterExactStage("all"); setFilterLocation("all"); setFilterOwner("all");
    setFilterCampaigns([]); setFilterFormName("all");
    setDatePreset("all"); setCustomFrom(undefined); setCustomTo(undefined); setSearch("");
  };

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset page when filters change
  useMemo(() => { setCurrentPage(1); }, [filtered.length]);

  // Excel / CSV Export
  const toExportRows = (rows: any[]) => rows.map((l: any) => ({
    Name: l.name,
    Phone: l.phone,
    Email: l.email || "",
    City: l.city || "",
    Age: l.age || "",
    Treatment: l.treatment_interest,
    Source: l.source,
    Status: l.status,
    Priority: l.ai_priority || "",
    "Lead Score": l.lead_score,
    "Estimated Value": l.estimated_value || 0,
    "Dental Problem": l.dental_problem || "",
    Notes: l.notes || "",
    "Created At": format(new Date(l.created_at), "dd MMM yyyy hh:mm a"),
  }));

  const handleExport = (rows: any[] = filtered, fileFormat: "xlsx" | "csv" = "xlsx") => {
    if (!rows.length) { toast({ title: "Nothing to export", variant: "destructive" }); return; }
    const exportData = toExportRows(rows);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pipeline Leads");
    const name = `Pipeline_Leads_${format(new Date(), "yyyy-MM-dd")}.${fileFormat}`;
    XLSX.writeFile(wb, name, { bookType: fileFormat });
    toast({ title: "Exported!", description: `${exportData.length} leads downloaded.` });
    return true;
  };

  const selectedLeads = useMemo(() => filtered.filter((l: any) => selectedIds.has(l.id)), [filtered, selectedIds]);

  const handleExportAndDelete = () => {
    const rows = selectedLeads;
    if (!rows.length) return;
    setConfirmDelete({ ids: rows.map((l: any) => l.id), withExport: true });
  };

  const runConfirmedDelete = () => {
    if (!confirmDelete) return;
    const { ids, withExport } = confirmDelete;
    if (withExport) {
      const rows = leads.filter((l: any) => ids.includes(l.id));
      const ok = handleExport(rows, "xlsx");
      if (!ok) { setConfirmDelete(null); return; }
    }
    bulkDelete.mutate(ids);
    setConfirmDelete(null);
  };

  const selectAllFiltered = () => setSelectedIds(new Set(filtered.map((l: any) => l.id)));

  // Sample Template Download
  const handleDownloadTemplate = () => {
    const sample = [
      { Name: "John Doe", Phone: "+91 98765 43210", Email: "john@example.com", City: "Chennai", Age: 30, Treatment: "Implant", Source: "Google Ads", "Dental Problem": "Missing tooth", Notes: "Interested in implant" },
      { Name: "Jane Smith", Phone: "+91 87654 32109", Email: "", City: "Coimbatore", Age: 25, Treatment: "Braces", Source: "Instagram", "Dental Problem": "Crooked teeth", Notes: "" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample");
    XLSX.writeFile(wb, "Pipeline_Import_Template.xlsx");
    toast({ title: "Template downloaded", description: "Fill in data and import." });
  };

  // Excel Import
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) { toast({ title: "Empty file", variant: "destructive" }); return; }
        const inserts = rows.map(r => ({
          name: r["Name"] || r["name"] || "",
          phone: String(r["Phone"] || r["phone"] || ""),
          email: r["Email"] || r["email"] || null,
          city: r["City"] || r["city"] || null,
          age: r["Age"] || r["age"] ? parseInt(r["Age"] || r["age"]) : null,
          treatment_interest: r["Treatment"] || r["treatment"] || "Consultation",
          source: r["Source"] || r["source"] || "Walk-in",
          dental_problem: r["Dental Problem"] || r["dental_problem"] || null,
          notes: r["Notes"] || r["notes"] || null,
        })).filter(r => r.name && r.phone);
        if (inserts.length === 0) { toast({ title: "No valid rows found", description: "Ensure Name & Phone columns exist.", variant: "destructive" }); return; }
        const { error } = await supabase.from("leads").insert(inserts);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        toast({ title: `${inserts.length} leads imported!` });
      } catch (err: any) {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const getInitials = (name: string) => name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  const renderLeadCard = (lead: any) => (
    <Card key={lead.id} className="shadow-card hover:shadow-card-hover transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {getInitials(lead.name)}
            </div>
            <div>
              <button onClick={() => setSelectedLead(lead)} className="text-sm font-medium hover:text-primary hover:underline cursor-pointer text-left">
                {lead.name}
              </button>
              <p className="text-xs text-muted-foreground">{lead.phone}</p>
              {lead.city && <p className="text-[10px] text-muted-foreground">{lead.city}</p>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {stages.filter(s => !s.statuses.includes(lead.status)).map(s => (
                <DropdownMenuItem key={s.id} onClick={() => moveStage(lead, s.statuses[0])}>
                  Move to {s.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Treatment</span>
            <span className="font-medium">{lead.treatment_interest}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Value</span>
            <span className="font-semibold text-success">₹{(lead.estimated_value || 0).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${sourceColors[lead.source] || "bg-muted-foreground"}`} />
            <span className="text-xs text-muted-foreground">{lead.source}</span>
          </div>
          {(lead as any)._formLinked === false && (
            <Badge variant="outline" className="h-5 whitespace-nowrap border-warning/30 bg-warning/10 text-[10px] text-warning">
              Campaign form not linked
            </Badge>
          )}
          {lead.ai_priority && (
            <Badge variant="outline" className={cn("text-[10px] h-5", priorityColors[lead.ai_priority])}>
              AI: {lead.ai_priority}
            </Badge>
          )}
          <div className="text-[10px] text-muted-foreground">
            {lead.updated_at && lead.updated_at !== lead.created_at
              ? `Updated: ${format(new Date(lead.updated_at), "dd MMM yyyy, hh:mm a")}`
              : format(new Date(lead.created_at), "dd MMM yyyy, hh:mm a")}
          </div>
        </div>

        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-primary">
            <Phone size={12} className="mr-1" /> Call
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-success">
            <MessageSquare size={12} className="mr-1" /> WhatsApp
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderKanban = () => (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map(stage => {
        const stageLeads = filtered.filter((l: any) => stage.statuses.includes(l.status));
        const stageValue = stageLeads.reduce((s: number, l: any) => s + (l.estimated_value || 0), 0);
        return (
          <div key={stage.id} className="flex-shrink-0 w-72">
            <div className="flex items-center gap-2 mb-3">
              <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
              <h3 className="text-sm font-semibold font-display">{stage.title}</h3>
              <Badge variant="secondary" className="text-xs ml-auto">{stageLeads.length}</Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mb-2">₹{stageValue.toLocaleString("en-IN")}</div>
            <div className="space-y-3">
              {stageLeads.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">No leads</div>
              )}
              {stageLeads.map(renderLeadCard)}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderList = () => {
    const allOnPageSelected = paginatedLeads.length > 0 && paginatedLeads.every((l: any) => selectedIds.has(l.id));
    const toggleSelectAllOnPage = () => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (allOnPageSelected) paginatedLeads.forEach((l: any) => next.delete(l.id));
        else paginatedLeads.forEach((l: any) => next.add(l.id));
        return next;
      });
    };
    return (
    <Card>
      <CardContent className="p-0">
        {isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-secondary border-b">
            <span className="text-sm font-medium">
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${filtered.length} selected`
                : `${filtered.length} leads${filtered.length !== leads.length ? ` (of ${leads.length} total)` : ""}`}
            </span>
            <div className="flex flex-wrap gap-2">
              {selectedIds.size > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                Select all {filtered.length}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={selectedIds.size === 0} onClick={() => handleExport(selectedLeads, "xlsx")}>
                <Download size={12} /> Export selected ({selectedIds.size})
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExportAndDelete} disabled={selectedIds.size === 0 || bulkDelete.isPending}>
                <FileSpreadsheet size={12} /> Download &amp; Delete ({selectedIds.size})
              </Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => handleBulkDelete([...selectedIds])} disabled={selectedIds.size === 0 || bulkDelete.isPending || !perms.canDelete}>
                <Trash2 size={12} /> Delete {selectedIds.size}
              </Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-10">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAllOnPage} aria-label="Select all" />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Treatment</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Form Name</TableHead>
              <TableHead>Owner</TableHead>

              <TableHead>Value</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Lead Rating</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLeads.length === 0 && (
              <TableRow><TableCell colSpan={isAdmin ? 16 : 15} className="text-center text-muted-foreground py-8">No leads found</TableCell></TableRow>
            )}
            {paginatedLeads.map((lead: any) => {
              const stage = stageForStatus(lead.status);
              return (
                <TableRow key={lead.id} data-state={selectedIds.has(lead.id) ? "selected" : undefined}>
                  {isAdmin && (
                    <TableCell>
                      <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleRow(lead.id)} aria-label={`Select ${lead.name}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                        {getInitials(lead.name)}
                      </div>
                      <button onClick={() => setSelectedLead(lead)} className="font-medium text-sm hover:text-primary hover:underline cursor-pointer text-left">
                        {lead.name}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.email || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.city || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.treatment_interest}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${sourceColors[lead.source] || "bg-muted-foreground"}`} />
                      <span className="text-sm">{lead.source}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const map = campaignByForm as Record<string, string>;
                      const byForm = lead.meta_form_id ? map[String(lead.meta_form_id)] : "";
                      const fromNotes = (lead.notes || "").match(/Campaign:\s*([^.\n]+)/i)?.[1]?.trim();
                      const label = byForm || (fromNotes && fromNotes !== "—" ? fromNotes : "");
                      if ((lead as any)._formLinked === false) {
                        const rawForm = ((lead as any).meta_form_name || "").trim()
                          || (formNameById as Record<string, string>)[String(lead.meta_form_id)]
                          || String(lead.meta_form_id || "");
                        return (
                          <Badge variant="outline" className="h-5 whitespace-nowrap border-warning/30 bg-warning/10 text-[10px] text-warning">
                            Campaign form not linked{rawForm ? `: ${rawForm}` : ""}
                          </Badge>
                        );
                      }
                      return label ? <span>{label}</span> : <span className="text-muted-foreground">—</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const names = formNameById as Record<string, string>;
                      const fid = lead.meta_form_id ? String(lead.meta_form_id) : "";
                      const stored = ((lead as any).meta_form_name || "").trim();
                      const fromNotes = (lead.notes || "").match(/Form:\s*([^.\n]+)/i)?.[1]?.trim();
                      const notesName = fromNotes && fromNotes !== "—" && !/^\d+$/.test(fromNotes) ? fromNotes : "";
                      const label = stored || (fid && names[fid]) || notesName;
                      return label ? <span>{label}</span> : <span className="text-muted-foreground">—</span>;
                    })()}

                  </TableCell>
                  <TableCell>
                    <LeadOwnerSelect
                      value={lead.assigned_to_id || null}
                      onChange={(userId, userName) => assignOwner.mutate({ lead, userId, userName })}
                      className="w-[150px]"
                      disabled={assignOwner.isPending}
                    />
                  </TableCell>


                  <TableCell className="text-sm font-semibold text-success">₹{(lead.estimated_value || 0).toLocaleString("en-IN")}</TableCell>

                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px]", !exactStageLabel(lead.status) && "text-muted-foreground")}>
                      <span className={`h-1.5 w-1.5 rounded-full mr-1 ${stage.color}`} />
                      {exactStageLabel(lead.status) || "Unknown"}
                    </Badge>
                    {exactStageLabel(lead.status) && exactStageLabel(lead.status) !== stage.title && (
                      <div className="mt-0.5 text-[9px] text-muted-foreground">{stage.title}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.ai_priority && (
                      <Badge variant="outline" className={cn("text-[10px]", priorityColors[lead.ai_priority])}>
                        {lead.ai_priority}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{format(new Date(lead.created_at), "dd MMM yy")}</div>
                    <div className="text-[10px]">{format(new Date(lead.created_at), "hh:mm a")}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.updated_at ? (
                      <>
                        <div>{format(new Date(lead.updated_at), "dd MMM yy")}</div>
                        <div className="text-[10px]">{format(new Date(lead.updated_at), "hh:mm a")}</div>
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {stages.filter(s => !s.statuses.includes(lead.status)).map(s => (
                            <DropdownMenuItem key={s.id} onClick={() => moveStage(lead, s.statuses[0])}>
                              Move to {s.title}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    );
  };

  const totalValue = filtered.reduce((s: number, l: any) => s + (l.estimated_value || 0), 0);

  const [syncing, setSyncing] = useState(false);
  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-leads-sync", { body: { hours: 72 } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Sync failed");
      await queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      const inserted = data?.inserted ?? 0;
      const skipped = data?.skipped ?? 0;
      const unlinked = data?.unlinked ?? 0;
      toast({
        title: inserted
          ? `${inserted} new lead${inserted === 1 ? "" : "s"} added`
          : "Sync complete — nothing new to add",
        description: [
          `Inserted (new leads): ${inserted}`,
          `Skipped (already in CRM): ${skipped}`,
          `Unlinked campaign forms: ${unlinked}`,
          data?.summary || (inserted === 0 ? "Everything Meta sent is already in the CRM — this is not an error." : ""),
        ].filter(Boolean).join(" · "),
      });
    } catch (e: any) {
      toast({ title: "Meta sync failed", description: e?.message || "Unable to reach Meta.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };


  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} leads{filtered.length !== leads.length ? ` of ${leads.length} total` : ""}{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""} · ₹{totalValue.toLocaleString("en-IN")} total value
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-56" />
          </div>

          {/* Source filter */}
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SlidersHorizontal size={12} className="mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pipelines</SelectItem>
              {allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Stage / Status filter */}
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Add Lead */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs gradient-primary border-0 gap-1">
                <Plus size={14} /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display">Add New Lead</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Name *</Label><Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Patient name" /></div>
                  <div className="space-y-1.5"><Label>Phone *</Label><Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Age</Label><Input type="number" value={addForm.age} onChange={e => setAddForm(f => ({ ...f, age: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} /></div>
                </div>
                <div className="space-y-1.5"><Label>City</Label><Input value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Source *</Label>
                    <Select value={addForm.source} onValueChange={v => setAddForm(f => ({ ...f, source: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>{allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Treatment *</Label>
                    <Select value={addForm.treatment_interest} onValueChange={v => setAddForm(f => ({ ...f, treatment_interest: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select treatment" /></SelectTrigger>
                      <SelectContent>{allTreatments.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Dental Problem</Label><Input value={addForm.dental_problem} onChange={e => setAddForm(f => ({ ...f, dental_problem: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} /></div>
                {addForm.treatment_interest && addForm.source && (
                  <div className="p-2 rounded-md bg-accent/5 border border-accent/10 text-xs flex items-center gap-2">
                    <Sparkles size={12} className="text-accent" />
                    AI Score: <span className="font-medium">{calcScore(addForm.treatment_interest, addForm.source)}</span>
                    <span className="ml-auto text-muted-foreground">Est. ₹{(treatmentValues[addForm.treatment_interest] || 0).toLocaleString()}</span>
                  </div>
                )}
                <Button className="gradient-primary border-0" disabled={!addForm.name || !addForm.phone || !addForm.source || !addForm.treatment_interest || addLead.isPending} onClick={() => addLead.mutate(addForm)}>
                  Save Lead
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* New Leads Notification */}
          {(() => {
            const newLeadCount = leads.filter((l: any) => l.status === "new_lead").length;
            return newLeadCount > 0 ? (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-primary/30 text-primary" onClick={() => { setFilterStage("new"); }}>
                <Bell size={12} />
                {newLeadCount} New Leads
                <Badge className="h-4 px-1.5 text-[10px] bg-primary text-primary-foreground">{newLeadCount}</Badge>
              </Button>
            ) : null;
          })()}

          {/* Instant Force Sync from Meta */}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1 border-primary/30 text-primary" disabled={syncing} onClick={handleForceSync}>
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing..." : "Sync Now"}
          </Button>

          {/* Refresh */}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] }); toast({ title: "Refreshed", description: "Pipeline data reloaded." }); }}>
            <RefreshCw size={12} /> Refresh
          </Button>


          {/* Page Size */}
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 leads</SelectItem>
              <SelectItem value="10">10 leads</SelectItem>
              <SelectItem value="20">20 leads</SelectItem>
              <SelectItem value="50">50 leads</SelectItem>
            </SelectContent>
          </Select>

          {/* Export / Import — Admin only */}
          {isAdmin && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Download size={12} /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={selectAllFiltered}>
                    <Checkbox checked className="mr-2 pointer-events-none" /> Select all {filtered.length} leads
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(filtered, "xlsx")}>
                    <FileSpreadsheet size={12} className="mr-2" /> Export all filtered (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(filtered, "csv")}>
                    <FileSpreadsheet size={12} className="mr-2" /> Export all filtered (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={selectedIds.size === 0} onClick={() => handleExport(selectedLeads, "xlsx")}>
                    <Download size={12} className="mr-2" /> Export selected ({selectedIds.size})
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={selectedIds.size === 0} className="text-destructive focus:text-destructive" onClick={handleExportAndDelete}>
                    <Trash2 size={12} className="mr-2" /> Download &amp; delete selected ({selectedIds.size})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>


              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Upload size={12} /> Import
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload size={12} className="mr-2" /> Import Excel File
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownloadTemplate}>
                    <FileSpreadsheet size={12} className="mr-2" /> Download Sample Template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
            </>
          )}

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={clearFilters}>
              <X size={12} className="mr-1" /> Clear ({activeFilterCount})
            </Button>
          )}
          <div className="flex border rounded-md overflow-hidden">
            <Button variant="default" size="sm" className="h-8 rounded-none text-xs px-2.5">
              <List size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", activeFilterCount > 0 && "border-primary text-primary")}>
              <SlidersHorizontal size={12} />
              Filters
              {activeFilterCount > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">{activeFilterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3 pointer-events-auto max-h-[70vh] overflow-y-auto" align="end" sideOffset={6}>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filter by</p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Created Date</label>
                <Select value={datePreset} onValueChange={(v) => { setDatePreset(v); if (v !== "custom") { setCustomFrom(undefined); setCustomTo(undefined); } }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
                {datePreset === "custom" && (
                  <div className="flex gap-2 mt-1.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("h-8 text-xs flex-1", !customFrom && "text-muted-foreground")}>
                          <CalendarIcon size={12} className="mr-1" />
                          {customFrom ? format(customFrom, "dd MMM yy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("h-8 text-xs flex-1", !customTo && "text-muted-foreground")}>
                          <CalendarIcon size={12} className="mr-1" />
                          {customTo ? format(customTo, "dd MMM yy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Treatment</label>
                <Select value={filterTreatment} onValueChange={setFilterTreatment}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Treatments</SelectItem>
                    {treatmentOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Source</label>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Pipelines</SelectItem>
                    {allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Location</label>
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locationOptions.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Owner</label>
                <Select value={filterOwner} onValueChange={setFilterOwner}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Owners</SelectItem>
                    {ownerOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Stage</label>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Exact Stage</label>
                <Select value={filterExactStage} onValueChange={setFilterExactStage}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Exact Stages</SelectItem>
                    {allStages.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>


              <div className="space-y-1.5">
                <label className="text-xs font-medium">Lead Temperature</label>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Temperatures</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Campaign</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between text-xs font-normal">
                      <span className="truncate">
                        {filterCampaigns.length === 0
                          ? "All Campaigns"
                          : filterCampaigns.length === 1
                            ? filterCampaigns[0]
                            : `${filterCampaigns.length} campaigns selected`}
                      </span>
                      <SlidersHorizontal size={12} className="ml-1 shrink-0 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[260px] p-0">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-xs font-medium">Select campaigns</span>
                      {filterCampaigns.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px] text-destructive" onClick={() => setFilterCampaigns([])}>Clear</Button>
                      )}
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {campaignOptions.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No campaigns found</p>
                      )}
                      {campaignOptions.map(c => {
                        const checked = filterCampaigns.includes(c);
                        return (
                          <label key={c} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/60">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setFilterCampaigns(prev => v ? [...prev, c] : prev.filter(x => x !== c))
                              }
                            />
                            <span className="truncate">{c}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Form Name</label>
                <Select value={filterFormName} onValueChange={setFilterFormName}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Forms</SelectItem>
                    {formNameOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-destructive" onClick={clearFilters} disabled={activeFilterCount === 0 && !search}>
                <X size={12} className="mr-1" /> Clear All Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading pipeline...</div>
      ) : renderList()}

      {/* Pagination */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              Prev
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
              return (
                <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setCurrentPage(page)}>
                  {page}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Opportunity Detail Dialog */}
      <OpportunityDetail
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => { if (!open) setSelectedLead(null); }}
        onLeadUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {confirmDelete?.ids.length ?? 0} lead{(confirmDelete?.ids.length ?? 0) > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.withExport
                ? `An Excel file with ${confirmDelete?.ids.length} lead(s) will be downloaded first, then they will be permanently deleted from the database.`
                : `${confirmDelete?.ids.length ?? 0} selected lead(s) will be permanently deleted from the database.`}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={runConfirmedDelete}
            >
              {confirmDelete?.withExport ? "Download & Delete" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmBooked} onOpenChange={(o) => !o && setConfirmBooked(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No appointment on record</AlertDialogTitle>
            <AlertDialogDescription>
              This lead has no appointment on record — are you sure you want to move it to "Appointment Booked"?
              Normally this stage is set automatically when an appointment is booked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmBooked(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmBooked) updateStatus.mutate(confirmBooked);
                setConfirmBooked(null);
              }}
            >
              Yes, move anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pipeline;
