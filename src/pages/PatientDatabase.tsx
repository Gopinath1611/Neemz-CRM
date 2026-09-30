import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Search, Users, Filter, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Star, ArrowUpDown, ArrowUp, ArrowDown, SlidersHorizontal, FileText, FileType2, ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } from "@/lib/clinicBranding";
import { formatPatientCode } from "@/lib/patientCode";
import { displayOrDash, displayPhone } from "@/lib/utils";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { usePermissions } from "@/hooks/usePermissions";
import { stashCustomAudience } from "@/lib/whatsappAudience";

const normalizeSource = (raw?: string | null) =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+$/g, "")
    .replace(/-+/g, "-");

const prettySource = (key: string) =>
  key
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const sourceBadgeColor: Record<string, string> = {
  "walk-in": "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  "walk-in-patient": "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  meta: "bg-blue-500/15 text-blue-700 border-blue-200",
  "meta-ads": "bg-blue-500/15 text-blue-700 border-blue-200",
  google: "bg-red-500/15 text-red-700 border-red-200",
  "google-ads": "bg-red-500/15 text-red-700 border-red-200",
  referral: "bg-purple-500/15 text-purple-700 border-purple-200",
  "patient-reference": "bg-purple-500/15 text-purple-700 border-purple-200",
  instagram: "bg-pink-500/15 text-pink-700 border-pink-200",
  facebook: "bg-indigo-500/15 text-indigo-700 border-indigo-200",
  "facebook-ads": "bg-indigo-500/15 text-indigo-700 border-indigo-200",
  whatsapp: "bg-green-500/15 text-green-700 border-green-200",
  website: "bg-amber-500/15 text-amber-700 border-amber-200",
  phone: "bg-cyan-500/15 text-cyan-700 border-cyan-200",
  "phone-call": "bg-cyan-500/15 text-cyan-700 border-cyan-200",
  "ad-patient": "bg-sky-500/15 text-sky-700 border-sky-200",
  camp: "bg-teal-500/15 text-teal-700 border-teal-200",
  "camp-patient": "bg-teal-500/15 text-teal-700 border-teal-200",
};


const SAMPLE_DATA = [
  {
    registration_date: "2024-01-15",
    name: "Rajesh Kumar",
    phone: "9876543210",
    date_of_birth: "1990-05-15",
    age: 35,
    gender: "male",
    email: "rajesh@example.com",
    location: "Salem",
    district: "Salem",
    address: "123, Main Street",
    medical_notes: "No allergies",
    source: "walk-in",
  },
  {
    registration_date: "2024-02-20",
    name: "Priya Sharma",
    phone: "9876543211",
    date_of_birth: "1985-08-22",
    age: 40,
    gender: "female",
    email: "priya@example.com",
    location: "Attur",
    district: "Salem",
    address: "45, Park Road",
    medical_notes: "Diabetic",
    source: "meta",
  },
];

const TEMPLATE_COLUMNS = [
  "registration_date",
  "name",
  "phone",
  "date_of_birth",
  "age",
  "gender",
  "email",
  "location",
  "district",
  "address",
  "medical_notes",
  "source",
];

