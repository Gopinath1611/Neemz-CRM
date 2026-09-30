import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

import {
  Wallet,
  Plus,
  Search,
  IndianRupee,
  Calendar as CalendarIcon2,
  TrendingDown,
  Filter,
  Trash2,
  FileText,
  Settings2,
  X,
  Pencil,
  Check,
  Upload,
  Paperclip,
  Download,
  Loader2,
  FileArchive,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { generateExpenseReportPDF } from "@/lib/pdfGenerators";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { usePermissions } from "@/hooks/usePermissions";

const Expenses = () => {
  const queryClient = useQueryClient();
  const perms = usePermissions("/expenses");
  const { doctorOptions } = useClinicMasters();
  const { data: doctorsWithFee = [] } = useQuery({
    queryKey: ["doctors-with-fee"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name, consultant_fee")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string; consultant_fee: number }>;
    },
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSubcategory, setFilterSubcategory] = useState("all");
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useDateRangeFilter("month");
  const queryFromDate = range.from ?? new Date("2000-01-01");
  const queryToDate = range.to ?? new Date("2999-12-31");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState("");

  const [form, setForm] = useState({
    expense_date: format(new Date(), "yyyy-MM-dd"),
    category: "general",
    subcategory: "",
    description: "",
    amount: 0,
    payment_method: "cash",
    paid_to: "",
    receipt_number: "",
    notes: "",
    purchase_id: "" as string,
  });
  // Receipt upload — single file in UI, designed as array internally for future multi-file support
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [manageCategoryValue, setManageCategoryValue] = useState<string>("");
  const [purchasePickerOpen, setPurchasePickerOpen] = useState(false);

  const resetForm = () => {
    setForm({ expense_date: format(new Date(), "yyyy-MM-dd"), category: "general", subcategory: "", description: "", amount: 0, payment_method: "cash", paid_to: "", receipt_number: "", notes: "", purchase_id: "" });
    setReceiptFiles([]);
    setExistingReceiptUrl(null);
  };

  // Purchases available for linking (searchable by PO/invoice number or supplier)
  const { data: linkablePurchases = [] } = useQuery({
    queryKey: ["purchases-for-expense-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, invoice_number, supplier_name, purchase_date, total_amount, invoice_file_url")
        .order("purchase_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        invoice_number: string | null;
        supplier_name: string | null;
        purchase_date: string;
        total_amount: number | null;
        invoice_file_url: string | null;
      }>;
    },
  });
  const selectedLinkPurchase = linkablePurchases.find((p) => p.id === form.purchase_id) || null;

  // A purchase can be linked to only one expense — show which ones are taken
  const { data: takenPurchaseLinks = {} } = useQuery({
    queryKey: ["expense-purchase-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, expense_number, purchase_id")
        .not("purchase_id", "is", null)
        .limit(2000);
      if (error) throw error;
      const map: Record<string, { expenseId: string; expenseNumber: string | null }> = {};
      (data ?? []).forEach((r: any) => { map[r.purchase_id] = { expenseId: r.id, expenseNumber: r.expense_number }; });
      return map;
    },
  });

  // Upload first file (single-file UX); returns storage path or null.
  // Kept as array-based so future multi-file support only needs UI changes.
  const uploadReceipts = async (files: File[]): Promise<string | null> => {
    if (!files.length) return null;
    setUploadingReceipt(true);
    try {
      const file = files[0];
      const ext = file.name.split(".").pop() || "bin";
      const path = `${format(new Date(), "yyyy")}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("expense-receipts").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) throw error;
      return path;
    } finally {
      setUploadingReceipt(false);
    }
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("Unable to open receipt"); return; }
    window.open(data.signedUrl, "_blank");
  };

  // Receipt preview dialog — shows the expense's own receipt and the linked
  // purchase invoice together in one view
  type PreviewFile = { url: string; kind: "image" | "pdf" | "other" };
  const [preview, setPreview] = useState<{
    expenseNumber: string | null;
    kind: "invoice" | "receipt";

    fromPurchase: boolean;
    invoiceNumber: string | null;
    supplierName: string | null;
    receipt: PreviewFile | null;
    invoice: PreviewFile | null;
    combinedUrl: string | null;
    combining: boolean;
    loading: boolean;
  } | null>(null);

  const resolveFile = async (bucket: string, path: string): Promise<PreviewFile | null> => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return null;
    const ext = (path.split(".").pop() || "").toLowerCase();
    const kind: PreviewFile["kind"] = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
      ? "image"
      : ext === "pdf"
        ? "pdf"
        : "other";
    return { url: data.signedUrl, kind };
  };

  // Merge purchase invoice (page 1) + payment proof (page 2) into one PDF, in-browser.
  const appendToPdf = async (out: PDFDocument, file: PreviewFile) => {
    const bytes = new Uint8Array(await (await fetch(file.url)).arrayBuffer());
    if (file.kind === "pdf") {
      const src = await PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      return;
    }
    let img: any;
    try {
      img = await out.embedJpg(bytes);
    } catch {
      img = await out.embedPng(bytes);
    }
    const A4 = { w: 595.28, h: 841.89 };
    const scale = Math.min(A4.w / img.width, A4.h / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = out.addPage([A4.w, A4.h]);
    page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  };

  const buildCombinedPdf = async (invoice: PreviewFile, receipt: PreviewFile): Promise<string | null> => {
    try {
      const out = await PDFDocument.create();
      await appendToPdf(out, invoice);
      await appendToPdf(out, receipt);
      const bytes = await out.save();
      const blob = new Blob([bytes as any], { type: "application/pdf" });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("combine pdf", err);
      return null;
    }
  };

  const openDocPreview = async (
    e: any,
    purchaseInvoice: { invoice_number: string | null; invoice_file_url: string | null; supplier_name: string | null } | null,
    which: "invoice" | "receipt",
  ) => {
    const receiptPath = e.receipt_url || null;
    const invoicePath = purchaseInvoice?.invoice_file_url || null;
    const wantedPath = which === "invoice" ? invoicePath : receiptPath;
    if (!wantedPath) return;
    setPreview({
      expenseNumber: e.expense_number || null,
      kind: which,
      fromPurchase: !!e.purchase_id,
      invoiceNumber: purchaseInvoice?.invoice_number || null,
      supplierName: purchaseInvoice?.supplier_name || null,
      receipt: null,
      invoice: null,
      combinedUrl: null,
      combining: false,
      loading: true,
    });
    if (which === "receipt") {
      const receipt = await resolveFile("expense-receipts", receiptPath!);
      setPreview((p) => (p ? { ...p, receipt, loading: false } : p));
      return;
    }
    const [receipt, invoice] = await Promise.all([
      receiptPath ? resolveFile("expense-receipts", receiptPath) : null,
      resolveFile("purchase-invoices", invoicePath!),
    ]);
    const canCombine = !!receipt && !!invoice && receipt.kind !== "other" && invoice.kind !== "other";
    setPreview((p) => (p ? { ...p, invoice, loading: false, combining: canCombine } : p));
    if (canCombine) {
      const url = await buildCombinedPdf(invoice!, receipt!);
      setPreview((p) => (p ? { ...p, combinedUrl: url, combining: false } : p));
    }
  };


  const closePreview = () => {
    setPreview((p) => {
      if (p?.combinedUrl) URL.revokeObjectURL(p.combinedUrl);
      return null;
    });
  };


  // Fetch expense categories from DB
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const categoryMap = Object.fromEntries(
    expenseCategories.map((c: any) => [c.value, c.name])
  );

  // Fetch all subcategories
  const { data: allSubcategories = [] } = useQuery({
    queryKey: ["expense-subcategories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_subcategories" as any)
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const subcategoriesForForm = allSubcategories.filter((s: any) => s.category_value === form.category);
  const subcategoriesForManage = allSubcategories.filter((s: any) => s.category_value === manageCategoryValue);
  const subcategoryMap = Object.fromEntries(allSubcategories.map((s: any) => [s.value, s.name]));

  // Fetch expenses
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", format(queryFromDate, "yyyy-MM-dd"), format(queryToDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", format(queryFromDate, "yyyy-MM-dd"))
        .lte("expense_date", format(queryToDate, "yyyy-MM-dd"))
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Invoice bills of purchases linked to these expenses
  const linkedPurchaseIds = useMemo(
    () => Array.from(new Set((expenses as any[]).map((e) => e.purchase_id).filter(Boolean))) as string[],
    [expenses]
  );

  const { data: purchaseInvoiceMap = {} } = useQuery({
    queryKey: ["expense-linked-purchase-invoices", linkedPurchaseIds],
    enabled: linkedPurchaseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, invoice_number, invoice_file_url, supplier_name")
        .in("id", linkedPurchaseIds);
      if (error) throw error;
      const map: Record<string, { invoice_number: string | null; invoice_file_url: string | null; supplier_name: string | null }> = {};
      (data || []).forEach((p) => {
        map[p.id] = { invoice_number: p.invoice_number, invoice_file_url: p.invoice_file_url, supplier_name: p.supplier_name };
      });
      return map;
    },
  });



  // Create expense
  const createExpense = useMutation({
    mutationFn: async () => {
      if (!form.description || form.amount <= 0) throw new Error("Fill required fields");
      const paidTo = (form.category === "consultant_doctor" || form.category === "consultant_fees") ? form.paid_to : (form.paid_to || null);
      if ((form.category === "consultant_doctor" || form.category === "consultant_fees") && !paidTo) throw new Error("Select a doctor");
      const receiptPath = receiptFiles.length > 0 ? await uploadReceipts(receiptFiles) : null;
      const { error } = await supabase.from("expenses").insert({
        expense_date: form.expense_date,
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description,
        amount: form.amount,
        payment_method: form.payment_method,
        paid_to: paidTo,
        receipt_number: form.receipt_number || null,
        notes: form.notes || null,
        receipt_url: receiptPath,
        purchase_id: form.purchase_id || null,
      } as any);
      if (error) throw new Error(
        error.message?.includes("expenses_purchase_id_unique")
          ? "That purchase is already linked to another expense. Unlink it there first."
          : error.message
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-purchase-links"] });
      setShowAddDialog(false);
      resetForm();
      toast.success("Expense added!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update expense
  const updateExpense = useMutation({
    mutationFn: async () => {
      if (!editingExpenseId) throw new Error("No expense selected");
      if (!form.description || form.amount <= 0) throw new Error("Fill required fields");
      // Upload new receipt only if user picked one; otherwise keep existing
      let receiptPath = existingReceiptUrl;
      if (receiptFiles.length > 0) {
        receiptPath = await uploadReceipts(receiptFiles);
      }
      const { error } = await supabase.from("expenses").update({
        expense_date: form.expense_date,
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description,
        amount: form.amount,
        payment_method: form.payment_method,
        paid_to: form.paid_to || null,
        receipt_number: form.receipt_number || null,
        notes: form.notes || null,
        receipt_url: receiptPath,
        purchase_id: form.purchase_id || null,
      } as any).eq("id", editingExpenseId);
      if (error) throw new Error(
        error.message?.includes("expenses_purchase_id_unique")
          ? "That purchase is already linked to another expense. Unlink it there first."
          : error.message
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-purchase-links"] });
      setShowAddDialog(false);
      setEditingExpenseId(null);
      resetForm();
      toast.success("Expense updated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEditExpense = (e: any) => {
    setEditingExpenseId(e.id);
    setForm({
      expense_date: e.expense_date,
      category: e.category || "general",
      subcategory: e.subcategory || "",
      description: e.description || "",
      amount: Number(e.amount || 0),
      payment_method: e.payment_method || "cash",
      paid_to: e.paid_to || "",
      receipt_number: e.receipt_number || "",
      notes: e.notes || "",
      purchase_id: e.purchase_id || "",
    });
    setReceiptFiles([]);
    setExistingReceiptUrl(e.receipt_url || null);
    setShowAddDialog(true);
  };

  // Delete expense
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
  });

  // Add category
  const addCategory = useMutation({
    mutationFn: async () => {
      const trimmed = newCategoryName.trim();
      if (!trimmed) throw new Error("Enter category name");
      const value = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (expenseCategories.some((c: any) => c.value === value)) throw new Error("Category already exists");
      const { error } = await supabase.from("expense_categories").insert({ name: trimmed, value });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setNewCategoryName("");
      toast.success("Category added!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update category (rename)
  const updateCategory = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name required");
      const { error } = await supabase.from("expense_categories").update({ name: trimmed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setEditingCategoryId(null);
      toast.success("Category updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete category (hard delete)
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("Category deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Add subcategory
  const addSubcategory = useMutation({
    mutationFn: async () => {
      const trimmed = newSubcategoryName.trim();
      if (!trimmed) throw new Error("Enter subcategory name");
      if (!manageCategoryValue) throw new Error("Select a category first");
      const value = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + Date.now().toString(36);
      const { error } = await supabase.from("expense_subcategories" as any).insert({
        category_value: manageCategoryValue, name: trimmed, value,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-subcategories"] });
      setNewSubcategoryName("");
      toast.success("Subcategory added!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update subcategory
  const updateSubcategory = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name required");
      const { error } = await supabase.from("expense_subcategories" as any).update({ name: trimmed } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-subcategories"] });
      setEditingSubId(null);
      toast.success("Subcategory updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete subcategory (hard delete)
  const deleteSubcategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_subcategories" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-subcategories"] });
      toast.success("Subcategory deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isConsultantCategory = (cat: string) => cat === "consultant_doctor" || cat === "consultant_fees";
  const showDoctorFilter = filterCategory !== "all" && isConsultantCategory(filterCategory);

  const filtered = expenses.filter((e: any) => {
    const matchesSearch = e.description?.toLowerCase().includes(searchQuery.toLowerCase()) || e.paid_to?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || e.category === filterCategory;
    const matchesSubcategory = filterSubcategory === "all" || e.subcategory === filterSubcategory;
    const matchesDoctor = !showDoctorFilter || filterDoctor === "all" || (e.paid_to || "").toLowerCase() === filterDoctor.toLowerCase();
    return matchesSearch && matchesCategory && matchesSubcategory && matchesDoctor;
  });

  const pagedFiltered = usePagedSlice(filtered as any[], page, pageSize);

  const subcategoriesForFilter = filterCategory === "all"
    ? allSubcategories
    : allSubcategories.filter((s: any) => s.category_value === filterCategory);

  // Doctor list derived from consultant expenses in current scope
  const consultantExpensesInRange = expenses.filter((e: any) => isConsultantCategory(e.category) && e.paid_to);
  const doctorOptionsFromExpenses = Array.from(new Set(consultantExpensesInRange.map((e: any) => e.paid_to)));

  // Doctor breakdown (visits + total) when consultant filter active
  const doctorBreakdown = useMemo(() => {
    if (!showDoctorFilter) return [] as Array<{ doctor: string; visits: number; total: number }>;
    const map: Record<string, { visits: number; total: number }> = {};
    expenses
      .filter((e: any) => e.category === filterCategory && e.paid_to)
      .filter((e: any) => filterDoctor === "all" || (e.paid_to || "").toLowerCase() === filterDoctor.toLowerCase())
      .forEach((e: any) => {
        const k = e.paid_to;
        if (!map[k]) map[k] = { visits: 0, total: 0 };
        map[k].visits += 1;
        map[k].total += Number(e.amount || 0);
      });
    return Object.entries(map)
      .map(([doctor, v]) => ({ doctor, visits: v.visits, total: v.total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, filterCategory, filterDoctor, showDoctorFilter]);

  // ===== Bulk ZIP download of invoice bills / payment receipts =====
  const [zipBusy, setZipBusy] = useState<null | "invoice" | "receipt">(null);

  const safeName = (s: string) => (s || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  const downloadDocsZip = async (kind: "invoice" | "receipt") => {
    if (zipBusy) return;
    const bucket = kind === "invoice" ? "purchase-invoices" : "expense-receipts";
    const jobs: Array<{ path: string; name: string }> = [];
    const used: Record<string, number> = {};

    filtered.forEach((e: any) => {
      const path = kind === "invoice"
        ? (e.purchase_id ? purchaseInvoiceMap[e.purchase_id]?.invoice_file_url : null)
        : e.receipt_url;
      if (!path) return;
      const ext = (String(path).split(".").pop() || "bin").toLowerCase();
      let base = `${safeName(e.expense_number || "EXP")}_${safeName(e.paid_to || "unknown")}_${kind}`;
      if (used[base] != null) {
        used[base] += 1;
        base = `${base}-${used[base]}`;
      } else {
        used[base] = 0;
      }
      jobs.push({ path: String(path), name: `${base}.${ext}` });
    });

    if (jobs.length === 0) {
      toast.info(kind === "invoice" ? "No invoice bills in this date range" : "No payment receipts in this date range");
      return;
    }

    setZipBusy(kind);
    const toastId = toast.loading(`Preparing ZIP (0/${jobs.length} files)...`);
    const zip = new JSZip();
    let done = 0;
    let skipped = 0;

    const fetchOne = async (job: { path: string; name: string }) => {
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(job.path, 300);
        if (error || !data?.signedUrl) throw new Error("sign failed");
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error("fetch failed");
        zip.file(job.name, await res.blob());
      } catch {
        skipped += 1;
      } finally {
        done += 1;
        toast.loading(`Preparing ZIP (${done}/${jobs.length} files)...`, { id: toastId });
      }
    };

    try {
      for (let i = 0; i < jobs.length; i += 5) {
        await Promise.all(jobs.slice(i, i + 5).map(fetchOne));
      }
      const added = jobs.length - skipped;
      if (added === 0) {
        toast.error("Could not download any files", { id: toastId });
        return;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Expenses_${kind === "invoice" ? "Invoices" : "Receipts"}_${format(queryFromDate, "yyyyMMdd")}-${format(queryToDate, "yyyyMMdd")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${added} file${added === 1 ? "" : "s"}${skipped ? `, ${skipped} skipped` : ""}`, { id: toastId });
    } catch {
      toast.error("Could not prepare the ZIP file", { id: toastId });
    } finally {
      setZipBusy(null);
    }
  };


  const totalExpenses = filtered.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
  const todayExpenses = expenses
    .filter((e: any) => e.expense_date === format(new Date(), "yyyy-MM-dd"))
    .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const categoryBreakdown = expenses.reduce((acc: Record<string, number>, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
    return acc;
  }, {});

  const topCategories = Object.entries(categoryBreakdown)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" />
            Daily Expenses
          </h1>
          <p className="text-muted-foreground mt-1">Track all clinic daily expenses and payments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            preset={preset} onPresetChange={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
            showYear
          />
          <Button variant="outline" size="sm" onClick={() => {
            const headers = ["Expense No.", "Date", "Description", "Category", "Subcategory", "Paid To", "Payment", "Receipt No.", "Amount"];
            const rows = filtered.map((e: any) => [
              e.expense_number || "",
              format(new Date(e.expense_date), "dd-MM-yyyy"),
              e.description || "",
              categoryMap[e.category] || e.category || "",
              subcategoryMap[e.subcategory] || e.subcategory || "",
              e.paid_to || "",
              e.payment_method || "",
              e.receipt_number || "",
              Number(e.amount || 0),
            ]);
            const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Expenses_${format(queryFromDate, "yyyyMMdd")}-${format(queryToDate, "yyyyMMdd")}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const catLabels = categoryMap;
            const dateLabel = `${format(queryFromDate, "dd MMM yyyy")} - ${format(queryToDate, "dd MMM yyyy")}`;
            generateExpenseReportPDF(expenses, dateLabel, catLabels);
          }} disabled={expenses.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={filtered.length === 0 || zipBusy !== null}>
                {zipBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileArchive className="h-4 w-4 mr-1" />}
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadDocsZip("invoice")}>Download Invoices (ZIP)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadDocsZip("receipt")}>Download Receipts (ZIP)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={showAddDialog} onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) {
              setEditingExpenseId(null);
              resetForm();
            }
          }}>
            {perms.canCreate && (
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingExpenseId ? "Edit Expense" : "Add New Expense"}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <div className="flex gap-1">
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, subcategory: "", paid_to: "" })}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {expenseCategories.map((c: any) => (
                            <SelectItem key={c.value} value={c.value}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => { setManageCategoryValue(form.category); setShowCategoryDialog(true); }} title="Manage Categories">
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Subcategory selector */}
                {subcategoriesForForm.length > 0 && (
                  <div>
                    <Label>Subcategory</Label>
                    <div className="flex gap-1">
                      <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                        <SelectContent>
                          {subcategoriesForForm.map((s: any) => (
                            <SelectItem key={s.value} value={s.value}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => { setManageCategoryValue(form.category); setShowCategoryDialog(true); }} title="Manage Subcategories">
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Doctor dropdown when consultant categories selected */}
                {(form.category === "consultant_doctor" || form.category === "consultant_fees") && (
                  <div>
                    <Label>Doctor Name *</Label>
                    <Select
                      value={form.paid_to}
                      onValueChange={(v) => {
                        const doc = doctorsWithFee.find((d) => d.name === v);
                        const fee = Number(doc?.consultant_fee || 0);
                        setForm((prev) => ({
                          ...prev,
                          paid_to: v,
                          amount: form.category === "consultant_fees" && fee > 0 ? fee : prev.amount,
                          description: form.category === "consultant_fees" && !prev.description
                            ? `Consultant fees - ${v}`
                            : prev.description,
                        }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                      <SelectContent>
                        {doctorsWithFee.length === 0 && (
                          <div className="px-2 py-3 text-xs text-muted-foreground">No doctors found. Add doctors in Settings.</div>
                        )}
                        {doctorsWithFee.map((d) => (
                          <SelectItem key={d.id} value={d.name}>
                            {d.name}{form.category === "consultant_fees" && d.consultant_fee > 0 ? ` — ₹${Number(d.consultant_fee).toLocaleString("en-IN")}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.category === "consultant_fees" && form.paid_to && (
                      <p className="text-xs text-muted-foreground mt-1">Amount auto-filled from doctor's saved consultant fee. You can edit it below.</p>
                    )}
                  </div>
                )}

                <div>
                  <Label>Description *</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Electricity bill, Staff salary..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (₹) *</Label>
                    <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0" />
                  </div>
                  <div>
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.category !== "consultant_doctor" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Paid To</Label>
                      <Input value={form.paid_to} onChange={(e) => setForm({ ...form, paid_to: e.target.value })} placeholder="Person / Company name" />
                    </div>
                    <div>
                      <Label>{form.payment_method === "bank_transfer" ? "UTR Number" : "Receipt No."}{form.payment_method === "bank_transfer" ? " *" : ""}</Label>
                      <Input
                        value={form.receipt_number}
                        onChange={(e) => setForm({ ...form, receipt_number: e.target.value })}
                        placeholder={form.payment_method === "bank_transfer" ? "Enter UTR number" : ""}
                        required={form.payment_method === "bank_transfer"}
                      />
                    </div>
                  </div>
                )}
                {form.category === "consultant_doctor" && (
                  <div>
                    <Label>{form.payment_method === "bank_transfer" ? "UTR Number *" : "Receipt No."}</Label>
                    <Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} required={form.payment_method === "bank_transfer"} />
                  </div>
                )}

                {/* Receipt / scanned bill upload */}
                <div>
                  <Label>Upload Receipt / Scan Bill <span className="text-xs text-muted-foreground">(optional)</span></Label>

                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex-1">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 10 * 1024 * 1024) { toast.error("File too large (max 10 MB)"); return; }
                          setReceiptFiles([f]);
                        }}
                      />
                      <div className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-md cursor-pointer hover:bg-muted/40 text-sm">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">
                          {receiptFiles[0]?.name || (existingReceiptUrl ? "Replace receipt" : "Choose image or PDF (max 10 MB)")}
                        </span>
                      </div>
                    </label>
                    {receiptFiles.length > 0 && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => setReceiptFiles([])} title="Clear">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {existingReceiptUrl && receiptFiles.length === 0 && (
                      <Button type="button" size="sm" variant="outline" onClick={() => openReceipt(existingReceiptUrl)}>
                        <Paperclip className="h-4 w-4 mr-1" /> View
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Optional. JPG, PNG, WEBP or PDF up to 10 MB.</p>

                </div>

                {/* Link to Purchase (optional) */}
                <div>
                  <Label>Link to Purchase <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Popover open={purchasePickerOpen} onOpenChange={setPurchasePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="flex-1 justify-start font-normal">
                          {selectedLinkPurchase
                            ? `${selectedLinkPurchase.invoice_number || "No PO No."} — ${selectedLinkPurchase.supplier_name || "Unknown supplier"}`
                            : form.purchase_id
                              ? "Linked purchase"
                              : "Search by PO number or supplier..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search PO number or supplier..." />
                          <CommandList>
                            <CommandEmpty>No purchase found.</CommandEmpty>
                            <CommandGroup>
                              {linkablePurchases.map((p) => {
                                const taken = takenPurchaseLinks[p.id];
                                const takenByOther = !!taken && taken.expenseId !== editingExpenseId;
                                return (
                                <CommandItem
                                  key={p.id}
                                  value={`${p.invoice_number || ""} ${p.supplier_name || ""}`}
                                  disabled={takenByOther}
                                  onSelect={() => {
                                    if (takenByOther) {
                                      toast.error(`Already linked to expense ${taken?.expenseNumber || ""}. Unlink it there first.`);
                                      return;
                                    }
                                    setForm((f) => ({ ...f, purchase_id: p.id }));
                                    setPurchasePickerOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-sm">
                                      {p.invoice_number || "No PO No."} — {p.supplier_name || "Unknown supplier"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(p.purchase_date), "dd MMM yyyy")} · ₹{Number(p.total_amount || 0).toLocaleString("en-IN")}
                                      {p.invoice_file_url ? "" : " · no invoice file"}
                                      {takenByOther ? ` · already linked to ${taken?.expenseNumber || "another expense"}` : ""}
                                    </span>
                                  </div>
                                </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {form.purchase_id && (
                      <Button type="button" size="icon" variant="ghost" title="Unlink" onClick={() => setForm((f) => ({ ...f, purchase_id: "" }))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Linking lets the Receipt view show the purchase invoice and this payment proof as one combined PDF.
                  </p>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
                <Button
                  onClick={() => editingExpenseId ? updateExpense.mutate() : createExpense.mutate()}
                  disabled={createExpense.isPending || updateExpense.isPending || uploadingReceipt}
                  className="w-full"
                >
                  {(createExpense.isPending || updateExpense.isPending || uploadingReceipt)
                    ? (uploadingReceipt ? "Uploading receipt..." : "Saving...")
                    : editingExpenseId ? "Update Expense" : "Add Expense"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Category Management Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Manage Categories & Subcategories</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Categories */}
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Categories</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name..."
                  onKeyDown={(e) => e.key === "Enter" && addCategory.mutate()}
                />
                <Button onClick={() => addCategory.mutate()} disabled={addCategory.isPending} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-[180px] overflow-y-auto space-y-1 mt-2">
                {expenseCategories.map((c: any) => (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center justify-between gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors",
                      manageCategoryValue === c.value ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50"
                    )}
                    onClick={() => setManageCategoryValue(c.value)}
                  >
                    {editingCategoryId === c.id ? (
                      <Input
                        autoFocus
                        value={editingCategoryName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateCategory.mutate({ id: c.id, name: editingCategoryName });
                          if (e.key === "Escape") setEditingCategoryId(null);
                        }}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span className="text-sm text-foreground flex-1">{c.name}</span>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      {editingCategoryId === c.id ? (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); updateCategory.mutate({ id: c.id, name: editingCategoryName }); }}>
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingCategoryId(c.id); setEditingCategoryName(c.name); }}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${c.name}"?`)) deleteCategory.mutate(c.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Subcategories */}
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Subcategories {manageCategoryValue && `— ${categoryMap[manageCategoryValue] || manageCategoryValue}`}
              </Label>
              {!manageCategoryValue ? (
                <p className="text-xs text-muted-foreground mt-2">Select a category above to manage its subcategories.</p>
              ) : (
                <>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={newSubcategoryName}
                      onChange={(e) => setNewSubcategoryName(e.target.value)}
                      placeholder="New subcategory name..."
                      onKeyDown={(e) => e.key === "Enter" && addSubcategory.mutate()}
                    />
                    <Button onClick={() => addSubcategory.mutate()} disabled={addSubcategory.isPending} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-1 mt-2">
                    {subcategoriesForManage.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No subcategories yet.</p>
                    )}
                    {subcategoriesForManage.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                        {editingSubId === s.id ? (
                          <Input
                            autoFocus
                            value={editingSubName}
                            onChange={(e) => setEditingSubName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateSubcategory.mutate({ id: s.id, name: editingSubName });
                              if (e.key === "Escape") setEditingSubId(null);
                            }}
                            className="h-7 text-sm"
                          />
                        ) : (
                          <span className="text-sm text-foreground flex-1">{s.name}</span>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          {editingSubId === s.id ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateSubcategory.mutate({ id: s.id, name: editingSubName })}>
                              <Check className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingSubId(s.id); setEditingSubName(s.name); }}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSubcategory.mutate(s.id); }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><IndianRupee className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Expenses</p><p className="text-xl font-bold text-foreground">₹{totalExpenses.toLocaleString("en-IN")}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><CalendarIcon2 className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">Today's Expenses</p><p className="text-xl font-bold text-foreground">₹{todayExpenses.toLocaleString("en-IN")}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><TrendingDown className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Entries</p><p className="text-xl font-bold text-foreground">{expenses.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Top Categories</p>
            <div className="space-y-1">
              {topCategories.map(([cat, amount]) => (
                <div key={cat} className="flex justify-between text-xs">
                  <span className="text-foreground capitalize">{categoryMap[cat] || cat}</span>
                  <span className="font-medium text-foreground">₹{(amount as number).toLocaleString("en-IN")}</span>
                </div>
              ))}
              {topCategories.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setFilterSubcategory("all"); setFilterDoctor("all"); }}>
          <SelectTrigger className="w-[180px]"><Filter className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {expenseCategories.map((c: any) => <SelectItem key={c.value} value={c.value}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSubcategory} onValueChange={setFilterSubcategory}>
          <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="All Subcategories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subcategories</SelectItem>
            {subcategoriesForFilter.map((s: any) => <SelectItem key={s.value} value={s.value}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {showDoctorFilter && (
          <Select value={filterDoctor} onValueChange={setFilterDoctor}>
            <SelectTrigger className="w-[220px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="All Doctors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Doctors</SelectItem>
              {Array.from(new Set([
                ...doctorOptionsFromExpenses,
                ...doctorsWithFee.map((d) => d.name),
                ...doctorOptions.map((o: any) => o.label || o.value),
              ])).filter(Boolean).map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Doctor Breakdown — visible when consultant category selected */}
      {showDoctorFilter && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Doctor-wise Consultant Charges</p>
                <p className="text-xs text-muted-foreground">{filterDoctor === "all" ? "All doctors" : filterDoctor} · {format(queryFromDate, "dd MMM")} – {format(queryToDate, "dd MMM yyyy")}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="text-lg font-bold text-foreground">₹{doctorBreakdown.reduce((s, d) => s + d.total, 0).toLocaleString("en-IN")}</p>
              </div>
            </div>
            {doctorBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No consultant entries in this range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Total Charged</TableHead>
                    <TableHead className="text-right">Avg / Visit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doctorBreakdown.map((d) => (
                    <TableRow key={d.doctor}>
                      <TableCell className="font-medium text-foreground">{d.doctor}</TableCell>
                      <TableCell className="text-right">{d.visits}</TableCell>
                      <TableCell className="text-right font-semibold">₹{d.total.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">₹{Math.round(d.total / d.visits).toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Invoice Bill</TableHead>
                <TableHead>Payment Receipt</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No expenses found. Click "Add Expense" to start tracking.</TableCell></TableRow>

              ) : (
                pagedFiltered.map((e: any) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => openEditExpense(e)}>
                    <TableCell className="text-sm font-mono">{e.expense_number || "—"}</TableCell>
                    <TableCell className="text-sm">{format(new Date(e.expense_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground text-sm">{e.description}</p>
                      {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="text-xs capitalize w-fit">
                          {categoryMap[e.category] || e.category}
                        </Badge>
                        {e.subcategory && (
                          <span className="text-xs text-muted-foreground">↳ {subcategoryMap[e.subcategory] || e.subcategory}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.paid_to || "—"}</TableCell>
                    <TableCell className="text-sm capitalize">{e.payment_method}</TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {(() => {
                        const purchaseInvoice = e.purchase_id ? purchaseInvoiceMap[e.purchase_id] : null;
                        if (!purchaseInvoice?.invoice_file_url) return <span className="text-xs text-muted-foreground">—</span>;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:text-blue-700" onClick={() => openDocPreview(e, purchaseInvoice, "invoice")}>
                              <FileText className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                            <span className="text-[10px] text-muted-foreground">From Purchase</span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {e.receipt_url ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:text-blue-700" onClick={() => openDocPreview(e, e.purchase_id ? purchaseInvoiceMap[e.purchase_id] : null, "receipt")}>
                          <Paperclip className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>


                    <TableCell className="text-right font-semibold text-foreground">₹{Number(e.amount).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                        {perms.canEdit && (
                          <Button size="icon" variant="ghost" onClick={() => openEditExpense(e)} title="Edit">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                        {perms.canDelete && (
                          <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this expense?")) deleteExpense.mutate(e.id); }} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="expenses" />
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {preview?.kind === "invoice" ? "Invoice Bill" : "Receipt"}{preview?.expenseNumber ? ` — ${preview.expenseNumber}` : ""}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-6">
              {preview.loading ? (
                <p className="text-sm text-muted-foreground">Loading preview…</p>
              ) : (
                <>
                  {preview.combining && (
                    <p className="text-sm text-muted-foreground">Building combined document…</p>
                  )}
                  {preview.combinedUrl && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" asChild>
                        <a href={preview.combinedUrl} download={`${preview.expenseNumber || "expense"}-combined.pdf`}>
                          <Download className="h-4 w-4 mr-1" /> Download Combined PDF
                        </a>
                      </Button>
                    </div>
                  )}
                  {preview.kind === "receipt" && preview.receipt && (

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Receipt</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => window.open(preview.receipt!.url, "_blank", "noopener,noreferrer")}>Open in new tab</Button>
                          <Button size="sm" variant="outline" asChild>
                            <a href={preview.receipt.url} download target="_blank" rel="noopener noreferrer">Download</a>
                          </Button>
                        </div>
                      </div>
                      {preview.receipt.kind === "image" && (
                        <img src={preview.receipt.url} alt="Uploaded expense receipt" className="w-full rounded-md border" />
                      )}
                      {preview.receipt.kind === "pdf" && (
                        <iframe src={preview.receipt.url} title="Uploaded expense receipt" className="w-full h-[480px] rounded-md border" />
                      )}
                      {preview.receipt.kind === "other" && (
                        <p className="text-sm text-muted-foreground">This file type can't be previewed — use Open in new tab or Download.</p>
                      )}
                    </div>
                  )}
                  {preview.kind === "invoice" && preview.invoice && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Purchase invoice</p>
                          <p className="text-xs text-muted-foreground">
                            {[preview.invoiceNumber, preview.supplierName].filter(Boolean).join(" — ")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => window.open(preview.invoice!.url, "_blank", "noopener,noreferrer")}>Open in new tab</Button>
                          <Button size="sm" variant="outline" asChild>
                            <a href={preview.invoice.url} download target="_blank" rel="noopener noreferrer">Download</a>
                          </Button>
                        </div>
                      </div>
                      {preview.invoice.kind === "image" && (
                        <img src={preview.invoice.url} alt="Purchase invoice" className="w-full rounded-md border" />
                      )}
                      {preview.invoice.kind === "pdf" && (
                        <iframe src={preview.invoice.url} title="Purchase invoice" className="w-full h-[480px] rounded-md border" />
                      )}
                      {preview.invoice.kind === "other" && (
                        <p className="text-sm text-muted-foreground">This file type can't be previewed — use Open in new tab or Download.</p>
                      )}
                    </div>
                  )}
                  {!(preview.kind === "invoice" ? preview.invoice : preview.receipt) && (
                    <p className="text-sm text-muted-foreground">Unable to load the file.</p>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
