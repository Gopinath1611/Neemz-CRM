import { useState, useMemo, useRef } from "react";
import { Youtube, Sparkles, Plus, Calendar as CalIcon, Lightbulb, Clock, Hash, Filter, CheckCircle2, Circle, Trash2, Pencil, Download, Upload, FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const categories = ["Before & After", "Commercial", "Testimonial", "Education", "Brand Video", "Reel/Short", "Dental Tip", "Myth vs Fact"];
const platforms = ["Instagram", "Facebook", "YouTube Shorts", "Google Business"];
const stageStatuses = ["pending", "in_progress", "done"];

const viralHooks = [
  "This mistake is ruining your teeth. 🦷",
  "Dentists hate when patients do this...",
  "The real reason your teeth are turning yellow.",
  "Stop doing this if you want white teeth!",
  "3 signs you need a root canal (don't ignore #2)",
  "Why your child's teeth are growing crooked",
  "Invisalign vs Braces: The truth nobody tells you",
  "This ₹500 habit can save you ₹50,000 in dental bills",
];

const suggestedHashtags = ["#DrNeemzDentistry", "#SalemDentist", "#DentalCare", "#SmileMakeover", "#Invisalign", "#TeethWhitening", "#DentalImplants", "#OralHealth"];

const reelIdeas = [
  "Day in the life of a dentist in Salem",
  "Patient reaction after teeth whitening",
  "Invisalign journey - Month 1 vs Month 6",
  "Quick dental tip in 15 seconds",
  "Behind the scenes: How we do implants",
  "Kids first dental visit - so cute! 🥺",
];

const bestPostingTimes = [
  { day: "Monday", time: "10:00 AM", engagement: "High" },
  { day: "Wednesday", time: "7:00 PM", engagement: "Very High" },
  { day: "Friday", time: "12:00 PM", engagement: "High" },
  { day: "Saturday", time: "11:00 AM", engagement: "Very High" },
  { day: "Sunday", time: "6:00 PM", engagement: "Medium" },
];

const emptyForm = {
  id: "", title: "", category: "", platform: "", topic: "", caption: "", hashtags: "", hook: "", scheduled_date: "",
  script_status: "pending", script_by: "",
  shoot_status: "pending", shoot_by: "",
  edit_status: "pending", edit_by: "",
  post_status: "pending", posted_by: "",
  remarks: "",
};

const CSV_HEADERS = [
  "Date", "Platform", "Title", "Category", "Topic", "Hook", "Caption", "Hashtags",
  "Script Status", "Script By", "Shoot Status", "Shoot By", "Edit Status", "Edit By",
  "Post Status", "Posted By", "Remarks",
];

const csvEscape = (v: any) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c !== "")) rows.push(row);
  return rows;
};

const validStage = (v: string) => (stageStatuses.includes(v) ? v : "pending");

const stageColor = (s: string) =>
  s === "done" ? "bg-success/15 text-success border-success/30" :
  s === "in_progress" ? "bg-warning/15 text-warning border-warning/30" :
  "bg-muted text-muted-foreground border-border";

