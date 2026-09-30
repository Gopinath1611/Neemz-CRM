import { useState } from "react";
import { Phone, Send, Plus, Users, TrendingUp, MessageSquare, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const smsTemplates = [
  { id: "1", name: "Appointment Confirmation", body: "Dear {{name}}, your appointment at Dr Neemz Dentistry is confirmed for {{date}} at {{time}}. Reply C to confirm.", category: "transactional", charCount: 128 },
  { id: "2", name: "Payment Reminder", body: "Hi {{name}}, a payment of ₹{{amount}} is pending for your treatment at Dr Neemz Dentistry. Pay now: {{link}}", category: "transactional", charCount: 115 },
  { id: "3", name: "Dental Camp Invite", body: "🦷 FREE Dental Camp at Dr Neemz Dentistry, Salem! {{date}}. Checkup + X-ray FREE. Register: {{link}}", category: "promotional", charCount: 98 },
  { id: "4", name: "Offer Blast", body: "✨ {{offer_text}} at Dr Neemz Dentistry! Limited time. Book now: {{link}} Reply STOP to opt out.", category: "promotional", charCount: 95 },
  { id: "5", name: "Recall Reminder", body: "Hi {{name}}, it's been {{months}} months since your last visit. Book a checkup at Dr Neemz: {{link}}", category: "transactional", charCount: 102 },
];

const campaigns = [
  { id: "1", name: "March Dental Camp", template: "Dental Camp Invite", segment: "All Patients", recipients: 850, sent: 848, delivered: 820, responses: 45, status: "sent", date: "2026-03-01" },
  { id: "2", name: "Payment Follow-up Batch", template: "Payment Reminder", segment: "Pending Payments", recipients: 65, sent: 65, delivered: 62, responses: 28, status: "sent", date: "2026-03-05" },
  { id: "3", name: "Scaling Offer", template: "Offer Blast", segment: "Inactive Patients", recipients: 200, sent: 0, delivered: 0, responses: 0, status: "scheduled", date: "2026-03-15" },
];

const segments = ["All Patients", "All Leads", "New Leads", "Inactive Patients", "Pending Payments", "Kids Patients", "Custom List"];

const SMSCampaigns = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", template: "", segment: "", scheduledDate: "", customMessage: "" });

  const totalSent = campaigns.reduce((a, c) => a + c.sent, 0);
  const totalDelivered = campaigns.reduce((a, c) => a + c.delivered, 0);
  const totalResponses = campaigns.reduce((a, c) => a + c.responses, 0);
  const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : "0";

  const statusColors: Record<string, string> = {
    sent: "bg-green-500/10 text-green-600 border-green-200",
    scheduled: "bg-blue-500/10 text-blue-600 border-blue-200",
    draft: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Phone className="text-orange-500" size={22} />
            SMS Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Bulk & transactional SMS to your contacts</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "SMS Sent", value: totalSent, icon: Send, color: "text-primary" },
          { label: "Delivered", value: totalDelivered, icon: MessageSquare, color: "text-green-600" },
          { label: "Responses", value: totalResponses, icon: TrendingUp, color: "text-blue-600" },
          { label: "Delivery Rate", value: `${deliveryRate}%`, icon: Clock, color: "text-orange-500" },
        ].map((s) => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <s.icon size={16} className={`${s.color} mb-2`} />
              <p className="text-2xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="auto">Auto SMS</TabsTrigger>
          </TabsList>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus size={14} /> New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Create SMS Campaign</DialogTitle></DialogHeader>
              <div className="space-y-3 py-3">
                <div className="space-y-1.5"><Label>Campaign Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={form.template} onValueChange={v => setForm(f => ({ ...f, template: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>{smsTemplates.map(t => <SelectItem key={t.id} value={t.name}>{t.name} ({t.charCount} chars)</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Or Custom Message</Label>
                  <Textarea rows={3} value={form.customMessage} onChange={e => setForm(f => ({ ...f, customMessage: e.target.value }))} placeholder="Type SMS message..." />
                  <p className="text-[10px] text-muted-foreground">{form.customMessage.length}/160 chars · {Math.ceil(form.customMessage.length / 160) || 1} SMS credits</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Segment</Label>
                    <Select value={form.segment} onValueChange={v => setForm(f => ({ ...f, segment: v }))}>
                      <SelectTrigger><SelectValue placeholder="Audience" /></SelectTrigger>
                      <SelectContent>{segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Schedule</Label><Input type="datetime-local" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} /></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setDialogOpen(false); toast({ title: "Saved as draft" }); }}>Save Draft</Button>
                  <Button className="flex-1" onClick={() => { setDialogOpen(false); toast({ title: "Campaign sent!" }); }}>Send Now</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="campaigns">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {campaigns.map((c) => (
                  <div key={c.id} className="px-6 py-4 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.template} · {c.segment} · {c.date}</p>
                      </div>
                      <Badge variant="outline" className={statusColors[c.status]}>{c.status}</Badge>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-muted-foreground">
                      <span><Users size={12} className="inline mr-1" />{c.recipients}</span>
                      <span><Send size={12} className="inline mr-1" />{c.sent} sent</span>
                      <span>✓ {c.delivered} delivered</span>
                      <span>↩ {c.responses} responses</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {smsTemplates.map((t) => (
              <Card key={t.id} className="shadow-card">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t.name}</p>
                    <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground">{t.body}</div>
                  <p className="text-[10px] text-muted-foreground">{t.charCount} characters</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="auto">
          <div className="space-y-4">
            {[
              { name: "Appointment Confirmation", trigger: "When appointment booked", active: true },
              { name: "Payment Due Reminder", trigger: "Payment pending > 3 days", active: true },
              { name: "Post-Visit Thank You", trigger: "After checkout", active: false },
              { name: "Recall Reminder", trigger: "No visit for 6 months", active: false },
            ].map((auto) => (
              <Card key={auto.name} className="shadow-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{auto.name}</p>
                    <p className="text-xs text-muted-foreground">Trigger: {auto.trigger}</p>
                  </div>
                  <Badge variant="outline" className={auto.active ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}>{auto.active ? "Active" : "Inactive"}</Badge>
                  <Switch checked={auto.active} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SMSCampaigns;
