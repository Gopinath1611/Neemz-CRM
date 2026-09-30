import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Download, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";
import { applyLeaveDecision } from "@/lib/hrmsSync";

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Comp Off", "LOP"];

interface LeaveRequestRow {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string | null;
  days: number | null;
  reason: string | null;
  status: string;
  duration_type: string | null;
  reporting_person: string | null;
  employees?: { employee_code: string | null; first_name: string | null; last_name: string | null } | null;
}

export default function MyTeamLeaves() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [usedMap, setUsedMap] = useState<Record<string, number>>({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [reqStatus, setReqStatus] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, [year]);

  // Instant refresh when quotas change, leaves are applied/approved, or attendance is edited
  useEffect(() => {
    const channel = supabase
      .channel("team-leaves-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_balances" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [year]);



  const fetchAll = async () => {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const [{ data: emps }, { data: bals }, { data: reqs }, { data: logs }, { data: allReqs }] = await Promise.all([
      supabase.from("employees").select("id, employee_code, first_name, last_name, department").eq("status", "active").order("first_name"),
      supabase.from("leave_balances").select("*").eq("year", year),
      supabase.from("leave_requests").select("employee_id, leave_type, days, start_date, end_date")
        .eq("status", "approved").lte("start_date", to).gte("end_date", from),
      supabase.from("attendance_logs").select("employee_id, date, status")
        .in("status", ["absent", "Absent"]).gte("date", from).lte("date", to),
      supabase.from("leave_requests")
        .select("id, employee_id, leave_type, start_date, end_date, days, reason, status, duration_type, reporting_person, employees(employee_code, first_name, last_name)")
        .eq("year", year).order("created_at", { ascending: false }),
    ]);
    setRequests((allReqs as any) || []);

    setEmployees(emps || []);
    setBalances(bals || []);

    const map: Record<string, number> = {};
    // Dates already covered by an approved leave request (any type) — never double-count as LOP
    const covered = new Set<string>();
    (reqs || []).forEach((r: any) => {
      const key = `${r.employee_id}|${r.leave_type}`;
      map[key] = (map[key] || 0) + (Number(r.days) || 0);
      const start = new Date(r.start_date), end = new Date(r.end_date || r.start_date);
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        covered.add(`${r.employee_id}|${d.toISOString().slice(0, 10)}`);
      }
    });

    // Unexcused absent attendance days register as LOP
    (logs || []).forEach((l: any) => {
      if (covered.has(`${l.employee_id}|${l.date}`)) return;
      const key = `${l.employee_id}|LOP`;
      map[key] = (map[key] || 0) + 1;
    });

    setUsedMap(map);
  };

  const getBalance = (empId: string, type: string) => balances.find(b => b.employee_id === empId && b.leave_type === type);
  const getUsed = (empId: string, type: string) => usedMap[`${empId}|${type}`] || 0;

  const updateBalance = async (empId: string, type: string, allocated: number) => {
    const { error } = await supabase
      .from("leave_balances")
      .upsert({ employee_id: empId, year, leave_type: type, allocated }, { onConflict: "employee_id,year,leave_type" });
    if (error) { toast.error(error.message); return; }
    toast.success("Quota updated");
    fetchAll();
  };


  const resetAll = async () => {
    if (!confirm("Reset all balances for " + year + "?")) return;
    await supabase.from("leave_balances").delete().eq("year", year);
    toast.success("Reset complete");
    fetchAll();
  };

  const exportCSV = () => {
    const rows = [["Employee", "ID", "Department", ...LEAVE_TYPES]];
    employees.forEach(e => {
      rows.push([
        `${e.first_name} ${e.last_name}`, e.employee_code || "", e.department || "",
        ...LEAVE_TYPES.map(t => String(getBalance(e.id, t)?.allocated || 0))
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `team-leaves-${year}.csv`; a.click();
  };

  const filtered = employees.filter(e => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase();
    return !filter || name.includes(filter.toLowerCase()) || (e.employee_code || "").toLowerCase().includes(filter.toLowerCase());
  });

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await applyLeaveDecision(id, status);
      toast.success(`Leave ${status}`);
      await fetchAll();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update request");
    } finally {
      setBusyId(null);
    }
  };

  const q = filter.trim().toLowerCase();
  const visibleRequests = requests.filter(r => {
    if (reqStatus !== "all" && (r.status || "").toLowerCase() !== reqStatus) return false;
    if (filterType !== "all" && r.leave_type !== filterType) return false;
    if (!q) return true;
    const name = `${r.employees?.first_name || ""} ${r.employees?.last_name || ""}`.toLowerCase();
    return name.includes(q) || (r.employees?.employee_code || "").toLowerCase().includes(q);
  });
  const pendingCount = requests.filter(r => (r.status || "").toLowerCase() === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-7 w-7 text-primary" /> My Team Leaves</h1>
          <p className="text-muted-foreground mt-1">Comp Off, LOP and balances per employee</p>
        </div>
        <div className="flex gap-2 items-center">
          <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter name/ID" className="w-48" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-24" />
          <Button variant="outline" onClick={resetAll}><RotateCcw size={16} className="mr-1" /> Reset</Button>
          <Button variant="outline" onClick={exportCSV}><Download size={16} className="mr-1" /> Export</Button>
        </div>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals{pendingCount > 0 && <Badge className="ml-2">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Employee</TableHead><TableHead>ID</TableHead><TableHead>Dept</TableHead>
                  {LEAVE_TYPES.filter(t => filterType === "all" || filterType === t).map(t => <TableHead key={t}>{t}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                      <TableCell>{e.employee_code || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{e.department}</Badge></TableCell>
                      {LEAVE_TYPES.filter(t => filterType === "all" || filterType === t).map(t => {
                        const allocated = Number(getBalance(e.id, t)?.allocated || 0);
                        const used = getUsed(e.id, t);
                        return (
                          <TableCell key={t}>
                            <Input type="number" min={0} step="0.5"
                              key={`${e.id}|${t}|${year}|${allocated}`}
                              defaultValue={allocated}
                              onBlur={ev => { const v = parseFloat(ev.target.value) || 0; if (v !== allocated) updateBalance(e.id, t, v); }}
                              className="w-20 h-8" />
                            <span className="text-xs text-muted-foreground block">used: {used} · left: {Math.max(0, allocated - used)}</span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Select value={reqStatus} onValueChange={setReqStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All Requests</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{visibleRequests.length} request(s)</span>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Employee</TableHead><TableHead>ID</TableHead><TableHead>Type</TableHead>
                  <TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {visibleRequests.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employees?.first_name} {r.employees?.last_name}</TableCell>
                      <TableCell>{r.employees?.employee_code || "—"}</TableCell>
                      <TableCell>{r.leave_type}{r.duration_type === "half_day" && <span className="text-xs text-muted-foreground"> (half)</span>}</TableCell>
                      <TableCell>{r.start_date}</TableCell>
                      <TableCell>{r.end_date || r.start_date}</TableCell>
                      <TableCell>{r.days ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.reason || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(r.status || "").toLowerCase() === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r.id, "approved")}>
                              <Check size={14} className="mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r.id, "rejected")}>
                              <X size={14} className="mr-1" /> Reject
                            </Button>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleRequests.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

}