// Parse various date formats (Excel serial, dd/mm/yyyy, yyyy-mm-dd, Date object)
const parseImportDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    const d = new Date(`${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const PatientDatabase = () => {
  const perms = usePermissions("/patient-database");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [treatmentFilter, setTreatmentFilter] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [highTicketOnly, setHighTicketOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"lastVisit" | "nextVisit" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStage, setImportStage] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "xlsx" | "csv" | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const {
    preset: regDatePreset,
    setPreset: setRegDatePreset,
    customFrom: regDateFrom,
    setCustomFrom: setRegDateFrom,
    customTo: regDateTo,
    setCustomTo: setRegDateTo,
    range: regDateRange,
  } = useDateRangeFilter("month", "patient-database-reg-date-v2");

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patient-database"],
    queryFn: async () => {
      // Fetch ALL patients in batches of 1000 to bypass Supabase default row limit
      const PAGE = 1000;
      let patientsData: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("patients")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        patientsData = patientsData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Fetch ALL appointments in batches too — extended with date/status so we can
      // derive Next Visit (nearest upcoming confirmed appointment) without an extra query.
      let appointments: any[] = [];
      let aFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("appointments")
          .select("id, patient_id, source, doctor, appointment_date, start_time, status")
          .order("created_at", { ascending: false })
          .range(aFrom, aFrom + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        appointments = appointments.concat(data);
        if (data.length < PAGE) break;
        aFrom += PAGE;
      }

      const sourceMap: Record<string, string> = {};
      const doctorMap: Record<string, Set<string>> = {};
      appointments?.forEach((a) => {
        if (!sourceMap[a.patient_id]) {
          sourceMap[a.patient_id] = a.source || "walk-in";
        }
        const doc = String(a.doctor ?? "").trim();
        if (doc) {
          if (!doctorMap[a.patient_id]) doctorMap[a.patient_id] = new Set();
          doctorMap[a.patient_id].add(doc);
        }
      });

      // Fetch all treatment plan items to enable treatment-wise filtering
      let treatmentItems: any[] = [];
      let tFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("treatment_plan_items")
          .select("treatment_type, treatment_plans!inner ( patient_id )")
          .order("created_at", { ascending: false })
          .range(tFrom, tFrom + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        treatmentItems = treatmentItems.concat(data);
        if (data.length < PAGE) break;
        tFrom += PAGE;
      }

      const treatmentMap: Record<string, Set<string>> = {};
      treatmentItems?.forEach((it) => {
        const patientId = it.treatment_plans?.patient_id;
        if (!patientId || !it.treatment_type) return;
        if (!treatmentMap[patientId]) treatmentMap[patientId] = new Set();
        treatmentMap[patientId].add(it.treatment_type);
      });

      // Last Visit — latest completed Check-Out from patient_checkins
      let checkins: any[] = [];
      let cFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("patient_checkins")
          .select("patient_id, checkout_time")
          .not("checkout_time", "is", null)
          .order("checkout_time", { ascending: false })
          .range(cFrom, cFrom + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        checkins = checkins.concat(data);
        if (data.length < PAGE) break;
        cFrom += PAGE;
      }
      const lastVisitMap: Record<string, string> = {};
      checkins.forEach((c) => {
        if (!c.patient_id || !c.checkout_time) return;
        if (!lastVisitMap[c.patient_id]) lastVisitMap[c.patient_id] = c.checkout_time;
      });

      // Next Visit — nearest upcoming rescheduled appointment via appointment_reschedules
      const todayISO = new Date().toISOString().slice(0, 10);
      let reschedules: any[] = [];
      let rFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("appointment_reschedules")
          .select("new_date, appointments!inner ( patient_id )")
          .gte("new_date", todayISO)
          .order("new_date", { ascending: true })
          .range(rFrom, rFrom + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        reschedules = reschedules.concat(data);
        if (data.length < PAGE) break;
        rFrom += PAGE;
      }
      const nextRescheduleMap: Record<string, string> = {};
      reschedules.forEach((r: any) => {
        const pid = r.appointments?.patient_id;
        if (!pid || !r.new_date) return;
        if (!nextRescheduleMap[pid]) nextRescheduleMap[pid] = r.new_date;
      });

      // Fallback: nearest upcoming confirmed/scheduled appointment from the
      // appointments list already fetched above (no extra round-trip).
      const upcomingApptMap: Record<string, string> = {};
      appointments
        .filter((a) => {
          if (!a.appointment_date || a.appointment_date < todayISO) return false;
          const s = String(a.status || "").toLowerCase();
          return s === "confirmed" || s === "scheduled" || s === "booked" || s === "pending";
        })
        .sort((a, b) => {
          if (a.appointment_date !== b.appointment_date) {
            return a.appointment_date < b.appointment_date ? -1 : 1;
          }
          return String(a.start_time || "").localeCompare(String(b.start_time || ""));
        })
        .forEach((a) => {
          if (!upcomingApptMap[a.patient_id]) upcomingApptMap[a.patient_id] = a.appointment_date;
        });

      return (patientsData || []).map((p, idx) => ({
        ...p,
        source: normalizeSource(sourceMap[p.id]) || "walk-in",
        doctors: Array.from(doctorMap[p.id] || []),
        treatments: Array.from(treatmentMap[p.id] || []),
        last_visit: lastVisitMap[p.id] || null,
        next_visit: nextRescheduleMap[p.id] || upcomingApptMap[p.id] || null,
        serial: idx + 1,
      }));
    },
  });

  // Server-side count of unique patients whose registration date is within the selected range
  const { data: totalRegisteredPatients = 0 } = useQuery({
    queryKey: ["patient-registration-count", regDateRange.from?.toISOString(), regDateRange.to?.toISOString()],
    queryFn: async () => {
      let q = supabase.from("patients").select("id", { count: "exact", head: true });
      if (regDateRange.from) q = q.gte("created_at", regDateRange.from.toISOString());
      if (regDateRange.to) q = q.lte("created_at", regDateRange.to.toISOString());
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const filtered = useMemo(() => {
    let list = patients;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      list = list.filter((p) => {
        const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
        const phone = (p.phone ?? "").toLowerCase();
        const codeFormatted = formatPatientCode(p.patient_code).toLowerCase();
        const codeRaw = p.patient_code != null ? String(p.patient_code) : "";
        return (
          fullName.includes(q) ||
          phone.includes(q) ||
          (qDigits && phone.replace(/\D/g, "").includes(qDigits)) ||
          codeFormatted.includes(q) ||
          codeRaw.includes(q) ||
          (qDigits && codeRaw.includes(qDigits))
        );
      });
    }
    if (sourceFilter !== "all") {
      list = list.filter((p) => normalizeSource(p.source) === sourceFilter);
    }
    if (doctorFilter !== "all") {
      list = list.filter((p) => (p.doctors ?? []).includes(doctorFilter));
    }
    if (treatmentFilter !== "all") {
      list = list.filter((p) => p.treatments?.includes(treatmentFilter));
    }
    if (districtFilter !== "all") {
      list = list.filter((p) => (p.district || "").trim() === districtFilter);
    }
    if (locationFilter !== "all") {
      list = list.filter((p) => (p.location || "").trim() === locationFilter);
    }
    if (genderFilter !== "all") {
      list = list.filter((p) => (p.gender || "").trim().toLowerCase() === genderFilter);
    }
    if (highTicketOnly) {
      list = list.filter((p) => p.is_high_ticket === true);
    }
    if (regDateRange.from || regDateRange.to) {
      const fromTime = regDateRange.from ? regDateRange.from.getTime() : -Infinity;
      const toTime = regDateRange.to ? regDateRange.to.getTime() : Infinity;
      list = list.filter((p) => {
        const t = new Date(p.created_at).getTime();
        return t >= fromTime && t <= toTime;
      });
    }
    return list;
  }, [patients, search, sourceFilter, treatmentFilter, doctorFilter, districtFilter, locationFilter, genderFilter, highTicketOnly, regDateRange]);

  // Reset to page 1 when filters change
  useMemo(() => { setPage(1); }, [search, sourceFilter, treatmentFilter, doctorFilter, districtFilter, locationFilter, genderFilter, highTicketOnly, regDatePreset, regDateFrom, regDateTo, pageSize]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => {
      const v = normalizeSource(p.source);
      if (v) set.add(v);
    });
    return [
      { value: "all", label: "All Sources" },
      ...Array.from(set).sort().map((s) => ({ value: s, label: prettySource(s) })),
    ];
  }, [patients]);

  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => (p.doctors ?? []).forEach((d: string) => set.add(d)));
    return [
      { value: "all", label: "All Doctors" },
      ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((d) => ({ value: d, label: d })),
    ];
  }, [patients]);

  const treatmentOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => p.treatments?.forEach((t: string) => set.add(t)));
    return [{ value: "all", label: "All Treatments" }, ...Array.from(set).sort().map((t) => ({ value: t, label: t }))];
  }, [patients]);

  const districtOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => {
      const v = (p.district || "").trim();
      if (v) set.add(v);
    });
    return [{ value: "all", label: "All Districts" }, ...Array.from(set).sort().map((t) => ({ value: t, label: t }))];
  }, [patients]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => {
      const v = (p.location || "").trim();
      if (v) set.add(v);
    });
    return [{ value: "all", label: "All Locations" }, ...Array.from(set).sort().map((t) => ({ value: t, label: t }))];
  }, [patients]);

  const genderOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => {
      const v = (p.gender || "").trim().toLowerCase();
      if (v) set.add(v);
    });
    const ordered = ["male", "female", "other"].filter((g) => set.has(g));
    set.forEach((g) => { if (!ordered.includes(g)) ordered.push(g); });
    return [
      { value: "all", label: "All Genders" },
      ...ordered.map((g) => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) })),
    ];
  }, [patients]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const key = sortKey === "lastVisit" ? "last_visit" : "next_visit";
    const dirMul = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      // Empty values always sort to the bottom regardless of direction
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const at = new Date(av).getTime();
      const bt = new Date(bv).getTime();
      return (at - bt) * dirMul;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: "lastVisit" | "nextVisit") => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const secondaryFilterCount =
    (districtFilter !== "all" ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    (genderFilter !== "all" ? 1 : 0);

  const hasActiveFilters =
    !!search.trim() ||
    sourceFilter !== "all" ||
    treatmentFilter !== "all" ||
    doctorFilter !== "all" ||
    highTicketOnly ||
    secondaryFilterCount > 0;

  const summaryCount = hasActiveFilters ? filtered.length : totalRegisteredPatients;
  const summaryLabel = treatmentFilter !== "all"
    ? `Patients — ${treatmentFilter}`
    : doctorFilter !== "all"
      ? `Patients — ${doctorFilter}`
      : hasActiveFilters
        ? "Filtered Patients"
        : "Total Registered Patients";

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(startIdx, startIdx + pageSize);

  const calcAge = (dob: string | null) => {
    if (!dob) return "—";
    return differenceInYears(new Date(), new Date(dob));
  };

  // Download sample template
  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA, { header: TEMPLATE_COLUMNS });
    // Set column widths
    ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patient Template");
    XLSX.writeFile(wb, "patient_import_template.xlsx");
    toast.success("Sample template downloaded!");
  };

  // Build export rows from the currently filtered set (respects all active filters)
  const buildExportRows = () =>
    filtered.map((p, idx) => ({
      "S.No": idx + 1,
      "Reg. Date": format(new Date(p.created_at), "dd/MM/yyyy"),
      "Patient ID": formatPatientCode(p.patient_code),
      "Source": p.source,
      "First Name": p.first_name,
      "Last Name": p.last_name,
      "Treatment Type": (p.treatments || []).join(", "),
      "Mobile": p.phone || "",
      "Date of Birth": p.date_of_birth || "",
      "Age": calcAge(p.date_of_birth),
      "Gender": p.gender || "",
      "Email": p.email || "",
      "Location": p.location || "",
      "District": p.district || "",
      "Last Visit": p.last_visit ? format(new Date(p.last_visit), "dd/MM/yyyy") : "",
      "Next Visit": p.next_visit ? format(new Date(p.next_visit), "dd/MM/yyyy") : "",
      "Address": p.address || "",
      "Medical Notes": p.medical_notes || "",
    }));

  const requestExport = (fmt: "pdf" | "xlsx" | "csv") => {
    if (filtered.length === 0) {
      toast.error("No records match the current filters");
      return;
    }
    setExportFormat(fmt);
  };

  // Hand the currently filtered patients over to the WhatsApp campaign modal.
  const sendToWhatsAppCampaign = () => {
    const contacts = filtered
      .map((p: any) => ({
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        phone: p.phone || "",
      }))
      .filter((c) => c.phone);
    if (contacts.length === 0) {
      toast.error("No patients with a phone number in the current filters");
      return;
    }
    stashCustomAudience({
      label: `Patients (${contacts.length.toLocaleString()} selected)`,
      origin: "patient",
      contacts,
    });
    navigate("/automation-whatsapp");
  };

  const runExport = async () => {
    if (!exportFormat) return;
    setExporting(true);
    try {
      const rows = buildExportRows();
      const stamp = format(new Date(), "yyyy-MM-dd");

      if (exportFormat === "pdf") {
        const branding = await fetchClinicBranding();
        const doc = new jsPDF({ orientation: "landscape" });
        const startY = await addClinicPdfHeader(doc, branding);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Patient Database", 14, startY);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(
          `${rows.length} record(s)  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`,
          14,
          startY + 6,
        );
        doc.setTextColor(0);
        const cols = ["S.No", "Reg. Date", "Patient ID", "First Name", "Last Name", "Mobile", "Age", "Gender", "Location", "District", "Source"];
        autoTable(doc, {
          head: [cols],
          body: rows.map((r: any) => cols.map((c) => String(r[c] ?? ""))),
          startY: startY + 12,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 58, 95] },
          margin: { bottom: 24 },
          didDrawPage: () => addClinicPdfFooter(doc),
        });
        doc.save(`patient_database_${stamp}.pdf`);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
        if (exportFormat === "csv") {
          const csv = XLSX.utils.sheet_to_csv(ws);
          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `patient_database_${stamp}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Patient Database");
          XLSX.writeFile(wb, `patient_database_${stamp}.xlsx`);
        }
      }
      toast.success(`Exported ${rows.length} patient record(s)`);
      setExportFormat(null);
    } catch (err: any) {
      toast.error("Export failed: " + (err?.message || "unknown error"));
    } finally {
      setExporting(false);
    }
  };

  // Import from Excel
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      toast.error("Invalid file format. Please upload a .xlsx or .csv file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportProgress(5);
    setImportStage("Reading file…");

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      setImportProgress(20);
      setImportStage("Validating columns…");
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);

      if (rows.length === 0) {
        toast.error("The uploaded file is empty");
        setImporting(false);
        setImportProgress(0);
        return;
      }

      // Required header validation (Name and Mobile, in any accepted spelling)
      const headers = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
      const hasName = headers.some((h) => ["name", "patient name", "first name", "first_name"].includes(h));
      const hasMobile = headers.some((h) => ["mobile", "phone", "mobile number", "phone number"].includes(h));
      if (!hasName || !hasMobile) {
        const missing = [!hasName && "Name", !hasMobile && "Mobile"].filter(Boolean).join(", ");
        toast.error(`Import file is missing required column(s): ${missing}`);
        setImporting(false);
        setImportProgress(0);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      setImportProgress(35);
      setImportStage(`Processing ${rows.length} row(s)…`);


      let success = 0;
      const errors: string[] = [];

      // Parse all rows first with their registration_date
      type ParsedRow = { record: any; source: string; rowNum: number };
      const parsed: ParsedRow[] = [];

      rows.forEach((row, idx) => {
        const rowNum = idx + 2;

        // Support unified "name" column OR legacy first_name/last_name
        const fullName = String(row.name || row["Name"] || row["Patient Name"] || "").trim();
        let firstName = String(row.first_name || row["First Name"] || row["first name"] || "").trim();
        let lastName = String(row.last_name || row["Last Name"] || row["last name"] || "").trim();

        if (fullName && !firstName && !lastName) {
          const parts = fullName.split(/\s+/);
          firstName = parts[0];
          lastName = parts.slice(1).join(" ") || "";
        }

        if (!firstName) {
          errors.push(`Row ${rowNum}: Missing name`);
          return;
        }

        const regDateRaw =
          row.registration_date ||
          row["Registration Date"] ||
          row["registration date"] ||
          row["Reg. Date"] ||
          row["Reg Date"] ||
          row.reg_date;
        const regDate = parseImportDate(regDateRaw);
        const createdAt = regDate ? regDate.toISOString() : new Date().toISOString();

        const dobRaw = row.date_of_birth || row["Date of Birth"] || row["dob"];
        const dobParsed = parseImportDate(dobRaw);
        const dob = dobParsed ? dobParsed.toISOString().slice(0, 10) : null;

        const sourceTag = String(row.source || row["Source"] || "walk-in").trim().toLowerCase() || "walk-in";

        parsed.push({
          source: sourceTag,
          rowNum,
          record: {
            first_name: firstName,
            last_name: lastName,
            phone: String(row.phone || row["Mobile"] || row["mobile"] || "").trim() || null,
            date_of_birth: dob,
            gender: String(row.gender || row["Gender"] || "other").trim().toLowerCase() || "other",
            email: String(row.email || row["Email"] || "").trim() || null,
            location: String(row.location || row["Location"] || "").trim() || null,
            district: String(row.district || row["District"] || "").trim() || null,
            address: String(row.address || row["Address"] || "").trim() || null,
            medical_notes: String(row.medical_notes || row["Medical Notes"] || "").trim() || null,
            created_at: createdAt,
          },
        });
      });

      // Sort by created_at ascending so patient_code (auto-generated) follows date order
      parsed.sort(
        (a, b) =>
          new Date(a.record.created_at).getTime() - new Date(b.record.created_at).getTime(),
      );

      // Insert one-by-one to ensure patient_code increments in date order
      let done = 0;
      for (const item of parsed) {
        const { data: inserted, error } = await supabase
          .from("patients")
          .insert(item.record as any)
          .select("id")
          .single();
        if (error) {
          errors.push(`Row ${item.rowNum}: ${error.message}`);
        } else {
          // Create a placeholder appointment to carry the source tag (used by source map)
          if (inserted?.id && item.source && item.source !== "walk-in") {
            await supabase.from("appointments").insert({
              patient_id: inserted.id,
              appointment_date: item.record.created_at.slice(0, 10),
              start_time: "09:00",
              end_time: "09:30",
              status: "completed",
              type: "consultation",
              source: item.source,
            } as any);
          }
          success += 1;
        }
        done += 1;
        setImportProgress(35 + Math.round((done / parsed.length) * 60));
        setImportStage(`Importing ${done} of ${parsed.length} record(s)…`);
      }

      setImportProgress(100);
      setImportStage("Completed");
      setImportResult({ success, errors });
      if (success > 0) {
        queryClient.invalidateQueries({ queryKey: ["patient-database"] });
        toast.success(`${success} patients imported successfully!`);
      }
    } catch (err: any) {
      toast.error("Failed to read the import file: " + (err?.message || "invalid format"));
      setImportProgress(0);
    } finally {
      setImporting(false);
      setImportStage("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patient Database</h1>
          <p className="text-sm text-muted-foreground">
            Total: {patients.length.toLocaleString()} patients
            {filtered.length !== patients.length && ` · Showing ${filtered.length.toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {perms.canCreate && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload size={14} className="mr-1.5" /> Import
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={sendToWhatsAppCampaign} disabled={filtered.length === 0}>
            <MessageSquare size={14} className="mr-1.5 text-success" /> Send to WhatsApp Campaign
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download size={14} className="mr-1.5" /> Export
                <ChevronDown size={14} className="ml-1.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {filtered.length.toLocaleString()} filtered record(s)
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => requestExport("pdf")}>
                <FileText size={14} className="mr-2" /> Export to PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestExport("xlsx")}>
                <FileSpreadsheet size={14} className="mr-2" /> Export to Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestExport("csv")}>
                <FileType2 size={14} className="mr-2" /> Export to CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Export confirmation */}
      <Dialog open={exportFormat !== null} onOpenChange={(o) => !o && !exporting && setExportFormat(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download size={18} /> Confirm Export
            </DialogTitle>
            <DialogDescription>
              Exporting {filtered.length.toLocaleString()} filtered patient record
              {filtered.length === 1 ? "" : "s"} as{" "}
              <span className="font-medium text-foreground">
                {exportFormat === "pdf" ? "PDF" : exportFormat === "xlsx" ? "Excel (.xlsx)" : "CSV"}
              </span>
              . The file respects your active search and filter selections.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setExportFormat(null)} disabled={exporting}>
              Cancel
            </Button>
            <Button size="sm" onClick={runExport} disabled={exporting}>
              {exporting ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> Preparing…
                </>
              ) : (
                <>
                  <Download size={14} className="mr-1.5" /> Download
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={20} /> Import Patients from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file (.xlsx / .xls) with patient data. Download the sample template first to see the correct format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Sample Template Download */}
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <FileSpreadsheet size={24} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Sample Template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Download this template, fill in your patient data in the same format, then upload it below.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Columns:</span> registration_date, name, phone, date_of_birth, age, gender, email, location, district, address, medical_notes, source
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={downloadTemplate}>
                    <Download size={12} className="mr-1.5" /> Download Demo Template
                  </Button>
                </div>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Upload Excel / CSV File
              </label>
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImport}
                disabled={importing}
                className="cursor-pointer"
              />
              {importing && (
                <div className="mt-3 space-y-2 rounded-md border bg-muted/40 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Loader2 size={14} className="animate-spin text-primary" />
                    <span>{importStage || "Processing…"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2" />
                </div>
              )}
            </div>


            {/* Import Result */}
            {importResult && (
              <div className="space-y-2">
                {importResult.success > 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">
                    <CheckCircle2 size={16} />
                    <span>{importResult.success} patients imported successfully!</span>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                      <AlertCircle size={16} />
                      <span>{importResult.errors.length} error(s):</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-destructive/80">{err}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setImportOpen(false);
                  setImportResult(null);
                }}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setImportOpen(false);
                  setImportResult(null);
                  queryClient.invalidateQueries({ queryKey: ["patient-database"] });
                }}
                disabled={importing}
              >
                <CheckCircle2 size={14} className="mr-1.5" />
                {importResult ? "Done & View Patients" : "Close"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary card */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="rounded-full bg-primary/10 p-3">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{summaryLabel}</p>
            <p className="text-2xl font-bold leading-none tracking-tight">
              {summaryCount.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <div className="relative h-10 min-w-[240px] flex-1 self-start">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                placeholder="Search by name, phone or patient ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full pl-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={16} className="text-muted-foreground" />
              <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All Treatments" />
                </SelectTrigger>
                <SelectContent>
                  {treatmentOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All Doctors" />
                </SelectTrigger>
                <SelectContent>
                  {doctorOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 gap-1.5">
                    <SlidersHorizontal size={14} />
                    More Filters
                    {secondaryFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                        {secondaryFilterCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">More Filters</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setDistrictFilter("all");
                        setLocationFilter("all");
                        setGenderFilter("all");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">District</label>
                    <Select value={districtFilter} onValueChange={setDistrictFilter}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="All Districts" /></SelectTrigger>
                      <SelectContent>
                        {districtOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Location</label>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="All Locations" /></SelectTrigger>
                      <SelectContent>
                        {locationOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Gender</label>
                    <Select value={genderFilter} onValueChange={setGenderFilter}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="All Genders" /></SelectTrigger>
                      <SelectContent>
                        {genderOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                variant={highTicketOnly ? "default" : "outline"}
                size="sm"
                className={`gap-1.5 h-10 ${highTicketOnly ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : "border-amber-500/40 text-amber-600 hover:bg-amber-50"}`}
                onClick={() => setHighTicketOnly((v) => !v)}
              >
              <Star size={14} className={highTicketOnly ? "fill-current" : ""} />
                High Ticket
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pt-3 border-t mt-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Registration Date:</span>
            <DateRangeFilter
              preset={regDatePreset}
              onPresetChange={setRegDatePreset}
              customFrom={regDateFrom}
              customTo={regDateTo}
              onCustomFromChange={setRegDateFrom}
              onCustomToChange={setRegDateTo}
              hideAll={true}
              hideTomorrow={true}
              showYesterday={false}
              showYear={true}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading patients...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Users size={32} />
              <p>No patients found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">S.No</TableHead>
                    <TableHead>Reg. Date</TableHead>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Source Tag</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Treatment Type</TableHead>

                    <TableHead>Age</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("lastVisit")}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Last Visit
                        {sortKey === "lastVisit" ? (
                          sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-50" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("nextVisit")}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Next Visit
                        {sortKey === "nextVisit" ? (
                          sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-50" />
                        )}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((p, idx) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {startIdx + idx + 1}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(p.created_at), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => navigate(`/clinic-workflow/${p.id}`)}
                          className="font-mono text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          {formatPatientCode(p.patient_code)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize ${sourceBadgeColor[p.source] || "bg-muted text-muted-foreground"}`}
                        >
                          {prettySource(p.source)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{p.first_name} {p.last_name}</span>
                          {p.is_high_ticket && (
                            <Star size={12} className="fill-amber-500 text-amber-500" aria-label="High Ticket" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const shown = displayPhone(p.phone, p.phone_country_code);
                          const digits = String(p.phone ?? "").replace(/\D/g, "");
                          const invalid = !!p.phone && digits.length < 10;
                          return (
                            <span
                              className={invalid ? "text-destructive" : undefined}
                              title={invalid ? "Incomplete phone number on record" : String(p.phone ?? "")}
                            >
                              {shown}
                              {invalid && " ⚠"}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.treatments && p.treatments.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
                            {p.treatments.slice(0, 2).map((t: string, i: number) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px] font-normal whitespace-nowrap"
                                title={t}
                              >
                                {t.length > 18 ? `${t.slice(0, 18)}…` : t}
                              </Badge>
                            ))}
                            {p.treatments.length > 2 && (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap cursor-default underline decoration-dotted">
                                      +{p.treatments.length - 2} more
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[260px]">
                                    <ul className="space-y-0.5 text-xs">
                                      {p.treatments.slice(2).map((t: string, i: number) => (
                                        <li key={i}>• {t}</li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell className="text-sm">
                        {calcAge(p.date_of_birth)}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {displayOrDash(p.gender)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {displayOrDash(p.location)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {displayOrDash(p.district)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.last_visit ? format(new Date(p.last_visit), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.next_visit ? format(new Date(p.next_visit), "dd/MM/yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination footer */}
          {!isLoading && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100, 200].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground ml-2">
                  {startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} of {filtered.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(1)}>« First</Button>
                <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹ Prev</Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p = i + 1;
                  if (totalPages > 5) {
                    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                    p = start + i;
                  }
                  return (
                    <Button key={p} size="sm" variant={p === currentPage ? "default" : "outline"} onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  );
                })}
                <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next ›</Button>
                <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Last »</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientDatabase;
