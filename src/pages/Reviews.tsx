import { useEffect, useState } from "react";
import { Star, Send, TrendingUp, Users, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";

const reviewMessage = `Thank you for visiting Dr Neemz Dentistry, Salem! 🦷✨ Your feedback helps other patients find quality dental care. Please leave us a Google review: [Google Review Link]

We truly appreciate your time! 🙏`;

const PAGE = 25;
const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-primary/10 text-primary border-primary/20" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  clicked: { label: "Link Clicked", cls: "bg-warning/10 text-warning border-warning/20" },
  submitted: { label: "Review Submitted", cls: "bg-success/10 text-success border-success/20" },
};

const Reviews = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ patient_name: "", phone: "" });
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = (q: any) => {
    if (from) q = q.gte("sent_at", `${from}T00:00:00+05:30`);
    if (to) q = q.lte("sent_at", `${to}T23:59:59+05:30`);
    return q;
  };

  const { data: stats } = useQuery({
    queryKey: ["review-stats", from, to],
    queryFn: async () => {
      const sent = await range(supabase.from("review_requests").select("id", { count: "exact", head: true }).neq("status", "failed"));
      const recv = await range(supabase.from("review_requests").select("rating").eq("status", "submitted").limit(10000));
      const ratings = (recv.data || []).map((r: any) => r.rating).filter((n: any) => typeof n === "number");
      const received = recv.data?.length || 0;
      return {
        sent: sent.count || 0,
        received,
        avg: ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0,
      };
    },
  });

  const { data: list } = useQuery({
    queryKey: ["review-requests", page, from, to],
    queryFn: async () => {
      const { data, error, count } = await range(
        supabase.from("review_requests").select("*", { count: "exact" }).order("sent_at", { ascending: false }),
      ).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data || [], count: count || 0 };
    },
  });
  const reviews = list?.rows || [];
  const total = list?.count || 0;

  useEffect(() => {
    const ch = supabase.channel("reviews-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "review_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["review-requests"] });
        queryClient.invalidateQueries({ queryKey: ["review-stats"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["review-requests"] });
    queryClient.invalidateQueries({ queryKey: ["review-stats"] });
  };

  const sendReviewRequest = useMutation({
    mutationFn: async (data: typeof form) => {
      const { data: row, error } = await supabase.from("review_requests").insert({
        patient_name: data.patient_name, phone: data.phone, source: "manual", status: "sent",
      }).select("id").single();
      if (error) throw error;
      const [first, ...rest] = data.patient_name.trim().split(" ");
      const res = await sendClinicWhatsApp({
        patient: { first_name: first, last_name: rest.join(" "), phone: data.phone } as any,
        templateKey: "google_review_request",
        bodyParams: [data.patient_name],
        fallbackText: reviewMessage,
        label: "Google Review",
      }).catch(() => ({ ok: false }));
      if (!res.ok) await supabase.from("review_requests").update({ status: "failed", delivery_error: "WhatsApp send failed" }).eq("id", row.id);
      return res.ok;
    },
    onSuccess: (ok) => {
      refresh();
      setDialogOpen(false);
      setForm({ patient_name: "", phone: "" });
      toast(ok ? { title: "Review request sent" } : { title: "WhatsApp send failed", description: "Saved as Failed.", variant: "destructive" });
    },
  });

  const markReceived = useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: number }) => {
      const { error } = await supabase.from("review_requests").update({ review_received: true, rating, status: "submitted", reviewed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const conversionRate = stats?.sent ? Math.round((stats.received / stats.sent) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            Google Reviews <Star size={20} className="text-warning" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Automated review collection system</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0"><Send size={16} className="mr-2" /> Send Review Request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Send Review Request</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Patient Name</Label>
                <Input placeholder="Patient name" value={form.patient_name} onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone (WhatsApp)</Label>
                <Input placeholder="+91 XXXXX XXXXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="p-3 rounded-lg bg-success/5 border border-success/10">
                <p className="text-xs font-medium mb-1 text-success">Preview Message:</p>
                <p className="text-xs text-muted-foreground whitespace-pre-line">{reviewMessage}</p>
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => sendReviewRequest.mutate(form)} disabled={!form.patient_name || !form.phone || sendReviewRequest.isPending}>
                <MessageSquare size={14} className="mr-2" /> {sendReviewRequest.isPending ? "Sending…" : "Send via WhatsApp"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} /></div>
        {(from || to) && <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setPage(0); }}>Clear</Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Requests Sent", value: stats?.sent ?? 0, icon: Send, color: "text-primary" },
          { label: "Reviews Received", value: stats?.received ?? 0, icon: Star, color: "text-warning" },
          { label: "Avg Rating", value: (stats?.avg ?? 0).toFixed(1) + "★", icon: TrendingUp, color: "text-success" },
          { label: "Conversion Rate", value: conversionRate + "%", icon: Users, color: "text-accent" },
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Review Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {reviews.map((r: any) => {
              const st = STATUS[r.status] || STATUS.sent;
              return (
                <div key={r.id} className="flex items-center gap-4 px-6 py-3 hover:bg-secondary/30 transition-colors flex-wrap">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                    {r.patient_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.patient_name}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.sent_at || r.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
                  <Badge variant="outline" className="text-xs capitalize">{r.source || "manual"}</Badge>
                  <Badge className={`${st.cls} text-xs`} title={r.delivery_error || undefined}>{st.label}</Badge>
                  {r.status === "submitted" ? (
                    <span className="text-sm font-semibold text-success w-16 text-right">{r.rating ? `${r.rating}★` : "-"}</span>
                  ) : (
                    <div className="flex gap-1">
                      {[5, 4, 3].map(rating => (
                        <Button key={rating} variant="outline" size="sm" className="h-7 text-xs" onClick={() => markReceived.mutate({ id: r.id, rating })}>
                          {rating}★
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {reviews.length === 0 && (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">No review requests for this period.</div>
            )}
          </div>
          {total > PAGE && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border text-sm">
              <span className="text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE)} · {total} requests</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reviews;
