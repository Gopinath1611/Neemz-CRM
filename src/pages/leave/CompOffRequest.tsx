import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Gift, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { applyCompOffDecision } from "@/lib/hrmsSync";

const currentYear = new Date().getFullYear();

export default function CompOffRequest() {
  const { user, hasRole } = useAuth();
  const [tab, setTab] = useState<"my" | "team">("my");
  const [employees, setEmployees] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [teamEmployeeIds, setTeamEmployeeIds] = useState<string[]>([]);
  const [year, setYear] = useState(currentYear);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", working_date: format(new Date(), "yyyy-MM-dd"),
    duration_type: "full_day", expiry_date: "", reason: "",
  });

  useEffect(() => { fetchAll(); }, [year]);
  useEffect(() => { fetchScope(); }, [user?.id]);

  const fetchAll = async () => {
    const [{ data: emps }, { data: rs }] = await Promise.all([
      supabase.from("employees").select("id, employee_code, first_name, last_name").eq("status", "active"),
      supabase.from("comp_off_requests").select("*, employees(employee_code, first_name, last_name)").eq("year", year).order("created_at", { ascending: false }),
    ]);
    setEmployees(emps || []);
    setRequests(rs || []);
  };

  // Resolve the logged-in user's employee record and their reporting team
  const fetchScope = async () => {
    if (!user?.id) return;
    const { data: me } = await supabase
      .from("employees").select("id").eq("user_id", user.id).maybeSingle();
    setMyEmployeeId(me?.id ?? null);

    if (hasRole("admin") || hasRole("hr")) {
      // Admin/HR see everyone as their "team"
      const { data: all } = await supabase.from("employees").select("id").eq("status", "active");
      setTeamEmployeeIds((all || []).map(e => e.id).filter(id => id !== me?.id));
      return;
    }
    const { data: rels } = await supabase
      .from("user_reports_to").select("user_id").eq("manager_user_id", user.id);
    const uids = (rels || []).map(r => r.user_id);
    if (uids.length === 0) { setTeamEmployeeIds([]); return; }
    const { data: memps } = await supabase.from("employees").select("id").in("user_id", uids);
    setTeamEmployeeIds((memps || []).map(e => e.id).filter(id => id !== me?.id));
  };

  const myRows = requests.filter(r => r.employee_id === myEmployeeId);
  const teamRows = requests.filter(r => teamEmployeeIds.includes(r.employee_id));

  const formEmployees = tab === "my"
    ? employees.filter(e => e.id === myEmployeeId)
    : employees.filter(e => teamEmployeeIds.includes(e.id));

  const openApply = () => {
    setForm({ ...form, employee_id: tab === "my" ? (myEmployeeId ?? "") : "" });
    setShow(true);
  };

  const save = async () => {
    if (!form.employee_id) { toast.error("Select employee"); return; }
    const { error } = await supabase.from("comp_off_requests").insert({
      ...form, year, expiry_date: form.expiry_date || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Comp Off requested");
    setShow(false);
    fetchAll();
  };

  const updateStatus = async (id: string, status: string) => {
    await applyCompOffDecision(id, status);
    toast.success(status);
    fetchAll();
  };

  const renderTable = (rows: any[], emptyMsg: string, showActions: boolean) => (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>ID</TableHead><TableHead>Working Date</TableHead>
            <TableHead>Duration</TableHead><TableHead>Expiry</TableHead><TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>{showActions && <TableHead></TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.employees?.first_name} {r.employees?.last_name}</TableCell>
                <TableCell>{r.employees?.employee_code || "—"}</TableCell>
                <TableCell>{r.working_date}</TableCell>
                <TableCell>{r.duration_type}</TableCell>
                <TableCell>{r.expiry_date || "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.reason || "—"}</TableCell>
                <TableCell><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                {showActions && (
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "approved")}>✓</Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "rejected")}>✗</Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={showActions ? 8 : 7} className="text-center py-8 text-muted-foreground">{emptyMsg}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-7 w-7 text-primary" /> Comp Off Request</h1>
          <p className="text-muted-foreground mt-1">Compensatory off for working days</p>
        </div>
        <div className="flex gap-2 items-center">
          <Label>Year</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-24" />
          <Button onClick={openApply}><Plus size={16} className="mr-1" /> Apply</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as "my" | "team")}>
        <TabsList>
          <TabsTrigger value="my">My Request</TabsTrigger>
          <TabsTrigger value="team">My Team Request</TabsTrigger>
        </TabsList>
        <TabsContent value="my" className="mt-4">
          {renderTable(myRows, "No comp off requests", false)}
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          {renderTable(teamRows, "No team comp off requests", true)}
        </TabsContent>
      </Tabs>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Comp Off ({year})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{formEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code || "—"})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Working Date</Label><Input type="date" value={form.working_date} onChange={e => setForm({ ...form, working_date: e.target.value })} /></div>
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
            <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} /></div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <Button onClick={save} className="w-full">Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
