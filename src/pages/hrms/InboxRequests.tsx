import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, FileText, Inbox, Loader2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type RequestTab = "my" | "awaiting" | "completed";
export type InboxKind = "leave" | "comp_off" | "expense";

interface InboxRequestsProps {
  title: string;
  emptyText: string;
  kind: InboxKind;
}

const TABLE: Record<InboxKind, "leave_requests" | "comp_off_requests" | "expense_requests"> = {
  leave: "leave_requests",
  comp_off: "comp_off_requests",
  expense: "expense_requests",
};

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Unpaid Leave"];
const EXPENSE_CATEGORIES = ["Travel", "Food", "Supplies", "Fuel", "Other"];

const requestTabs: Array<{ value: RequestTab; label: string }> = [
  { value: "my", label: "My requests" },
  { value: "awaiting", label: "Awaiting approval" },
  { value: "completed", label: "Completed" },
];

type Row = Record<string, any> & { id: string; status: string; employee_id: string; created_at: string };

function EmptyRequests({ text }: { text: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-4 py-16 text-center sm:min-h-[420px]">
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
        <span className="absolute -right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-card">
          <Bell className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </span>
      </div>
      <p className="font-medium text-foreground">{text}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "pending").toLowerCase();
  const cls =
    s === "approved"
      ? "bg-success/15 text-success border-success/30"
      : s === "rejected"
        ? "bg-destructive/15 text-destructive border-destructive/30"
        : "bg-warning/15 text-warning border-warning/30";
  return <Badge variant="outline" className={`capitalize ${cls}`}>{s}</Badge>;
}

const fmt = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy") : "-");

function describe(kind: InboxKind, r: Row) {
  if (kind === "leave") return { main: `${r.leave_type} · ${r.days ?? ""} day(s)`, sub: `${fmt(r.start_date)} → ${fmt(r.end_date)}` };
  if (kind === "comp_off") return { main: `Comp off · ${r.duration_type === "half" ? "Half day" : "Full day"}`, sub: `Worked on ${fmt(r.working_date)}` };
  return { main: `${r.category} · ₹${Number(r.amount).toLocaleString("en-IN")}`, sub: `Expense on ${fmt(r.expense_date)}` };
}

