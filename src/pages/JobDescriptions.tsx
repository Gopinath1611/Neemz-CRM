import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Briefcase, Building2, Target, X,
} from "lucide-react";

type Department = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type Role = {
  id: string;
  department_id: string;
  title: string;
  job_description: string | null;
  kpis: string[];
  responsibilities: string | null;
  requirements: string | null;
  sort_order: number;
  is_active: boolean;
};

export default function JobDescriptions() {
  const qc = useQueryClient();

  // ---- Department dialogs
  const [deptOpen, setDeptOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);

  // ---- Role dialogs
  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [activeDeptForRole, setActiveDeptForRole] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({
    title: "",
    job_description: "",
    responsibilities: "",
    requirements: "",
    kpis: [] as string[],
    kpiInput: "",
  });
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  // ---- Queries
  const { data: departments = [] } = useQuery({
    queryKey: ["jd_departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jd_departments")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Department[];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["jd_roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jd_roles")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((r) => ({
        ...r,
        kpis: Array.isArray(r.kpis) ? r.kpis : [],
      })) as Role[];
    },
  });

  const rolesByDept = useMemo(() => {
    const map: Record<string, Role[]> = {};
    roles.forEach((r) => {
      (map[r.department_id] ||= []).push(r);
    });
    return map;
  }, [roles]);

  // ---- Department mutations
  const upsertDept = useMutation({
    mutationFn: async () => {
      const payload = {
        name: deptForm.name.trim(),
        description: deptForm.description.trim() || null,
      };
      if (editingDept) {
        const { error } = await supabase.from("jd_departments").update(payload).eq("id", editingDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("jd_departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jd_departments"] });
      toast.success(editingDept ? "Department updated" : "Department added");
      setDeptOpen(false);
      setEditingDept(null);
      setDeptForm({ name: "", description: "" });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const deleteDept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jd_departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jd_departments"] });
      qc.invalidateQueries({ queryKey: ["jd_roles"] });
      toast.success("Department deleted");
      setDeleteDeptId(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  // ---- Role mutations
  const upsertRole = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: roleForm.title.trim(),
        job_description: roleForm.job_description.trim() || null,
        responsibilities: roleForm.responsibilities.trim() || null,
        requirements: roleForm.requirements.trim() || null,
        kpis: roleForm.kpis,
      };
      if (editingRole) {
        const { error } = await supabase.from("jd_roles").update(payload).eq("id", editingRole.id);
        if (error) throw error;
      } else {
        if (!activeDeptForRole) throw new Error("No department selected");
        const { error } = await supabase
          .from("jd_roles")
          .insert({ ...payload, department_id: activeDeptForRole });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jd_roles"] });
      toast.success(editingRole ? "Role updated" : "Role added");
      setRoleOpen(false);
      setEditingRole(null);
      setActiveDeptForRole(null);
      setRoleForm({ title: "", job_description: "", responsibilities: "", requirements: "", kpis: [], kpiInput: "" });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jd_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jd_roles"] });
      toast.success("Role deleted");
      setDeleteRoleId(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  // ---- Handlers
  const openAddDept = () => {
    setEditingDept(null);
    setDeptForm({ name: "", description: "" });
    setDeptOpen(true);
  };
  const openEditDept = (d: Department) => {
    setEditingDept(d);
    setDeptForm({ name: d.name, description: d.description || "" });
    setDeptOpen(true);
  };

  const openAddRole = (deptId: string) => {
    setEditingRole(null);
    setActiveDeptForRole(deptId);
    setRoleForm({ title: "", job_description: "", responsibilities: "", requirements: "", kpis: [], kpiInput: "" });
    setRoleOpen(true);
  };
  const openEditRole = (r: Role) => {
    setEditingRole(r);
    setActiveDeptForRole(r.department_id);
    setRoleForm({
      title: r.title,
      job_description: r.job_description || "",
      responsibilities: r.responsibilities || "",
      requirements: r.requirements || "",
      kpis: r.kpis || [],
      kpiInput: "",
    });
    setRoleOpen(true);
  };

  const addKpi = () => {
    const v = roleForm.kpiInput.trim();
    if (!v) return;
    setRoleForm({ ...roleForm, kpis: [...roleForm.kpis, v], kpiInput: "" });
  };
  const removeKpi = (i: number) => {
    setRoleForm({ ...roleForm, kpis: roleForm.kpis.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="text-primary" /> Job Descriptions
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage departments, roles, JDs, responsibilities & KPIs.
          </p>
        </div>
        <Button onClick={openAddDept}>
          <Plus className="mr-1" size={16} /> Add Department
        </Button>
      </div>

      {departments.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No departments yet. Click "Add Department" to start.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {departments.map((d) => {
            const deptRoles = rolesByDept[d.id] || [];
            return (
              <AccordionItem key={d.id} value={d.id} className="border rounded-lg bg-card">
                <div className="flex items-center justify-between pr-3">
                  <AccordionTrigger className="flex-1 px-4 hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <Building2 size={18} className="text-primary" />
                      <div>
                        <div className="font-semibold">{d.name}</div>
                        {d.description && (
                          <div className="text-xs text-muted-foreground">{d.description}</div>
                        )}
                      </div>
                      <Badge variant="secondary" className="ml-2">{deptRoles.length} roles</Badge>
                    </div>
                  </AccordionTrigger>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDept(d); }}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteDeptId(d.id); }}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>
                <AccordionContent className="px-4 pb-4">
                  <div className="flex justify-end mb-3">
                    <Button size="sm" variant="outline" onClick={() => openAddRole(d.id)}>
                      <Plus size={14} className="mr-1" /> Add Role
                    </Button>
                  </div>
                  {deptRoles.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded">
                      No roles yet. Add the first role for this department.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deptRoles.map((r) => (
                        <Card key={r.id} className="border-muted">
                          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                            <div>
                              <CardTitle className="text-base">{r.title}</CardTitle>
                              {r.job_description && (
                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                  {r.job_description}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="icon" onClick={() => openEditRole(r)}>
                                <Pencil size={14} />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteRoleId(r.id)}>
                                <Trash2 size={14} className="text-destructive" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0 space-y-2">
                            {r.responsibilities && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Responsibilities</p>
                                <p className="text-sm whitespace-pre-wrap">{r.responsibilities}</p>
                              </div>
                            )}
                            {r.requirements && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Requirements</p>
                                <p className="text-sm whitespace-pre-wrap">{r.requirements}</p>
                              </div>
                            )}
                            {r.kpis && r.kpis.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                  <Target size={12} /> KPIs
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {r.kpis.map((k, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">{k}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Department Dialog */}
      <Dialog open={deptOpen} onOpenChange={(v) => { setDeptOpen(v); if (!v) { setEditingDept(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDept ? "Edit Department" : "Add Department"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Department Name *</Label>
              <Input value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="e.g. Clinic, Sales & Marketing" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} placeholder="Short description (optional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!deptForm.name.trim()) return toast.error("Department name required");
                upsertDept.mutate();
              }}
              disabled={upsertDept.isPending}
            >
              {editingDept ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={roleOpen} onOpenChange={(v) => { setRoleOpen(v); if (!v) { setEditingRole(null); setActiveDeptForRole(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Role Title *</Label>
              <Input value={roleForm.title} onChange={(e) => setRoleForm({ ...roleForm, title: e.target.value })} placeholder="e.g. Dental Assistant, Telecaller" />
            </div>
            <div>
              <Label>Job Description</Label>
              <Textarea rows={3} value={roleForm.job_description} onChange={(e) => setRoleForm({ ...roleForm, job_description: e.target.value })} placeholder="Brief overview of the role" />
            </div>
            <div>
              <Label>Responsibilities</Label>
              <Textarea rows={4} value={roleForm.responsibilities} onChange={(e) => setRoleForm({ ...roleForm, responsibilities: e.target.value })} placeholder="Key day-to-day responsibilities" />
            </div>
            <div>
              <Label>Requirements / Qualifications</Label>
              <Textarea rows={3} value={roleForm.requirements} onChange={(e) => setRoleForm({ ...roleForm, requirements: e.target.value })} placeholder="Skills, education, experience" />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Target size={14} /> KPIs</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={roleForm.kpiInput}
                  onChange={(e) => setRoleForm({ ...roleForm, kpiInput: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKpi(); } }}
                  placeholder="e.g. Convert 60% leads, Patient rating > 4.5"
                />
                <Button type="button" variant="secondary" onClick={addKpi}>Add</Button>
              </div>
              {roleForm.kpis.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {roleForm.kpis.map((k, i) => (
                    <Badge key={i} variant="outline" className="gap-1">
                      {k}
                      <button onClick={() => removeKpi(i)} className="hover:text-destructive">
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!roleForm.title.trim()) return toast.error("Role title required");
                upsertRole.mutate();
              }}
              disabled={upsertRole.isPending}
            >
              {editingRole ? "Update" : "Add"} Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirms */}
      <AlertDialog open={!!deleteDeptId} onOpenChange={(v) => !v && setDeleteDeptId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this department?</AlertDialogTitle>
            <AlertDialogDescription>All roles inside this department will also be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDeptId && deleteDept.mutate(deleteDeptId)} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteRoleId} onOpenChange={(v) => !v && setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this role?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRoleId && deleteRole.mutate(deleteRoleId)} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
