import { useState } from "react";
import { Mail, Send, Plus, Eye, FileText, Sparkles, Users, TrendingUp, Copy, Trash2 } from "lucide-react";
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

const emailTemplates = [
  { id: "1", name: "Welcome New Patient", subject: "Welcome to Dr Neemz Dentistry! 🦷", category: "marketing", status: "active", openRate: "42%", clickRate: "12%", body: "Hi {{name}}, Welcome to Dr Neemz Dentistry..." },
  { id: "2", name: "Appointment Reminder", subject: "Your appointment is tomorrow", category: "utility", status: "active", openRate: "68%", clickRate: "25%", body: "Dear {{name}}, this is a reminder..." },
  { id: "3", name: "Treatment Follow-up", subject: "How are you feeling after your visit?", category: "utility", status: "active", openRate: "55%", clickRate: "18%", body: "Hi {{name}}, We hope you're doing well..." },
  { id: "4", name: "Invisalign Offer", subject: "✨ Get 20% Off Invisalign This Month!", category: "marketing", status: "draft", openRate: "—", clickRate: "—", body: "Transform your smile with Invisalign..." },
  { id: "5", name: "Birthday Wishes", subject: "🎂 Happy Birthday, {{name}}!", category: "marketing", status: "active", openRate: "72%", clickRate: "8%", body: "Wishing you a wonderful birthday..." },
];

const campaigns = [
  { id: "1", name: "January Dental Camp Invite", template: "Welcome New Patient", segment: "All Patients", recipients: 450, sent: 448, opened: 188, clicked: 54, status: "sent", date: "2026-01-15" },
  { id: "2", name: "Invisalign Promo Feb", template: "Invisalign Offer", segment: "Invisalign Prospects", recipients: 120, sent: 0, opened: 0, clicked: 0, status: "draft", date: "2026-02-01" },
  { id: "3", name: "Weekly Follow-up Batch", template: "Treatment Follow-up", segment: "Completed Treatment", recipients: 85, sent: 85, opened: 47, clicked: 15, status: "sent", date: "2026-03-05" },
];

const segments = ["All Patients", "New Leads", "Inactive Patients", "Completed Treatment", "Kids Patients", "Invisalign Prospects", "High-Value Leads"];

