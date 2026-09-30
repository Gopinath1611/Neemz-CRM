import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Users, UserPlus, Settings, Loader2, Plus, Shield, Eye, EyeOff,
  ChevronDown, ChevronRight, Trash2, Save, Pencil, Search, MoreVertical,
  User as UserIcon, Bot, Sparkles, Upload, X, KeyRound, ArrowLeft, Check, Repeat,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { roleLabels, type AppRole } from "@/lib/roleAccess";
import { navGroups } from "@/components/CRMLayout";
import AccessPreviewDialog from "@/components/settings/AccessPreviewDialog";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";

interface StaffMember {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string | null;
  roles: AppRole[];
  active: boolean;
  manager_user_id?: string | null;
}

interface CustomRole {
  id: string;
  role_key: string;
  display_label: string;
  department: string;
  sub_team: string | null;
  is_active: boolean;
}

// --- Auto-derive module groups from sidebar (kept from previous implementation) ---
const dynamicGroups = navGroups.flatMap((g) => {
  const groups: { group: string; modules: { path: string; label: string }[] }[] = [];
  const topSeen = new Map<string, string>();
  g.items.forEach((it) => { if (it.to && !topSeen.has(it.to)) topSeen.set(it.to, it.label); });
  if (topSeen.size > 0) {
    groups.push({
      group: g.label,
      modules: Array.from(topSeen.entries()).map(([path, label]) => ({ path, label })),
    });
  }
  (g.subGroups ?? []).forEach((sg) => {
    const subSeen = new Map<string, string>();
    sg.items.forEach((it) => { if (it.to && !subSeen.has(it.to)) subSeen.set(it.to, it.label); });
    if (subSeen.size > 0) {
      groups.push({
        group: `${g.label} › ${sg.label}`,
        modules: Array.from(subSeen.entries()).map(([path, label]) => ({ path, label })),
      });
    }
  });
  return groups;
}).filter((g) => g.modules.length > 0);

const staticGroups = [
  {
    group: "Analytics & Settings",
    modules: [
      { path: "/", label: "Dashboard" },
      { path: "/analytics", label: "AI Analytics" },
      { path: "/settings", label: "Settings" },
      { path: "/user-manual", label: "User Manual" },
    ],
  },
];

export const moduleGroups = [...dynamicGroups, ...staticGroups];
const allModulePaths = moduleGroups.flatMap((g) => g.modules.map((m) => m.path));

