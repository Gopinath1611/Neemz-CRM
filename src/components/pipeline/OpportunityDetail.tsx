import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Mail, MapPin, Calendar, Clock, MessageSquare, MessageCircle, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Save, Plus, CalendarCheck, UserCheck, StickyNote, RefreshCw, Stethoscope, X, Check, History, User as UserIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { timeSlots, typeLabels } from "@/pages/Appointments";
import { format } from "date-fns";
import { formatPatientCode } from "@/lib/patientCode";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LeadWhatsAppChat } from "@/components/pipeline/LeadWhatsAppChat";
import { LeadOwnerSelect } from "@/components/pipeline/LeadOwnerSelect";
import { LeadActivityLog } from "@/components/pipeline/LeadActivityLog";
import { useCurrentCrmUser, initialsOf } from "@/hooks/useCrmUsers";
import { logLeadActivity, ownerPatchForAction, auditPatch, type ActivityEntry } from "@/lib/leadAudit";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";
import { useAuth } from "@/contexts/AuthContext";




const allStages = [
  { value: "new_lead", label: "New Lead", color: "bg-primary" },
  { value: "interested", label: "Interested", color: "bg-info" },
  { value: "callback", label: "Callback", color: "bg-warning" },
  { value: "not_reachable", label: "Not Reachable", color: "bg-muted-foreground" },
  { value: "not_clicking", label: "Not Clicking", color: "bg-muted-foreground" },
  { value: "partially_looking", label: "Partially Looking", color: "bg-info" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive" },
  { value: "consultation_booked", label: "Appointment Booked", color: "bg-warning" },
  { value: "reschedule", label: "Reschedule", color: "bg-warning" },
  { value: "contacted", label: "Contacted", color: "bg-info" },
  { value: "diagnosed", label: "Diagnosed", color: "bg-accent" },
  { value: "treatment_started", label: "Treatment Started", color: "bg-accent" },
  { value: "treatment_completed", label: "Treatment Done", color: "bg-success" },
  { value: "lost", label: "Lost", color: "bg-destructive" },
];

const leadTemperatures = [
  { value: "hot", label: "🔥 Hot Lead", color: "bg-destructive/10 text-destructive border-destructive/20" },
  { value: "warm", label: "☀️ Warm Lead", color: "bg-warning/10 text-warning border-warning/20" },
  { value: "cold", label: "❄️ Cold Lead", color: "bg-info/10 text-info border-info/20" },
  { value: "won", label: "✅ Won", color: "bg-success/10 text-success border-success/20" },
  { value: "lost", label: "❌ Lost", color: "bg-destructive/10 text-destructive border-destructive/20" },
];

const mockCallLogs = [
  { id: "1", type: "outgoing", duration: "2:30", date: "2026-03-07 10:30 AM", notes: "Discussed treatment options", agent: "Priya" },
  { id: "2", type: "incoming", duration: "1:15", date: "2026-03-06 03:45 PM", notes: "Patient called for pricing", agent: "Ravi" },
  { id: "3", type: "missed", duration: "0:00", date: "2026-03-05 11:00 AM", notes: "No answer", agent: "Priya" },
];

const callTypeIcons: Record<string, any> = { outgoing: PhoneOutgoing, incoming: PhoneIncoming, missed: PhoneMissed };
const callTypeColors: Record<string, string> = { outgoing: "text-primary", incoming: "text-success", missed: "text-destructive" };



interface FollowUp {
  id: string;
  date: string;
  note: string;
  status: "pending" | "done";
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
}

interface NoteEntry {
  id: string;
  date: string;
  text: string;
  author?: string | null;
}


interface OpportunityDetailProps {
  lead: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated?: () => void;
}

export const OpportunityDetail = ({ lead, open, onOpenChange, onLeadUpdated }: OpportunityDetailProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState("");
  const [editingCity, setEditingCity] = useState("");
  const [editingStatus, setEditingStatus] = useState("new_lead");
  const [editingPriority, setEditingPriority] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [showWhatsAppChat, setShowWhatsAppChat] = useState(false);
  const [baseline, setBaseline] = useState({ notes: "", city: "", status: "new_lead", priority: "medium", treatments: "" });
  // Last values actually persisted for this lead. Audit entries compare against
  // this (not the stale `lead` prop), so a second save without further edits
  // never logs the same stage/status change twice.
  const savedRef = useRef({
    notes: "", city: "", status: "new_lead", priority: "medium", treatments: "",
    assignedToId: null as string | null, assignedToName: null as string | null,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingBookedStage, setPendingBookedStage] = useState<string | null>(null);
  const currentUser = useCurrentCrmUser();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");


  // Ownership / attribution state
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const bumpActivity = () => setActivityKey((k) => k + 1);

  // Follow-ups state
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [newFollowUpDate, setNewFollowUpDate] = useState("");
  const [newFollowUpNote, setNewFollowUpNote] = useState("");

  // Notes state
  const [notesList, setNotesList] = useState<NoteEntry[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Call logs state
  const [callLogs, setCallLogs] = useState<any[]>([]);


  // Appointments state
  const [appointments, setAppointments] = useState<any[]>([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingData, setBookingData] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "09:30",
    type: "",
    doctor: "",
    notes: "",
  });
  const [dayAppointments, setDayAppointments] = useState<any[]>([]);
  const [loadingDayAppts, setLoadingDayAppts] = useState(false);
  const { doctorOptions, treatmentOptions } = useClinicMasters();

  useEffect(() => {
    if (lead) {
      setShowWhatsAppChat(false);
      setConfirmDiscard(false);
      setEditingNotes(lead.notes || "");

      setEditingCity(lead.city || "");
      setEditingStatus(lead.status || "new_lead");
      setEditingPriority(lead.ai_priority || "medium");
      setOwnerId(lead.assigned_to_id || null);
      setOwnerName(lead.assigned_to_name || null);
      const treatments = (lead.treatment_interest || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      setSelectedTreatments(treatments.length > 0 ? treatments : []);
      setBaseline({
        notes: lead.notes || "",
        city: lead.city || "",
        status: lead.status || "new_lead",
        priority: lead.ai_priority || "medium",
        treatments: treatments.join(", "),
      });
      savedRef.current = {
        notes: lead.notes || "",
        city: lead.city || "",
        status: lead.status || "new_lead",
        priority: lead.ai_priority || "medium",
        treatments: treatments.join(", "),
        assignedToId: lead.assigned_to_id || null,
        assignedToName: lead.assigned_to_name || null,
      };
      loadFollowUps();
      loadNotes();
      loadCallLogs();
      bumpActivity();
      // Load appointments linked to this lead's phone
      loadAppointments();
    }
  }, [lead]);

  const loadCallLogs = async () => {
    if (!lead?.id) return;
    const { data } = await supabase
      .from("call_logs")
      .select("*")
      .eq("lead_id", lead.id)
      .order("started_at", { ascending: false });
    const rows = data || [];
    const ids = [...new Set(rows.map((r: any) => r.telecaller_id).filter(Boolean))];
    let nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids as string[]);
      (profs || []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
    }
    setCallLogs(rows.map((r: any) => ({ ...r, telecaller_name: nameMap[r.telecaller_id] || null })));
  };

  const recordLiveCall = async () => {
    if (!lead?.phone) return;
    const startedAt = new Date().toISOString();
    const { error } = await supabase.from("call_logs").insert({
      lead_id: lead.id,
      telecaller_id: currentUser.id,
      phone: lead.phone,
      call_type: "outgoing",
      status: "initiated",
      source: "crm_click_to_call",
      started_at: startedAt,
      notes: "Click-to-call from Lead Detail",
    } as any);
    if (error) {
      toast({ title: "Could not log call", description: error.message, variant: "destructive" });
    } else {
      const owner = ownerPatchForAction(lead, currentUser);
      if (Object.keys(owner).length > 0) {
        await supabase.from("leads").update({ ...owner, ...auditPatch(currentUser) } as any).eq("id", lead.id);
        setOwnerId(currentUser.id);
        setOwnerName(currentUser.name);
        onLeadUpdated?.();
      }
      await logLeadActivity(
        { leadId: lead.id, action: "call_logged", description: `Call placed to ${lead.phone}` },
        currentUser,
      );
      loadCallLogs();
      bumpActivity();
    }

    window.location.href = `tel:${lead.phone.replace(/\s+/g, "")}`;
  };




  useEffect(() => {
    setBookingData((prev) => ({
      ...prev,
      doctor: doctorOptions.some((option) => option.value === prev.doctor)
        ? prev.doctor
        : (doctorOptions[0]?.value ?? ""),
      type: treatmentOptions.some((option) => option.value === prev.type)
        ? prev.type
        : (treatmentOptions[0]?.value ?? ""),
    }));
  }, [doctorOptions, treatmentOptions]);

  // Fetch day appointments when booking date changes
  const fetchDayAppointments = async (dateStr: string) => {
    setLoadingDayAppts(true);
    const { data } = await supabase
      .from("appointments")
      .select("id, appointment_date, start_time, end_time, doctor, type, status, patient_id")
      .eq("appointment_date", dateStr)
      .order("start_time", { ascending: true });

    if (data && data.length > 0) {
      const patientIds = [...new Set(data.map(a => a.patient_id))];
      const { data: patients } = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .in("id", patientIds);
      const pMap: Record<string, string> = {};
      (patients || []).forEach(p => { pMap[p.id] = `${p.first_name} ${p.last_name}`; });
      setDayAppointments(data.map(a => ({ ...a, patient_name: pMap[a.patient_id] || "Unknown" })));
    } else {
      setDayAppointments([]);
    }
    setLoadingDayAppts(false);
  };

  useEffect(() => {
    if (showBookingForm && bookingData.date) {
      fetchDayAppointments(bookingData.date);
    }
  }, [bookingData.date, showBookingForm]);


  const loadAppointments = async () => {
    if (!lead?.phone) return;
    // Find patient by phone matching the lead
    const { data: patients } = await supabase
      .from("patients")
      .select("id")
      .eq("phone", lead.phone);
    if (patients && patients.length > 0) {
      const patientIds = patients.map(p => p.id);
      const { data: apts } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name, patient_code)")
        .in("patient_id", patientIds)
        .order("appointment_date", { ascending: false });
      setAppointments(apts || []);
    } else {
      setAppointments([]);
    }
  };

  const loadNotes = async () => {
    if (!lead?.id) return;
    const { data } = await supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });
    setNotesList((data || []).map((n: any) => ({
      id: n.id,
      date: format(new Date(n.created_at), "dd MMM yyyy, hh:mm a"),
      text: n.note,
      author: n.created_by_name,
    })));
  };

  const loadFollowUps = async () => {
    if (!lead?.id) return;
    const { data } = await supabase
      .from("follow_ups")
      .select("*")
      .eq("lead_id", lead.id)
      .order("due_date", { ascending: false });
    if (data) {
      setFollowUps(data.map((f: any) => ({
        id: f.id,
        date: f.due_date,
        note: f.note || "",
        status: f.status as "pending" | "done",
        createdBy: f.created_by,
        createdAt: f.created_at,
        updatedBy: f.updated_by_name,
      })));

    }
  };

  // Sends the same WhatsApp booking confirmation the clinic Appointments module sends.
  const sendBookingConfirmation = async () => {
    const fullName = (lead.name || "").trim();
    const firstName = fullName.split(/\s+/)[0] || "there";
    const phone = (lead.phone || "").trim();
    const missing: string[] = [];
    if (!fullName) missing.push("lead name");
    if (!phone) missing.push("valid phone");
    if (!bookingData.date) missing.push("appointment date");
    if (!bookingData.startTime) missing.push("appointment time");
    if (missing.length) {
      toast({ title: "Missing details", description: `Please fill: ${missing.join(", ")}`, variant: "destructive" });
      return;
    }
    let apptDate = bookingData.date;
    try { apptDate = format(new Date(bookingData.date), "dd MMM yyyy"); } catch { /* keep raw */ }
    const [hStr, mStr] = bookingData.startTime.split(":");
    const h24 = parseInt(hStr || "9", 10);
    const period = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    const apptTime = `${String(h12).padStart(2, "0")}:${(mStr || "00").padStart(2, "0")} ${period}`;
    await sendClinicWhatsApp({
      patient: { first_name: firstName, phone, name: fullName },
      templateKey: "appointment_booking_confirmation",
      bodyParams: [
        fullName || firstName,
        apptDate,
        apptTime,
        typeLabels[bookingData.type as keyof typeof typeLabels] || bookingData.type || "Consultation",
        bookingData.doctor || "Our Doctor",
      ],
      fallbackText: `Hi ${firstName}, your appointment at Dr. Neemz Dental is confirmed for ${apptDate} at ${apptTime}.`,
      label: "Booking confirmation",
      successToastTitle: "Booking confirmation sent successfully via Meta API! ✓",
    });
  };

  const bookAppointment = async () => {
    setBookingLoading(true);
    try {
      // Split lead name into first/last
      const nameParts = (lead.name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "Lead";
      const lastName = nameParts.slice(1).join(" ") || "-";

      // Create new patient from lead data
      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: lead.phone || null,
          email: lead.email || null,
          address: editingCity || lead.city || null,
        })
        .select("id, patient_code")
        .single();
      if (patientError) throw patientError;

      // Create appointment
      const { error: aptError } = await supabase.from("appointments").insert({
        patient_id: newPatient.id,
        appointment_date: bookingData.date,
        start_time: bookingData.startTime,
        end_time: bookingData.endTime,
        type: bookingData.type,
        doctor: bookingData.doctor,
        notes: bookingData.notes || `Lead: ${lead.name}`,
        source: lead.source || "walk-in",
        booked_by: currentUser.id,
        booked_by_name: currentUser.name,
      });
      if (aptError) throw aptError;

      // Update lead status to consultation_booked (auto-owns the lead if unassigned)
      const owner = ownerPatchForAction({ assigned_to_id: ownerId }, currentUser);
      await supabase.from("leads").update({
        status: "consultation_booked",
        ...owner,
        ...auditPatch(currentUser),
        updated_at: new Date().toISOString(),
      }).eq("id", lead.id);
      setEditingStatus("consultation_booked");
      setBaseline((b) => ({ ...b, status: "consultation_booked" }));
      savedRef.current = {
        ...savedRef.current,
        status: "consultation_booked",
        assignedToId: owner.assigned_to_id ?? savedRef.current.assignedToId,
        assignedToName: owner.assigned_to_name ?? savedRef.current.assignedToName,
      };
      if (owner.assigned_to_id) { setOwnerId(owner.assigned_to_id); setOwnerName(owner.assigned_to_name); }

      await logLeadActivity({
        leadId: lead.id,
        action: "appointment",
        description: `Appointment booked for ${bookingData.date} at ${bookingData.startTime} with ${bookingData.doctor || "doctor"} by ${currentUser.name}`,
      }, currentUser);
      bumpActivity();

      queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });

      toast({ title: "Appointment Booked!", description: `Patient ID: ${formatPatientCode(newPatient.patient_code)} created & appointment scheduled.` });
      // Send the clinic booking confirmation on WhatsApp, same as the clinic module
      await sendBookingConfirmation();
      setShowBookingForm(false);
      loadAppointments();
      onLeadUpdated?.();

    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBookingLoading(false);
    }
  };

  if (!lead) return null;

  const statusLabelOf = (value: string) => allStages.find(s => s.value === value)?.label || value;
  const tempLabelOf = (value: string) => leadTemperatures.find(t => t.value === value)?.label || value;

  const saveLeadData = async (overrides?: Record<string, any>) => {
    setSaving(true);
    // Any action on an unassigned lead makes the acting telecaller the owner.
    const owner = ownerPatchForAction({ assigned_to_id: overrides?.assigned_to_id ?? ownerId }, currentUser);
    const updateData = {
      notes: editingNotes,
      city: editingCity,
      status: editingStatus,
      ai_priority: editingPriority,
      treatment_interest: selectedTreatments.join(", ") || lead.treatment_interest,
      ...owner,
      ...overrides,
      ...auditPatch(currentUser),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("leads").update(updateData).eq("id", lead.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
      return false;
    }
    if (owner.assigned_to_id) { setOwnerId(owner.assigned_to_id); setOwnerName(owner.assigned_to_name); }

    // Audit trail: log each field that actually changed since the last save.
    const prev = savedRef.current;
    const entries: ActivityEntry[] = [];
    if (updateData.status !== prev.status) {
      entries.push({
        leadId: lead.id, action: "stage", field: "status",
        oldValue: statusLabelOf(prev.status), newValue: statusLabelOf(updateData.status),
        description: `Stage changed to '${statusLabelOf(updateData.status)}' by ${currentUser.name}`,
      });
    }
    if (updateData.ai_priority !== prev.priority) {
      entries.push({
        leadId: lead.id, action: "status", field: "ai_priority",
        oldValue: prev.priority, newValue: updateData.ai_priority,
        description: `Status changed to '${tempLabelOf(updateData.ai_priority)}' by ${currentUser.name}`,
      });
    }
    if ((updateData.treatment_interest || "") !== (prev.treatments || "")) {
      entries.push({
        leadId: lead.id, action: "edit", field: "treatment_interest",
        oldValue: prev.treatments || "", newValue: updateData.treatment_interest,
        description: `Treatment updated to '${updateData.treatment_interest}' by ${currentUser.name}`,
      });
    }
    if ((updateData.city || "") !== (prev.city || "")) {
      entries.push({
        leadId: lead.id, action: "edit", field: "city",
        oldValue: prev.city || "", newValue: updateData.city || "",
        description: `Location updated to '${updateData.city || "—"}' by ${currentUser.name}`,
      });
    }
    if ((updateData.notes || "") !== (prev.notes || "")) {
      entries.push({
        leadId: lead.id, action: "edit", field: "notes",
        description: `Lead note updated by ${currentUser.name}`,
      });
    }
    if (overrides && "assigned_to_id" in overrides && (overrides.assigned_to_id ?? null) !== prev.assignedToId) {
      entries.push({
        leadId: lead.id, action: "assignment", field: "assigned_to_id",
        oldValue: prev.assignedToName || "Unassigned", newValue: overrides.assigned_to_name || "Unassigned",
        description: `Lead owner set to ${overrides.assigned_to_name || "Unassigned"} by ${currentUser.name}`,
      });
    } else if (owner.assigned_to_id && owner.assigned_to_id !== prev.assignedToId) {
      entries.push({
        leadId: lead.id, action: "assignment", field: "assigned_to_id",
        oldValue: "Unassigned", newValue: owner.assigned_to_name,
        description: `Lead auto-assigned to ${owner.assigned_to_name} on activity`,
      });
    }

    // Record what is now persisted before awaiting the log writes, so a
    // second concurrent save cannot re-log the same change.
    savedRef.current = {
      notes: updateData.notes || "",
      city: updateData.city || "",
      status: updateData.status,
      priority: updateData.ai_priority,
      treatments: updateData.treatment_interest || "",
      assignedToId: (updateData as any).assigned_to_id ?? prev.assignedToId,
      assignedToName: (updateData as any).assigned_to_name ?? prev.assignedToName,
    };

    for (const entry of entries) await logLeadActivity(entry, currentUser);
    if (entries.length) bumpActivity();


    queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    onLeadUpdated?.();
    return true;
  };

  const isDirty =
    editingNotes !== baseline.notes ||
    editingCity !== baseline.city ||
    editingStatus !== baseline.status ||
    editingPriority !== baseline.priority ||
    selectedTreatments.join(", ") !== baseline.treatments;

  const syncBaseline = (overrides?: Partial<typeof baseline>) => {
    setBaseline({
      notes: editingNotes,
      city: editingCity,
      status: editingStatus,
      priority: editingPriority,
      treatments: selectedTreatments.join(", "),
      ...overrides,
    });
  };

  const handleSave = async () => {
    const success = await saveLeadData();
    if (success) {
      syncBaseline();
      toast({ title: "Lead updated successfully." });
      onOpenChange(false);
    }
  };

  // Auto-save when stage changes
  const applyStage = async (newStatus: string) => {
    setEditingStatus(newStatus);
    const ok = await saveLeadData({ status: newStatus });
    if (ok) {
      syncBaseline({ status: newStatus });
      toast({ title: "Stage updated" });
    }
  };

  const handleStageChange = async (newStatus: string) => {
    if (newStatus === "consultation_booked" && appointments.length === 0) {
      if (!isAdmin) {
        toast({
          title: "Book an appointment instead",
          description: "This stage is set automatically when you book an appointment for this lead.",
          variant: "destructive",
        });
        return;
      }
      setPendingBookedStage(newStatus);
      return;
    }
    await applyStage(newStatus);
  };

  const confirmBookedOverride = async () => {
    const stage = pendingBookedStage;
    setPendingBookedStage(null);
    if (stage) await applyStage(stage);
  };


  // Auto-save when priority/status changes
  const handlePriorityChange = async (newPriority: string) => {
    setEditingPriority(newPriority);
    const ok = await saveLeadData({ ai_priority: newPriority });
    if (ok) {
      syncBaseline({ priority: newPriority });
      toast({ title: "Status updated" });
    }
  };

  // Manual telecaller / lead-owner assignment
  const handleOwnerChange = async (userId: string | null, userName: string | null) => {
    setOwnerId(userId);
    setOwnerName(userName);
    const ok = await saveLeadData({ assigned_to_id: userId, assigned_to_name: userName, assigned_to: userName });
    if (ok) toast({ title: userName ? `Assigned to ${userName}` : "Lead unassigned" });
  };

  // Guard unsaved changes on close (X / outside click / Esc)
  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen && isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(isOpen);
  };

  const discardChanges = () => {
    setConfirmDiscard(false);
    onOpenChange(false);
  };


  const addFollowUp = async () => {
    if (!newFollowUpDate || !newFollowUpNote || !lead?.id) return;
    const { error } = await supabase.from("follow_ups").insert({
      lead_id: lead.id,
      due_date: newFollowUpDate,
      note: newFollowUpNote,
      status: "pending",
      created_by: currentUser.name,
      created_by_id: currentUser.id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logLeadActivity({
      leadId: lead.id,
      action: "follow_up",
      description: `Follow-up scheduled for ${format(new Date(newFollowUpDate), "dd MMM yyyy")} by ${currentUser.name}`,
    }, currentUser);
    // Any action on an unassigned lead claims ownership.
    const owner = ownerPatchForAction({ assigned_to_id: ownerId }, currentUser);
    if (owner.assigned_to_id) {
      await supabase.from("leads").update({ ...owner, ...auditPatch(currentUser) } as any).eq("id", lead.id);
      setOwnerId(owner.assigned_to_id); setOwnerName(owner.assigned_to_name);
      onLeadUpdated?.();
    }
    setNewFollowUpDate(""); setNewFollowUpNote("");
    loadFollowUps();
    bumpActivity();
    queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    toast({ title: "Follow-up added" });
  };

  const toggleFollowUp = async (id: string) => {
    const fu = followUps.find(f => f.id === id);
    if (!fu) return;
    const newStatus = fu.status === "done" ? "pending" : "done";
    await supabase.from("follow_ups").update({
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
      updated_by: currentUser.id,
      updated_by_name: currentUser.name,
    }).eq("id", id);
    await logLeadActivity({
      leadId: lead.id,
      action: "follow_up",
      description: `Follow-up marked ${newStatus === "done" ? "completed" : "pending"} by ${currentUser.name}`,
    }, currentUser);
    loadFollowUps();
    bumpActivity();
    queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
  };

  const addNote = async () => {
    if (!newNoteText || !lead?.id) return;
    setSavingNote(true);
    const { error } = await supabase.from("lead_notes").insert({
      lead_id: lead.id,
      note: newNoteText,
      created_by: currentUser.id,
      created_by_name: currentUser.name,
    });
    setSavingNote(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logLeadActivity({
      leadId: lead.id,
      action: "note",
      description: `Note added by ${currentUser.name}`,
    }, currentUser);
    const owner = ownerPatchForAction({ assigned_to_id: ownerId }, currentUser);
    if (owner.assigned_to_id) {
      await supabase.from("leads").update({ ...owner, ...auditPatch(currentUser) } as any).eq("id", lead.id);
      setOwnerId(owner.assigned_to_id); setOwnerName(owner.assigned_to_name);
      onLeadUpdated?.();
    }
    setNewNoteText("");
    loadNotes();
    bumpActivity();
    toast({ title: "Note added" });
  };


  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] h-[90vh] p-0 overflow-hidden">
        <div className="flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-3 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-lg font-display">{lead.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Phone size={11} /> {lead.phone}</span>
              {lead.email && <span className="flex items-center gap-1"><Mail size={11} /> {lead.email}</span>}
              {(lead.city || editingCity) && <span className="flex items-center gap-1"><MapPin size={11} /> {editingCity || lead.city}</span>}
              <Badge variant="secondary" className="text-[10px]">{lead.source}</Badge>
              <Badge variant="secondary" className="text-[10px]">{selectedTreatments.length > 0 ? selectedTreatments.join(", ") : lead.treatment_interest}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide"><UserIcon size={11} /> Lead Owner</span>
                <LeadOwnerSelect value={ownerId} onChange={handleOwnerChange} className="w-[170px]" disabled={saving} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="opportunity" className="flex-1 flex flex-col overflow-hidden min-h-0">
            <TabsList className="mx-6 mt-3 w-fit">
              <TabsTrigger value="opportunity" className="text-xs gap-1"><UserCheck size={12} /> Opportunity</TabsTrigger>
              <TabsTrigger value="call_logs" className="text-xs gap-1"><PhoneCall size={12} /> Call Logs</TabsTrigger>
              <TabsTrigger value="followups" className="text-xs gap-1"><RefreshCw size={12} /> Follow-ups</TabsTrigger>
              <TabsTrigger value="notes" className="text-xs gap-1"><StickyNote size={12} /> Notes</TabsTrigger>
              <TabsTrigger value="appointments" className="text-xs gap-1"><CalendarCheck size={12} /> Appointments</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs gap-1"><History size={12} /> Activity</TabsTrigger>
            </TabsList>


            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {/* TAB: Opportunity */}
              <TabsContent value="opportunity" className="mt-0 space-y-4">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm"><Phone size={14} className="text-muted-foreground" /><span>{lead.phone}</span></div>
                    <div className="flex items-center gap-2 text-sm"><Mail size={14} className="text-muted-foreground" /><span>{lead.email || "—"}</span></div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-muted-foreground" />
                      <Input value={editingCity} onChange={e => setEditingCity(e.target.value)} placeholder="Enter city..." className="h-7 text-xs" />
                    </div>
                    <div className="flex items-center gap-2 text-sm"><Calendar size={14} className="text-muted-foreground" /><span className="text-xs">Age: {lead.age || "—"}</span></div>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Source</label>
                      <p className="text-sm font-medium">{lead.source}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Stage</label>
                      <Select value={editingStatus} onValueChange={handleStageChange}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allStages.map(s => {
                            const blocked = s.value === "consultation_booked" && appointments.length === 0 && !isAdmin && editingStatus !== s.value;
                            return (
                              <SelectItem key={s.value} value={s.value} disabled={blocked}>
                                <div className="flex items-center gap-1.5">
                                  <span className={cn("h-1.5 w-1.5 rounded-full", s.color)} />
                                  {s.label}
                                  {blocked && <span className="text-[10px] text-muted-foreground">— set by Book Appointment</span>}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>

                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Status</label>
                      <Select value={editingPriority} onValueChange={handlePriorityChange}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {leadTemperatures.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Estimated Value</label>
                      <p className="text-sm font-semibold text-success">₹{(lead.estimated_value || 0).toLocaleString("en-IN")}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Assigned Telecaller / Lead Owner</label>
                      <LeadOwnerSelect value={ownerId} onChange={handleOwnerChange} disabled={saving} />
                      {ownerName && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-0.5">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">{initialsOf(ownerName)}</span>
                          Owned by {ownerName}
                        </p>
                      )}
                    </div>
                  </div>

                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Treatment Types</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start h-auto min-h-[36px] text-xs font-normal">
                        {selectedTreatments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {selectedTreatments.map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px] gap-1">
                                {t}
                                <span
                                  role="button"
                                  aria-label={`Remove ${t}`}
                                  className="inline-flex cursor-pointer opacity-60 hover:opacity-100"
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedTreatments((prev) => prev.filter((x) => x !== t));
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  <X size={10} />
                                </span>
                              </Badge>

                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Select treatments...</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-2" align="start">
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {treatmentOptions.map((option) => (
                          <label key={option.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer text-xs">
                            <Checkbox
                              checked={selectedTreatments.includes(option.label)}
                              onCheckedChange={(checked) => {
                                setSelectedTreatments((prev) =>
                                  checked ? [...prev, option.label] : prev.filter((item) => item !== option.label)
                                );
                              }}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-wrap gap-1.5">
                    {lead.dental_problem && <Badge variant="outline" className="text-xs">{lead.dental_problem}</Badge>}
                    {lead.source && <Badge variant="outline" className="text-xs">{lead.source}</Badge>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock size={10} /> Created: {format(new Date(lead.created_at), "dd MMM yyyy, hh:mm a")}</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> Updated: {format(new Date(lead.updated_at), "dd MMM yyyy, hh:mm a")}</span>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
                  <Save size={14} className="mr-1" />{saving ? "Saving..." : "Save Changes"}
                </Button>
              </TabsContent>

              {/* TAB: Call Logs */}
              <TabsContent value="call_logs" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Lead</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={recordLiveCall}
                      disabled={!lead?.phone}
                    >
                      <Phone size={12} className="mr-1" /> Live Call
                    </Button>
                    <Button
                      variant={showWhatsAppChat ? "default" : "outline"}
                      size="sm"
                      className={cn("h-7 text-xs", !showWhatsAppChat && "text-success border-success/30")}
                      onClick={() => setShowWhatsAppChat(v => !v)}
                      disabled={!lead?.phone}
                    >
                      <MessageSquare size={12} className="mr-1" /> WhatsApp
                    </Button>
                  </div>
                </div>
                {showWhatsAppChat ? (
                  <LeadWhatsAppChat leadPhone={lead?.phone} leadName={lead?.name} />
                ) : callLogs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                    No call history yet. Use Live Call or WhatsApp above to contact this lead.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {callLogs.map((c: any) => {
                      const Icon = callTypeIcons[c.call_type] || PhoneCall;
                      return (
                        <div key={c.id} className="rounded-lg border border-border p-3 flex items-start gap-3">
                          <Icon size={14} className={cn("mt-0.5 shrink-0", callTypeColors[c.call_type] || "text-muted-foreground")} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium capitalize">{c.call_type} call</span>
                              <Badge variant="secondary" className="text-[9px]">{c.status}</Badge>
                              {c.duration_seconds > 0 && (
                                <span className="text-[10px] text-muted-foreground">{Math.floor(c.duration_seconds / 60)}m {c.duration_seconds % 60}s</span>
                              )}
                            </div>
                            {c.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{c.notes}</p>}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">
                                {initialsOf(c.telecaller_name)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {c.telecaller_name || "Unknown"} · {format(new Date(c.started_at || c.created_at), "dd MMM yyyy, hh:mm a")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </TabsContent>

              {/* TAB: Follow-ups */}
              <TabsContent value="followups" className="mt-0 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule Follow-up</p>
                <div className="flex gap-2">
                  <Input type="date" value={newFollowUpDate} onChange={e => setNewFollowUpDate(e.target.value)} className="h-8 text-xs w-40" />
                  <Input value={newFollowUpNote} onChange={e => setNewFollowUpNote(e.target.value)} placeholder="Follow-up note..." className="h-8 text-xs flex-1" />
                  <Button size="sm" className="h-8 text-xs" onClick={addFollowUp} disabled={!newFollowUpDate || !newFollowUpNote}>
                    <Plus size={12} className="mr-1" /> Add
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Will be logged as scheduled by {currentUser.name}</p>

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Follow-up History</p>
                {followUps.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No follow-ups yet</p>}
                {followUps.map(fu => (
                  <div key={fu.id} className={cn("rounded-lg border p-3 flex items-start gap-3", fu.status === "done" ? "border-success/30 bg-success/5" : "border-border")}>
                    <button onClick={() => toggleFollowUp(fu.id)} className={cn("mt-0.5 h-4 w-4 rounded border flex items-center justify-center text-[10px] shrink-0", fu.status === "done" ? "bg-success border-success text-success-foreground" : "border-muted-foreground")}>
                      {fu.status === "done" && "✓"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs", fu.status === "done" && "line-through text-muted-foreground")}>{fu.note}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">📅 {fu.date}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">{initialsOf(fu.createdBy)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          Scheduled by {fu.createdBy || "Unknown"}
                          {fu.createdAt ? ` on ${format(new Date(fu.createdAt), "dd MMM hh:mm a")}` : ""}
                          {fu.updatedBy ? ` · Last updated by ${fu.updatedBy}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* TAB: Notes */}
              <TabsContent value="notes" className="mt-0 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Note</p>
                <div className="flex gap-2">
                  <Textarea value={newNoteText} onChange={e => setNewNoteText(e.target.value)} placeholder="Type a note..." className="text-xs min-h-[50px] resize-none flex-1" />
                  <Button size="sm" className="h-8 text-xs self-end" onClick={addNote} disabled={!newNoteText || savingNote}>
                    <Plus size={12} className="mr-1" /> {savingNote ? "Adding..." : "Add"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Will be saved as added by {currentUser.name}</p>

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Notes</p>
                {notesList.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>}
                {notesList.map(note => (
                  <div key={note.id} className="rounded-lg border border-border p-3 space-y-1">
                    <p className="text-xs">{note.text}</p>
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">{initialsOf(note.author)}</span>
                      <span className="text-[10px] text-muted-foreground">Added by {note.author || "Unknown"} · {note.date}</span>
                    </div>
                  </div>
                ))}


                {/* Also show the lead's main notes */}
                {lead.notes && (
                  <>
                    <Separator />
                    <div className="rounded-lg border border-border p-3 space-y-1 bg-muted/30">
                      <p className="text-[10px] font-semibold text-muted-foreground">Lead Note (editable in Opportunity tab)</p>
                      <p className="text-xs">{lead.notes}</p>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* TAB: Appointments */}
              <TabsContent value="appointments" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Appointments</p>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowBookingForm(!showBookingForm)}>
                    <Plus size={12} className="mr-1" /> Book Appointment
                  </Button>
                </div>

                {showBookingForm && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <p className="text-xs font-semibold flex items-center gap-1"><Stethoscope size={13} /> New Appointment for {lead.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Date</Label>
                        <Input type="date" value={bookingData.date} onChange={e => setBookingData({...bookingData, date: e.target.value})} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Time</Label>
                        {(() => {
                          const [h24Str, mStr] = bookingData.startTime.split(":");
                          const h24 = parseInt(h24Str || "9", 10);
                          const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
                          const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
                          const hourStr = String(h12).padStart(2, "0");
                          const minStr = (mStr || "00").padStart(2, "0");

                          const updateTime = (hh: string, mm: string, pp: "AM" | "PM") => {
                            let h = parseInt(hh, 10);
                            if (pp === "AM" && h === 12) h = 0;
                            else if (pp === "PM" && h !== 12) h += 12;
                            const m = parseInt(mm, 10);
                            const startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                            const endMin = h * 60 + m + 30;
                            const eh = Math.floor(endMin / 60) % 24;
                            const em = endMin % 60;
                            const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                            setBookingData({ ...bookingData, startTime, endTime });
                          };

                          return (
                            <div className="flex gap-1 items-center">
                              <Select value={hourStr} onValueChange={(v) => updateTime(v, minStr, period)}>
                                <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                                <SelectContent>{Array.from({ length: 12 }, (_, i) => { const v = String(i + 1).padStart(2, "0"); return <SelectItem key={v} value={v}>{v}</SelectItem>; })}</SelectContent>
                              </Select>
                              <span className="text-xs font-bold">:</span>
                              <Select value={minStr} onValueChange={(v) => updateTime(hourStr, v, period)}>
                                <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                                <SelectContent>{["00","05","10","15","20","25","30","35","40","45","50","55"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={period} onValueChange={(v) => updateTime(hourStr, minStr, v as "AM" | "PM")}>
                                <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                              </Select>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Treatment</Label>
                        <Select value={bookingData.type} onValueChange={v => setBookingData({...bookingData, type: v})}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select treatment" /></SelectTrigger>
                          <SelectContent>{treatmentOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Doctor</Label>
                        <Select value={bookingData.doctor} onValueChange={v => setBookingData({...bookingData, doctor: v})}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                          <SelectContent>{doctorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">{initialsOf(currentUser.name)}</span>
                      <span className="text-[10px] text-muted-foreground">Booked By: {currentUser.name}</span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Notes</Label>
                      <Input value={bookingData.notes} onChange={e => setBookingData({...bookingData, notes: e.target.value})} placeholder="Any notes..." className="h-8 text-xs" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs gap-2"
                      onClick={sendBookingConfirmation}
                    >
                      <MessageCircle size={14} /> Send WhatsApp Confirmation
                    </Button>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-8 text-xs" onClick={bookAppointment} disabled={bookingLoading}>
                        <CalendarCheck size={12} className="mr-1" />{bookingLoading ? "Booking..." : "Book & Create Patient"}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowBookingForm(false)}>Cancel</Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">This will create a new Patient ID and book directly into the clinic.</p>

                    {/* Day's Appointments Preview */}
                    {bookingData.date && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Clock size={10} />
                          Appointments on {bookingData.date}
                          <Badge variant="secondary" className="text-[9px] ml-1">{dayAppointments.length}</Badge>
                        </p>
                        {loadingDayAppts && <p className="text-[10px] text-muted-foreground text-center py-1">Loading...</p>}
                        {!loadingDayAppts && dayAppointments.length === 0 && (
                          <p className="text-[10px] text-muted-foreground text-center py-1">No appointments on this date</p>
                        )}
                        {!loadingDayAppts && dayAppointments.length > 0 && (
                          <div className="max-h-36 overflow-auto rounded border border-border divide-y divide-border">
                            {dayAppointments.map((a: any) => {
                              const formatT = (t: string) => { const [h, m] = t.split(":").map(Number); const p = h >= 12 ? "PM" : "AM"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m).padStart(2, "0")} ${p}`; };
                              return (
                                <div key={a.id} className="px-2 py-1.5 flex items-center justify-between text-[10px]">
                                  <span className="font-medium">{formatT(a.start_time)}</span>
                                  <span className="truncate max-w-[100px]">{a.patient_name}</span>
                                  <span className="text-muted-foreground truncate max-w-[60px]">{a.doctor || "—"}</span>
                                  <Badge variant={a.status === "scheduled" ? "secondary" : "default"} className="text-[8px]">{a.status}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {appointments.length === 0 && !showBookingForm ? (
                  <div className="text-center py-10 space-y-2 border border-dashed border-border rounded-lg">
                    <CalendarCheck size={24} className="mx-auto text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">No appointments scheduled yet</p>
                    <p className="text-[10px] text-muted-foreground">Book an appointment to convert this lead</p>
                    {editingStatus === "consultation_booked" && (
                      <p className="text-[10px] text-destructive px-4">
                        Stage says "Appointment Booked" but there is no appointment on record. Use Book Appointment above to fix this.
                      </p>
                    )}
                  </div>

                ) : (
                  appointments.map((apt: any) => (
                    <div key={apt.id} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{typeLabels[apt.type] || apt.type}</span>
                        <Badge variant="outline" className="text-[10px]">{apt.status}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{apt.appointment_date} · {apt.start_time}</p>
                      {apt.doctor && <p className="text-[10px] text-muted-foreground">Doctor: {apt.doctor}</p>}
                      {apt.booked_by_name && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">{initialsOf(apt.booked_by_name)}</span>
                          Booked By: {apt.booked_by_name}
                        </p>
                      )}
                      {apt.patients && <p className="text-[10px] text-muted-foreground">P.ID: {formatPatientCode(apt.patients.patient_code)} · {apt.patients.first_name} {apt.patients.last_name}</p>}
                    </div>
                  ))
                )}
              </TabsContent>

              {/* TAB: Activity log */}
              <TabsContent value="activity" className="mt-0">
                <LeadActivityLog leadId={lead.id} refreshKey={activityKey} />
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!pendingBookedStage} onOpenChange={(o) => !o && setPendingBookedStage(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>No appointment on record</AlertDialogTitle>
          <AlertDialogDescription>
            This lead has no appointment on record — are you sure you want to set the stage to "Appointment Booked"?
            The correct way is to use Book Appointment, which sets this stage automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingBookedStage(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmBookedOverride}>Yes, set anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Do you want to discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continue Editing</AlertDialogCancel>
          <AlertDialogAction onClick={discardChanges}>Discard Changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export { allStages };
