import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Trash2, Plus, Search, CheckCircle, Clock, Package, AlertTriangle, Filter, Truck, MoreHorizontal, Pencil, UserPlus
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, parseISO, isWithinInterval } from "date-fns";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { useClinicMasters } from "@/hooks/useClinicMasters";

const wasteTypes = [
  { value: "biomedical", label: "Biomedical" },
  { value: "sharps", label: "Sharps (Needles/Blades)" },
  { value: "general", label: "General" },
  { value: "chemical", label: "Chemical" },
  { value: "pharmaceutical", label: "Pharmaceutical" },
];

const wasteCategories = [
  { value: "yellow", label: "🟡 Yellow Bag", desc: "Anatomical, chemical, infectious" },
  { value: "red", label: "🔴 Red Bag", desc: "Contaminated plastics, tubing" },
  { value: "white", label: "⚪ White Container", desc: "Sharps — needles, blades, glass" },
  { value: "blue", label: "🔵 Blue Box", desc: "Broken glassware, metallic waste" },
  { value: "black", label: "⚫ Black Bag", desc: "General non-hazardous waste" },
];

const categoryDescription = (category: string) => {
  switch (category) {
    case "yellow": return "Anatomical, chemical, infectious";
    case "red": return "Contaminated plastics, tubing";
    case "white": return "Sharps — needles, blades, glass";
    case "blue": return "Broken glassware, metallic waste";
    case "black": return "General non-hazardous waste";
    default: return "";
  }
};

const generateManifestNumber = () => {
  const date = format(new Date(), "yyyyMMdd");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `WM-${date}-${random}`;
};

const defaultForm = () => ({
  waste_type: "biomedical", waste_category: "yellow", items_description: categoryDescription("yellow"),
  quantity: "", unit: "bags", collected_by: "", collected_by_person: "",
  collection_date: format(new Date(), "yyyy-MM-dd"),
  collection_time: "", disposed_by: "", manifest_number: generateManifestNumber(),
  is_collected: false, notes: "",
});

