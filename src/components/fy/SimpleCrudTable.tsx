import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Settings2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useBranch } from "@/contexts/BranchContext";
import { FY_MONTHS, formatINR } from "@/lib/fyProjection";
import { useClinicMasters } from "@/hooks/useClinicMasters";

export type FieldType = "text" | "number" | "currency" | "month" | "select" | "textarea" | "treatment_select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  /** When set, the select options become user-managed (add/edit/delete) and persisted to localStorage. */
  manageableKey?: string;
}

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function ManageableSelect({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const storageKey = `fy_options_${field.manageableKey}`;
  const [options, setOptions] = useState<{ value: string; label: string }[]>(field.options || []);
  const [manageOpen, setManageOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { value: string; label: string }[];
        const map = new Map<string, { value: string; label: string }>();
        (field.options || []).forEach(o => map.set(o.value, o));
        parsed.forEach(o => map.set(o.value, o));
        setOptions(Array.from(map.values()));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = (next: { value: string; label: string }[]) => {
    setOptions(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const addOption = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = slugify(label);
    if (!value || options.some(o => o.value === value)) {
      toast({ title: "Already exists or invalid", variant: "destructive" });
      return;
    }
    persist([...options, { value, label }]);
    setNewLabel("");
  };

  const saveEdit = (oldValue: string) => {
    const label = editingLabel.trim();
    if (!label) return;
    persist(options.map(o => (o.value === oldValue ? { ...o, label } : o)));
    setEditingValue(null);
    setEditingLabel("");
  };

  const removeOption = (val: string) => {
    if (!confirm("Delete this option?")) return;
    persist(options.filter(o => o.value !== val));
    if (value === val) onChange("");
  };

  return (
    <>
      <Select value={value || ""} onValueChange={(v) => { if (v === "__manage__") { setManageOpen(true); } else { onChange(v); } }}>
        <SelectTrigger><SelectValue placeholder={field.placeholder || "Select"} /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          <SelectSeparator />
          <SelectItem value="__manage__">
            <span className="flex items-center gap-2 text-primary"><Settings2 className="h-3.5 w-3.5" /> Manage options…</span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage {field.label} options</DialogTitle>
            <DialogDescription>Add, rename or delete dropdown values.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="flex gap-2">
              <Input
                placeholder={`New ${field.label.toLowerCase()}…`}
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
              />
              <Button size="sm" onClick={addOption}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
              {options.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No options yet.</div>
              ) : options.map(o => (
                <div key={o.value} className="flex items-center gap-2 p-2">
                  {editingValue === o.value ? (
                    <>
                      <Input
                        value={editingLabel}
                        onChange={e => setEditingLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(o.value); }}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" onClick={() => saveEdit(o.value)}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditingValue(null); setEditingLabel(""); }}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{o.label}</span>
                      <Button size="icon" variant="ghost" onClick={() => { setEditingValue(o.value); setEditingLabel(o.label); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeOption(o.value)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getStoredOptions(manageableKey?: string): { value: string; label: string }[] {
  if (!manageableKey) return [];
  try {
    const stored = localStorage.getItem(`fy_options_${manageableKey}`);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

interface Props {
  table: string;
  fy: string;
  fields: FieldDef[];
  rows: any[];
  onChanged: () => void;
  title: string;
  emptyMessage?: string;
}

export default function SimpleCrudTable({ table, fy, fields, rows, onChanged, title, emptyMessage }: Props) {
  const { currentBranchId } = useBranch();
  const { treatmentOptions } = useClinicMasters();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const startNew = () => {
    const init: any = {};
    fields.forEach(f => { init[f.key] = f.defaultValue ?? (f.type === "number" || f.type === "currency" ? 0 : ""); });
    setForm(init);
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (row: any) => {
    const init: any = {};
    fields.forEach(f => { init[f.key] = row[f.key] ?? ""; });
    setForm(init);
    setEditing(row);
    setOpen(true);
  };

  const save = async () => {
    if (!currentBranchId) return;
    const payload: any = { ...form, financial_year: fy, branch_id: currentBranchId };
    fields.forEach(f => {
      if (f.type === "number" || f.type === "currency" || f.type === "month") {
        payload[f.key] = Number(payload[f.key]) || 0;
      }
    });
    const res = editing
      ? await (supabase as any).from(table).update(payload).eq("id", editing.id)
      : await (supabase as any).from(table).insert(payload);
    if (res.error) {
      toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Updated" : "Created" });
    setOpen(false);
    onChanged();
  };

  const remove = async (row: any) => {
    if (!confirm("Delete this entry?")) return;
    const res = await (supabase as any).from(table).delete().eq("id", row.id);
    if (res.error) {
      toast({ title: "Delete failed", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    onChanged();
  };

  const renderCell = (row: any, f: FieldDef) => {
    const v = row[f.key];
    if (f.type === "currency") return formatINR(Number(v) || 0);
    if (f.type === "month") return FY_MONTHS.find(m => m.num === Number(v))?.short || "—";
    if (f.type === "treatment_select") {
      return treatmentOptions.find(o => o.value === v)?.label || v || "—";
    }
    if (f.type === "select") {
      const merged = [...(f.options || []), ...getStoredOptions(f.manageableKey)];
      return merged.find(o => o.value === v)?.label || v || "—";
    }
    return v ?? "—";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {title}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              {fields.map(f => (
                <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                  <Label className="text-xs">{f.label}</Label>
                  {f.type === "month" ? (
                    <Select value={String(form[f.key] || "")} onValueChange={v => setForm({ ...form, [f.key]: Number(v) })}>
                      <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                      <SelectContent>
                        {FY_MONTHS.map(m => <SelectItem key={m.num} value={String(m.num)}>{m.full}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : f.type === "treatment_select" ? (
                    <Select value={String(form[f.key] || "")} onValueChange={v => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger><SelectValue placeholder={f.placeholder || "Select treatment"} /></SelectTrigger>
                      <SelectContent>
                        {treatmentOptions.length === 0 ? (
                          <SelectItem value="__none__" disabled>No treatments in Settings</SelectItem>
                        ) : treatmentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : f.type === "select" && f.manageableKey ? (
                    <ManageableSelect field={f} value={String(form[f.key] || "")} onChange={v => setForm({ ...form, [f.key]: v })} />
                  ) : f.type === "select" && f.options ? (
                    <Select value={String(form[f.key] || "")} onValueChange={v => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger><SelectValue placeholder={f.placeholder || "Select"} /></SelectTrigger>
                      <SelectContent>
                        {f.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  ) : (
                    <Input
                      type={f.type === "number" || f.type === "currency" ? "number" : "text"}
                      value={form[f.key] ?? ""}
                      onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">{emptyMessage || "No entries yet."}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {fields.map(f => <TableHead key={f.key}>{f.label}</TableHead>)}
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                {fields.map(f => <TableCell key={f.key}>{renderCell(row, f)}</TableCell>)}
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(row)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