const EmailCampaigns = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", subject: "", category: "marketing", body: "" });
  const [campaignForm, setCampaignForm] = useState({ name: "", template: "", segment: "", scheduledDate: "" });

  const totalSent = campaigns.reduce((a, c) => a + c.sent, 0);
  const totalOpened = campaigns.reduce((a, c) => a + c.opened, 0);
  const totalClicked = campaigns.reduce((a, c) => a + c.clicked, 0);
  const avgOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0";

  const statusColors: Record<string, string> = {
    sent: "bg-green-500/10 text-green-600 border-green-200",
    draft: "bg-muted text-muted-foreground border-border",
    scheduled: "bg-blue-500/10 text-blue-600 border-blue-200",
    active: "bg-green-500/10 text-green-600 border-green-200",
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Mail className="text-primary" size={22} />
            Email Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create campaigns, manage templates & track performance</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Emails Sent", value: totalSent, icon: Send, color: "text-primary" },
          { label: "Opened", value: totalOpened, icon: Eye, color: "text-green-600" },
          { label: "Clicked", value: totalClicked, icon: TrendingUp, color: "text-blue-600" },
          { label: "Avg Open Rate", value: `${avgOpenRate}%`, icon: Mail, color: "text-orange-500" },
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="automations">Auto Sequences</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {activeTab === "templates" && (
              <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Plus size={14} /> New Template</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle className="font-display">Create Email Template</DialogTitle></DialogHeader>
                  <div className="space-y-3 py-3">
                    <div className="space-y-1.5"><Label>Template Name</Label><Input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Welcome Email" /></div>
                    <div className="space-y-1.5"><Label>Subject Line</Label><Input value={templateForm.subject} onChange={e => setTemplateForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Welcome to Dr Neemz!" /></div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={templateForm.category} onValueChange={v => setTemplateForm(f => ({ ...f, category: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="marketing">Marketing</SelectItem>
                          <SelectItem value="utility">Utility / Transactional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email Body</Label>
                      <Textarea rows={6} value={templateForm.body} onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))} placeholder="Use {{name}}, {{date}} as variables..." />
                      <p className="text-[10px] text-muted-foreground">Variables: {"{{name}}, {{phone}}, {{date}}, {{treatment}}"}</p>
                    </div>
                    <Button className="w-full" onClick={() => { setTemplateDialogOpen(false); toast({ title: "Template saved" }); }}>Save Template</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {activeTab === "campaigns" && (
              <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Plus size={14} /> New Campaign</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle className="font-display">Create Email Campaign</DialogTitle></DialogHeader>
                  <div className="space-y-3 py-3">
                    <div className="space-y-1.5"><Label>Campaign Name</Label><Input value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="space-y-1.5">
                      <Label>Template</Label>
                      <Select value={campaignForm.template} onValueChange={v => setCampaignForm(f => ({ ...f, template: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                        <SelectContent>{emailTemplates.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Audience Segment</Label>
                      <Select value={campaignForm.segment} onValueChange={v => setCampaignForm(f => ({ ...f, segment: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                        <SelectContent>{segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Schedule Date (optional)</Label><Input type="date" value={campaignForm.scheduledDate} onChange={e => setCampaignForm(f => ({ ...f, scheduledDate: e.target.value }))} /></div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => { setCampaignDialogOpen(false); toast({ title: "Saved as draft" }); }}>Save Draft</Button>
                      <Button className="flex-1" onClick={() => { setCampaignDialogOpen(false); toast({ title: "Campaign scheduled" }); }}>Send / Schedule</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Campaigns Tab */}
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
                      <span className="flex items-center gap-1"><Users size={12} /> {c.recipients} recipients</span>
                      <span className="flex items-center gap-1"><Send size={12} /> {c.sent} sent</span>
                      <span className="flex items-center gap-1"><Eye size={12} /> {c.opened} opened</span>
                      <span className="flex items-center gap-1"><TrendingUp size={12} /> {c.clicked} clicked</span>
                      {c.sent > 0 && <span className="text-green-600 font-medium">{((c.opened / c.sent) * 100).toFixed(0)}% open rate</span>}
                    </div>
                  </div>
                ))}
                {campaigns.length === 0 && <div className="px-6 py-8 text-center text-muted-foreground text-sm">No campaigns yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {emailTemplates.map((t) => (
              <Card key={t.id} className="shadow-card hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{t.name}</CardTitle>
                    <Badge variant="outline" className={statusColors[t.status]}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.subject}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground line-clamp-3">{t.body}</div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                    <span>Open: {t.openRate} · Click: {t.clickRate}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs gap-1"><Eye size={12} /> Preview</Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs gap-1"><Copy size={12} /> Duplicate</Button>
                    <Button variant="ghost" size="sm" className="text-destructive"><Trash2 size={12} /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Auto Sequences Tab */}
        <TabsContent value="automations">
          <div className="space-y-4">
            {[
              { name: "Welcome Sequence", trigger: "New patient signup", steps: 3, active: true, desc: "Send welcome → Day 3: Treatment info → Day 7: Review request" },
              { name: "Appointment Reminder", trigger: "1 day before appointment", steps: 2, active: true, desc: "Email reminder → 2hrs before: Final reminder" },
              { name: "Post-Treatment Follow-up", trigger: "After checkout", steps: 3, active: false, desc: "Thank you → Day 3: Recovery tips → Day 14: Review request" },
              { name: "Inactive Patient Re-engagement", trigger: "No visit for 90 days", steps: 2, active: false, desc: "We miss you → Day 7: Special offer" },
            ].map((seq) => (
              <Card key={seq.name} className="shadow-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">{seq.name}</p>
                      <Badge variant="outline" className={seq.active ? statusColors.active : statusColors.draft}>{seq.active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">Trigger: {seq.trigger} · {seq.steps} steps</p>
                    <p className="text-xs text-muted-foreground">{seq.desc}</p>
                  </div>
                  <Switch checked={seq.active} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmailCampaigns;
