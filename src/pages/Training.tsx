import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GraduationCap, BookOpen, Award, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, format, parseISO } from "date-fns";

const CATEGORIES = [
  { value: "induction", label: "Induction" },
  { value: "clinical", label: "Clinical Training" },
  { value: "software", label: "Software Training" },
  { value: "communication", label: "Communication" },
  { value: "post_training", label: "Post-Training" },
  { value: "certificate_renewal", label: "Certificate Renewal" },
];

const STATUSES = ["pending", "in_progress", "completed", "expired"];

export default function Training() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("programs");
  const [progDialog, setProgDialog] = useState(false);
  const [trackDialog, setTrackDialog] = useState(false);
  const [editProg, setEditProg] = useState<any>(null);
  const [editTrack, setEditTrack] = useState<any>(null);

  const { data: programs = [] } = useQuery({
    queryKey: ["training_programs"],
    queryFn: async () => {
      const { data } = await supabase.from("training_programs").select("*").order("sort_order").order("name");
      return data || [];
    },
  });

  const { data: trackings = [] } = useQuery({
    queryKey: ["employee_trainings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_trainings")
        .select("*, employees(first_name, last_name, employee_code), training_programs(name, category)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code").eq("status", "active").order("first_name");
      return data || [];
    },
  });

  const saveProg = useMutation({
    mutationFn: async (vals: any) => {
      if (vals.id) {
        const { error } = await supabase.from("training_programs").update(vals).eq("id", vals.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("training_programs").insert(vals);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training_programs"] }); setProgDialog(false); setEditProg(null); toast.success("Program saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delProg = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("training_programs").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training_programs"] }); toast.success("Deleted"); },
  });

  const saveTrack = useMutation({
    mutationFn: async (vals: any) => {
      if (vals.id) {
        const { error } = await supabase.from("employee_trainings").update(vals).eq("id", vals.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_trainings").insert(vals);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee_trainings"] }); setTrackDialog(false); setEditTrack(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delTrack = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("employee_trainings").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee_trainings"] }); toast.success("Deleted"); },
  });

  const stats = useMemo(() => {
    const completed = trackings.filter((t: any) => t.status === "completed").length;
    const inProgress = trackings.filter((t: any) => t.status === "in_progress").length;
    const expiring = trackings.filter((t: any) => {
      if (!t.certificate_expiry_date) return false;
      const days = differenceInDays(parseISO(t.certificate_expiry_date), new Date());
      return days <= (t.reminder_days || 15);
    }).length;
    return { total: programs.length, completed, inProgress, expiring };
  }, [trackings, programs]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GraduationCap className="h-6 w-6" /> Training Management</h1>
          <p className="text-sm text-muted-foreground">Manage training programs and track employee progress</p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Programs</p><p className="text-2xl font-bold">{stats.total}</p></div><BookOpen className="h-5 w-5 text-primary" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-bold text-green-600">{stats.completed}</p></div><Award className="h-5 w-5 text-green-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">In Progress</p><p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p></div><GraduationCap className="h-5 w-5 text-blue-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Expiring Soon</p><p className="text-2xl font-bold text-amber-600">{stats.expiring}</p></div><AlertTriangle className="h-5 w-5 text-amber-600" /></div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="programs">Training Programs</TabsTrigger>
          <TabsTrigger value="tracking">Employee Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={progDialog} onOpenChange={(o) => { setProgDialog(o); if (!o) setEditProg(null); }}>
              <DialogTrigger asChild><Button onClick={() => setEditProg({})}><Plus className="h-4 w-4 mr-1" /> Add Program</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editProg?.id ? "Edit" : "Add"} Training Program</DialogTitle></DialogHeader>
                <ProgramForm initial={editProg} onSave={(v) => saveProg.mutate(v)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Duration</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {programs.map((p: any) => (
                  <TableRow key={p.id} className={!p.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{p.name}<p className="text-xs text-muted-foreground">{p.description}</p></TableCell>
                    <TableCell><Badge variant="outline">{CATEGORIES.find(c => c.value === p.category)?.label || p.category}</Badge></TableCell>
                    <TableCell>{p.duration_hours || 0}h</TableCell>
                    <TableCell><Switch checked={p.is_active} onCheckedChange={(v) => saveProg.mutate({ ...p, is_active: v })} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditProg(p); setProgDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete program?</AlertDialogTitle><AlertDialogDescription>This will also remove related employee tracking records.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => delProg.mutate(p.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {programs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No programs yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={trackDialog} onOpenChange={(o) => { setTrackDialog(o); if (!o) setEditTrack(null); }}>
              <DialogTrigger asChild><Button onClick={() => setEditTrack({})}><Plus className="h-4 w-4 mr-1" /> Assign Training</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editTrack?.id ? "Edit" : "Assign"} Training</DialogTitle></DialogHeader>
                <TrackingForm initial={editTrack} programs={programs} employees={employees} onSave={(v) => saveTrack.mutate(v)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Program</TableHead><TableHead>Status</TableHead><TableHead>Completion</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {trackings.map((t: any) => {
                  const expDays = t.certificate_expiry_date ? differenceInDays(parseISO(t.certificate_expiry_date), new Date()) : null;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.employees?.first_name} {t.employees?.last_name}<p className="text-xs text-muted-foreground">{t.employees?.employee_code}</p></TableCell>
                      <TableCell>{t.training_programs?.name}</TableCell>
                      <TableCell><Badge variant={t.status === "completed" ? "default" : t.status === "in_progress" ? "secondary" : "outline"}>{t.status}</Badge></TableCell>
                      <TableCell>{t.completion_date ? format(parseISO(t.completion_date), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell>{expDays !== null ? (
                        <Badge variant={expDays < 0 ? "destructive" : expDays <= (t.reminder_days || 15) ? "secondary" : "outline"} className={expDays >= 0 && expDays <= (t.reminder_days || 15) ? "bg-amber-100 text-amber-700 border-amber-300" : ""}>
                          {expDays < 0 ? `${Math.abs(expDays)}d ago` : `${expDays}d left`}
                        </Badge>
                      ) : "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setEditTrack(t); setTrackDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Remove tracking?</AlertDialogTitle></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => delTrack.mutate(t.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {trackings.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No training assignments yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProgramForm({ initial, onSave }: { initial: any; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    id: initial?.id,
    name: initial?.name || "",
    category: initial?.category || "induction",
    description: initial?.description || "",
    duration_hours: initial?.duration_hours || 0,
    is_active: initial?.is_active ?? true,
    sort_order: initial?.sort_order || 0,
  });
  return (
    <div className="space-y-3">
      <div><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label>Category</Label>
        <Select value={v.category} onValueChange={(x) => setV({ ...v, category: x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Description</Label><Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div><Label>Duration (hours)</Label><Input type="number" value={v.duration_hours} onChange={(e) => setV({ ...v, duration_hours: Number(e.target.value) })} /></div>
      <DialogFooter><Button onClick={() => onSave(v)} disabled={!v.name}>Save</Button></DialogFooter>
    </div>
  );
}

function TrackingForm({ initial, programs, employees, onSave }: { initial: any; programs: any[]; employees: any[]; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    id: initial?.id,
    employee_id: initial?.employee_id || "",
    program_id: initial?.program_id || "",
    status: initial?.status || "pending",
    start_date: initial?.start_date || "",
    completion_date: initial?.completion_date || "",
    certificate_expiry_date: initial?.certificate_expiry_date || "",
    reminder_days: initial?.reminder_days || 15,
    trainer_name: initial?.trainer_name || "",
    score: initial?.score || "",
    notes: initial?.notes || "",
  });
  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
      <div><Label>Employee *</Label>
        <Select value={v.employee_id} onValueChange={(x) => setV({ ...v, employee_id: x })}>
          <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
          <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Program *</Label>
        <Select value={v.program_id} onValueChange={(x) => setV({ ...v, program_id: x })}>
          <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
          <SelectContent>{programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Status</Label>
        <Select value={v.status} onValueChange={(x) => setV({ ...v, status: x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Start Date</Label><Input type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></div>
        <div><Label>Completion Date</Label><Input type="date" value={v.completion_date} onChange={(e) => setV({ ...v, completion_date: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Certificate Expiry</Label><Input type="date" value={v.certificate_expiry_date} onChange={(e) => setV({ ...v, certificate_expiry_date: e.target.value })} /></div>
        <div><Label>Reminder (days before)</Label><Input type="number" value={v.reminder_days} onChange={(e) => setV({ ...v, reminder_days: Number(e.target.value) })} /></div>
      </div>
      <div><Label>Trainer Name</Label><Input value={v.trainer_name} onChange={(e) => setV({ ...v, trainer_name: e.target.value })} /></div>
      <div><Label>Notes</Label><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      <DialogFooter><Button onClick={() => {
        const payload: any = { ...v };
        ["start_date","completion_date","certificate_expiry_date"].forEach(k => { if (!payload[k]) payload[k] = null; });
        if (payload.score === "") payload.score = null;
        onSave(payload);
      }} disabled={!v.employee_id || !v.program_id}>Save</Button></DialogFooter>
    </div>
  );
}
