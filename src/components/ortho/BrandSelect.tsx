import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useClinicMasters } from "@/hooks/useClinicMasters";

interface Props {
  value: string | null | undefined;
  onChange: (val: string | null) => void;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function BrandSelect({ value, onChange, placeholder = "Select brand", size = "md", className = "" }: Props) {
  const { brandOptions, refetchBrands } = useClinicMasters();
  const [manageOpen, setManageOpen] = useState(false);
  const [brands, setBrands] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");

  const loadBrands = async () => {
    const { data } = await supabase.from("clinic_brands" as any).select("*").order("name");
    setBrands((data as any[]) || []);
  };

  const openManage = async () => {
    await loadBrands();
    setEditing(null);
    setName("");
    setManageOpen(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Brand name required"); return; }
    if (editing) {
      const { error } = await supabase.from("clinic_brands" as any).update({ name: trimmed }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Brand updated");
      if (editing.name === value) onChange(trimmed);
    } else {
      const { error } = await supabase.from("clinic_brands" as any).insert({ name: trimmed, is_active: true });
      if (error) { toast.error(error.message); return; }
      toast.success("Brand added");
      onChange(trimmed);
    }
    setEditing(null);
    setName("");
    await loadBrands();
    await refetchBrands();
  };

  const startEdit = (b: any) => { setEditing(b); setName(b.name); };

  const remove = async (b: any) => {
    if (!confirm(`Delete brand "${b.name}"?`)) return;
    const { error } = await supabase.from("clinic_brands" as any).delete().eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    if (b.name === value) onChange(null);
    toast.success("Brand deleted");
    await loadBrands();
    await refetchBrands();
  };

  const triggerCls = size === "sm" ? "h-8 text-xs" : "";

  return (
    <>
      <Select value={value || "__none__"} onValueChange={(v) => {
        if (v === "__manage__") { openManage(); return; }
        onChange(v === "__none__" ? null : v);
      }}>
        <SelectTrigger className={`${triggerCls} ${className}`}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Not set —</SelectItem>
          {brandOptions.map((b) => (
            <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
          ))}
          <div className="border-t my-1" />
          <SelectItem value="__manage__" className="text-primary font-medium">
            <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add / Manage Brands</span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Manage Brands</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">{editing ? "Edit Brand" : "New Brand"}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Invisalign, DentCare, 3M" onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
              </div>
              <Button size="sm" onClick={save}>{editing ? "Update" : "Add"}</Button>
              {editing && <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setName(""); }}>Cancel</Button>}
            </div>

            <div className="border rounded-md max-h-72 overflow-y-auto">
              {brands.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No brands yet. Add one above.</div>
              ) : brands.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0 hover:bg-muted/40">
                  <span className="text-sm">{b.name}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(b)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
