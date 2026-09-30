import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ShieldCheck,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ThermometerSun,
  Filter,
  CalendarIcon,
  Download,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { useClinicMasters } from "@/hooks/useClinicMasters";

const methods = [
  { value: "autoclave", label: "Autoclave" },
  { value: "chemical", label: "Chemical" },
  { value: "dry_heat", label: "Dry Heat" },
  { value: "uv", label: "UV Sterilization" },
];

const DEFAULT_INSTRUMENT_KITS = [
  "Extraction Kit",
  "Restoration Kit",
  "Endodontic Kit",
  "Scaling Kit",
  "Surgical Kit",
  "Orthodontic Kit",
  "Impression Kit",
  "Examination Kit",
];

const AUTOCLAVE_MACHINE_TYPES = ["B Class", "Cooker Type"] as const;

const ADD_ASSISTANT_VALUE = "__add_assistant__";
const MANAGE_ASSISTANTS_VALUE = "__manage_assistants__";

const getDefaultForm = () => ({
  instrument_name: "",
  sterilization_method: "autoclave",
  cycle_number: "1",
  performed_by: "",
  duration_minutes: "30",
  temperature: "134°C",
  pressure: "30 PSI",
  result: "pass",
  batch_id: "",
  notes: "",
  machine_type: "B Class",
  performed_date: new Date() as Date | undefined,
  performed_time: format(new Date(), "HH:mm"),
});


