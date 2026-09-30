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
import { Plus, Pill, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const REACTION_TYPES = [
  { value: "allergy", label: "Allergy" },
  { value: "stomach_pain", label: "Stomach Pain" },
  { value: "no_effect", label: "No Effect" },
  { value: "side_effect", label: "Side Effect" },
  { value: "other", label: "Other" },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const PharmaQuality = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    drug_name: "", brand_name: "", batch_number: "", patient_name: "",
    reaction_type: "allergy", reaction_description: "", severity: "medium",
    doctor_name: "", action_taken: "", notes: "",
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["pharma-quality-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_quality_logs").select("*").order("reported_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pharma_quality_logs").insert({
        drug_name: form.drug_name,
        brand_name: form.brand_name || null,
        batch_number: form.batch_number || null,
        patient_name: form.patient_name,
        reaction_type: form.reaction_type,
        reaction_description: form.reaction_description,
        severity: form.severity,
        doctor_name: form.doctor_name || null,
        action_taken: form.action_taken || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-quality-logs"] });
      toast({ title: "Pharma quality log added" });
      setOpen(false);
      setForm({ drug_name: "", brand_name: "", batch_number: "", patient_name: "", reaction_type: "allergy", reaction_description: "", severity: "medium", doctor_name: "", action_taken: "", notes: "" });
    },
  });

  // Drug problem analysis
  const drugStats = logs.reduce((acc: Record<string, number>, l: any) => {
    const key = l.brand_name ? `${l.drug_name} (${l.brand_name})` : l.drug_name;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const drugChart = Object.entries(drugStats)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const problemDrugs = drugChart.filter(d => d.count >= 3);
  const highSeverity = logs.filter((l: any) => l.severity === "high" || l.severity === "critical").length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Pill className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{logs.length}</p><p className="text-xs text-muted-foreground">Total Reports</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div><p className="text-2xl font-bold">{highSeverity}</p><p className="text-xs text-muted-foreground">High/Critical</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <ThumbsDown className="h-8 w-8 text-orange-500" />
          <div><p className="text-2xl font-bold">{problemDrugs.length}</p><p className="text-xs text-muted-foreground">Problem Drugs (3+)</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <ThumbsUp className="h-8 w-8 text-green-600" />
          <div><p className="text-2xl font-bold">{Object.keys(drugStats).length}</p><p className="text-xs text-muted-foreground">Drugs Tracked</p></div>
        </CardContent></Card>
      </div>

      {/* Problem Drugs Alert */}
      {problemDrugs.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-destructive flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4" /> Frequently Reported Drugs</h3>
            <div className="flex flex-wrap gap-2">
              {problemDrugs.map(d => (
                <Badge key={d.name} variant="destructive">{d.name} — {d.count} reports</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {drugChart.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Reported Drugs</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={drugChart} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--destructive))" name="Reports" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pharma / Drug Quality Logs</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Report Issue</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Report Drug Quality Issue</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Drug / Medicine Name *" value={form.drug_name} onChange={e => setForm(p => ({ ...p, drug_name: e.target.value }))} />
                <Input placeholder="Brand Name" value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))} />
                <Input placeholder="Batch Number" value={form.batch_number} onChange={e => setForm(p => ({ ...p, batch_number: e.target.value }))} />
                <Input placeholder="Patient Name *" value={form.patient_name} onChange={e => setForm(p => ({ ...p, patient_name: e.target.value }))} />
                <Input placeholder="Prescribing Doctor" value={form.doctor_name} onChange={e => setForm(p => ({ ...p, doctor_name: e.target.value }))} />
                <Select value={form.reaction_type} onValueChange={v => setForm(p => ({ ...p, reaction_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Reaction Description *" value={form.reaction_description} onChange={e => setForm(p => ({ ...p, reaction_description: e.target.value }))} />
                <Textarea placeholder="Action Taken" value={form.action_taken} onChange={e => setForm(p => ({ ...p, action_taken: e.target.value }))} />
                <Button className="w-full" disabled={!form.drug_name || !form.patient_name || !form.reaction_description} onClick={() => addMutation.mutate()}>Save Report</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Drug</TableHead><TableHead>Brand</TableHead>
              <TableHead>Patient</TableHead><TableHead>Reaction</TableHead><TableHead>Severity</TableHead>
              <TableHead>Doctor</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No pharma logs yet</TableCell></TableRow>
              ) : logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{format(new Date(log.reported_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{log.drug_name}</TableCell>
                  <TableCell>{log.brand_name || "—"}</TableCell>
                  <TableCell>{log.patient_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{REACTION_TYPES.find(r => r.value === log.reaction_type)?.label}</Badge></TableCell>
                  <TableCell><Badge className={`text-xs ${SEVERITY_COLORS[log.severity]}`}>{log.severity}</Badge></TableCell>
                  <TableCell>{log.doctor_name || "—"}</TableCell>
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

export default PharmaQuality;
