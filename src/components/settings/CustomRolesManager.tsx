import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { Shield, Plus, Pencil, Trash2, Loader2, Lock } from "lucide-react";

interface CustomRole {
  id: string;
  role_key: string;
  display_label: string;
  description: string | null;
  department: string;
  sub_team: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  reports_to: string | null;
}

interface DepartmentLite {
  id: string;
  name: string;
  is_active: boolean;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const CustomRolesManager = () => {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState<string>("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    role_key: "",
    display_label: "",
    description: "",
    department: "",
    sub_team: "",
    is_active: true,
    reports_to: "__none__" as string,
  });

  const load = async () => {
    setLoading(true);
    const [rolesRes, deptRes] = await Promise.all([
      supabase
        .from("custom_roles")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("display_label", { ascending: true }),
      (supabase as any)
        .from("departments")
        .select("id, name, is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);
    if (rolesRes.error) toast.error(rolesRes.error.message);
    else setRoles((rolesRes.data || []) as CustomRole[]);
    if (deptRes.error) toast.error(deptRes.error.message);
    else setDepartments((deptRes.data || []) as DepartmentLite[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("custom-roles-mgr-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_roles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "departments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredRoles = useMemo(() => {
    if (departmentFilter === "__all__") return roles;
    return roles.filter(
      (r) => (r.department || "").toLowerCase() === departmentFilter.toLowerCase(),
    );
  }, [roles, departmentFilter]);

  const roleMap = useMemo(() => {
    const m: Record<string, CustomRole> = {};
    roles.forEach((r) => { m[r.id] = r; });
    return m;
  }, [roles]);


  const openAdd = () => {
    setEditing(null);
    setForm({
      role_key: "",
      display_label: "",
      description: "",
      department: departments[0]?.name || "",
      sub_team: "",
      is_active: true,
      reports_to: "__none__",
    });
    setDialogOpen(true);
  };

  const openEdit = (r: CustomRole) => {
    setEditing(r);
    setForm({
      role_key: r.role_key,
      display_label: r.display_label,
      description: r.description || "",
      department: r.department || "",
      sub_team: r.sub_team || "",
      is_active: r.is_active,
      reports_to: r.reports_to || "__none__",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const label = form.display_label.trim();
    if (!label) {
      toast.error("Display label is required");
      return;
    }
    if (!form.department.trim()) {
      toast.error("Department is required");
      return;
    }
    const key = (form.role_key.trim() || slugify(label)).toLowerCase();
    if (!key) {
      toast.error("Role key is required");
      return;
    }
    setSaving(true);
    const reportsToValue = form.reports_to === "__none__" ? null : form.reports_to;
    if (editing) {
      const payload: any = {
        display_label: label,
        description: form.description.trim() || null,
        department: form.department.trim().toLowerCase(),
        sub_team: form.sub_team.trim() || null,
        is_active: form.is_active,
        reports_to: reportsToValue,
      };
      if (!editing.is_system) payload.role_key = key;
      const { error } = await supabase.from("custom_roles").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Role updated");
        setDialogOpen(false);
      }
    } else {
      const { error } = await supabase.from("custom_roles").insert({
        role_key: key,
        display_label: label,
        description: form.description.trim() || null,
        department: form.department.trim().toLowerCase(),
        sub_team: form.sub_team.trim() || null,
        is_active: form.is_active,
        is_system: false,
        reports_to: reportsToValue,
      } as any);
      if (error) {
        if (error.code === "23505") toast.error("A role with this key already exists");
        else toast.error(error.message);
      } else {
        toast.success("Role created");
        setDialogOpen(false);
      }
    }
    setSaving(false);
  };

  const toggleActive = async (r: CustomRole, next: boolean) => {
    const { error } = await supabase
      .from("custom_roles")
      .update({ is_active: next })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else toast.success(`${r.display_label} ${next ? "activated" : "deactivated"}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("custom_roles").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Role deleted");
      setDeleteTarget(null);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Shield size={16} /> Manage Roles
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="Filter dept..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.name.toLowerCase()} className="text-xs capitalize">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openAdd} className="gradient-primary border-0 text-xs h-8">
            <Plus size={14} className="mr-1" /> Add Role
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border-t overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] h-8 px-2 w-10">#</TableHead>
                  <TableHead className="text-[11px] h-8 px-2">Role</TableHead>
                  <TableHead className="text-[11px] h-8 px-2">Department</TableHead>
                  <TableHead className="text-[11px] h-8 px-2">Sub-team</TableHead>
                  <TableHead className="text-[11px] h-8 px-2">Reports To</TableHead>
                  <TableHead className="text-[11px] h-8 px-2">Description</TableHead>
                  <TableHead className="text-[11px] h-8 px-2 w-16">Type</TableHead>
                  <TableHead className="text-[11px] h-8 px-2 w-14">Active</TableHead>
                  <TableHead className="text-[11px] h-8 px-2 text-right w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] py-1.5 px-2">{i + 1}</TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 font-medium">{r.display_label}</TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 capitalize">{r.department || "—"}</TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 text-muted-foreground">{r.sub_team || "—"}</TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 text-muted-foreground">
                      {r.reports_to && roleMap[r.reports_to] ? (
                        <span className="capitalize">{roleMap[r.reports_to].display_label}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 text-muted-foreground max-w-[180px] truncate">
                      {r.description || "—"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      {r.is_system ? (
                        <Badge variant="secondary" className="text-[9px] gap-1 px-1.5 py-0">
                          <Lock size={9} /> System
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">Custom</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
                    </TableCell>
                    <TableCell className="text-right py-1.5 px-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(r)}>
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive disabled:opacity-30"
                          onClick={() => setDeleteTarget(r)}
                          disabled={r.is_system}
                          title={r.is_system ? "System roles cannot be deleted" : "Delete"}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRoles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                      No roles found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{editing ? "Edit Role" : "Add New Role"}</DialogTitle>
            <DialogDescription className="text-xs">
              {editing?.is_system
                ? "This is a system role. Key cannot be changed."
                : "Define a custom role that can be assigned to users."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-6 py-2 flex-1">
            <div className="space-y-1">
              <Label className="text-xs">Display Label *</Label>
              <Input
                value={form.display_label}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    display_label: e.target.value,
                    role_key: editing ? p.role_key : slugify(e.target.value),
                  }))
                }
                placeholder="e.g. Lab Technician"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department *</Label>
              <Select
                value={form.department}
                onValueChange={(v) => setForm((p) => ({ ...p, department: v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments
                    .filter((d) => d.is_active)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.name.toLowerCase()} className="capitalize">
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Need a new department? Add one in the Departments section above.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sub-team</Label>
              <Input
                value={form.sub_team}
                onChange={(e) => setForm((p) => ({ ...p, sub_team: e.target.value }))}
                placeholder="e.g. Front Office, Doctors"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reports To</Label>
              <Select
                value={form.reports_to}
                onValueChange={(v) => setForm((p) => ({ ...p, reports_to: v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No reporting manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-sm italic text-muted-foreground">
                    — None (top of hierarchy) —
                  </SelectItem>
                  {roles
                    .filter((r) => r.is_active && (!editing || r.id !== editing.id))
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-sm">
                        <span className="capitalize text-muted-foreground mr-1">[{r.department}]</span>
                        {r.display_label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Which role does this position report to?
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Role Key <span className="text-muted-foreground">(unique, lowercase)</span>
              </Label>
              <Input
                value={form.role_key}
                onChange={(e) => setForm((p) => ({ ...p, role_key: slugify(e.target.value) }))}
                placeholder="lab_technician"
                disabled={editing?.is_system}
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="What this role is responsible for…"
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-xs font-medium">Active</Label>
                <p className="text-[10px] text-muted-foreground">
                  Inactive roles are hidden from assignment dropdowns
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 border-t pt-4 bg-background">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gradient-primary border-0">
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {editing ? "Update" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{deleteTarget?.display_label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the role definition. Users currently holding this role will need to be reassigned.
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

export default CustomRolesManager;
