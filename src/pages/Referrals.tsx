import { useState, useMemo } from "react";
import { Share2, Gift, TrendingUp, Users, Plus, Search, X } from "lucide-react";
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

const rewards = ["Free Scaling", "10% Discount", "Free Consultation", "₹500 Off"];

const Referrals = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({ referrer_name: "", referrer_phone: "", referred_name: "", referred_phone: "", reward_type: "" });

  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referrals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredReferrals = useMemo(() => {
    if (!searchQuery.trim()) return referrals;
    const q = searchQuery.toLowerCase();
    return (referrals as any[]).filter(
      (r) =>
        r.referrer_name?.toLowerCase().includes(q) ||
        r.referrer_phone?.includes(q) ||
        r.referred_name?.toLowerCase().includes(q) ||
        r.referred_phone?.includes(q) ||
        r.referral_code?.toLowerCase().includes(q)
    );
  }, [referrals, searchQuery]);

  // Group by referrer for "top referrers" insight
  const referrerStats = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; count: number; converted: number; revenue: number }>();
    (referrals as any[]).forEach((r) => {
      const key = r.referrer_patient_id || `${r.referrer_phone}-${r.referrer_name}`;
      const cur = map.get(key) || { name: r.referrer_name, phone: r.referrer_phone || "", count: 0, converted: 0, revenue: 0 };
      cur.count += 1;
      if (r.status === "converted") cur.converted += 1;
      cur.revenue += Number(r.revenue_generated || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [referrals]);

  const addReferral = useMutation({
    mutationFn: async (data: typeof form) => {
      const code = `DRNEEMZ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { error } = await supabase.from("referrals").insert({
        referrer_name: data.referrer_name,
        referrer_phone: data.referrer_phone,
        referred_name: data.referred_name,
        referred_phone: data.referred_phone,
        reward_type: data.reward_type,
        referral_code: code,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      setDialogOpen(false);
      setForm({ referrer_name: "", referrer_phone: "", referred_name: "", referred_phone: "", reward_type: "" });
      toast({ title: "Referral created", description: "Unique referral code generated." });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "converted") updates.converted_at = new Date().toISOString();
      const { error } = await supabase.from("referrals").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });

  const totalReferrals = referrals.length;
  const converted = (referrals as any[]).filter((r) => r.status === "converted").length;
  const conversionRate = totalReferrals > 0 ? Math.round((converted / totalReferrals) * 100) : 0;
  const totalRevenue = (referrals as any[]).reduce((acc, r) => acc + Number(r.revenue_generated || 0), 0);

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning", contacted: "bg-info/10 text-info",
    converted: "bg-success/10 text-success", expired: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">Referral Engine <Share2 size={20} className="text-accent" /></h1>
          <p className="text-sm text-muted-foreground mt-1">Patient referral tracking & rewards · Auto-synced from appointments & billing</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0"><Plus size={16} className="mr-2" /> Add Referral</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Create Referral</DialogTitle></DialogHeader>
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Referrer Name</Label><Input value={form.referrer_name} onChange={e => setForm(f => ({ ...f, referrer_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Referrer Phone</Label><Input value={form.referrer_phone} onChange={e => setForm(f => ({ ...f, referrer_phone: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Referred Name</Label><Input value={form.referred_name} onChange={e => setForm(f => ({ ...f, referred_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Referred Phone</Label><Input value={form.referred_phone} onChange={e => setForm(f => ({ ...f, referred_phone: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Reward</Label>
                <Select value={form.reward_type} onValueChange={v => setForm(f => ({ ...f, reward_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select reward" /></SelectTrigger>
                  <SelectContent>{rewards.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => addReferral.mutate(form)} disabled={!form.referrer_name || !form.referred_name || !form.referred_phone}>
                Create Referral
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Referrals", value: totalReferrals, icon: Users, color: "text-primary" },
          { label: "Converted", value: converted, icon: TrendingUp, color: "text-success" },
          { label: "Conversion Rate", value: conversionRate + "%", icon: Share2, color: "text-accent" },
          { label: "Revenue Generated", value: "₹" + totalRevenue.toLocaleString(), icon: Gift, color: "text-warning" },
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

      {/* Top Referrers */}
      {referrerStats.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Top Referrers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {referrerStats.slice(0, 5).map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => setSearchQuery(s.phone || s.name)}
                  className="w-full flex items-center gap-4 px-6 py-3 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-full bg-accent/10 text-accent flex items-center justify-center font-semibold text-sm">
                    {s.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.phone}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="secondary" className="font-medium">{s.count} referred</Badge>
                    <Badge className="bg-success/10 text-success border-0">{s.converted} converted</Badge>
                    <span className="font-semibold text-warning">₹{s.revenue.toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base font-display">Referral Tracking</CardTitle>
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by referrer name / phone..."
              className="pl-9 h-8 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filteredReferrals.map((r: any) => (
              <div key={r.id} className="flex items-center gap-4 px-6 py-3 hover:bg-secondary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    <span className="text-accent">{r.referrer_name}</span>
                    <span className="text-muted-foreground mx-1.5">→</span>
                    {r.referred_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <code className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">{r.referral_code}</code>
                    {r.reward_type && <span className="text-xs text-muted-foreground">{r.reward_type}</span>}
                    {r.referrer_phone && <span className="text-[10px] text-muted-foreground">📞 {r.referrer_phone}</span>}
                  </div>
                </div>
                {Number(r.revenue_generated) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold text-success">₹{Number(r.revenue_generated).toLocaleString()}</p>
                  </div>
                )}
                <Select value={r.status} onValueChange={v => updateStatus.mutate({ id: r.id, status: v })}>
                  <SelectTrigger className={`h-7 text-xs w-[120px] ${statusColors[r.status] || ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            {filteredReferrals.length === 0 && (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                {searchQuery ? "No matching referrals." : "No referrals yet."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Referrals;
