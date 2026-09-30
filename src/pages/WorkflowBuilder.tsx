import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Folder,
  MoreVertical,
  Plus,
  LayoutGrid,
  Copy,
  FolderPlus,
  Link2,
  Pencil,
  Trash2,
  RefreshCw,
  RotateCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ---------- Types ----------
type FolderRec = {
  id: string;
  name: string;
  updated_at: string;
};

type WorkflowRec = {
  id: string;
  name: string;
  subtitle: string;
  folder_id: string | null;
  meta_form_id: string | null;
  reentry: boolean;
  status: boolean;
  total_contacts: number;
  completed: number;
  updated_at: string;
};

type RunRec = {
  created_at: string;
  contact_name: string | null;
  contact_phone: string | null;
  step: string | null;
  status: string;
  meta_lead_id?: string | null;
  submitted_at?: string | null;
};


// Relative "time ago" formatter
const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
};

const WorkflowBuilder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [folders, setFolders] = useState<FolderRec[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRec[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("latest");

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveWorkflowId, setMoveWorkflowId] = useState<string | null>(null);
  const [moveDestination, setMoveDestination] = useState<string>("__root__");

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneWorkflowId, setCloneWorkflowId] = useState<string | null>(null);

  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsWorkflowId, setLogsWorkflowId] = useState<string | null>(null);
  const [logsRows, setLogsRows] = useState<RunRec[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Counters reflect activity from 30 Jul 2026 (IST) onwards only
  const COUNT_CUTOFF_ISO = "2026-07-29T18:30:00.000Z";

  // ---- Provider sync (extensible: meta today, google/website/whatsapp later) ----
  type SyncProvider = {
    id: string;
    label: string;
    run: () => Promise<{ added: number; updated: number; skipped: number }>;
  };

  const SYNC_CACHE_KEY = "workflow_sync_cache_v1";

  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);


  const metaProvider: SyncProvider = {
    id: "meta",
    label: "Meta Forms",
    run: async () => {
      const { data, error } = await supabase.functions.invoke("meta-ads", {
        body: { action: "list_lead_forms" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      const forms = (data?.forms ?? []) as Array<{ id: string; name?: string; status?: string }>;

      let prev: Record<string, string> = {};
      try {
        prev = JSON.parse(localStorage.getItem(SYNC_CACHE_KEY) || "{}");
      } catch { prev = {}; }

      let added = 0, updated = 0, skipped = 0;
      const next: Record<string, string> = {};
      for (const f of forms) {
        const isActive = !f.status || String(f.status).toUpperCase() === "ACTIVE";
        next[f.id] = f.name ?? "";
        if (!isActive) { skipped += 1; continue; }
        if (!(f.id in prev)) added += 1;
        else if (prev[f.id] !== (f.name ?? "")) updated += 1;
      }
      localStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(next));

      // Keep every workflow's Meta Form label in sync with Meta's current form name
      const { data: wfRows } = await supabase
        .from("workflows")
        .select("id,subtitle,meta_form_id")
        .not("meta_form_id", "is", null);
      for (const w of (wfRows ?? []) as any[]) {
        const metaName = next[String(w.meta_form_id)];
        if (!metaName) continue;
        const desired = `Meta Form: ${metaName}`;
        if (String(w.subtitle ?? "") !== desired) {
          await supabase.from("workflows").update({ subtitle: desired }).eq("id", w.id);
        }
      }
      return { added, updated, skipped };
    },
  };


  const syncProviders: SyncProvider[] = [metaProvider];

  // NOTE: the browser no longer fires workflows for existing leads. The old
  // backfillRuns() helper compared leads against a workflow_runs query capped at
  // 1,000 rows by the Data API, so nearly every lead looked unprocessed and the
  // whole list was re-sent on each page open — the cause of duplicate WhatsApp
  // blasts. Lead catch-up is owned solely by the lead-sync-cron job, which uses
  // candidate-scoped paginated lookups and a hard per-run cap.

  const handleSync = async (silent = true) => {
    if (syncing) return;
    setSyncing(true);
    try {
      await Promise.all(syncProviders.map((p) => p.run()));
      // Pull the latest Meta leads into the CRM. Workflow execution for those
      // leads is handled server-side by lead-sync-cron, never from here.
      try {
        const { data: sync, error: syncErr } = await supabase.functions.invoke("meta-ads", {
          body: { action: "sync_leads_to_crm" },
        });
        if (syncErr) throw syncErr;
        if ((sync as any)?.error) throw new Error((sync as any).message || (sync as any).error);
      } catch (e) {
        // Internal-only: never surfaced in the UI.
        console.warn("Meta lead ingestion failed:", e instanceof Error ? e.message : e);
      }
      await load();
    } catch (e) {
      // Internal-only: never surfaced in the UI.
      console.warn("Meta forms sync failed:", e instanceof Error ? e.message : e);
    } finally {
      setSyncing(false);
    }
  };



  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
      toast({ title: "Workflow list refreshed" });
    } finally {
      setRefreshing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const [{ data: f, error: fe }, { data: w, error: we }, { data: runs }, { data: leadRows }] = await Promise.all([
      supabase.from("workflow_folders").select("id,name,updated_at").order("updated_at", { ascending: false }),
      supabase.from("workflows").select("id,name,subtitle,folder_id,meta_form_id,reentry,status,total_contacts,completed,updated_at").order("updated_at", { ascending: false }),
      supabase
        .from("workflow_runs")
        .select("workflow_id,status,meta_lead_id,contact_phone,created_at")
        .gte("created_at", COUNT_CUTOFF_ISO)
        .limit(10000),
      (supabase as any)
        .from("leads")
        .select("id,meta_form_id,meta_lead_id,phone,created_at")
        .not("meta_form_id", "is", null)
        .gte("created_at", COUNT_CUTOFF_ISO)
        .limit(10000),
    ]);
    if (fe) toast({ title: "Failed to load folders", description: fe.message, variant: "destructive" });
    if (we) toast({ title: "Failed to load workflows", description: we.message, variant: "destructive" });

    // Distinct contacts per workflow since the cutoff; completed = contacts
    // whose steps all succeeded.
    const contacts = new Map<string, Map<string, boolean>>();
    for (const r of runs ?? []) {
      const wid = (r as any).workflow_id as string;
      if (!wid) continue;
      const key = String((r as any).meta_lead_id || (r as any).contact_phone || (r as any).created_at);
      if (!contacts.has(wid)) contacts.set(wid, new Map());
      const m = contacts.get(wid)!;
      const ok = String((r as any).status || "").toLowerCase() === "success";
      m.set(key, (m.get(key) ?? true) && ok);
    }

    // Leads that arrived from each Meta form since the cutoff — these count as
    // contacts even if the workflow engine has not executed for them yet.
    const leadsByForm = new Map<string, Set<string>>();
    for (const l of (leadRows ?? []) as any[]) {
      const fid = String(l.meta_form_id);
      if (!leadsByForm.has(fid)) leadsByForm.set(fid, new Set());
      leadsByForm.get(fid)!.add(String(l.meta_lead_id || l.phone || l.id));
    }

    setFolders(f ?? []);
    setWorkflows(
      (w ?? []).map((row: any) => {
        const m = contacts.get(row.id);
        const runTotal = m ? m.size : 0;
        const done = m ? Array.from(m.values()).filter(Boolean).length : 0;
        const leadTotal = row.meta_form_id ? (leadsByForm.get(String(row.meta_form_id))?.size ?? 0) : 0;
        return { ...row, total_contacts: Math.max(runTotal, leadTotal), completed: done };
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    handleSync(true);
    // Realtime subscription so webhook-driven counter updates reflect live
    const channel = supabase
      .channel("workflows-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflows" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_runs" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, async () => {
        // A Meta lead just landed (webhook or sync): run any pending workflow
        // for it and refresh counters instantly.
        await load();
      })

      .subscribe();
    // Ingestion + workflow catch-up now runs server-side every 10 minutes
    // (lead-sync-cron), so no browser polling timer is needed here. Realtime
    // above keeps the counters live while the page is open.
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Folder counts (computed from workflows)
  const folderCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of workflows) if (w.folder_id) map[w.folder_id] = (map[w.folder_id] ?? 0) + 1;
    return map;
  }, [workflows]);

  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) : undefined;

  const destinationLabel =
    moveDestination === "__root__"
      ? "All Workflows"
      : folders.find((f) => f.id === moveDestination)?.name ?? "All Workflows";

  // ---------- Handlers ----------
  const handleCreateFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    const { error } = await supabase.from("workflow_folders").insert({ name });
    if (error) return toast({ title: "Create folder failed", description: error.message, variant: "destructive" });
    setFolderName("");
    setFolderDialogOpen(false);
    load();
  };

  const openMoveDialog = (id: string) => {
    const wf = workflows.find((w) => w.id === id);
    setMoveWorkflowId(id);
    setMoveDestination(wf?.folder_id ?? "__root__");
    setMoveDialogOpen(true);
  };

  const handleMoveWorkflow = async () => {
    if (!moveWorkflowId) return;
    const targetFolderId = moveDestination === "__root__" ? null : moveDestination;
    const { error } = await supabase
      .from("workflows")
      .update({ folder_id: targetFolderId })
      .eq("id", moveWorkflowId);
    if (error) return toast({ title: "Move failed", description: error.message, variant: "destructive" });
    setMoveDialogOpen(false);
    setMoveWorkflowId(null);
    load();
  };

  const openCloneDialog = (id: string) => {
    setCloneWorkflowId(id);
    setCloneDialogOpen(true);
  };

  const handleCloneWorkflow = async () => {
    if (!cloneWorkflowId) return;
    const src = workflows.find((w) => w.id === cloneWorkflowId);
    if (!src) return;
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    const { error } = await supabase.from("workflows").insert({
      name: `${src.name} Cloned on ${dd}-${mm}-${yyyy}`,
      subtitle: src.subtitle,
      folder_id: null,
      meta_form_id: src.meta_form_id,
      reentry: src.reentry,
      status: false,
    });
    if (error) return toast({ title: "Clone failed", description: error.message, variant: "destructive" });
    setCloneDialogOpen(false);
    setCloneWorkflowId(null);
    load();
  };

  const toggleStatus = async (id: string, next: boolean) => {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, status: next } : w)));
    const { error } = await supabase.from("workflows").update({ status: next }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); load(); }
  };

  const toggleReentry = async (id: string, next: boolean) => {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, reentry: next } : w)));
    const { error } = await supabase.from("workflows").update({ reentry: next }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); load(); }
  };

  const deleteWorkflow = async (id: string) => {
    const { error } = await supabase.from("workflows").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };

  const deleteFolder = async (id: string) => {
    const { error } = await supabase.from("workflow_folders").delete().eq("id", id);
    if (error) return toast({ title: "Delete folder failed", description: error.message, variant: "destructive" });
    load();
  };

  const openLogs = async (id: string) => {
    setLogsWorkflowId(id);
    setLogsOpen(true);
    setLogsLoading(true);
    const { data, error } = await supabase
      .from("workflow_runs")
      .select("created_at,contact_name,contact_phone,step,status,meta_lead_id")
      .eq("workflow_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast({ title: "Load logs failed", description: error.message, variant: "destructive" });

    let rows: RunRec[] = (data ?? []) as RunRec[];
    const leadIds = Array.from(new Set(rows.map((r) => r.meta_lead_id).filter(Boolean))) as string[];
    if (leadIds.length) {
      // Single lookup for all rows: meta_lead_id -> leads.created_at (Meta submission time)
      const { data: leads, error: leadsErr } = await (supabase as any)
        .from("leads")
        .select("meta_lead_id,created_at")
        .in("meta_lead_id", leadIds);

      if (leadsErr) {
        console.error("Submitted At lookup failed:", leadsErr);
        toast({
          title: "Submitted At unavailable",
          description: leadsErr.message,
          variant: "destructive",
        });
      }

      const map = new Map<string, string>(
        (leads ?? [])
          .filter((l: any) => l?.meta_lead_id && l?.created_at)
          .map((l: any) => [String(l.meta_lead_id), String(l.created_at)])
      );
      rows = rows.map((r) => ({
        ...r,
        submitted_at: r.meta_lead_id ? map.get(String(r.meta_lead_id)) ?? null : null,
      }));
    }
    setLogsRows(rows);
    setLogsLoading(false);
  };


  const logsWorkflow = workflows.find((w) => w.id === logsWorkflowId);

  // ---------- Derived rows ----------
  type Row =
    | ({ kind: "folder" } & FolderRec & { count: number })
    | ({ kind: "workflow" } & WorkflowRec);

  const filteredRows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows: Row[] = [];

    if (openFolderId) {
      // Inside folder: workflows only
      rows = workflows
        .filter((w) => w.folder_id === openFolderId)
        .map((w) => ({ kind: "workflow" as const, ...w }));
    } else {
      rows = [
        ...folders.map((f) => ({ kind: "folder" as const, ...f, count: folderCount[f.id] ?? 0 })),
        ...workflows.filter((w) => !w.folder_id).map((w) => ({ kind: "workflow" as const, ...w })),
      ];
    }

    return rows
      .filter((r) => {
        if (q) {
          const hay =
            r.kind === "workflow" ? `${r.name} ${r.subtitle}`.toLowerCase() : r.name.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (r.kind === "workflow" && status !== "all") {
          if (status === "active" && !r.status) return false;
          if (status === "inactive" && r.status) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        const ta = new Date(a.updated_at).getTime();
        const tb = new Date(b.updated_at).getTime();
        switch (sort) {
          case "oldest": return ta - tb;
          case "az": return a.name.localeCompare(b.name);
          case "za": return b.name.localeCompare(a.name);
          case "latest":
          default: return tb - ta;
        }
      });
  }, [folders, workflows, folderCount, openFolderId, search, status, sort]);

  const allWorkflowIds = filteredRows.filter((r) => r.kind === "workflow").map((r) => r.id);
  const allChecked = allWorkflowIds.length > 0 && allWorkflowIds.every((id) => selected[id]);
  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = { ...selected };
    allWorkflowIds.forEach((id) => (next[id] = checked));
    setSelected(next);
  };

  return (
    <div className="space-y-4 bg-white min-h-screen">
      {openFolder && (
        <div className="text-sm">
          <button
            onClick={() => setOpenFolderId(null)}
            className="text-emerald-700 hover:underline font-medium"
          >
            All
          </button>
          <span className="mx-2 text-slate-400">›</span>
          <span className="text-slate-700 font-medium">{openFolder.name}</span>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-3">
        <Checkbox
          checked={allChecked}
          onCheckedChange={(v) => toggleAll(Boolean(v))}
          className="ml-1"
        />
        <div className="flex-1" />

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type to search"
          className="w-64 rounded-full"
        />

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-36 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="az">A - Z</SelectItem>
            <SelectItem value="za">Z - A</SelectItem>
          </SelectContent>
        </Select>






        <Button
          onClick={() => setFolderDialogOpen(true)}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
        >
          <Plus size={16} /> Folder
        </Button>
        <Button
          onClick={() => navigate("/automation-workflow/new")}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
        >
          <Plus size={16} /> Workflow
        </Button>
        <Button className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
          <LayoutGrid size={16} /> Pre-Built
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-white hover:bg-white">
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-slate-700 font-semibold">Automation Name</TableHead>
              <TableHead className="text-slate-700 font-semibold">Allow Re-entry</TableHead>
              <TableHead className="text-slate-700 font-semibold">Total Contacts</TableHead>
              <TableHead className="text-slate-700 font-semibold">Completed</TableHead>
              <TableHead className="text-slate-700 font-semibold">Last Updated</TableHead>
              <TableHead className="text-slate-700 font-semibold">Status</TableHead>
              <TableHead className="text-slate-700 font-semibold">History</TableHead>
              <TableHead className="text-slate-700 font-semibold text-right pr-4">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row, idx) =>
              row.kind === "folder" ? (
                <TableRow
                  key={row.id}
                  className={cn("cursor-pointer", idx % 2 === 0 ? "bg-slate-50/60" : "bg-white")}
                >
                  <TableCell></TableCell>
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <Folder className="text-slate-500 mt-0.5" size={20} strokeWidth={1.5} />
                      <div>
                        <button
                          onClick={() => setOpenFolderId(row.id)}
                          className="text-emerald-700 font-medium hover:underline text-left"
                        >
                          {row.name}
                        </button>
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
                            {row.count} Workflow{row.count === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-sm text-slate-600">
                    <div>{relTime(row.updated_at)}</div>
                    <div className="text-xs text-slate-400">Last updated</div>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="gap-2">
                          <Pencil size={14} /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-destructive" onClick={() => deleteFolder(row.id)}>
                          <Trash2 size={14} /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow
                  key={row.id}
                  className={cn(idx % 2 === 0 ? "bg-slate-50/60" : "bg-white")}
                >
                  <TableCell>
                    <Checkbox
                      checked={!!selected[row.id]}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [row.id]: Boolean(v) }))}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => navigate(`/automation-workflow/edit/${row.id}`)}
                      className="text-left font-medium text-slate-800 hover:text-emerald-700 hover:underline"
                    >
                      {row.name}
                    </button>
                    <div className="text-xs text-slate-500">{row.subtitle}</div>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.reentry}
                      onCheckedChange={(v) => toggleReentry(row.id, Boolean(v))}
                      className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{row.total_contacts}</div>
                    <div className="text-xs text-slate-400">Contacts</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{row.completed}</div>
                    <div className="text-xs text-slate-400">Complete</div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    <div>{relTime(row.updated_at)}</div>
                    <div className="text-xs text-slate-400">Last updated</div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.status}
                      onCheckedChange={(v) => toggleStatus(row.id, Boolean(v))}
                      className="data-[state=checked]:bg-emerald-600"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => openLogs(row.id)}
                      className="rounded-full h-7 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold tracking-wide"
                    >
                      LOGS
                    </Button>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="gap-2" onClick={() => navigate(`/automation-workflow/edit/${row.id}`)}>
                          <Pencil size={14} /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onClick={() => openCloneDialog(row.id)}>
                          <Copy size={14} /> Clone
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onClick={() => openMoveDialog(row.id)}>
                          <FolderPlus size={14} /> Move to Folder
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onClick={() => toggleStatus(row.id, !row.status)}>
                          <Link2 size={14} /> {row.status ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-destructive" onClick={() => deleteWorkflow(row.id)}>
                          <Trash2 size={14} /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            )}
            {!loading && filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-slate-500 py-8">
                  {openFolderId ? "No workflows in this folder yet." : "No workflows yet. Create one to get started."}
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-slate-500 py-8">
                  Loading…
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Select defaultValue="10">
              <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <span>
              Rows per page Showing{" "}
              <span className="font-medium">1–{filteredRows.length}</span> of{" "}
              <span className="font-medium">{filteredRows.length}</span> records
            </span>
          </div>
          <div>Page 1 of 1</div>
        </div>
      </div>

      {/* Create Folder */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create Folder</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Folder will help to organize Automation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="folder-name" className="text-sm font-medium">
              Folder Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder Name"
              className="border-sky-400 focus-visible:ring-sky-400"
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
            />
          </div>
          <DialogFooter className="sm:justify-center gap-3">
            <Button onClick={() => setFolderDialogOpen(false)} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-6">Cancel</Button>
            <Button onClick={handleCreateFolder} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-6 font-semibold tracking-wide">CONFIRM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-lg font-bold">Move to Folder</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Select Destination</Label>
            <Select value={moveDestination} onValueChange={setMoveDestination}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">/ (All Workflows)</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:justify-center gap-3">
            <Button onClick={() => setMoveDialogOpen(false)} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-6">Cancel</Button>
            <Button onClick={handleMoveWorkflow} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-6 font-semibold tracking-wide">
              Move to {destinationLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone confirmation */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500 text-lg font-bold">?</div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-bold">Are you sure?</DialogTitle>
                <DialogDescription className="text-sm text-slate-500">Do you want to clone this Automation</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button onClick={() => setCloneDialogOpen(false)} className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-6">Cancel</Button>
            <Button onClick={handleCloneWorkflow} className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-6">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execution Logs */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Execution Logs {logsWorkflow ? `— ${logsWorkflow.name}` : ""}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Recent runs for this workflow
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">Loading…</TableCell></TableRow>
                ) : logsRows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">No executions yet.</TableCell></TableRow>
                ) : (
                  logsRows.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{l.submitted_at ? new Date(l.submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</TableCell>

                      <TableCell className="text-xs">
                        {l.contact_name || "—"}{l.contact_phone ? ` (${l.contact_phone})` : ""}
                      </TableCell>
                      <TableCell className="text-xs">{l.step || "—"}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          l.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        )}>
                          {l.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkflowBuilder;
