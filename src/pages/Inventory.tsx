import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Search, Package, AlertTriangle, TrendingDown, TrendingUp,
  MoreHorizontal, Edit, Trash2, X, ShoppingCart, Download, FileSpreadsheet, FileText, Star,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";
import { CategoryPicker } from "@/components/inventory/CategoryPicker";
import { Button } from "@/components/ui/button";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import InventoryStatsCards from "@/components/inventory/InventoryStatsCards";
import InventoryItemForm from "@/components/inventory/InventoryItemForm";
import { usePermissions } from "@/hooks/usePermissions";

type InventoryItem = Tables<"inventory_items"> & {
  inventory_categories: { name: string } | null;
};

const statusStyles: Record<string, string> = {
  in_stock: "bg-success/10 text-success border-success/20",
  low_stock: "bg-warning/10 text-warning border-warning/20",
  out_of_stock: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels: Record<string, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

const Inventory = () => {
  const perms = usePermissions("/inventory");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterActive, setFilterActive] = useState("active");
  const [filterCategory, setFilterCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useDateRangeFilter("all");
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [showTxPanel, setShowTxPanel] = useState(false);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Fetch items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*, inventory_categories(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  // Favorites are stored on the row itself (`is_favorite`) so every user
  // sees the same starred items — derived from the fetched list.
  const favorites = useMemo(
    () => new Set(items.filter((i: any) => i.is_favorite).map((i: any) => i.id)),
    [items],
  );
  const patchItemInCache = (id: string, is_favorite: boolean) => {
    queryClient.setQueryData(["inventory_items"], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((it: any) => (it.id === id ? { ...it, is_favorite } : it));
    });
  };
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from("inventory_items")
        .update({ is_favorite } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_favorite }) => {
      await queryClient.cancelQueries({ queryKey: ["inventory_items"] });
      const previous = queryClient.getQueryData(["inventory_items"]);
      patchItemInCache(id, is_favorite);
      return { previous };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["inventory_items"], ctx.previous);
      }
      toast.error(`Favorite not saved: ${err.message}`);
    },
  });
  const toggleFavorite = (id: string) => {
    toggleFavoriteMutation.mutate({ id, is_favorite: !favorites.has(id) });
  };

  // Keep the live stock snapshot (and therefore the Stock Value card) in sync
  // with the database: any quantity change from sales, purchases or manual
  // adjustments patches the cached row immediately.
  useEffect(() => {
    const channel = supabase
      .channel("inventory-items-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items" },
        (payload: any) => {
          queryClient.setQueryData(["inventory_items"], (old: any) => {
            if (!Array.isArray(old)) return old;
            if (payload.eventType === "DELETE") {
              return old.filter((it: any) => it.id !== payload.old?.id);
            }
            const row = payload.new;
            if (!row?.id) return old;
            const exists = old.some((it: any) => it.id === row.id);
            if (!exists) {
              // New item — refetch so joined category data is present.
              queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
              return old;
            }
            return old.map((it: any) => (it.id === row.id ? { ...it, ...row } : it));
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_transactions" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
          queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);


  // Fetch transactions (for Stock In / Stock Out cards & details)
  const { data: transactions = [] } = useQuery({
    queryKey: ["inventory_transactions"],
    queryFn: async () => {
      // Fetch in pages — PostgREST caps a single request at 1000 rows, which
      // would silently truncate the movement history used to rewind quantities.
      const pageSize = 1000;
      const all: any[] = [];
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase
          .from("inventory_transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },

  });

  // Latest purchase unit cost per inventory item — used as a fallback when an
  // item has no stored cost_price, so no item is excluded from stock value.
  const { data: latestPurchaseCost = {} } = useQuery({
    queryKey: ["inventory_latest_purchase_cost"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("inventory_item_id, unit_price, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        if (!r.inventory_item_id) return;
        if (map[r.inventory_item_id] !== undefined) return; // first = latest
        const p = Number(r.unit_price);
        if (Number.isFinite(p) && p > 0) map[r.inventory_item_id] = p;
      });
      return map;
    },
  });

  // Single source of truth for inventory valuation cost basis:
  // stored cost_price → latest purchase cost → 0.
  const unitCost = (item: any) => {
    const stored = Number(item?.cost_price);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const fromPurchase = (latestPurchaseCost as Record<string, number>)[item?.id];
    if (Number.isFinite(fromPurchase) && fromPurchase > 0) return fromPurchase;
    return 0;
  };
  // Inventory Value = Current Quantity × Cost Price
  const stockValueOf = (item: any) => unitCost(item) * Number(item?.quantity || 0);


  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["inventory_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Sync dashboard expiry notification for an inventory item.
  // - Upsert (type, entity_id) when expiry_date is set and within 90 days.
  // - Mark existing one as read when expiry is cleared or pushed beyond 90 days.
  const syncInventoryExpiryNotification = async (saved: any) => {
    if (!saved?.id) return;
    const expiry = saved.expiry_date ? new Date(saved.expiry_date) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ninetyDays = new Date(today); ninetyDays.setDate(ninetyDays.getDate() + 90);
    const thirtyDays = new Date(today); thirtyDays.setDate(thirtyDays.getDate() + 30);

    if (expiry && expiry <= ninetyDays) {
      const severity = expiry <= thirtyDays ? "critical" : "warning";
      const batch = saved.batch_number ? ` (Batch ${saved.batch_number})` : "";
      const dateStr = expiry.toLocaleDateString("en-IN");
      await (supabase.from("notifications") as any).upsert(
        {
          type: "inventory_expiry_due",
          entity_type: "inventory_item",
          entity_id: saved.id,
          severity,
          title: "Inventory expiring soon",
          message: `${saved.name}${batch} expires on ${dateStr}.`,
          is_read: false,
          read_at: null,
        },
        { onConflict: "type,entity_id" }
      );
    } else {
      // Clear any prior alert for this item.
      await (supabase.from("notifications") as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("type", "inventory_expiry_due")
        .eq("entity_id", saved.id);
    }
  };

  // Save item
  const saveMutation = useMutation({
    mutationFn: async (item: TablesInsert<"inventory_items">) => {
      if (editItem) {
        const { data, error } = await supabase
          .from("inventory_items")
          .update(item)
          .eq("id", editItem.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("inventory_items")
          .insert(item)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: async (saved) => {
      await syncInventoryExpiryNotification(saved);
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(editItem ? "Item updated!" : "Item added!");
      setDialogOpen(false);
      setEditItem(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete item
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success("Item deleted!");
    },
    onError: (err) => toast.error(err.message),
  });

  // Toggle active/inactive
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("inventory_items")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success("Status updated!");
    },
    onError: (err) => toast.error(err.message),
  });

  // Stock adjustment
  const adjustStockMutation = useMutation({
    mutationFn: async ({ id, delta, type }: { id: string; delta: number; type: string }) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      const newQty = item.quantity + delta;
      const { error: txError } = await supabase.from("inventory_transactions").insert({
        item_id: id, type, quantity: delta, notes: `Stock ${type.replace("_", " ")}`,
      });
      if (txError) throw txError;
      const { error } = await supabase
        .from("inventory_items")
        .update({ quantity: Math.max(0, newQty) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success("Stock updated!");
    },
    onError: (err) => toast.error(err.message),
  });

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const matchesNonDateFilters = (item: any) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchStatus = filterStatus === "all" || filterStatus === "stock_in" || filterStatus === "stock_out" || item.status === filterStatus;
    const matchActive = filterActive === "all" ||
      (filterActive === "active" ? item.is_active : !item.is_active);
    const matchCategory = filterCategory === "all" ||
      (filterCategory === "uncategorized" ? !item.category_id : item.category_id === filterCategory);
    const matchFavorite = !showFavoritesOnly || favorites.has(item.id);
    return matchSearch && matchStatus && matchActive && matchCategory && matchFavorite;
  };

  // Item list represents inventory master/current items — the date filter only
  // drives period-based metrics, never which items appear in the table.
  const filtered = items.filter(matchesNonDateFilters);


  // KPI summary cards are derived from the filtered item list.
  // Stock Value = SUM(TOTAL PRICE) for items visible after applying category,
  // status, search, and active filters (date filter is intentionally ignored).
  const filteredInventory = useMemo(
    () =>
      filtered.map((item: any) => ({
        ...item,
        totalPrice:
          item.selling_price !== null &&
          item.selling_price !== undefined &&
          Number(item.selling_price) > 0
            ? `₹${(Number(item.quantity || 0) * Number(item.selling_price)).toLocaleString("en-IN")}`
            : "—",
      })),
    [filtered]
  );

  const totalItems = filteredInventory.length;
  const lowStockCount = filteredInventory.filter((i) => i.status === "low_stock").length;
  const outOfStockCount = filteredInventory.filter((i) => i.status === "out_of_stock").length;
  const totalValue = filteredInventory.reduce(
    (acc, item) => acc + (Number(String(item.totalPrice).replace(/[^0-9.-]+/g, "")) || 0),
    0
  );




  // Stock In / Out within selected date range
  const txInRange = transactions.filter((t: any) => {
    const d = new Date(t.created_at);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
  const isStockIn = (t: any) => t.type ? t.type === "stock_in" : (t.quantity ?? 0) >= 0;
  const stockInTx = txInRange.filter((t: any) => isStockIn(t));
  const stockOutTx = txInRange.filter((t: any) => !isStockIn(t));
  const stockInQty = stockInTx.reduce((s: number, t: any) => s + Math.abs(t.quantity || 0), 0);
  const stockOutQty = stockOutTx.reduce((s: number, t: any) => s + Math.abs(t.quantity || 0), 0);

  // Today-only Stock In / Out (always visible regardless of date filter)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const todayTx = transactions.filter((t: any) => {
    const d = new Date(t.created_at);
    return d >= todayStart && d <= todayEnd;
  });
  const todayInQty = todayTx
    .filter((t: any) => isStockIn(t))
    .reduce((s: number, t: any) => s + Math.abs(t.quantity || 0), 0);
  const todayOutQty = todayTx
    .filter((t: any) => !isStockIn(t))
    .reduce((s: number, t: any) => s + Math.abs(t.quantity || 0), 0);

  const itemNameById: Record<string, string> = items.reduce((acc: any, i) => { acc[i.id] = i.name; return acc; }, {});

  // Pagination
  const isTxView = filterStatus === "stock_in" || filterStatus === "stock_out";
  const fullList: any[] = isTxView
    ? (filterStatus === "stock_in" ? stockInTx : stockOutTx)
    : filtered;
  const totalRows = fullList.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pagedFiltered = !isTxView ? filtered.slice(pageStart, pageEnd) : [];
  const pagedTx = isTxView ? fullList.slice(pageStart, pageEnd) : [];

  // Reset page on filter change
  if (currentPage > totalPages) {
    setTimeout(() => setCurrentPage(1), 0);
  }

  const PaginationBar = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t bg-secondary/20">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
          <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[5, 10, 15, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          {totalRows === 0 ? "0" : `${pageStart + 1}-${Math.min(pageEnd, totalRows)}`} of {totalRows}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>« First</Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPage(safePage - 1)} disabled={safePage === 1}>‹ Prev</Button>
        <span className="text-xs px-2">Page {safePage} / {totalPages}</span>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPage(safePage + 1)} disabled={safePage === totalPages}>Next ›</Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>Last »</Button>
      </div>
    </div>
  );

  // ============ Export helpers ============
  const fmtDate = (d: any) => d ? new Date(d).toLocaleString() : "";
  const today = new Date().toISOString().slice(0, 10);

  const buildExportData = () => {
    const summary = [
      ["Metric", "Value"],
      ["Total Items (filtered)", totalItems],
      ["Low Stock", lowStockCount],
      ["Out of Stock", outOfStockCount],
      ["Stock Value", totalValue],
      ["Stock In Qty (range)", stockInQty],
      ["Stock Out Qty (range)", stockOutQty],
      ["Date Range", `${range.from ? range.from.toLocaleDateString() : "All"} - ${range.to ? range.to.toLocaleDateString() : "All"}`],
    ];
    const itemRows = filtered.map((i: any) => ({
      Name: i.name,
      Category: i.inventory_categories?.name || "",
      SKU: i.sku || "",
      Quantity: i.quantity,
      Unit: i.unit || "",
      "Min Stock": i.min_stock_level ?? "",
      "Selling Price": i.selling_price ?? 0,
      "Cost Price": unitCost(i),
      "Stock Value": stockValueOf(i),

      Status: statusLabels[i.status] || i.status,
      Active: i.is_active ? "Yes" : "No",
    }));
    const lowStockRows = filtered.filter((i) => i.status === "low_stock").map((i: any) => ({
      Name: i.name, Category: i.inventory_categories?.name || "", Quantity: i.quantity, "Min Stock": i.min_stock_level ?? "", Unit: i.unit || "",
    }));
    const outOfStockRows = filtered.filter((i) => i.status === "out_of_stock").map((i: any) => ({
      Name: i.name, Category: i.inventory_categories?.name || "", Quantity: i.quantity, Unit: i.unit || "",
    }));
    const txRow = (t: any) => {
      const it = items.find((x) => x.id === t.item_id);
      const qty = Math.abs(t.quantity || 0);
      const price = unitCost(it) * qty;
      return {
        Date: fmtDate(t.created_at),
        Item: itemNameById[t.item_id] || t.item_id,
        Category: it?.inventory_categories?.name || "",
        Quantity: qty,
        Unit: it?.unit || "",
        "Est. Price": price,
        Type: t.type || "",
        Notes: t.notes || "",
      };
    };
    const stockInRows = stockInTx.map(txRow);
    const stockOutRows = stockOutTx.map(txRow);
    return { summary, itemRows, lowStockRows, outOfStockRows, stockInRows, stockOutRows };
  };

  const handleExportExcel = () => {
    try {
      const { summary, itemRows, lowStockRows, outOfStockRows, stockInRows, stockOutRows } = buildExportData();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), "Inventory");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lowStockRows), "Low Stock");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outOfStockRows), "Out of Stock");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockInRows), "Stock In");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockOutRows), "Stock Out");
      XLSX.writeFile(wb, `inventory-${today}.xlsx`);
      toast.success("Excel downloaded");
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    }
  };

  const handleExportPDF = async () => {
    try {
      const { summary, itemRows, lowStockRows, outOfStockRows, stockInRows, stockOutRows } = buildExportData();
      const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
      const branding = await fetchClinicBranding();
      const doc = new jsPDF({ orientation: "landscape" });
      const startY = await addClinicPdfHeader(doc, branding);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Inventory Report", 14, startY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, startY + 6);

      autoTable(doc, {
        startY: startY + 10,
        head: [summary[0] as string[]],
        body: summary.slice(1) as any[],
        theme: "grid",
        headStyles: { fillColor: [30, 58, 95] },
        margin: { bottom: 30 },
        didDrawPage: () => addClinicPdfFooter(doc),
      });

      const sectionTable = (title: string, rows: any[]) => {
        if (!rows.length) return;
        const lastY = (doc as any).lastAutoTable?.finalY || 30;
        if (lastY > 170) doc.addPage();
        doc.setFontSize(12);
        doc.text(title, 14, ((doc as any).lastAutoTable?.finalY || 30) + 10);
        const headers = Object.keys(rows[0]);
        autoTable(doc, {
          startY: ((doc as any).lastAutoTable?.finalY || 30) + 14,
          head: [headers],
          body: rows.map((r) => headers.map((h) => r[h])),
          theme: "striped",
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 58, 95] },
          margin: { bottom: 30 },
          didDrawPage: () => addClinicPdfFooter(doc),
        });
      };
      sectionTable("Inventory Items", itemRows);
      sectionTable("Low Stock", lowStockRows);
      sectionTable("Out of Stock", outOfStockRows);
      sectionTable("Stock In Movements", stockInRows);
      sectionTable("Stock Out Movements", stockOutRows);

      doc.save(`inventory-${today}.pdf`);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage clinic supplies & dental materials
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            preset={preset} onPresetChange={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
            hideAll={false}
            showYear={true}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download size={16} className="mr-2" /> Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet size={14} className="mr-2" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText size={14} className="mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}>
            {perms.canCreate && (
              <DialogTrigger asChild>
                <Button className="gradient-primary border-0" size="sm">
                  <Plus size={16} className="mr-2" /> Add Item
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">
                  {editItem ? "Edit Item" : "Add New Item"}
                </DialogTitle>
              </DialogHeader>
              <InventoryItemForm
                editItem={editItem}
                categories={categories}
                onSave={(payload) => saveMutation.mutate(payload)}
                isSaving={saveMutation.isPending}
                onCategoriesChanged={() => queryClient.invalidateQueries({ queryKey: ["inventory_categories"] })}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <InventoryStatsCards
        totalItems={totalItems}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        totalValue={totalValue}
        stockInQty={stockInQty}
        stockOutQty={stockOutQty}
        todayInQty={todayInQty}
        todayOutQty={todayOutQty}
        onStockInClick={() => { setTxFilter("in"); setShowTxPanel(true); }}
        onStockOutClick={() => { setTxFilter("out"); setShowTxPanel(true); }}
      />

      {/* Stock Movement Details (top panel - only when triggered from card click, not status filter) */}
      {showTxPanel && filterStatus !== "stock_in" && filterStatus !== "stock_out" && (
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-display font-semibold">Stock Movement Details</h3>
                <Badge variant="secondary" className="text-[10px]">
                  In: {stockInQty} · Out: {stockOutQty}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Select value={txFilter} onValueChange={(v: any) => setTxFilter(v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Movements</SelectItem>
                    <SelectItem value="in">Stock In Only</SelectItem>
                    <SelectItem value="out">Stock Out Only</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setShowTxPanel(false)}>
                  <X size={14} />
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50 text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(txFilter === "in" ? stockInTx : txFilter === "out" ? stockOutTx : txInRange).map((t: any) => {
                    const isIn = isStockIn(t);
                    return (
                      <tr key={t.id} className="hover:bg-secondary/30">
                        <td className="px-3 py-2 text-xs">{new Date(t.created_at).toLocaleDateString("en-IN")} {new Date(t.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-3 py-2 font-medium">{itemNameById[t.item_id] || "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={isIn ? "bg-info/10 text-info border-info/20" : "bg-accent/10 text-accent border-accent/20"}>
                            {isIn ? "Stock In" : "Stock Out"}
                          </Badge>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${isIn ? "text-info" : "text-accent"}`}>
                          {isIn ? "+" : "-"}{Math.abs(t.quantity || 0)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.notes || "—"}</td>
                      </tr>
                    );
                  })}
                  {(txFilter === "in" ? stockInTx : txFilter === "out" ? stockOutTx : txInRange).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">No stock movements in selected date range</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search items or SKU..." className="pl-9 bg-card border-border" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            if (v === "stock_in") { setTxFilter("in"); setShowTxPanel(true); }
            else if (v === "stock_out") { setTxFilter("out"); setShowTxPanel(true); }
            else { setShowTxPanel(false); }
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status ({items.length})</SelectItem>
            <SelectItem value="in_stock">In Stock ({items.filter(i => i.status === "in_stock").length})</SelectItem>
            <SelectItem value="low_stock">Low Stock ({items.filter(i => i.status === "low_stock").length})</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock ({items.filter(i => i.status === "out_of_stock").length})</SelectItem>
            <SelectItem value="stock_in">Stock In ({stockInQty})</SelectItem>
            <SelectItem value="stock_out">Stock Out ({stockOutQty})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Active" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <CategoryPicker
          value={filterCategory}
          onChange={setFilterCategory}
          categories={categories}
          items={items}
          placeholder="All Categories"
          allowAll
          allLabel="All Categories"
          allowUncategorized
          className="w-[180px]"
        />
        <Button
          variant={showFavoritesOnly ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => setShowFavoritesOnly((v) => !v)}
          title="Show favorites only"
        >
          <Star size={16} className={showFavoritesOnly ? "fill-current" : ""} />
          Favorites {favorites.size > 0 && `(${favorites.size})`}
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={selectedIds.size === 0}
          onClick={() => {
            const selectedItems = items.filter(i => selectedIds.has(i.id));
            navigate("/purchases", {
              state: {
                prefillItems: selectedItems.map(i => ({
                  item_name: i.name,
                  category: i.inventory_categories?.name || "Dental Material",
                  quantity: 1,
                  unit: i.unit,
                  unit_price: i.cost_price || 0,
                  total_price: i.cost_price || 0,
                  expiry_date: "",
                  batch_number: "",
                  supplier: i.supplier || "",
                })),
              },
            });
          }}
        >
          <ShoppingCart size={16} /> Proceed to Purchase {selectedIds.size > 0 && `(${selectedIds.size})`}
        </Button>
      </div>

      {/* Table - shows Stock Movements when stock_in/stock_out filter is active, otherwise inventory items */}
      {(filterStatus === "stock_in" || filterStatus === "stock_out") ? (
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b bg-secondary/30 flex items-center justify-between">
              <h3 className="text-sm font-display font-semibold">
                {filterStatus === "stock_in" ? "Stock In Movements" : "Stock Out Movements"}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                {filterStatus === "stock_in" ? `Total In: ${stockInQty}` : `Total Out: ${stockOutQty}`}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quantity</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(() => {
                    const list = pagedTx;
                    if (fullList.length === 0) {
                      return <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No stock movements in selected date range</td></tr>;
                    }
                    return list.map((t: any) => {
                      const item = items.find((i) => i.id === t.item_id);
                      const isIn = filterStatus === "stock_in";
                      return (
                        <tr key={t.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-5 py-3.5 text-xs">
                            {new Date(t.created_at).toLocaleDateString("en-IN")}
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(t.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm font-medium">{item?.name || itemNameById[t.item_id] || "—"}</td>
                          <td className="px-5 py-3.5 text-sm">{item?.inventory_categories?.name || "—"}</td>
                          <td className={`px-5 py-3.5 text-sm text-right font-semibold ${isIn ? "text-info" : "text-accent"}`}>
                            {isIn ? "+" : "-"}{Math.abs(t.quantity || 0)} {item?.unit || ""}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-right">₹{(unitCost(item) * Math.abs(t.quantity || 0)).toLocaleString("en-IN")}</td>
                          <td className="px-5 py-3.5">
                            <Badge variant="outline" className={isIn ? "bg-info/10 text-info border-info/20" : "bg-accent/10 text-accent border-accent/20"}>
                              {isIn ? "Stock In" : "Stock Out"}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-muted-foreground">{t.notes || "—"}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
            <PaginationBar />
          </CardContent>
        </Card>
      ) : (
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-2 py-2 text-center">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedIds);
                        filtered.forEach(i => checked ? next.add(i.id) : next.delete(i.id));
                        setSelectedIds(next);
                      }}
                    />
                  </th>
                  <th className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10">★</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Price</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Price</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expiry</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                <tr><td colSpan={15} className="px-5 py-10 text-center text-muted-foreground">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={15} className="px-5 py-10 text-center text-muted-foreground">No items found. Add your first inventory item!</td></tr>
                ) : (
                  pagedFiltered.map((item) => (
                    <tr key={item.id} className={`hover:bg-secondary/30 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-2.5 text-center">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds);
                            checked ? next.add(item.id) : next.delete(item.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="px-1 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleFavorite(item.id)}
                          className="inline-flex items-center justify-center rounded hover:bg-secondary p-1 transition-colors"
                          title={favorites.has(item.id) ? "Remove from favorites" : "Mark as favorite"}
                        >
                          <Star
                            size={16}
                            className={favorites.has(item.id) ? "fill-warning text-warning" : "text-muted-foreground"}
                          />
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        {item.sku ? (
                          <button
                            onClick={() => openEdit(item)}
                            className="text-sm font-mono font-semibold text-primary hover:underline"
                            title="Click to edit stock"
                          >
                            {item.sku}
                          </button>
                        ) : (
                          <button
                            onClick={() => openEdit(item)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            —
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-sm text-muted-foreground">{(item as any).brand || "—"}</td>
                      <td className="px-2 py-2.5 text-sm text-muted-foreground">{item.supplier || "—"}</td>
                      <td className="px-2 py-2.5">
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-sm">{item.inventory_categories?.name || "—"}</td>
                      <td className="px-2 py-2.5">
                        <span className="text-sm font-medium">{item.quantity} {item.unit}</span>
                      </td>
                      <td className="px-2 py-2.5 text-sm">{(item.selling_price !== null && item.selling_price !== undefined && Number(item.selling_price) > 0) ? `₹${Number(item.selling_price).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-2 py-2.5 text-sm font-medium">{(item.selling_price !== null && item.selling_price !== undefined && Number(item.selling_price) > 0) ? `₹${(Number(item.quantity || 0) * Number(item.selling_price)).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-2 py-2.5 text-sm text-muted-foreground">{(item as any).batch_number || "—"}</td>
                      <td className="px-2 py-2.5">
                        {(item as any).expiry_date ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{new Date((item as any).expiry_date).toLocaleDateString("en-IN")}</span>
                            {(() => {
                              const expiry = new Date((item as any).expiry_date);
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const diffTime = expiry.getTime() - today.getTime();
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              if (diffDays < 0) {
                                return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] w-fit">Expired</Badge>;
                              } else if (diffDays <= 90) {
                                return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px] w-fit">Expiring Soon</Badge>;
                              }
                              return null;
                            })()}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge variant="outline" className={`text-xs ${statusStyles[item.status]}`}>
                          {statusLabels[item.status] || item.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5">
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: item.id, is_active: checked })}
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                <MoreHorizontal size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {perms.canEdit && (
                                <DropdownMenuItem onClick={() => openEdit(item)}>
                                  <Edit size={14} className="mr-2" /> Edit
                                </DropdownMenuItem>
                              )}
                              {perms.canDelete && (
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                                  <Trash2 size={14} className="mr-2" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar />
        </CardContent>
      </Card>
      )}
    </div>
  );
};

export default Inventory;