const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const Sterilization = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterAssistant, setFilterAssistant] = useState("all");
  const [editingLog, setEditingLog] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAddAssistant, setShowAddAssistant] = useState(false);
  const [showManageAssistants, setShowManageAssistants] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [form, setForm] = useState(getDefaultForm());
  const queryClient = useQueryClient();

  const resetForm = () => {
    setForm(getDefaultForm());
    setEditingLog(null);
  };

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["sterilization-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sterilization_logs")
        .select("*")
        .order("performed_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: assistants = [] } = useQuery({
    queryKey: ["dental-assistants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dental_assistants")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  const { data: employeeAssistants = [] } = useQuery({
    queryKey: ["employee-assistants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, designation, status")
        .eq("status", "active");

      if (error) throw error;

      const isPlaceholder = (v?: string | null) =>
        !v || ["—", "-", "_", "--", "n/a", "na"].includes(v.trim().toLowerCase());

      return (data || [])
        .filter((employee) => employee.designation?.toLowerCase().includes("assistant"))
        .map((employee) => ({
          id: employee.id,
          name: [employee.first_name, isPlaceholder(employee.last_name) ? "" : employee.last_name]
            .filter(Boolean)
            .join(" ")
            .trim(),
        }))
        .filter((employee) => employee.name);
    },
  });

  // Dropdown is driven by live Settings → Staff (assistant roles). No legacy / no duplicates.
  const { assistantOptions: staffAssistantOptions } = useClinicMasters();

  const assistantOptions = useMemo(() => {
    const uniqueNames = new Map<string, string>();
    staffAssistantOptions.forEach((opt) => {
      const trimmed = opt.label.trim();
      if (trimmed) uniqueNames.set(normalizeName(trimmed), trimmed);
    });
    // Preserve current-edit value so editing an old log doesn't blank out
    if (form.performed_by?.trim() && !uniqueNames.has(normalizeName(form.performed_by))) {
      uniqueNames.set(normalizeName(form.performed_by), form.performed_by.trim());
    }
    return Array.from(uniqueNames.values()).sort((a, b) => a.localeCompare(b));
  }, [staffAssistantOptions, form.performed_by]);
  const instrumentKitOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_INSTRUMENT_KITS);
    logs.forEach((l: any) => {
      const n = (l.instrument_name || "").trim();
      if (n) set.add(n);
    });
    if (form.instrument_name?.trim()) set.add(form.instrument_name.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [logs, form.instrument_name]);


  // Filter dropdown: only live Settings → Staff assistants
  const masterAssistantOptions = useMemo(() => {
    const uniqueNames = new Map<string, string>();
    staffAssistantOptions.forEach((opt) => {
      const t = opt.label.trim();
      if (t) uniqueNames.set(normalizeName(t), t);
    });
    return Array.from(uniqueNames.values()).sort((a, b) => a.localeCompare(b));
  }, [staffAssistantOptions]);

  const isJwtExpired = (err: any) =>
    /jwt expired|invalid jwt|token.*expired/i.test(err?.message || "") || err?.code === "PGRST301";

  const addAssistant = useMutation({
    mutationFn: async (name: string) => {
      let { error } = await supabase.from("dental_assistants").insert({ name });
      if (error && isJwtExpired(error)) {
        await supabase.auth.refreshSession();
        ({ error } = await supabase.from("dental_assistants").insert({ name }));
      }
      if (error) throw error;
    },
    onSuccess: (_, name) => {
      toast.success("Assistant added");
      queryClient.invalidateQueries({ queryKey: ["dental-assistants"] });
      setForm((prev) => ({ ...prev, performed_by: name }));
      setNewAssistantName("");
      setShowAddAssistant(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAssistant = useMutation({
    mutationFn: async (assistant: { id: string; name: string }) => {
      let { error } = await supabase.from("dental_assistants").delete().eq("id", assistant.id);
      if (error && isJwtExpired(error)) {
        await supabase.auth.refreshSession();
        ({ error } = await supabase.from("dental_assistants").delete().eq("id", assistant.id));
      }
      if (error) throw error;
      return assistant;
    },
    onSuccess: (assistant) => {
      toast.success("Assistant deleted");
      queryClient.invalidateQueries({ queryKey: ["dental-assistants"] });
      if (normalizeName(form.performed_by) === normalizeName(assistant.name)) {
        setForm((prev) => ({ ...prev, performed_by: "" }));
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const buildPerformedAt = () => {
    const baseDate = form.performed_date ?? new Date();
    const [hh, mm] = (form.performed_time || format(new Date(), "HH:mm")).split(":");
    const local = new Date(baseDate);
    local.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
    return local.toISOString();
  };

  const composeNotes = () => {
    const base = form.notes?.trim() || "";
    if (form.sterilization_method === "autoclave" && form.machine_type) {
      return `[Machine: ${form.machine_type}]${base ? " " + base : ""}`;
    }
    return base || null;
  };

  const addLog = useMutation({
    mutationFn: async () => {
      const performed_at = buildPerformedAt();

      const { error } = await supabase.from("sterilization_logs").insert({
        instrument_name: form.instrument_name,
        sterilization_method: form.sterilization_method,
        cycle_number: Number(form.cycle_number) || 1,
        performed_by: form.performed_by,
        duration_minutes: Number(form.duration_minutes) || 30,
        temperature: form.temperature || null,
        pressure: form.pressure || null,
        result: form.result,
        batch_id: form.batch_id,
        notes: composeNotes(),
        performed_at,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sterilization log added");
      queryClient.invalidateQueries({ queryKey: ["sterilization-logs"] });
      setShowAdd(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateLog = useMutation({
    mutationFn: async () => {
      if (!editingLog) return;

      const performed_at = buildPerformedAt();

      const { error } = await supabase
        .from("sterilization_logs")
        .update({
          instrument_name: form.instrument_name,
          sterilization_method: form.sterilization_method,
          cycle_number: Number(form.cycle_number) || 1,
          performed_by: form.performed_by,
          duration_minutes: Number(form.duration_minutes) || 30,
          temperature: form.temperature || null,
          pressure: form.pressure || null,
          result: form.result,
          batch_id: form.batch_id,
          notes: composeNotes(),
          performed_at,
        })
        .eq("id", editingLog.id);


      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Log updated");
      queryClient.invalidateQueries({ queryKey: ["sterilization-logs"] });
      setShowAdd(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sterilization_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Log deleted");
      queryClient.invalidateQueries({ queryKey: ["sterilization-logs"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleEdit = (log: any) => {
    const performedDate = new Date(log.performed_at);
    const notesRaw: string = log.notes || "";
    const machineMatch = notesRaw.match(/^\[Machine:\s*(B Class|Cooker Type)\]\s*/i);
    const machineType = machineMatch ? machineMatch[1] : "B Class";
    const cleanNotes = machineMatch ? notesRaw.replace(machineMatch[0], "") : notesRaw;

    setForm({
      instrument_name: log.instrument_name,
      sterilization_method: log.sterilization_method,
      cycle_number: String(log.cycle_number),
      performed_by: log.performed_by,
      duration_minutes: String(log.duration_minutes),
      temperature: log.temperature || "",
      pressure: log.pressure || "",
      result: log.result,
      batch_id: log.batch_id || "",
      notes: cleanNotes,
      machine_type: machineType,
      performed_date: performedDate,
      performed_time: format(performedDate, "HH:mm"),
    });

    setEditingLog(log);
    setShowAdd(true);
  };


  const handleAssistantSelect = (value: string) => {
    if (value === ADD_ASSISTANT_VALUE) {
      setShowAddAssistant(true);
      return;
    }

    if (value === MANAGE_ASSISTANTS_VALUE) {
      setShowManageAssistants(true);
      return;
    }

    setForm((prev) => ({ ...prev, performed_by: value }));
  };

  const handleAddAssistant = () => {
    const trimmedName = newAssistantName.trim();
    if (!trimmedName) return;

    const existingName = assistantOptions.find((name) => normalizeName(name) === normalizeName(trimmedName));
    if (existingName) {
      setForm((prev) => ({ ...prev, performed_by: existingName }));
      setNewAssistantName("");
      setShowAddAssistant(false);
      toast.success("Assistant selected");
      return;
    }

    addAssistant.mutate(trimmedName);
  };

  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useDateRangeFilter("all");

  const dateFiltered = logs.filter((log: any) => {
    if (!range.from || !range.to) return true;
    const d = new Date(log.performed_at);
    return d >= range.from && d <= range.to;
  });

  const totalCycles = dateFiltered.length;
  const passCount = dateFiltered.filter((log: any) => log.result === "pass").length;
  const failCount = dateFiltered.filter((log: any) => log.result === "fail").length;
  const totalMinutes = dateFiltered.reduce((sum: number, log: any) => sum + (Number(log.duration_minutes) || 0), 0);
  const totalDuration = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;

  const filtered = dateFiltered.filter((log: any) => {
    const matchSearch =
      log.instrument_name.toLowerCase().includes(search.toLowerCase()) ||
      log.performed_by.toLowerCase().includes(search.toLowerCase());
    const matchMethod = filterMethod === "all" || log.sterilization_method === filterMethod;
    const matchAssistant =
      filterAssistant === "all" || normalizeName(log.performed_by || "") === normalizeName(filterAssistant);
    return matchSearch && matchMethod && matchAssistant;
  });

  const assistantStats = (() => {
    if (filterAssistant === "all") return null;
    const mins = filtered.reduce((s: number, l: any) => s + (Number(l.duration_minutes) || 0), 0);
    return {
      cycles: filtered.length,
      duration: `${Math.floor(mins / 60)}h ${mins % 60}m`,
      pass: filtered.filter((l: any) => l.result === "pass").length,
      fail: filtered.filter((l: any) => l.result === "fail").length,
    };
  })();

  const exportToExcel = () => {
    if (filtered.length === 0) return toast.error("No data to export");

    const rows = filtered.map((log: any) => ({
      "Date & Time": format(new Date(log.performed_at), "dd MMM yyyy, hh:mm a"),
      Instrument: log.instrument_name,
      Method: log.sterilization_method?.replace("_", " "),
      "Performed By": log.performed_by,
      "Cycle #": log.cycle_number,
      "Duration (min)": log.duration_minutes,
      Temperature: log.temperature || "-",
      Pressure: log.pressure || "-",
      Result: log.result === "pass" ? "Pass" : "Fail",
      "Batch ID": log.batch_id || "-",
      Notes: log.notes || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sterilization Logs");
    XLSX.writeFile(wb, `Sterilization_Logs_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel downloaded");
  };

  const exportToPDF = async () => {
    if (filtered.length === 0) return toast.error("No data to export");

    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = await addClinicPdfHeader(doc, branding);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Sterilization Management Report", 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 14, startY + 6);

    const rows = filtered.map((log: any) => [
      format(new Date(log.performed_at), "dd MMM yy, hh:mm a"),
      log.instrument_name,
      log.sterilization_method?.replace("_", " "),
      log.performed_by,
      log.cycle_number,
      `${log.duration_minutes} min`,
      `${log.temperature || "-"} / ${log.pressure || "-"}`,
      log.result === "pass" ? "Pass" : "Fail",
    ]);

    autoTable(doc, {
      head: [["Date & Time", "Instrument", "Method", "Performed By", "Cycle", "Duration", "Temp/Pressure", "Result"]],
      body: rows,
      startY: startY + 12,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95] },
      margin: { bottom: 30 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });

    doc.save(`Sterilization_Logs_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold font-display">
            <ShieldCheck className="text-success" size={24} /> Sterilization Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Track instrument sterilization cycles & compliance</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <SmartDateFilter
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            hideAll={false}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Download size={14} /> Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="end">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={exportToExcel}>
                <FileSpreadsheet size={14} /> Excel
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={exportToPDF}>
                <FileText size={14} /> PDF
              </Button>
            </PopoverContent>
          </Popover>

          <Dialog
            open={showAdd}
            onOpenChange={(open) => {
              setShowAdd(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-1">
                <Plus size={14} /> Log Sterilization
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingLog ? "Edit Sterilization Log" : "Log Sterilization Cycle"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.performed_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.performed_date ? format(form.performed_date, "dd MMM yyyy") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.performed_date}
                          onSelect={(date) => setForm((prev) => ({ ...prev, performed_date: date || new Date() }))}
                          initialFocus
                          className="pointer-events-auto p-3"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label>Time</Label>
                    {(() => {
                      const [hStr = "12", mStr = "00"] = (form.performed_time || "12:00").split(":");
                      const h24 = Number(hStr) || 0;
                      const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
                      const h12 = ((h24 + 11) % 12) + 1;
                      const setTime = (hour12: number, minute: number, p: "AM" | "PM") => {
                        let h = hour12 % 12;
                        if (p === "PM") h += 12;
                        setForm((prev) => ({
                          ...prev,
                          performed_time: `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
                        }));
                      };
                      return (
                        <div className="flex gap-1">
                          <Select
                            value={String(h12)}
                            onValueChange={(v) => setTime(Number(v), Number(mStr), period)}
                          >
                            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-60">
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                                <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={String(Number(mStr))}
                            onValueChange={(v) => setTime(h12, Number(v), period)}
                          >
                            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-60">
                              {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                                <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={period}
                            onValueChange={(v) => setTime(h12, Number(mStr), v as "AM" | "PM")}
                          >
                            <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AM">AM</SelectItem>
                              <SelectItem value="PM">PM</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Instrument / Kit</Label>
                    <Select
                      value={form.instrument_name || undefined}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, instrument_name: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select instrument kit" />
                      </SelectTrigger>
                      <SelectContent>
                        {instrumentKitOptions.map((kit) => (
                          <SelectItem key={kit} value={kit}>
                            {kit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>
                      Batch ID <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={form.batch_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, batch_id: e.target.value }))}
                      placeholder="e.g. BATCH-001"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Method</Label>
                    <Select value={form.sterilization_method} onValueChange={(value) => setForm((prev) => ({ ...prev, sterilization_method: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {methods.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Performed By</Label>
                    <Select value={form.performed_by || undefined} onValueChange={handleAssistantSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assistant" />
                      </SelectTrigger>
                      <SelectContent>
                        {assistantOptions.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                        <SelectItem value={ADD_ASSISTANT_VALUE}>+ Add assistant</SelectItem>
                        <SelectItem value={MANAGE_ASSISTANTS_VALUE}>Manage assistants</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.sterilization_method === "autoclave" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Machine Type</Label>
                      <Select
                        value={form.machine_type}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, machine_type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTOCLAVE_MACHINE_TYPES.map((mt) => (
                            <SelectItem key={mt} value={mt}>
                              {mt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}


                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Cycle #</Label>
                    <Input
                      type="number"
                      value={form.cycle_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, cycle_number: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Duration (min)</Label>
                    <Input
                      type="number"
                      value={form.duration_minutes}
                      onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Result</Label>
                    <Select value={form.result} onValueChange={(value) => setForm((prev) => ({ ...prev, result: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">✅ Pass</SelectItem>
                        <SelectItem value="fail">❌ Fail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Temperature</Label>
                    <Input
                      value={form.temperature}
                      onChange={(e) => setForm((prev) => ({ ...prev, temperature: e.target.value }))}
                      placeholder="e.g. 134°C"
                    />
                  </div>
                  <div>
                    <Label>Pressure</Label>
                    <Input
                      value={form.pressure}
                      onChange={(e) => setForm((prev) => ({ ...prev, pressure: e.target.value }))}
                      placeholder="e.g. 30 PSI"
                    />
                  </div>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => {
                    if (!form.batch_id.trim()) {
                      toast.error("Batch ID is required");
                      return;
                    }
                    editingLog ? updateLog.mutate() : addLog.mutate();
                  }}
                  disabled={!form.instrument_name || !form.performed_by || !form.batch_id.trim()}
                >
                  {editingLog ? "Update Log" : "Save Log"}
                </Button>

              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary">
              <Clock size={16} />
              <span className="text-xs text-muted-foreground">Total Cycles</span>
            </div>
            <p className="mt-1 text-2xl font-bold font-display">{totalCycles}</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle size={16} />
              <span className="text-xs text-muted-foreground">Passed</span>
            </div>
            <p className="mt-1 text-2xl font-bold font-display">{passCount}</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle size={16} />
              <span className="text-xs text-muted-foreground">Failed</span>
            </div>
            <p className="mt-1 text-2xl font-bold font-display">{failCount}</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-accent">
              <ThermometerSun size={16} />
              <span className="text-xs text-muted-foreground">Total Logs</span>
            </div>
            <p className="mt-1 text-2xl font-bold font-display">{logs.length}</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary">
              <Clock size={16} />
              <span className="text-xs text-muted-foreground">Total Duration</span>
            </div>
            <p className="mt-1 text-2xl font-bold font-display">{totalDuration}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search instrument or assistant..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterMethod} onValueChange={setFilterMethod}>
          <SelectTrigger className="w-[160px]">
            <Filter size={14} className="mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {methods.map((method) => (
              <SelectItem key={method.value} value={method.value}>
                {method.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAssistant} onValueChange={setFilterAssistant}>
          <SelectTrigger className="w-[200px]">
            <Filter size={14} className="mr-1" />
            <SelectValue placeholder="All Assistants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assistants</SelectItem>
            {masterAssistantOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assistantStats && (
        <Card className="shadow-card border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-6 p-4">
            <div>
              <span className="text-xs text-muted-foreground">Assistant</span>
              <p className="font-semibold">{filterAssistant}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Cycles</span>
              <p className="font-bold">{assistantStats.cycles}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Total Duration</span>
              <p className="font-bold text-primary">{assistantStats.duration}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Passed</span>
              <p className="font-bold text-success">{assistantStats.pass}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Failed</span>
              <p className="font-bold text-destructive">{assistantStats.fail}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead className="text-center">Cycle</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Temp / Pressure</TableHead>
                  <TableHead className="text-center">Result</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(log.performed_at), "dd MMM yy, hh:mm a")}
                    </TableCell>
                    <TableCell className="font-medium">{log.instrument_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {log.sterilization_method.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.performed_by}</TableCell>
                    <TableCell className="text-center">{log.cycle_number}</TableCell>
                    <TableCell>{log.duration_minutes} min</TableCell>
                    <TableCell className="text-xs">
                      {log.temperature} / {log.pressure}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={log.result === "pass" ? "default" : "destructive"} className="text-[10px]">
                        {log.result === "pass" ? "✅ Pass" : "❌ Fail"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(log)}>
                            <Pencil size={14} className="mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(log.id)}>
                            <Trash2 size={14} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      {isLoading ? "Loading..." : "No sterilization logs yet. Click 'Log Sterilization' to start."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddAssistant} onOpenChange={setShowAddAssistant}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Assistant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Assistant Name</Label>
              <Input
                value={newAssistantName}
                onChange={(e) => setNewAssistantName(e.target.value)}
                placeholder="Enter assistant name"
              />
            </div>
            <Button className="w-full" onClick={handleAddAssistant} disabled={!newAssistantName.trim() || addAssistant.isPending}>
              Add Assistant
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showManageAssistants} onOpenChange={setShowManageAssistants}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Assistants</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {assistants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom assistants added yet. Use “Add assistant” from the dropdown.</p>
            ) : (
              <div className="space-y-2">
                {assistants.map((assistant: any) => (
                  <div key={assistant.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm font-medium">{assistant.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteAssistant.mutate({ id: assistant.id, name: assistant.name })}
                      disabled={deleteAssistant.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sterilization Log?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteLog.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Sterilization;
