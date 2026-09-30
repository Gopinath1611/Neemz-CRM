import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { Users, Plus, Search, Edit2, Eye, UserCheck, UserX, Briefcase, Phone, Mail, Trash2, Settings2, Check, X } from "lucide-react";
import { format } from "date-fns";

interface Employee {
  id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employment_type: string | null;
  join_date: string;
  exit_date: string | null;
  status: string;
  base_salary: number | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  pan_number: string | null;
  aadhar_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  extra_details?: any;
}

/**
 * Single source of truth for salary: Compensation Details → Pay Rate
 * (extra_details.pay_rate + pay_schedule), normalized to a monthly figure.
 * Falls back to base_salary for legacy records.
 */
export function monthlySalary(emp: { base_salary?: number | null; extra_details?: any }): number {
  const extra = emp?.extra_details || {};
  const raw = Number(String(extra.pay_rate ?? "").replace(/[^0-9.-]/g, ""));
  if (Number.isFinite(raw) && raw > 0) {
    const sched = String(extra.pay_schedule || "monthly").toLowerCase().replace(/[\s-]/g, "_");
    const factor = sched === "weekly" ? 52 / 12 : sched === "bi_weekly" ? 26 / 12 : sched === "annually" ? 1 / 12 : 1;
    return Math.round(raw * factor * 100) / 100;
  }
  return Number(emp?.base_salary || 0);

}

const DEFAULT_DEPARTMENTS = ["general", "dental", "reception", "marketing", "accounts", "lab", "housekeeping", "clinic", "finance", "hr", "sales_marketing"];
const DEFAULT_DESIGNATIONS = ["doctor", "nurse", "receptionist", "telecaller", "marketing_exec", "accountant", "lab_tech", "helper", "manager", "intern", "dental_assistant", "housekeeping", "video_editor", "dm_executive", "dm_manager", "hr_manager", "hr_executive", "accounts_manager"];
const DEFAULT_EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"];

const loadList = (key: string, defaults: string[]): string[] => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  return defaults;
};
const saveList = (key: string, list: string[]) => localStorage.setItem(key, JSON.stringify(list));

// Designation → short code prefix map for auto-generated Employee IDs
const designationPrefixMap: Record<string, string> = {
  doctor: "DOC",
  dental_assistant: "DA",
  housekeeping: "HK",
  receptionist: "REC",
  accountant: "AC",
  accounts_manager: "AM",
  hr_manager: "HRM",
  hr_executive: "HRE",
  dm_manager: "DMM",
  dm_executive: "DME",
  telecaller: "TC",
  video_editor: "VE",
  nurse: "NUR",
  marketing_exec: "ME",
  lab_tech: "LAB",
  helper: "HLP",
  manager: "MGR",
  intern: "INT",
  staff: "STF",
};

