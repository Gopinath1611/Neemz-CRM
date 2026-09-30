import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "@/components/common/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Plus, X, Search, MoreVertical } from "lucide-react";

interface AssetRow {
  id: string;
  asset_id: string;
  asset_name: string;
  category: string | null;
  quantity?: number;
  assigned_to: string | null;
  assigned_date: string | null;
  return_date: string | null;
  condition: string;
  status: string;
}

interface EmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
}

const MOCK_EMPLOYEES: EmployeeRow[] = [
  { id: "emp-1", first_name: "Sabana", last_name: null, designation: "Digital Relationship Manager" },
  { id: "emp-2", first_name: "Dr.", last_name: "Sadham", designation: "Doctor" },
  { id: "emp-3", first_name: "Ravi", last_name: null, designation: "Telecaller" },
  { id: "emp-4", first_name: "Priya", last_name: null, designation: "Dental Assistant" },
  { id: "emp-5", first_name: "Karthik", last_name: null, designation: "Receptionist" },
];

const MOCK_ASSETS: AssetRow[] = [
  {
    id: "1",
    asset_id: "DN-AST-001",
    asset_name: "iPhone 14 Pro",
    category: "Mobile & SIM",
    assigned_to: "emp-1",
    assigned_date: "2024-03-15",
    return_date: null,
    condition: "Good",
    status: "in_use",
  },
  {
    id: "2",
    asset_id: "DN-AST-002",
    asset_name: "Endo Motor",
    category: "Clinical Equipment",
    assigned_to: "emp-2",
    assigned_date: "2023-11-02",
    return_date: null,
    condition: "New",
    status: "in_use",
  },
  {
    id: "3",
    asset_id: "DN-AST-003",
    asset_name: "Dell Latitude Laptop",
    category: "Computer & IT",
    assigned_to: "emp-3",
    assigned_date: "2024-01-10",
    return_date: "2024-06-10",
    condition: "Fair",
    status: "returned",
  },
  {
    id: "4",
    asset_id: "DN-AST-004",
    asset_name: "Intraoral Scanner",
    category: "Clinical Equipment",
    assigned_to: "emp-2",
    assigned_date: "2023-09-20",
    return_date: null,
    condition: "Good",
    status: "in_use",
  },
  {
    id: "5",
    asset_id: "DN-AST-005",
    asset_name: "Apex Locator",
    category: "Clinical Equipment",
    assigned_to: "emp-4",
    assigned_date: "2024-02-28",
    return_date: null,
    condition: "New",
    status: "in_use",
  },
  {
    id: "6",
    asset_id: "DN-AST-006",
    asset_name: "Office Chair - Ergonomic",
    category: "Furniture",
    assigned_to: "emp-5",
    assigned_date: "2023-12-05",
    return_date: null,
    condition: "Fair",
    status: "in_use",
  },
  {
    id: "7",
    asset_id: "DN-AST-007",
    asset_name: "SIM Card - Postpaid",
    category: "Mobile & SIM",
    assigned_to: "emp-1",
    assigned_date: "2024-04-01",
    return_date: null,
    condition: "New",
    status: "in_use",
  },
  {
    id: "8",
    asset_id: "DN-AST-008",
    asset_name: "Dental Chair Unit",
    category: "Clinical Equipment",
    assigned_to: null,
    assigned_date: null,
    return_date: null,
    condition: "Good",
    status: "in_use",
  },
  {
    id: "9",
    asset_id: "DN-AST-009",
    asset_name: "Tablet - Samsung Galaxy Tab",
    category: "Computer & IT",
    assigned_to: "emp-4",
    assigned_date: "2024-05-12",
    return_date: null,
    condition: "Damaged",
    status: "damaged",
  },
  {
    id: "10",
    asset_id: "DN-AST-010",
    asset_name: "Clinic Vehicle - Scooter",
    category: "Vehicle",
    assigned_to: "emp-3",
    assigned_date: "2023-08-18",
    return_date: null,
    condition: "Fair",
    status: "in_use",
  },
];

const CATEGORIES = [
  "Mobile & SIM",
  "Computer & IT",
  "Clinical Equipment",
  "Furniture",
  "Vehicle",
  "Other",
];

const CONDITIONS = [
  { value: "New", label: "New" },
  { value: "Good", label: "Good" },
  { value: "Fair", label: "Fair" },
  { value: "Damaged", label: "Damaged" },
];

const STATUSES = [
  { value: "in_use", label: "In Use" },
  { value: "returned", label: "Returned" },
  { value: "damaged", label: "Damaged" },
];

