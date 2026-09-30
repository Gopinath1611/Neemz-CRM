import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

export interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

const DepartmentsManager = () => {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_active: true });

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("departments")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    else setItems((data || []) as Department[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("departments-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "departments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({ name: d.name, description: d.description || "", is_active: d.is_active });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Department name is required");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await (supabase as any)
        .from("departments")
        .update({
          name,
          description: form.description.trim() || null,
          is_active: form.is_active,
        })
        .eq("id", editing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Department updated");
        setDialogOpen(false);
        await load();
      }
    } else {
      const { error } = await (supabase as any).from("departments").insert({
        name,
        description: form.description.trim() || null,
        is_active: form.is_active,
      });
      if (error) {
        if (error.code === "23505") toast.error("A department with this name already exists");
        else toast.error(error.message);
      } else {
        toast.success("Department created");
        setDialogOpen(false);
        await load();
      }
    }
    setSaving(false);
  };

  const toggleActive = async (d: Department, next: boolean) => {
    const { error } = await (supabase as any)
      .from("departments")
      .update({ is_active: next })
      .eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${d.name} ${next ? "activated" : "deactivated"}`);
      await load();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await (supabase as any)
      .from("departments")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Department deleted");
      setDeleteTarget(null);
      await load();
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Building2 size={16} /> Departments
        </CardTitle>
        <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
          <Plus size={14} className="mr-1" /> Add Department
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-12">#</TableHead>
                  <TableHead className="text-xs">Department</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs w-24">Active</TableHead>
                  <TableHead className="text-xs text-right w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d, i) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{d.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Switch checked={d.is_active} onCheckedChange={(v) => toggleActive(d, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(d)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(d)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                      No departments yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Department" : "Add Department"}</DialogTitle>
            <DialogDescription className="text-xs">
              Departments group roles together (e.g. Clinic, Marketing, Finance).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Laboratory"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional description"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-xs font-medium">Active</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gradient-primary border-0">
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Roles linked to this department will keep the existing department label. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default DepartmentsManager;
