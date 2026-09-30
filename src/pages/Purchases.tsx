import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ShoppingCart,
  Plus,
  Search,
  Package,
  IndianRupee,
  FileText,
  Trash2,
  Eye,
  Calendar as CalendarLucide,
  Building2,
  Filter,
  Upload,
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";

import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { generatePurchaseInvoicePDF } from "@/lib/pdfGenerators";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { PurchaseItemPicker, type PickableItem } from "@/components/purchases/PurchaseItemPicker";
import { usePermissions } from "@/hooks/usePermissions";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useNavigate } from "react-router-dom";

// Expense category suggested for a purchase's supplier type
const EXPENSE_CATEGORY_BY_TYPE: Record<string, string> = {
  pharmacy: "Pharma Charges",
  consumables: "Clinic consumables",
  dental_material: "Clinical Matierials",
};
const DEFAULT_EXPENSE_CATEGORY = "Inventory Purchase";
const EXPENSE_PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "cheque", "other"];


const supplierTypes = [
  { value: "dental_material", label: "Dental Material Company" },
  { value: "pharmacy", label: "Pharmacy / Drug Company" },
  { value: "equipment", label: "Equipment Supplier" },
  { value: "consumables", label: "Consumables" },
  { value: "other", label: "Other" },
];

// Country dial codes for supplier phone. Indian numbers must be exactly 10 digits.
const SUPPLIER_COUNTRY_CODES: { code: string; dial: string; flag: string; label: string; maxLen: number }[] = [
  { code: "IN", dial: "+91", flag: "🇮🇳", label: "India", maxLen: 10 },
  { code: "US", dial: "+1", flag: "🇺🇸", label: "United States", maxLen: 10 },
  { code: "GB", dial: "+44", flag: "🇬🇧", label: "United Kingdom", maxLen: 10 },
  { code: "AE", dial: "+971", flag: "🇦🇪", label: "UAE", maxLen: 9 },
  { code: "SG", dial: "+65", flag: "🇸🇬", label: "Singapore", maxLen: 8 },
  { code: "AU", dial: "+61", flag: "🇦🇺", label: "Australia", maxLen: 9 },
  { code: "CA", dial: "+1", flag: "🇨🇦", label: "Canada", maxLen: 10 },
  { code: "MY", dial: "+60", flag: "🇲🇾", label: "Malaysia", maxLen: 10 },
  { code: "LK", dial: "+94", flag: "🇱🇰", label: "Sri Lanka", maxLen: 9 },
  { code: "NP", dial: "+977", flag: "🇳🇵", label: "Nepal", maxLen: 10 },
  { code: "BD", dial: "+880", flag: "🇧🇩", label: "Bangladesh", maxLen: 10 },
  { code: "PK", dial: "+92", flag: "🇵🇰", label: "Pakistan", maxLen: 10 },
];

// Parse a stored supplier phone "+91 9876543210" into separate dial + digits.
const parseSupplierPhone = (raw: string | null | undefined): { dial: string; digits: string } => {
  const v = (raw || "").trim();
  if (!v) return { dial: "+91", digits: "" };
  const m = v.match(/^(\+\d{1,4})[\s-]*(.*)$/);
  if (m) {
    const dial = m[1];
    const known = SUPPLIER_COUNTRY_CODES.find((c) => c.dial === dial);
    return { dial: known ? dial : "+91", digits: m[2].replace(/\D/g, "") };
  }
  return { dial: "+91", digits: v.replace(/\D/g, "") };
};

// Fallback if no categories configured in Settings yet
const FALLBACK_CATEGORIES = ["Dental Materials", "Medications", "Consumables", "Instruments", "Other"];

