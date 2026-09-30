import { useState, useEffect } from "react";
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
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Holidays() {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    name: "", holiday_date: format(new Date(), "yyyy-MM-dd"),
    type: "public", duration: "full_day", location: "", description: "",
  });

  useEffect(() => { fetch(); }, []);

  const fetch = async () => {
    const { data } = await supabase.from("holidays").select("*").order("holiday_date");
    setHolidays(data || []);
  };

  const save = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    const { error } = await supabase.from("holidays").insert(form);
    if (error) { toast.error(error.message); return; }
    toast.success("Holiday added");
    setShow(false);
    setForm({ ...form, name: "", description: "" });
    fetch();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    await supabase.from("holidays").delete().eq("id", id);
    fetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="h-7 w-7 text-primary" /> Holidays</h1>
          <p className="text-muted-foreground mt-1">Festival & public holidays</p>
        </div>
        <Button onClick={() => setShow(true)}><Plus size={16} className="mr-1" /> Add Holiday</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead>
              <TableHead>Duration</TableHead><TableHead>Location</TableHead><TableHead>Description</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {holidays.map(h => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell>{h.holiday_date}</TableCell>
                  <TableCell><Badge variant={h.type === "restricted" ? "secondary" : "default"}>{h.type}</Badge></TableCell>
                  <TableCell>{h.duration}</TableCell>
                  <TableCell>{h.location || "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{h.description || "—"}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => remove(h.id)}><Trash2 size={14} /></Button></TableCell>
                </TableRow>
              ))}
              {holidays.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No holidays</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Holiday Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Date</Label><Input type="date" value={form.holiday_date} onChange={e => setForm({ ...form, holiday_date: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="optional">Optional / Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={form.duration} onValueChange={v => setForm({ ...form, duration: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_day">Full Day</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="All / Specific branch" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <Button onClick={save} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
