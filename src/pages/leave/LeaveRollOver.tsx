import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCw, Plus } from "lucide-react";
import { toast } from "sonner";

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Comp Off"];
const currentYear = new Date().getFullYear();

export default function LeaveRollOver() {
  const { user, hasRole } = useAuth();
  const [tab, setTab] = useState<"my" | "team">("my");
  const [employees, setEmployees] = useState<any[]>([]);
  const [rollovers, setRollovers] = useState<any[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [teamEmployeeIds, setTeamEmployeeIds] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const [fromYear, setFromYear] = useState(currentYear - 1);
  const [toYear, setToYear] = useState(currentYear);
  const [form, setForm] = useState({
    employee_id: "", leave_type: "Casual Leave",
    remaining_unused: 0, carry_forward: 0, enhancement: 0, encashment: 0, notes: "",
  });

  useEffect(() => { fetchAll(); }, [fromYear, toYear]);
  useEffect(() => { fetchScope(); }, [user?.id]);

  const fetchAll = async () => {
    const [{ data: emps }, { data: rs }] = await Promise.all([
      supabase.from("employees").select("id, employee_code, first_name, last_name").eq("status", "active"),
      supabase.from("leave_rollovers").select("*, employees(employee_code, first_name, last_name)").eq("from_year", fromYear).eq("to_year", toYear),
    ]);
    setEmployees(emps || []);
    setRollovers(rs || []);
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

  const myRows = rollovers.filter(r => r.employee_id === myEmployeeId);
  const teamRows = rollovers.filter(r => teamEmployeeIds.includes(r.employee_id));

  const formEmployees = tab === "my"
    ? employees.filter(e => e.id === myEmployeeId)
    : employees.filter(e => teamEmployeeIds.includes(e.id));

  const openApply = () => {
    setForm({ ...form, employee_id: tab === "my" ? (myEmployeeId ?? "") : "" });
    setShow(true);
  };

  const save = async () => {
    if (!form.employee_id) { toast.error("Select employee"); return; }
    const { error } = await supabase.from("leave_rollovers").insert({ ...form, from_year: fromYear, to_year: toYear });
    if (error) { toast.error(error.message); return; }
    toast.success("Rollover added");
    setShow(false);
    fetchAll();
  };

  const renderTable = (rows: any[], emptyMsg: string) => (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>ID</TableHead><TableHead>Leave Type</TableHead>
            <TableHead>Remaining Unused</TableHead><TableHead>Carry Forward</TableHead>
            <TableHead>Enhancement</TableHead><TableHead>Encashment</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.employees?.first_name} {r.employees?.last_name}</TableCell>
                <TableCell>{r.employees?.employee_code || "—"}</TableCell>
                <TableCell>{r.leave_type}</TableCell>
                <TableCell>{r.remaining_unused}</TableCell>
                <TableCell>{r.carry_forward}</TableCell>
                <TableCell>{r.enhancement}</TableCell>
                <TableCell>{r.encashment}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{emptyMsg}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RotateCw className="h-7 w-7 text-primary" /> Leave Roll Over</h1>
          <p className="text-muted-foreground mt-1">Carry forward unused leaves between years</p>
        </div>
        <div className="flex gap-2 items-center">
          <Label>From</Label><Input type="number" value={fromYear} onChange={e => setFromYear(parseInt(e.target.value))} className="w-24" />
          <Label>To</Label><Input type="number" value={toYear} onChange={e => setToYear(parseInt(e.target.value))} className="w-24" />
          <Button onClick={openApply} disabled={tab === "my" && !myEmployeeId}><Plus size={16} className="mr-1" /> Apply</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as "my" | "team")}>
        <TabsList>
          <TabsTrigger value="my">My Request</TabsTrigger>
          <TabsTrigger value="team">My Team Request</TabsTrigger>
        </TabsList>
        <TabsContent value="my" className="mt-4">
          {renderTable(myRows, `No rollovers for you (${fromYear} → ${toYear})`)}
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          {renderTable(teamRows, `No team rollovers for ${fromYear} → ${toYear}`)}
        </TabsContent>
      </Tabs>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Apply Roll Over ({fromYear} → {toYear})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })} disabled={tab === "my"}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{formEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code || "—"})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={v => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Remaining Unused</Label><Input type="number" value={form.remaining_unused} onChange={e => setForm({ ...form, remaining_unused: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Carry Forward</Label><Input type="number" value={form.carry_forward} onChange={e => setForm({ ...form, carry_forward: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Enhancement</Label><Input type="number" value={form.enhancement} onChange={e => setForm({ ...form, enhancement: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Encashment</Label><Input type="number" value={form.encashment} onChange={e => setForm({ ...form, encashment: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <Button onClick={save} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
