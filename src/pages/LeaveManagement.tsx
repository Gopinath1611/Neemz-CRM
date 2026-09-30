import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarOff, Plus, Search, CheckCircle, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { applyLeaveDecision } from "@/lib/hrmsSync";
import { useAuth } from "@/contexts/AuthContext";

const LeaveManagement = () => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [form, setForm] = useState({
    employee_id: "", leave_type: "casual", start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"), days: "1", reason: "", duration_type: "full_day",
  });

  useEffect(() => { fetchEmployees(); fetchLeaves(); }, []);
  useEffect(() => { if (user) fetchCurrentEmployee(); }, [user]);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code").eq("status", "active").order("first_name");
    if (data) setEmployees(data);
  };

  const fetchCurrentEmployee = async () => {
    const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code, user_id").eq("user_id", user!.id).maybeSingle();
    if (data) {
      setCurrentEmployee(data);
      setForm(f => ({ ...f, employee_id: f.employee_id || data.id }));
    }
  };

  const fetchLeaves = async () => {
    const { data } = await supabase.from("leave_requests").select("*, employees(first_name, last_name, employee_code, department)").order("created_at", { ascending: false });
    if (data) setLeaves(data);
  };

  const handleSubmit = async () => {
    if (!form.employee_id) { toast.error("Select employee"); return; }
    const { error } = await supabase.from("leave_requests").insert({
      employee_id: form.employee_id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      days: form.duration_type === "half_day" ? 0.5 : parseFloat(form.days) || 1,
      duration_type: form.duration_type,
      reason: form.reason || null,
      reporting_person: "Admin",
      status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Leave request submitted");
    setShowAdd(false);
    setForm({ employee_id: "", leave_type: "casual", start_date: format(new Date(), "yyyy-MM-dd"), end_date: format(new Date(), "yyyy-MM-dd"), days: "1", reason: "", duration_type: "full_day" });
    fetchLeaves();
  };

  const updateStatus = async (id: string, status: string) => {
    // Single source of truth: also syncs attendance + recomputes leave balances
    await applyLeaveDecision(id, status);
    toast.success(`Leave ${status}`);
    fetchLeaves();
  };

  const filtered = leaves.filter((l) => statusFilter === "all" || l.status === statusFilter);

  const statusColors: Record<string, string> = { pending: "secondary", approved: "default", rejected: "destructive" };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarOff className="h-7 w-7 text-primary" /> Leave Management
          </h1>
          <p className="text-muted-foreground mt-1">Track and approve employee leave requests</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus size={16} className="mr-1" /> Apply Leave</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{leaves.filter((l) => l.status === "pending").length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Approved</p>
          <p className="text-2xl font-bold text-green-600">{leaves.filter((l) => l.status === "approved").length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Rejected</p>
          <p className="text-2xl font-bold text-destructive">{leaves.filter((l) => l.status === "rejected").length}</p>
        </CardContent></Card>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.employees?.first_name} {l.employees?.last_name}</TableCell>
                  <TableCell className="capitalize">{l.leave_type}</TableCell>
                  <TableCell>{format(new Date(l.start_date), "dd MMM")}</TableCell>
                  <TableCell>{format(new Date(l.end_date), "dd MMM")}</TableCell>
                  <TableCell>{l.days}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{l.reason || "—"}</TableCell>
                  <TableCell><Badge variant={statusColors[l.status] as any} className="capitalize">{l.status}</Badge></TableCell>
                  <TableCell>
                    {l.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => updateStatus(l.id, "approved")}><CheckCircle size={14} /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => updateStatus(l.id, "rejected")}><XCircle size={14} /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Leave</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>{isAdmin ? "Apply on behalf of employee (Optional)" : "Employee *"}</Label>
              {currentEmployee && !isAdmin ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/50">
                  <span className="font-medium">{currentEmployee.first_name} {currentEmployee.last_name} ({currentEmployee.employee_code || "—"})</span>
                  <Badge variant="outline">Me</Badge>
                </div>
              ) : (
                <>
                  <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder={isAdmin ? "Select employee — defaults to you" : "Select employee"} /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code || "—"})</SelectItem>)}</SelectContent>
                  </Select>
                  {isAdmin && <p className="text-xs text-muted-foreground mt-1">Apply on behalf of employee (Optional). Defaults to your own profile.</p>}
                </>
              )}
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual Leave</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="earned">Earned Leave</SelectItem>
                  <SelectItem value="maternity">Maternity Leave</SelectItem>
                  <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration Type</Label>
              <Select value={form.duration_type} onValueChange={(v) => setForm({ ...form, duration_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">Full Day</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>From</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>To</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><Label>Days</Label><Input type="number" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></div>
            </div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} /></div>
            <Button onClick={handleSubmit} className="w-full">Submit Leave Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveManagement;
