import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone, Users, Mail, MessageCircle, Calendar, Building2, MapPin, User,
  Plus, Trash2, Clock, ArrowRight, History, PhoneCall
} from "lucide-react";

interface Institution {
  id: string; name: string; category: string; address: string; area: string;
  contact_person_name: string; contact_person_role: string; phone: string; email: string;
  decision_maker_level: string; last_visit_date: string | null; next_followup_date: string | null;
  status: string; notes: string; assigned_coordinator: string; created_at: string;
}

interface Interaction {
  id: string;
  institution_id: string;
  interaction_type: string;
  interaction_date: string;
  contact_person: string | null;
  summary: string;
  outcome: string | null;
  next_action: string | null;
  next_action_date: string | null;
  duration_minutes: number | null;
  logged_by: string | null;
  created_at: string;
}

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  call: { icon: Phone, color: "bg-blue-100 text-blue-700 border-blue-200", label: "Phone Call" },
  visit: { icon: MapPin, color: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Site Visit" },
  meeting: { icon: Users, color: "bg-purple-100 text-purple-700 border-purple-200", label: "Meeting" },
  email: { icon: Mail, color: "bg-amber-100 text-amber-700 border-amber-200", label: "Email" },
  whatsapp: { icon: MessageCircle, color: "bg-green-100 text-green-700 border-green-200", label: "WhatsApp" },
  follow_up: { icon: PhoneCall, color: "bg-cyan-100 text-cyan-700 border-cyan-200", label: "Follow-up" },
  other: { icon: Clock, color: "bg-gray-100 text-gray-700 border-gray-200", label: "Other" },
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  institution: Institution | null;
  onUpdated?: () => void;
}

