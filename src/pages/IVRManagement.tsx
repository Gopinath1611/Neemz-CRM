import { useState } from "react";
import { PhoneCall, Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Users, Clock, IndianRupee, Plus, Settings, TrendingUp, BarChart3, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const telecallers = [
  { name: "Priya S", totalCalls: 45, answered: 38, missed: 7, avgDuration: "3m 22s", leads: 12, active: true },
  { name: "Ravi K", totalCalls: 38, answered: 30, missed: 8, avgDuration: "2m 45s", leads: 8, active: true },
  { name: "Anitha M", totalCalls: 52, answered: 48, missed: 4, avgDuration: "4m 10s", leads: 15, active: true },
  { name: "Kumar R", totalCalls: 22, answered: 18, missed: 4, avgDuration: "2m 30s", leads: 5, active: false },
];

const recentCalls = [
  { id: "1", caller: "+91 98765 43210", callerName: "Rajesh M", telecaller: "Priya S", type: "incoming", status: "answered", duration: "4m 12s", time: "10:32 AM", notes: "Interested in Invisalign, follow-up scheduled" },
  { id: "2", caller: "+91 87654 32109", callerName: "Lakshmi K", telecaller: "—", type: "incoming", status: "missed", duration: "—", time: "10:28 AM", notes: "" },
  { id: "3", caller: "+91 76543 21098", callerName: "Suresh P", telecaller: "Ravi K", type: "outgoing", status: "answered", duration: "2m 45s", time: "10:15 AM", notes: "Appointment confirmed for tomorrow" },
  { id: "4", caller: "+91 65432 10987", callerName: "Divya N", telecaller: "Anitha M", type: "incoming", status: "answered", duration: "5m 30s", time: "10:05 AM", notes: "Price enquiry for root canal" },
  { id: "5", caller: "+91 54321 09876", callerName: "Unknown", telecaller: "—", type: "incoming", status: "missed", duration: "—", time: "09:55 AM", notes: "" },
  { id: "6", caller: "+91 43210 98765", callerName: "Meena S", telecaller: "Priya S", type: "outgoing", status: "answered", duration: "3m 15s", time: "09:45 AM", notes: "Recall reminder given" },
];

const IVRManagement = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const totalCallsToday = telecallers.reduce((a, t) => a + t.totalCalls, 0);
  const totalAnswered = telecallers.reduce((a, t) => a + t.answered, 0);
  const totalMissed = telecallers.reduce((a, t) => a + t.missed, 0);
  const totalLeads = telecallers.reduce((a, t) => a + t.leads, 0);

  const typeIcons: Record<string, any> = { incoming: PhoneIncoming, outgoing: PhoneOutgoing, missed: PhoneMissed };
  const statusColors: Record<string, string> = {
    answered: "bg-green-500/10 text-green-600 border-green-200",
    missed: "bg-red-500/10 text-red-600 border-red-200",
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <PhoneCall className="text-red-500" size={22} />
            IVR Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Call handling, telecaller performance & IVR integration</p>
        </div>
        <div className="flex gap-2">
          {/* Recharge */}
          <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><Wallet size={14} /> Recharge</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Recharge IVR Balance</DialogTitle></DialogHeader>
              <div className="space-y-4 py-3">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className="text-3xl font-bold font-display text-primary">₹2,450</p>
                  <p className="text-xs text-muted-foreground mt-1">~1,225 minutes remaining</p>
                </div>
                <div className="space-y-1.5"><Label>Recharge Amount (₹)</Label><Input type="number" placeholder="1000" /></div>
                <div className="grid grid-cols-3 gap-2">
                  {["₹500", "₹1,000", "₹2,000"].map(amt => (
                    <Button key={amt} variant="outline" size="sm">{amt}</Button>
                  ))}
                </div>
                <Button className="w-full" onClick={() => { setRechargeOpen(false); toast({ title: "Recharge initiated" }); }}>Proceed to Pay</Button>
              </div>
            </DialogContent>
          </Dialog>
          {/* Settings */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><Settings size={14} /> IVR Settings</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">IVR Configuration</DialogTitle></DialogHeader>
              <div className="space-y-4 py-3">
                <div className="space-y-1.5"><Label>IVR Provider</Label>
                  <Select defaultValue="knowlarity">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="knowlarity">Knowlarity</SelectItem>
                      <SelectItem value="exotel">Exotel</SelectItem>
                      <SelectItem value="myoperator">MyOperator</SelectItem>
                      <SelectItem value="ozonetel">Ozonetel</SelectItem>
                      <SelectItem value="custom">Custom / Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Virtual Number</Label><Input placeholder="+91 44 1234 5678" /></div>
                <div className="space-y-1.5"><Label>API Key</Label><Input type="password" placeholder="Enter provider API key" /></div>
                <div className="space-y-1.5"><Label>Welcome Message</Label><Input placeholder="Welcome to Dr Neemz Dentistry. Press 1 for..." /></div>
                <div className="space-y-1.5"><Label>After-Hours Message</Label><Input placeholder="Our clinic is currently closed..." /></div>
                <Button className="w-full" onClick={() => { setSettingsOpen(false); toast({ title: "Settings saved" }); }}>Save Configuration</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
        {[
          { label: "Total Calls", value: totalCallsToday, icon: Phone, color: "text-primary" },
          { label: "Answered", value: totalAnswered, icon: PhoneIncoming, color: "text-green-600" },
          { label: "Missed", value: totalMissed, icon: PhoneMissed, color: "text-red-500" },
          { label: "Leads Generated", value: totalLeads, icon: TrendingUp, color: "text-blue-600" },
          { label: "Balance", value: "₹2,450", icon: Wallet, color: "text-orange-500" },
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
        <TabsList>
          <TabsTrigger value="dashboard">Call Logs</TabsTrigger>
          <TabsTrigger value="telecallers">Telecaller Performance</TabsTrigger>
          <TabsTrigger value="ivr-menu">IVR Menu</TabsTrigger>
        </TabsList>

        {/* Call Logs */}
        <TabsContent value="dashboard">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display">Today's Calls</CardTitle>
                <div className="flex gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Calls</SelectItem>
                      <SelectItem value="incoming">Incoming</SelectItem>
                      <SelectItem value="outgoing">Outgoing</SelectItem>
                      <SelectItem value="missed">Missed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {recentCalls.map((call) => {
                  const TypeIcon = typeIcons[call.type] || Phone;
                  return (
                    <div key={call.id} className="px-6 py-3 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <TypeIcon size={16} className={call.status === "missed" ? "text-red-500" : call.type === "outgoing" ? "text-blue-500" : "text-green-500"} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{call.callerName}</p>
                            <span className="text-xs text-muted-foreground">{call.caller}</span>
                          </div>
                          {call.notes && <p className="text-xs text-muted-foreground truncate">{call.notes}</p>}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${statusColors[call.status]}`}>{call.status}</Badge>
                            <span className="text-xs text-muted-foreground">{call.duration}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{call.telecaller !== "—" ? call.telecaller : "Unattended"} · {call.time}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telecaller Performance */}
        <TabsContent value="telecallers">
          <div className="grid gap-4 md:grid-cols-2">
            {telecallers.map((tc) => (
              <Card key={tc.name} className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{tc.name.split(" ").map(n => n[0]).join("")}</div>
                      <div>
                        <p className="text-sm font-medium">{tc.name}</p>
                        <Badge variant="outline" className={tc.active ? "text-[10px] bg-green-500/10 text-green-600" : "text-[10px] bg-muted text-muted-foreground"}>{tc.active ? "Online" : "Offline"}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Total", value: tc.totalCalls },
                      { label: "Answered", value: tc.answered },
                      { label: "Missed", value: tc.missed },
                      { label: "Leads", value: tc.leads },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-muted/50 rounded-md py-2">
                        <p className="text-sm font-bold">{stat.value}</p>
                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Answer Rate</span>
                      <span>{((tc.answered / tc.totalCalls) * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={(tc.answered / tc.totalCalls) * 100} className="h-1.5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Avg Duration: {tc.avgDuration}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* IVR Menu */}
        <TabsContent value="ivr-menu">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">IVR Call Flow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "1", label: "Book Appointment", action: "Route to Receptionist" },
                { key: "2", label: "Treatment Enquiry", action: "Route to Telecaller" },
                { key: "3", label: "Billing / Payment", action: "Route to Billing Desk" },
                { key: "4", label: "Speak to Doctor", action: "Route to Duty Doctor" },
                { key: "0", label: "Repeat Menu", action: "Replay IVR message" },
                { key: "*", label: "After Hours", action: "Play after-hours message + SMS callback" },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{item.key}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.action}</p>
                  </div>
                  <Button variant="ghost" size="sm"><Settings size={14} /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default IVRManagement;
