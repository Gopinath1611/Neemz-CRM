import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sliders } from "lucide-react";
import { toast } from "sonner";

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Comp Off", "LOP", "Maternity", "Paternity"] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];
const currentYear = new Date().getFullYear();

interface EmployeeRow {
  id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string | null;
  department: string | null;
}

interface BalanceRow {
  id: string;
  employee_id: string;
  leave_type: string;
  allocated: number;
  year: number;
}

export default function CustomizationBalance() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [usedMap, setUsedMap] = useState<Record<string, number>>({});
  const [year, setYear] = useState(currentYear);
  const [filter, setFilter] = useState("");

  const fetchAll = useCallback(async () => {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const [{ data: emps }, { data: bals }, { data: reqs }, { data: logs }] = await Promise.all([
      supabase.from("employees").select("id, employee_code, first_name, last_name, department").eq("status", "active").order("first_name"),
      supabase.from("leave_balances").select("id, employee_id, leave_type, allocated, year").eq("year", year),
      supabase.from("leave_requests").select("employee_id, leave_type, days, start_date, end_date")
        .eq("status", "approved").lte("start_date", to).gte("end_date", from),
      supabase.from("attendance_logs").select("employee_id, date, status")
        .in("status", ["absent", "Absent"]).gte("date", from).lte("date", to),
    ]);
    setEmployees((emps as EmployeeRow[]) || []);
    setBalances((bals as BalanceRow[]) || []);

    const map: Record<string, number> = {};
    const covered = new Set<string>();
    (reqs || []).forEach((r) => {
      const key = `${r.employee_id}|${r.leave_type}`;
      map[key] = (map[key] || 0) + (Number(r.days) || 0);
      const end = new Date(r.end_date || r.start_date);
      for (const d = new Date(r.start_date); d <= end; d.setDate(d.getDate() + 1)) {
        covered.add(`${r.employee_id}|${d.toISOString().slice(0, 10)}`);
      }
    });
    (logs || []).forEach((l) => {
      if (covered.has(`${l.employee_id}|${l.date}`)) return;
      const key = `${l.employee_id}|LOP`;
      map[key] = (map[key] || 0) + 1;
    });
    setUsedMap(map);
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel("customization-balance-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const balanceIndex = useMemo(() => {
    const idx: Record<string, BalanceRow> = {};
    balances.forEach(b => { idx[`${b.employee_id}|${b.leave_type}`] = b; });
    return idx;
  }, [balances]);

  const getAllocated = (empId: string, type: LeaveType) => Number(balanceIndex[`${empId}|${type}`]?.allocated ?? 0);
  const getUsed = (empId: string, type: LeaveType) => usedMap[`${empId}|${type}`] || 0;

  const setAlloc = async (empId: string, type: LeaveType, allocated: number) => {
    const { error } = await supabase
      .from("leave_balances")
      .upsert({ employee_id: empId, year, leave_type: type, allocated }, { onConflict: "employee_id,year,leave_type" });
    if (error) { toast.error(error.message); return; }
    toast.success("Annual quota saved");
    fetchAll();
  };

  const filtered = employees.filter(e => {
    const n = `${e.first_name} ${e.last_name || ""}`.toLowerCase();
    const q = filter.toLowerCase();
    return !filter || n.includes(q) || (e.employee_code || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sliders className="h-7 w-7 text-primary" /> Customization Balance</h1>
          <p className="text-muted-foreground mt-1">Annual quota per employee per leave type — drives available balance in My Team Leaves</p>
        </div>
        <div className="flex gap-2 items-center">
          <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter name/ID" className="w-48" />
          <Label>Year</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || currentYear)} className="w-24" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead>ID</TableHead><TableHead>Dept</TableHead>
              {LEAVE_TYPES.map(t => <TableHead key={t} className="text-center">{t}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                  <TableCell>{e.employee_code || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{e.department}</Badge></TableCell>
                  {LEAVE_TYPES.map(t => {
                    const allocated = getAllocated(e.id, t);
                    const used = getUsed(e.id, t);
                    return (
                      <TableCell key={t} className="text-center">
                        <Input
                          type="number" min={0} step="0.5"
                          key={`${e.id}|${t}|${year}|${allocated}`}
                          defaultValue={allocated}
                          onBlur={ev => { const v = parseFloat(ev.target.value) || 0; if (v !== allocated) setAlloc(e.id, t, v); }}
                          className="w-20 h-8 mx-auto"
                        />
                        <span className="text-xs text-muted-foreground block mt-1">
                          used {used} · left {Math.max(0, allocated - used)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
