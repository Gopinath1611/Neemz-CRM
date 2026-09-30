import { useState } from "react";
import { MessageSquare, Send, Users, TrendingUp, Eye, Plus, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

const campaignTemplates = [
  { name: "Invisalign Consultation", message: "🦷 Get a FREE Invisalign consultation at Dr Neemz Dentistry, Salem! Transform your smile without metal braces. Limited slots available this week. Book now: [link]" },
  { name: "Kids Dental Checkup", message: "👶 Is your child's dental health on track? FREE dental checkup for kids at Dr Neemz Dentistry, Salem. Gentle care in a fun environment! Call: [number]" },
  { name: "Teeth Whitening Offer", message: "✨ Brighten your smile! 30% OFF professional teeth whitening at Dr Neemz Dentistry, Salem. Offer valid this month only. Book: [link]" },
  { name: "Dental Camp", message: "🏕️ FREE Dental Camp at Dr Neemz Dentistry, Salem! Complete dental checkup + X-ray FREE. Date: [date]. Register now: [link]" },
  { name: "Scaling Reminder", message: "🔔 It's time for your dental cleaning! Regular scaling keeps your gums healthy. Book your appointment at Dr Neemz Dentistry: [link]" },
];

const segments = ["All Patients", "New Leads", "Inactive Patients", "Completed Treatment", "Kids Patients", "Invisalign Prospects"];

const WhatsAppCampaigns = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", message_template: "", campaign_type: "promotion", target_segment: "", total_recipients: "0" });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("whatsapp_campaigns").insert({
        name: data.name,
        message_template: data.message_template,
        campaign_type: data.campaign_type,
        target_segment: data.target_segment,
        total_recipients: parseInt(data.total_recipients) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      setDialogOpen(false);
      setForm({ name: "", message_template: "", campaign_type: "promotion", target_segment: "", total_recipients: "0" });
      toast({ title: "Campaign created" });
    },
  });

  const totalSent = campaigns.reduce((a: number, c: any) => a + (c.sent_count || 0), 0);
  const totalDelivered = campaigns.reduce((a: number, c: any) => a + (c.delivered_count || 0), 0);
  const totalRead = campaigns.reduce((a: number, c: any) => a + (c.read_count || 0), 0);
  const totalResponses = campaigns.reduce((a: number, c: any) => a + (c.response_count || 0), 0);

  const statusColors: Record<string, string> = { draft: "bg-muted text-muted-foreground", scheduled: "bg-info/10 text-info", sent: "bg-success/10 text-success", active: "bg-primary/10 text-primary" };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">WhatsApp Marketing <MessageSquare size={20} className="text-success" /></h1>
          <p className="text-sm text-muted-foreground mt-1">Broadcast campaigns & automated follow-ups</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0"><Plus size={16} className="mr-2" /> Create Campaign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Create WhatsApp Campaign</DialogTitle></DialogHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-1.5"><Label>Campaign Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Segment</Label>
                  <Select value={form.target_segment} onValueChange={v => setForm(f => ({ ...f, target_segment: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                    <SelectContent>{segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Recipients</Label><Input type="number" value={form.total_recipients} onChange={e => setForm(f => ({ ...f, total_recipients: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Quick Templates</Label>
                <div className="flex flex-wrap gap-1.5">
                  {campaignTemplates.map(t => (
                    <Badge key={t.name} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10"
                      onClick={() => setForm(f => ({ ...f, name: f.name || t.name, message_template: t.message }))}>
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5"><Label>Message</Label><Textarea rows={4} value={form.message_template} onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))} placeholder="Type message..." /></div>
              <Button className="w-full gradient-primary border-0" onClick={() => createCampaign.mutate(form)} disabled={!form.name || !form.message_template}>Create Campaign</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Messages Sent", value: totalSent, icon: Send, color: "text-primary" },
          { label: "Delivered", value: totalDelivered, icon: MessageSquare, color: "text-success" },
          { label: "Read", value: totalRead, icon: Eye, color: "text-info" },
          { label: "Responses", value: totalResponses, icon: TrendingUp, color: "text-accent" },
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
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Campaigns</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {campaigns.map((c: any) => (
              <div key={c.id} className="px-6 py-4 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{c.name}</p>
                  <Badge className={`text-xs ${statusColors[c.status] || ""}`}>{c.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.message_template}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{c.target_segment}</span>
                  <span>Recipients: {c.total_recipients}</span>
                  {c.sent_count > 0 && (
                    <div className="flex items-center gap-2 flex-1">
                      <Progress value={c.total_recipients > 0 ? (c.delivered_count / c.total_recipients) * 100 : 0} className="h-1.5 flex-1" />
                      <span>{c.delivered_count}/{c.total_recipients}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {campaigns.length === 0 && <div className="px-6 py-8 text-center text-muted-foreground text-sm">No campaigns yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppCampaigns;
