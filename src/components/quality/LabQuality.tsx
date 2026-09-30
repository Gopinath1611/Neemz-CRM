import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, AlertTriangle, RefreshCw, Factory } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const LAB_ISSUE_TYPES = [
  { value: "fit_issue", label: "Fit Issue" },
  { value: "shade_mismatch", label: "Shade Mismatch" },
  { value: "chipping", label: "Chipping" },
  { value: "breakage", label: "Breakage" },
  { value: "delayed", label: "Delayed Delivery" },
  { value: "wrong_design", label: "Wrong Design" },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const LabQuality = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lab_name: "", patient_name: "", work_type: "crown", material: "",
    issue_type: "fit_issue", issue_description: "", severity: "medium",
    is_repeat: false, repeat_count: "1", action_taken: "", notes: "",
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["lab-quality-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_quality_logs").select("*").order("reported_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lab_quality_logs").insert({
        lab_name: form.lab_name,
        patient_name: form.patient_name,
        work_type: form.work_type,
        material: form.material || null,
        issue_type: form.issue_type,
        issue_description: form.issue_description,
        severity: form.severity,
        is_repeat: form.is_repeat,
        repeat_count: Number(form.repeat_count),
        action_taken: form.action_taken || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lab-quality-logs"] });
      toast({ title: "Lab quality log added" });
      setOpen(false);
      setForm({ lab_name: "", patient_name: "", work_type: "crown", material: "", issue_type: "fit_issue", issue_description: "", severity: "medium", is_repeat: false, repeat_count: "1", action_taken: "", notes: "" });
    },
  });

  // Lab repeat analysis - highlight problematic labs
  const labStats = logs.reduce((acc: Record<string, { total: number; repeats: number }>, l: any) => {
    if (!acc[l.lab_name]) acc[l.lab_name] = { total: 0, repeats: 0 };
    acc[l.lab_name].total += 1;
    if (l.is_repeat) acc[l.lab_name].repeats += Number(l.repeat_count || 1);
    return acc;
  }, {});

  const labChart = Object.entries(labStats)
    .map(([name, s]) => ({ name, issues: s.total, repeats: s.repeats }))
    .sort((a, b) => b.issues - a.issues);

  const problemLabs = labChart.filter(l => l.repeats >= 3);
  const totalRepeats = logs.filter((l: any) => l.is_repeat).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Factory className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{Object.keys(labStats).length}</p><p className="text-xs text-muted-foreground">Labs Tracked</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div><p className="text-2xl font-bold">{logs.length}</p><p className="text-xs text-muted-foreground">Total Issues</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <RefreshCw className="h-8 w-8 text-orange-500" />
          <div><p className="text-2xl font-bold">{totalRepeats}</p><p className="text-xs text-muted-foreground">Repeat Cases</p></div>
        </CardContent></Card>
        <Card className={problemLabs.length > 0 ? "border-destructive" : ""}>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-destructive">{problemLabs.length}</p>
            <p className="text-xs text-muted-foreground">⚠️ Problem Labs (3+ repeats)</p>
            {problemLabs.map(l => <Badge key={l.name} variant="destructive" className="mr-1 mt-1 text-xs">{l.name}</Badge>)}
          </CardContent>
        </Card>
      </div>

      {/* Lab Issues Chart */}
      {labChart.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Issues & Repeats by Lab</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={labChart}>
                <XAxis dataKey="name" fontSize={12} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="issues" fill="hsl(var(--primary))" name="Total Issues" radius={[4,4,0,0]} />
                <Bar dataKey="repeats" fill="hsl(var(--destructive))" name="Repeats" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lab Quality Logs</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Log Issue</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log Lab Quality Issue</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Lab Name *" value={form.lab_name} onChange={e => setForm(p => ({ ...p, lab_name: e.target.value }))} />
                <Input placeholder="Patient Name *" value={form.patient_name} onChange={e => setForm(p => ({ ...p, patient_name: e.target.value }))} />
                <Input placeholder="Work Type (crown, bridge...)" value={form.work_type} onChange={e => setForm(p => ({ ...p, work_type: e.target.value }))} />
                <Input placeholder="Material" value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} />
                <Select value={form.issue_type} onValueChange={v => setForm(p => ({ ...p, issue_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LAB_ISSUE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.is_repeat} onChange={e => setForm(p => ({ ...p, is_repeat: e.target.checked }))} className="rounded" />
                    This is a repeat case
                  </label>
                  {form.is_repeat && <Input placeholder="Repeat #" type="number" className="w-24" value={form.repeat_count} onChange={e => setForm(p => ({ ...p, repeat_count: e.target.value }))} />}
                </div>
                <Textarea placeholder="Issue Description *" value={form.issue_description} onChange={e => setForm(p => ({ ...p, issue_description: e.target.value }))} />
                <Textarea placeholder="Action Taken" value={form.action_taken} onChange={e => setForm(p => ({ ...p, action_taken: e.target.value }))} />
                <Button className="w-full" disabled={!form.lab_name || !form.patient_name || !form.issue_description} onClick={() => addMutation.mutate()}>Save Log</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Lab</TableHead><TableHead>Patient</TableHead>
              <TableHead>Work</TableHead><TableHead>Issue</TableHead><TableHead>Repeat</TableHead>
              <TableHead>Severity</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No lab quality logs yet</TableCell></TableRow>
              ) : logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{format(new Date(log.reported_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{log.lab_name}</TableCell>
                  <TableCell>{log.patient_name}</TableCell>
                  <TableCell>{log.work_type}{log.material ? ` (${log.material})` : ""}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{LAB_ISSUE_TYPES.find(i => i.value === log.issue_type)?.label}</Badge></TableCell>
                  <TableCell>{log.is_repeat ? <Badge variant="destructive" className="text-xs">×{log.repeat_count}</Badge> : "—"}</TableCell>
                  <TableCell><Badge className={`text-xs ${SEVERITY_COLORS[log.severity]}`}>{log.severity}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{log.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LabQuality;