const InstitutionDetailDialog = ({ open, onOpenChange, institution, onUpdated }: Props) => {
  const { toast } = useToast();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Interaction>>({
    interaction_type: "call",
    interaction_date: format(new Date(), "yyyy-MM-dd"),
  });

  const fetchInteractions = async () => {
    if (!institution) return;
    setLoading(true);
    const { data } = await supabase
      .from("institution_interactions" as any)
      .select("*")
      .eq("institution_id", institution.id)
      .order("interaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    setInteractions((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open && institution) {
      fetchInteractions();
      setShowForm(false);
      setForm({
        interaction_type: "call",
        interaction_date: format(new Date(), "yyyy-MM-dd"),
        contact_person: institution.contact_person_name || "",
      });
    }
  }, [open, institution]);

  const saveInteraction = async () => {
    if (!institution) return;
    if (!form.summary?.trim()) {
      toast({ title: "Summary required", variant: "destructive" });
      return;
    }
    const payload = { ...form, institution_id: institution.id };
    const { error } = await supabase.from("institution_interactions" as any).insert(payload as any);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }

    // Update institution's last_visit_date / next_followup_date
    const updates: any = {};
    if (["visit", "meeting"].includes(form.interaction_type || "")) {
      updates.last_visit_date = form.interaction_date;
      if (institution.status === "not_contacted") updates.status = "contacted";
    }
    if (form.next_action_date) updates.next_followup_date = form.next_action_date;
    if (Object.keys(updates).length > 0) {
      await supabase.from("institutions").update(updates).eq("id", institution.id);
    }

    toast({ title: "Interaction logged" });
    setForm({
      interaction_type: "call",
      interaction_date: format(new Date(), "yyyy-MM-dd"),
      contact_person: institution.contact_person_name || "",
    });
    setShowForm(false);
    fetchInteractions();
    onUpdated?.();
  };

  const deleteInteraction = async (id: string) => {
    await supabase.from("institution_interactions" as any).delete().eq("id", id);
    toast({ title: "Interaction deleted" });
    fetchInteractions();
  };

  if (!institution) return null;

  const stats = {
    total: interactions.length,
    visits: interactions.filter(i => i.interaction_type === "visit").length,
    calls: interactions.filter(i => i.interaction_type === "call").length,
    meetings: interactions.filter(i => i.interaction_type === "meeting").length,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {institution.name}
            <Badge variant="outline" className="capitalize ml-2">{institution.category}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Institution Info */}
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {institution.contact_person_name && (
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>{institution.contact_person_name} <span className="text-xs text-muted-foreground">({institution.contact_person_role})</span></span></div>
            )}
            {institution.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{institution.phone}</div>}
            {institution.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{institution.email}</div>}
            {institution.area && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{institution.area}</div>}
            {institution.last_visit_date && <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />Last visit: {institution.last_visit_date}</div>}
            {institution.next_followup_date && <div className="flex items-center gap-2 text-amber-700"><Clock className="h-4 w-4" />Next follow-up: {institution.next_followup_date}</div>}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total", value: stats.total, icon: History },
            { label: "Calls", value: stats.calls, icon: Phone },
            { label: "Visits", value: stats.visits, icon: MapPin },
            { label: "Meetings", value: stats.meetings, icon: Users },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <s.icon className="h-4 w-4 mx-auto mb-1 text-primary" />
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Log Interaction */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><History className="h-4 w-4" /> Interaction History</h3>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "Log Interaction"}
          </Button>
        </div>

        {showForm && (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.interaction_type} onValueChange={v => setForm({ ...form, interaction_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={form.interaction_date || ""} onChange={e => setForm({ ...form, interaction_date: e.target.value })} />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={form.contact_person || ""} onChange={e => setForm({ ...form, contact_person: e.target.value })} placeholder="Who you spoke with" />
                </div>
              </div>
              <div>
                <Label>Summary <span className="text-destructive">*</span></Label>
                <Textarea value={form.summary || ""} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="What was discussed?" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Outcome</Label>
                  <Input value={form.outcome || ""} onChange={e => setForm({ ...form, outcome: e.target.value })} placeholder="e.g. Approved, Pending, Declined" />
                </div>
                <div>
                  <Label>Duration (min)</Label>
                  <Input type="number" value={form.duration_minutes || ""} onChange={e => setForm({ ...form, duration_minutes: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Next Action</Label>
                  <Input value={form.next_action || ""} onChange={e => setForm({ ...form, next_action: e.target.value })} placeholder="e.g. Send proposal" />
                </div>
                <div>
                  <Label>Next Action Date</Label>
                  <Input type="date" value={form.next_action_date || ""} onChange={e => setForm({ ...form, next_action_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Logged By</Label>
                <Input value={form.logged_by || ""} onChange={e => setForm({ ...form, logged_by: e.target.value })} placeholder="Your name" />
              </div>
              <Button className="w-full" onClick={saveInteraction}>Save Interaction</Button>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : interactions.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
            No interactions logged yet. Click "Log Interaction" to add the first one.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {interactions.map(it => {
              const meta = TYPE_META[it.interaction_type] || TYPE_META.other;
              const Icon = meta.icon;
              return (
                <Card key={it.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-full p-2 ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{it.interaction_date}</span>
                          {it.contact_person && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{it.contact_person}</span>}
                          {it.duration_minutes && <span className="text-xs text-muted-foreground">{it.duration_minutes} min</span>}
                          {it.logged_by && <span className="text-xs text-muted-foreground">by {it.logged_by}</span>}
                        </div>
                        <p className="text-sm mt-1.5">{it.summary}</p>
                        {it.outcome && (
                          <div className="text-xs mt-1"><span className="text-muted-foreground">Outcome:</span> <strong>{it.outcome}</strong></div>
                        )}
                        {it.next_action && (
                          <div className="text-xs mt-1 flex items-center gap-1 text-amber-700">
                            <ArrowRight className="h-3 w-3" /> {it.next_action}
                            {it.next_action_date && <span className="ml-1">— {it.next_action_date}</span>}
                          </div>
                        )}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteInteraction(it.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InstitutionDetailDialog;