// Card background gradients cycled across staff cards
const cardGradients = [
  "from-sky-400 to-cyan-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-fuchsia-500",
  "from-indigo-400 to-blue-500",
  "from-lime-400 to-green-500",
  "from-red-400 to-rose-500",
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "U";

const StaffManager = () => {
  const queryClient = useQueryClient();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");

  // Add Staff
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "human">("choose");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("receptionist");
  const [newManager, setNewManager] = useState<string>("");
  const [newAvatar, setNewAvatar] = useState<File | null>(null);
  const [newAvatarPreview, setNewAvatarPreview] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({});


  // Manage Staff (Roles & Permissions)
  const [manageOpen, setManageOpen] = useState(false);

  // Edit Staff
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRoles, setEditRoles] = useState<AppRole[]>([]);
  const [editManager, setEditManager] = useState<string>("");
  const [editAvatar, setEditAvatar] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const editAvatarRef = useRef<HTMLInputElement>(null);

  // Reset password
  const [resetPwFor, setResetPwFor] = useState<StaffMember | null>(null);
  const [resetPwValue, setResetPwValue] = useState("");
  const [resetPwShow, setResetPwShow] = useState(false);
  const [resetPwSaving, setResetPwSaving] = useState(false);

  // Module access dialog (per-user, existing system)
  const [accessFor, setAccessFor] = useState<StaffMember | null>(null);
  const [userAccess, setUserAccess] = useState<Record<string, boolean>>({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Access preview (read-only)
  const [previewFor, setPreviewFor] = useState<StaffMember | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Quick change role
  const [changeRoleFor, setChangeRoleFor] = useState<StaffMember | null>(null);
  const [changeRoleValues, setChangeRoleValues] = useState<string[]>([]);
  const [changeRoleSaving, setChangeRoleSaving] = useState(false);

  const openChangeRole = (m: StaffMember) => {
    setChangeRoleFor(m);
    setChangeRoleValues((m.roles as string[]) || []);
  };

  const toggleChangeRole = (key: string) => {
    setChangeRoleValues((prev) => prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]);
  };

  const submitChangeRole = async () => {
    if (!changeRoleFor) return;
    if (changeRoleValues.length === 0) { toast.error("Select at least one role"); return; }
    const before = [...changeRoleFor.roles].sort().join(",");
    const after = [...changeRoleValues].sort().join(",");
    if (before === after) { setChangeRoleFor(null); return; }
    setChangeRoleSaving(true);
    try {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", changeRoleFor.id);
      if (delErr) throw delErr;
      const rows = changeRoleValues.map((role) => ({ user_id: changeRoleFor.id, role: role as AppRole }));
      const { error: insErr } = await supabase.from("user_roles").insert(rows as any);
      if (insErr) throw insErr;
      const labels = changeRoleValues.map((r) => roleLabels[r as AppRole] || r).join(", ");
      toast.success(`${changeRoleFor.full_name} assigned to ${labels}`);
      setChangeRoleFor(null);
      await fetchAll();
    } catch (e: any) { toast.error(e.message || "Failed to update roles"); }
    finally { setChangeRoleSaving(false); }
  };



  // ---------- Data fetch ----------
  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: cr }, { data: reports }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url, active"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("custom_roles")
        .select("id, role_key, display_label, department, sub_team, is_active")
        .order("sort_order", { ascending: true }),
      (supabase.from as any)("user_reports_to").select("user_id, manager_user_id"),
    ]);

    const managerMap = new Map<string, string>();
    (reports as Array<{ user_id: string; manager_user_id: string }> | null)?.forEach((r) => {
      managerMap.set(r.user_id, r.manager_user_id);
    });

    const emailMap = new Map<string, string>();
    const phoneMap = new Map<string, string>();
    try {
      const headers = await getFunctionAuthHeaders();
      const resp = await supabase.functions.invoke("manage-admin-users", { body: { action: "list" }, headers });
      const list = (resp.data as any)?.users as Array<{ user_id: string; email?: string; phone?: string }> | undefined;
      list?.forEach((u) => {
        if (u.email) emailMap.set(u.user_id, u.email);
        if (u.phone) phoneMap.set(u.user_id, u.phone);
      });
    } catch { /* ignore */ }

    if (profiles) {
      const list: StaffMember[] = profiles.map((p: any) => ({
        id: p.id,
        full_name: p.full_name || "Unknown",
        avatar_url: p.avatar_url,
        active: p.active !== false,
        email: emailMap.get(p.id) ?? "",
        phone: phoneMap.get(p.id) ?? "",
        roles: (roles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role as AppRole),
        manager_user_id: managerMap.get(p.id) ?? null,
      }));
      setStaff(list);
    }
    if (cr) setCustomRoles(cr as CustomRole[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const ch = supabase
      .channel("staff-manager-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_roles" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_reports_to" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff
      .filter((s) => (activeTab === "active" ? s.active : !s.active))
      .filter((s) => !q ||
        s.full_name.toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q));
  }, [staff, activeTab, search]);

  // ---------- Avatar upload ----------
  const uploadAvatar = async (userId: string, file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `staff-avatars/${userId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("clinic-assets").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error("Avatar upload failed: " + error.message); return null; }
    const { data } = supabase.storage.from("clinic-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>, mode: "new" | "edit") => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    if (mode === "new") { setNewAvatar(f); setNewAvatarPreview(url); }
    else { setEditAvatar(f); setEditAvatarPreview(url); }
  };

  // ---------- Reports-To helpers (shared with ManageRolesDialog logic) ----------
  // Show every active staff member (except the user themselves) so any role can report to any senior.
  const managerCandidatesFor = (excludeId?: string): StaffMember[] => {
    return staff
      .filter((s) => s.active && (!excludeId || s.id !== excludeId))
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  };
  const managerLabel = (m: StaffMember): string => {
    const primary = m.roles[0];
    if (!primary) return "Executive";
    return customRoles.find((c) => c.role_key === primary)?.display_label
      || roleLabels[primary as AppRole]
      || primary;
  };
  const upsertReportsTo = async (userId: string, managerId: string | "") => {
    await (supabase.from as any)("user_reports_to").delete().eq("user_id", userId);
    if (managerId && managerId !== userId) {
      const { error } = await (supabase.from as any)("user_reports_to").insert({
        user_id: userId,
        manager_user_id: managerId,
      });
      if (error) throw error;
    }
  };

  // ---------- Add Staff ----------
  const resetAddForm = () => {
    setAddStep("choose"); setNewFirst(""); setNewLast(""); setNewEmail(""); setNewPhone("");
    setNewPin(""); setNewRole("receptionist"); setNewManager("");
    setNewAvatar(null); setNewAvatarPreview(null); setShowPin(false);
  };

  const openAddForRole = (role: AppRole) => {
    resetAddForm();
    setNewRole(role);
    setAddStep("human");
    setAddOpen(true);
  };


  const handleAddStaff = async () => {
    if (!newFirst.trim() || !newEmail.trim() || !newPin.trim()) {
      toast.error("First name, email and login PIN are required");
      return;
    }
    if (newPin.length < 6) { toast.error("Login PIN must be at least 6 characters"); return; }
    setSaving(true);
    try {
      const full = `${newFirst.trim()} ${newLast.trim()}`.trim();
      const response = await supabase.functions.invoke("create-staff-user", {
        body: { email: newEmail, password: newPin, full_name: full, role: newRole as AppRole },
        headers: await getFunctionAuthHeaders(),
      });
      const result = response.data as any;
      if (response.error || result?.error) {
        toast.error(result?.error || response.error?.message || "Staff creation failed");
        setSaving(false); return;
      }
      const newUserId: string | undefined = result?.user_id;
      if (newUserId && newAvatar) {
        const url = await uploadAvatar(newUserId, newAvatar);
        if (url) await supabase.from("profiles").update({ avatar_url: url }).eq("id", newUserId);
      }
      if (newUserId && newPhone.trim()) {
        await supabase.functions.invoke("manage-admin-users", {
          body: { action: "update_contact", user_id: newUserId, full_name: full, phone: newPhone, email: "" },
          headers: await getFunctionAuthHeaders(),
        });
      }
      if (newUserId && newManager) {
        try { await upsertReportsTo(newUserId, newManager); }
        catch (e: any) { toast.error(`Reporting link failed: ${e.message || e}`); }
      }
      toast.success(`${full} added`);
      resetAddForm(); setAddOpen(false); fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Add failed");
    } finally { setSaving(false); }
  };

  // ---------- Toggle active/deleted ----------
  const toggleActive = async (m: StaffMember, next: boolean) => {
    // Optimistic update so UI flips instantly
    setStaff((prev) => prev.map((s) => (s.id === m.id ? { ...s, active: next } : s)));
    const { error } = await supabase.from("profiles").update({ active: next }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      setStaff((prev) => prev.map((s) => (s.id === m.id ? { ...s, active: !next } : s)));
      return;
    }
    toast.success(`${m.full_name} ${next ? "activated" : "deactivated"}`);
    queryClient.invalidateQueries({ queryKey: ["clinic-masters"] });
    fetchAll();
  };

  const restoreStaff = (m: StaffMember) => toggleActive(m, true);

  const deleteStaffPermanent = async (m: StaffMember) => {
    if (m.roles.includes("admin")) { toast.error("Admin users cannot be deleted here"); return; }
    if (!window.confirm(`Permanently delete ${m.full_name}? This cannot be undone.`)) return;
    setDeletingId(m.id);
    try {
      const response = await supabase.functions.invoke("manage-admin-users", {
        body: { action: "delete_user", user_id: m.id },
        headers: await getFunctionAuthHeaders(),
      });
      if (response.error || (response.data as any)?.error) {
        toast.error((response.data as any)?.error || response.error?.message || "Delete failed");
      } else {
        toast.success(`${m.full_name} deleted`);
        queryClient.invalidateQueries({ queryKey: ["clinic-masters"] });
        fetchAll();
      }
    } finally { setDeletingId(null); }
  };

  // ---------- Edit Staff ----------
  const openEdit = (m: StaffMember) => {
    setEditStaff(m); setEditName(m.full_name); setEditEmail(m.email ?? ""); setEditPhone(m.phone ?? "");
    setEditRoles(m.roles); setEditManager(m.manager_user_id ?? "");
    setEditAvatar(null); setEditAvatarPreview(m.avatar_url ?? null);
  };

  const saveEdit = async () => {
    if (!editStaff) return;
    if (!editName.trim()) { toast.error("Name required"); return; }
    setEditSaving(true);
    try {
      const emailChanged = (editEmail || "").trim() !== (editStaff.email ?? "").trim();
      const phoneChanged = (editPhone || "").trim() !== (editStaff.phone ?? "").trim();
      const nameChanged = editName.trim() !== editStaff.full_name;
      if (nameChanged || emailChanged || phoneChanged) {
        const resp = await supabase.functions.invoke("manage-admin-users", {
          body: {
            action: "update_contact", user_id: editStaff.id, full_name: editName,
            email: emailChanged ? editEmail : "", phone: phoneChanged ? editPhone : "",
          },
          headers: await getFunctionAuthHeaders(),
        });
        if (resp.error || (resp.data as any)?.error) {
          toast.error((resp.data as any)?.error || resp.error?.message || "Update failed");
          setEditSaving(false); return;
        }
      }
      if (editAvatar) {
        const url = await uploadAvatar(editStaff.id, editAvatar);
        if (url) await supabase.from("profiles").update({ avatar_url: url }).eq("id", editStaff.id);
      }
      const current = [...editStaff.roles].sort().join(",");
      const next = [...editRoles].sort().join(",");
      if (current !== next) {
        await supabase.from("user_roles").delete().eq("user_id", editStaff.id);
        if (editRoles.length > 0) {
          const rows = editRoles.map((role) => ({ user_id: editStaff.id, role }));
          const { error: rErr } = await supabase.from("user_roles").insert(rows as any);
          if (rErr) { toast.error(rErr.message); setEditSaving(false); return; }
        }
      }
      // Sync reporting hierarchy (matches Assign Role tab)
      const currentMgr = editStaff.manager_user_id ?? "";
      if (editManager !== currentMgr) {
        try { await upsertReportsTo(editStaff.id, editManager); }
        catch (e: any) { toast.error(`Reporting link failed: ${e.message || e}`); setEditSaving(false); return; }
      }
      toast.success(`${editName} updated`);
      setEditStaff(null); fetchAll();
    } catch (err: any) { toast.error(err.message || "Update failed"); }
    finally { setEditSaving(false); }
  };

  // ---------- Reset password ----------
  const submitResetPassword = async () => {
    if (!resetPwFor) return;
    if (resetPwValue.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setResetPwSaving(true);
    try {
      const resp = await supabase.functions.invoke("manage-admin-users", {
        body: { action: "reset_password", user_id: resetPwFor.id, new_password: resetPwValue },
        headers: await getFunctionAuthHeaders(),
      });
      if (resp.error || (resp.data as any)?.error) {
        toast.error((resp.data as any)?.error || resp.error?.message || "Password reset failed");
      } else {
        toast.success("Password reset successfully");
        setResetPwFor(null); setResetPwValue(""); setResetPwShow(false);
      }
    } finally { setResetPwSaving(false); }
  };

  // ---------- Module access (per user) ----------
  const openAccess = async (m: StaffMember) => {
    setAccessFor(m); setAccessLoading(true);
    const expanded: Record<string, boolean> = {};
    moduleGroups.forEach((g) => { expanded[g.group] = true; });
    setExpandedGroups(expanded);
    const { data } = await supabase
      .from("user_module_access").select("module_path, has_access").eq("user_id", m.id);
    const map: Record<string, boolean> = {};
    allModulePaths.forEach((p) => { map[p] = false; });
    if (data && data.length > 0) {
      data.forEach((row: any) => { map[row.module_path] = row.has_access; });
    } else {
      // Seed defaults from role
      if (m.roles.includes("admin")) {
        allModulePaths.forEach((p) => { map[p] = true; });
      } else {
        const { roleAccessMap } = await import("@/lib/roleAccess");
        m.roles.forEach((role) => {
          const paths = roleAccessMap[role];
          if (paths?.includes("*")) allModulePaths.forEach((p) => { map[p] = true; });
          else paths?.forEach((p) => { if (map[p] !== undefined) map[p] = true; });
        });
      }
    }
    setUserAccess(map); setAccessLoading(false);
  };

  const saveAccess = async () => {
    if (!accessFor) return;
    setAccessSaving(true);
    await supabase.from("user_module_access").delete().eq("user_id", accessFor.id);
    const merged: Record<string, boolean> = { ...userAccess };
    Object.entries(userAccess).forEach(([p, en]) => {
      if (en && p.includes("#")) {
        const base = p.split("#")[0]; if (base) merged[base] = true;
      }
    });
    const rows = Object.entries(merged).map(([module_path, has_access]) => ({
      user_id: accessFor.id, module_path, has_access,
    }));
    const { error } = await supabase.from("user_module_access").insert(rows);
    if (error) toast.error("Save failed: " + error.message);
    else { toast.success("Module access saved"); setAccessFor(null); }
    setAccessSaving(false);
  };

  const accessCount = Object.values(userAccess).filter(Boolean).length;

  // ---------- Render ----------
  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeCount = staff.filter((s) => s.active).length;
  const deletedCount = staff.filter((s) => !s.active).length;

  // Build role groups for active tab, keeping each role visible only once
  const builtinRoleDefs = (Object.keys(roleLabels) as AppRole[]).map((r) => ({ key: r, label: roleLabels[r], appRole: r }));
  const seenRoleKeys = new Set(builtinRoleDefs.map((r) => r.key.toLowerCase()));
  const seenRoleLabels = new Set(builtinRoleDefs.map((r) => r.label.trim().toLowerCase()));
  const customRoleDefs = customRoles
    .filter((cr) => cr.is_active)
    .filter((cr) => {
      const key = cr.role_key.trim().toLowerCase();
      const label = cr.display_label.trim().toLowerCase();
      if (seenRoleKeys.has(key) || seenRoleLabels.has(label)) return false;
      seenRoleKeys.add(key);
      seenRoleLabels.add(label);
      return true;
    })
    .map((cr) => ({ key: `custom:${cr.role_key}`, label: cr.display_label }));
  const roleGroupDefs: { key: string; label: string; appRole?: AppRole }[] = [...builtinRoleDefs, ...customRoleDefs];
  const groupedStaff: { key: string; label: string; appRole?: AppRole; members: StaffMember[] }[] = [];
  roleGroupDefs.forEach((g) => {
    const members = visibleStaff.filter((m) =>
      g.appRole ? m.roles.includes(g.appRole) : m.roles.some((r) => (r as string) === g.key.replace("custom:", ""))
    );
    groupedStaff.push({ ...g, members });
  });
  const unassigned = visibleStaff.filter((m) => m.roles.length === 0);
  if (unassigned.length > 0) groupedStaff.push({ key: "__unassigned", label: "Unassigned", members: unassigned });

  const renderStaffCard = (m: StaffMember, idx: number) => {
    const grad = cardGradients[idx % cardGradients.length];
    return (
      <div
        key={m.id}
        className={`group relative aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br ${grad} flex flex-col`}
      >
        <div className="flex-1 relative overflow-hidden">
          {m.avatar_url ? (
            <img src={m.avatar_url} alt={m.full_name} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/90">
              <div className="h-24 w-24 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center text-3xl font-bold">
                {initials(m.full_name)}
              </div>
            </div>
          )}
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 rounded-lg bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition">
                  <MoreVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {m.active ? (
                  <>
                    <DropdownMenuItem onClick={() => openEdit(m)}>
                      <Pencil size={13} className="mr-2" /> Edit Staff
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openChangeRole(m)}>
                      <Repeat size={13} className="mr-2" /> Manage Roles
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => openAccess(m)}>
                      <Shield size={13} className="mr-2" /> Module Access
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPreviewFor(m)}>
                      <Eye size={13} className="mr-2" /> Preview Access
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => { setResetPwFor(m); setResetPwValue(""); setResetPwShow(false); }}>
                      <KeyRound size={13} className="mr-2" /> Reset Password
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toggleActive(m, false)} className="text-amber-600 focus:text-amber-700">
                      <X size={13} className="mr-2" /> Deactivate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteStaffPermanent(m)}
                      disabled={m.roles.includes("admin") || deletingId === m.id}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 size={13} className="mr-2" /> Delete
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => restoreStaff(m)} className="text-emerald-600">
                      <Check size={13} className="mr-2" /> Restore
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteStaffPermanent(m)}
                      disabled={m.roles.includes("admin")}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 size={13} className="mr-2" /> Delete Permanently
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="bg-white/95 backdrop-blur px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate flex-1" title={m.full_name}>
              {m.full_name.length > 12 ? m.full_name.slice(0, 11) + "…" : m.full_name}
            </p>
            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 text-[9px] px-1.5 py-0 font-bold">HU</Badge>
            {activeTab === "active" && (
              <Switch checked={m.active} onCheckedChange={(v) => toggleActive(m, v)} className="scale-90" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <span>✉</span><span className="truncate">{m.email || "—"}</span>
          </p>
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <span>📞</span><span className="truncate">{m.phone || "—"}</span>
          </p>
          {(() => {
            const mgr = m.manager_user_id ? staff.find((s) => s.id === m.manager_user_id) : null;
            if (!mgr) return null;
            return (
              <div className="flex items-center gap-1 pt-0.5" title={`Reports To: ${mgr.full_name}`}>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 font-medium border-primary/30 text-primary bg-primary/5 gap-0.5 truncate max-w-full"
                >
                  <Shield size={8} />
                  <span className="truncate">Reports To: {mgr.full_name}</span>
                </Badge>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-4">
      {/* Top tab pills */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
            activeTab === "active"
              ? "bg-emerald-500 text-white shadow-sm"
              : "border border-border bg-background text-foreground hover:bg-accent"
          }`}
        >
          Active Staff
        </button>
        <button
          onClick={() => setActiveTab("deleted")}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
            activeTab === "deleted"
              ? "bg-destructive text-destructive-foreground shadow-sm"
              : "border border-border bg-background text-foreground hover:bg-accent"
          }`}
        >
          Deleted Staff
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Staff</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            You have total {activeTab === "active" ? activeCount : deletedCount} Staff{(activeTab === "active" ? activeCount : deletedCount) === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-9 w-[200px] text-sm pr-9 rounded-full bg-background"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center">
              <Search size={13} />
            </div>
          </div>
          {activeTab === "active" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => { resetAddForm(); setAddOpen(true); }}
              >
                <Plus size={14} className="mr-1" /> ADD STAFF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 text-xs font-semibold"
                onClick={() => setManageOpen(true)}
              >
                MANAGE STAFF
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Staff Grid */}
      {activeTab === "deleted" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleStaff.map((m, idx) => renderStaffCard(m, idx))}
          {visibleStaff.length === 0 && (
            <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
              No deleted staff
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedStaff.map((g) => {
            const isCollapsed = collapsedRoles[g.key];
            const canAdd = g.appRole !== undefined && g.key !== "__unassigned";
            return (
              <section key={g.key} className="rounded-2xl border border-border bg-card/40 p-4">
                <header className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setCollapsedRoles((s) => ({ ...s, [g.key]: !s[g.key] }))}
                    className="flex items-center gap-2 text-left"
                  >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <h3 className="text-base font-display font-semibold tracking-tight">
                      {g.label}
                    </h3>
                    <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0">
                      {g.members.length}
                    </Badge>
                  </button>
                  {canAdd && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full h-8 text-xs"
                      onClick={() => openAddForRole(g.appRole as AppRole)}
                    >
                      <Plus size={13} className="mr-1" /> Add to {g.label}
                    </Button>
                  )}
                </header>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {g.members.length === 0 ? (
                      canAdd ? (
                        <button
                          onClick={() => openAddForRole(g.appRole as AppRole)}
                          className="aspect-[3/4] rounded-2xl border-2 border-dashed border-border hover:border-primary/60 text-muted-foreground hover:text-primary flex flex-col items-center justify-center gap-2 transition"
                        >
                          <Plus size={28} />
                          <span className="text-xs font-medium">Add {g.label}</span>
                        </button>
                      ) : (
                        <div className="col-span-full text-xs text-muted-foreground py-4">
                          No staff in this role
                        </div>
                      )
                    ) : (
                      g.members.map((m, idx) => renderStaffCard(m, idx))
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}



      {/* ====== Add Staff Dialog ====== */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm(); }}>
        <DialogContent className="sm:max-w-2xl bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-background dark:to-background">
          {addStep === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary text-base">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <UserPlus size={16} className="text-primary" />
                  </div>
                  <div>
                    <div>Add New Staff Member</div>
                    <p className="text-xs text-muted-foreground font-normal">Choose the type of staff member you want to add to your team</p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
                <button
                  onClick={() => setAddStep("human")}
                  className="rounded-2xl border-2 border-primary/40 bg-white dark:bg-background p-4 text-left hover:border-primary transition hover:shadow-md flex flex-col items-center text-center gap-2"
                >
                  <div className="h-14 w-14 rounded-full border-2 border-primary/30 flex items-center justify-center text-primary">
                    <UserIcon size={26} />
                  </div>
                  <p className="font-semibold text-sm">Human Staff</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Add a real person to your team with login credentials and permissions
                  </p>
                  <ul className="text-[11px] text-foreground space-y-1 mt-1 self-stretch">
                    <li className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" /> Full system access</li>
                    <li className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" /> Custom permissions</li>
                    <li className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" /> Email notifications</li>
                  </ul>
                </button>

                <button
                  onClick={() => toast.info("AI Staff is coming soon ✨")}
                  className="relative rounded-2xl border border-border bg-white dark:bg-background p-4 text-left hover:border-primary/40 transition hover:shadow-md flex flex-col items-center text-center gap-2"
                >
                  <Badge className="absolute top-3 right-3 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-[9px] gap-0.5 px-1.5">
                    <Sparkles size={9} /> BETA
                  </Badge>
                  <div className="h-14 w-14 rounded-full border-2 border-border flex items-center justify-center text-foreground">
                    <Bot size={26} />
                  </div>
                  <p className="font-semibold text-sm">AI Staff</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Create an AI-powered assistant with custom personality and knowledge
                  </p>
                  <ul className="text-[11px] text-foreground space-y-1 mt-1 self-stretch">
                    <li className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" /> 24/7 availability</li>
                    <li className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" /> Custom knowledge base</li>
                    <li className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" /> Instant responses</li>
                  </ul>
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary text-base">
                  <button onClick={() => setAddStep("choose")} className="h-7 w-7 rounded-full border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/10">
                    <ArrowLeft size={14} />
                  </button>
                  Add Human Staff
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">First Name <span className="text-destructive">*</span></Label>
                  <Input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last Name <span className="text-destructive">*</span></Label>
                  <Input value={newLast} onChange={(e) => setNewLast(e.target.value)} className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                  <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
                  <Input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91 81234 56789" className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Role <span className="text-destructive">*</span></Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger className="h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                        <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Direct Supervisor / Reports To</Label>
                  <Select value={newManager || "__none"} onValueChange={(v) => setNewManager(v === "__none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm rounded-lg">
                      <SelectValue placeholder="Select senior executive (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs text-muted-foreground">None</SelectItem>
                      {managerCandidatesFor().map((mgr) => (
                        <SelectItem key={mgr.id} value={mgr.id} className="text-xs">
                          {mgr.full_name} <span className="text-muted-foreground">— {managerLabel(mgr)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Any active staff member can be a supervisor. Syncs with the Assign Role hierarchy.
                  </p>
                </div>





                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Login PIN <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showPin ? "text" : "password"}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      className="h-9 text-sm rounded-lg pr-9"
                      placeholder="Min 6 characters"
                    />
                    <button type="button" onClick={() => setShowPin((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Used for quick login access</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Profile Image</Label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-secondary/30 hover:border-primary text-muted-foreground overflow-hidden"
                    >
                      {newAvatarPreview ? (
                        <img src={newAvatarPreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Upload size={18} />
                      )}
                    </button>
                    {newAvatarPreview && (
                      <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => { setNewAvatar(null); setNewAvatarPreview(null); }}>
                        Remove
                      </Button>
                    )}
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickAvatar(e, "new")} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setAddOpen(false); resetAddForm(); }} disabled={saving}>Cancel</Button>
                <Button onClick={handleAddStaff} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <UserIcon size={14} className="mr-1.5" />}
                  ADD
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ====== Manage Staff (Roles) Dialog ====== */}
      <ManageRolesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        customRoles={customRoles}
        staff={staff}
        moduleGroups={moduleGroups}
        allModulePaths={allModulePaths}
        refresh={fetchAll}
      />

      {/* ====== Edit Staff Dialog ====== */}
      <Dialog open={!!editStaff} onOpenChange={(o) => { if (!o) setEditStaff(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm"><Pencil size={14} /> Edit Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => editAvatarRef.current?.click()}
                className="h-16 w-16 rounded-full border-2 border-dashed border-border overflow-hidden bg-secondary/40 flex items-center justify-center text-muted-foreground"
              >
                {editAvatarPreview ? (
                  <img src={editAvatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Upload size={16} />
                )}
              </button>
              <div className="text-xs text-muted-foreground">Click to change profile photo</div>
              <input ref={editAvatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickAvatar(e, "edit")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Roles</Label>
              <div className="border border-border rounded-md p-2 max-h-[140px] overflow-y-auto space-y-1 bg-background">
                {customRoles.filter((r) => r.is_active).map((r) => {
                  const role = r.role_key as AppRole;
                  const checked = editRoles.includes(role);
                  return (
                    <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/40 rounded px-1.5 py-1">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setEditRoles((prev) => v ? Array.from(new Set([...prev, role])) : prev.filter((x) => x !== role));
                        }}
                      />
                      <span>{r.display_label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direct Supervisor / Reports To</Label>
              <Select value={editManager || "__none"} onValueChange={(v) => setEditManager(v === "__none" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select senior executive..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none" className="text-xs text-muted-foreground">None</SelectItem>
                  {managerCandidatesFor(editStaff?.id).map((mgr) => (
                    <SelectItem key={mgr.id} value={mgr.id} className="text-xs">
                      {mgr.full_name} <span className="text-muted-foreground">— {managerLabel(mgr)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Kept in sync with the Assign Role hierarchy mapping.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditStaff(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Reset Password Dialog ====== */}
      <Dialog open={!!resetPwFor} onOpenChange={(o) => { if (!o) setResetPwFor(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><KeyRound size={16} /> Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Set a new password for <span className="font-medium text-foreground">{resetPwFor?.full_name}</span>.
            </p>
            <div className="relative">
              <Input
                type={resetPwShow ? "text" : "password"}
                value={resetPwValue}
                onChange={(e) => setResetPwValue(e.target.value)}
                className="h-9 text-sm pr-9"
                placeholder="Min 8 characters"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setResetPwShow((s) => !s)}>
                {resetPwShow ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetPwFor(null)} disabled={resetPwSaving}>Cancel</Button>
            <Button onClick={submitResetPassword} disabled={resetPwSaving}>
              {resetPwSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Change Role Dialog ====== */}
      <Dialog open={!!changeRoleFor} onOpenChange={(o) => { if (!o) setChangeRoleFor(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Repeat size={16} /> Manage Roles
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Assign <span className="font-medium text-foreground">{changeRoleFor?.full_name}</span> to one or more roles / departments. Check all roles that apply — the staff member will appear under every selected role.
              {changeRoleFor && changeRoleFor.roles.length > 0 && (
                <> Currently: <span className="font-medium text-foreground">{(changeRoleFor.roles as string[]).map((r) => roleLabels[r as AppRole] || r).join(", ")}</span>.</>
              )}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Roles</Label>
              <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-1">
                {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                  <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox checked={changeRoleValues.includes(r)} onCheckedChange={() => toggleChangeRole(r)} />
                    <span>{roleLabels[r]}</span>
                  </label>
                ))}
                {customRoles.filter((r) => r.is_active).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox checked={changeRoleValues.includes(r.role_key)} onCheckedChange={() => toggleChangeRole(r.role_key)} />
                    <span>{r.display_label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{changeRoleValues.length} role{changeRoleValues.length === 1 ? "" : "s"} selected.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangeRoleFor(null)} disabled={changeRoleSaving}>Cancel</Button>
            <Button onClick={submitChangeRole} disabled={changeRoleSaving || changeRoleValues.length === 0}>
              {changeRoleSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save Roles
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Access Preview Dialog (read-only) ====== */}
      <AccessPreviewDialog
        open={!!previewFor}
        onClose={() => setPreviewFor(null)}
        staffId={previewFor?.id}
        staffName={previewFor?.full_name}
        roles={previewFor?.roles ?? []}
        moduleGroups={moduleGroups}
      />

      {/* ====== Module Access Dialog (per-user, existing system) ====== */}
      <Dialog open={!!accessFor} onOpenChange={(o) => { if (!o) setAccessFor(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Shield size={14} /> Module Access — {accessFor?.full_name}
              <Badge variant="outline" className="text-[10px] ml-2">{accessCount}/{allModulePaths.length}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 -mt-1">
            <Button variant="ghost" size="sm" className="text-[10px] h-7 px-2"
              onClick={() => { const m: Record<string, boolean> = {}; allModulePaths.forEach((p) => { m[p] = true; }); setUserAccess(m); }}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" className="text-[10px] h-7 px-2"
              onClick={() => { const m: Record<string, boolean> = {}; allModulePaths.forEach((p) => { m[p] = false; }); setUserAccess(m); }}>
              Deselect All
            </Button>
          </div>
          {accessLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-y-auto flex-1 space-y-1 pr-1">
              {moduleGroups.map((group) => {
                const isExpanded = expandedGroups[group.group] ?? true;
                const checkedCount = group.modules.filter((m) => userAccess[m.path]).length;
                const allChecked = checkedCount === group.modules.length;
                const someChecked = checkedCount > 0 && !allChecked;
                return (
                  <div key={group.group} className="rounded-lg border border-border/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40">
                      <Checkbox
                        checked={allChecked ? true : someChecked ? "indeterminate" : false}
                        onCheckedChange={() => {
                          const next = { ...userAccess };
                          group.modules.forEach((m) => { next[m.path] = !allChecked; });
                          setUserAccess(next);
                        }}
                      />
                      <button onClick={() => setExpandedGroups((p) => ({ ...p, [group.group]: !isExpanded }))} className="flex items-center justify-between flex-1 text-xs font-semibold">
                        <span className="flex items-center gap-1.5">
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {group.group}
                        </span>
                        <Badge variant={allChecked ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {checkedCount}/{group.modules.length}
                        </Badge>
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 p-2">
                        {group.modules.map((mod) => {
                          const has = userAccess[mod.path] ?? false;
                          return (
                            <label key={mod.path} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/40 rounded px-2 py-1.5">
                              <Checkbox checked={has} onCheckedChange={() => setUserAccess((p) => ({ ...p, [mod.path]: !p[mod.path] }))} />
                              <span className={has ? "" : "text-muted-foreground"}>{mod.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccessFor(null)} disabled={accessSaving}>Cancel</Button>
            <Button onClick={saveAccess} disabled={accessSaving}>
              {accessSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// =================== Manage Roles Dialog (separate component) ===================
function ManageRolesDialog({
  open, onOpenChange, customRoles, staff, moduleGroups, allModulePaths, refresh,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customRoles: CustomRole[];
  staff: StaffMember[];
  moduleGroups: { group: string; modules: { path: string; label: string }[] }[];
  allModulePaths: string[];
  refresh: () => void;
}) {
  const [tab, setTab] = useState<"create" | "assign" | "perms">("create");
  const [newRoleName, setNewRoleName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Assign
  const [assignStaff, setAssignStaff] = useState<string>("");
  const [assignRole, setAssignRole] = useState<string>("");
  const [assignManager, setAssignManager] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  // Perms — per-module CRUD
  type PermRow = { has_access: boolean; can_read: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };
  const emptyPerm = (): PermRow => ({ has_access: false, can_read: false, can_create: false, can_edit: false, can_delete: false });
  const fullPerm = (): PermRow => ({ has_access: true, can_read: true, can_create: true, can_edit: true, can_delete: true });
  const [permRole, setPermRole] = useState<string>("");
  const [permMap, setPermMap] = useState<Record<string, PermRow>>({});
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  const rolesActive = customRoles.filter((r) => r.is_active);

  // Reports-To dropdown: list every active staff member (except the selected user).
  const managerCandidates = staff
    .filter((s) => s.active)
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const createRole = async () => {
    if (!newRoleName.trim()) { toast.error("Enter a role name"); return; }
    setCreating(true);
    const role_key = newRoleName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const { error } = await supabase.from("custom_roles").insert({
      role_key, display_label: newRoleName.trim(), department: "general", is_active: true,
    } as any);
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Role created");
    setNewRoleName("");
    refresh();
  };

  const updateRoleLabel = async () => {
    if (!editingRole) return;
    if (!editLabel.trim()) { toast.error("Name required"); return; }
    const { error } = await supabase.from("custom_roles").update({ display_label: editLabel.trim() }).eq("id", editingRole.id);
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); setEditingRole(null); refresh(); }
  };

  const deleteRole = async (r: CustomRole) => {
    if (!window.confirm(`Delete role "${r.display_label}"?`)) return;
    const { error } = await supabase.from("custom_roles").update({ is_active: false }).eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Role deleted"); refresh(); }
  };

  const doAssign = async () => {
    if (!assignStaff || !assignRole) { toast.error("Select staff member and designation"); return; }
    setAssigning(true);
    const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: assignStaff, role: assignRole as AppRole });
    if (roleErr && roleErr.code !== "23505") {
      setAssigning(false);
      toast.error(roleErr.message);
      return;
    }
    if (assignManager && assignManager !== assignStaff) {
      await (supabase.from as any)("user_reports_to").delete().eq("user_id", assignStaff);
      const { error: mgrErr } = await (supabase.from as any)("user_reports_to").insert({
        user_id: assignStaff,
        manager_user_id: assignManager,
      });
      if (mgrErr) {
        setAssigning(false);
        toast.error(`Role saved, hierarchy failed: ${mgrErr.message}`);
        return;
      }
    }
    setAssigning(false);
    toast.success("Assignment saved successfully");
    setAssignStaff(""); setAssignRole(""); setAssignManager("");
    refresh();
  };

  // Load permissions for a role (use first member with that role as template).
  // IMPORTANT: this must run ONLY when the admin picks a role — never on a
  // background staff refresh (the Staff page has a realtime subscription, and
  // reloading here silently wiped unsaved tick changes before SAVE).
  const loadedPermRoleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!permRole) { loadedPermRoleRef.current = null; setPermMap({}); return; }
    if (loadedPermRoleRef.current === permRole) return; // already loaded — keep edits
    loadedPermRoleRef.current = permRole;
    const member = staff.find((s) => s.roles.includes(permRole as AppRole));
    const m: Record<string, PermRow> = {};
    allModulePaths.forEach((p) => { m[p] = emptyPerm(); });
    if (!member) { setPermMap(m); return; }
    setPermLoading(true);
    supabase.from("user_module_access")
      .select("module_path, has_access, can_read, can_create, can_edit, can_delete")
      .eq("user_id", member.id)
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          data.forEach((row: any) => {
            m[row.module_path] = {
              has_access: !!row.has_access,
              can_read: row.can_read ?? !!row.has_access,
              can_create: !!row.can_create,
              can_edit: !!row.can_edit,
              can_delete: !!row.can_delete,
            };
          });
        } else {
          const { roleAccessMap } = await import("@/lib/roleAccess");
          const paths = roleAccessMap[permRole as AppRole];
          const grant = (k: string) => { m[k] = { has_access: true, can_read: true, can_create: true, can_edit: true, can_delete: true }; };
          if (paths?.includes("*")) allModulePaths.forEach(grant);
          else paths?.forEach((p) => { if (m[p] !== undefined) grant(p); });
        }
        setPermMap(m); setPermLoading(false);
      });
  }, [permRole, staff, allModulePaths]);

  const savePerms = async () => {
    if (!permRole) return;
    const members = staff.filter((s) => s.roles.includes(permRole as AppRole));
    if (members.length === 0) { toast.info("No staff assigned to this role yet — saved as defaults only."); return; }
    setPermSaving(true);
    try {
      // Upsert (never delete-then-insert): a partial failure can no longer wipe
      // a staff member's access. Relies on the existing unique constraint on
      // (user_id, module_path).
      for (const m of members) {
        const rows = Object.entries(permMap).map(([module_path, p]) => ({
          user_id: m.id,
          module_path,
          has_access: p.has_access || p.can_read || p.can_create || p.can_edit || p.can_delete,
          can_read: p.can_read,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        }));
        const { error } = await supabase
          .from("user_module_access")
          .upsert(rows, { onConflict: "user_id,module_path" });
        if (error) { toast.error(`Save failed for ${m.full_name}: ${error.message}`); setPermSaving(false); return; }
      }

      // Read back what was actually stored so the admin can see it stuck.
      const { data: saved, error: readErr } = await supabase
        .from("user_module_access")
        .select("module_path, can_read, can_create, can_edit, can_delete")
        .eq("user_id", members[0].id);
      if (readErr) {
        toast.success(`Permissions updated for ${members.length} staff`);
      } else {
        const fullCount = (saved || []).filter(
          (r: any) => r.can_read && r.can_create && r.can_edit && r.can_delete,
        ).length;
        const viewCount = (saved || []).filter((r: any) => r.can_read).length;
        toast.success(
          `Permissions saved for ${members.length} staff — ${viewCount} modules viewable, ${fullCount} with full access.`,
        );
      }
    } catch (e: any) { toast.error(e.message || "Save failed"); }
    finally { setPermSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">

        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2"><Settings size={16} /> Manage Roles</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="create" className="text-xs gap-1.5"><Plus size={13} /> Create Role</TabsTrigger>
            <TabsTrigger value="assign" className="text-xs gap-1.5"><Users size={13} /> Assign Role</TabsTrigger>
            <TabsTrigger value="perms" className="text-xs gap-1.5"><Settings size={13} /> Edit Role Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="flex-1 overflow-y-auto mt-3 space-y-3">
            <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-secondary/30 dark:to-secondary/20 p-4 space-y-2 border border-border">
              <Label className="text-xs">Role Name</Label>
              <div className="flex gap-2">
                <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Sales Agent" className="h-9 text-sm flex-1" />
                <Button onClick={createRole} disabled={creating} variant="outline" className="border-primary/40 text-primary">
                  {creating ? <Loader2 size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
                  CREATE
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Roles are scoped to your account and can be assigned to multiple team members.</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Shield size={13} className="text-primary" /> Your Roles</h4>
              <div className="space-y-1.5">
                {rolesActive.map((r) => {
                  const userCount = staff.filter((s) => s.roles.includes(r.role_key as AppRole)).length;
                  return (
                    <div key={r.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        {editingRole?.id === r.id ? (
                          <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-sm" />
                        ) : (
                          <>
                            <p className="text-sm font-medium">{r.display_label}</p>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-0.5"><Users size={9} /> {userCount} users</span>
                              <span className="flex items-center gap-0.5"><Shield size={9} /> {r.department}</span>
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editingRole?.id === r.id ? (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={updateRoleLabel}><Save size={13} /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingRole(null)}><X size={13} /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => { setEditingRole(r); setEditLabel(r.display_label); }}>
                              <Pencil size={12} />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRole(r)}>
                              <Trash2 size={12} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {rolesActive.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No roles yet — create your first role above.</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="assign" className="flex-1 overflow-y-auto mt-3 space-y-4">
            <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
              <div className="flex items-center gap-2 pb-1">
                <Users size={14} className="text-primary" />
                <h4 className="text-sm font-semibold">Reporting Hierarchy</h4>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Assign a designation to a staff member and map them under a senior executive.
              </p>

              <div className="space-y-2">
                <Label className="text-xs">Select Staff Member</Label>
                <Select value={assignStaff} onValueChange={setAssignStaff}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose an active user..." /></SelectTrigger>
                  <SelectContent>
                    {staff.filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Assign Designation</Label>
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose a role..." /></SelectTrigger>
                  <SelectContent>
                    {rolesActive.map((r) => (
                      <SelectItem key={r.id} value={r.role_key} className="text-xs">{r.display_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Direct Supervisor / Reports To</Label>
                <Select value={assignManager} onValueChange={setAssignManager}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={managerCandidates.length ? "Select supervisor..." : "No active staff available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {managerCandidates
                      .filter((m) => m.id !== assignStaff)
                      .map((m) => {
                        const primary = m.roles[0];
                        const label = primary
                          ? (customRoles.find((c) => c.role_key === primary)?.display_label || roleLabels[primary as AppRole] || primary)
                          : "Staff";
                        return (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.full_name} <span className="text-muted-foreground">— {label}</span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Any active staff member can be selected as a direct supervisor.
                </p>
              </div>

              <div className="pt-1">
                <Button
                  onClick={doAssign}
                  disabled={assigning}
                  className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {assigning ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Check size={14} className="mr-1.5" />}
                  Save Assignment
                </Button>
              </div>
            </div>
          </TabsContent>


          <TabsContent value="perms" className="flex-1 overflow-y-auto mt-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Role</Label>
              <Select value={permRole} onValueChange={setPermRole}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a role to edit" /></SelectTrigger>
                <SelectContent>
                  {rolesActive.map((r) => (
                    <SelectItem key={r.id} value={r.role_key} className="text-xs">{r.display_label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {permRole && (
              <>
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 px-3 py-2 text-[11px] flex items-start gap-2">
                  <Shield size={12} className="mt-0.5" />
                  <span>Editing this role's permissions will immediately update every staff member assigned to this role. Review carefully before saving.</span>
                </div>
                {permLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {moduleGroups.map((g) => {
                      const enabledCount = g.modules.filter((m) => permMap[m.path]?.has_access).length;
                      const allEnabled = enabledCount === g.modules.length;
                      const setAction = (path: string, action: keyof PermRow, v: boolean) => {
                        setPermMap((prev) => {
                          const cur = prev[path] || emptyPerm();
                          const next: PermRow = { ...cur, [action]: v };
                          // Auto-link: any CRED on => has_access on; CRED off if all off
                          if (action !== "has_access") {
                            const anyOn = next.can_read || next.can_create || next.can_edit || next.can_delete;
                            next.has_access = anyOn;
                          } else if (!v) {
                            next.can_read = false; next.can_create = false; next.can_edit = false; next.can_delete = false;
                          } else if (v && !cur.can_read && !cur.can_create && !cur.can_edit && !cur.can_delete) {
                            next.can_read = true;
                          }
                          return { ...prev, [path]: next };
                        });
                      };
                      const toggleAll = (on: boolean) => {
                        setPermMap((prev) => {
                          const next = { ...prev };
                          g.modules.forEach((m) => {
                            next[m.path] = on
                              ? { has_access: true, can_read: true, can_create: true, can_edit: true, can_delete: true }
                              : emptyPerm();
                          });
                          return next;
                        });
                      };
                      return (
                        <div key={g.group} className="rounded-lg border border-border/60">
                          <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
                            <span className="text-xs font-semibold">{g.group}</span>
                            <label className="text-[10px] flex items-center gap-1.5 cursor-pointer">
                              <Checkbox checked={allEnabled} onCheckedChange={(v) => toggleAll(!!v)} />
                              Full Access ({enabledCount}/{g.modules.length})
                            </label>
                          </div>
                          <div className="px-3 py-1.5 grid grid-cols-[1fr_repeat(5,52px)] gap-2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/40">
                            <span>Sub-menu</span>
                            <span className="text-center">View</span>
                            <span className="text-center">Create</span>
                            <span className="text-center">Modify</span>
                            <span className="text-center">Remove</span>
                            <span className="text-center text-primary">Full</span>
                          </div>
                          <div className="divide-y divide-border/30">
                            {g.modules.map((m) => {
                              const row = permMap[m.path] || emptyPerm();
                              const isFull = row.can_read && row.can_create && row.can_edit && row.can_delete;
                              const setRow = (next: PermRow) => setPermMap((prev) => ({ ...prev, [m.path]: next }));
                              return (
                                <div key={m.path} className="grid grid-cols-[1fr_repeat(5,52px)] gap-2 items-center px-3 py-1.5 hover:bg-accent/20">
                                  <span className="text-[11px] truncate pl-3 border-l-2 border-border/40" title={m.label}>{m.label}</span>
                                  <div className="flex justify-center"><Checkbox checked={row.can_read} onCheckedChange={(v) => setAction(m.path, "can_read", !!v)} /></div>
                                  <div className="flex justify-center"><Checkbox checked={row.can_create} onCheckedChange={(v) => setAction(m.path, "can_create", !!v)} /></div>
                                  <div className="flex justify-center"><Checkbox checked={row.can_edit} onCheckedChange={(v) => setAction(m.path, "can_edit", !!v)} /></div>
                                  <div className="flex justify-center"><Checkbox checked={row.can_delete} onCheckedChange={(v) => setAction(m.path, "can_delete", !!v)} /></div>
                                  <div className="flex justify-center">
                                    <Checkbox
                                      className="border-primary data-[state=checked]:bg-primary"
                                      checked={isFull}
                                      onCheckedChange={(v) => setRow(v ? fullPerm() : emptyPerm())}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={savePerms} disabled={permSaving} variant="outline" className="border-primary/40 text-primary">
                    {permSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />}
                    SAVE PERMISSIONS
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Note: Changes to a role propagate to all staff assigned to it.</p>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default StaffManager;
