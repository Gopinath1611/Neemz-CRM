import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Briefcase, Users, Plus, Upload, Download, FileText, Phone, Mail,
  ArrowRight, Edit2, Trash2, Calendar, IndianRupee, MapPin, Star, X,
} from "lucide-react";

const STAGES = [
  { id: "applied", label: "Applied", color: "bg-slate-500/10 text-slate-700 border-slate-300" },
  { id: "screening_call", label: "Screening Call", color: "bg-blue-500/10 text-blue-700 border-blue-300" },
  { id: "written_test", label: "Written Test", color: "bg-amber-500/10 text-amber-700 border-amber-300" },
  { id: "technical_interview", label: "Technical Interview", color: "bg-purple-500/10 text-purple-700 border-purple-300" },
  { id: "hr_interview", label: "HR Interview", color: "bg-pink-500/10 text-pink-700 border-pink-300" },
  { id: "offer_onboarding", label: "Offer / Onboarding", color: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
] as const;

const SOURCES = [
  { value: "naukri", label: "Naukri" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "ad_campaign", label: "Ad Campaign" },
  { value: "referral", label: "Referral" },
  { value: "walkin", label: "Walk-in" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "in_progress", label: "In Progress" },
  { value: "selected", label: "Selected" },
  { value: "rejected", label: "Rejected" },
  { value: "on_hold", label: "On Hold" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "joined", label: "Joined" },
];

interface JobOpening {
  id: string;
  title: string;
  department: string;
  designation?: string;
  job_type: string;
  experience_min?: number;
  experience_max?: number;
  salary_min?: number;
  salary_max?: number;
  location?: string;
  openings_count: number;
  filled_count: number;
  hiring_source: string;
  status: string;
  description?: string;
  requirements?: string;
  posted_date?: string;
  closing_date?: string;
}

interface Candidate {
  id: string;
  job_opening_id?: string | null;
  full_name: string;
  email?: string;
  phone: string;
  current_company?: string;
  current_designation?: string;
  experience_years?: number;
  current_ctc?: number;
  expected_ctc?: number;
  notice_period_days?: number;
  location?: string;
  skills?: string;
  source: string;
  source_details?: string;
  resume_url?: string;
  current_stage: string;
  status: string;
  rating?: number;
  date_of_joining?: string;
  offer_amount?: number;
  rejection_reason?: string;
  notes?: string;
}

interface Activity {
  id: string;
  candidate_id: string;
  stage: string;
  activity_type: string;
  outcome?: string;
  score?: number;
  scheduled_at?: string;
  conducted_by_name?: string;
  feedback?: string;
  created_at: string;
}

const Recruitment = () => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const isHR = hasRole("hr" as any);
  const hasAccess = isAdmin || isHR;

  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const [openingDialog, setOpeningDialog] = useState<{ open: boolean; data?: Partial<JobOpening> }>({ open: false });
  const [candidateDialog, setCandidateDialog] = useState<{ open: boolean; data?: Partial<Candidate> }>({ open: false });
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; candidate?: Candidate }>({ open: false });
  const [filterJob, setFilterJob] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: jobs }, { data: cands }] = await Promise.all([
      supabase.from("job_openings").select("*").order("created_at", { ascending: false }),
      supabase.from("recruitment_candidates").select("*").order("created_at", { ascending: false }),
    ]);
    setOpenings((jobs as any) ?? []);
    setCandidates((cands as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (hasAccess) fetchData();
  }, [hasAccess]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filterJob !== "all" && c.job_opening_id !== filterJob) return false;
      if (filterStatus === "active" && ["rejected", "withdrawn", "joined"].includes(c.status)) return false;
      if (filterStatus !== "all" && filterStatus !== "active" && c.status !== filterStatus) return false;
      return true;
    });
  }, [candidates, filterJob, filterStatus]);

  const candidatesByStage = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    STAGES.forEach((s) => (map[s.id] = []));
    filteredCandidates.forEach((c) => {
      if (map[c.current_stage]) map[c.current_stage].push(c);
    });
    return map;
  }, [filteredCandidates]);

  /* ---------- Openings CRUD ---------- */
  const saveOpening = async () => {
    const d = openingDialog.data;
    if (!d?.title) return toast.error("Title is required");
    const payload: any = {
      title: d.title,
      department: d.department || "general",
      designation: d.designation || null,
      job_type: d.job_type || "full_time",
      experience_min: d.experience_min ?? 0,
      experience_max: d.experience_max ?? null,
      salary_min: d.salary_min ?? null,
      salary_max: d.salary_max ?? null,
      location: d.location || null,
      openings_count: d.openings_count || 1,
      hiring_source: d.hiring_source || "naukri",
      status: d.status || "open",
      description: d.description || null,
      requirements: d.requirements || null,
      closing_date: d.closing_date || null,
    };
    if (d.id) {
      const { error } = await supabase.from("job_openings").update(payload).eq("id", d.id);
      if (error) return toast.error(error.message);
      toast.success("Opening updated");
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("job_openings").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Opening created");
    }
    setOpeningDialog({ open: false });
    fetchData();
  };

  const deleteOpening = async (id: string) => {
    if (!confirm("Delete this opening?")) return;
    const { error } = await supabase.from("job_openings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    fetchData();
  };

  /* ---------- Candidate CRUD ---------- */
  const saveCandidate = async () => {
    const d = candidateDialog.data;
    if (!d?.full_name || !d?.phone) return toast.error("Name and phone are required");
    const payload: any = {
      job_opening_id: d.job_opening_id || null,
      full_name: d.full_name,
      email: d.email || null,
      phone: d.phone,
      current_company: d.current_company || null,
      current_designation: d.current_designation || null,
      experience_years: d.experience_years ?? 0,
      current_ctc: d.current_ctc ?? null,
      expected_ctc: d.expected_ctc ?? null,
      notice_period_days: d.notice_period_days ?? null,
      location: d.location || null,
      skills: d.skills || null,
      source: d.source || "naukri",
      source_details: d.source_details || null,
      current_stage: d.current_stage || "applied",
      status: d.status || "in_progress",
      notes: d.notes || null,
    };
    if (d.id) {
      const { error } = await supabase.from("recruitment_candidates").update(payload).eq("id", d.id);
      if (error) return toast.error(error.message);
      toast.success("Candidate updated");
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("recruitment_candidates").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Candidate added");
    }
    setCandidateDialog({ open: false });
    fetchData();
  };

  const deleteCandidate = async (id: string) => {
    if (!confirm("Delete this candidate?")) return;
    const { error } = await supabase.from("recruitment_candidates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setDetailDialog({ open: false });
    fetchData();
  };

  const moveCandidate = async (cand: Candidate, newStage: string) => {
    const { error } = await supabase
      .from("recruitment_candidates")
      .update({ current_stage: newStage })
      .eq("id", cand.id);
    if (error) return toast.error(error.message);
    await supabase.from("recruitment_activities").insert({
      candidate_id: cand.id,
      stage: newStage,
      activity_type: "stage_change",
      feedback: `Moved from ${cand.current_stage} to ${newStage}`,
      created_by: user?.id,
    });
    toast.success(`Moved to ${STAGES.find((s) => s.id === newStage)?.label}`);
    fetchData();
  };

  /* ---------- Resume Upload ---------- */
  const uploadResume = async (candidateId: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${candidateId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("recruitment-files").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    await supabase.from("recruitment_candidates").update({ resume_url: path }).eq("id", candidateId);
    toast.success("Resume uploaded");
    fetchData();
  };

  const downloadResume = async (path: string) => {
    const { data, error } = await supabase.storage.from("recruitment-files").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Failed to get resume link");
    window.open(data.signedUrl, "_blank");
  };

  /* ---------- Import / Export ---------- */
  const exportCSV = () => {
    const headers = [
      "full_name","email","phone","current_company","current_designation","experience_years",
      "current_ctc","expected_ctc","notice_period_days","location","skills","source",
      "current_stage","status","date_of_joining","notes",
    ];
    const rows = filteredCandidates.map((c) =>
      headers.map((h) => {
        const v = (c as any)[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return `"${s}"`;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return toast.error("Empty CSV");
    const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
    const rows = lines.slice(1).map((line) => {
      const cells: string[] = [];
      let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = !inQ;
        else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
        else cur += ch;
      }
      cells.push(cur);
      const obj: any = {};
      headers.forEach((h, idx) => (obj[h] = cells[idx] ?? ""));
      return obj;
    });
    const payloads = rows
      .filter((r) => r.full_name && r.phone)
      .map((r) => ({
        full_name: r.full_name,
        email: r.email || null,
        phone: r.phone,
        current_company: r.current_company || null,
        current_designation: r.current_designation || null,
        experience_years: r.experience_years ? Number(r.experience_years) : 0,
        current_ctc: r.current_ctc ? Number(r.current_ctc) : null,
        expected_ctc: r.expected_ctc ? Number(r.expected_ctc) : null,
        notice_period_days: r.notice_period_days ? Number(r.notice_period_days) : null,
        location: r.location || null,
        skills: r.skills || null,
        source: r.source || "naukri",
        current_stage: r.current_stage || "applied",
        status: r.status || "in_progress",
        notes: r.notes || null,
        created_by: user?.id,
      }));
    if (payloads.length === 0) return toast.error("No valid rows (name+phone required)");
    const { error } = await supabase.from("recruitment_candidates").insert(payloads);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${payloads.length} candidates`);
    fetchData();
  };

  if (!hasAccess) {
    return (
      <Card className="p-12 text-center">
        <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground">Only Admin or HR users can view the Recruitment module.</p>
      </Card>
    );
  }

  const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label || id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Recruitment</h1>
          <p className="text-sm text-muted-foreground">Manage job openings, candidates and hiring workflow</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Briefcase className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Open Positions</p>
              <p className="text-xl font-bold">{openings.filter((o) => o.status === "open").length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Users className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Active Candidates</p>
              <p className="text-xl font-bold">{candidates.filter((c) => !["rejected","withdrawn","joined"].includes(c.status)).length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Star className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="text-xl font-bold">{candidates.filter((c) => c.status === "selected").length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-xl font-bold">{candidates.filter((c) => c.status === "joined").length}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="candidates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="candidates">Candidates Pipeline</TabsTrigger>
          <TabsTrigger value="openings">Job Openings</TabsTrigger>
        </TabsList>

        {/* CANDIDATES */}
        <TabsContent value="candidates" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Filter by opening" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Openings</SelectItem>
                {openings.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ""; }}
                />
                <Button variant="outline" size="sm" asChild><span><Upload size={14} className="mr-1" />Import CSV</span></Button>
              </label>
              <Button variant="outline" size="sm" onClick={exportCSV}><Download size={14} className="mr-1" />Export</Button>
              <Button size="sm" onClick={() => setCandidateDialog({ open: true, data: { current_stage: "applied", status: "in_progress", source: "naukri" } })}>
                <Plus size={14} className="mr-1" />Add Candidate
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {STAGES.map((stage) => (
                <Card key={stage.id} className="p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">{stage.label}</h3>
                    <Badge variant="secondary" className="text-xs">{candidatesByStage[stage.id].length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {candidatesByStage[stage.id].map((c) => {
                      const job = openings.find((o) => o.id === c.job_opening_id);
                      return (
                        <Card
                          key={c.id}
                          className="p-2.5 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setDetailDialog({ open: true, candidate: c })}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-sm font-medium truncate flex-1">{c.full_name}</p>
                            <Badge variant="outline" className={`text-[9px] px-1 ${stage.color}`}>
                              {SOURCES.find((s) => s.value === c.source)?.label}
                            </Badge>
                          </div>
                          {job && <p className="text-[11px] text-muted-foreground truncate">{job.title}</p>}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                            <Phone size={10} />{c.phone}
                          </div>
                          {c.experience_years != null && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{c.experience_years} yrs exp</p>
                          )}
                          {c.status !== "in_progress" && (
                            <Badge className="mt-1 text-[9px]" variant={c.status === "selected" || c.status === "joined" ? "default" : "destructive"}>
                              {c.status}
                            </Badge>
                          )}
                        </Card>
                      );
                    })}
                    {candidatesByStage[stage.id].length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">No candidates</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* OPENINGS */}
        <TabsContent value="openings" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOpeningDialog({ open: true, data: { job_type: "full_time", hiring_source: "naukri", status: "open", openings_count: 1 } })}>
              <Plus size={14} className="mr-1" />New Opening
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {openings.map((o) => {
              const candCount = candidates.filter((c) => c.job_opening_id === o.id).length;
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{o.title}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{o.department} · {o.job_type.replace("_", " ")}</p>
                    </div>
                    <Badge variant={o.status === "open" ? "default" : "secondary"} className="capitalize text-[10px]">{o.status}</Badge>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {o.location && <div className="flex items-center gap-1"><MapPin size={11} />{o.location}</div>}
                    {(o.salary_min || o.salary_max) && (
                      <div className="flex items-center gap-1"><IndianRupee size={11} />
                        {o.salary_min ?? "?"} - {o.salary_max ?? "?"} LPA
                      </div>
                    )}
                    <div>Source: <span className="font-medium text-foreground">{SOURCES.find((s) => s.value === o.hiring_source)?.label}</span></div>
                    <div>Openings: <span className="font-medium text-foreground">{o.filled_count}/{o.openings_count}</span> · Candidates: <span className="font-medium text-foreground">{candCount}</span></div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setOpeningDialog({ open: true, data: o })}><Edit2 size={12} className="mr-1" />Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => deleteOpening(o.id)}><Trash2 size={12} /></Button>
                  </div>
                </Card>
              );
            })}
            {openings.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">No openings yet. Create one to get started.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* OPENING DIALOG */}
      <Dialog open={openingDialog.open} onOpenChange={(v) => !v && setOpeningDialog({ open: false })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{openingDialog.data?.id ? "Edit" : "New"} Job Opening</DialogTitle></DialogHeader>
          {openingDialog.data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Title *</Label>
                <Input value={openingDialog.data.title || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, title: e.target.value } }))} />
              </div>
              <div><Label>Department</Label>
                <Input value={openingDialog.data.department || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, department: e.target.value } }))} />
              </div>
              <div><Label>Designation</Label>
                <Input value={openingDialog.data.designation || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, designation: e.target.value } }))} />
              </div>
              <div><Label>Job Type</Label>
                <Select value={openingDialog.data.job_type} onValueChange={(v) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, job_type: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Location</Label>
                <Input value={openingDialog.data.location || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, location: e.target.value } }))} />
              </div>
              <div><Label>Min Experience (yrs)</Label>
                <Input type="number" value={openingDialog.data.experience_min ?? ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, experience_min: e.target.value ? Number(e.target.value) : 0 } }))} />
              </div>
              <div><Label>Max Experience (yrs)</Label>
                <Input type="number" value={openingDialog.data.experience_max ?? ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, experience_max: e.target.value ? Number(e.target.value) : undefined } }))} />
              </div>
              <div><Label>Salary Min (LPA)</Label>
                <Input type="number" value={openingDialog.data.salary_min ?? ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, salary_min: e.target.value ? Number(e.target.value) : undefined } }))} />
              </div>
              <div><Label>Salary Max (LPA)</Label>
                <Input type="number" value={openingDialog.data.salary_max ?? ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, salary_max: e.target.value ? Number(e.target.value) : undefined } }))} />
              </div>
              <div><Label>Openings</Label>
                <Input type="number" value={openingDialog.data.openings_count ?? 1} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, openings_count: Number(e.target.value) || 1 } }))} />
              </div>
              <div><Label>Hiring Source</Label>
                <Select value={openingDialog.data.hiring_source} onValueChange={(v) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, hiring_source: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={openingDialog.data.status} onValueChange={(v) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, status: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="filled">Filled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Closing Date</Label>
                <Input type="date" value={openingDialog.data.closing_date || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, closing_date: e.target.value } }))} />
              </div>
              <div className="col-span-2"><Label>Description</Label>
                <Textarea rows={2} value={openingDialog.data.description || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, description: e.target.value } }))} />
              </div>
              <div className="col-span-2"><Label>Requirements</Label>
                <Textarea rows={2} value={openingDialog.data.requirements || ""} onChange={(e) => setOpeningDialog((p) => ({ ...p, data: { ...p.data, requirements: e.target.value } }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningDialog({ open: false })}>Cancel</Button>
            <Button onClick={saveOpening}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANDIDATE DIALOG */}
      <Dialog open={candidateDialog.open} onOpenChange={(v) => !v && setCandidateDialog({ open: false })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{candidateDialog.data?.id ? "Edit" : "Add"} Candidate</DialogTitle></DialogHeader>
          {candidateDialog.data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Full Name *</Label>
                <Input value={candidateDialog.data.full_name || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, full_name: e.target.value } }))} />
              </div>
              <div><Label>Phone *</Label>
                <Input value={candidateDialog.data.phone || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, phone: e.target.value } }))} />
              </div>
              <div><Label>Email</Label>
                <Input type="email" value={candidateDialog.data.email || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, email: e.target.value } }))} />
              </div>
              <div className="col-span-2"><Label>Job Opening</Label>
                <Select value={candidateDialog.data.job_opening_id || "none"} onValueChange={(v) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, job_opening_id: v === "none" ? null : v } }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {openings.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Current Company</Label>
                <Input value={candidateDialog.data.current_company || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, current_company: e.target.value } }))} />
              </div>
              <div><Label>Current Designation</Label>
                <Input value={candidateDialog.data.current_designation || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, current_designation: e.target.value } }))} />
              </div>
              <div><Label>Experience (years)</Label>
                <Input type="number" step="0.1" value={candidateDialog.data.experience_years ?? ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, experience_years: e.target.value ? Number(e.target.value) : 0 } }))} />
              </div>
              <div><Label>Notice Period (days)</Label>
                <Input type="number" value={candidateDialog.data.notice_period_days ?? ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, notice_period_days: e.target.value ? Number(e.target.value) : undefined } }))} />
              </div>
              <div><Label>Current CTC</Label>
                <Input type="number" value={candidateDialog.data.current_ctc ?? ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, current_ctc: e.target.value ? Number(e.target.value) : undefined } }))} />
              </div>
              <div><Label>Expected CTC</Label>
                <Input type="number" value={candidateDialog.data.expected_ctc ?? ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, expected_ctc: e.target.value ? Number(e.target.value) : undefined } }))} />
              </div>
              <div><Label>Location</Label>
                <Input value={candidateDialog.data.location || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, location: e.target.value } }))} />
              </div>
              <div><Label>Source</Label>
                <Select value={candidateDialog.data.source} onValueChange={(v) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, source: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Stage</Label>
                <Select value={candidateDialog.data.current_stage} onValueChange={(v) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, current_stage: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={candidateDialog.data.status} onValueChange={(v) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, status: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Skills</Label>
                <Input value={candidateDialog.data.skills || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, skills: e.target.value } }))} placeholder="React, Node, TypeScript..." />
              </div>
              <div className="col-span-2"><Label>Notes</Label>
                <Textarea rows={2} value={candidateDialog.data.notes || ""} onChange={(e) => setCandidateDialog((p) => ({ ...p, data: { ...p.data, notes: e.target.value } }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidateDialog({ open: false })}>Cancel</Button>
            <Button onClick={saveCandidate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      {detailDialog.candidate && (
        <CandidateDetail
          candidate={detailDialog.candidate}
          open={detailDialog.open}
          opening={openings.find((o) => o.id === detailDialog.candidate!.job_opening_id)}
          onClose={() => setDetailDialog({ open: false })}
          onMove={(stage) => moveCandidate(detailDialog.candidate!, stage)}
          onEdit={() => { setCandidateDialog({ open: true, data: detailDialog.candidate }); setDetailDialog({ open: false }); }}
          onDelete={() => deleteCandidate(detailDialog.candidate!.id)}
          onUploadResume={(f) => uploadResume(detailDialog.candidate!.id, f)}
          onDownloadResume={(p) => downloadResume(p)}
          onRefresh={fetchData}
          userId={user?.id}
        />
      )}
    </div>
  );
};

/* ---------- Candidate Detail Drawer ---------- */
const CandidateDetail = ({
  candidate, open, opening, onClose, onMove, onEdit, onDelete, onUploadResume, onDownloadResume, onRefresh, userId,
}: {
  candidate: Candidate;
  open: boolean;
  opening?: JobOpening;
  onClose: () => void;
  onMove: (stage: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onUploadResume: (file: File) => void;
  onDownloadResume: (path: string) => void;
  onRefresh: () => void;
  userId?: string;
}) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newOutcome, setNewOutcome] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase.from("recruitment_activities").select("*")
      .eq("candidate_id", candidate.id).order("created_at", { ascending: false })
      .then(({ data }) => setActivities((data as any) ?? []));
  }, [open, candidate.id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { error } = await supabase.from("recruitment_activities").insert({
      candidate_id: candidate.id,
      stage: candidate.current_stage,
      activity_type: "note",
      outcome: newOutcome || null,
      feedback: newNote,
      created_by: userId,
    });
    if (error) return toast.error(error.message);
    setNewNote(""); setNewOutcome("");
    const { data } = await supabase.from("recruitment_activities").select("*")
      .eq("candidate_id", candidate.id).order("created_at", { ascending: false });
    setActivities((data as any) ?? []);
    toast.success("Note added");
  };

  const stageIdx = STAGES.findIndex((s) => s.id === candidate.current_stage);
  const nextStage = STAGES[stageIdx + 1];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>{candidate.full_name}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={onEdit}><Edit2 size={12} /></Button>
              <Button size="sm" variant="outline" onClick={onDelete}><Trash2 size={12} /></Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" />{candidate.phone}</div>
            {candidate.email && <div className="flex items-center gap-2"><Mail size={14} className="text-muted-foreground" />{candidate.email}</div>}
            {opening && <div className="col-span-2"><span className="text-muted-foreground">Opening:</span> <span className="font-medium">{opening.title}</span></div>}
            {candidate.current_company && <div><span className="text-muted-foreground">Company:</span> {candidate.current_company}</div>}
            {candidate.current_designation && <div><span className="text-muted-foreground">Role:</span> {candidate.current_designation}</div>}
            {candidate.experience_years != null && <div><span className="text-muted-foreground">Experience:</span> {candidate.experience_years} yrs</div>}
            {candidate.notice_period_days != null && <div><span className="text-muted-foreground">Notice:</span> {candidate.notice_period_days} days</div>}
            {candidate.current_ctc && <div><span className="text-muted-foreground">Current CTC:</span> ₹{candidate.current_ctc}</div>}
            {candidate.expected_ctc && <div><span className="text-muted-foreground">Expected CTC:</span> ₹{candidate.expected_ctc}</div>}
            {candidate.location && <div><span className="text-muted-foreground">Location:</span> {candidate.location}</div>}
            <div><span className="text-muted-foreground">Source:</span> <Badge variant="outline" className="ml-1">{SOURCES.find((s) => s.value === candidate.source)?.label}</Badge></div>
          </div>

          {candidate.skills && (
            <div className="text-sm"><span className="text-muted-foreground">Skills:</span> {candidate.skills}</div>
          )}
          {candidate.notes && (
            <div className="text-sm bg-muted/50 rounded p-2">{candidate.notes}</div>
          )}

          {/* Resume */}
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-muted-foreground" />
            {candidate.resume_url ? (
              <Button size="sm" variant="outline" onClick={() => onDownloadResume(candidate.resume_url!)}>View Resume</Button>
            ) : <span className="text-sm text-muted-foreground">No resume</span>}
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUploadResume(f); e.target.value = ""; } }} />
              <Button size="sm" variant="outline" asChild><span><Upload size={12} className="mr-1" />{candidate.resume_url ? "Replace" : "Upload"}</span></Button>
            </label>
          </div>

          {/* Workflow stages */}
          <div>
            <Label className="text-xs">Workflow Progress</Label>
            <div className="flex flex-wrap items-center gap-1 mt-2">
              {STAGES.map((s, i) => {
                const active = i === stageIdx;
                const done = i < stageIdx;
                return (
                  <button
                    key={s.id}
                    onClick={() => onMove(s.id)}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      active ? "bg-primary text-primary-foreground border-primary" :
                      done ? "bg-emerald-500/10 text-emerald-700 border-emerald-300" :
                      "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >{s.label}</button>
                );
              })}
            </div>
            {nextStage && (
              <Button size="sm" className="mt-2" onClick={() => onMove(nextStage.id)}>
                Move to {nextStage.label} <ArrowRight size={12} className="ml-1" />
              </Button>
            )}
          </div>

          {/* Activities */}
          <div>
            <Label className="text-xs">Add Note / Interview Feedback</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <Select value={newOutcome} onValueChange={setNewOutcome}>
                <SelectTrigger className="col-span-1"><SelectValue placeholder="Outcome" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
              <Input className="col-span-2" placeholder="Feedback / notes" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            </div>
            <Button size="sm" className="mt-2" onClick={addNote}>Add</Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Activity Timeline</Label>
            {activities.length === 0 && <p className="text-xs text-muted-foreground">No activities yet</p>}
            {activities.map((a) => (
              <div key={a.id} className="text-xs border-l-2 border-primary/30 pl-3 py-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">{STAGES.find((s) => s.id === a.stage)?.label || a.stage}</Badge>
                  {a.outcome && <Badge variant="secondary" className="text-[9px]">{a.outcome}</Badge>}
                  <span className="text-muted-foreground ml-auto">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.feedback && <p className="mt-1">{a.feedback}</p>}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Recruitment;
