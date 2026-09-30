import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { UserCog, Plus, X, Loader2, Pencil, Trash2 } from "lucide-react";
import { type AppRole } from "@/lib/roleAccess";

interface RoleDef {
  role_key: string;
  display_label: string;
  department: string;
  sub_team: string | null;
  is_active: boolean;
}

interface UserWithRoles {
  id: string;
  full_name: string;
  active: boolean;
  roles: AppRole[];
}

interface DepartmentLite {
  id: string;
  name: string;
  is_active: boolean;
}

const UserRolesManager = () => {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [roleDefs, setRoleDefs] = useState<RoleDef[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>("__all__");

  // Edit dialog state
  const [editUser, setEditUser] = useState<UserWithRoles | null>(null);
  const [editSelectedRole, setEditSelectedRole] = useState<string>("");

  // Delete confirmation
  const [deleteUser, setDeleteUser] = useState<UserWithRoles | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [profilesRes, userRolesRes, customRolesRes, deptRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, active"),
      supabase.from("user_roles").select("user_id, role"),
      supabase
        .from("custom_roles")
        .select("role_key, display_label, department, sub_team, is_active")
        .order("sort_order", { ascending: true }),
      (supabase as any)
        .from("departments")
        .select("id, name, is_active")
        .order("sort_order", { ascending: true }),
    ]);

    if (profilesRes.data) {
      const userList: UserWithRoles[] = profilesRes.data.map((p: any) => ({
        id: p.id,
        full_name: p.full_name || "Unknown",
        active: p.active !== false,
        roles: (userRolesRes.data || [])
          .filter((r: any) => r.user_id === p.id)
          .map((r: any) => r.role as AppRole),
      }));
      setUsers(userList);
      // Keep edit dialog in sync if open
      setEditUser((prev) => (prev ? userList.find((u) => u.id === prev.id) || null : prev));
    }
    if (customRolesRes.data) setRoleDefs(customRolesRes.data as RoleDef[]);
    if (deptRes.data) setDepartments(deptRes.data as DepartmentLite[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel("user-roles-list-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_roles" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "departments" }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const roleDefMap = useMemo(() => {
    const m: Record<string, RoleDef> = {};
    roleDefs.forEach((r) => {
      m[r.role_key] = r;
    });
    return m;
  }, [roleDefs]);

  const usersWithDept = useMemo(() => {
    return users.map((u) => {
      const depts = Array.from(
        new Set(
          u.roles
            .map((r) => roleDefMap[r]?.department)
            .filter(Boolean) as string[],
        ),
      );
      return { ...u, departments: depts };
    });
  }, [users, roleDefMap]);

  const filteredUsers = useMemo(() => {
    if (departmentFilter === "__all__") return usersWithDept;
    return usersWithDept.filter((u) =>
      u.departments.some((d) => d.toLowerCase() === departmentFilter.toLowerCase()),
    );
  }, [usersWithDept, departmentFilter]);

  const assignableRoles = useMemo(
    () => roleDefs.filter((r) => r.is_active),
    [roleDefs],
  );

  const addRole = async (userId: string, role: string) => {
    if (!role) {
      toast.error("Please select a role");
      return;
    }
    setBusy(userId);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: role as AppRole });
    setBusy(null);
    if (error) {
      if (error.code === "23505") toast.error("This role is already assigned");
      else if (error.code === "22P02")
        toast.error("This role isn't available for assignment yet (system limitation).");
      else toast.error(error.message);
    } else {
      toast.success(`${roleDefMap[role]?.display_label || role} assigned`);
      setEditSelectedRole("");
    }
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) toast.error(error.message);
    else toast.success("Role removed");
  };

  const toggleActive = async (userId: string, next: boolean) => {
    setBusy(userId);
    const { error } = await supabase.from("profiles").update({ active: next }).eq("id", userId);
    setBusy(null);
    if (error) toast.error(error.message);
    else toast.success(next ? "User activated" : "User deactivated");
  };

  const confirmDeleteUser = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    // Remove all role assignments first, then deactivate the profile
    const { error: rolesErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", deleteUser.id);
    if (rolesErr) {
      setDeleting(false);
      toast.error(rolesErr.message);
      return;
    }
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ active: false })
      .eq("id", deleteUser.id);
    setDeleting(false);
    if (profileErr) {
      toast.error(profileErr.message);
    } else {
      toast.success("User removed and all roles cleared");
      setDeleteUser(null);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <UserCog size={16} /> User Roles Management
          </CardTitle>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="Filter by department..." />
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
        </CardHeader>
        <CardContent className="p-0">
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-4">
              {users.length === 0 ? "No registered users found." : "No users match the selected department."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">User</TableHead>
                    <TableHead className="w-[140px]">Department</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[110px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground shrink-0">
                            {user.full_name?.[0]?.toUpperCase() || "U"}
                          </div>
                          <span className="text-sm font-medium truncate">{user.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {user.departments.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          ) : (
                            user.departments.map((d) => (
                              <Badge key={d} variant="outline" className="text-[10px] capitalize">
                                {d}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">No roles</span>
                          ) : (
                            user.roles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-xs">
                                {roleDefMap[role]?.display_label || role}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Switch
                            checked={user.active}
                            onCheckedChange={(v) => toggleActive(user.id, v)}
                            disabled={busy === user.id}
                          />
                          <span className="text-[10px] text-muted-foreground w-12 text-left">
                            {user.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditUser(user);
                              setEditSelectedRole("");
                            }}
                            title="Edit roles"
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteUser(user)}
                            title="Remove user"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Roles Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCog size={16} /> Edit Roles — {editUser?.full_name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign or remove roles for this user. Changes save instantly.
            </DialogDescription>
          </DialogHeader>

          {editUser && (
            <ScrollArea className="flex-1 pr-3 -mr-3">
              <div className="space-y-4 py-1">
                {/* Current roles */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    Current Roles
                  </h4>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md border border-dashed">
                    {editUser.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        No roles assigned yet
                      </span>
                    ) : (
                      editUser.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="secondary"
                          className="text-xs gap-1 pr-1"
                        >
                          <span className="capitalize text-muted-foreground mr-0.5">
                            [{roleDefMap[role]?.department || "—"}]
                          </span>
                          {roleDefMap[role]?.display_label || role}
                          <button
                            onClick={() => removeRole(editUser.id, role)}
                            className="ml-0.5 hover:text-destructive"
                            title="Remove role"
                          >
                            <X size={11} />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                {/* Assign new role */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    Assign New Role
                  </h4>
                  <div className="flex gap-2">
                    <Select
                      value={editSelectedRole}
                      onValueChange={setEditSelectedRole}
                    >
                      <SelectTrigger className="h-9 text-xs flex-1">
                        <SelectValue placeholder="Select a role to add..." />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles
                          .filter(
                            (r) => !editUser.roles.includes(r.role_key as AppRole),
                          )
                          .map((r) => (
                            <SelectItem
                              key={r.role_key}
                              value={r.role_key}
                              className="text-xs"
                            >
                              <span className="capitalize text-muted-foreground mr-1">
                                [{r.department}]
                              </span>
                              {r.display_label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-9 px-3 text-xs"
                      onClick={() => addRole(editUser.id, editSelectedRole)}
                      disabled={busy === editUser.id || !editSelectedRole}
                    >
                      {busy === editUser.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Plus size={13} className="mr-1" /> Add
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Account Status</p>
                    <p className="text-xs text-muted-foreground">
                      Inactive users cannot log in
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editUser.active}
                      onCheckedChange={(v) => toggleActive(editUser.id, v)}
                      disabled={busy === editUser.id}
                    />
                    <span className="text-xs text-muted-foreground w-12">
                      {editUser.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditUser(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all role assignments for{" "}
              <span className="font-semibold">{deleteUser?.full_name}</span> and
              deactivate the account. They will no longer be able to log in. This
              action cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteUser();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Trash2 size={13} className="mr-1" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserRolesManager;
