import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, ClipboardCheck, Clock, Inbox, Loader2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Tab = "notifications" | "my" | "awaiting" | "completed";

interface Req {
  id: string;
  employee_id: string;
  requested_date: string;
  shift_details: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  original_check_in: string | null;
  original_check_out: string | null;
  claimed_hours: string | null;
  approved_hours: string | null;
  remarks: string | null;
  status: string;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Emp {
  name: string;
  designation: string | null;
  department: string | null;
}

const T = "attendance_regularization_requests" as const;
const fmtDate = (d?: string | null) => (d ? format(new Date(d.length === 10 ? `${d}T00:00:00` : d), "dd MMM yyyy") : "-");
const fmtTime = (d?: string | null) => (d ? format(new Date(d), "hh:mm a") : "-");
const fmtStamp = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy, hh:mm a") : "-");
const hoursBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const s = Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
const initials = (n: string) =>
  n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-9 w-9 text-muted-foreground" />
        <span className="absolute -right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-card">
          <Bell className="h-3.5 w-3.5 text-primary" />
        </span>
      </div>
      <p className="font-medium text-foreground">{text}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "bg-success/15 text-success border-success/30"
      : status === "rejected"
        ? "bg-destructive/15 text-destructive border-destructive/30"
        : "bg-warning/15 text-warning border-warning/30";
  return <Badge variant="outline" className={`capitalize ${cls}`}>{status}</Badge>;
}