const WasteManagement = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterAssistant, setFilterAssistant] = useState("all");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useDateRangeFilter("all");
  const [editingLog, setEditingLog] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newAgencyName, setNewAgencyName] = useState("");
  const [showManageAgencies, setShowManageAgencies] = useState(false);
  const queryClient = useQueryClient();

  const [form, setForm] = useState(defaultForm());

  // Fetch waste logs
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["waste-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("waste_logs")
        .select("*")
        .order("collection_date", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  // Fetch waste agencies
  const { data: agencies = [] } = useQuery({
    queryKey: ["waste-agencies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("waste_agencies")
        .select("*")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Fetch employees (staff)
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-staff"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, designation")
        .eq("status", "active")
        .order("first_name");
      return data || [];
    },
  });

  // Dental assistants now come live from Settings → Staff (assistant roles)
  const { assistantOptions } = useClinicMasters();
  const assistants = useMemo(
    () => assistantOptions.map((o) => ({ id: o.value, name: o.label, is_active: true })),
    [assistantOptions],
  );

  // Staff options for "Disposed By" - only live assistants from Settings → Staff
  const staffOptions = useMemo(() => {
    const names = new Map<string, string>();
    assistants.forEach((a) => {
      names.set(a.name.toLowerCase().trim(), a.name.trim());
    });
    // Include existing log names for backward compatibility
    logs.forEach((l: any) => {
      if (l.disposed_by) names.set(l.disposed_by.toLowerCase().trim(), l.disposed_by.trim());
    });
    return Array.from(names.values()).sort();
  }, [assistants, logs]);

  // Merged agency options (from table + existing logs)
  const agencyOptions = useMemo(() => {
    const names = new Map<string, string>();
    agencies.forEach((a: any) => names.set(a.name.toLowerCase().trim(), a.name.trim()));
    logs.forEach((l: any) => {
      if (l.collected_by) names.set(l.collected_by.toLowerCase().trim(), l.collected_by.trim());
    });
    return Array.from(names.values()).sort();
  }, [agencies, logs]);

  // Add agency
  const addAgency = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("waste_agencies").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agency added");
      queryClient.invalidateQueries({ queryKey: ["waste-agencies"] });
      setNewAgencyName("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete agency
  const deleteAgency = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waste_agencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agency removed");
      queryClient.invalidateQueries({ queryKey: ["waste-agencies"] });
    },
  });

  // Add log
  const addLog = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("waste_logs").insert({
        waste_type: form.waste_type,
        waste_category: form.waste_category,
        items_description: form.items_description,
        quantity: Number(form.quantity) || 0,
        unit: form.unit,
        collected_by: form.collected_by || null,
        collected_by_person: form.collected_by_person || null,
        collection_date: form.collection_date,
        collection_time: form.collection_time || null,
        disposed_by: form.disposed_by || null,
        manifest_number: form.manifest_number || null,
        is_collected: form.is_collected,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Waste log added");
      queryClient.invalidateQueries({ queryKey: ["waste-logs"] });
      setShowAdd(false);
      setForm(defaultForm());
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Update log
  const updateLog = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("waste_logs").update({
        waste_type: form.waste_type,
        waste_category: form.waste_category,
        items_description: form.items_description,
        quantity: Number(form.quantity) || 0,
        unit: form.unit,
        collected_by: form.collected_by || null,
        collected_by_person: form.collected_by_person || null,
        collection_date: form.collection_date,
        collection_time: form.collection_time || null,
        disposed_by: form.disposed_by || null,
        manifest_number: form.manifest_number || null,
        is_collected: form.is_collected,
        notes: form.notes || null,
      }).eq("id", editingLog.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Waste log updated");
      queryClient.invalidateQueries({ queryKey: ["waste-logs"] });
      setShowAdd(false);
      setEditingLog(null);
      setForm(defaultForm());
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete log
  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waste_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Log deleted");
      queryClient.invalidateQueries({ queryKey: ["waste-logs"] });
      setDeleteId(null);
    },
  });

  const markCollected = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waste_logs").update({ is_collected: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as collected");
      queryClient.invalidateQueries({ queryKey: ["waste-logs"] });
    },
  });

  const handleEdit = (log: any) => {
    setEditingLog(log);
    setForm({
      waste_type: log.waste_type, waste_category: log.waste_category,
      items_description: log.items_description, quantity: String(log.quantity),
      unit: "bags", collected_by: log.collected_by || "",
      collected_by_person: log.collected_by_person || "",
      collection_date: log.collection_date, collection_time: log.collection_time || "",
      disposed_by: log.disposed_by || "", manifest_number: log.manifest_number || "",
      is_collected: log.is_collected, notes: log.notes || "",
    });
    setShowAdd(true);
  };

  const handleDialogClose = (open: boolean) => {
    setShowAdd(open);
    if (!open) {
      setEditingLog(null);
      setForm(defaultForm());
    }
  };

  const handleAgencySelect = (value: string) => {
    if (value === "__add_agency__") return;
    if (value === "__manage_agencies__") {
      setShowManageAgencies(true);
      return;
    }
    setForm({ ...form, collected_by: value });
  };

  const categoryEmoji: Record<string, string> = { yellow: "🟡", red: "🔴", white: "⚪", blue: "🔵", black: "⚫" };

  const filtered = logs.filter((l: any) => {
    const matchSearch = l.items_description.toLowerCase().includes(search.toLowerCase()) ||
      (l.collected_by || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || l.waste_type === filterType;
    const matchAssistant = filterAssistant === "all" ||
      (l.disposed_by || "").trim().toLowerCase() === filterAssistant.trim().toLowerCase();
    let matchDate = true;
    if (range.from && range.to && l.collection_date) {
      try {
        const d = parseISO(l.collection_date);
        matchDate = isWithinInterval(d, { start: range.from, end: range.to });
      } catch { matchDate = true; }
    }
    return matchSearch && matchType && matchAssistant && matchDate;
  });

  // Stats reflect the active filters (date range, type, assistant, search)
  const statsEntries = filtered.length;
  const statsPending = filtered.filter((l: any) => !l.is_collected).length;
  const statsQty = filtered.reduce((a: number, l: any) => a + Number(l.quantity || 0), 0);
  const statsCollected = filtered.filter((l: any) => l.is_collected).length;
  const rangeLabel = range.from && range.to
    ? (preset === "today" ? "Today" : preset === "tomorrow" ? "Tomorrow" : preset === "week" ? "This Week" : preset === "month" ? "This Month" : "Selected Range")
    : "All Time";


  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Trash2 className="text-warning" size={24} /> Waste Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track biomedical & clinic waste disposal logs</p>
        </div>
        <div className="flex items-center gap-2">
          <SmartDateFilter
            preset={preset} onPresetChange={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
            hideAll={false}
          />
          <Dialog open={showAdd} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus size={14} /> Log Waste</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingLog ? "Edit Waste Log" : "Log Waste Disposal"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Waste Type</Label>
                  <Select value={form.waste_type} onValueChange={(v) => setForm({ ...form, waste_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{wasteTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bag / Container</Label>
                  <Select value={form.waste_category} onValueChange={(v) => setForm({ ...form, waste_category: v, items_description: categoryDescription(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{wasteCategories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Items Description</Label><Input value={form.items_description} readOnly className="bg-muted" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                <div>
                  <Label>Unit</Label>
                  <Input value="Bags" readOnly className="bg-muted" />
                </div>
                <div><Label>Date</Label><Input type="date" value={form.collection_date} onChange={(e) => setForm({ ...form, collection_date: e.target.value })} /></div>
              </div>

              {/* Collected By Agency - Dropdown with Add */}
              <div>
                <Label>Collected By (Agency)</Label>
                <div className="flex gap-1">
                  <Select value={form.collected_by || undefined} onValueChange={handleAgencySelect}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select agency" /></SelectTrigger>
                    <SelectContent>
                      {agencyOptions.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                      <SelectItem value="__manage_agencies__">⚙️ Manage Agencies</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" title="Add new agency"><Plus size={14} /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 space-y-2">
                      <Label className="text-xs font-medium">Add New Agency</Label>
                      <Input
                        value={newAgencyName}
                        onChange={(e) => setNewAgencyName(e.target.value)}
                        placeholder="Agency name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newAgencyName.trim()) {
                            addAgency.mutate(newAgencyName);
                            setForm({ ...form, collected_by: newAgencyName.trim() });
                          }
                        }}
                      />
                      <Button
                        size="sm" className="w-full"
                        disabled={!newAgencyName.trim()}
                        onClick={() => {
                          addAgency.mutate(newAgencyName);
                          setForm({ ...form, collected_by: newAgencyName.trim() });
                        }}
                      >
                        <UserPlus size={12} className="mr-1" /> Add
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Collected By Person Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Collector Person Name</Label>
                  <Input value={form.collected_by_person} onChange={(e) => setForm({ ...form, collected_by_person: e.target.value })} placeholder="Person who collected" />
                </div>
                <div>
                  <Label>Disposed By (Staff)</Label>
                  <Select value={form.disposed_by || undefined} onValueChange={(v) => setForm({ ...form, disposed_by: v })}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {staffOptions.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Collection Time</Label><Input type="time" value={form.collection_time} onChange={(e) => setForm({ ...form, collection_time: e.target.value })} /></div>
                <div>
                  <Label>Manifest # (Auto)</Label>
                  <Input value={form.manifest_number} onChange={(e) => setForm({ ...form, manifest_number: e.target.value })} readOnly className="bg-muted" />
                </div>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <Button
                className="w-full"
                onClick={() => editingLog ? updateLog.mutate() : addLog.mutate()}
                disabled={!form.items_description || !form.quantity}
              >
                {editingLog ? "Update Log" : "Save Log"}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Manage Agencies Dialog */}
      <Dialog open={showManageAgencies} onOpenChange={setShowManageAgencies}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Manage Agencies</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newAgencyName}
                onChange={(e) => setNewAgencyName(e.target.value)}
                placeholder="New agency name"
                onKeyDown={(e) => { if (e.key === "Enter" && newAgencyName.trim()) addAgency.mutate(newAgencyName); }}
              />
              <Button size="sm" disabled={!newAgencyName.trim()} onClick={() => addAgency.mutate(newAgencyName)}>
                <Plus size={14} />
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {agencies.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between bg-secondary/50 rounded px-3 py-2 text-sm">
                  <span>{a.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => deleteAgency.mutate(a.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
              {agencies.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No agencies added yet</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Waste Log?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteLog.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary"><Package size={16} /><span className="text-xs text-muted-foreground">Entries ({rangeLabel})</span></div>
            <p className="text-2xl font-bold font-display mt-1">{statsEntries}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-warning"><AlertTriangle size={16} /><span className="text-xs text-muted-foreground">Pending Collection</span></div>
            <p className="text-2xl font-bold font-display mt-1">{statsPending}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-success"><Truck size={16} /><span className="text-xs text-muted-foreground">Total Quantity</span></div>
            <p className="text-2xl font-bold font-display mt-1">{statsQty} Bags</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-accent"><CheckCircle size={16} /><span className="text-xs text-muted-foreground">Collected</span></div>
            <p className="text-2xl font-bold font-display mt-1">{statsCollected}</p>
          </CardContent>
        </Card>
      </div>

      {/* Color-coded categories reference */}
      <Card className="shadow-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Waste Segregation Guide</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {wasteCategories.map((c) => (
              <div key={c.value} className="flex items-center gap-2 text-xs bg-secondary/50 rounded-lg px-3 py-1.5">
                <span>{c.label}</span>
                <span className="text-muted-foreground">— {c.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search items or agency..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><Filter size={14} className="mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {wasteTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssistant} onValueChange={setFilterAssistant}>
          <SelectTrigger className="w-[200px]"><Filter size={14} className="mr-1" /><SelectValue placeholder="All Assistants" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assistants</SelectItem>
            {staffOptions.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Logged Date</TableHead>
                  <TableHead>Collected Date</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Disposed By</TableHead>
                  <TableHead>Collected By</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Manifest #</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "dd MMM yy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {log.is_collected ? format(new Date(log.collection_date), "dd MMM yy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.collection_date), "dd MMM yy")}
                      {log.collection_time && <span className="block text-[10px]">{log.collection_time}</span>}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{categoryEmoji[log.waste_category] || "⚪"} {log.waste_category}</span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{log.items_description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] capitalize">{log.waste_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{Number(log.quantity)} {log.unit}</TableCell>
                    <TableCell className="text-sm">{log.disposed_by || "—"}</TableCell>
                    <TableCell className="text-sm">{log.collected_by || "—"}</TableCell>
                    <TableCell className="text-sm">{log.collected_by_person || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.manifest_number || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={log.is_collected ? "default" : "destructive"} className="text-[10px]">
                        {log.is_collected ? "Collected" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal size={14} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(log)}>
                            <Pencil size={12} className="mr-2" /> Edit
                          </DropdownMenuItem>
                          {!log.is_collected && (
                            <DropdownMenuItem onClick={() => markCollected.mutate(log.id)}>
                              <CheckCircle size={12} className="mr-2" /> Mark Collected
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(log.id)}>
                            <Trash2 size={12} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      {isLoading ? "Loading..." : "No waste logs yet. Click 'Log Waste' to start."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WasteManagement;