const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Format money to always show 2 decimal places (e.g. 125 → "125.00", 125.567 → "125.57")
const formatMoney = (n: number | string | null | undefined): string => {
  const num = Number(n || 0);
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface PurchaseItem {
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  expiry_date: string;
  batch_number: string;
}

const Purchases = () => {
  const perms = usePermissions("/purchases");
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  // Forward-to-Expense selection state
  const [selectedForForward, setSelectedForForward] = useState<string[]>([]);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [forwardRows, setForwardRows] = useState<
    { id: string; title: string; amount: number; date: string; payee: string; category: string; payment_method: string; supplier_type: string; invoice_number: string | null; payment_proof_url: string | null }[]
  >([]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useDateRangeFilter("today");

  // Form state
  const [form, setForm] = useState({
    supplier_name: "",
    supplier_phone: "",
    supplier_type: "dental_material",
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    invoice_number: "",
    payment_method: "cash",
    payment_status: "paid",
    payment_due_date: "",
    delivery_status: "pending",
    cgst_rate: 0,
    sgst_rate: 0,
    discount_amount: 0,
    notes: "",
    invoice_file_url: "" as string,
  });

  // Invoice attachment(s). Kept as array so multi-file can be enabled later
  // without changing the storage / state shape — UI currently exposes single file.
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);

  const [items, setItems] = useState<PurchaseItem[]>([
    { item_name: "", category: "", quantity: 1, unit: "pcs", unit_price: 0, total_price: 0, expiry_date: "", batch_number: "" },
  ]);

  // Auto-open dialog with prefilled items from Inventory
  useEffect(() => {
    const state = location.state as { prefillItems?: (PurchaseItem & { supplier?: string })[] } | null;
    if (state?.prefillItems && state.prefillItems.length > 0) {
      const cleanItems: PurchaseItem[] = state.prefillItems.map(({ supplier, ...rest }) => rest);
      setItems(cleanItems);
      const firstSupplier = state.prefillItems.find((i) => i.supplier)?.supplier;
      if (firstSupplier) {
        setForm((f) => ({ ...f, supplier_name: firstSupplier }));
      }
      setShowAddDialog(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch purchases
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Which purchases already have a linked expense (forwarded to the ledger)
  const { data: forwardedExpenses = [] } = useQuery({
    queryKey: ["purchases_forwarded_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, expense_number, purchase_id")
        .not("purchase_id", "is", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const forwardedMap = useMemo(() => {
    const map: Record<string, { expenseId: string; expenseNumber: string | null }> = {};
    (forwardedExpenses as any[]).forEach((e) => {
      if (e.purchase_id) map[e.purchase_id] = { expenseId: e.id, expenseNumber: e.expense_number };
    });
    return map;
  }, [forwardedExpenses]);

  // Expense categories master list for the confirmation modal
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense_categories_for_forward"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("name").order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => c.name as string).filter(Boolean);
    },
  });



  // Fetch unread overdue notifications for purchases (read-only display)
  const { data: overdueNotifications = [] } = useQuery({
    queryKey: ["purchase_overdue_notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("id, entity_id, severity, is_read")
        .eq("type", "purchase_payment_due");
      if (error) {
        console.error("notifications fetch", error);
        return [];
      }
      return (data ?? []) as any[];
    },
  });
  const overdueByPurchaseId = useMemo(() => {
    const map = new Map<string, any>();
    (overdueNotifications as any[]).forEach((n) => { if (n.entity_id) map.set(n.entity_id, n); });
    return map;
  }, [overdueNotifications]);

  // Fetch purchase items for detail view
  const { data: purchaseItems = [] } = useQuery({
    queryKey: ["purchase_items", selectedPurchaseId],
    queryFn: async () => {
      if (!selectedPurchaseId) return [];
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("purchase_id", selectedPurchaseId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPurchaseId,
  });

  // Fetch inventory categories from Settings (master list)
  const { data: categoriesList = [] } = useQuery({
    queryKey: ["inventory_categories_for_purchase"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const itemCategories = useMemo(() => {
    const names = categoriesList.map((c) => c.name).filter(Boolean);
    return names.length > 0 ? names : FALLBACK_CATEGORIES;
  }, [categoriesList]);
  const { data: suppliersList = [] } = useQuery({
    queryKey: ["suppliers_for_purchase"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, phone, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!form.supplier_name || form.supplier_phone || suppliersList.length === 0) return;
    const target = form.supplier_name.trim().toLowerCase();
    const sup = (suppliersList as any[]).find(
      (s) => (s.name || "").trim().toLowerCase() === target
    );
    const phone = sup?.phone ? String(sup.phone).split(",")[0].trim() : "";
    if (phone) {
      setForm((f) => ({ ...f, supplier_phone: phone }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.supplier_name, suppliersList]);

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["inventory_items_for_purchase"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("name, unit, cost_price, supplier, category_id, inventory_categories(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: historyItems = [] } = useQuery({
    queryKey: ["purchase_items_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("item_name, category, unit, unit_price, purchases(supplier_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pickerOptions: PickableItem[] = useMemo(() => {
    const inv: PickableItem[] = (inventoryItems as any[]).map((i) => ({
      name: i.name,
      category: i.inventory_categories?.name ?? null,
      unit: i.unit,
      unit_price: i.cost_price ? Number(i.cost_price) : null,
      supplier: i.supplier,
      source: "inventory",
    }));
    const hist: PickableItem[] = (historyItems as any[]).map((h) => ({
      name: h.item_name,
      category: h.category,
      unit: h.unit,
      unit_price: h.unit_price ? Number(h.unit_price) : null,
      supplier: h.purchases?.supplier_name ?? null,
      source: "history",
    }));
    return [...inv, ...hist];
  }, [inventoryItems, historyItems]);

  // Generate next PO number (PO-YYYYMMDD-NNN)
  const generatePONumber = (existingPurchases: any[]) => {
    const today = format(new Date(), "yyyyMMdd");
    const prefix = `PO-${today}-`;
    const todays = existingPurchases.filter((p) => p.invoice_number?.startsWith(prefix));
    const nextNum = todays.length + 1;
    return `${prefix}${String(nextNum).padStart(3, "0")}`;
  };

  useEffect(() => {
    if (showAddDialog && !editingPurchaseId && !form.invoice_number) {
      setForm((f) => ({ ...f, invoice_number: generatePONumber(purchases) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddDialog, editingPurchaseId]);

  // Upload invoice files (kept as array for future multi-file support, returns first URL today)
  const uploadInvoiceFiles = async (files: File[]): Promise<string | null> => {
    if (!files.length) return null;
    const file = files[0];
    const year = format(new Date(), "yyyy");
    const ext = file.name.split(".").pop() || "bin";
    const path = `${year}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`.slice(0, 240);
    const { error } = await supabase.storage.from("purchase-invoices").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Invoice upload failed: ${error.message}`);
    return path;
  };

  // Upsert/clear due-date notification for a purchase
  const syncPurchaseNotification = async (purchase: {
    id: string;
    payment_status: string;
    payment_due_date: string | null;
    invoice_number: string | null;
    supplier_name: string;
    total_amount: number;
  }) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const shouldNotify =
      purchase.payment_status === "pending" &&
      purchase.payment_due_date &&
      purchase.payment_due_date <= today;

    if (!shouldNotify) {
      // Clear any existing notification when status flips to paid or due date moves forward
      await supabase
        .from("notifications" as any)
        .delete()
        .eq("type", "purchase_payment_due")
        .eq("entity_id", purchase.id);
      return;
    }

    const overdue = purchase.payment_due_date! < today;
    const payload = {
      type: "purchase_payment_due",
      entity_type: "purchase",
      entity_id: purchase.id,
      severity: overdue ? "warning" : "info",
      title: overdue ? "Purchase payment overdue" : "Purchase payment due today",
      message: `PO ${purchase.invoice_number || "—"} • ${purchase.supplier_name} • ₹${formatMoney(purchase.total_amount)} due ${format(new Date(purchase.payment_due_date!), "dd MMM yyyy")}`,
      is_read: false,
      read_at: null,
    };

    // Upsert by (type, entity_id) unique index — dedupes per purchase
    await supabase
      .from("notifications" as any)
      .upsert(payload, { onConflict: "type,entity_id" });
  };

  // Create or update purchase mutation
  const createPurchase = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.item_name.trim());
      if (!form.supplier_name || validItems.length === 0) throw new Error("Fill required fields");

      // Validate supplier phone (if provided) against country code length.
      if (form.supplier_phone) {
        const parsed = parseSupplierPhone(form.supplier_phone);
        const active = SUPPLIER_COUNTRY_CODES.find((c) => c.dial === parsed.dial) ?? SUPPLIER_COUNTRY_CODES[0];
        if (parsed.digits.length !== active.maxLen) {
          throw new Error(`Supplier phone must be exactly ${active.maxLen} digits for ${active.label} (${active.dial}).`);
        }
      }

      // Mandatory invoice upload (new purchases only)
      if (!editingPurchaseId && invoiceFiles.length === 0 && !form.invoice_file_url) {
        throw new Error("Please upload the supplier invoice before saving the Purchase Order.");
      }

      // Validate file
      if (invoiceFiles.length > 0) {
        const f = invoiceFiles[0];
        if (!ALLOWED_FILE_TYPES.includes(f.type)) {
          throw new Error("Unsupported file type. Use PDF, JPG, PNG, or WEBP.");
        }
        if (f.size > MAX_FILE_SIZE) {
          throw new Error("File too large. Max size is 10 MB.");
        }
      }

      // Due date required when pending
      if (form.payment_status === "pending" && !form.payment_due_date) {
        throw new Error("Please set the payment due date for pending payments.");
      }

      const subtotal = validItems.reduce((sum, i) => sum + i.total_price, 0);
      const cgstAmt = subtotal * (Number(form.cgst_rate) || 0) / 100;
      const sgstAmt = subtotal * (Number(form.sgst_rate) || 0) / 100;
      const taxAmount = cgstAmt + sgstAmt;
      const totalAmount = subtotal + taxAmount;

      // Upload invoice if new file selected
      let invoiceUrl = form.invoice_file_url || null;
      if (invoiceFiles.length > 0) {
        invoiceUrl = await uploadInvoiceFiles(invoiceFiles);
      }

      const payload: any = {
        supplier_name: form.supplier_name,
        supplier_phone: form.supplier_phone || null,
        supplier_type: form.supplier_type,
        purchase_date: form.purchase_date,
        invoice_number: form.invoice_number || null,
        subtotal,
        tax_amount: taxAmount,
        cgst_rate: Number(form.cgst_rate) || 0,
        sgst_rate: Number(form.sgst_rate) || 0,
        total_amount: totalAmount,
        payment_method: form.payment_method,
        payment_status: form.payment_status,
        payment_due_date: form.payment_status === "pending" ? form.payment_due_date || null : null,
        delivery_status: form.delivery_status,
        notes: form.notes || null,
        invoice_file_url: invoiceUrl,
      };

      let purchaseId: string;
      if (editingPurchaseId) {
        const { error } = await supabase.from("purchases").update(payload).eq("id", editingPurchaseId);
        if (error) throw error;
        purchaseId = editingPurchaseId;
        await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);
      } else {
        const { data: purchase, error } = await supabase.from("purchases").insert(payload).select().single();
        if (error) throw error;
        purchaseId = purchase.id;
      }

      const itemsToInsert = validItems.map((item) => ({
        purchase_id: purchaseId,
        item_name: item.item_name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        expiry_date: item.expiry_date || null,
        batch_number: item.batch_number || null,
      }));

      const { error: itemsError } = await supabase.from("purchase_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Sync due-date notification (only on create/payment-status/due-date change events)
      await syncPurchaseNotification({
        id: purchaseId,
        payment_status: form.payment_status,
        payment_due_date: payload.payment_due_date,
        invoice_number: form.invoice_number || null,
        supplier_name: form.supplier_name,
        total_amount: totalAmount,
      });

      return purchaseId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_overdue_notifications"] });
      setShowAddDialog(false);
      setEditingPurchaseId(null);
      resetForm();
      toast.success(editingPurchaseId ? "Purchase updated!" : "Purchase recorded successfully!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      // Block deletion when a linked paid expense exists (financial reversal required)
      const { data: linkedExpense } = await supabase
        .from("expenses")
        .select("id")
        .eq("purchase_id", id)
        .maybeSingle();
      const { data: purchaseRow } = await supabase
        .from("purchases")
        .select("payment_status")
        .eq("id", id)
        .maybeSingle();
      if (linkedExpense && purchaseRow?.payment_status === "paid") {
        throw new Error("Cannot delete a paid purchase. Mark it as Pending first to reverse the linked expense.");
      }
      await supabase.from("purchase_items").delete().eq("purchase_id", id);
      await supabase.from("notifications" as any).delete().eq("type", "purchase_payment_due").eq("entity_id", id);
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_overdue_notifications"] });
      toast.success("Purchase deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateDelivery = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("purchases").update({ delivery_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Delivery status updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---- Forward to Expense ----
  const isForwardEligible = (p: any) => p.payment_status === "paid" && !forwardedMap[p.id];

  const buildForwardRow = (p: any) => ({
    id: p.id,
    title: `PO: ${p.invoice_number || "—"} — ${p.supplier_name}`,
    amount: Number(p.total_amount || 0),
    date: p.purchase_date,
    payee: p.supplier_name || "",
    category: EXPENSE_CATEGORY_BY_TYPE[p.supplier_type] || DEFAULT_EXPENSE_CATEGORY,
    payment_method: p.payment_method || "cash",
    supplier_type: p.supplier_type || "",
    invoice_number: p.invoice_number || null,
    payment_proof_url: p.payment_proof_url || null,
  });

  const openForwardDialog = (rows: any[]) => {
    const eligible = rows.filter(isForwardEligible);
    if (eligible.length === 0) {
      toast.error("Nothing to forward — these purchases are already in Expenses or not marked Paid.");
      return;
    }
    setForwardRows(eligible.map(buildForwardRow));
    setShowForwardDialog(true);
  };

  const forwardToExpense = useMutation({
    mutationFn: async (rows: typeof forwardRows) => {
      for (const r of rows) {
        const description = `Inventory Purchase${r.invoice_number ? ` — Inv ${r.invoice_number}` : ""}${r.payee ? ` (${r.payee})` : ""}`;
        const { data: existing } = await supabase
          .from("expenses")
          .select("id")
          .eq("purchase_id", r.id)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await supabase
            .from("expenses")
            .update({ category: r.category, payment_method: r.payment_method, paid_to: r.payee, amount: r.amount })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("expenses").insert({
            expense_date: r.date,
            category: r.category,
            subcategory: r.supplier_type,
            description,
            amount: r.amount,
            payment_method: r.payment_method,
            paid_to: r.payee,
            receipt_number: r.invoice_number,
            notes: `Forwarded from Purchase ${r.id}`,
            purchase_id: r.id,
            receipt_url: r.payment_proof_url,
          });
          if (error) throw error;
        }
      }
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["purchases_forwarded_expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setShowForwardDialog(false);
      setForwardRows([]);
      setSelectedForForward([]);
      toast.success(`${count} ${count === 1 ? "purchase" : "purchases"} forwarded to Expenses`, {
        action: { label: "View in Expenses", onClick: () => navigate("/expenses") },
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });



  const resetForm = () => {
    setForm({
      supplier_name: "",
      supplier_phone: "",
      supplier_type: "dental_material",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      invoice_number: "",
      payment_method: "cash",
      payment_status: "paid",
      payment_due_date: "",
      delivery_status: "pending",
      cgst_rate: 0,
      sgst_rate: 0,
      discount_amount: 0,
      notes: "",
      invoice_file_url: "",
    });
    setItems([{ item_name: "", category: "", quantity: 1, unit: "pcs", unit_price: 0, total_price: 0, expiry_date: "", batch_number: "" }]);
    setInvoiceFiles([]);
  };

  const openEditPurchase = async (purchase: any) => {
    const { data: pItems, error } = await supabase
      .from("purchase_items")
      .select("*")
      .eq("purchase_id", purchase.id);
    if (error) {
      toast.error("Failed to load purchase items");
      return;
    }
    setForm({
      supplier_name: purchase.supplier_name || "",
      supplier_phone: purchase.supplier_phone || "",
      supplier_type: purchase.supplier_type || "dental_material",
      purchase_date: purchase.purchase_date,
      invoice_number: purchase.invoice_number || "",
      payment_method: purchase.payment_method || "cash",
      payment_status: purchase.payment_status || "paid",
      payment_due_date: purchase.payment_due_date || "",
      delivery_status: purchase.delivery_status || "pending",
      cgst_rate: Number(purchase.cgst_rate) || 0,
      sgst_rate: Number(purchase.sgst_rate) || 0,
      discount_amount: Number(purchase.discount_amount) || 0,
      notes: purchase.notes || "",
      invoice_file_url: purchase.invoice_file_url || "",
    });
    setItems(
      (pItems ?? []).map((it: any) => ({
        item_name: it.item_name,
        category: it.category || "Dental Material",
        quantity: Number(it.quantity) || 1,
        unit: it.unit || "pcs",
        unit_price: Number(it.unit_price) || 0,
        total_price: Number(it.total_price) || 0,
        expiry_date: it.expiry_date || "",
        batch_number: it.batch_number || "",
      })),
    );
    setInvoiceFiles([]);
    setEditingPurchaseId(purchase.id);
    setShowAddDialog(true);
  };

  const addItem = () => {
    setItems([...items, { item_name: "", category: "", quantity: 1, unit: "pcs", unit_price: 0, total_price: 0, expiry_date: "", batch_number: "" }]);
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: string | number) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    if (field === "quantity" || field === "unit_price") {
      updated[index].total_price = updated[index].quantity * updated[index].unit_price;
    }
    setItems(updated);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  // Open signed URL for stored invoice
  const viewInvoiceFile = async (path: string | null | undefined) => {
    if (!path) {
      toast.error("No invoice attached");
      return;
    }
    const { data, error } = await supabase.storage.from("purchase-invoices").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Unable to open invoice");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  // Filtered purchases
  const filtered = purchases.filter((p: any) => {
    const matchesSearch =
      p.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || p.supplier_type === filterType;
    const matchesStatus = filterStatus === "all" || p.payment_status === filterStatus;
    const matchesSupplier = filterSupplier === "all" || p.supplier_name === filterSupplier;
    const pDate = new Date(p.purchase_date);
    const matchFromDate = !range.from || pDate >= range.from;
    const matchToDate = !range.to || pDate <= range.to;
    return matchesSearch && matchesType && matchesStatus && matchesSupplier && matchFromDate && matchToDate;
  });

  const pagedFiltered = usePagedSlice(filtered, page, pageSize);

  // Selection (only eligible rows on the current page can be selected)
  const eligibleOnPage = useMemo(
    () => (pagedFiltered as any[]).filter(isForwardEligible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagedFiltered, forwardedMap]
  );
  const allPageSelected = eligibleOnPage.length > 0 && eligibleOnPage.every((p) => selectedForForward.includes(p.id));
  const toggleSelectAllOnPage = () => {
    const ids = eligibleOnPage.map((p) => p.id);
    setSelectedForForward((prev) => (allPageSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  };
  const toggleRowSelected = (id: string) =>
    setSelectedForForward((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectedPurchases = useMemo(
    () => (purchases as any[]).filter((p) => selectedForForward.includes(p.id)),
    [purchases, selectedForForward]
  );
  const selectedTotal = selectedPurchases.reduce((s, p) => s + Number(p.total_amount || 0), 0);



  const uniqueSuppliers = useMemo(() => {
    const set = new Set<string>();
    purchases.forEach((p: any) => {
      if (p.supplier_name?.trim()) set.add(p.supplier_name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [purchases]);

  const totalPurchases = purchases.reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);
  const pendingPayments = purchases
    .filter((p: any) => p.payment_status === "pending")
    .reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);
  const thisMonthPurchases = purchases
    .filter((p: any) => p.purchase_date?.startsWith(format(new Date(), "yyyy-MM")))
    .reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);

  const selectedPurchase = purchases.find((p: any) => p.id === selectedPurchaseId);

  const overdueCount = overdueNotifications.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary" />
            Purchase Management
          </h1>
          <p className="text-muted-foreground mt-1">Track dental material & pharmacy purchases from suppliers</p>
          {overdueCount > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overdueCount} purchase payment{overdueCount > 1 ? "s" : ""} due / overdue
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            preset={preset} onPresetChange={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
            showYear
          />
          <Dialog open={showAddDialog} onOpenChange={(v) => { setShowAddDialog(v); if (!v) { setEditingPurchaseId(null); resetForm(); } }}>
            {perms.canCreate && (
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> New Purchase</Button>
              </DialogTrigger>
            )}
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPurchaseId ? "Edit Purchase Order" : "Record New Purchase Order"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-2">
              {/* Supplier Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Supplier Name *</Label>
                  <Select
                    value={form.supplier_name || undefined}
                    onValueChange={(name) => {
                      const target = name.trim().toLowerCase();
                      const sup = (suppliersList as any[]).find(
                        (s) => (s.name || "").trim().toLowerCase() === target
                      );
                      const phone = sup?.phone ? String(sup.phone).split(",")[0].trim() : "";
                      setForm({
                        ...form,
                        supplier_name: name,
                        supplier_phone: phone || form.supplier_phone,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={suppliersList.length ? "Select supplier from settings" : "No suppliers — add in Settings"} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliersList.map((s: any) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Supplier Phone</Label>
                  {(() => {
                    const parsed = parseSupplierPhone(form.supplier_phone);
                    const active = SUPPLIER_COUNTRY_CODES.find((c) => c.dial === parsed.dial) ?? SUPPLIER_COUNTRY_CODES[0];
                    const invalid = parsed.digits.length > 0 && parsed.digits.length !== active.maxLen;
                    return (
                      <>
                        <div className="flex gap-2">
                          <Select
                            value={parsed.dial}
                            onValueChange={(dial) => {
                              const next = SUPPLIER_COUNTRY_CODES.find((c) => c.dial === dial) ?? SUPPLIER_COUNTRY_CODES[0];
                              const trimmed = parsed.digits.slice(0, next.maxLen);
                              setForm({ ...form, supplier_phone: trimmed ? `${dial} ${trimmed}` : "" });
                            }}
                          >
                            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SUPPLIER_COUNTRY_CODES.map((c) => (
                                <SelectItem key={c.code} value={c.dial}>{c.flag} {c.dial}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            inputMode="numeric"
                            maxLength={active.maxLen}
                            value={parsed.digits}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "").slice(0, active.maxLen);
                              setForm({ ...form, supplier_phone: digits ? `${parsed.dial} ${digits}` : "" });
                            }}
                            placeholder={`${active.maxLen} digits`}
                            aria-invalid={invalid}
                          />
                        </div>
                        {invalid && (
                          <p className="text-xs text-destructive mt-1">{active.label} numbers must be exactly {active.maxLen} digits.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div>
                  <Label>Supplier Type</Label>
                  <Select value={form.supplier_type} onValueChange={(v) => setForm({ ...form, supplier_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {supplierTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Purchase Date</Label>
                  <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
                </div>
                <div>
                  <Label>Purchase Order Number <span className="text-xs text-muted-foreground font-normal">(auto)</span></Label>
                  <Input value={form.invoice_number} readOnly className="bg-muted cursor-not-allowed" placeholder="Auto-generated" />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="credit">Credit (Due)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Status</Label>
                  <Select
                    value={form.payment_status}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        payment_status: v,
                        payment_due_date: v === "pending" ? form.payment_due_date : "",
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.payment_status === "pending" && (
                  <div>
                    <Label>Due Date *</Label>
                    <Input
                      type="date"
                      value={form.payment_due_date}
                      onChange={(e) => setForm({ ...form, payment_due_date: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <Label>Delivery Status</Label>
                  <Select value={form.delivery_status} onValueChange={(v) => setForm({ ...form, delivery_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Delivery date auto-fills when marked Delivered. Stock is added to Inventory only when marked Delivered.
                  </p>

                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Items</Label>
                  <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add Item</Button>
                </div>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="col-span-2">
                          <Label className="text-xs">Item Name *</Label>
                          <PurchaseItemPicker
                            value={item.item_name}
                            options={pickerOptions}
                            filterCategory={item.category}
                            placeholder="Search inventory or type new..."
                            onTextChange={(text) => updateItem(idx, "item_name", text)}
                            onSelect={(picked) => {
                              const updated = [...items];
                              updated[idx] = {
                                ...updated[idx],
                                item_name: picked.name,
                                category: picked.category || updated[idx].category,
                                unit: picked.unit || updated[idx].unit,
                                unit_price: picked.unit_price ?? updated[idx].unit_price,
                              };
                              updated[idx].total_price = updated[idx].quantity * updated[idx].unit_price;
                              setItems(updated);
                              if (picked.supplier && !form.supplier_name.trim()) {
                                setForm((f) => ({ ...f, supplier_name: picked.supplier as string }));
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Select value={item.category || ""} onValueChange={(v) => updateItem(idx, "category", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                            <SelectContent>
                              {itemCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-1">
                          <div className="flex-1">
                            <Label className="text-xs">Qty</Label>
                            <Input type="number" value={item.quantity === 0 ? "" : item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(idx, "quantity", e.target.value === "" ? 0 : Number(e.target.value))} className="h-8 text-sm" />
                          </div>
                          <div className="w-16">
                            <Label className="text-xs">Unit</Label>
                            <Select value={item.unit} onValueChange={(v) => updateItem(idx, "unit", v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pcs">Pcs</SelectItem>
                                <SelectItem value="box">Box</SelectItem>
                                <SelectItem value="pack">Pack</SelectItem>
                                <SelectItem value="bottle">Bottle</SelectItem>
                                <SelectItem value="strip">Strip</SelectItem>
                                <SelectItem value="kg">Kg</SelectItem>
                                <SelectItem value="ltr">Ltr</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Unit Price (₹)</Label>
                          <Input type="number" value={item.unit_price === 0 ? "" : item.unit_price} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(idx, "unit_price", e.target.value === "" ? 0 : Number(e.target.value))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Total (₹)</Label>
                          <Input value={formatMoney(item.total_price)} readOnly className="h-8 text-sm bg-muted" />
                        </div>
                        <div>
                          <Label className="text-xs">Batch No.</Label>
                          <Input value={item.batch_number} onChange={(e) => updateItem(idx, "batch_number", e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="flex items-end">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-border p-3 bg-muted/30 space-y-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">CGST %</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.cgst_rate}
                        onChange={(e) => setForm({ ...form, cgst_rate: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SGST %</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.sgst_rate}
                        onChange={(e) => setForm({ ...form, sgst_rate: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Discount (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.discount_amount}
                        onChange={(e) => setForm({ ...form, discount_amount: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {(() => {
                    const sub = items.reduce((s, i) => s + i.total_price, 0);
                    const cgstAmt = sub * (Number(form.cgst_rate) || 0) / 100;
                    const sgstAmt = sub * (Number(form.sgst_rate) || 0) / 100;
                    const grand = sub + cgstAmt + sgstAmt;
                    return (
                      <div className="text-right space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{formatMoney(sub)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">CGST ({form.cgst_rate || 0}%)</span><span>₹{formatMoney(cgstAmt)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">SGST ({form.sgst_rate || 0}%)</span><span>₹{formatMoney(sgstAmt)}</span></div>
                        <div className="flex justify-between pt-1 border-t border-border text-base font-bold text-foreground">
                          <span>Total</span><span>₹{formatMoney(grand)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." rows={2} />
              </div>

              {/* Supplier invoice upload */}
              <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1">
                  <Upload className="h-4 w-4" />
                  Supplier Invoice / Tax Bill {!editingPurchaseId && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setInvoiceFiles(f ? [f] : []);
                  }}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Accepted: PDF, JPG, PNG, WEBP — max 10 MB.{" "}
                  {form.invoice_file_url && invoiceFiles.length === 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => viewInvoiceFile(form.invoice_file_url)}
                        className="text-primary hover:underline"
                      >
                        View existing invoice
                      </button>
                      . Selecting a new file replaces it.
                    </>
                  )}
                  {!form.invoice_file_url && editingPurchaseId && " (No invoice on file — optional for existing orders.)"}
                </p>
                {invoiceFiles.length > 0 && (
                  <p className="text-xs text-foreground">Selected: {invoiceFiles[0].name} ({(invoiceFiles[0].size / 1024).toFixed(0)} KB)</p>
                )}
              </div>

              <Button onClick={() => createPurchase.mutate()} disabled={createPurchase.isPending} className="w-full">
                {createPurchase.isPending ? "Saving..." : editingPurchaseId ? "Update Purchase Order" : "Save Purchase Order"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><ShoppingCart className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Purchases</p><p className="text-xl font-bold text-foreground">{purchases.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><IndianRupee className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Amount</p><p className="text-xl font-bold text-foreground">₹{formatMoney(totalPurchases)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><CalendarLucide className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">This Month</p><p className="text-xl font-bold text-foreground">₹{formatMoney(thisMonthPurchases)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10"><FileText className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-xs text-muted-foreground">Pending Payments</p><p className="text-xl font-bold text-foreground">₹{formatMoney(pendingPayments)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search supplier or PO number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]"><Filter className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {supplierTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSupplier} onValueChange={setFilterSupplier}>
          <SelectTrigger className="w-[200px]">
            <Building2 className="h-4 w-4 mr-1" />
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {uniqueSuppliers.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>


      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleSelectAllOnPage}
                    disabled={eligibleOnPage.length === 0}
                    aria-label="Select all forwardable purchases"
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Payment Mode</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Invoice Bill</TableHead>
                <TableHead>Expense</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">No purchases found. Click "New Purchase" to add one.</TableCell></TableRow>
              ) : (
                pagedFiltered.map((p: any) => {
                  const overdue = overdueByPurchaseId.get(p.id);
                  const forwarded = forwardedMap[p.id];
                  const eligible = isForwardEligible(p);
                  return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Checkbox
                                checked={selectedForForward.includes(p.id)}
                                onCheckedChange={() => toggleRowSelected(p.id)}
                                disabled={!eligible}
                                aria-label="Select purchase"
                              />
                            </span>
                          </TooltipTrigger>
                          {!eligible && (
                            <TooltipContent>
                              {forwarded ? "Already forwarded to Expenses" : "Mark payment as Paid first"}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>

                    <TableCell className="text-sm">{format(new Date(p.purchase_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{p.invoice_number || "—"}</TableCell>
                    <TableCell>
                      <div>
                        <button
                          type="button"
                          onClick={() => openEditPurchase(p)}
                          className="font-medium text-primary text-sm hover:underline text-left"
                        >
                          {p.supplier_name}
                        </button>
                        {p.supplier_phone && <p className="text-xs text-muted-foreground">{p.supplier_phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {supplierTypes.find((t) => t.value === p.supplier_type)?.label || p.supplier_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">₹{formatMoney(p.total_amount)}</TableCell>
                    <TableCell className="text-sm capitalize">{p.payment_method}</TableCell>
                    <TableCell>
                      <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "pending" ? "destructive" : "secondary"}>
                        {p.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.payment_status === "pending" && p.payment_due_date ? (
                        <span className={cn(overdue && "text-destructive font-semibold")}>
                          {format(new Date(p.payment_due_date), "dd MMM yyyy")}
                          {overdue && <span className="block text-[10px]">Overdue</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.delivery_status || "pending"}
                        onValueChange={(v) => updateDelivery.mutate({ id: p.id, status: v })}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_transit">In Transit</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                        </SelectContent>
                      </Select>
                      {p.delivery_date ? (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Delivered: {format(new Date(p.delivery_date), "dd MMM yyyy")}
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Stock adds on Delivered
                        </p>
                      )}

                    </TableCell>
                    <TableCell className="text-center">
                      {p.invoice_file_url ? (
                        <Button size="icon" variant="ghost" title="View invoice file" onClick={() => viewInvoiceFile(p.invoice_file_url)}>
                          <FileText className="h-4 w-4 text-primary" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {forwarded ? (
                        <Link
                          to={`/expenses?expense=${forwarded.expenseId}`}
                          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:underline"
                        >
                          Forwarded to Expense
                          {forwarded.expenseNumber ? ` · ${forwarded.expenseNumber}` : ""}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setSelectedPurchaseId(p.id); setShowDetailDialog(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {eligible && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Forward to Expense"
                            onClick={() => openForwardDialog([p])}
                          >
                            <ArrowUpRight className="h-4 w-4 text-primary" />
                          </Button>
                        )}

                        {perms.canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(`Delete purchase ${p.invoice_number || ""} from ${p.supplier_name}?`)) {
                                deletePurchase.mutate(p.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="purchases" />
        </CardContent>
      </Card>

      {/* Floating selection banner */}
      {selectedForForward.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-full border bg-card px-5 py-3 shadow-lg">
            <span className="text-sm font-medium">
              {selectedForForward.length} {selectedForForward.length === 1 ? "item" : "items"} selected
              <span className="text-muted-foreground"> · Total: ₹{formatMoney(selectedTotal)}</span>
            </span>
            <Button size="sm" onClick={() => openForwardDialog(selectedPurchases)}>
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Proceed to Expense
            </Button>
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSelectedForForward([])}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Forward to Expense confirmation */}
      <Dialog open={showForwardDialog} onOpenChange={(o) => { if (!o) { setShowForwardDialog(false); setForwardRows([]); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proceed to Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review the mapped details. You can change the Expense Category and Payment Mode before submitting.
            </p>
            {forwardRows.map((r, idx) => (
              <div key={r.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{r.title}</p>
                  <p className="text-sm font-semibold whitespace-nowrap">₹{formatMoney(r.amount)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <p>Date: <span className="text-foreground">{format(new Date(r.date), "dd MMM yyyy")}</span></p>
                  <p>Vendor / Payee: <span className="text-foreground">{r.payee || "—"}</span></p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Expense Category</Label>
                    <Select
                      value={r.category}
                      onValueChange={(v) => setForwardRows((rows) => rows.map((x, i) => (i === idx ? { ...x, category: v } : x)))}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set([...(expenseCategories as string[]), r.category, DEFAULT_EXPENSE_CATEGORY])).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Payment Mode</Label>
                    <Select
                      value={r.payment_method}
                      onValueChange={(v) => setForwardRows((rows) => rows.map((x, i) => (i === idx ? { ...x, payment_method: v } : x)))}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set([...EXPENSE_PAYMENT_METHODS, r.payment_method])).map((m) => (
                          <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-sm font-semibold">
                Total: ₹{formatMoney(forwardRows.reduce((s, r) => s + r.amount, 0))}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowForwardDialog(false); setForwardRows([]); }}>Cancel</Button>
                <Button onClick={() => forwardToExpense.mutate(forwardRows)} disabled={forwardToExpense.isPending || forwardRows.length === 0}>
                  {forwardToExpense.isPending ? "Submitting..." : `Confirm & Create ${forwardRows.length} Expense${forwardRows.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Purchase Order Details</DialogTitle>
          </DialogHeader>
          {selectedPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium text-foreground">{(selectedPurchase as any).supplier_name}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium text-foreground">{format(new Date((selectedPurchase as any).purchase_date), "dd MMM yyyy")}</span></div>
                <div><span className="text-muted-foreground">PO Number:</span> <span className="font-medium text-foreground">{(selectedPurchase as any).invoice_number || "—"}</span></div>
                <div><span className="text-muted-foreground">Payment:</span> <Badge variant={(selectedPurchase as any).payment_status === "paid" ? "default" : "destructive"}>{(selectedPurchase as any).payment_status}</Badge></div>
                {(selectedPurchase as any).payment_status === "pending" && (selectedPurchase as any).payment_due_date && (
                  <div><span className="text-muted-foreground">Due Date:</span> <span className="font-medium text-foreground">{format(new Date((selectedPurchase as any).payment_due_date), "dd MMM yyyy")}</span></div>
                )}
                {(selectedPurchase as any).invoice_file_url && (
                  <div className="col-span-2">
                    <Button size="sm" variant="outline" onClick={() => viewInvoiceFile((selectedPurchase as any).invoice_file_url)}>
                      <FileText className="h-4 w-4 mr-1" /> View Supplier Invoice
                    </Button>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{item.category}</Badge></TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell className="text-right">₹{formatMoney(item.unit_price)}</TableCell>
                      <TableCell className="text-right font-semibold">₹{formatMoney(item.total_price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => generatePurchaseInvoicePDF(selectedPurchase, purchaseItems)}>
                  <FileText className="h-4 w-4 mr-1" /> Download PDF Invoice
                </Button>
                <span className="text-lg font-bold text-foreground">
                  Grand Total: ₹{formatMoney((selectedPurchase as any).total_amount)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;
