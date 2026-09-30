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
import { Plus, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const AREAS = [
  "Waiting Room", "Reception", "Operatory 1", "Operatory 2", "Sterilization Area",
  "Restroom", "Pharmacy", "Lab Room", "Staff Room", "Corridor", "Exterior",
];

const ISSUE_TYPES = [
  { value: "cleanliness", label: "Cleanliness" },
  { value: "waste_disposal", label: "Waste Disposal" },
  { value: "odor", label: "Odor" },
  { value: "equipment_damage", label: "Equipment Damage" },
  { value: "restocking", label: "Restocking" },
  { value: "pest_control", label: "Pest Control" },
  { value: "linen_uniform", label: "Linen / Uniform" },
  { value: "water_plumbing", label: "Water / Plumbing" },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  under_review: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  escalated: "bg-purple-100 text-purple-700",
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--accent))", "#f59e0b"];

const HouseKeepingQuality = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    area: "", reported_by: "", issue_type: "cleanliness",
    issue_description: "", severity: "medium", action_taken: "",
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["housekeeping-quality-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("housekeeping_quality_logs")
        .select("*")
        .order("reported_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("housekeeping_quality_logs").insert({
        area: form.area,
        reported_by: form.reported_by,
        issue_type: form.issue_type,
        issue_description: form.issue_description,
        severity: form.severity,
        action_taken: form.action_taken || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-quality-logs"] });
      toast({ title: "Housekeeping log added" });
      setOpen(false);
      setForm({ area: "", reported_by: "", issue_type: "cleanliness", issue_description: "", severity: "medium", action_taken: "" });
    },
    onError: (e: any) => toast({ title: "Could not save log", description: e.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("housekeeping_quality_logs")
        .update({ status, resolved_date: status === "resolved" ? new Date().toISOString().slice(0, 10) : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["housekeeping-quality-logs"] }),
  });

  // Analytics
  const areaIssues = logs.reduce((acc: Record<string, number>, l: any) => {
    acc[l.area] = (acc[l.area] || 0) + 1;
    return acc;
  }, {});
  const areaChart = Object.entries(areaIssues).map(([name, count]) => ({ name, count }));

  const issueTypeCount = logs.reduce((acc: Record<string, number>, l: any) => {
    const label = ISSUE_TYPES.find(i => i.value === l.issue_type)?.label || l.issue_type;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(issueTypeCount).map(([name, value]) => ({ name, value }));

  const openCount = logs.filter((l: any) => l.status === "open").length;
  const resolvedCount = logs.filter((l: any) => l.status === "resolved").length;
  const criticalCount = logs.filter((l: any) => l.severity === "critical" || l.severity === "high").length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div><p className="text-2xl font-bold">{openCount}</p><p className="text-xs text-muted-foreground">Open Issues</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
          <div><p className="text-2xl font-bold">{resolvedCount}</p><p className="text-xs text-muted-foreground">Resolved</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Clock className="h-8 w-8 text-orange-500" />
          <div><p className="text-2xl font-bold">{criticalCount}</p><p className="text-xs text-muted-foreground">High/Critical</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{logs.length}</p><p className="text-xs text-muted-foreground">Total Logs</p></div>
        </CardContent></Card>
      </div>

      {/* Charts */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Issues by Area / Zone</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaChart}><XAxis dataKey="name" fontSize={12} /><YAxis /><Tooltip /><Bar dataKey="count" fill="hsl(var(--primary))" radius={[4,4,0,0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Issue Types</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add + Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">House Keeping Quality Logs</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Log Issue</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log House Keeping Issue</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={AREAS.includes(form.area) ? form.area : ""} onValueChange={v => setForm(p => ({ ...p, area: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Area / Zone *" /></SelectTrigger>
                  <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Or type another area / zone" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} />
                <Input placeholder="Reported By *" value={form.reported_by} onChange={e => setForm(p => ({ ...p, reported_by: e.target.value }))} />
                <Select value={form.issue_type} onValueChange={v => setForm(p => ({ ...p, issue_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ISSUE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Issue Description *" value={form.issue_description} onChange={e => setForm(p => ({ ...p, issue_description: e.target.value }))} />
                <Textarea placeholder="Action Taken" value={form.action_taken} onChange={e => setForm(p => ({ ...p, action_taken: e.target.value }))} />
                <Button className="w-full" disabled={!form.area || !form.reported_by || !form.issue_description || addMutation.isPending} onClick={() => addMutation.mutate()}>Save Log</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Area / Zone</TableHead><TableHead>Reported By</TableHead>
              <TableHead>Issue Type</TableHead><TableHead>Severity</TableHead>
              <TableHead>Status</TableHead><TableHead>Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No housekeeping logs yet</TableCell></TableRow>
              ) : logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{format(new Date(log.reported_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{log.area}</TableCell>
                  <TableCell>{log.reported_by}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{ISSUE_TYPES.find(i => i.value === log.issue_type)?.label || log.issue_type}</Badge></TableCell>
                  <TableCell><Badge className={`text-xs ${SEVERITY_COLORS[log.severity]}`}>{log.severity}</Badge></TableCell>
                  <TableCell><Badge className={`text-xs ${STATUS_COLORS[log.status]}`}>{log.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell>
                    <Select value={log.status} onValueChange={v => updateStatus.mutate({ id: log.id, status: v })}>
                      <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="under_review">Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="escalated">Escalated</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default HouseKeepingQuality;