const ContentCalendar = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: content = [] } = useQuery({
    queryKey: ["content-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_calendar").select("*").order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const payload: any = {
        title: data.title, content_type: data.category || "post", category: data.category, platform: data.platform,
        topic: data.topic, caption: data.caption, hashtags: data.hashtags, hook: data.hook,
        scheduled_date: data.scheduled_date || null,
        script_status: data.script_status, script_by: data.script_by,
        shoot_status: data.shoot_status, shoot_by: data.shoot_by,
        edit_status: data.edit_status, edit_by: data.edit_by,
        post_status: data.post_status, posted_by: data.posted_by,
        remarks: data.remarks,
      };
      if (data.id) {
        const { error } = await supabase.from("content_calendar").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("content_calendar").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: "Saved" });
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const { error } = await supabase.from("content_calendar").update({ [field]: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content-calendar"] }),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_calendar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["content-calendar"] }); toast({ title: "Deleted" }); },
  });

  const months = useMemo(() => {
    const set = new Set<string>();
    content.forEach((c: any) => { if (c.scheduled_date) set.add(c.scheduled_date.slice(0, 7)); });
    set.add(filterMonth);
    return Array.from(set).sort().reverse();
  }, [content, filterMonth]);

  const platformOptions = useMemo(() => {
    const set = new Set<string>(platforms);
    content.forEach((c: any) => { if (c.platform) set.add(c.platform); });
    return Array.from(set).sort();
  }, [content]);

  const filtered = useMemo(() => {
    return content.filter((c: any) => {
      if (filterMonth !== "all" && (!c.scheduled_date || !c.scheduled_date.startsWith(filterMonth))) return false;
      if (filterCategory !== "all" && c.category !== filterCategory) return false;
      if (filterPlatform !== "all" && c.platform !== filterPlatform) return false;
      if (filterStatus === "completed" && c.post_status !== "done") return false;
      if (filterStatus === "pending" && c.post_status === "done") return false;
      return true;
    });
  }, [content, filterMonth, filterCategory, filterPlatform, filterStatus]);

  const stats = useMemo(() => ({
    total: filtered.length,
    posted: filtered.filter((c: any) => c.post_status === "done").length,
    inProgress: filtered.filter((c: any) => c.post_status !== "done" && (c.script_status === "done" || c.shoot_status === "done" || c.edit_status === "done")).length,
    pending: filtered.filter((c: any) => c.script_status === "pending" && c.shoot_status === "pending" && c.edit_status === "pending" && c.post_status === "pending").length,
  }), [filtered]);

  const exportCsv = () => {
    if (!filtered.length) { toast({ title: "Nothing to export", description: "No content matches the current filters." }); return; }
    const lines = [CSV_HEADERS.join(",")];
    filtered.forEach((c: any) => {
      lines.push([
        c.scheduled_date || "", c.platform || "", c.title || "", c.category || c.content_type || "",
        c.topic || "", c.hook || "", c.caption || "", c.hashtags || "",
        c.script_status || "", c.script_by || "", c.shoot_status || "", c.shoot_by || "",
        c.edit_status || "", c.edit_by || "", c.post_status || "", c.posted_by || "", c.remarks || "",
      ].map(csvEscape).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Content_Calendar_${filterMonth === "all" ? "All" : filterMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${filtered.length} rows` });
  };

  const downloadTemplate = () => {
    const sample = [
      "2026-09-15", "Instagram", "Sample Reel Title", "Reel/Short", "Teeth whitening tip",
      viralHooks[0], "Caption text here", "#DrNeemzDentistry", "pending", "", "pending", "", "pending", "", "pending", "", "Sample note",
    ];
    const blob = new Blob(["\uFEFF" + CSV_HEADERS.join(",") + "\n" + sample.map(csvEscape).join(",")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Content_Calendar_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) { toast({ title: "No data rows found in the file", variant: "destructive" }); return; }
    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
    const idx = (name: string) => headers.indexOf(name.toLowerCase());
    if (idx("Title") === -1) { toast({ title: "Invalid file", description: "Use the downloaded template — a 'Title' column is required.", variant: "destructive" }); return; }
    const payloads = rows.slice(1).map(r => ({
      title: (r[idx("Title")] || "").trim(),
      platform: idx("Platform") > -1 ? r[idx("Platform")]?.trim() || null : null,
      category: idx("Category") > -1 ? r[idx("Category")]?.trim() || null : null,
      content_type: idx("Category") > -1 ? r[idx("Category")]?.trim() || "post" : "post",
      topic: idx("Topic") > -1 ? r[idx("Topic")]?.trim() || null : null,
      hook: idx("Hook") > -1 ? r[idx("Hook")]?.trim() || null : null,
      caption: idx("Caption") > -1 ? r[idx("Caption")]?.trim() || null : null,
      hashtags: idx("Hashtags") > -1 ? r[idx("Hashtags")]?.trim() || null : null,
      scheduled_date: idx("Date") > -1 && /^\d{4}-\d{2}-\d{2}$/.test((r[idx("Date")] || "").trim()) ? r[idx("Date")].trim() : null,
      script_status: validStage((r[idx("Script Status")] || "").trim()),
      script_by: idx("Script By") > -1 ? r[idx("Script By")]?.trim() || null : null,
      shoot_status: validStage((r[idx("Shoot Status")] || "").trim()),
      shoot_by: idx("Shoot By") > -1 ? r[idx("Shoot By")]?.trim() || null : null,
      edit_status: validStage((r[idx("Edit Status")] || "").trim()),
      edit_by: idx("Edit By") > -1 ? r[idx("Edit By")]?.trim() || null : null,
      post_status: validStage((r[idx("Post Status")] || "").trim()),
      posted_by: idx("Posted By") > -1 ? r[idx("Posted By")]?.trim() || null : null,
      remarks: idx("Remarks") > -1 ? r[idx("Remarks")]?.trim() || null : null,
    })).filter(p => p.title);
    if (!payloads.length) { toast({ title: "No valid rows to import", description: "Every row needs a Title.", variant: "destructive" }); return; }
    const { error } = await supabase.from("content_calendar").insert(payloads);
    if (error) { toast({ title: "Import failed", description: error.message, variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
    toast({ title: `Imported ${payloads.length} rows` });
  };

  const openEdit = (row: any) => {
    setForm({
      id: row.id, title: row.title || "", category: row.category || row.content_type || "", platform: row.platform || "",
      topic: row.topic || "", caption: row.caption || "", hashtags: row.hashtags || "", hook: row.hook || "",
      scheduled_date: row.scheduled_date || "",
      script_status: row.script_status || "pending", script_by: row.script_by || "",
      shoot_status: row.shoot_status || "pending", shoot_by: row.shoot_by || "",
      edit_status: row.edit_status || "pending", edit_by: row.edit_by || "",
      post_status: row.post_status || "pending", posted_by: row.posted_by || "",
      remarks: row.remarks || "",
    });
    setDialogOpen(true);
  };

  const StageCell = ({ row, field, byField }: { row: any; field: string; byField: string }) => (
    <div className="space-y-1 min-w-[110px]">
      <Select value={row[field] || "pending"} onValueChange={(v) => updateStage.mutate({ id: row.id, field, value: v })}>
        <SelectTrigger className={`h-7 text-[11px] border ${stageColor(row[field] || "pending")}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stageStatuses.map(s => <SelectItem key={s} value={s} className="text-xs">{s.replace("_", " ")}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        className="h-6 text-[10px] px-1.5"
        placeholder="By..."
        defaultValue={row[byField] || ""}
        onBlur={(e) => { if (e.target.value !== (row[byField] || "")) updateStage.mutate({ id: row.id, field: byField, value: e.target.value }); }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Filter size={11} /> Month</Label>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {months.map(m => <SelectItem key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Posted?</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Posted ✅</SelectItem>
                <SelectItem value="pending">Not Posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Platform</Label>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {platformOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) await importCsv(f);
            }}
          />
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileSpreadsheet size={14} className="mr-1.5" /> Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} className="mr-1.5" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download size={14} className="mr-1.5" /> Export CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0"><Plus size={16} className="mr-2" /> Add Content</Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle className="font-display">{form.id ? "Edit" : "Create"} Content</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Platform</Label>
                  <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Content title" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Topic</Label><Input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="Script topic" /></div>
              </div>
              <div className="space-y-1.5"><Label>Hook</Label>
                <Select value={form.hook} onValueChange={v => setForm(f => ({ ...f, hook: v }))}><SelectTrigger><SelectValue placeholder="Pick a hook" /></SelectTrigger><SelectContent>{viralHooks.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Script Status</Label>
                  <Select value={form.script_status} onValueChange={v => setForm(f => ({ ...f, script_status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stageStatuses.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Script By</Label><Input value={form.script_by} onChange={e => setForm(f => ({ ...f, script_by: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Shoot Status</Label>
                  <Select value={form.shoot_status} onValueChange={v => setForm(f => ({ ...f, shoot_status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stageStatuses.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Shoot By</Label><Input value={form.shoot_by} onChange={e => setForm(f => ({ ...f, shoot_by: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Edit Status</Label>
                  <Select value={form.edit_status} onValueChange={v => setForm(f => ({ ...f, edit_status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stageStatuses.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Edit By</Label><Input value={form.edit_by} onChange={e => setForm(f => ({ ...f, edit_by: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Post Status</Label>
                  <Select value={form.post_status} onValueChange={v => setForm(f => ({ ...f, post_status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stageStatuses.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label>Posted By</Label><Input value={form.posted_by} onChange={e => setForm(f => ({ ...f, posted_by: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>Caption</Label><Textarea value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} rows={2} /></div>
              <div className="space-y-1.5"><Label>Hashtags</Label><Input value={form.hashtags} onChange={e => setForm(f => ({ ...f, hashtags: e.target.value }))} placeholder="#DrNeemzDentistry" /></div>
              <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} placeholder="Notes / feedback..." /></div>
              <Button className="w-full gradient-primary border-0" onClick={() => upsert.mutate(form)} disabled={!form.title}>{form.id ? "Update" : "Create"}</Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list"><CalIcon size={14} className="mr-1" /> Listed View</TabsTrigger>
          <TabsTrigger value="hooks"><Lightbulb size={14} className="mr-1" /> Viral Hooks</TabsTrigger>
          <TabsTrigger value="reels"><Youtube size={14} className="mr-1" /> Reel Ideas</TabsTrigger>
          <TabsTrigger value="timing"><Clock size={14} className="mr-1" /> Best Times</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{stats.total}</p></CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Posted ✅</p><p className="text-xl font-bold text-success">{stats.posted}</p></CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">In Progress</p><p className="text-xl font-bold text-warning">{stats.inProgress}</p></CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Not Started</p><p className="text-xl font-bold text-muted-foreground">{stats.pending}</p></CardContent></Card>
          </div>

          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-[90px] text-xs">Date</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs">Topic</TableHead>
                      <TableHead className="text-xs">Script</TableHead>
                      <TableHead className="text-xs">Shoot</TableHead>
                      <TableHead className="text-xs">Edit</TableHead>
                      <TableHead className="text-xs">Post</TableHead>
                      <TableHead className="text-xs min-w-[160px]">Remarks</TableHead>
                      <TableHead className="text-xs w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c: any) => {
                      const allDone = c.script_status === "done" && c.shoot_status === "done" && c.edit_status === "done" && c.post_status === "done";
                      return (
                        <TableRow key={c.id} className={allDone ? "bg-success/5" : ""}>
                          <TableCell className="text-xs font-medium align-top py-2">
                            {c.scheduled_date ? new Date(c.scheduled_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                          </TableCell>
                          <TableCell className="text-xs align-top py-2">
                            <div className="flex items-start gap-1.5">
                              {allDone ? <CheckCircle2 size={12} className="text-success mt-0.5 shrink-0" /> : <Circle size={12} className="text-muted-foreground mt-0.5 shrink-0" />}
                              <div>
                                <p className="font-medium">{c.title}</p>
                                {c.platform && <Badge variant="outline" className="text-[9px] mt-0.5">{c.platform}</Badge>}
                                {c.ai_generated && <Badge className="bg-accent/10 text-accent text-[9px] border-0 ml-1"><Sparkles size={8} className="mr-0.5" /> AI</Badge>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs align-top py-2"><Badge variant="outline" className="text-[10px]">{c.category || c.content_type || "—"}</Badge></TableCell>
                          <TableCell className="text-xs align-top py-2 max-w-[140px] truncate" title={c.topic}>{c.topic || "—"}</TableCell>
                          <TableCell className="align-top py-2"><StageCell row={c} field="script_status" byField="script_by" /></TableCell>
                          <TableCell className="align-top py-2"><StageCell row={c} field="shoot_status" byField="shoot_by" /></TableCell>
                          <TableCell className="align-top py-2"><StageCell row={c} field="edit_status" byField="edit_by" /></TableCell>
                          <TableCell className="align-top py-2"><StageCell row={c} field="post_status" byField="posted_by" /></TableCell>
                          <TableCell className="align-top py-2">
                            <Textarea
                              className="h-14 text-[11px] resize-none"
                              defaultValue={c.remarks || ""}
                              placeholder="Notes..."
                              onBlur={(e) => { if (e.target.value !== (c.remarks || "")) updateStage.mutate({ id: c.id, field: "remarks", value: e.target.value }); }}
                            />
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <div className="flex flex-col gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(c)}><Pencil size={12} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this content?")) removeRow.mutate(c.id); }}><Trash2 size={12} /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No content for selected filters. Add your first post!</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hooks" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {viralHooks.map((hook, i) => (
              <Card key={i} className="shadow-card hover:shadow-card-hover transition-shadow cursor-pointer" onClick={() => { setForm({ ...emptyForm, hook }); setDialogOpen(true); }}>
                <CardContent className="p-4"><div className="flex items-start gap-3"><Sparkles size={14} className="text-accent mt-0.5 shrink-0" /><p className="text-sm font-medium">{hook}</p></div></CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reels" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {reelIdeas.map((idea, i) => (
              <Card key={i} className="shadow-card"><CardContent className="p-4 flex items-start gap-3"><Youtube size={14} className="text-destructive mt-0.5 shrink-0" /><p className="text-sm">{idea}</p></CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="timing" className="mt-4">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {bestPostingTimes.map((t, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3"><Clock size={14} className="text-muted-foreground" /><span className="text-sm font-medium">{t.day}</span></div>
                    <span className="text-sm">{t.time}</span>
                    <Badge className={t.engagement === "Very High" ? "bg-success/10 text-success" : t.engagement === "High" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground"}>{t.engagement}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="mt-4 flex flex-wrap gap-2">
            <p className="text-sm font-medium w-full mb-1"><Hash size={14} className="inline mr-1" /> Suggested Hashtags</p>
            {suggestedHashtags.map(h => <Badge key={h} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">{h}</Badge>)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContentCalendar;
