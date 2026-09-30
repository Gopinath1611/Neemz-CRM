import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, Package, Syringe, Wrench, FlaskConical, Trash2, Edit, Truck } from "lucide-react";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";

const CATEGORIES = [
  { value: "dental_material", label: "Dental Material", icon: Package },
  { value: "disposable_equipment", label: "Disposable Equipment", icon: Syringe },
  { value: "instruments", label: "Instruments", icon: Wrench },
  { value: "lab_supplies", label: "Lab Supplies", icon: FlaskConical },
];

interface SupplierItem {
  id: string;
  name: string;
  category: string;
  supplier_id: string | null;
  brand: string | null;
  unit: string;
  quantity: number;
  cost_price: number;
  status: string;
  notes: string | null;
  created_at: string;
}

const defaultForm = {
  name: "",
  category: "dental_material",
  supplier_id: "",
  brand: "",
  unit: "pcs",
  quantity: 0,
  cost_price: 0,
  status: "available",
  notes: "",
};

const Suppliers = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dental_material");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SupplierItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: supplierItems = [], isLoading } = useQuery({
    queryKey: ["supplier_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupplierItem[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (item: typeof defaultForm & { id?: string }) => {
      const payload = {
        name: item.name,
        category: item.category,
        supplier_id: item.supplier_id || null,
        brand: item.brand || null,
        unit: item.unit,
        quantity: item.quantity,
        cost_price: item.cost_price,
        status: item.status,
        notes: item.notes || null,
      };
      if (item.id) {
        const { error } = await supabase.from("supplier_items").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("supplier_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier_items"] });
      toast.success(editingItem ? "Item updated" : "Item added");
      resetForm();
    },
    onError: () => toast.error("Failed to save item"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supplier_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier_items"] });
      toast.success("Item deleted");
    },
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingItem(null);
    setDialogOpen(false);
  };

  const openEdit = (item: SupplierItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      category: item.category,
      supplier_id: item.supplier_id || "",
      brand: item.brand || "",
      unit: item.unit,
      quantity: item.quantity,
      cost_price: item.cost_price,
      status: item.status,
      notes: item.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("Item name is required");
    saveMutation.mutate(editingItem ? { ...form, id: editingItem.id } : form);
  };

  const filteredItems = supplierItems.filter(
    (item) =>
      item.category === activeTab &&
      (search === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.brand?.toLowerCase().includes(search.toLowerCase()))
  );

  const pagedItems = usePagedSlice(filteredItems, page, pageSize);

  const getCategoryCounts = () =>
    CATEGORIES.map((c) => ({
      ...c,
      count: supplierItems.filter((i) => i.category === c.value).length,
    }));

  const catCounts = getCategoryCounts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage supplier items by category</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm({ ...defaultForm, category: activeTab }); setDialogOpen(true); }}>
              <Plus size={16} className="mr-2" /> Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Item" : "Add Supplier Item"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Item Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pcs", "box", "pack", "set", "roll", "bottle", "tube", "kg", "ltr"].map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cost Price (₹)</Label>
                  <Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    <SelectItem value="discontinued">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
              <Button className="w-full" onClick={handleSubmit} disabled={saveMutation.isPending}>
                {editingItem ? "Update Item" : "Add Item"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {catCounts.map((c) => (
          <Card key={c.value} className={`cursor-pointer transition-all ${activeTab === c.value ? "ring-2 ring-primary" : ""}`} onClick={() => setActiveTab(c.value)}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <c.icon size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{c.count}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.value} value={c.value} className="gap-2">
                <c.icon size={14} /> {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search items..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat.value} value={cat.value}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <cat.icon size={18} /> {cat.label}
                  <Badge variant="secondary" className="ml-2">{filteredItems.length} items</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading...</p>
                ) : filteredItems.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No items found. Click "Add Item" to get started.</p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Brand</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Cost (₹)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-20">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedItems.map((item) => {
                          const supplier = suppliers.find((s: any) => s.id === item.supplier_id);
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>{item.brand || "-"}</TableCell>
                              <TableCell>{supplier?.name || "-"}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell>₹{item.cost_price}</TableCell>
                              <TableCell>
                                <Badge variant={item.status === "available" ? "default" : item.status === "out_of_stock" ? "destructive" : "secondary"}>
                                  {item.status.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Edit size={14} /></Button>
                                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={14} /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <TablePagination page={page} pageSize={pageSize} total={filteredItems.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="items" />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Suppliers;
