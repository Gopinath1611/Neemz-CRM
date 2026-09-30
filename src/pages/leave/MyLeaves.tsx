import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CalendarOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { applyLeaveDecision } from "@/lib/hrmsSync";
import { useAuth } from "@/contexts/AuthContext";
import { LegendCard } from "@/components/reports/MyLeaveSummaryReport";

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Comp Off", "LOP", "Maternity", "Paternity"];
const isLop = (t?: string | null) => { const v = (t || "").toLowerCase(); return v.includes("lop") || v.includes("unpaid") || v.includes("loss of pay"); };
const isCompOff = (t?: string | null) => { const v = (t || "").toLowerCase(); return v.includes("comp") && v.includes("off"); };

export default function MyLeaves() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [compOffs, setCompOffs] = useState<any[]>([]);
  const [showApply, setShowApply] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [form, setForm] = useState({
    employee_id: "", leave_type: "Casual Leave", duration_type: "full_day",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    reason: "", reporting_person: "Admin",
  });

  useEffect(() => { fetchEmployees(); }, []);
  useEffect(() => { if (user) fetchCurrentEmployee(); }, [user]);

  const fetchCurrentEmployee = async () => {
    const { data } = await supabase.from("employees").select("id, employee_code, first_name, last_name, user_id").eq("user_id", user!.id).maybeSingle();
    if (data) {
      setCurrentEmployee(data);
      setForm(f => ({ ...f, employee_id: f.employee_id || data.id }));
      fetchLeaves(data.id);
    } else {
      setCurrentEmployee(null);
      setLeaves([]);
      setCompOffs([]);
    }
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, employee_code, first_name, last_name").eq("status", "active").order("first_name");
    setEmployees(data || []);
  };
  const fetchLeaves = async (employeeId?: string) => {
    const id = employeeId || currentEmployee?.id;
    if (!id) { setLeaves([]); setCompOffs([]); return; }
    const [{ data }, { data: co }] = await Promise.all([
      supabase.from("leave_requests")
        .select("*, employees(employee_code, first_name, last_name)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("comp_off_requests").select("*").eq("employee_id", id),
    ]);
    setLeaves(data || []);
    setCompOffs(co || []);
  };

  const handleApply = async () => {
    if (!form.employee_id) { toast.error("Select employee"); return; }
    const days = Math.max(1, Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1);
    const { error } = await supabase.from("leave_requests").insert({
      employee_id: form.employee_id, leave_type: form.leave_type,
      start_date: form.start_date, end_date: form.end_date,
      days: form.duration_type === "half_day" ? 0.5 : days,
      duration_type: form.duration_type,
      reason: form.reason, reporting_person: "Admin",
      year: new Date(form.start_date).getFullYear(), status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Leave applied");
    setShowApply(false);
    setForm({ ...form, reason: "" });
    fetchLeaves();
  };

  const handleApprove = async (id: string, status: string) => {
    // Single source of truth: also syncs attendance + recomputes leave balances
    await applyLeaveDecision(id, status);
    toast.success(`Leave ${status}`);
    fetchLeaves();
  };

  const compOffStats = useMemo(() => {
    const approved = compOffs.filter((c) => (c.status || "").toLowerCase() === "approved")
      .reduce((s, c) => s + (Number(c.days) || 1), 0);
    const consumed = leaves
      .filter((l) => isCompOff(l.leave_type) && (l.status || "").toLowerCase() === "approved")
      .reduce((s, l) => s + (Number(l.days) || 0), 0);
    const expired = compOffs.filter((c) => (c.status || "").toLowerCase() === "expired")
      .reduce((s, c) => s + (Number(c.days) || 1), 0);
    return { approved, consumed, expired, available: Math.max(0, approved - consumed - expired) };
  }, [compOffs, leaves]);

  const lopConsumed = useMemo(
    () => leaves.filter((l) => isLop(l.leave_type) && (l.status || "").toLowerCase() === "approved")
      .reduce((s, l) => s + (Number(l.days) || 0), 0),
    [leaves]
  );

  const filtered = filterDate ? leaves.filter(l => l.start_date <= filterDate && l.end_date >= filterDate) : leaves;
  const selectedEmp = employees.find(e => e.id === form.employee_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarOff className="h-7 w-7 text-primary" /> My Leaves</h1>
          <p className="text-muted-foreground mt-1">Comp Off, LOP and all applied leaves</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-44" />
          <Button onClick={() => setShowApply(true)}><Plus size={16} className="mr-1" /> Apply Leave</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LegendCard
          title="Comp-off"
          centerLabel="Available"
          centerValue={compOffStats.available}
          segments={[
            { value: compOffStats.consumed, color: "hsl(217 91% 60%)" },
            { value: compOffStats.available, color: "hsl(142 71% 45%)" },
            { value: compOffStats.expired, color: "hsl(0 72% 51%)" },
          ]}
          legends={[
            { label: "Approved", value: compOffStats.approved, color: "hsl(199 89% 48%)" },
            { label: "Consumed", value: compOffStats.consumed, color: "hsl(217 91% 60%)" },
            { label: "Available", value: compOffStats.available, color: "hsl(142 71% 45%)" },
            { label: "Expired", value: compOffStats.expired, color: "hsl(0 72% 51%)" },
          ]}
        />
        <LegendCard
          title="LOP"
          centerLabel="Consumed"
          centerValue={lopConsumed}
          segments={[{ value: lopConsumed, color: "hsl(0 72% 51%)" }]}
          legends={[
            { label: "Annual quota", value: 0, color: "hsl(199 89% 48%)" },
            { label: "Accrued", value: 0, color: "hsl(217 91% 60%)" },
            { label: "Available", value: 0, color: "hsl(142 71% 45%)" },
            { label: "Consumed", value: lopConsumed, color: "hsl(0 72% 51%)" },
            { label: "Customized", value: 0, color: "hsl(38 92% 50%)" },
            { label: "From last year", value: 0, color: "hsl(262 83% 58%)" },
            { label: "To next year", value: 0, color: "hsl(330 81% 60%)" },
            { label: "Encashed", value: 0, color: "hsl(173 80% 40%)" },
          ]}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead>ID</TableHead><TableHead>Type</TableHead>
              <TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Days</TableHead>
              <TableHead>Reason</TableHead><TableHead>Reporting</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.employees?.first_name} {l.employees?.last_name}</TableCell>
                  <TableCell>{l.employees?.employee_code || "—"}</TableCell>
                  <TableCell>{l.leave_type}</TableCell>
                  <TableCell>{l.start_date}</TableCell>
                  <TableCell>{l.end_date}</TableCell>
                  <TableCell>{l.days}</TableCell>
                  <TableCell className="max-w-xs truncate">{l.reason || "—"}</TableCell>
                  <TableCell>{l.reporting_person || "—"}</TableCell>
                  <TableCell><Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status}</Badge></TableCell>
                  <TableCell>
                    {l.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleApprove(l.id, "approved")}>✓</Button>
                        <Button size="sm" variant="outline" onClick={() => handleApprove(l.id, "rejected")}>✗</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No leave records</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Apply Leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              {currentEmployee && !isAdmin ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/50">
                  <span className="font-medium">{currentEmployee.first_name} {currentEmployee.last_name} ({currentEmployee.employee_code || "—"})</span>
                  <Badge variant="outline">Me</Badge>
                </div>
              ) : (
                <>
                  <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={isAdmin ? "Select employee — defaults to you" : "Select employee"} />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code || "—"})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground mt-1">Apply on behalf of employee (Optional). Defaults to your own profile.</p>
                  )}
                  {!isAdmin && selectedEmp && (
                    <p className="text-xs text-muted-foreground mt-1">ID: {selectedEmp.employee_code} • Name: {selectedEmp.first_name} {selectedEmp.last_name}</p>
                  )}
                </>
              )}
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={v => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration Type</Label>
              <Select value={form.duration_type} onValueChange={v => setForm({ ...form, duration_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">Full Day</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Reason for Leave</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <div>
              <Label>Reporting Person</Label>
              <Input value="Admin" readOnly disabled />
              <p className="text-xs text-muted-foreground mt-1">All leave requests are routed to Admin for approval.</p>
            </div>
            <Button onClick={handleApply} className="w-full">Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