export default function InboxRequests({ title, emptyText, kind }: InboxRequestsProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<RequestTab>("my");
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Record<string, { name: string; code: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [myEmpId, setMyEmpId] = useState<string | null>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: emp }, { data: hr }] = await Promise.all([
        supabase.rpc("current_employee_id"),
        supabase.rpc("is_hr_or_admin", { _user_id: user.id }),
      ]);
      setMyEmpId((emp as string) || null);
      setIsApprover(!!hr);
    })();
  }, [user]);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from(TABLE[kind]) as any).select("*").order("created_at", { ascending: false }).limit(500);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as Row[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.employee_id))];
    if (ids.length) {
      const { data: emps } = await supabase.from("employees").select("id, first_name, last_name, employee_code").in("id", ids);
      const map: Record<string, { name: string; code: string | null }> = {};
      (emps || []).forEach((e: any) => (map[e.id] = { name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(), code: e.employee_code }));
      setEmployees(map);
    }
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    load();
    const ch = supabase
      .channel(`inbox-${kind}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE[kind] }, () => load())
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [kind, load]);

  const lists = useMemo(() => {
    const status = (r: Row) => (r.status || "pending").toLowerCase();
    return {
      my: rows.filter((r) => r.employee_id === myEmpId),
      awaiting: isApprover ? rows.filter((r) => status(r) === "pending") : [],
      completed: rows.filter((r) => ["approved", "rejected"].includes(status(r)) && (isApprover || r.employee_id === myEmpId)),
    };
  }, [rows, myEmpId, isApprover]);

  const review = async (r: Row, status: "approved" | "rejected", comment?: string) => {
    setBusyId(r.id);
    const patch: Record<string, any> = { status, admin_comment: comment || null, reviewed_by: user?.id, updated_at: new Date().toISOString() };
    if (kind !== "expense") patch.approved_by = user?.email ?? user?.id;
    const { error } = await (supabase.from(TABLE[kind]) as any).update(patch).eq("id", r.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(`Request ${status}`);
    setRejecting(null);
    setRejectReason("");
    load();
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 300);
    if (error || !data) return toast.error(error?.message || "Could not open receipt");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const renderList = (list: Row[], t: RequestTab) => {
    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (!list.length) return <EmptyRequests text={emptyText} />;
    return (
      <div className="space-y-3 py-4">
        {list.map((r) => {
          const d = describe(kind, r);
          const emp = employees[r.employee_id];
          return (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  {(t !== "my" && isApprover) && (
                    <p className="text-sm font-semibold">{emp?.name || "Employee"}{emp?.code ? ` · ${emp.code}` : ""}</p>
                  )}
                  <p className="font-medium">{d.main}</p>
                  <p className="text-sm text-muted-foreground">{d.sub}</p>
                  {(r.reason || r.description) && <p className="text-sm">{r.reason || r.description}</p>}
                  {kind === "expense" && r.receipt_url && (
                    <button className="inline-flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => openReceipt(r.receipt_url)}>
                      <FileText className="h-3.5 w-3.5" /> View receipt
                    </button>
                  )}
                  {r.status === "rejected" && r.admin_comment && (
                    <p className="text-sm text-destructive">Reason: {r.admin_comment}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Applied {fmt(r.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t === "awaiting" ? (
                    <>
                      <Button size="sm" disabled={busyId === r.id} onClick={() => review(r, "approved")}>
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setRejecting(r)}>
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    </>
                  ) : (
                    <StatusBadge status={r.status} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-4 sm:px-6">
        <h1 className="text-2xl font-bold font-display">{title}</h1>
        {myEmpId ? (
          <Button onClick={() => setApplyOpen(true)}><Plus className="mr-1 h-4 w-4" /> Apply</Button>
        ) : (
          !loading && <p className="text-sm text-muted-foreground">Your account isn't linked to an employee record</p>
        )}
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as RequestTab)}>
        <div className="overflow-x-auto border-b">
          <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
            {requestTabs.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="rounded-none border-b-2 border-transparent px-4 py-3 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:px-6"
              >
                {item.label}
                {item.value === "awaiting" && lists.awaiting.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{lists.awaiting.length}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {requestTabs.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-0">
            {renderList(lists[item.value], item.value)}
          </TabsContent>
        ))}
      </Tabs>

      {myEmpId && (
        <ApplyDialog kind={kind} title={title} open={applyOpen} onOpenChange={setApplyOpen} employeeId={myEmpId} onDone={load} />
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) { setRejecting(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this request rejected?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || busyId === rejecting?.id} onClick={() => rejecting && review(rejecting, "rejected", rejectReason.trim())}>
              Confirm reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApplyDialog({ kind, title, open, onOpenChange, employeeId, onDone }: {
  kind: InboxKind; title: string; open: boolean; onOpenChange: (o: boolean) => void; employeeId: string; onDone: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [f, setF] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open) {
      setF({ leave_type: LEAVE_TYPES[0], start_date: today, end_date: today, duration_type: "full", working_date: today, expense_date: today, category: EXPENSE_CATEGORIES[0] });
      setFile(null);
    }
  }, [open, today]);

  const submit = async () => {
    setSaving(true);
    try {
      let payload: Record<string, any>;
      if (kind === "leave") {
        if (!f.start_date || !f.end_date || f.end_date < f.start_date) throw new Error("Check the from and to dates");
        const span = Math.round((new Date(f.end_date).getTime() - new Date(f.start_date).getTime()) / 86400000) + 1;
        const days = f.duration_type === "half" ? 0.5 : span;
        payload = { employee_id: employeeId, leave_type: f.leave_type, start_date: f.start_date, end_date: f.duration_type === "half" ? f.start_date : f.end_date, days, duration_type: f.duration_type, reason: f.reason || null, status: "pending", year: new Date(f.start_date).getFullYear() };
      } else if (kind === "comp_off") {
        if (!f.working_date) throw new Error("Pick the date worked");
        payload = { employee_id: employeeId, working_date: f.working_date, duration_type: f.duration_type, reason: f.reason || null, status: "pending", year: new Date(f.working_date).getFullYear() };
      } else {
        const amount = Number(f.amount);
        if (!amount || amount <= 0) throw new Error("Enter a valid amount");
        let receipt_url: string | null = null;
        if (file) {
          const path = `${employeeId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
          const { error } = await supabase.storage.from("expense-receipts").upload(path, file);
          if (error) throw error;
          receipt_url = path;
        }
        payload = { employee_id: employeeId, expense_date: f.expense_date, category: f.category, amount, description: f.description || null, receipt_url, status: "pending" };
      }
      const { error } = await (supabase.from(TABLE[kind]) as any).insert(payload);
      if (error) throw error;
      toast.success("Request submitted");
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Could not submit");
    } finally {
      setSaving(false);
    }
  };

  const durationSelect = (
    <div className="space-y-1.5">
      <Label>Duration</Label>
      <Select value={f.duration_type} onValueChange={(v) => set("duration_type", v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="full">Full day</SelectItem>
          <SelectItem value="half">Half day</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Apply · {title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {kind === "leave" && (
            <>
              <div className="space-y-1.5">
                <Label>Leave type</Label>
                <Select value={f.leave_type} onValueChange={(v) => set("leave_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>From</Label><Input type="date" value={f.start_date || ""} onChange={(e) => set("start_date", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>To</Label><Input type="date" value={f.end_date || ""} disabled={f.duration_type === "half"} onChange={(e) => set("end_date", e.target.value)} /></div>
              </div>
              {durationSelect}
            </>
          )}
          {kind === "comp_off" && (
            <>
              <div className="space-y-1.5"><Label>Date worked</Label><Input type="date" value={f.working_date || ""} onChange={(e) => set("working_date", e.target.value)} /></div>
              {durationSelect}
            </>
          )}
          {kind === "expense" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={f.expense_date || ""} onChange={(e) => set("expense_date", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Amount (₹) *</Label><Input type="number" min="0" step="0.01" value={f.amount || ""} onChange={(e) => set("amount", e.target.value)} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={f.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Receipt</Label><Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
            </>
          ) : (
            <div className="space-y-1.5"><Label>Reason</Label><Textarea value={f.reason || ""} onChange={(e) => set("reason", e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