function Field({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AttendanceTracker() {
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const [tab, setTab] = useState<Tab>("awaiting");
  const [rows, setRows] = useState<Req[]>([]);
  const [emps, setEmps] = useState<Record<string, Emp>>({});
  const [reviewers, setReviewers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [myEmpId, setMyEmpId] = useState<string | null>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [selected, setSelected] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approvedHours, setApprovedHours] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ date: "", checkIn: "", checkOut: "", remarks: "" });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: emp }, { data: hr }] = await Promise.all([
        supabase.rpc("current_employee_id"),
        supabase.rpc("is_hr_or_admin", { _user_id: user.id }),
      ]);
      setMyEmpId((emp as string) || null);
      setIsApprover(!!hr);
      if (!hr) setTab("my");
    })();
  }, [user]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(T).select("*").order("created_at", { ascending: false }).limit(500);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as Req[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.employee_id))];
    if (ids.length) {
      const { data: e } = await supabase.from("employees").select("id, first_name, last_name, designation, department").in("id", ids);
      const m: Record<string, Emp> = {};
      (e || []).forEach((x: any) => (m[x.id] = { name: `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim(), designation: x.designation, department: x.department }));
      setEmps(m);
    }
    const rIds = [...new Set(list.map((r) => r.reviewed_by).filter(Boolean))] as string[];
    if (rIds.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", rIds);
      const m: Record<string, string> = {};
      (p || []).forEach((x: any) => (m[x.id] = x.full_name || "—"));
      setReviewers(m);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("att-reg-page")
      .on("postgres_changes", { event: "*", schema: "public", table: T }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const lists = useMemo(() => {
    const mine = rows.filter((r) => r.employee_id === myEmpId);
    return {
      my: mine,
      awaiting: isApprover ? rows.filter((r) => r.status === "pending") : [],
      completed: rows.filter((r) => r.status !== "pending" && (isApprover || r.employee_id === myEmpId)),
      notifications: mine.filter((r) => r.status !== "pending"),
    };
  }, [rows, myEmpId, isApprover]);

  /* ---------- new request ---------- */
  const submitNew = async () => {
    if (!myEmpId) return toast.error("No employee profile is linked to your account.");
    if (!form.date || !form.checkIn) return toast.error("Date and check-in time are required.");
    if (form.date > format(new Date(), "yyyy-MM-dd")) return toast.error("Only past or today's dates can be regularized.");
    if (!form.remarks.trim()) return toast.error("Please add remarks.");
    const inAt = new Date(`${form.date}T${form.checkIn}:00`);
    const outAt = form.checkOut ? new Date(`${form.date}T${form.checkOut}:00`) : null;
    if (outAt && outAt <= inAt) return toast.error("Check-out must be after check-in.");
    setBusy(true);
    const [{ data: log }, { data: sh }] = await Promise.all([
      supabase.from("attendance_logs").select("check_in_at, check_out_at").eq("employee_id", myEmpId).eq("date", form.date).maybeSingle(),
      supabase.from("employee_shifts").select("shift_name, start_time, end_time").eq("employee_id", myEmpId).order("effective_from", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const shift = sh ? `${sh.shift_name} (${String(sh.start_time).slice(0, 5)} - ${String(sh.end_time).slice(0, 5)})` : null;
    const { error } = await supabase.from(T).insert({
      employee_id: myEmpId,
      requested_date: form.date,
      shift_details: shift,
      requested_check_in: inAt.toISOString(),
      requested_check_out: outAt?.toISOString() ?? null,
      original_check_in: log?.check_in_at ?? null,
      original_check_out: log?.check_out_at ?? null,
      claimed_hours: outAt ? hoursBetween(inAt.toISOString(), outAt.toISOString()) : null,
      remarks: form.remarks.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request submitted for approval");
    setNewOpen(false);
    setForm({ date: "", checkIn: "", checkOut: "", remarks: "" });
    load();
  };

  /* ---------- approve / reject ---------- */
  const current = (key: Tab) => {
    const list = lists[key as "awaiting" | "completed" | "my"] ?? [];
    return list.find((r) => r.id === selected[key]) ?? list[0] ?? null;
  };

  const approve = async (r: Req) => {
    if (!r.requested_check_in) return;
    setBusy(true);
    const inAt = new Date(r.requested_check_in);
    const outAt = r.requested_check_out ? new Date(r.requested_check_out) : null;
    const seconds = outAt ? Math.floor((outAt.getTime() - inAt.getTime()) / 1000) : null;
    const payload = {
      check_in: format(inAt, "HH:mm:ss"),
      check_in_at: inAt.toISOString(),
      check_out: outAt ? format(outAt, "HH:mm:ss") : null,
      check_out_at: outAt?.toISOString() ?? null,
      worked_seconds: seconds,
      hours_worked: seconds != null ? Number((seconds / 3600).toFixed(2)) : null,
      status: "present",
      manual_entry: true,
      notes: r.remarks,
    };
    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id")
      .eq("employee_id", r.employee_id)
      .eq("date", r.requested_date)
      .maybeSingle();
    const res = existing
      ? await supabase.from("attendance_logs").update(payload).eq("id", existing.id).select("id").maybeSingle()
      : await supabase
          .from("attendance_logs")
          .insert({ ...payload, employee_id: r.employee_id, date: r.requested_date, branch_id: currentBranchId, created_by: user?.id ?? null })
          .select("id")
          .maybeSingle();
    if (res.error) {
      setBusy(false);
      return toast.error(res.error.message);
    }
    const hrs = approvedHours.trim() || r.claimed_hours || hoursBetween(r.requested_check_in, r.requested_check_out);
    const { error } = await supabase
      .from(T)
      .update({ status: "approved", approved_hours: hrs, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("status", "pending");
    await supabase.from("attendance_audit").insert({
      attendance_id: res.data?.id ?? null,
      employee_id: r.employee_id,
      action: "regularization_approved",
      details: { request_id: r.id, check_in: payload.check_in_at, check_out: payload.check_out_at } as never,
      performed_by: user?.id ?? null,
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Approved — attendance updated");
    setApprovedHours("");
    load();
  };

  const reject = async (r: Req) => {
    setBusy(true);
    const { error } = await supabase
      .from(T)
      .update({ status: "rejected", reject_reason: rejectReason.trim() || null, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("status", "pending");
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request rejected");
    setRejectOpen(false);
    setRejectReason("");
    load();
  };

  /* ---------- views ---------- */
  const renderSplit = (key: "awaiting" | "completed" | "my", emptyText: string) => {
    const list = lists[key];
    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!list.length) return <Empty text={emptyText} />;
    const r = current(key)!;
    const emp = emps[r.employee_id] ?? { name: "Employee", designation: null, department: null };
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
          {list.map((x) => {
            const e = emps[x.employee_id];
            const active = x.id === r.id;
            return (
              <button
                key={x.id}
                onClick={() => setSelected((s) => ({ ...s, [key]: x.id }))}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5 border-l-4" : "bg-card hover:bg-muted/50"}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(e?.name ?? "")}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-foreground">{e?.name ?? "Employee"}</p>
                    {key !== "awaiting" && <StatusBadge status={x.status} />}
                  </div>
                  <p className="text-xs text-muted-foreground">Submitted {fmtDate(x.created_at)}</p>
                  <p className="text-xs text-muted-foreground">Submitted for {fmtDate(x.requested_date)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{initials(emp.name)}</div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{emp.name}</p>
                  <p className="text-sm text-muted-foreground">{[emp.designation, emp.department].filter(Boolean).join(" · ") || "—"}</p>
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>

            <div className="rounded-lg bg-primary/5 px-4 py-3 text-sm text-foreground">
              <strong>{emp.name}</strong> has raised a manual entry request for attendance
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Shift" value={r.shift_details || "—"} />
              <Field label="Submitted on" value={fmtStamp(r.created_at)} />
              <Field label="Requested date" value={fmtDate(r.requested_date)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Original check-in / check-out" value={`${fmtTime(r.original_check_in)} – ${fmtTime(r.original_check_out)}`} sub={r.original_check_in ? "Recorded" : "No record"} />
              <Field label="Requested check-in / check-out" value={`${fmtTime(r.requested_check_in)} – ${fmtTime(r.requested_check_out)}`} sub="Manual entry" />
              <Field label="Claimed hours" value={r.claimed_hours || "—"} />
              <Field label="Approved hours" value={r.approved_hours || "—"} />
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Employee remarks</p>
              <p className="mt-1 text-sm text-foreground">{r.remarks || "—"}</p>
            </div>

            {r.status !== "pending" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Decision taken by" value={r.reviewed_by ? reviewers[r.reviewed_by] ?? "—" : "—"} />
                <Field label={r.status === "approved" ? "Approved on" : "Rejected on"} value={fmtStamp(r.reviewed_at)} />
                {r.reject_reason && <div className="sm:col-span-2"><Field label="Rejection reason" value={r.reject_reason} /></div>}
              </div>
            )}

            {key === "awaiting" && r.status === "pending" && (
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <Label className="text-xs">Approved hours (optional)</Label>
                  <Input className="w-40" placeholder={r.claimed_hours || "e.g. 9h 0m"} value={approvedHours} onChange={(e) => setApprovedHours(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
                    <X className="mr-1 h-4 w-4" /> REJECT
                  </Button>
                  <Button disabled={busy || !r.requested_check_in} onClick={() => approve(r)}>
                    {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} APPROVE
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
            <Textarea placeholder="Reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button variant="destructive" disabled={busy} onClick={() => reject(r)}>Reject</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: "notifications", label: "Notifications" },
    { value: "my", label: "My Requests" },
    { value: "awaiting", label: "Awaiting Approval", count: lists.awaiting.length },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Attendance Tracker</h1>
            <p className="text-sm text-muted-foreground">Manual attendance regularization requests</p>
          </div>
        </div>
        {myEmpId && (
          <Button onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> New request</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2">
              {t.label}
              {!!t.count && <Badge className="h-5 px-1.5 text-[10px]">{t.count}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="notifications" className="mt-4">
          {loading ? null : lists.notifications.length ? (
            <div className="space-y-2">
              {lists.notifications.map((n) => (
                <Card key={n.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <p className="flex-1 text-sm text-foreground">
                      Your attendance request for <strong>{fmtDate(n.requested_date)}</strong> was {n.status}
                      {n.reject_reason ? ` — ${n.reject_reason}` : ""}.
                    </p>
                    <span className="text-xs text-muted-foreground">{fmtStamp(n.reviewed_at)}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Empty text="No notifications to display" />
          )}
        </TabsContent>
        <TabsContent value="my" className="mt-4">{renderSplit("my", "You haven't raised any attendance requests")}</TabsContent>
        <TabsContent value="awaiting" className="mt-4">
          {isApprover ? renderSplit("awaiting", "No requests awaiting approval") : <Empty text="Only HR or admin can approve requests" />}
        </TabsContent>
        <TabsContent value="completed" className="mt-4">{renderSplit("completed", "No completed requests")}</TabsContent>
      </Tabs>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attendance regularization request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" max={format(new Date(), "yyyy-MM-dd")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Check-in</Label><Input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></div>
              <div className="space-y-1"><Label>Check-out</Label><Input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Remarks</Label><Textarea placeholder="e.g. Forgot to check out" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={submitNew}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
