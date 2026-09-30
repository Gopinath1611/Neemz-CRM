import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Building2, Shield, UserCog, Plus, Pencil, Trash2, Loader2, Lock,
  ChevronRight, ChevronDown, X,
} from "lucide-react";
import { type AppRole } from "@/lib/roleAccess";

// ───── Types ─────
interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
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
interface UserWithRoles {
  id: string;
  full_name: string;
  active: boolean;
  roles: AppRole[];
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// ─── Color palette per department index for visual distinction ───
const deptColors = [
  { bar: "bg-primary", chip: "bg-primary/10 text-primary border-primary/30" },
  { bar: "bg-accent", chip: "bg-accent/10 text-accent-foreground border-accent/30" },
  { bar: "bg-success", chip: "bg-success/10 text-success border-success/30" },
  { bar: "bg-warning", chip: "bg-warning/10 text-warning-foreground border-warning/30" },
  { bar: "bg-destructive", chip: "bg-destructive/10 text-destructive border-destructive/30" },
  { bar: "bg-secondary", chip: "bg-secondary text-secondary-foreground border-border" },
];

const UnifiedRolesTree = () => {
  // ── Data state ──
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Expand/collapse ──
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // ── Department dialog ──
  const [deptDialog, setDeptDialog] = useState(false);
  const [deptEditing, setDeptEditing] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", description: "", is_active: true });
  const [deptDelete, setDeptDelete] = useState<Department | null>(null);

  // ── Role dialog ──
  const [roleDialog, setRoleDialog] = useState(false);
  const [roleEditing, setRoleEditing] = useState<CustomRole | null>(null);
  const [roleDeptDefault, setRoleDeptDefault] = useState<string>("");
  const [roleForm, setRoleForm] = useState({
    role_key: "",
    display_label: "",
    description: "",
    department: "",
    sub_team: "",
    is_active: true,
    reports_to: "__none__",
  });
  const [roleDelete, setRoleDelete] = useState<CustomRole | null>(null);

  // ── User assign dialog ──
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignRole, setAssignRole] = useState<CustomRole | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // ── Load everything ──
  const loadAll = async () => {
    setLoading(true);
    const [dRes, rRes, pRes, urRes] = await Promise.all([
      (supabase as any).from("departments").select("*").order("sort_order").order("name"),
      supabase.from("custom_roles").select("*").order("sort_order").order("display_label"),
      supabase.from("profiles").select("id, full_name, active"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (dRes.error) toast.error(dRes.error.message);
    else setDepartments((dRes.data || []) as Department[]);
    if (rRes.error) toast.error(rRes.error.message);
    else setRoles((rRes.data || []) as CustomRole[]);
    if (pRes.data) {
      const list: UserWithRoles[] = pRes.data.map((p: any) => ({
        id: p.id,
        full_name: p.full_name || "Unknown",
        active: p.active !== false,
        roles: (urRes.data || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role as AppRole),
      }));
      setUsers(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("unified-roles-tree")
      .on("postgres_changes", { event: "*", schema: "public", table: "departments" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_roles" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Grouping ──
  const rolesByDept = useMemo(() => {
    const m: Record<string, CustomRole[]> = {};
    roles.forEach((r) => {
      const key = (r.department || "").toLowerCase();
      if (!m[key]) m[key] = [];
      m[key].push(r);
    });
    return m;
  }, [roles]);

  const usersByRole = useMemo(() => {
    const m: Record<string, UserWithRoles[]> = {};
    users.forEach((u) => {
      u.roles.forEach((rk) => {
        if (!m[rk]) m[rk] = [];
        m[rk].push(u);
      });
    });
    return m;
  }, [users]);

  // ── Toggles ──
  const toggleDept = (id: string) => {
    setExpandedDepts((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleRole = (id: string) => {
    setExpandedRoles((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // ── Department CRUD ──
  const openAddDept = () => {
    setDeptEditing(null);
    setDeptForm({ name: "", description: "", is_active: true });
    setDeptDialog(true);
  };
  const openEditDept = (d: Department) => {
    setDeptEditing(d);
    setDeptForm({ name: d.name, description: d.description || "", is_active: d.is_active });
    setDeptDialog(true);
  };
  const saveDept = async () => {
    const name = deptForm.name.trim();
    if (!name) { toast.error("Department name is required"); return; }
    setBusy(true);
    if (deptEditing) {
      const { error } = await (supabase as any).from("departments").update({
        name, description: deptForm.description.trim() || null, is_active: deptForm.is_active,
      }).eq("id", deptEditing.id);
      if (error) toast.error(error.message);
      else { toast.success("Department updated"); setDeptDialog(false); }
    } else {
      const { error } = await (supabase as any).from("departments").insert({
        name, description: deptForm.description.trim() || null, is_active: deptForm.is_active,
      });
      if (error) {
        if (error.code === "23505") toast.error("A department with this name already exists");
        else toast.error(error.message);
      } else { toast.success("Department created"); setDeptDialog(false); }
    }
    setBusy(false);
  };
  const toggleDeptActive = async (d: Department, next: boolean) => {
    const { error } = await (supabase as any).from("departments").update({ is_active: next }).eq("id", d.id);
    if (error) toast.error(error.message);
    else toast.success(`${d.name} ${next ? "activated" : "deactivated"}`);
  };
  const confirmDeleteDept = async () => {
    if (!deptDelete) return;
    const { error } = await (supabase as any).from("departments").delete().eq("id", deptDelete.id);
    if (error) toast.error(error.message);
    else { toast.success("Department deleted"); setDeptDelete(null); }
  };

  // ── Role CRUD ──
  const openAddRole = (deptName?: string) => {
    setRoleEditing(null);
    setRoleDeptDefault(deptName || "");
    setRoleForm({
      role_key: "",
      display_label: "",
      description: "",
      department: deptName || departments[0]?.name || "",
      sub_team: "",
      is_active: true,
      reports_to: "__none__",
    });
    setRoleDialog(true);
  };
  const openEditRole = (r: CustomRole) => {
    setRoleEditing(r);
    setRoleForm({
      role_key: r.role_key,
      display_label: r.display_label,
      description: r.description || "",
      department: r.department || "",
      sub_team: r.sub_team || "",
      is_active: r.is_active,
      reports_to: r.reports_to || "__none__",
    });
    setRoleDialog(true);
  };
  const saveRole = async () => {
    const label = roleForm.display_label.trim();
    if (!label) { toast.error("Display label is required"); return; }
    if (!roleForm.department.trim()) { toast.error("Department is required"); return; }
    const key = (roleForm.role_key.trim() || slugify(label)).toLowerCase();
    if (!key) { toast.error("Role key is required"); return; }
    setBusy(true);
    const reportsToValue = roleForm.reports_to === "__none__" ? null : roleForm.reports_to;
    if (roleEditing) {
      const payload: any = {
        display_label: label,
        description: roleForm.description.trim() || null,
        department: roleForm.department.trim().toLowerCase(),
        sub_team: roleForm.sub_team.trim() || null,
        is_active: roleForm.is_active,
        reports_to: reportsToValue,
      };
      if (!roleEditing.is_system) payload.role_key = key;
      const { error } = await supabase.from("custom_roles").update(payload).eq("id", roleEditing.id);
      if (error) toast.error(error.message);
      else { toast.success("Role updated"); setRoleDialog(false); }
    } else {
      const { error } = await supabase.from("custom_roles").insert({
        role_key: key,
        display_label: label,
        description: roleForm.description.trim() || null,
        department: roleForm.department.trim().toLowerCase(),
        sub_team: roleForm.sub_team.trim() || null,
        is_active: roleForm.is_active,
        is_system: false,
        reports_to: reportsToValue,
      } as any);
      if (error) {
        if (error.code === "23505") toast.error("A role with this key already exists");
        else toast.error(error.message);
      } else { toast.success("Role created"); setRoleDialog(false); }
    }
    setBusy(false);
  };
  const toggleRoleActive = async (r: CustomRole, next: boolean) => {
    const { error } = await supabase.from("custom_roles").update({ is_active: next }).eq("id", r.id);
    if (error) toast.error(error.message);
    else toast.success(`${r.display_label} ${next ? "activated" : "deactivated"}`);
  };
  const confirmDeleteRole = async () => {
    if (!roleDelete) return;
    const { error } = await supabase.from("custom_roles").delete().eq("id", roleDelete.id);
    if (error) toast.error(error.message);
    else { toast.success("Role deleted"); setRoleDelete(null); }
  };

  // ── User-role assignment ──
  const openAssign = (r: CustomRole) => {
    setAssignRole(r);
    setAssignUserId("");
    setAssignDialog(true);
  };
  const doAssign = async () => {
    if (!assignRole || !assignUserId) { toast.error("Please select a user"); return; }
    setBusy(true);
    const { error } = await supabase.from("user_roles").insert({
      user_id: assignUserId, role: assignRole.role_key as AppRole,
    });
    setBusy(false);
    if (error) {
      if (error.code === "23505") toast.error("This user already has this role");
      else if (error.code === "22P02") toast.error("Role not yet available for assignment");
      else toast.error(error.message);
    } else {
      toast.success("Role assigned");
      setAssignDialog(false);
    }
  };
  const removeUserRole = async (userId: string, roleKey: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", roleKey as AppRole);
    if (error) toast.error(error.message);
    else toast.success("Role removed");
  };
  const toggleUserActive = async (u: UserWithRoles, next: boolean) => {
    const { error } = await supabase.from("profiles").update({ active: next }).eq("id", u.id);
    if (error) toast.error(error.message);
    else toast.success(next ? "User activated" : "User deactivated");
  };

  // ── Expand / collapse all ──
  const expandAll = () => {
    setExpandedDepts(new Set(departments.map((d) => d.id)));
    setExpandedRoles(new Set(roles.map((r) => r.id)));
  };
  const collapseAll = () => {
    setExpandedDepts(new Set());
    setExpandedRoles(new Set());
  };

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ── Available users to assign to a role (not already holding it) ──
  const usersAvailableFor = (roleKey: string) =>
    users.filter((u) => !u.roles.includes(roleKey as AppRole));

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Building2 size={16} /> Departments, Roles & Users
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Click a department to view its roles. Click a role to view assigned users.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={expandAll}>
            Expand all
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={collapseAll}>
            Collapse all
          </Button>
          <Button size="sm" onClick={openAddDept} className="gradient-primary border-0 text-xs h-8">
            <Plus size={14} className="mr-1" /> Add Department
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-2 max-h-[65vh] overflow-y-auto">
        {departments.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">
            No departments yet. Add your first department to get started.
          </p>
        )}

        {departments.map((dept, di) => {
          const colors = deptColors[di % deptColors.length];
          const deptRoles = rolesByDept[dept.name.toLowerCase()] || [];
          const isOpen = expandedDepts.has(dept.id);
          return (
            <div key={dept.id} className="rounded-lg border bg-card overflow-hidden">
              {/* DEPARTMENT ROW */}
              <div className={`flex items-center gap-2 p-2 ${isOpen ? "border-b" : ""}`}>
                <div className={`w-1 h-6 rounded-full ${colors.bar} shrink-0`} />
                <button
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:bg-muted/40 rounded px-1 py-0.5 -ml-1"
                  onClick={() => toggleDept(dept.id)}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Building2 size={13} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-semibold capitalize truncate">{dept.name}</span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${colors.chip}`}>
                    {deptRoles.length} role{deptRoles.length !== 1 ? "s" : ""}
                  </Badge>
                  {!dept.is_active && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Inactive</Badge>
                  )}
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Switch
                    checked={dept.is_active}
                    onCheckedChange={(v) => toggleDeptActive(dept, v)}
                    className="scale-75"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openAddRole(dept.name)} title="Add role to this department">
                    <Plus size={12} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDept(dept)} title="Edit department">
                    <Pencil size={12} />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeptDelete(dept)} title="Delete department"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>

              {/* ROLES UNDER DEPARTMENT */}
              {isOpen && (
                <div className="bg-muted/20 px-2 py-1.5 space-y-1">
                  {deptRoles.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic px-6 py-2">
                      No roles in this department yet.
                    </p>
                  ) : (
                    deptRoles.map((role) => {
                      const roleUsers = usersByRole[role.role_key] || [];
                      const rOpen = expandedRoles.has(role.id);
                      return (
                        <div key={role.id} className="ml-4 rounded-md border border-border/60 bg-background overflow-hidden">
                          {/* ROLE ROW */}
                          <div className={`flex items-center gap-1.5 p-1.5 ${rOpen ? "border-b" : ""}`}>
                            <button
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:bg-muted/40 rounded px-1 py-0.5"
                              onClick={() => toggleRole(role.id)}
                            >
                              {rOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              <Shield size={11} className="text-muted-foreground shrink-0" />
                              <span className="text-xs font-medium truncate">{role.display_label}</span>
                              {role.sub_team && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  {role.sub_team}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                {roleUsers.length} user{roleUsers.length !== 1 ? "s" : ""}
                              </Badge>
                              {role.is_system && (
                                <Badge variant="secondary" className="text-[9px] gap-1 px-1 py-0">
                                  <Lock size={8} /> System
                                </Badge>
                              )}
                              {!role.is_active && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">Inactive</Badge>
                              )}
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Switch
                                checked={role.is_active}
                                onCheckedChange={(v) => toggleRoleActive(role, v)}
                                className="scale-75"
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openAssign(role)} title="Assign user">
                                <UserCog size={11} />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditRole(role)} title="Edit role">
                                <Pencil size={11} />
                              </Button>
                              <Button
                                size="icon" variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive disabled:opacity-30"
                                onClick={() => setRoleDelete(role)}
                                disabled={role.is_system}
                                title={role.is_system ? "System roles cannot be deleted" : "Delete role"}
                              >
                                <Trash2 size={11} />
                              </Button>
                            </div>
                          </div>

                          {/* USERS UNDER ROLE */}
                          {rOpen && (
                            <div className="bg-muted/10 px-2 py-1.5 space-y-1">
                              {roleUsers.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic px-6 py-1">
                                  No users assigned. Click the user icon to assign.
                                </p>
                              ) : (
                                roleUsers.map((u) => (
                                  <div key={u.id} className="ml-6 flex items-center gap-2 py-1 px-1.5 rounded hover:bg-muted/40">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold shrink-0">
                                      {u.full_name?.[0]?.toUpperCase() || "U"}
                                    </div>
                                    <span className="text-[11px] font-medium truncate flex-1">{u.full_name}</span>
                                    {!u.active && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0">Inactive</Badge>
                                    )}
                                    <Switch
                                      checked={u.active}
                                      onCheckedChange={(v) => toggleUserActive(u, v)}
                                      className="scale-75"
                                    />
                                    <Button
                                      size="icon" variant="ghost"
                                      className="h-5 w-5 text-destructive hover:text-destructive"
                                      onClick={() => removeUserRole(u.id, role.role_key)}
                                      title="Remove this role from user"
                                    >
                                      <X size={11} />
                                    </Button>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* ── Department Dialog ── */}
      <Dialog open={deptDialog} onOpenChange={setDeptDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{deptEditing ? "Edit Department" : "Add Department"}</DialogTitle>
            <DialogDescription className="text-xs">
              Departments group roles together (e.g. Clinic, Marketing, Finance).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={deptForm.name}
                onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Laboratory"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={deptForm.description}
                onChange={(e) => setDeptForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional description"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-xs font-medium">Active</Label>
              <Switch
                checked={deptForm.is_active}
                onCheckedChange={(v) => setDeptForm((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialog(false)}>Cancel</Button>
            <Button onClick={saveDept} disabled={busy} className="gradient-primary border-0">
              {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {deptEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Role Dialog ── */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{roleEditing ? "Edit Role" : "Add New Role"}</DialogTitle>
            <DialogDescription className="text-xs">
              {roleEditing?.is_system
                ? "This is a system role. Key cannot be changed."
                : roleDeptDefault
                  ? `Adding role inside "${roleDeptDefault}" department.`
                  : "Define a custom role that can be assigned to users."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-6 py-2 flex-1">
            <div className="space-y-1">
              <Label className="text-xs">Display Label *</Label>
              <Input
                value={roleForm.display_label}
                onChange={(e) =>
                  setRoleForm((p) => ({
                    ...p,
                    display_label: e.target.value,
                    role_key: roleEditing ? p.role_key : slugify(e.target.value),
                  }))
                }
                placeholder="e.g. Lab Technician"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department *</Label>
              <Select value={roleForm.department} onValueChange={(v) => setRoleForm((p) => ({ ...p, department: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.filter((d) => d.is_active).map((d) => (
                    <SelectItem key={d.id} value={d.name.toLowerCase()} className="capitalize">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sub-team</Label>
              <Input
                value={roleForm.sub_team}
                onChange={(e) => setRoleForm((p) => ({ ...p, sub_team: e.target.value }))}
                placeholder="e.g. Front Office, Doctors"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reports To</Label>
              <Select value={roleForm.reports_to} onValueChange={(v) => setRoleForm((p) => ({ ...p, reports_to: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No reporting manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-sm italic text-muted-foreground">
                    — None (top of hierarchy) —
                  </SelectItem>
                  {roles.filter((r) => r.is_active && (!roleEditing || r.id !== roleEditing.id)).map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-sm">
                      <span className="capitalize text-muted-foreground mr-1">[{r.department}]</span>
                      {r.display_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Role Key <span className="text-muted-foreground">(unique, lowercase)</span>
              </Label>
              <Input
                value={roleForm.role_key}
                onChange={(e) => setRoleForm((p) => ({ ...p, role_key: slugify(e.target.value) }))}
                placeholder="lab_technician"
                disabled={roleEditing?.is_system}
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))}
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
                checked={roleForm.is_active}
                onCheckedChange={(v) => setRoleForm((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 border-t pt-4 bg-background">
            <Button variant="outline" onClick={() => setRoleDialog(false)}>Cancel</Button>
            <Button onClick={saveRole} disabled={busy} className="gradient-primary border-0">
              {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {roleEditing ? "Update" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign User Dialog ── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <UserCog size={15} /> Assign User to Role
            </DialogTitle>
            <DialogDescription className="text-xs">
              {assignRole && (
                <>Assigning role <span className="font-semibold text-foreground">{assignRole.display_label}</span> to a user.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Select User *</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a user..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {assignRole && usersAvailableFor(assignRole.role_key).length === 0 ? (
                    <div className="text-xs text-muted-foreground italic px-3 py-2">
                      All users already have this role.
                    </div>
                  ) : (
                    assignRole && usersAvailableFor(assignRole.role_key).map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-sm">
                        {u.full_name} {!u.active && <span className="text-[10px] text-muted-foreground">(inactive)</span>}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={doAssign} disabled={busy || !assignUserId} className="gradient-primary border-0">
              {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Department ── */}
      <AlertDialog open={!!deptDelete} onOpenChange={(o) => !o && setDeptDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department "{deptDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Roles linked to this department will keep their existing department label. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDept} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Role ── */}
      <AlertDialog open={!!roleDelete} onOpenChange={(o) => !o && setRoleDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{roleDelete?.display_label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the role definition. Users currently holding this role will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default UnifiedRolesTree;