const generateEmployeeCode = async (designation: string): Promise<string> => {
  const prefix = designationPrefixMap[designation] || "STF";
  const codePattern = `EMP-${prefix}-`;
  const { data } = await supabase
    .from("employees")
    .select("employee_code")
    .like("employee_code", `${codePattern}%`)
    .order("employee_code", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0 && data[0].employee_code) {
    const m = data[0].employee_code.match(/(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${codePattern}${String(next).padStart(2, "0")}`;
};

const Employees = () => {
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("admin");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shiftMap, setShiftMap] = useState<Record<string, { shift_name: string; start_time: string; end_time: string }>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [departments, setDepartments] = useState<string[]>(() => loadList("emp_departments", DEFAULT_DEPARTMENTS));
  const [designations, setDesignations] = useState<string[]>(() => loadList("emp_designations", DEFAULT_DESIGNATIONS));
  const [employmentTypes, setEmploymentTypes] = useState<string[]>(() => loadList("emp_employment_types", DEFAULT_EMPLOYMENT_TYPES));
  const [showManageLists, setShowManageLists] = useState(false);
  const [manageListTarget, setManageListTarget] = useState<"departments" | "designations" | "employmentTypes" | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", department: "general",
    designation: "staff", employment_type: "full_time", join_date: format(new Date(), "yyyy-MM-dd"),
    base_salary: "", gender: "male", date_of_birth: "", address: "",
    bank_name: "", bank_account_number: "", bank_ifsc: "", pan_number: "", aadhar_number: "",
    emergency_contact_name: "", emergency_contact_phone: "", employee_code: "",
    user_id: "",
  });

  useEffect(() => { fetchEmployees(); fetchProfiles(); }, [isAdmin, user?.id, user?.email]);

  const fetchEmployees = async () => {
    if (isAdmin) {
      const { data } = await supabase.from("employees").select("*").order("first_name");
      if (data) setEmployees(data as Employee[]);
    } else {
      // Non-admin: only own record (match user_id, fallback to email)
      if (!user) { setEmployees([]); return; }
      let { data } = await supabase.from("employees").select("*").eq("user_id", user.id);
      if ((!data || data.length === 0) && user.email) {
        const r = await supabase.from("employees").select("*").eq("email", user.email);
        data = r.data ?? [];
      }
      setEmployees((data || []) as Employee[]);
    }
    await fetchShifts();
  };

  const fetchShifts = async () => {
    const { data } = await supabase
      .from("employee_shifts")
      .select("employee_id, shift_name, start_time, end_time, effective_from")
      .order("effective_from", { ascending: false });
    const map: Record<string, { shift_name: string; start_time: string; end_time: string }> = {};
    ((data as any[]) || []).forEach((s) => {
      if (s.employee_id && !map[s.employee_id]) {
        map[s.employee_id] = { shift_name: s.shift_name, start_time: s.start_time, end_time: s.end_time };
      }
    });
    setShiftMap(map);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name");
    if (data) setProfiles(data as any);
  };

  const resetForm = () => setForm({
    first_name: "", last_name: "", email: "", phone: "", department: "general",
    designation: "staff", employment_type: "full_time", join_date: format(new Date(), "yyyy-MM-dd"),
    base_salary: "", gender: "male", date_of_birth: "", address: "",
    bank_name: "", bank_account_number: "", bank_ifsc: "", pan_number: "", aadhar_number: "",
    emergency_contact_name: "", emergency_contact_phone: "", employee_code: "",
    user_id: "",
  });

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) { toast.error("Name is required"); return; }
    // Auto-generate Employee ID for new employees if not set
    let finalCode = form.employee_code;
    if (!editEmployee && !finalCode) {
      finalCode = await generateEmployeeCode(form.designation);
    }
    const payload: any = {
      ...form,
      base_salary: parseFloat(form.base_salary) || 0,
      employee_code: finalCode || null,
      date_of_birth: form.date_of_birth || null,
      user_id: form.user_id || null,
    };

    if (editEmployee) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editEmployee.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Employee updated");
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Employee added");
    }
    setShowAdd(false);
    setEditEmployee(null);
    resetForm();
    fetchEmployees();
  };

  const handleDeactivate = async (emp: Employee) => {
    const newStatus = emp.status === "active" ? "inactive" : "active";
    await supabase.from("employees").update({
      status: newStatus,
      exit_date: newStatus === "inactive" ? format(new Date(), "yyyy-MM-dd") : null,
    }).eq("id", emp.id);
    toast.success(`Employee ${newStatus === "active" ? "activated" : "deactivated"}`);
    fetchEmployees();
  };

  const handleSingleDelete = async () => {
    if (!deleteEmployee) return;
    const { error } = await supabase.from("employees").delete().eq("id", deleteEmployee.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${deleteEmployee.first_name} ${deleteEmployee.last_name} deleted`);
    setDeleteEmployee(null);
    fetchEmployees();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    // Chunk to avoid URL length limits (PostgREST .in() builds a long query string)
    const CHUNK = 50;
    let deleted = 0;
    let firstError: string | null = null;
    for (let i = 0; i < selectedIds.length; i += CHUNK) {
      const slice = selectedIds.slice(i, i + CHUNK);
      const { error } = await supabase.from("employees").delete().in("id", slice);
      if (error) {
        if (!firstError) firstError = error.message;
      } else {
        deleted += slice.length;
      }
    }
    if (firstError && deleted === 0) {
      toast.error(firstError);
      return;
    }
    if (firstError) {
      toast.warning(`${deleted} deleted, some failed: ${firstError}`);
    } else {
      toast.success(`${deleted} employee(s) deleted`);
    }
    setSelectedIds([]);
    setShowBulkDelete(false);
    fetchEmployees();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map((e) => e.id));
  };

  const openEdit = (emp: Employee) => {
    setForm({
      first_name: emp.first_name, last_name: emp.last_name, email: emp.email || "",
      phone: emp.phone || "", department: emp.department || "general",
      designation: emp.designation || "staff", employment_type: emp.employment_type || "full_time",
      join_date: emp.join_date, base_salary: String(emp.base_salary || ""),
      gender: emp.gender || "male", date_of_birth: emp.date_of_birth || "", address: emp.address || "",
      bank_name: emp.bank_name || "", bank_account_number: emp.bank_account_number || "",
      bank_ifsc: emp.bank_ifsc || "", pan_number: emp.pan_number || "", aadhar_number: emp.aadhar_number || "",
      emergency_contact_name: emp.emergency_contact_name || "", emergency_contact_phone: emp.emergency_contact_phone || "",
      employee_code: emp.employee_code || "",
      user_id: (emp as any).user_id || "",
    });
    setEditEmployee(emp);
    setShowAdd(true);
  };

  const openListManager = (target: "departments" | "designations" | "employmentTypes" | null) => {
    setManageListTarget(target);
    setShowManageLists(true);
  };

  const filtered = employees.filter((e) => {
    const matchSearch = `${e.first_name} ${e.last_name} ${e.employee_code || ""} ${e.department || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = employees.filter((e) => e.status === "active").length;
  const totalSalary = employees.filter((e) => e.status === "active").reduce((s, e) => s + monthlySalary(e), 0);


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> {isAdmin ? "Employees" : "My Profile"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Manage employee records, onboarding & offboarding" : "Your employee profile"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => { resetForm(); setEditEmployee(null); setShowAdd(true); }}>
              <Plus size={16} className="mr-1" /> Add Employee
            </Button>
          </div>
        )}
      </div>

      {/* Stats — admin only */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Employees</p>
            <p className="text-2xl font-bold text-foreground">{employees.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Inactive/Exited</p>
            <p className="text-2xl font-bold text-destructive">{employees.length - activeCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Monthly Payroll</p>
            <p className="text-2xl font-bold text-primary">₹{totalSalary.toLocaleString()}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Filters — admin only */}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Employee Name</TableHead>
                <TableHead>Office Member</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Joining Date</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Assigned Shift</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => {
                const extra = (emp.extra_details || {}) as any;
                const officeMember = extra.role || extra.office_member || extra.job_title || emp.designation?.replace(/_/g, " ") || "—";
                const location = emp.status === "active" ? "Branch 1" : (extra.location || extra.work_location || extra.office_location || "—");
                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-mono text-sm font-semibold text-primary">
                      <Link to={`/employees/${emp.id}`} className="hover:underline">
                        {emp.employee_code || "View"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/employees/${emp.id}`} className="font-medium hover:underline">
                        {emp.first_name} {emp.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{officeMember}</TableCell>
                    <TableCell className="capitalize text-sm">{emp.department || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{emp.designation?.replace(/_/g, " ") || "—"}</TableCell>
                    
                    <TableCell className="text-sm">{emp.join_date ? format(new Date(emp.join_date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm">{location}</TableCell>
                    <TableCell className="text-sm">
                      {shiftMap[emp.id]
                        ? `${shiftMap[emp.id].shift_name} (${shiftMap[emp.id].start_time.slice(0, 5)} - ${shiftMap[emp.id].end_time.slice(0, 5)})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={emp.status === "active"}
                          onCheckedChange={() => handleDeactivate(emp)}
                          aria-label={`Toggle status for ${emp.first_name} ${emp.last_name}`}
                          title={emp.status === "active" ? "Deactivate (excluded from new payruns)" : "Activate"}
                        />
                        <Badge variant={emp.status === "active" ? "default" : "secondary"}>
                          {emp.status}
                        </Badge>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit employee" onClick={() => openEdit(emp)}>
                        <Edit2 size={15} className="text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditEmployee(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEmployee ? "Edit Employee" : "Add New Employee"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div><Label>Employee Code {!editEmployee && <span className="text-xs text-muted-foreground">(auto-generated)</span>}</Label><Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} placeholder={editEmployee ? "EMP-DOC-01" : "Will be auto-generated on save"} disabled={!editEmployee} /></div>
            <div><Label>First Name *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last Name *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Department</Label>
                {isAdmin && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openListManager("departments")}>
                    <Settings2 size={12} className="mr-1" /> Edit
                  </Button>
                )}
              </div>
              <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{departments.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Designation</Label>
                {isAdmin && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openListManager("designations")}>
                    <Settings2 size={12} className="mr-1" /> Edit
                  </Button>
                )}
              </div>
              <Select value={form.designation} onValueChange={(v) => setForm({ ...form, designation: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{designations.map((d) => <SelectItem key={d} value={d} className="capitalize">{d.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Employment Type</Label>
                {isAdmin && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openListManager("employmentTypes")}>
                    <Settings2 size={12} className="mr-1" /> Edit
                  </Button>
                )}
              </div>
              <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{employmentTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Join Date</Label><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></div>
            <div><Label>Base Salary (₹)</Label><Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>

            <div className="sm:col-span-2 border-t pt-3 mt-2">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Bank & ID Details</p>
            </div>
            <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><Label>Account Number</Label><Input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} /></div>
            <div><Label>IFSC Code</Label><Input value={form.bank_ifsc} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })} /></div>
            <div><Label>PAN Number</Label><Input value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value })} /></div>
            <div><Label>Aadhar Number</Label><Input value={form.aadhar_number} onChange={(e) => setForm({ ...form, aadhar_number: e.target.value })} /></div>

            <div className="sm:col-span-2 border-t pt-3 mt-2">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Emergency Contact</p>
            </div>
            <div><Label>Contact Name</Label><Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></div>
            <div><Label>Contact Phone</Label><Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></div>

            {isAdmin && (
              <>
                <div className="sm:col-span-2 border-t pt-3 mt-2">
                  <p className="text-sm font-semibold text-muted-foreground mb-1">Login Account Link (Admin only)</p>
                  <p className="text-xs text-muted-foreground mb-3">Link this employee to a login account so they only see their own attendance, leaves, and payslip.</p>
                </div>
                <div className="sm:col-span-2">
                  <Label>Linked User Account</Label>
                  <Select value={form.user_id || "none"} onValueChange={(v) => setForm({ ...form, user_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not linked —</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <Button onClick={handleSave} className="w-full mt-4">{editEmployee ? "Update Employee" : "Add Employee"}</Button>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewEmployee} onOpenChange={(o) => !o && setViewEmployee(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Employee Details</DialogTitle>
          </DialogHeader>
          {viewEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                  {viewEmployee.first_name[0]}{viewEmployee.last_name[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{viewEmployee.first_name} {viewEmployee.last_name}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{viewEmployee.designation?.replace("_", " ")} • {viewEmployee.department}</p>
                </div>
                <Badge className="ml-auto" variant={viewEmployee.status === "active" ? "default" : "secondary"}>{viewEmployee.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" />{viewEmployee.phone || "—"}</div>
                <div className="flex items-center gap-2"><Mail size={14} className="text-muted-foreground" />{viewEmployee.email || "—"}</div>
                <div><span className="text-muted-foreground">Code:</span> {viewEmployee.employee_code || "—"}</div>
                <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{viewEmployee.employment_type?.replace("_", " ")}</span></div>
                <div><span className="text-muted-foreground">Joined:</span> {format(new Date(viewEmployee.join_date), "dd MMM yyyy")}</div>
                <div><span className="text-muted-foreground">Salary:</span> ₹{monthlySalary(viewEmployee).toLocaleString()}</div>
                {viewEmployee.bank_name && <div><span className="text-muted-foreground">Bank:</span> {viewEmployee.bank_name}</div>}
                {viewEmployee.pan_number && <div><span className="text-muted-foreground">PAN:</span> {viewEmployee.pan_number}</div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} employee(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected employee records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleteEmployee} onOpenChange={(o) => !o && setDeleteEmployee(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteEmployee?.first_name} {deleteEmployee?.last_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this employee record ({deleteEmployee?.employee_code || "—"}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSingleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Lists (Admin only) */}
      <Dialog open={showManageLists} onOpenChange={(open) => {
        setShowManageLists(open);
        if (!open) setManageListTarget(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 size={18} /> Manage Dropdown Lists
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <ListEditor
              title="Departments"
              items={departments}
              isActive={manageListTarget === "departments"}
              onChange={(next) => { setDepartments(next); saveList("emp_departments", next); }}
            />
            <ListEditor
              title="Designations"
              items={designations}
              isActive={manageListTarget === "designations"}
              onChange={(next) => { setDesignations(next); saveList("emp_designations", next); }}
            />
            <ListEditor
              title="Employment Types"
              items={employmentTypes}
              isActive={manageListTarget === "employmentTypes"}
              onChange={(next) => { setEmploymentTypes(next); saveList("emp_employment_types", next); }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Edits apply immediately to the Add/Edit Employee dropdowns. Existing employee records are not affected.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface ListEditorProps {
  title: string;
  items: string[];
  isActive?: boolean;
  onChange: (next: string[]) => void;
}

const ListEditor = ({ title, items, isActive = false, onChange }: ListEditorProps) => {
  const [newItem, setNewItem] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");

  const handleAdd = () => {
    const v = normalize(newItem);
    if (!v) return;
    if (items.includes(v)) {
      toast.error("Already exists");
      return;
    }
    onChange([...items, v]);
    setNewItem("");
    toast.success(`Added to ${title}`);
  };

  const handleSaveEdit = (idx: number) => {
    const v = normalize(editVal);
    if (!v) return;
    if (items.includes(v) && items[idx] !== v) {
      toast.error("Already exists");
      return;
    }
    const next = [...items];
    next[idx] = v;
    onChange(next);
    setEditIdx(null);
    setEditVal("");
    toast.success("Updated");
  };

  const handleDelete = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
    toast.success("Deleted");
  };

  return (
    <Card className={isActive ? "border-primary" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-1">
          <Input
            placeholder="Add new..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleAdd} className="h-8 px-2">
            <Plus size={14} />
          </Button>
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {items.map((item, idx) => (
            <div key={item + idx} className="flex items-center gap-1 p-1 rounded hover:bg-muted/50">
              {editIdx === idx ? (
                <>
                  <Input
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(idx)}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleSaveEdit(idx)}>
                    <Check size={14} className="text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditIdx(null); setEditVal(""); }}>
                    <X size={14} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm capitalize">{item.replace(/_/g, " ")}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditIdx(idx); setEditVal(item); }}>
                    <Edit2 size={13} />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(idx)}>
                    <Trash2 size={13} />
                  </Button>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No items</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Employees;
