import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { CategoryPicker } from "@/components/inventory/CategoryPicker";

type InventoryItem = Tables<"inventory_items"> & {
  inventory_categories: { name: string } | null;
};

interface Props {
  editItem: InventoryItem | null;
  categories: Tables<"inventory_categories">[];
  onSave: (payload: TablesInsert<"inventory_items">) => void;
  isSaving: boolean;
  onCategoriesChanged: () => void;
}

const InventoryItemForm = ({ editItem, categories, onSave, isSaving, onCategoriesChanged }: Props) => {
  const queryClient = useQueryClient();
  const [catDialog, setCatDialog] = useState<{ mode: "add" | "edit"; id?: string; name: string } | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);

  const { brandOptions } = useClinicMasters();

  const [form, setForm] = useState({
    name: editItem?.name || "",
    sku: editItem?.sku || "",
    quantity: editItem?.quantity || 0,
    min_stock_level: editItem?.min_stock_level || 5,
    unit: editItem?.unit || "pcs",
    cost_price: editItem?.cost_price ?? ("" as number | ""),
    selling_price: editItem?.selling_price ?? ("" as number | ""),
    supplier: editItem?.supplier || "",
    brand: (editItem as any)?.brand || "",
    notes: editItem?.notes || "",
    category_id: editItem?.category_id || "",
    is_active: editItem?.is_active ?? true,
    batch_number: (editItem as any)?.batch_number || "",
    expiry_date: editItem?.expiry_date || "",
  });

  // Field-level validation errors (only set when user attempts Save with missing required fields).
  const [errors, setErrors] = useState<{ cost_price?: string; selling_price?: string; category_id?: string }>({});

  const saveCategoryMut = useMutation({
    mutationFn: async ({ mode, id, name }: { mode: "add" | "edit"; id?: string; name: string }) => {
      if (!name.trim()) throw new Error("Category name required");
      if (mode === "add") {
        const { data, error } = await supabase
          .from("inventory_categories")
          .insert({ name: name.trim() })
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { error } = await supabase
          .from("inventory_categories")
          .update({ name: name.trim() })
          .eq("id", id!);
        if (error) throw error;
        return { id };
      }
    },
    onSuccess: (data: any, vars) => {
      toast.success(vars.mode === "add" ? "Category added" : "Category updated");
      setCatDialog(null);
      onCategoriesChanged();
      queryClient.invalidateQueries({ queryKey: ["inventory_categories"] });
      if (vars.mode === "add" && data?.id) {
        setForm((p) => ({ ...p, category_id: data.id }));
      }
    },
    onError: (e: any) => toast.error(e.message || "Failed to save category"),
  });

  const deleteCategoryMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      toast.success("Category deleted");
      setDeleteCatId(null);
      onCategoriesChanged();
      queryClient.invalidateQueries({ queryKey: ["inventory_categories"] });
      if (form.category_id === id) setForm((p) => ({ ...p, category_id: "" }));
    },
    onError: (e: any) => toast.error(e.message || "Cannot delete (it may be in use)"),
  });

  // Derive a short prefix code from a category name
  // Examples: "Dental Materials" -> DM, "Disposables" -> DS, "Medications" -> MED, "Instruments" -> INS
  const getCategoryPrefix = (name?: string | null): string => {
    if (!name) return "INV";
    const clean = name.trim();
    if (!clean) return "INV";
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      // Multi-word: take first letter of first 2 words (e.g., Dental Materials -> DM)
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    // Single word: take first 3 letters (e.g., Medications -> MED, Instruments -> INS, Disposables -> DIS)
    return words[0].slice(0, 3).toUpperCase();
  };

  const categoryPrefix = getCategoryPrefix(
    categories.find((c) => c.id === form.category_id)?.name
  );

  // Auto-generate next SKU for the selected category prefix
  const { data: nextSku } = useQuery({
    queryKey: ["inventory_next_sku", categoryPrefix],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("sku")
        .like("sku", `${categoryPrefix}-%`);
      if (error) throw error;
      let max = 0;
      const re = new RegExp(`^${categoryPrefix}-(\\d+)$`);
      (data || []).forEach((r: any) => {
        const m = re.exec(r.sku || "");
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > max) max = n;
        }
      });
      return `${categoryPrefix}-${String(max + 1).padStart(4, "0")}`;
    },
    enabled: !editItem,
    staleTime: 0,
  });

  useEffect(() => {
    if (!editItem && nextSku) {
      setForm((prev) => ({ ...prev, sku: nextSku }));
    }
  }, [nextSku, editItem]);

  // Suppliers from Settings
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

  // Filter categories based on selected supplier's category
  const selectedSupplier = suppliers.find((s) => s.name === form.supplier);
  const filteredCategories = selectedSupplier?.category
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(selectedSupplier.category!.toLowerCase()) ||
        selectedSupplier.category!.toLowerCase().includes(c.name.toLowerCase()) ||
        true // Show all categories but supplier selection helps organize
      )
    : categories;

  // Title Case helper: trim, collapse whitespace, capitalize first letter of each word.
  // Applied only at save-time; existing records remain unchanged.
  const toTitleCase = (raw: string): string =>
    raw
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
      .join(" ");

  // Find an existing "Uncategorized" category (case-insensitive). Does NOT create one.
  const findUncategorized = () =>
    categories.find((c) => (c.name || "").trim().toLowerCase() === "uncategorized");

  const handleSave = () => {
    if (!form.name?.trim()) { toast.error("Item Name is required"); return; }
    const nextErrors: typeof errors = {};

    // Mandatory price validation
    const costNum = typeof form.cost_price === "number" ? form.cost_price : Number(form.cost_price);
    const sellNum = typeof form.selling_price === "number" ? form.selling_price : Number(form.selling_price);
    if (form.cost_price === "" || !Number.isFinite(costNum) || costNum <= 0) {
      nextErrors.cost_price = "Cost Price is required";
    }
    if (form.selling_price === "" || !Number.isFinite(sellNum) || sellNum <= 0) {
      nextErrors.selling_price = "Selling Price is required";
    }

    // Category: reuse existing "Uncategorized" if blank, else error
    let resolvedCategoryId = form.category_id;
    if (!resolvedCategoryId) {
      const uncat = findUncategorized();
      if (uncat) {
        resolvedCategoryId = uncat.id;
      } else {
        nextErrors.category_id = 'Please select a category (or create an "Uncategorized" category in Settings).';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Please fix the highlighted fields before saving.");
      return;
    }
    setErrors({});

    const payload: TablesInsert<"inventory_items"> = {
      name: toTitleCase(form.name),
      sku: form.sku || null,
      quantity: form.quantity,
      min_stock_level: form.min_stock_level,
      unit: form.unit,
      cost_price: costNum,
      selling_price: sellNum,
      supplier: form.supplier?.trim() || "General",
      notes: form.notes || null,
      category_id: resolvedCategoryId || null,
      is_active: form.is_active,
      expiry_date: form.expiry_date || null,
      ...({ brand: form.brand?.trim() || "General" } as any),
      ...({ batch_number: form.batch_number?.trim() || null } as any),
    };
    onSave(payload);
  };

  return (
    <div className="grid gap-4 py-4">
      {/* Supplier & Category at TOP - pulled from Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Supplier (from Settings)</Label>
          <Select
            value={form.supplier || "none"}
            onValueChange={(v) => setForm({ ...form, supplier: v === "none" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Supplier</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.name}>{s.name} {s.category ? `(${s.category})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Category (from Settings)</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setCatDialog({ mode: "add", name: "" })}
            >
              <Plus className="h-3 w-3 mr-1" /> New
            </Button>
          </div>
          <CategoryPicker
            value={form.category_id || ""}
            onChange={(v) => { setForm({ ...form, category_id: v }); if (errors.category_id) setErrors((e) => ({ ...e, category_id: undefined })); }}
            categories={filteredCategories}
            placeholder="Select category"
            onEdit={(c) => setCatDialog({ mode: "edit", id: c.id, name: c.name })}
            onDelete={(c) => setDeleteCatId(c.id)}
            onAdd={() => setCatDialog({ mode: "add", name: "" })}
            emptyHint="No categories yet. Click New above."
            className={errors.category_id ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.category_id && <p className="text-xs text-destructive">{errors.category_id}</p>}
        </div>
      </div>

      {/* Brand (from Settings Master Data) */}
      <div className="space-y-2">
        <Label>Brand (from Settings)</Label>
        <Select
          value={form.brand || "none"}
          onValueChange={(v) => setForm({ ...form, brand: v === "none" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Brand</SelectItem>
            {brandOptions.map((b) => (
              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
            ))}
            {brandOptions.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No brands yet. Add in Settings → Brands.
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Item Name & SKU */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Item Name *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Composite Resin" />
        </div>
        <div className="space-y-2">
          <Label>SKU (Auto)</Label>
          <Input value={form.sku} readOnly className="bg-muted cursor-not-allowed" placeholder="Auto-generated" />
        </div>
      </div>

      {/* Quantity, Min Stock, Unit */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Min Stock Level</Label>
          <Input type="number" value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: +e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pcs">Pieces</SelectItem>
              <SelectItem value="box">Box</SelectItem>
              <SelectItem value="pack">Pack</SelectItem>
              <SelectItem value="ml">ml</SelectItem>
              <SelectItem value="gm">gm</SelectItem>
              <SelectItem value="roll">Roll</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Prices — mandatory */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Cost Price (₹) *</Label>
          <Input
            type="number"
            min={0}
            value={form.cost_price}
            onChange={(e) => {
              const v = e.target.value;
              setForm({ ...form, cost_price: v === "" ? "" : Number(v) });
              if (errors.cost_price) setErrors((er) => ({ ...er, cost_price: undefined }));
            }}
            placeholder="Required"
            aria-invalid={!!errors.cost_price}
            className={errors.cost_price ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.cost_price && <p className="text-xs text-destructive">{errors.cost_price}</p>}
        </div>
        <div className="space-y-2">
          <Label>Selling Price (₹) *</Label>
          <Input
            type="number"
            min={0}
            value={form.selling_price}
            onChange={(e) => {
              const v = e.target.value;
              setForm({ ...form, selling_price: v === "" ? "" : Number(v) });
              if (errors.selling_price) setErrors((er) => ({ ...er, selling_price: undefined }));
            }}
            placeholder="Required"
            aria-invalid={!!errors.selling_price}
            className={errors.selling_price ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.selling_price && <p className="text-xs text-destructive">{errors.selling_price}</p>}
        </div>
      </div>

      {/* Batch & Expiry */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Batch Number</Label>
          <Input
            value={form.batch_number}
            onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
            placeholder="e.g., BN-2026-001"
          />
        </div>
        <div className="space-y-2">
          <Label>Expiry Date</Label>
          <Input
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            Items expiring within 90 days are flagged on the dashboard.
          </p>
        </div>
      </div>

      {/* Manual Stock In / Stock Out — only when editing */}
      {editItem && (
        <StockAdjuster
          itemId={editItem.id}
          currentQty={form.quantity}
          minLevel={form.min_stock_level}
          onAdjusted={(newQty) => setForm((p) => ({ ...p, quantity: newQty }))}
        />
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
      </div>

      {/* Active/Inactive toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label className="text-sm font-medium">Active Status</Label>
          <p className="text-xs text-muted-foreground">Inactive items won't appear in active lists</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${form.is_active ? 'text-success' : 'text-muted-foreground'}`}>
            {form.is_active ? "Active" : "Inactive"}
          </span>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary"
          />
        </div>
      </div>

      <Button className="gradient-primary border-0" onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving..." : editItem ? "Update Item" : "Save Item"}
      </Button>

      {/* Add/Edit Category Dialog */}
      <Dialog open={!!catDialog} onOpenChange={(o) => !o && setCatDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{catDialog?.mode === "add" ? "Add Category" : "Edit Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Category Name</Label>
            <Input
              autoFocus
              value={catDialog?.name || ""}
              onChange={(e) => setCatDialog((p) => p ? { ...p, name: e.target.value } : p)}
              placeholder="e.g., Restorative Materials"
              onKeyDown={(e) => {
                if (e.key === "Enter" && catDialog?.name.trim()) {
                  saveCategoryMut.mutate(catDialog);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>Cancel</Button>
            <Button
              onClick={() => catDialog && saveCategoryMut.mutate(catDialog)}
              disabled={!catDialog?.name.trim() || saveCategoryMut.isPending}
            >
              {saveCategoryMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirm */}
      <Dialog open={!!deleteCatId} onOpenChange={(o) => !o && setDeleteCatId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Category?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently remove the category. Cannot delete if items are still linked to it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCatId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteCatId && deleteCategoryMut.mutate(deleteCatId)}
              disabled={deleteCategoryMut.isPending}
            >
              {deleteCategoryMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface StockAdjusterProps {
  itemId: string;
  currentQty: number;
  minLevel: number;
  onAdjusted: (newQty: number) => void;
}

const StockAdjuster = ({ itemId, currentQty, minLevel, onAdjusted }: StockAdjusterProps) => {
  const [qty, setQty] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  const adjust = async (type: "stock_in" | "stock_out") => {
    const n = parseInt(qty, 10);
    if (!n || n <= 0) { toast.error("Enter a valid quantity"); return; }
    setBusy(type === "stock_in" ? "in" : "out");
    const delta = type === "stock_in" ? n : -n;
    const newQty = Math.max(0, currentQty + delta);
    const newStatus = newQty === 0 ? "out_of_stock" : (newQty <= (minLevel || 0) ? "low_stock" : "in_stock");
    const { error: e1 } = await supabase
      .from("inventory_items")
      .update({ quantity: newQty, status: newStatus })
      .eq("id", itemId);
    if (e1) { toast.error("Update failed"); setBusy(null); return; }
    await supabase.from("inventory_transactions").insert({
      item_id: itemId,
      type,
      quantity: n,
      notes: note || (type === "stock_in" ? "Manual stock in" : "Manual stock out"),
    });
    toast.success(type === "stock_in" ? `+${n} stock in` : `-${n} stock out`);
    onAdjusted(newQty);
    setQty("");
    setNote("");
    setBusy(null);
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Manual Stock Adjustment</Label>
        <span className="text-xs text-muted-foreground">Current: <b>{currentQty}</b></span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Quantity</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason..." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-success text-success hover:bg-success/10"
          onClick={() => adjust("stock_in")}
          disabled={busy !== null}
        >
          <ArrowDownToLine className="h-4 w-4 mr-1" />
          {busy === "in" ? "Adding..." : "Stock In"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive/10"
          onClick={() => adjust("stock_out")}
          disabled={busy !== null}
        >
          <ArrowUpFromLine className="h-4 w-4 mr-1" />
          {busy === "out" ? "Removing..." : "Stock Out"}
        </Button>
      </div>
    </div>
  );
};

export default InventoryItemForm;
