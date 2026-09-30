import { useState, useMemo } from "react";
import { Search, Plus, Phone, MessageSquare, ExternalLink, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { displayPhone } from "@/lib/utils";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { allStages } from "@/components/pipeline/OpportunityDetail";
import { stashCustomAudience } from "@/lib/whatsappAudience";

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

const stageLabel = (status: string) => allStages.find(s => s.value === status)?.label || "";
const initialsOf = (name: string) =>
  (name || "?").trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase() || "").join("") || "?";
const digitsOnly = (p?: string | null) => (p || "").replace(/\D/g, "");

const PAGE_SIZE = 25;

const Contacts = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { treatmentNames } = useClinicMasters();

  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterTreatment, setFilterTreatment] = useState("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", email: "", city: "", treatment_interest: "", source: "" });

  const allTreatments = useMemo(() => {
    const set = new Set(treatmentNames);
    defaultTreatments.forEach(t => set.add(t));
    return [...set];
  }, [treatmentNames]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["contacts-leads"],
    queryFn: async () => {
      const { data: wfs } = await supabase
        .from("workflows")
        .select("meta_form_id")
        .not("meta_form_id", "is", null);
      const formIds = Array.from(
        new Set((wfs || []).map((w: any) => w.meta_form_id).filter(Boolean))
      ) as string[];

      const CUTOFF_ISO = "2026-07-29T18:30:00.000Z";
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
        if (formIds.length > 0) {
          q = q.or(`meta_form_id.in.(${formIds.join(",")}),meta_form_id.is.null`);
        }
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < CHUNK) break;
        from += CHUNK;
      }
      return all.filter((l: any) => (l.meta_form_id ? formIds.includes(l.meta_form_id) : true));
    },
    refetchInterval: 30000,
  });

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l: any) => { const s = (l.source || "").trim(); if (s) set.add(s); });
    return [...set].sort();
  }, [leads]);

  const treatmentOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l: any) => { const t = (l.treatment_interest || "").trim(); if (t) set.add(t); });
    return [...set].sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digitsOnly(search);
    return leads.filter((l: any) => {
      const matchesSearch =
        !q ||
        (l.name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (qDigits.length > 0 && digitsOnly(l.phone).includes(qDigits));
      const matchesSource = filterSource === "all" || (l.source || "").trim() === filterSource;
      const matchesTreatment = filterTreatment === "all" || (l.treatment_interest || "").trim() === filterTreatment;
      return matchesSearch && matchesSource && matchesTreatment;
    });
  }, [leads, search, filterSource, filterTreatment]);

  const filtersActive = search.trim() !== "" || filterSource !== "all" || filterTreatment !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const clearFilters = () => {
    setSearch(""); setFilterSource("all"); setFilterTreatment("all"); setPage(1);
  };

  // Hand the currently filtered contacts over to the WhatsApp campaign modal.
  const sendToCampaign = () => {
    const contacts = filtered
      .map((l: any) => ({ name: l.name || "", phone: l.phone || "" }))
      .filter((c) => c.phone);
    if (contacts.length === 0) {
      toast({ title: "No contacts with a phone number", variant: "destructive" });
      return;
    }
    stashCustomAudience({
      label: `Contacts (${contacts.length.toLocaleString()} selected)`,
      origin: "lead",
      contacts,
    });
    navigate("/automation-whatsapp");
  };

  const addContact = useMutation({
    mutationFn: async (f: typeof addForm) => {
      const score = calcScore(f.treatment_interest, f.source);
      const { error } = await supabase.from("leads").insert({
        name: f.name, phone: f.phone,
        email: f.email || null, city: f.city || null,
        treatment_interest: f.treatment_interest, source: f.source,
        lead_score: score, estimated_value: treatmentValues[f.treatment_interest] || 0,
        ai_priority: calcPriority(score),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts-leads"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      setAddOpen(false);
      setAddForm({ name: "", phone: "", email: "", city: "", treatment_interest: "", source: "" });
      toast({ title: "Contact added" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${filtered.length.toLocaleString()} contact${filtered.length === 1 ? "" : "s"}`}
            {!isLoading && filtersActive && ` of ${leads.length.toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={sendToCampaign} disabled={filtered.length === 0}>
            <MessageSquare size={16} className="mr-2 text-success" /> Send to WhatsApp Campaign
          </Button>
          <Button className="gradient-primary border-0" onClick={() => setAddOpen(true)}>
            <Plus size={16} className="mr-2" /> Add Contact
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-sm sm:flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={filterSource} onValueChange={v => { setFilterSource(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[170px] bg-card"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sourceOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTreatment} onValueChange={v => { setFilterTreatment(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[190px] bg-card"><SelectValue placeholder="Treatment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Treatments</SelectItem>
            {treatmentOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X size={14} className="mr-1" /> Clear filters
          </Button>
        )}
      </div>

      <Card className="shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Treatment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full max-w-[140px]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center">
                    {leads.length === 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">No contacts yet</p>
                        <Button size="sm" className="gradient-primary border-0" onClick={() => setAddOpen(true)}>
                          <Plus size={14} className="mr-1" /> Add Contact
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">No contacts match your search</p>
                        <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((lead: any) => {
                  const digits = digitsOnly(lead.phone);
                  const wa = digits.length > 10 ? digits : `91${digits}`;
                  return (
                    <TableRow key={lead.id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                            {initialsOf(lead.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{lead.name || "—"}</p>
                            {stageLabel(lead.status) && (
                              <p className="text-[10px] text-muted-foreground">{stageLabel(lead.status)}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm tabular-nums">{displayPhone(lead.phone)}</span>
                          {digits.length >= 10 && (
                            <>
                              <Button asChild variant="ghost" size="icon" className="h-6 w-6" title="Call">
                                <a href={`tel:+${wa}`}><Phone size={12} /></a>
                              </Button>
                              <Button asChild variant="ghost" size="icon" className="h-6 w-6" title="WhatsApp">
                                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                                  <MessageSquare size={12} className="text-success" />
                                </a>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.email || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.city || "—"}</TableCell>
                      <TableCell>
                        {lead.source ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${sourceColors[lead.source] || "bg-muted-foreground"}`} />
                            <span className="text-sm">{lead.source}</span>
                          </div>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {lead.treatment_interest ? (
                          <Badge variant="outline" className="text-xs font-normal">{lead.treatment_interest}</Badge>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => navigate(`/pipeline?lead=${lead.id}`)}
                        >
                          View in Pipeline <ExternalLink size={12} className="ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} contacts
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Source *</Label>
                <Select value={addForm.source} onValueChange={v => setAddForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Treatment *</Label>
                <Select value={addForm.treatment_interest} onValueChange={v => setAddForm(f => ({ ...f, treatment_interest: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select treatment" /></SelectTrigger>
                  <SelectContent>
                    {allTreatments.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="gradient-primary border-0 w-full"
              disabled={!addForm.name || !addForm.phone || !addForm.source || !addForm.treatment_interest || addContact.isPending}
              onClick={() => addContact.mutate(addForm)}
            >
              {addContact.isPending ? "Saving…" : "Add Contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contacts;
