import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  List,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

interface GeoFence {
  id: string;
  name: string;
  employees: number;
}

const STORAGE_KEY = "hrms_geo_fencing_settings";

const DEFAULT_FENCES: GeoFence[] = [
  { id: "gf-1", name: "Main Clinic - Salem", employees: 12 },
  { id: "gf-2", name: "Branch Clinic - Attur", employees: 6 },
  { id: "gf-3", name: "Corporate Office", employees: 4 },
  { id: "gf-4", name: "Field / Marketing Zone", employees: 2 },
];

function loadFences(): GeoFence[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as GeoFence[];
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_FENCES;
}

export default function GeoFencingSettings() {
  const [fences, setFences] = useState<GeoFence[]>(() => loadFences());
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GeoFence | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmployees, setFormEmployees] = useState("0");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fences));
  }, [fences]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fences;
    return fences.filter((f) => f.name.toLowerCase().includes(q));
  }, [fences, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);
  const rows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const openAdd = () => {
    setEditing(null);
    setFormName("");
    setFormEmployees("0");
    setDialogOpen(true);
  };

  const openEdit = (fence: GeoFence) => {
    setEditing(fence);
    setFormName(fence.name);
    setFormEmployees(String(fence.employees));
    setDialogOpen(true);
  };

  const save = () => {
    const name = formName.trim();
    if (!name) {
      toast.error("Geo-fencing name is required");
      return;
    }
    const employees = Math.max(0, Number(formEmployees) || 0);
    if (editing) {
      setFences((prev) =>
        prev.map((f) => (f.id === editing.id ? { ...f, name, employees } : f))
      );
      toast.success("Geo-fencing updated");
    } else {
      setFences((prev) => [
        ...prev,
        { id: `gf-${Date.now()}`, name, employees },
      ]);
      toast.success("Geo-fencing added");
    }
    setDialogOpen(false);
  };

  const remove = (fence: GeoFence) => {
    setFences((prev) => prev.filter((f) => f.id !== fence.id));
    toast.success("Geo-fencing deleted");
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setFences((prev) => {
      const next = [...prev];
      const fromId = rows[dragIndex]?.id;
      const toId = rows[targetIndex]?.id;
      const from = next.findIndex((f) => f.id === fromId);
      const to = next.findIndex((f) => f.id === toId);
      if (from < 0 || to < 0) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const exportCsv = () => {
    const lines = [
      "Geo-fencing name,Number of employees",
      ...filtered.map((f) => `"${f.name}",${f.employees}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geo-fencing.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <h2 className="text-lg font-semibold">Geo-fencing</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search for a geo-fencing"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Button className="h-9 gap-1" onClick={openAdd}>
            <Plus className="h-4 w-4" /> ADD NEW
          </Button>
          <div className="flex items-center rounded-md border">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setView("list")}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setView("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>Export</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setFences(DEFAULT_FENCES);
                  toast.success("Reset to defaults");
                }}
              >
                Reset to defaults
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      {view === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 font-medium">Geo-fencing name</th>
                <th className="px-4 py-3 font-medium">Number of employees</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No geo-fencing found
                  </td>
                </tr>
              )}
              {rows.map((fence, index) => (
                <tr
                  key={fence.id}
                  className="border-b transition-colors hover:bg-muted/30"
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    <GripVertical className="h-4 w-4 cursor-grab" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">{fence.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fence.employees}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(fence)}
                        aria-label={`Edit ${fence.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => remove(fence)}
                        aria-label={`Delete ${fence.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((fence) => (
            <Card key={fence.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">{fence.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(fence)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => remove(fence)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> {fence.employees} employees
              </div>
            </Card>
          ))}
          {rows.length === 0 && (
            <p className="col-span-full py-10 text-center text-muted-foreground">No geo-fencing found</p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-end gap-4 border-t bg-muted/20 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows per page</span>
          <Select
            value={String(perPage)}
            onValueChange={(v) => {
              setPerPage(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground">
          {start} - {end} of {total}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit geo-fencing" : "Add geo-fencing"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gf-name">Geo-fencing name</Label>
              <Input
                id="gf-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Main Clinic - Salem"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gf-emp">Number of employees</Label>
              <Input
                id="gf-emp"
                type="number"
                min={0}
                value={formEmployees}
                onChange={(e) => setFormEmployees(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
