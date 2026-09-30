import { useState } from "react";
import { Clock, Bell, Send, Plus, Calendar, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const recallTypes = [
  "Scaling (6 months)", "Invisalign Aligner Change", "Implant Checkup", "Root Canal Follow-up",
  "Braces Adjustment", "General Checkup", "Kids Dental Review", "Post-Surgery Follow-up",
];

const PatientRecalls = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ patient_name: "", phone: "", recall_type: "", recall_date: "", last_visit_date: "" });

  const { data: recalls = [] } = useQuery({
    queryKey: ["patient-recalls"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patient_recalls").select("*").order("recall_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addRecall = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("patient_recalls").insert({
        patient_name: data.patient_name,
        phone: data.phone,
        recall_type: data.recall_type,
        recall_date: data.recall_date,
        last_visit_date: data.last_visit_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-recalls"] });
      setDialogOpen(false);
      setForm({ patient_name: "", phone: "", recall_type: "", recall_date: "", last_visit_date: "" });
      toast({ title: "Recall scheduled" });
    },
  });

  const markSent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patient_recalls").update({ reminder_sent: true, reminder_sent_at: new Date().toISOString(), status: "sent" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-recalls"] });
      toast({ title: "Reminder sent via WhatsApp" });
    },
  });

  const markCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patient_recalls").update({ status: "completed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patient-recalls"] }),
  });

  const pending = recalls.filter((r: any) => r.status === "pending").length;
  const overdue = recalls.filter((r: any) => r.status === "pending" && new Date(r.recall_date) < new Date()).length;

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning", sent: "bg-info/10 text-info",
    completed: "bg-success/10 text-success", missed: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">Patient Recalls <Clock size={20} className="text-warning" /></h1>
          <p className="text-sm text-muted-foreground mt-1">Automated follow-up reminders</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0"><Plus size={16} className="mr-2" /> Schedule Recall</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Schedule Patient Recall</DialogTitle></DialogHeader>
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Patient Name</Label><Input value={form.patient_name} onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Recall Type</Label>
                <Select value={form.recall_type} onValueChange={v => setForm(f => ({ ...f, recall_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{recallTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Recall Date</Label><Input type="date" value={form.recall_date} onChange={e => setForm(f => ({ ...f, recall_date: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Last Visit Date</Label><Input type="date" value={form.last_visit_date} onChange={e => setForm(f => ({ ...f, last_visit_date: e.target.value }))} /></div>
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => addRecall.mutate(form)} disabled={!form.patient_name || !form.recall_type || !form.recall_date}>
                Schedule Recall
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pending Recalls", value: pending, icon: Bell, color: "text-warning" },
          { label: "Overdue", value: overdue, icon: Clock, color: "text-destructive" },
          { label: "Total Scheduled", value: recalls.length, icon: Calendar, color: "text-primary" },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <s.icon size={16} className={`${s.color} mb-2`} />
              <p className="text-2xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Recall Schedule</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {recalls.map((r: any) => (
              <div key={r.id} className="flex items-center gap-4 px-6 py-3 hover:bg-secondary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.patient_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{r.recall_type}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{r.phone}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{r.recall_date}</span>
                <Badge className={`text-xs ${statusColors[r.status] || ""}`}>{r.status}</Badge>
                {r.status === "pending" && (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => markSent.mutate(r.id)}>
                      <Send size={10} className="mr-1" /> Send
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => markCompleted.mutate(r.id)}>
                      <CheckCircle size={10} className="mr-1" /> Done
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {recalls.length === 0 && <div className="px-6 py-8 text-center text-muted-foreground text-sm">No recalls scheduled.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientRecalls;
