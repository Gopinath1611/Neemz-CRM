import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Stethoscope, Pill, FlaskConical, Wrench, UserCog, FileText, Globe, Truck, Package, Syringe, Search, Edit, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";

interface ManagedAdminUser {
  id: string;
  user_id: string;
  role: string;
  full_name: string;
  email: string;
}

const callAdminUsersManager = async <T,>(body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("manage-admin-users", {
    body,
    headers: await getFunctionAuthHeaders(),
  });


  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
};

const toTitleCase = (s: string) => {
  if (!s) return s;
  return s.trim().replace(/(^|\s)([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());
};

// ── DOCTORS TAB ──
const DoctorsTab = () => {
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", mobile: "", whatsapp: "", specialization: "", consultant_fee: 0, send_schedule_whatsapp: false, send_schedule_sms: false, appointment_type: "all", schedule_frequency: "everyday", custom_duration: "" });

  const load = async () => {
    const { data } = await supabase.from("doctors").select("*").order("created_at", { ascending: false });
    setDoctors(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const defaultForm = { name: "", mobile: "", whatsapp: "", specialization: "", consultant_fee: 0, send_schedule_whatsapp: false, send_schedule_sms: false, appointment_type: "all", schedule_frequency: "everyday", custom_duration: "" };
  const openAdd = () => { setEditing(null); setForm({ ...defaultForm }); setDialogOpen(true); };
  const openEdit = (d: any) => { setEditing(d); setForm({ name: d.name, mobile: d.mobile || "", whatsapp: d.whatsapp || "", specialization: d.specialization || "", consultant_fee: Number(d.consultant_fee || 0), send_schedule_whatsapp: d.send_schedule_whatsapp || false, send_schedule_sms: d.send_schedule_sms || false, appointment_type: d.appointment_type || "all", schedule_frequency: d.schedule_frequency || "everyday", custom_duration: d.custom_duration || "" }); setDialogOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from("doctors").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
      toast({ title: "Doctor updated" });
    } else {
      await supabase.from("doctors").insert(form);
      toast({ title: "Doctor added" });
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("doctors").delete().eq("id", id);
    toast({ title: "Doctor deleted" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Doctors</h3>
          <p className="text-xs text-muted-foreground">Manage clinic doctors</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add Doctor
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">#</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Mobile</TableHead>
              <TableHead className="text-xs">WhatsApp</TableHead>
              <TableHead className="text-xs">Specialization</TableHead>
              <TableHead className="text-xs">Consultant Fee</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctors.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                <TableCell className="text-xs font-medium">{d.name}</TableCell>
                <TableCell className="text-xs">{d.mobile || "—"}</TableCell>
                <TableCell className="text-xs">{d.whatsapp || "—"}</TableCell>
                <TableCell className="text-xs">{d.specialization || "—"}</TableCell>
                <TableCell className="text-xs">₹{Number(d.consultant_fee || 0).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && doctors.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">No doctors added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Doctor" : "Add Doctor"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Dr. Name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Mobile</Label><Input value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} placeholder="+91..." /></div>
              <div className="space-y-1"><Label className="text-xs">WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="+91..." /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Specialization</Label><Input value={form.specialization} onChange={e => setForm(p => ({ ...p, specialization: e.target.value }))} placeholder="e.g. Orthodontist" /></div>
            <div className="space-y-1"><Label className="text-xs">Consultant Fee (₹)</Label><Input type="number" min="0" value={form.consultant_fee} onChange={e => setForm(p => ({ ...p, consultant_fee: Number(e.target.value) || 0 }))} placeholder="0" /></div>

            <div className="border-t pt-3 mt-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appointment Schedule Notification</Label>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Send Appointment Schedule via</Label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.send_schedule_whatsapp} onCheckedChange={c => setForm(p => ({ ...p, send_schedule_whatsapp: !!c }))} />
                  <Label className="text-xs">WhatsApp</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.send_schedule_sms} onCheckedChange={c => setForm(p => ({ ...p, send_schedule_sms: !!c }))} />
                  <Label className="text-xs">SMS</Label>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Appointment Type</Label>
              <Select value={form.appointment_type} onValueChange={v => setForm(p => ({ ...p, appointment_type: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Appointments</SelectItem>
                  <SelectItem value="own" className="text-xs">Own Appointments Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Frequency</Label>
              <Select value={form.schedule_frequency} onValueChange={v => setForm(p => ({ ...p, schedule_frequency: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyday" className="text-xs">Everyday</SelectItem>
                  <SelectItem value="appointment_day" className="text-xs">Only Appointment Day</SelectItem>
                  <SelectItem value="immediately" className="text-xs">Immediately</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Custom Duration <span className="text-muted-foreground">(Optional)</span></Label>
              <Select value={form.custom_duration || "none"} onValueChange={v => setForm(p => ({ ...p, custom_duration: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select duration" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No custom duration</SelectItem>
                  <SelectItem value="1_week_prior" className="text-xs">1 Week Prior</SelectItem>
                  <SelectItem value="3_days_prior" className="text-xs">3 Days Prior</SelectItem>
                  <SelectItem value="1_day_prior" className="text-xs">1 Day Prior</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary border-0">{editing ? "Update" : "Add Doctor"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── TREATMENTS TAB (Inline List View) ──
const TreatmentsTab = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRows, setNewRows] = useState<{ name: string; charge: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", charge: "" });

  const load = async () => {
    const { data } = await supabase.from("clinic_treatments").select("*").order("created_at", { ascending: true });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addNewRow = () => {
    setNewRows(prev => [...prev, { name: "", charge: "" }]);
  };

  const updateNewRow = (index: number, field: string, value: string) => {
    setNewRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const removeNewRow = (index: number) => {
    setNewRows(prev => prev.filter((_, i) => i !== index));
  };

  const saveAllNew = async () => {
    const valid = newRows.filter(r => r.name.trim());
    if (valid.length === 0) { toast({ title: "Enter at least one treatment name", variant: "destructive" }); return; }
    const payload = valid.map(r => ({ name: r.name.trim(), charge: Number(r.charge) || 0 }));
    const { error } = await supabase.from("clinic_treatments").insert(payload);
    if (error) { toast({ title: "Error adding treatments", variant: "destructive" }); return; }
    toast({ title: `${valid.length} treatment(s) added` });
    setNewRows([]);
    load();
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setEditForm({ name: d.name, charge: String(d.charge) });
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    await supabase.from("clinic_treatments").update({ name: editForm.name, charge: Number(editForm.charge) || 0, updated_at: new Date().toISOString() }).eq("id", editingId);
    toast({ title: "Treatment updated" });
    setEditingId(null);
    load();
  };

  const cancelEdit = () => setEditingId(null);

  const remove = async (id: string) => {
    await supabase.from("clinic_treatments").delete().eq("id", id);
    toast({ title: "Treatment deleted" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Treatments</h3>
          <p className="text-xs text-muted-foreground">Manage treatment types & charges (inline editing)</p>
        </div>
        <Button size="sm" onClick={addNewRow} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add Treatment
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">Treatment Name</TableHead>
              <TableHead className="text-xs w-32">Charge (₹)</TableHead>
              <TableHead className="text-xs text-right w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                {editingId === d.id ? (
                  <>
                    <TableCell><Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" /></TableCell>
                    <TableCell><Input type="number" value={editForm.charge} onChange={e => setEditForm(p => ({ ...p, charge: e.target.value }))} className="h-8 text-xs" /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={saveEdit}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-xs font-medium">{d.name}</TableCell>
                    <TableCell className="text-xs">₹{Number(d.charge).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(d)}><Pencil size={13} /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}

            {/* New rows for bulk add */}
            {newRows.map((row, i) => (
              <TableRow key={`new-${i}`} className="bg-muted/30">
                <TableCell className="text-xs text-muted-foreground">{items.length + i + 1}</TableCell>
                <TableCell><Input value={row.name} onChange={e => updateNewRow(i, "name", e.target.value)} placeholder="Treatment name" className="h-8 text-xs" autoFocus={i === newRows.length - 1} /></TableCell>
                <TableCell><Input type="number" value={row.charge} onChange={e => updateNewRow(i, "charge", e.target.value)} placeholder="0" className="h-8 text-xs" /></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeNewRow(i)}><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}

            {!loading && items.length === 0 && newRows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">No treatments added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {newRows.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={addNewRow}>
            <Plus size={14} className="mr-1" /> Add Another Row
          </Button>
          <Button size="sm" className="gradient-primary border-0 text-xs h-8" onClick={saveAllNew}>
            Save All ({newRows.filter(r => r.name.trim()).length})
          </Button>
        </div>
      )}
    </div>
  );
};
// ── MEDICINES TAB ──
const MEDICINE_TYPES = ["tablet", "capsule", "syrup", "injection", "ointment", "toothpaste", "mouthwash", "gel", "toothbrush", "gargle", "drops", "powder"];
const DOSAGE_OPTIONS = ["-", "½", "1"];
const DEFAULT_FOOD_OPTIONS = ["After Food", "Before Food", "Before Brushing", "After Brushing"];

const MedicinesTab = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [foodOptions, setFoodOptions] = useState<string[]>(DEFAULT_FOOD_OPTIONS);
  const [newFoodOption, setNewFoodOption] = useState("");
  const [form, setForm] = useState({
    name: "", type: "tablet", food_instruction: "After Food",
    dosage: "", morning: "-", afternoon: "-", evening: "-", night: "-", days: "5",
    inventory_item_id: "", unit: "tablet", unit_cost: "0"
  });
  const [dosagesList, setDosagesList] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Inline dosage management (number + unit) within Edit Medicine dialog
  const [newDosageNum, setNewDosageNum] = useState("");
  const [newDosageUnit, setNewDosageUnit] = useState("mg");
  const [editingDosageId, setEditingDosageId] = useState<string | null>(null);
  const [editDosageNum, setEditDosageNum] = useState("");
  const [editDosageUnit, setEditDosageUnit] = useState("mg");

  const DOSAGE_UNITS = ["mg", "ml", "mcg", "g", "IU", "%", "drops", "puffs"];

  const parseDosage = (val: string): { num: string; unit: string } => {
    const m = (val || "").trim().match(/^([\d.]+)\s*([a-zA-Z%]*)$/);
    if (m) return { num: m[1], unit: m[2] || "mg" };
    return { num: val || "", unit: "mg" };
  };

  const broadcastMedicinesUpdated = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("medicines:updated"));
  };

  const syncMedicineRow = (medicineId: string, changes: Record<string, any>) => {
    setItems((prev) => prev.map((item) => (item.id === medicineId ? { ...item, ...changes } : item)));
  };

  const reloadDosages = async () => {
    const { data } = await supabase.from("medicine_dosages").select("*").order("medicine_type").order("sort_order");
    setDosagesList(data || []);
  };

  // Live-persist dosage to the currently-edited medicine row, then reload list
  const persistMedicineDosage = async (value: string, medicineId = editing?.id) => {
    if (!medicineId) return;
    const normalizedDosage = value.trim() || null;
    const updatedAt = new Date().toISOString();

    syncMedicineRow(medicineId, { dosage: normalizedDosage, updated_at: updatedAt });

    const { error } = await supabase
      .from("medicines")
      .update({ dosage: normalizedDosage, updated_at: updatedAt })
      .eq("id", medicineId);

    if (error) {
      toast({ title: "Failed to sync dosage", description: error.message, variant: "destructive" });
      await load();
      return;
    }

    broadcastMedicinesUpdated();
    await load();
  };

  const selectDosage = async (value: string) => {
    setForm(p => ({ ...p, dosage: value }));
    await persistMedicineDosage(value);
  };

  const addDosageInline = async () => {
    if (!newDosageNum.trim()) { toast({ title: "Enter number", variant: "destructive" }); return; }
    const value = `${newDosageNum.trim()}${newDosageUnit}`;
    const { error } = await supabase.from("medicine_dosages").insert({
      medicine_type: form.type, value, sort_order: dosagesList.filter(d => d.medicine_type === form.type).length,
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Dosage added & applied" });
    setNewDosageNum(""); await reloadDosages();
    broadcastMedicinesUpdated();
    setForm(p => ({ ...p, dosage: value }));
    await persistMedicineDosage(value);
  };

  const startEditDosage = (d: any) => {
    const { num, unit } = parseDosage(d.value);
    setEditingDosageId(d.id); setEditDosageNum(num); setEditDosageUnit(unit);
  };

  const saveEditDosage = async (id: string) => {
    if (!editDosageNum.trim()) return;
    const value = `${editDosageNum.trim()}${editDosageUnit}`;
    const old = dosagesList.find(d => d.id === id)?.value;
    await supabase.from("medicine_dosages").update({ value, updated_at: new Date().toISOString() }).eq("id", id);
    toast({ title: "Dosage updated" });
    setEditingDosageId(null); await reloadDosages();
    broadcastMedicinesUpdated();
    if (form.dosage === old) {
      setForm(p => ({ ...p, dosage: value }));
      await persistMedicineDosage(value);
    }
  };

  const removeDosageInline = async (d: any) => {
    await supabase.from("medicine_dosages").delete().eq("id", d.id);
    toast({ title: "Dosage deleted" }); await reloadDosages();
    broadcastMedicinesUpdated();
    if (form.dosage === d.value) {
      setForm(p => ({ ...p, dosage: "" }));
      await persistMedicineDosage("");
    }
  };

  const pagedItems = usePagedSlice(items, page, pageSize);

  useEffect(() => { setPage(1); }, [items.length]);

  const load = async () => {
    const [{ data: meds }, { data: inv }, { data: dos }] = await Promise.all([
      supabase.from("medicines").select("*").order("created_at", { ascending: false }),
      supabase.from("inventory_items").select("id, name").order("name"),
      supabase.from("medicine_dosages").select("*").order("medicine_type").order("sort_order"),
    ]);
    setItems(meds || []);
    setInventoryItems(inv || []);
    setDosagesList(dos || []);
    // collect unique food instructions
    const extras = (meds || []).map((m: any) => m.food_instruction).filter((f: string) => f && !DEFAULT_FOOD_OPTIONS.includes(f));
    setFoodOptions([...DEFAULT_FOOD_OPTIONS, ...Array.from(new Set(extras))]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const defaultForm = { name: "", type: "tablet", food_instruction: "After Food", dosage: "", morning: "-", afternoon: "-", evening: "-", night: "-", days: "5", inventory_item_id: "", unit: "tablet", unit_cost: "0" };

  const openAdd = () => { setEditing(null); setForm({ ...defaultForm }); setDialogOpen(true); };
  const openEdit = (d: any) => {
    setEditing(d);
    setForm({
      name: d.name, type: d.type || "tablet", food_instruction: d.food_instruction || "After Food",
      dosage: d.dosage || "",
      morning: d.morning || "-", afternoon: d.afternoon || "-", evening: d.evening || "-", night: d.night || "-",
      days: String(d.days || 5), inventory_item_id: d.inventory_item_id || "",
      unit: d.unit || d.type || "tablet", unit_cost: String(d.unit_cost ?? 0)
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const updatedAt = new Date().toISOString();
    const payload: any = {
      name: form.name, type: form.type, food_instruction: form.food_instruction,
      dosage: form.dosage.trim() || null,
      morning: form.morning, afternoon: form.afternoon, evening: form.evening, night: form.night,
      days: Number(form.days) || 5,
      inventory_item_id: form.inventory_item_id || null,
      unit: form.unit || form.type || "tablet",
      unit_cost: Number(form.unit_cost) || 0
    };
    const cost = Number(form.unit_cost) || 0;

    // Auto-link or create inventory item by medicine name if not linked
    let invId = form.inventory_item_id || null;
    if (!invId) {
      const { data: existingInv } = await supabase
        .from("inventory_items")
        .select("id")
        .ilike("name", form.name.trim())
        .maybeSingle();
      if (existingInv) {
        invId = existingInv.id;
      } else {
        const { data: newInv } = await supabase
          .from("inventory_items")
          .insert({
            name: form.name.trim(),
            unit: form.unit || form.type || "tablet",
            quantity: 0,
            cost_price: cost,
            selling_price: cost,
            min_stock_level: 5,
            is_active: true,
          })
          .select("id")
          .single();
        invId = newInv?.id || null;
      }
    }

    payload.inventory_item_id = invId;

    if (editing) {
      syncMedicineRow(editing.id, { ...payload, updated_at: updatedAt });
      await supabase.from("medicines").update({ ...payload, updated_at: updatedAt }).eq("id", editing.id);
      toast({ title: "Medicine updated — synced to Inventory" });
    } else {
      await supabase.from("medicines").insert(payload);
      toast({ title: "Medicine added — synced to Inventory" });
    }

    // Live-sync price into the linked inventory item (both cost & selling price stay identical)
    if (invId) {
      await supabase
        .from("inventory_items")
        .update({
          cost_price: cost,
          selling_price: cost,
          unit: form.unit || form.type || "tablet",
          updated_at: updatedAt,
        })
        .eq("id", invId);
    }

    setDialogOpen(false);
    broadcastMedicinesUpdated();
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("medicines").delete().eq("id", id);
    toast({ title: "Medicine deleted" });
    load();
  };

  const addFoodOption = () => {
    const v = newFoodOption.trim();
    if (v && !foodOptions.includes(v)) {
      setFoodOptions(prev => [...prev, v]);
      setForm(p => ({ ...p, food_instruction: v }));
    }
    setNewFoodOption("");
  };

  const dosageBadge = (d: any) => {
    const parts = [
      d.morning && d.morning !== "-" ? d.morning : null,
      d.afternoon && d.afternoon !== "-" ? d.afternoon : null,
      d.evening && d.evening !== "-" ? d.evening : null,
      d.night && d.night !== "-" ? d.night : null,
    ].filter(Boolean);
    return parts.length > 0 ? `${d.morning || "-"}-${d.afternoon || "-"}-${d.evening || "-"}-${d.night || "-"}` : "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Medicines</h3>
          <p className="text-xs text-muted-foreground">Manage medicine templates</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add Medicine
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">Medicine</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Instruction</TableHead>
              <TableHead className="text-xs">Dosage</TableHead>
              <TableHead className="text-xs">Morning</TableHead>
              <TableHead className="text-xs">Afternoon</TableHead>
              <TableHead className="text-xs">Evening</TableHead>
              <TableHead className="text-xs">Night</TableHead>
              <TableHead className="text-xs">Days</TableHead>
              <TableHead className="text-xs">Unit</TableHead>
              <TableHead className="text-xs text-right">Unit Cost (₹)</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                <TableCell className="text-xs font-medium">{d.name}</TableCell>
                <TableCell className="text-xs capitalize">{d.type}</TableCell>
                <TableCell className="text-xs">{d.food_instruction || "—"}</TableCell>
                <TableCell className="text-xs font-semibold">{d.dosage ? <Badge variant="secondary" className="text-[11px]">{d.dosage}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs">{d.morning || "—"}</TableCell>
                <TableCell className="text-xs">{d.afternoon || "—"}</TableCell>
                <TableCell className="text-xs">{d.evening || "—"}</TableCell>
                <TableCell className="text-xs">{d.night || "—"}</TableCell>
                <TableCell className="text-xs">{d.days}</TableCell>
                <TableCell className="text-xs">{d.unit || d.type || "—"}</TableCell>
                <TableCell className="text-xs text-right font-medium">₹{Number(d.unit_cost || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-8">No medicines added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={page}
        pageSize={pageSize}
        total={items.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        pageSizeOptions={[5, 10, 25, 50, 100]}
        label="medicines"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Medicine" : "Add Medicine"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            {/* Type */}
            <div className="space-y-1">
              <Label className="text-xs">Medicine Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDICINE_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs">Medicine Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: toTitleCase(e.target.value.replace(/^\s+/, "")) }))} onBlur={e => setForm(p => ({ ...p, name: toTitleCase(e.target.value.trim()) }))} placeholder="e.g. Amoxicillin 500mg" className="h-9 text-xs" />
            </div>

            {/* Food Instruction */}
            <div className="space-y-1">
              <Label className="text-xs">Instruction</Label>
              <Select value={form.food_instruction} onValueChange={v => setForm(p => ({ ...p, food_instruction: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {foodOptions.map(f => (
                    <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 mt-1">
                <Input value={newFoodOption} onChange={e => setNewFoodOption(e.target.value)} placeholder="Add custom instruction" className="h-7 text-xs flex-1" />
                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={addFoodOption}><Plus size={12} /></Button>
              </div>
            </div>

            {/* Dosage - inline manage (add/edit/delete with number + unit) — synced to Settings → Dosages */}
            <div className="space-y-2 rounded-md border p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Dosage ({form.type})</Label>
                {form.dosage && (
                  <Badge variant="secondary" className="text-[10px]">Selected: {form.dosage}</Badge>
                )}
              </div>

              {/* List of dosages for current medicine type */}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {dosagesList.filter(d => d.medicine_type === form.type).map(d => {
                  const isEditing = editingDosageId === d.id;
                  const isSelected = form.dosage === d.value;
                  return (
                    <div key={d.id} className={`flex items-center gap-1 rounded px-2 py-1 ${isSelected ? "bg-primary/10 border border-primary/40" : "bg-background border"}`}>
                      {isEditing ? (
                        <>
                          <Input type="number" value={editDosageNum} onChange={e => setEditDosageNum(e.target.value)} className="h-7 text-xs w-20" autoFocus />
                          <Select value={editDosageUnit} onValueChange={setEditDosageUnit}>
                            <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DOSAGE_UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => saveEditDosage(d.id)}><Check size={13} /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingDosageId(null)}><X size={13} /></Button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={`flex-1 text-left text-xs px-1 ${isSelected ? "font-semibold text-primary" : ""}`} onClick={() => selectDosage(isSelected ? "" : d.value)}>
                            {d.value}
                          </button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditDosage(d)}><Pencil size={12} /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeDosageInline(d)}><Trash2 size={12} /></Button>
                        </>
                      )}
                    </div>
                  );
                })}
                {dosagesList.filter(d => d.medicine_type === form.type).length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic px-2 py-1">No dosages yet. Add one below.</p>
                )}
              </div>

              {/* Add new dosage row */}
              <div className="flex items-center gap-1 pt-2 border-t">
                <Input type="number" value={newDosageNum} onChange={e => setNewDosageNum(e.target.value)} placeholder="500" className="h-8 text-xs w-24" />
                <Select value={newDosageUnit} onValueChange={setNewDosageUnit}>
                  <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOSAGE_UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addDosageInline}>
                  <Plus size={12} className="mr-1" /> Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Click a dosage to select. Changes auto-sync to Settings → Dosages.</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Morning / Afternoon / Evening / Night</Label>
              <div className="grid grid-cols-4 gap-2">
                {(["morning", "afternoon", "evening", "night"] as const).map(t => (
                  <div key={t} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground capitalize">{t}</Label>
                    <Select value={(form as any)[t]} onValueChange={v => setForm(p => ({ ...p, [t]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOSAGE_OPTIONS.map(o => (
                          <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Days */}
            <div className="space-y-1">
              <Label className="text-xs">Days</Label>
              <Input type="number" value={form.days} onChange={e => setForm(p => ({ ...p, days: e.target.value }))} className="w-24 h-9 text-xs" />
            </div>

            {/* Unit & Unit Cost */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet" className="text-xs">Tablet</SelectItem>
                    <SelectItem value="capsule" className="text-xs">Capsule</SelectItem>
                    <SelectItem value="ml" className="text-xs">ml (Syrup/Drops)</SelectItem>
                    <SelectItem value="bottle" className="text-xs">Bottle</SelectItem>
                    <SelectItem value="strip" className="text-xs">Strip</SelectItem>
                    <SelectItem value="box" className="text-xs">Box</SelectItem>
                    <SelectItem value="tube" className="text-xs">Tube</SelectItem>
                    <SelectItem value="vial" className="text-xs">Vial</SelectItem>
                    <SelectItem value="sachet" className="text-xs">Sachet</SelectItem>
                    <SelectItem value="gm" className="text-xs">gm</SelectItem>
                    <SelectItem value="piece" className="text-xs">Piece</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cost per Unit (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unit_cost}
                  onChange={e => setForm(p => ({ ...p, unit_cost: e.target.value }))}
                  placeholder="e.g. 5.50"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Inventory Link */}
            <div className="space-y-1">
              <Label className="text-xs">Link with Inventory</Label>
              <Select value={form.inventory_item_id} onValueChange={v => setForm(p => ({ ...p, inventory_item_id: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select inventory item (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">— No Link —</SelectItem>
                  {inventoryItems.map(inv => (
                    <SelectItem key={inv.id} value={inv.id} className="text-xs">{inv.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary border-0">{editing ? "Update" : "Add Medicine"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── LABS TAB ──


const LabsTab = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", contact_person: "", mobile: "", whatsapp: "" });

  const load = async () => {
    const { data } = await supabase.from("labs").select("*").order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", contact_person: "", mobile: "", whatsapp: "" }); setDialogOpen(true); };
  const openEdit = (d: any) => { setEditing(d); setForm({ name: d.name, contact_person: d.contact_person || "", mobile: d.mobile || "", whatsapp: d.whatsapp || "" }); setDialogOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from("labs").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
      toast({ title: "Lab updated" });
    } else {
      await supabase.from("labs").insert(form);
      toast({ title: "Lab added" });
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("labs").delete().eq("id", id);
    toast({ title: "Lab deleted" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Labs</h3>
          <p className="text-xs text-muted-foreground">Manage dental labs</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add Lab
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">Lab Name</TableHead>
              <TableHead className="text-xs">Contact Person</TableHead>
              <TableHead className="text-xs">Mobile</TableHead>
              <TableHead className="text-xs">WhatsApp</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                <TableCell className="text-xs font-medium">{d.name}</TableCell>
                <TableCell className="text-xs">{d.contact_person || "—"}</TableCell>
                <TableCell className="text-xs">{d.mobile || "—"}</TableCell>
                <TableCell className="text-xs">{d.whatsapp || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">No labs added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Lab" : "Add Lab"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Lab Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Smile Dental Lab" /></div>
            <div className="space-y-1"><Label className="text-xs">Contact Person</Label><Input value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="Contact name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Mobile</Label><Input value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} placeholder="+91..." /></div>
              <div className="space-y-1"><Label className="text-xs">WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="+91..." /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary border-0">{editing ? "Update" : "Add Lab"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── SCAN CENTERS / BLOOD LABS shared component ──
const DiagnosticPartnersTab = ({
  table,
  title,
  subtitle,
  itemLabel,
  placeholder,
}: {
  table: "scan_centers" | "blood_labs";
  title: string;
  subtitle: string;
  itemLabel: string;
  placeholder: string;
}) => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", contact_person: "", mobile: "", whatsapp: "", location: "" });

  const load = async () => {
    const { data } = await supabase.from(table).select("*").order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => setForm({ name: "", contact_person: "", mobile: "", whatsapp: "", location: "" });
  const openAdd = () => { setEditing(null); reset(); setDialogOpen(true); };
  const openEdit = (d: any) => {
    setEditing(d);
    setForm({
      name: d.name || "",
      contact_person: d.contact_person || "",
      mobile: d.mobile || "",
      whatsapp: d.whatsapp || "",
      location: d.location || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from(table).update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
      toast({ title: `${itemLabel} updated` });
    } else {
      await supabase.from(table).insert(form);
      toast({ title: `${itemLabel} added` });
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete this ${itemLabel.toLowerCase()}?`)) return;
    await supabase.from(table).delete().eq("id", id);
    toast({ title: `${itemLabel} deleted` });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add {itemLabel}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">{itemLabel} Name</TableHead>
              <TableHead className="text-xs">Contact Person</TableHead>
              <TableHead className="text-xs">Mobile</TableHead>
              <TableHead className="text-xs">WhatsApp</TableHead>
              <TableHead className="text-xs">Location</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                <TableCell className="text-xs font-medium">{d.name}</TableCell>
                <TableCell className="text-xs">{d.contact_person || "—"}</TableCell>
                <TableCell className="text-xs">{d.mobile || "—"}</TableCell>
                <TableCell className="text-xs">{d.whatsapp || "—"}</TableCell>
                <TableCell className="text-xs">{d.location || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">No {itemLabel.toLowerCase()}s added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">{itemLabel} Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={placeholder} /></div>
            <div className="space-y-1"><Label className="text-xs">Contact Person</Label><Input value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="Contact name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Mobile</Label><Input value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} placeholder="+91..." /></div>
              <div className="space-y-1"><Label className="text-xs">WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="+91..." /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Location</Label><Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Address / area" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary border-0">{editing ? "Update" : `Add ${itemLabel}`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ScanCentersTab = () => (
  <DiagnosticPartnersTab table="scan_centers" title="Scan Centers" subtitle="Manage X-ray & scan center partners" itemLabel="Scan Center" placeholder="e.g. City Imaging Center" />
);

const BloodLabsTab = () => (
  <DiagnosticPartnersTab table="blood_labs" title="Blood Labs" subtitle="Manage blood test / pathology lab partners" itemLabel="Blood Lab" placeholder="e.g. Apollo Diagnostics" />
);

// ── LAB WORK TAB ──
const LabWorkTab = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRows, setNewRows] = useState<{ lab_name: string; name: string; material: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ lab_name: "", name: "", material: "" });

  const load = async () => {
    const { data } = await supabase.from("lab_works").select("*").order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  const loadLabs = async () => {
    const { data } = await supabase.from("labs").select("id, name").eq("is_active", true).order("name");
    setLabs(data || []);
  };

  useEffect(() => { load(); loadLabs(); }, []);

  const addNewRow = () => setNewRows(prev => [...prev, { lab_name: "", name: "", material: "" }]);
  const updateNewRow = (idx: number, field: string, value: string) => {
    const rows = [...newRows]; rows[idx] = { ...rows[idx], [field]: value }; setNewRows(rows);
  };
  const removeNewRow = (idx: number) => setNewRows(prev => prev.filter((_, i) => i !== idx));

  const saveAllNew = async () => {
    const valid = newRows.filter(r => r.name.trim());
    if (valid.length === 0) { toast({ title: "Enter at least one lab work name", variant: "destructive" }); return; }
    const payload = valid.map(r => ({
      name: r.name.trim(),
      lab_name: r.lab_name || "",
      materials: r.material.trim() ? r.material.split(",").map(s => s.trim()).filter(Boolean) : [],
    }));
    await supabase.from("lab_works").insert(payload);
    toast({ title: `${valid.length} lab work(s) added` });
    setNewRows([]);
    load();
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setEditForm({
      lab_name: d.lab_name || "",
      name: d.name,
      material: (d.materials || []).join(", "),
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim()) return;
    const materials = editForm.material.split(",").map(s => s.trim()).filter(Boolean);
    await supabase.from("lab_works").update({ name: editForm.name.trim(), lab_name: editForm.lab_name, materials, updated_at: new Date().toISOString() }).eq("id", editingId);
    toast({ title: "Lab work updated" });
    setEditingId(null);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("lab_works").delete().eq("id", id);
    toast({ title: "Lab work deleted" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Lab Work</h3>
          <p className="text-xs text-muted-foreground">Manage lab work types & materials</p>
        </div>
        <div className="flex gap-2">
          {newRows.length > 0 && (
            <Button size="sm" onClick={saveAllNew} className="gradient-primary border-0 text-xs h-8">Save All ({newRows.filter(r => r.name.trim()).length})</Button>
          )}
          <Button size="sm" variant="outline" onClick={addNewRow} className="text-xs h-8">
            <Plus size={14} className="mr-1" /> Add Lab Work
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">Lab Name</TableHead>
              <TableHead className="text-xs">Lab Work Name</TableHead>
              <TableHead className="text-xs">Material</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* New rows for bulk add */}
            {newRows.map((row, idx) => (
              <TableRow key={`new-${idx}`} className="bg-primary/5">
                <TableCell className="text-xs text-muted-foreground">New</TableCell>
                <TableCell>
                  <Select value={row.lab_name} onValueChange={v => updateNewRow(idx, "lab_name", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Lab" /></SelectTrigger>
                    <SelectContent>{labs.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input className="h-8 text-xs" placeholder="Work name" value={row.name} onChange={e => updateNewRow(idx, "name", e.target.value)} />
                </TableCell>
                <TableCell>
                  <Input className="h-8 text-xs" placeholder="e.g. Zirconia, Metal" value={row.material} onChange={e => updateNewRow(idx, "material", e.target.value)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeNewRow(idx)}><Trash2 size={13} /></Button>
                </TableCell>
              </TableRow>
            ))}

            {/* Existing rows */}
            {items.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                {editingId === d.id ? (
                  <>
                    <TableCell>
                      <Select value={editForm.lab_name} onValueChange={v => setEditForm(p => ({ ...p, lab_name: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Lab" /></SelectTrigger>
                        <SelectContent>{labs.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 text-xs" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 text-xs" value={editForm.material} onChange={e => setEditForm(p => ({ ...p, material: e.target.value }))} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveEdit}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-xs">{d.lab_name || "—"}</TableCell>
                    <TableCell className="text-xs font-medium">{d.name}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(d.materials || []).map((m: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-[10px]">{m}</Badge>
                        ))}
                        {(!d.materials || d.materials.length === 0) && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(d)}><Pencil size={13} /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {!loading && items.length === 0 && newRows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">No lab works added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ── ADMIN USERS TAB ──
interface AdminUsersTabProps {
  onUsersCountChange?: (count: number) => void;
}

const AdminUsersTab = ({ onUsersCountChange }: AdminUsersTabProps) => {
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedAdminUser | null>(null);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", password: "", role: "receptionist" as string });
  const [editForm, setEditForm] = useState({ full_name: "", role: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await callAdminUsersManager<{ users: ManagedAdminUser[] }>({ action: "list" });
      const nextUsers = result.users || [];
      setUsers(nextUsers);
      onUsersCountChange?.(nextUsers.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load users";
      setUsers([]);
      onUsersCountChange?.(0);
      toast({ title: "Unable to load admin users", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openAdd = () => {
    setAddForm({ full_name: "", email: "", password: "", role: "receptionist" });
    setDialogOpen(true);
  };

  const openEdit = (user: ManagedAdminUser) => {
    setEditingUser(user);
    setEditForm({ full_name: user.full_name || "", role: user.role });
    setEditDialog(true);
  };

  const addUser = async () => {
    if (!addForm.full_name.trim() || !addForm.email.trim() || !addForm.password.trim()) {
      toast({ title: "Name, email and password required", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-staff-user", {
        body: {
          email: addForm.email.trim(),
          password: addForm.password,
          full_name: addForm.full_name.trim(),
          role: addForm.role,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({ title: "User added successfully" });
      setDialogOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create user";
      toast({ title: "Failed to create user", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingUser) return;

    setSaving(true);

    try {
      await callAdminUsersManager({
        action: "update",
        user_role_id: editingUser.id,
        user_id: editingUser.user_id,
        full_name: editForm.full_name.trim(),
        role: editForm.role,
      });

      toast({ title: "User updated" });
      setEditDialog(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update user";
      toast({ title: "Failed to update user", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (userRoleId: string) => {
    try {
      await callAdminUsersManager({ action: "delete", user_role_id: userRoleId });
      toast({ title: "User removed" });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove user";
      toast({ title: "Failed to remove user", description: message, variant: "destructive" });
    }
  };

  const roleOptions = [
    "admin", "digital_marketing_manager", "digital_marketing_executive",
    "video_editor", "telecaller", "duty_doctor", "dental_assistant", "receptionist"
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Admin Users</h3>
          <p className="text-xs text-muted-foreground">Manage users, roles and access</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add User
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">#</TableHead>
              <TableHead className="text-xs">User Name</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user, index) => (
              <TableRow key={user.id}>
                <TableCell className="text-xs">{index + 1}</TableCell>
                <TableCell className="text-xs font-medium">{user.full_name || user.user_id.slice(0, 8)}</TableCell>
                <TableCell className="text-xs">{user.email || "—"}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {user.role.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(user)}><Pencil size={13} /></Button>
                    {user.role !== "admin" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeUser(user.id)}><Trash2 size={13} /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">Loading users...</TableCell>
              </TableRow>
            )}
            {!loading && users.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">No users found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Add New User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Full Name *</Label><Input value={addForm.full_name} onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Enter full name" /></div>
            <div className="space-y-1"><Label className="text-xs">Email *</Label><Input type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="Enter email" /></div>
            <div className="space-y-1"><Label className="text-xs">Password *</Label><Input type="password" value={addForm.password} onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter password" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Role *</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={addUser} disabled={saving} className="gradient-primary border-0">{saving ? "Adding..." : "Add User"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Edit User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Full Name</Label><Input value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Enter full name" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={editForm.role} onValueChange={v => setEditForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={saveEdit} disabled={saving} className="gradient-primary border-0">{saving ? "Saving..." : "Update"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── PRESCRIPTION TEMPLATES TAB ──
interface TemplateItem {
  medicine_name: string;
  dosage: string;
  frequency: string;
  morning: string;
  afternoon: string;
  evening: string;
  night: string;
  duration: string;
  instructions: string;
}

const emptyItem = (): TemplateItem => ({ medicine_name: "", dosage: "", frequency: "", morning: "0", afternoon: "0", evening: "0", night: "0", duration: "", instructions: "" });

const PrescriptionTemplatesTab = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", treatment_category: "", description: "" });
  const [items, setItems] = useState<TemplateItem[]>([emptyItem()]);
  const [medicinesList, setMedicinesList] = useState<{ id: string; name: string; type: string | null }[]>([]);

  const load = async () => {
    const { data } = await supabase.from("prescription_templates").select("*").order("name");
    setTemplates(data || []);
    setLoading(false);
  };

  const loadMedicines = async () => {
    const { data } = await supabase.from("medicines").select("id, name, type").eq("is_active", true).order("name");
    if (data) setMedicinesList(data);
  };

  useEffect(() => { load(); loadMedicines(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", treatment_category: "", description: "" });
    setItems([emptyItem()]);
    setDialogOpen(true);
  };

  const openEdit = async (t: any) => {
    setEditing(t);
    setForm({ name: t.name, treatment_category: t.treatment_category || "", description: t.description || "" });
    const { data } = await supabase.from("prescription_template_items").select("*").eq("template_id", t.id).order("sort_order");
    if (data && data.length > 0) {
      setItems(data.map((d: any) => ({
        medicine_name: d.medicine_name || "", dosage: d.dosage || "", frequency: d.frequency || "",
        morning: d.morning || "0", afternoon: d.afternoon || "0", evening: d.evening || "0", night: d.night || "0",
        duration: d.duration || "", instructions: d.instructions || "",
      })));
    } else {
      setItems([emptyItem()]);
    }
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Template name required", variant: "destructive" }); return; }
    const validItems = items.filter(it => it.medicine_name.trim());
    if (validItems.length === 0) { toast({ title: "Add at least one medicine", variant: "destructive" }); return; }

    let templateId: string;
    if (editing) {
      await supabase.from("prescription_templates").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
      templateId = editing.id;
      await supabase.from("prescription_template_items").delete().eq("template_id", templateId);
      toast({ title: "Template updated" });
    } else {
      const { data } = await supabase.from("prescription_templates").insert(form).select("id").single();
      if (!data) { toast({ title: "Error creating template", variant: "destructive" }); return; }
      templateId = data.id;
      toast({ title: "Template added" });
    }

    const insertItems = validItems.map((it, idx) => ({ ...it, template_id: templateId, sort_order: idx }));
    await supabase.from("prescription_template_items").insert(insertItems);

    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("prescription_templates").delete().eq("id", id);
    toast({ title: "Template deleted" });
    load();
  };

  const updateItem = (idx: number, field: keyof TemplateItem, value: string) => {
    const n = [...items]; n[idx] = { ...n[idx], [field]: value }; setItems(n);
  };

  const doseOptions = ["0", "½", "1"];
  const freqOptions = ["Before Food", "After Food", "After Brushing", "After Mouthwash", "SOS", "For Gargling", "For Brushing", "Before Sleep", "With Milk"];
  const dayOptions = [1, 2, 3, 5, 7, 10, 14, 15, 21, 30, 45, 60, 90];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Prescription Templates</h3>
          <p className="text-xs text-muted-foreground">Pre-built medicine sets for treatments (e.g. RCT, Implant)</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add Template
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">Template Name</TableHead>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs">Medicines</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t, i) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                <TableCell className="text-xs font-medium">{t.name}</TableCell>
                <TableCell className="text-xs">{t.treatment_category || "—"}</TableCell>
                <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px]">{t.description || "—"}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(t.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && templates.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">No templates added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Template" : "Add Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Template Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. RCT Prescription" /></div>
              <div className="space-y-1"><Label className="text-xs">Treatment Category</Label><Input value={form.treatment_category} onChange={e => setForm(p => ({ ...p, treatment_category: e.target.value }))} placeholder="e.g. RCT, Implant, Extraction" /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description..." /></div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Medicines</Label>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setItems([...items, emptyItem()])}><Plus size={12} className="mr-1" /> Add Medicine</Button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="p-3 bg-secondary/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] px-1.5">{idx + 1}</Badge>
                    <span className="text-xs font-medium flex-1">{toTitleCase(item.medicine_name) || "New Medicine"}</span>
                    {items.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 size={12} /></Button>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Medicine</Label>
                      <Select value={item.medicine_name} onValueChange={(v) => updateItem(idx, "medicine_name", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{medicinesList.map(m => <SelectItem key={m.id} value={m.name}>{toTitleCase(m.name)} {m.type ? `(${m.type})` : ""}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Dosage</Label>
                      <Input className="h-8 text-xs" placeholder="e.g. 500mg" value={item.dosage} onChange={e => updateItem(idx, "dosage", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                      <Select value={item.frequency} onValueChange={(v) => updateItem(idx, "frequency", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{freqOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {(["morning", "afternoon", "evening", "night"] as const).map((slot) => (
                      <div key={slot} className="flex flex-col gap-0.5">
                        <Label className="text-[10px] text-muted-foreground capitalize">{slot}</Label>
                        <Select value={item[slot]} onValueChange={(v) => updateItem(idx, slot, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="0" /></SelectTrigger>
                          <SelectContent>{doseOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Days</Label>
                      <Select value={item.duration} onValueChange={(v) => updateItem(idx, "duration", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Days" /></SelectTrigger>
                        <SelectContent>{dayOptions.map(d => <SelectItem key={d} value={`${d} days`}>{d} days</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Instructions</Label>
                    <Input className="h-8 text-xs" placeholder="Special instructions..." value={item.instructions} onChange={e => updateItem(idx, "instructions", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary border-0">{editing ? "Update Template" : "Add Template"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── MAIN COMPONENT ──
interface ClinicSettingsTabsProps {
  activeTab?: string;
}

// ── DOSAGES TAB ──
const DosageMedicineTypes = ["tablet", "capsule", "syrup", "injection", "ointment", "toothpaste", "mouthwash", "gel", "toothbrush", "gargle", "drops", "powder"];

const MedicineDosagesTab = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [form, setForm] = useState({ medicine_type: "tablet", value: "", sort_order: "0" });

  const load = async () => {
    const { data } = await supabase.from("medicine_dosages").select("*").order("medicine_type").order("sort_order");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ medicine_type: "tablet", value: "", sort_order: "0" }); setDialogOpen(true); };
  const openEdit = (d: any) => { setEditing(d); setForm({ medicine_type: d.medicine_type, value: d.value, sort_order: String(d.sort_order ?? 0) }); setDialogOpen(true); };

  const save = async () => {
    if (!form.value.trim()) { toast({ title: "Dosage value required", variant: "destructive" }); return; }
    const payload = { medicine_type: form.medicine_type, value: form.value.trim(), sort_order: Number(form.sort_order) || 0 };
    if (editing) {
      await supabase.from("medicine_dosages").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
      toast({ title: "Dosage updated" });
    } else {
      const { error } = await supabase.from("medicine_dosages").insert(payload);
      if (error) { toast({ title: "Failed to add", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Dosage added" });
    }
    setDialogOpen(false); load();
  };

  const remove = async (id: string) => {
    await supabase.from("medicine_dosages").delete().eq("id", id);
    toast({ title: "Dosage deleted" }); load();
  };

  const filtered = filterType === "all" ? items : items.filter(i => i.medicine_type === filterType);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">Dosages</h3>
          <p className="text-xs text-muted-foreground">Dosage options per medicine type (e.g. 500mg for tablets, 5ml for syrup)</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              {DosageMedicineTypes.map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
            <Plus size={14} className="mr-1" /> Add Dosage
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12">#</TableHead>
              <TableHead className="text-xs">Medicine Type</TableHead>
              <TableHead className="text-xs">Dosage</TableHead>
              <TableHead className="text-xs w-20">Order</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs">{i + 1}</TableCell>
                <TableCell className="text-xs capitalize">{d.medicine_type}</TableCell>
                <TableCell className="text-xs font-medium">{d.value}</TableCell>
                <TableCell className="text-xs">{d.sort_order}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(d.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">No dosages added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Dosage" : "Add Dosage"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Medicine Type</Label>
              <Select value={form.medicine_type} onValueChange={v => setForm(p => ({ ...p, medicine_type: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DosageMedicineTypes.map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dosage Value *</Label>
              <Input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder={form.medicine_type === "syrup" ? "e.g. 5ml" : "e.g. 500mg"} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort Order</Label>
              <Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} className="h-9 text-xs w-24" />
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary border-0">{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MedicinesWithTemplates = () => {
  const [subTab, setSubTab] = useState("medicines");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b pb-1">
        <Button size="sm" variant={subTab === "medicines" ? "default" : "ghost"} className="text-xs h-7 px-3" onClick={() => setSubTab("medicines")}>
          <Pill size={12} className="mr-1" /> Medicines
        </Button>
        <Button size="sm" variant={subTab === "templates" ? "default" : "ghost"} className="text-xs h-7 px-3" onClick={() => setSubTab("templates")}>
          <FileText size={12} className="mr-1" /> Templates
        </Button>
      </div>
      {subTab === "medicines" ? <MedicinesTab /> : <PrescriptionTemplatesTab />}
    </div>
  );
};

// ── SOURCES TAB ──
const SourcesTab = () => {
  const { toast } = useToast();
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "" });

  const load = async () => {
    const { data } = await supabase.from("lead_sources").select("*").order("created_at", { ascending: false });
    setSources(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "" }); setDialogOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setForm({ name: s.name }); setDialogOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from("lead_sources").update({ name: form.name }).eq("id", editing.id);
      toast({ title: "Source updated" });
    } else {
      await supabase.from("lead_sources").insert({ name: form.name });
      toast({ title: "Source added" });
    }
    setDialogOpen(false);
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("lead_sources").update({ is_active: !active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("lead_sources").delete().eq("id", id);
    toast({ title: "Source deleted" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Patient / Lead எங்கிருந்து வந்தார்கள் என்பதை நிர்வகிக்கவும்</p>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Source</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
          ) : sources.length === 0 ? (
            <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No sources added</TableCell></TableRow>
          ) : sources.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>
                <Badge variant={s.is_active ? "default" : "secondary"} className="cursor-pointer text-xs" onClick={() => toggle(s.id, s.is_active)}>
                  {s.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil size={14} /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}><Trash2 size={14} /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Source" : "Add Source"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Source Name</Label><Input value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="e.g. Google, Meta, Walk-in" /></div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── BRANDS TAB ──
const BrandsTab = () => {
  const { toast } = useToast();
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", rep_name: "", contact_number: "", location: "" });

  const load = async () => {
    const { data } = await supabase.from("clinic_brands" as any).select("*").order("created_at", { ascending: false });
    setBrands(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", rep_name: "", contact_number: "", location: "" });
    setDialogOpen(true);
  };
  const openEdit = (b: any) => {
    setEditing(b);
    setForm({
      name: b.name || "",
      rep_name: b.rep_name || "",
      contact_number: b.contact_number || "",
      location: b.location || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(),
      rep_name: form.rep_name.trim() || null,
      contact_number: form.contact_number.trim() || null,
      location: form.location.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from("clinic_brands" as any).update(payload).eq("id", editing.id);
      if (error) { toast({ title: error.message, variant: "destructive" }); return; }
      toast({ title: "Brand updated" });
    } else {
      const { error } = await supabase.from("clinic_brands" as any).insert(payload);
      if (error) { toast({ title: error.message, variant: "destructive" }); return; }
      toast({ title: "Brand added" });
    }
    setDialogOpen(false);
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("clinic_brands" as any).update({ is_active: !active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("clinic_brands" as any).delete().eq("id", id);
    toast({ title: "Brand deleted" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Inventory items-க்கான Brand names மற்றும் representative details-ஐ நிர்வகிக்கவும்</p>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Brand</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand Name</TableHead>
            <TableHead>Rep Name</TableHead>
            <TableHead>Contact Number</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
          ) : brands.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No brands added</TableCell></TableRow>
          ) : brands.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell>{b.rep_name || "—"}</TableCell>
              <TableCell>{b.contact_number || "—"}</TableCell>
              <TableCell>{b.location || "—"}</TableCell>
              <TableCell>
                <Badge variant={b.is_active ? "default" : "secondary"} className="cursor-pointer text-xs" onClick={() => toggle(b.id, b.is_active)}>
                  {b.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil size={14} /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(b.id)}><Trash2 size={14} /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Brand" : "Add Brand"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Brand Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 3M, Dentsply, GC" />
            </div>
            <div>
              <Label>Representative Name</Label>
              <Input value={form.rep_name} onChange={(e) => setForm({ ...form, rep_name: e.target.value })} placeholder="e.g. Mr. Ramesh" />
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} placeholder="e.g. +91 98765 43210" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Chennai, TN" />
            </div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── SUPPLIERS TAB ──
const SUPPLIER_CATEGORIES = [
  { value: "dental_material", label: "Dental Material", icon: Package },
  { value: "disposable_equipment", label: "Disposable Equipment", icon: Syringe },
  { value: "instruments", label: "Instruments", icon: Wrench },
  { value: "lab_supplies", label: "Lab Supplies", icon: FlaskConical },
];

const SuppliersTab = () => {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("dental_material");
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", category: "dental_material", supplier_id: "", brand: "", unit: "pcs", quantity: 0, cost_price: 0, status: "available", notes: "" });

  const load = async () => {
    const [itemsRes, suppliersRes] = await Promise.all([
      supabase.from("supplier_items").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
    ]);
    setItems(itemsRes.data || []);
    setSuppliers(suppliersRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const defaultForm = { name: "", category: "dental_material", supplier_id: "", brand: "", unit: "pcs", quantity: 0, cost_price: 0, status: "available", notes: "" };

  const openAdd = () => { setEditing(null); setForm({ ...defaultForm, category: activeCategory }); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setEditing(item);
    setForm({ name: item.name, category: item.category, supplier_id: item.supplier_id || "", brand: item.brand || "", unit: item.unit, quantity: item.quantity, cost_price: item.cost_price, status: item.status, notes: item.notes || "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Item name required", variant: "destructive" }); return; }
    const payload = { ...form, supplier_id: form.supplier_id || null, brand: form.brand || null, notes: form.notes || null };
    if (editing) {
      await supabase.from("supplier_items").update(payload).eq("id", editing.id);
      toast({ title: "Item updated" });
    } else {
      await supabase.from("supplier_items").insert(payload);
      toast({ title: "Item added" });
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("supplier_items").delete().eq("id", id);
    toast({ title: "Item deleted" });
    load();
  };

  const filtered = items.filter(
    (i) => i.category === activeCategory && (search === "" || i.name.toLowerCase().includes(search.toLowerCase()) || i.brand?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {SUPPLIER_CATEGORIES.map((c) => {
            const count = items.filter((i) => i.category === c.value).length;
            return (
              <Button key={c.value} variant={activeCategory === c.value ? "default" : "outline"} size="sm" className="text-xs gap-1.5" onClick={() => setActiveCategory(c.value)}>
                <c.icon size={13} /> {c.label}
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">{count}</Badge>
              </Button>
            );
          })}
        </div>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Item</Button>
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search items..." className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <p className="text-center py-6 text-muted-foreground text-sm">Loading...</p> : filtered.length === 0 ? (
        <p className="text-center py-6 text-muted-foreground text-sm">No items found. Click "Add Item" to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Cost (₹)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const sup = suppliers.find((s: any) => s.id === item.supplier_id);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.brand || "-"}</TableCell>
                  <TableCell>{sup?.name || "-"}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>₹{item.cost_price}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "available" ? "default" : item.status === "out_of_stock" ? "destructive" : "secondary"}>
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Edit size={14} /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(item.id)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Item" : "Add Supplier Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Item Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUPPLIER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
              <div><Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["pcs", "box", "pack", "set", "roll", "bottle", "tube", "kg", "ltr"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cost (₹)</Label><Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── SUPPLIER MANAGEMENT TAB ──
const DEFAULT_SUPPLIER_CATEGORIES = ["Medicine", "Consumable", "Treatment Material", "Diagnosis"];
const SUPPLIER_CAT_KEY = "supplier_categories_v1";

const loadSupplierCategories = (): string[] => {
  try {
    const raw = localStorage.getItem(SUPPLIER_CAT_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch {}
  return DEFAULT_SUPPLIER_CATEGORIES;
};

const saveSupplierCategories = (cats: string[]) => {
  localStorage.setItem(SUPPLIER_CAT_KEY, JSON.stringify(cats));
};

const SupplierMgmtTab = () => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>(loadSupplierCategories());
  const [manageOpen, setManageOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [editCatIdx, setEditCatIdx] = useState<number | null>(null);
  const [editCatVal, setEditCatVal] = useState("");
  const defaultForm = { name: "", supplier_code: "", categories: [] as string[], contact_person: "", phone: "", gst_number: "", address: "", email: "", notes: "" };
  const [form, setForm] = useState(defaultForm);

  const load = async () => {
    const { data } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
    setSuppliers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const parseCats = (s: any): string[] => {
    if (!s?.category) return [];
    return String(s.category).split(",").map((c: string) => c.trim()).filter(Boolean);
  };

  const openAdd = async () => {
    setEditing(null);
    const { count } = await supabase.from("suppliers").select("id", { count: "exact", head: true });
    const code = `SUP-${String((count || 0) + 1).padStart(4, "0")}`;
    setForm({ ...defaultForm, supplier_code: code });
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ name: s.name || "", supplier_code: s.supplier_code || "", categories: parseCats(s), contact_person: s.contact_person || "", phone: s.phone || "", gst_number: s.gst_number || "", address: s.address || "", email: s.email || "", notes: s.notes || "" });
    setDialogOpen(true);
  };

  const toggleCat = (c: string) => {
    setForm((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Supplier name required", variant: "destructive" }); return; }
    if (form.categories.length === 0) { toast({ title: "Select at least one category", variant: "destructive" }); return; }
    const payload = { name: form.name, supplier_code: form.supplier_code || null, category: form.categories.join(", "), contact_person: form.contact_person || null, phone: form.phone || null, gst_number: form.gst_number || null, address: form.address || null, email: form.email || null, notes: form.notes || null };
    if (editing) {
      await supabase.from("suppliers").update(payload).eq("id", editing.id);
      toast({ title: "Supplier updated" });
    } else {
      await supabase.from("suppliers").insert(payload);
      toast({ title: "Supplier added" });
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("suppliers").delete().eq("id", id);
    toast({ title: "Supplier deleted" });
    load();
  };

  const addCategory = () => {
    const v = newCat.trim();
    if (!v) return;
    if (categories.includes(v)) { toast({ title: "Category already exists", variant: "destructive" }); return; }
    const next = [...categories, v];
    setCategories(next); saveSupplierCategories(next); setNewCat("");
  };
  const startEditCat = (i: number) => { setEditCatIdx(i); setEditCatVal(categories[i]); };
  const saveEditCat = () => {
    if (editCatIdx === null) return;
    const v = editCatVal.trim();
    if (!v) return;
    const next = categories.map((c, i) => (i === editCatIdx ? v : c));
    setCategories(next); saveSupplierCategories(next); setEditCatIdx(null); setEditCatVal("");
  };
  const removeCat = (i: number) => {
    const next = categories.filter((_, idx) => idx !== i);
    setCategories(next); saveSupplierCategories(next);
  };

  const filtered = suppliers.filter((s) => search === "" || s.name?.toLowerCase().includes(search.toLowerCase()) || s.contact_person?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search suppliers..." className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}><Edit size={14} className="mr-1" /> Manage Categories</Button>
          <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Supplier</Button>
        </div>
      </div>

      {loading ? <p className="text-center py-6 text-muted-foreground text-sm">Loading...</p> : filtered.length === 0 ? (
        <p className="text-center py-6 text-muted-foreground text-sm">No suppliers found. Click "Add Supplier" to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Supplier Name</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => {
              const cats = parseCats(s);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.supplier_code || "-"}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {cats.length === 0 ? "-" : cats.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{s.contact_person || "-"}</TableCell>
                  <TableCell>{s.phone || "-"}</TableCell>
                  <TableCell className="text-xs">{s.gst_number || "-"}</TableCell>
                  <TableCell className="text-xs">{s.email || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit size={14} /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Supplier Code</Label><Input value={form.supplier_code} readOnly className="bg-muted" /></div>
              <div><Label>Supplier Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Supplier Categories * <span className="text-xs text-muted-foreground font-normal">(select one or more)</span></Label>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setManageOpen(true)}>Manage</Button>
              </div>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No categories. Click "Manage" to add.</p>
                ) : categories.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <Checkbox id={`cat-${c}`} checked={form.categories.includes(c)} onCheckedChange={() => toggleCat(c)} />
                    <label htmlFor={`cat-${c}`} className="text-sm cursor-pointer">{c}</label>
                  </div>
                ))}
              </div>
              {form.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.categories.map((c) => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div><Label>Phone Number</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>GST Number</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? "Update" : "Add Supplier"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Categories Dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Manage Supplier Categories</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
              <Button onClick={addCategory}><Plus size={14} className="mr-1" /> Add</Button>
            </div>
            <div className="border rounded-md divide-y">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet.</p>
              ) : categories.map((c, i) => (
                <div key={i} className="flex items-center gap-2 p-2">
                  {editCatIdx === i ? (
                    <>
                      <Input value={editCatVal} onChange={(e) => setEditCatVal(e.target.value)} className="h-8" autoFocus />
                      <Button size="sm" onClick={saveEditCat}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditCatIdx(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{c}</span>
                      <Button size="icon" variant="ghost" onClick={() => startEditCat(i)}><Edit size={14} /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeCat(i)}><Trash2 size={14} /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setManageOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ClinicSettingsTabs = ({ activeTab = "treatments" }: ClinicSettingsTabsProps) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchCounts = async () => {
      const [adminUsersResult, doctors, treatments, medicines, labs, labWorks, sources, supplierItems, suppliersCount, scanCenters, bloodLabs] = await Promise.all([
        callAdminUsersManager<{ users: ManagedAdminUser[] }>({ action: "list" }).catch(() => ({ users: [] })),
        supabase.from("doctors").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("clinic_treatments").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("medicines").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("labs").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("lab_works").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("lead_sources").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("supplier_items").select("id", { count: "exact", head: true }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase.from("scan_centers").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("blood_labs").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);

      const brandsCountRes = await supabase.from("clinic_brands" as any).select("id", { count: "exact", head: true }).eq("is_active", true);

      setCounts({
        users: adminUsersResult.users?.length || 0,
        doctors: doctors.count || 0,
        treatments: treatments.count || 0,
        medicines: medicines.count || 0,
        labs: labs.count || 0,
        labWorks: labWorks.count || 0,
        sources: sources.count || 0,
        inventory: supplierItems.count || 0,
        suppliers: suppliersCount.count || 0,
        scanCenters: scanCenters.count || 0,
        bloodLabs: bloodLabs.count || 0,
        brands: brandsCountRes.count || 0,
      });
    };

    void fetchCounts();
  }, []);

  const countBadge = (n: number) => (
    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4 min-w-[18px] justify-center bg-primary/10 text-primary border-0">
      {n}
    </Badge>
  );

  return (
    <Card className="shadow-card">
      <CardContent className="p-4 pt-4">
        <Tabs defaultValue={activeTab} className="w-full">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 mb-4">
            <TabsTrigger value="doctors" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Stethoscope size={13} className="mr-1" /> Doctors {countBadge(counts.doctors || 0)}
            </TabsTrigger>
            <TabsTrigger value="treatments" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Wrench size={13} className="mr-1" /> Treatments {countBadge(counts.treatments || 0)}
            </TabsTrigger>
            <TabsTrigger value="medicines" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Pill size={13} className="mr-1" /> Medicines {countBadge(counts.medicines || 0)}
            </TabsTrigger>
            <TabsTrigger value="labs" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <FlaskConical size={13} className="mr-1" /> Labs {countBadge(counts.labs || 0)}
            </TabsTrigger>
            <TabsTrigger value="lab-work" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <FlaskConical size={13} className="mr-1" /> Lab Work {countBadge(counts.labWorks || 0)}
            </TabsTrigger>
            <TabsTrigger value="sources" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Globe size={13} className="mr-1" /> Sources {countBadge(counts.sources || 0)}
            </TabsTrigger>
            <TabsTrigger value="scan-centers" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Syringe size={13} className="mr-1" /> Scan Centers {countBadge(counts.scanCenters || 0)}
            </TabsTrigger>
            <TabsTrigger value="blood-labs" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <FlaskConical size={13} className="mr-1" /> Blood Labs {countBadge(counts.bloodLabs || 0)}
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Truck size={13} className="mr-1" /> Suppliers {countBadge(counts.suppliers || 0)}
            </TabsTrigger>
            <TabsTrigger value="brands" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Package size={13} className="mr-1" /> Brands {countBadge(counts.brands || 0)}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="doctors"><DoctorsTab /></TabsContent>
          <TabsContent value="treatments"><TreatmentsTab /></TabsContent>

          <TabsContent value="medicines"><MedicinesWithTemplates /></TabsContent>
          <TabsContent value="labs"><LabsTab /></TabsContent>
          <TabsContent value="lab-work"><LabWorkTab /></TabsContent>
          <TabsContent value="sources"><SourcesTab /></TabsContent>
          <TabsContent value="scan-centers"><ScanCentersTab /></TabsContent>
          <TabsContent value="blood-labs"><BloodLabsTab /></TabsContent>
          <TabsContent value="suppliers"><SupplierMgmtTab /></TabsContent>
          <TabsContent value="brands"><BrandsTab /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ClinicSettingsTabs;