const statusVariant = (status: string) => {
  if (status === "in_use") return "default" as const;
  if (status === "returned") return "secondary" as const;
  return "destructive" as const;
};

const statusLabel = (status: string) =>
  STATUSES.find((s) => s.value === status)?.label ?? status;

const conditionVariant = (condition: string) => {
  if (condition === "New") return "default" as const;
  if (condition === "Good") return "secondary" as const;
  if (condition === "Fair") return "outline" as const;
  return "destructive" as const;
};

export default function Assets() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>(MOCK_EMPLOYEES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_name: "",
    category: "",
    quantity: "1",
    assigned_to: "",
    assigned_date: new Date().toISOString().slice(0, 10),
    status: "in_use",
  });
  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewTarget, setViewTarget] = useState<AssetRow | null>(null);
  const [editTarget, setEditTarget] = useState<AssetRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AssetRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const openEdit = (a: AssetRow) => {
    setEditTarget(a);
    setForm({
      asset_name: a.asset_name,
      category: a.category ?? "",
      quantity: String(a.quantity ?? 1),
      assigned_to: a.assigned_to ?? "",
      assigned_date: a.assigned_date ?? "",
      status: a.status,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditTarget(null);
    setForm({
      asset_name: "",
      category: "",
      quantity: "1",
      assigned_to: "",
      assigned_date: new Date().toISOString().slice(0, 10),
      status: "in_use",
    });
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const patch = {
      assigned_to: null,
      assigned_date: null,
      return_date: new Date().toISOString().slice(0, 10),
      status: "returned",
    };
    const { error } = await supabase
      .from("assets")
      .update({ assigned_to: null, assigned_date: null, status: "returned" })
      .eq("id", revokeTarget.id);
    setRevoking(false);
    if (error && !/invalid input syntax/i.test(error.message)) {
      toast({ title: "Could not revoke asset", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((a) => (a.id === revokeTarget.id ? { ...a, ...patch } : a)));
    toast({ title: "Asset revoked" });
    setRevokeTarget(null);
  };



  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setTimeout(() => {
      setAssets(MOCK_ASSETS);
      setLoading(false);
    }, 400);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [departmentFilter, statusFilter, search, employeeFilter]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, EmployeeRow>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const employeeName = (id: string | null) => {
    if (!id) return "Unassigned";
    const e = employeeMap.get(id);
    if (!e) return "Unknown";
    return [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unnamed";
  };

  const employeeDepartment = (id: string | null) => {
    if (!id) return "—";
    const e = employeeMap.get(id);
    return e?.designation ?? "—";
  };

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const departmentMap: Record<string, string[]> = {
      admin: ["Receptionist", "Digital Relationship Manager"],
      clinical: ["Doctor", "Dental Assistant"],
      telecalling: ["Telecaller"],
    };
    return assets.filter((a) => {
      if (employeeFilter && a.assigned_to !== employeeFilter) return false;

      if (departmentFilter !== "all") {
        const dept = employeeDepartment(a.assigned_to);
        const allowed = departmentMap[departmentFilter] ?? [];
        if (!allowed.includes(dept)) return false;
      }

      if (statusFilter !== "all") {
        if (statusFilter === "available") {
          if (a.assigned_to !== null) return false;
        } else if (statusFilter === "maintenance") {
          if (a.status !== "damaged") return false;
        } else if (a.status !== statusFilter) {
          return false;
        }
      }

      if (!q) return true;
      return (
        a.asset_id.toLowerCase().includes(q) ||
        a.asset_name.toLowerCase().includes(q) ||
        (a.category ?? "").toLowerCase().includes(q) ||
        employeeName(a.assigned_to).toLowerCase().includes(q) ||
        employeeDepartment(a.assigned_to).toLowerCase().includes(q) ||
        a.condition.toLowerCase().includes(q)
      );
    });
  }, [assets, search, employeeFilter, departmentFilter, statusFilter, employeeMap]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredAssets.length);
  const paginated = filteredAssets.slice(startIndex, endIndex);

  const handleSave = async () => {
    if (!form.asset_name.trim()) {
      toast({ title: "Asset name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const values = {
      asset_name: form.asset_name.trim(),
      category: form.category || null,
      quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
      assigned_to: form.assigned_to || null,
      assigned_date: form.assigned_date || null,
      status: form.status,
    };

    if (editTarget) {
      const { error } = await supabase.from("assets").update(values).eq("id", editTarget.id);
      setSaving(false);
      if (error && !/invalid input syntax/i.test(error.message)) {
        toast({ title: "Could not update asset", description: error.message, variant: "destructive" });
        return;
      }
      setAssets((prev) => prev.map((a) => (a.id === editTarget.id ? { ...a, ...values } : a)));
      toast({ title: "Asset updated" });
      setDialogOpen(false);
      resetForm();
      return;
    }

    setTimeout(() => {
      const newAsset: AssetRow = {
        id: String(Date.now()),
        asset_id: `DN-AST-${String(assets.length + 1).padStart(3, "0")}`,
        ...values,
        return_date: null,
        condition: "New",
      };
      setAssets((prev) => [newAsset, ...prev]);
      setSaving(false);
      toast({ title: "Asset added" });
      setDialogOpen(false);
      resetForm();
    }, 400);
  };


  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("assets").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error && !/invalid input syntax/i.test(error.message)) {
      toast({ title: "Could not delete asset", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    toast({ title: "Asset deleted" });
    setDeleteTarget(null);
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" />
            Assets
          </h1>
          <p className="text-muted-foreground text-sm">
            Clinic equipment register and employee-wise assignments
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Asset
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Asset List{" "}
              <span className="text-muted-foreground font-normal">({filteredAssets.length})</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {employeeFilter && (
                <Badge variant="secondary" className="gap-1">
                  {employeeName(employeeFilter)}
                  <button
                    aria-label="Clear employee filter"
                    onClick={() => setEmployeeFilter(null)}
                    className="ml-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Filter by Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="telecalling">Telecalling</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets or employee"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset ID</TableHead>
                <TableHead>Asset Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Assigned Date</TableHead>
                <TableHead>Return Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    Loading assets...
                  </TableCell>
                </TableRow>
              ) : filteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    No assets found. Use "Add Asset" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.asset_id}</TableCell>
                    <TableCell>{a.asset_name}</TableCell>
                    <TableCell>{a.category || "—"}</TableCell>
                    <TableCell>{a.quantity ?? 1}</TableCell>
                    <TableCell>
                      {a.assigned_to ? (
                        <button
                          className="text-primary hover:underline"
                          onClick={() => setEmployeeFilter(a.assigned_to)}
                        >
                          {employeeName(a.assigned_to)}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>{employeeDepartment(a.assigned_to)}</TableCell>
                    <TableCell>
                      <Badge variant={conditionVariant(a.condition)}>{a.condition}</Badge>
                    </TableCell>
                    <TableCell>
                      {a.assigned_date
                        ? new Date(a.assigned_date).toLocaleDateString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {a.return_date
                        ? new Date(a.return_date).toLocaleDateString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewTarget(a)}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(a)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!a.assigned_to}
                            onClick={() => setRevokeTarget(a)}
                          >
                            Revoke
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(a)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredAssets.length === 0 ? 0 : startIndex + 1} to {endIndex} of {filteredAssets.length} entries
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    className={safePage <= 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === safePage}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(p);
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                    className={safePage >= totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Asset Name *</Label>
              <Input
                value={form.asset_name}
                onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                placeholder="e.g. Endo Motor, Laptop, SIM Card"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select
                value={form.assigned_to}
                onValueChange={(v) => setForm({ ...form, assigned_to: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {[e.first_name, e.last_name].filter(Boolean).join(" ")}
                      {e.designation ? ` (${e.designation})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Assigned Date</Label>
                <Input
                  type="date"
                  value={form.assigned_date}
                  onChange={(e) => setForm({ ...form, assigned_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.asset_name}" (${deleteTarget.asset_id}) will be permanently removed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asset Details</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Asset ID</p>
                <p className="font-medium">{viewTarget.asset_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Asset Name</p>
                <p className="font-medium">{viewTarget.asset_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{viewTarget.category || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Quantity</p>
                <p className="font-medium">{viewTarget.quantity ?? 1}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assigned To</p>
                <p className="font-medium">{employeeName(viewTarget.assigned_to)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Department</p>
                <p className="font-medium">{employeeDepartment(viewTarget.assigned_to)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assigned Date</p>
                <p className="font-medium">
                  {viewTarget.assigned_date
                    ? new Date(viewTarget.assigned_date).toLocaleDateString("en-IN")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Return Date</p>
                <p className="font-medium">
                  {viewTarget.return_date
                    ? new Date(viewTarget.return_date).toLocaleDateString("en-IN")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Condition</p>
                <Badge variant={conditionVariant(viewTarget.condition)}>{viewTarget.condition}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant={statusVariant(viewTarget.status)}>{statusLabel(viewTarget.status)}</Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `"${revokeTarget.asset_name}" will be unassigned from ${employeeName(
                    revokeTarget.assigned_to,
                  )} and marked as Returned.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRevoke(); }} disabled={revoking}>
              {revoking ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageContainer>
  );
}
