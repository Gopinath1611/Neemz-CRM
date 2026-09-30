import { useState, useMemo } from "react";
import { Plus, Search, Filter, Phone, MessageSquare, Sparkles, ArrowUpDown, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

const sources = ["Instagram", "Facebook Ads", "Google Ads", "Website", "Dental Camp", "WhatsApp", "Walk-in", "Referral"];
const defaultTreatments = ["Cleaning", "Root Canal", "Implant", "Invisalign", "Braces", "Kids Dentistry", "Teeth Whitening", "Wisdom Tooth"];
const statuses = ["new_lead", "contacted", "consultation_booked", "treatment_started", "treatment_completed", "lost"];

const treatmentValues: Record<string, number> = {
  "Cleaning": 3000, "Root Canal": 12000, "Implant": 85000, "Invisalign": 150000,
  "Braces": 45000, "Kids Dentistry": 5000, "Teeth Whitening": 8000, "Wisdom Tooth": 5000,
};

const statusLabels: Record<string, string> = {
  new_lead: "New Lead", contacted: "Contacted", consultation_booked: "Consultation Booked",
  treatment_started: "Treatment Started", treatment_completed: "Completed", lost: "Lost",
};

const statusColors: Record<string, string> = {
  new_lead: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-info/10 text-info border-info/20",
  consultation_booked: "bg-warning/10 text-warning border-warning/20",
  treatment_started: "bg-accent/10 text-accent border-accent/20",
  treatment_completed: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

const calculateLeadScore = (treatment: string, source: string): number => {
  const base = treatmentValues[treatment] || 5000;
  const sourceMultiplier: Record<string, number> = {
    "Google Ads": 1.3, "Instagram": 1.2, "Facebook Ads": 1.1, "Referral": 1.4,
    "Website": 1.0, "WhatsApp": 0.9, "Walk-in": 0.8, "Dental Camp": 0.7,
  };
  return Math.round((base / 1000) * (sourceMultiplier[source] || 1));
};

const getAIPriority = (score: number): string => {
  if (score >= 100) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
};

const priorityColors: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-warning/10 text-warning",
  medium: "bg-info/10 text-info",
  low: "bg-muted text-muted-foreground",
};

const Leads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { treatmentNames } = useClinicMasters();
  const treatments = useMemo(() => {
    const masterSet = new Set(treatmentNames);
    defaultTreatments.forEach(t => masterSet.add(t));
    return [...masterSet];
  }, [treatmentNames]);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", age: "", email: "", dental_problem: "", treatment_interest: "", source: "", notes: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("lead_score", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addLead = useMutation({
    mutationFn: async (leadData: typeof form) => {
      const score = calculateLeadScore(leadData.treatment_interest, leadData.source);
      const priority = getAIPriority(score);
      const { error } = await supabase.from("leads").insert({
        name: leadData.name,
        phone: leadData.phone,
        age: leadData.age ? parseInt(leadData.age) : null,
        email: leadData.email || null,
        dental_problem: leadData.dental_problem || null,
        treatment_interest: leadData.treatment_interest,
        source: leadData.source,
        lead_score: score,
        estimated_value: treatmentValues[leadData.treatment_interest] || 0,
        ai_priority: priority,
        notes: leadData.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setDialogOpen(false);
      setForm({ name: "", phone: "", age: "", email: "", dental_problem: "", treatment_interest: "", source: "", notes: "" });
      toast({ title: "Lead added", description: "AI has scored and prioritized this lead." });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const filtered = leads.filter((lead: any) => {
    const matchesSearch = lead.name?.toLowerCase().includes(search.toLowerCase()) || lead.phone?.includes(search);
    const matchesSource = filterSource === "all" || lead.source === filterSource;
    const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
    return matchesSearch && matchesSource && matchesStatus;
  });

  const pagedLeads = usePagedSlice(filtered, page, pageSize);

  const highPriorityCount = leads.filter((l: any) => l.ai_priority === "critical" || l.ai_priority === "high").length;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            AI Lead Engine <Brain size={20} className="text-accent" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} total leads · {highPriorityCount} high priority
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus size={16} className="mr-2" /> Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Add New Lead</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input placeholder="Patient name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone *</Label>
                  <Input placeholder="+91 XXXXX XXXXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input type="number" placeholder="Age" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input placeholder="email@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Source *</Label>
                  <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Treatment Interest *</Label>
                  <Select value={form.treatment_interest} onValueChange={v => setForm(f => ({ ...f, treatment_interest: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select treatment" /></SelectTrigger>
                    <SelectContent>
                      {treatments.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dental Problem</Label>
                <Input placeholder="Describe dental problem" value={form.dental_problem} onChange={e => setForm(f => ({ ...f, dental_problem: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {form.treatment_interest && form.source && (
                <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles size={14} className="text-accent" />
                    <span className="font-medium">AI Score: {calculateLeadScore(form.treatment_interest, form.source)}</span>
                    <Badge className={`ml-2 text-xs ${priorityColors[getAIPriority(calculateLeadScore(form.treatment_interest, form.source))]}`}>
                      {getAIPriority(calculateLeadScore(form.treatment_interest, form.source))} priority
                    </Badge>
                    <span className="ml-auto text-muted-foreground">Est. ₹{(treatmentValues[form.treatment_interest] || 0).toLocaleString()}</span>
                  </div>
                </div>
              )}
              <Button className="gradient-primary border-0" onClick={() => addLead.mutate(form)} disabled={!form.name || !form.phone || !form.source || !form.treatment_interest || addLead.isPending}>
                Save Lead
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[160px]"><Filter size={14} className="mr-2 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Treatment</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="flex items-center gap-1">AI Score <Sparkles size={10} className="text-accent" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedLeads.map((lead: any) => (
                  <tr key={lead.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                          {lead.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{lead.source}</td>
                    <td className="px-4 py-3 text-sm">{lead.treatment_interest}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${priorityColors[lead.ai_priority || "medium"]}`}>
                        {lead.lead_score} · {lead.ai_priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={lead.status} onValueChange={v => updateStatus.mutate({ id: lead.id, status: v })}>
                        <SelectTrigger className={`h-7 text-xs w-[150px] border ${statusColors[lead.status] || ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-success">₹{(lead.estimated_value || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"><Phone size={14} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-success"><MessageSquare size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No leads found. Add your first lead to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="leads" />
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;
