import { useState, useEffect, useRef, useMemo } from "react";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import HistoryStep from "@/components/workflow/HistoryStep";
import BookAppointmentStep from "@/components/workflow/BookAppointmentStep";
import BillingDetailDialog from "@/components/workflow/BillingDetailDialog";
import { dedupeBillingRecords } from "@/lib/billingRecords";
import PaymentStep from "@/components/workflow/PaymentStep";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { differenceInYears, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { Eye as EyeIcon, Save as SaveIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { ToothChart, ToothEntry, ToothCondition } from "@/components/dental/ToothChart";

import ExistingFindingsPanel from "@/components/workflow/ExistingFindingsPanel";
import { syncFindingsFromChart } from "@/lib/findingsLifecycle";
import {
  UserCheck, Activity, Stethoscope, ClipboardList, Camera, Receipt,
  Pill, LogOut, Plus, Search, ChevronRight, ChevronLeft, ArrowRight, ArrowDown, ArrowUp, Upload, FlaskConical, Trash2, X, CalendarIcon, CreditCard, Printer, History, Star, FileText, MessageCircle, Pencil, PanelRightClose, PanelRightOpen, CornerDownLeft, Mail, Check, Clock, Smile, RefreshCw, Video, Square, Play, Download, Share2
} from "lucide-react";
import { formatPatientCode } from "@/lib/patientCode";
import TreatmentSummary from "@/components/workflow/TreatmentSummary";
import DiagnosticsStep from "@/components/workflow/DiagnosticsStep";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { sendClinicWhatsApp, buildWelcomeText } from "@/lib/whatsappSender";
import { getNextStage } from "@/lib/treatmentStages";
import { syncPendingTreatmentForPatient } from "@/lib/pendingTreatmentSync";
import { buildLabOrderRow } from "@/lib/labOrderRows";
import QualityCheckStep from "@/components/workflow/QualityCheckStep";
import { ShieldCheck } from "lucide-react";



function getPatientAgeLabel(dateOfBirth: string | null) {
  if (!dateOfBirth) return "—";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "—";
  return `${differenceInYears(new Date(), dob)} yrs`;
}

type WorkflowStep = "checkin" | "vitals" | "consultation" | "treatment_plan" | "treatment" | "diagnostics" | "lab_orders" | "billing" | "payment" | "prescription" | "treatment_summary" | "qc_doctor" | "qc_lab" | "qc_pharma" | "checkout" | "history";

const stepConfig: { key: WorkflowStep; label: string; icon: any }[] = [
  { key: "checkin", label: "Check-in", icon: UserCheck },
  { key: "vitals", label: "Vitals", icon: Activity },
  { key: "treatment", label: "Treatment & Photos", icon: Camera },
  { key: "diagnostics", label: "X-Ray & Blood Test", icon: FlaskConical },
  { key: "consultation", label: "Consultation", icon: Stethoscope },
  { key: "treatment_plan", label: "Treatment Done", icon: ClipboardList },
  { key: "prescription", label: "Prescription", icon: Pill },
  { key: "lab_orders", label: "Lab Orders", icon: FlaskConical },
  { key: "billing", label: "Billing", icon: Receipt },
  { key: "payment", label: "Payment", icon: CreditCard },
  { key: "qc_doctor", label: "Doctor Quality", icon: ShieldCheck },
  { key: "qc_lab", label: "Lab Quality", icon: ShieldCheck },
  { key: "qc_pharma", label: "Pharma Quality", icon: ShieldCheck },
  { key: "checkout", label: "Checkout", icon: LogOut },
  { key: "treatment_summary", label: "Treatment Summary", icon: FileText },
  { key: "history", label: "History", icon: History },
];

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  patient_code?: number | null;
  address?: string | null;
  location?: string | null;
  district?: string | null;
  medical_notes?: string | null;
  is_high_ticket?: boolean | null;
}

function getPatientAddressLabel(patient: Patient | null) {
  if (!patient) return "—";

  const segments = [patient.address, patient.location, patient.district]
    .map((value) => value?.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments.join(", ") : "—";
}

const toTitleCase = (s: string) => {
  if (!s) return s;
  return s.trim().replace(/(^|\s)([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());
};

interface Checkin {
  id: string;
  patient_id: string;
  status: string;
  checkin_time: string;
}

interface AppointmentContext {
  id: string | null;
  source: string;
  doctor: string;
  assistant?: string;
  type: string;
}

interface VitalsFormState {
  blood_pressure_systolic: string;
  blood_pressure_diastolic: string;
  pulse_rate: string;
  temperature: string;
  weight: string;
  height: string;
  spo2: string;
  blood_sugar: string;
  notes: string;
}

interface VitalsNotesPayload {
  schema: "workflow_vitals_v1";
  additionalNotes: string;
  chiefComplaints: string[];
  otherComplaint: string;
  pastDentalNotes: string;
  medicalHistory: Record<string, "yes" | "no" | null>;
  otherMedicalNotes: string;
}

const createEmptyAppointmentContext = (): AppointmentContext => ({
  id: null,
  source: "walk-in",
  doctor: "",
  assistant: "",
  type: "consultation",
});

const createEmptyVitalsState = (): VitalsFormState => ({
  blood_pressure_systolic: "",
  blood_pressure_diastolic: "",
  pulse_rate: "",
  temperature: "",
  weight: "",
  height: "",
  spo2: "",
  blood_sugar: "",
  notes: "",
});

const createEmptyMedicine = () => ({
  medicine_type: "",
  medicine_name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
  morning: "0",
  afternoon: "0",
  evening: "0",
  night: "0",
  unit: "",
  unit_cost: "0",
});

type TreatmentPlanItem = {
  /** Existing treatment_plan_items row id (when loaded from DB) */
  id?: string;
  /** Set when the row belongs to an earlier visit's plan (carried-over stage) */
  source_plan_id?: string;
  treatment_type: string;
  tooth_number: string;
  description: string;
  estimated_cost: string;
  priority: string;
  doctor: string;
  assistant?: string;
  quantity: string;
  status?: string;
};


type UpcomingTreatmentItem = {
  treatment_type: string;
  tooth_number: string;
  description: string;
  estimated_cost: string;
  priority: string;
  doctor: string;
  assistant?: string;
  quantity: string;
};

type BillingItemDraft = {
  treatment_type: string;
  description: string;
  tooth_number: string;
  quantity: string;
  unit_price: string;
  category: string;
};

type MedicineDraft = {
  medicine_type: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  morning: string;
  afternoon: string;
  evening: string;
  night: string;
  unit?: string;
  unit_cost?: string;
};

type WorkflowDraft = {
  currentStep: WorkflowStep;
  vitals: VitalsFormState;
  selectedComplaints: string[];
  otherComplaint: string;
  pastDentalNotes: string;
  medicalHistory: Record<string, "yes" | "no" | null>;
  otherMedicalNotes: string;
  toothEntries: ToothEntry[];
  consultGeneralFindings?: Array<{ condition: ToothCondition; treatment_needed?: string }>;
  consultNotes: string;
  selectedChartMode: "adult" | "kids";
  planItems: TreatmentPlanItem[];
  upcomingItems: UpcomingTreatmentItem[];
  treatmentStatus: "completed" | "pending" | null;
  planNotes: string;
  planDoctor: string;
  proceededTeeth: number[];
  billingItems: BillingItemDraft[];
  discount: string;
  paymentMethod: string;
  invoiceNumber: string;
  invoiceDate: string;
  medicines: MedicineDraft[];
  diagnosis: string;
  labOrders: LabOrderDraft[];
};

type WorkflowSessionSnapshot = {
  patientId: string;
  step: WorkflowStep;
};

const CLINIC_WORKFLOW_SESSION_KEY = "clinic_workflow_session";
const CLINIC_WORKFLOW_DRAFT_PREFIX = "clinic_workflow_draft:";

const getWorkflowDraftKey = (patientId: string) => `${CLINIC_WORKFLOW_DRAFT_PREFIX}${patientId}`;

const readWorkflowDraft = (patientId: string): WorkflowDraft | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(getWorkflowDraftKey(patientId));
    return raw ? (JSON.parse(raw) as WorkflowDraft) : null;
  } catch {
    return null;
  }
};

const clearWorkflowDraft = (patientId: string) => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getWorkflowDraftKey(patientId));
};

const WARRANTY_OPTIONS = ["1 Year", "2 Years", "3 Years", "5 Years", "7 Years", "10 Years", "15 Years", "Lifetime"];

type QuadrantKey = "q1" | "q2" | "q3" | "q4";

type LabOrderQuadrants = Record<QuadrantKey, string>;

type LabOrderDraft = {
  lab_name: string;
  lab_phone: string;
  work_type: string;
  material: string;
  shade: string;
  tooth_number: string;
  description: string;
  price_of_material: string;
  lab_expense: string;
  patient_bill: string;
  lab_expense_paid_amount: string;
  sent_date: string;
  expected_delivery_date: string;
  notes: string;
  doctor: string;
  quadrants: LabOrderQuadrants;
};

const LAB_ORDER_QUADRANT_SEQUENCE: QuadrantKey[] = ["q1", "q2", "q3", "q4"];
const LAB_ORDER_QUADRANT_DISPLAY_ORDER: QuadrantKey[] = ["q1", "q2", "q4", "q3"];
const LAB_ORDER_QUADRANT_PREFIX: Record<QuadrantKey, number> = { q1: 10, q2: 20, q3: 30, q4: 40 };

const createEmptyLabOrderQuadrants = (): LabOrderQuadrants => ({
  q1: "",
  q2: "",
  q3: "",
  q4: "",
});

const sanitizeQuadrantInput = (value: string) => value.replace(/[^0-9,\s]/g, "").replace(/\s+/g, "");

const parseQuadrantDigits = (value: string) => {
  const uniqueDigits: number[] = [];

  sanitizeQuadrantInput(value)
    .split(",")
    .forEach((segment) => {
      const digit = parseInt(segment.trim(), 10);

      if (Number.isInteger(digit) && digit >= 1 && digit <= 8 && !uniqueDigits.includes(digit)) {
        uniqueDigits.push(digit);
      }
    });

  return uniqueDigits;
};

const toothNumbersToQuadrants = (toothNumber: string): LabOrderQuadrants => {
  const quadrants = createEmptyLabOrderQuadrants();

  toothNumber
    .split(",")
    .map((segment) => parseInt(segment.trim(), 10))
    .filter((tooth) => !Number.isNaN(tooth))
    .forEach((tooth) => {
      const digit = String(tooth % 10);

      if (tooth >= 11 && tooth <= 18) quadrants.q1 = quadrants.q1 ? `${quadrants.q1},${digit}` : digit;
      if (tooth >= 21 && tooth <= 28) quadrants.q2 = quadrants.q2 ? `${quadrants.q2},${digit}` : digit;
      if (tooth >= 31 && tooth <= 38) quadrants.q3 = quadrants.q3 ? `${quadrants.q3},${digit}` : digit;
      if (tooth >= 41 && tooth <= 48) quadrants.q4 = quadrants.q4 ? `${quadrants.q4},${digit}` : digit;
    });

  return quadrants;
};

const quadrantsToToothNumber = (quadrants: LabOrderQuadrants) =>
  LAB_ORDER_QUADRANT_SEQUENCE.flatMap((quadrant) =>
    parseQuadrantDigits(quadrants[quadrant]).map((digit) => LAB_ORDER_QUADRANT_PREFIX[quadrant] + digit),
  ).join(", ");

const getQuadrantQuantity = (quadrants: LabOrderQuadrants) =>
  LAB_ORDER_QUADRANT_SEQUENCE.reduce((total, quadrant) => total + parseQuadrantDigits(quadrants[quadrant]).length, 0);

const extractTeethFromDescription = (description?: string | null) => description?.match(/Teeth:\s*([0-9,\s]+)/i)?.[1] ?? "";

const parseToothNumbers = (value?: string | number | null) => {
  const uniqueTeeth: number[] = [];

  String(value ?? "")
    .split(",")
    .forEach((segment) => {
      const tooth = parseInt(segment.trim(), 10);

      if (Number.isInteger(tooth) && tooth >= 11 && tooth <= 48 && !uniqueTeeth.includes(tooth)) {
        uniqueTeeth.push(tooth);
      }
    });

  return uniqueTeeth;
};

const normalizeToothNumberText = (value?: string | number | null) => parseToothNumbers(value).join(", ");

const resolveLabOrderToothNumber = ({
  description,
  tooth_number,
  quadrants,
}: {
  description?: string | null;
  tooth_number?: string | number | null;
  quadrants?: LabOrderQuadrants;
}) => normalizeToothNumberText((quadrants ? quadrantsToToothNumber(quadrants) : "") || extractTeethFromDescription(description) || tooth_number);

const createEmptyLabOrder = () => ({
  lab_name: "",
  lab_phone: "",
  work_type: "",
  material: "",
  shade: "",
  tooth_number: "",
  description: "",
  price_of_material: "",
  lab_expense: "",
  patient_bill: "",
  lab_expense_paid_amount: "",
  sent_date: format(new Date(), "yyyy-MM-dd"),
  expected_delivery_date: "",
  notes: "",
  doctor: "",
  quadrants: createEmptyLabOrderQuadrants(),
});

const parseVitalsNotesPayload = (notes: string | null): VitalsNotesPayload => {
  const emptyPayload: VitalsNotesPayload = {
    schema: "workflow_vitals_v1",
    additionalNotes: "",
    chiefComplaints: [],
    otherComplaint: "",
    pastDentalNotes: "",
    medicalHistory: {},
    otherMedicalNotes: "",
  };

  if (!notes) return emptyPayload;

  try {
    const parsed = JSON.parse(notes);
    if (parsed?.schema === "workflow_vitals_v1") {
      return {
        ...emptyPayload,
        ...parsed,
      };
    }
  } catch {
    return {
      ...emptyPayload,
      additionalNotes: notes,
    };
  }

  return emptyPayload;
};

const buildVitalsNotesPayload = (
  additionalNotes: string,
  chiefComplaints: string[],
  otherComplaintValue: string,
  pastDentalHistory: string,
  medicalHistoryValue: Record<string, "yes" | "no" | null>,
  otherMedicalHistory: string
) => JSON.stringify({
  schema: "workflow_vitals_v1",
  additionalNotes,
  chiefComplaints,
  otherComplaint: otherComplaintValue,
  pastDentalNotes: pastDentalHistory,
  medicalHistory: medicalHistoryValue,
  otherMedicalNotes: otherMedicalHistory,
} satisfies VitalsNotesPayload);

const ClinicWorkflow = () => {
  const { patientId: urlPatientId } = useParams<{ patientId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlStep = searchParams.get("step") as WorkflowStep | null;
  const urlPatientQuery = searchParams.get("patient");
  const urlDate = searchParams.get("date");
  const [currentStep, setCurrentStepRaw] = useState<WorkflowStep>(urlStep || "checkin");
  const currentStepRef = useRef<WorkflowStep>(urlStep || "checkin");
  const autoSaversRef = useRef<Partial<Record<WorkflowStep, () => Promise<unknown> | unknown>>>({});
  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
  const setCurrentStep = async (step: WorkflowStep) => {
    const prev = currentStepRef.current;
    if (prev !== step) {
      const saver = autoSaversRef.current[prev];
      if (saver) {
        try { Promise.resolve(saver()).catch(() => {}); } catch {}
      }
    }
    setCurrentStepRaw(step);
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set("step", step);
      return next;
    }, { replace: true });
  };
  // Keep step in sync when URL changes externally (browser back/forward)
  useEffect(() => {
    if (urlStep && urlStep !== currentStep) {
      setCurrentStepRaw(urlStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStep]);
  const [workflowDate, setWorkflowDate] = useState<Date>(() => {
    if (urlDate) {
      const d = new Date(urlDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [workflowDateOpen, setWorkflowDateOpen] = useState(false);

  // Build a timestamp anchored to the selected workflow date (noon to avoid TZ edge cases).
  // For "today" it preserves the current time so live operations behave normally.
  const workflowTimestampISO = (): string => {
    const today = new Date();
    const sameDay = format(workflowDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    if (sameDay) return today.toISOString();
    const anchor = new Date(workflowDate);
    anchor.setHours(12, 0, 0, 0);
    return anchor.toISOString();
  };

  const getWorkflowDayBounds = () => {
    const dayStart = new Date(workflowDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(workflowDate);
    dayEnd.setHours(23, 59, 59, 999);

    return {
      dateStr: format(workflowDate, "yyyy-MM-dd"),
      dayStartISO: dayStart.toISOString(),
      dayEndISO: dayEnd.toISOString(),
    };
  };

  const getLatestWorkflowDayCheckin = async (patientId: string) => {
    const { dayStartISO, dayEndISO } = getWorkflowDayBounds();

    const { data } = await supabase
      .from("patient_checkins")
      .select("*")
      .eq("patient_id", patientId)
      .in("status", ["checked_in", "checked_out"])
      .gte("checkin_time", dayStartISO)
      .lte("checkin_time", dayEndISO)
      .order("checkin_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ?? null;
  };

  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatientRaw] = useState<Patient | null>(null);
  const setSelectedPatient = (patient: Patient | null) => {
    setSelectedPatientRaw(patient);
    if (!patient) {
      setCurrentPlanId(null);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (patient?.id) next.set("patient", patient.id);
      else next.delete("patient");
      return next;
    }, { replace: true });
  };
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);
  const [sendReview, setSendReview] = useState(true);

  // Patient appointment context (source, doctor, treatment type)
  const [patientAppointment, setPatientAppointment] = useState<AppointmentContext>(createEmptyAppointmentContext());
  const { doctorNames: clinicDoctorNames, treatmentNames: clinicTreatmentNames, sourceOptions: clinicSourceOptions, assistantNames } = useClinicMasters();

const DateAppointmentsList = ({ date }: { date: Date }) => {
  const dateStr = format(date, "yyyy-MM-dd");
  const [dateAppointments, setDateAppointments] = useState<Array<{
    id: string; start_time: string; end_time: string; type: string; doctor: string | null;
    patients: { first_name: string; last_name: string } | null;
  }>>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  useEffect(() => {
    const fetchApps = async () => {
      setLoadingApps(true);
      const { data } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, type, doctor, patients(first_name, last_name)")
        .eq("appointment_date", dateStr)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });
      setDateAppointments((data as any) || []);
      setLoadingApps(false);
    };
    fetchApps();
  }, [dateStr]);

  const formatTime12 = (t: string) => {
    const [hh, mm] = t.split(":");
    const h = parseInt(hh);
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mm} ${h >= 12 ? "PM" : "AM"}`;
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">
        Appointments on {format(date, "dd MMM yyyy")} ({dateAppointments.length})
      </Label>
      {loadingApps ? (
        <div className="text-xs text-muted-foreground py-2 text-center">Loading...</div>
      ) : dateAppointments.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2 text-center border border-dashed border-border rounded-md">No appointments on this date</div>
      ) : (
        <div className="max-h-[160px] overflow-y-auto space-y-1 border border-border rounded-md p-1.5">
          {dateAppointments.map((app) => {
            const patientName = app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : "Unknown";
            return (
              <div key={app.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-background border border-border/30 text-xs">
                <span className="font-mono font-semibold text-primary whitespace-nowrap">{formatTime12(app.start_time)}</span>
                <span className="text-muted-foreground">—</span>
                <span className="font-medium truncate flex-1">{patientName}</span>
                <Badge variant="outline" className="text-[9px] h-5 shrink-0">{app.type}</Badge>
                {app.doctor && <span className="text-muted-foreground text-[10px] shrink-0">{app.doctor}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

  // Vitals state
  const [vitals, setVitals] = useState<VitalsFormState>(createEmptyVitalsState());
  const [currentVitalsId, setCurrentVitalsId] = useState<string | null>(null);

  // Chief complaint state
  const chiefComplaints = [
    "Tooth Ache", "Decay Tooth", "Sensitivity", "Jaw Pain", "Gum Pain", "Bleeding Gums",
    "Facial Pain", "Misalignment", "Broken Teeth", "Teeth Loss",
    "Bad Breath", "Swelling", "Other"
  ];
  const [selectedComplaints, setSelectedComplaints] = useState<string[]>([]);
  const [otherComplaint, setOtherComplaint] = useState("");

  // Past dental history
  const [pastDentalNotes, setPastDentalNotes] = useState("");

  // Past medical history
  const medicalHistoryItems = [
    "Diabetes", "Hypertension", "Cholesterol", "Thyroid", "Asthma", "Heart Disease",
    "Stomach Ulcer", "Pregnancy", "Drug Allergy", "Respiratory Issues", "Abnormal Bleeding",
    "Epilepsy", "Hepatitis", "HIV/AIDS", "Surgery", "Skin Problems", "Other"
  ];
  const [medicalHistory, setMedicalHistory] = useState<Record<string, "yes" | "no" | null>>({});
  const [otherMedicalNotes, setOtherMedicalNotes] = useState("");

  // Dental chart state
  const [toothEntries, setToothEntries] = useState<ToothEntry[]>([]);
  const [chartId, setChartId] = useState<string | null>(null);
  const [consultNotes, setConsultNotes] = useState("");
  const [consultGeneralFindings, setConsultGeneralFindings] = useState<Array<{ condition: ToothCondition; treatment_needed?: string }>>([]);
  const [selectedChartMode, setSelectedChartMode] = useState<"adult" | "kids">("adult");

  // Treatment plan state
  const [planItems, setPlanItems] = useState<TreatmentPlanItem[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<UpcomingTreatmentItem[]>([]);
  const [upcomingQuadrantText, setUpcomingQuadrantText] = useState<Record<string, string>>({});
  const [planQuadrantText, setPlanQuadrantText] = useState<Record<string, string>>({});
  // Treatment status: 'completed' or 'pending' — mandatory choice before moving to next step
  const [treatmentStatus, setTreatmentStatus] = useState<"completed" | "pending" | null>(null);
  const [planNotes, setPlanNotes] = useState("");
  const [planDoctor, setPlanDoctor] = useState("");
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [showUpcomingAppointment, setShowUpcomingAppointment] = useState<number | null>(null);
  const [upcomingAppDate, setUpcomingAppDate] = useState<Date | undefined>(undefined);
  const [upcomingAppHour, setUpcomingAppHour] = useState("09");
  const [upcomingAppMinute, setUpcomingAppMinute] = useState("00");
  const [upcomingAppPeriod, setUpcomingAppPeriod] = useState<"AM" | "PM">("AM");
  const [dragSourceIndex, setDragSourceIndex] = useState<{ list: "plan" | "upcoming"; index: number } | null>(null);
  const [showBookAppointmentDialog, setShowBookAppointmentDialog] = useState(false);
  const [proceededTeeth, setProceededTeeth] = useState<Set<number>>(new Set());
  const [pendingProceedGroup, setPendingProceedGroup] = useState<{ teeth: number[]; condition: string; treatment_needed?: string } | null>(null);
  const [showProceedChoiceDialog, setShowProceedChoiceDialog] = useState(false);
  const [showScheduleFromFinding, setShowScheduleFromFinding] = useState(false);
  const [assistantErrorRows, setAssistantErrorRows] = useState<Set<number>>(new Set());
  // Consultation row removal (Treatment Done)
  const [consultationBilledInDb, setConsultationBilledInDb] = useState(false);
  const [removeConsultIndex, setRemoveConsultIndex] = useState<number | null>(null);

  const treatmentTypes = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...clinicTreatmentNames,
            ...planItems.map((item) => item.treatment_type),
            ...upcomingItems.map((item) => item.treatment_type),
          ]
            .map((value) => value?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ),
    [clinicTreatmentNames, planItems, upcomingItems]
  );

  const toothNumbers = [
    "11","12","13","14","15","16","17","18",
    "21","22","23","24","25","26","27","28",
    "31","32","33","34","35","36","37","38",
    "41","42","43","44","45","46","47","48"
  ];

  const doctorNames = clinicDoctorNames;

  // Sync planDoctor from appointment doctor selection
  useEffect(() => {
    if (patientAppointment.doctor && !planDoctor) {
      setPlanDoctor(patientAppointment.doctor);
    }
  }, [patientAppointment.doctor]);

  // Billing state
  const [billingItems, setBillingItems] = useState<BillingItemDraft[]>([]);
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [billingAutoPopulated, setBillingAutoPopulated] = useState(false);
  const [previousBillings, setPreviousBillings] = useState<any[]>([]);
  const [selectedBillingRecord, setSelectedBillingRecord] = useState<any>(null);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const billingSavedSnapshotRef = useRef<string>("");
  const [showBillingBackConfirm, setShowBillingBackConfirm] = useState(false);
  const computeBillingSnapshot = (items: BillingItemDraft[], disc: string) =>
    JSON.stringify({
      d: String(disc || ""),
      i: (items || []).map((it) => ({
        t: it.treatment_type || "",
        d: it.description || "",
        n: it.tooth_number || "",
        q: String(it.quantity || ""),
        p: String(it.unit_price || ""),
      })),
    });
  const isBillingDirty = () =>
    billingSavedSnapshotRef.current !== "" &&
    computeBillingSnapshot(billingItems, discount) !== billingSavedSnapshotRef.current;
  const attemptBackToPrescription = () => {
    if (isBillingDirty()) {
      setShowBillingBackConfirm(true);
    } else {
      setCurrentStep("prescription");
    }
  };
  const [changePatientOpen, setChangePatientOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSearchResults, setInvoiceSearchResults] = useState<any[]>([]);
  const [invoiceSearching, setInvoiceSearching] = useState(false);
  const [invoiceSearchPatientName, setInvoiceSearchPatientName] = useState("");

  // Prescription state
  const [medicines, setMedicines] = useState<MedicineDraft[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [currentPrescriptionId, setCurrentPrescriptionId] = useState<string | null>(null);
  const [medicinesList, setMedicinesList] = useState<{ id: string; name: string; type: string | null; selling_price?: number | null; unit?: string | null; unit_cost?: number | null; dosage?: string | null; morning?: string | null; afternoon?: string | null; evening?: string | null; night?: string | null; days?: string | null; food_instruction?: string | null }[]>([]);
  const [dosagesList, setDosagesList] = useState<{ id: string; medicine_type: string; value: string; sort_order: number }[]>([]);
  const [prescriptionTemplates, setPrescriptionTemplates] = useState<{ id: string; name: string; treatment_category: string }[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", treatment_category: "", description: "" });
  const [templateItems, setTemplateItems] = useState<{ medicine_name: string; dosage: string; frequency: string; morning: string; afternoon: string; evening: string; night: string; duration: string; instructions: string }[]>([]);

  // Photo state
  const [photos, setPhotos] = useState<{ file: File; type: string; tooth_number: string; notes: string }[]>([]);
  const [savedPhotos, setSavedPhotos] = useState<{ id: string; file_path: string; file_name: string | null; photo_type: string; tooth_number: number | null; notes: string | null; created_at: string }[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [showWebcam, setShowWebcam] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  type CapturedShot = { id: string; blob: Blob; url: string; takenAt: Date; saved: boolean; saving: boolean; failed?: boolean; recordId?: string; filePath?: string };
  const [capturedShots, setCapturedShots] = useState<CapturedShot[]>([]);
  const capturedShotsRef = useRef(capturedShots);
  capturedShotsRef.current = capturedShots;
  const [previewShotUrl, setPreviewShotUrl] = useState<string | null>(null);
  useEffect(() => () => { capturedShotsRef.current.forEach(s => URL.revokeObjectURL(s.url)); }, []);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Video recording state
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lab orders state
  const [labOrders, setLabOrders] = useState<LabOrderDraft[]>([]);
  const [savedLabOrders, setSavedLabOrders] = useState<any[]>([]);
  const [editingLabOrderId, setEditingLabOrderId] = useState<string | null>(null);
  const [labsList, setLabsList] = useState<{ id: string; name: string; mobile: string | null }[]>([]);
  const [labWorksList, setLabWorksList] = useState<{ id: string; name: string; materials: string[] | null }[]>([]);

  // Today's checkins
  const [todayCheckins, setTodayCheckins] = useState<any[]>([]);
  const [queueRefreshing, setQueueRefreshing] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // Today's scheduled appointments
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);

  // Patient photo & admit card
  const [patientPhotoUrl, setPatientPhotoUrl] = useState<string | null>(null);
  const [showAdmitCard, setShowAdmitCard] = useState(false);

  // Load existing profile photo for the selected patient (uploaded during booking or check-in)
  useEffect(() => {
    const pid = selectedPatient?.id;
    if (!pid) { setPatientPhotoUrl(null); return; }
    let cancelled = false;
    (async () => {
      try {
        // 1) Folder uploads from check-in camera: patient-photos/{pid}/...
        const { data: folderFiles } = await supabase.storage
          .from("clinical-photos")
          .list(`patient-photos/${pid}`, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
        let chosenPath: string | null = null;
        if (folderFiles && folderFiles.length > 0) {
          chosenPath = `patient-photos/${pid}/${folderFiles[0].name}`;
        } else {
          // 2) Flat uploads from Book Appointment form: patient-photos/{pid}.{ext}
          const { data: rootFiles } = await supabase.storage
            .from("clinical-photos")
            .list("patient-photos", { limit: 100, search: pid });
          const match = rootFiles?.find((f) => f.name.startsWith(`${pid}.`));
          if (match) chosenPath = `patient-photos/${match.name}`;
        }
        if (cancelled) return;
        if (chosenPath) {
          const { data: signed } = await supabase.storage.from("clinical-photos").createSignedUrl(chosenPath, 60 * 60 * 24);
          setPatientPhotoUrl(signed?.signedUrl ? `${signed.signedUrl}` : null);
        } else {
          setPatientPhotoUrl(null);
        }
      } catch {
        if (!cancelled) setPatientPhotoUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  useEffect(() => {
    fetchPatients();
    
    fetchMedicinesList();
    fetchDosagesList();
    fetchPrescriptionTemplates();
    fetchLabsList();
    fetchLabWorksList();
  }, []);

  useEffect(() => {
    const handleMedicinesUpdated = () => {
      fetchMedicinesList();
      fetchDosagesList();
    };

    window.addEventListener("medicines:updated", handleMedicinesUpdated as EventListener);
    return () => window.removeEventListener("medicines:updated", handleMedicinesUpdated as EventListener);
  }, []);

  useEffect(() => {
    fetchTodayCheckins();
    fetchTodayAppointments();
  }, [workflowDate]);

  // Auto-load patient from URL parameter (e.g., from Patient Database or Appointments page)
  useEffect(() => {
    if (!urlPatientId) return;
    const loadPatientFromUrl = async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, email, date_of_birth, gender, patient_code, address, location, district, medical_notes, is_high_ticket")
        .eq("id", urlPatientId)
        .single();
      if (data) {
        setSelectedPatient(data);
        setCurrentStep(urlStep || "checkin");
        fetchPatientAppointment(data.id);

        // Load existing check-in if any (do NOT auto check-in — staff must click the button)
        const existingCheckin = await getLatestWorkflowDayCheckin(urlPatientId);
        if (existingCheckin?.status === "checked_in") setActiveCheckin(existingCheckin);
        else setActiveCheckin(null);
      }
    };
    loadPatientFromUrl();
  }, [urlPatientId, workflowDate]);

  // Restore selected patient from ?patient= query param (after tab switch / refresh)
  useEffect(() => {
    if (!urlPatientQuery || urlPatientId) return;
    if (selectedPatient?.id === urlPatientQuery) return;
    const restorePatient = async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, email, date_of_birth, gender, patient_code, address, location, district, medical_notes, is_high_ticket")
        .eq("id", urlPatientQuery)
        .maybeSingle();
      if (data) {
        setSelectedPatientRaw(data);
        fetchPatientAppointment(data.id);
        const existingCheckin = await getLatestWorkflowDayCheckin(urlPatientQuery);
        if (existingCheckin?.status === "checked_in") setActiveCheckin(existingCheckin);
        else setActiveCheckin(null);
      }
    };
    restorePatient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPatientQuery]);


  const fetchPatients = async () => {
    const { data } = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, email, date_of_birth, gender, patient_code, address, location, district, medical_notes, is_high_ticket")
      .order("first_name");
    if (data) setPatients(data);
  };


  const getDosagePlaceholder = (medicineType?: string) => {
    const typeKey = (medicineType || "").trim().toLowerCase();
    if (typeKey === "syrup" || typeKey === "drops" || typeKey === "mouthwash" || typeKey === "gargle") return "5ml";
    if (typeKey === "ointment" || typeKey === "gel" || typeKey === "toothpaste") return "Apply";
    return "500mg";
  };

  const hasDoseValue = (val?: string | null) => {
    const normalized = (val || "").trim();
    return Boolean(normalized && normalized !== "-" && normalized !== "0");
  };

  const parseDosageValue = (val: string): number => {
    const normalized = (val || "").trim();
    if (!normalized || normalized === "-" || normalized === "0") return 0;
    if (normalized === "½") return 0.5;
    if (normalized === "1 ½") return 1.5;
    if (/^\d+(\.\d+)?$/.test(normalized)) return parseFloat(normalized) || 0;
    return 0;
  };

  const parsePrescriptionFrequency = (frequencyValue?: string | null) => {
    const parsed = {
      frequency: "",
      morning: "0",
      afternoon: "0",
      evening: "0",
      night: "0",
    };

    const raw = (frequencyValue || "").trim();
    if (!raw) return parsed;

    const match = raw.match(/^(.*?)\s*\((.*)\)\s*$/);
    parsed.frequency = (match ? match[1] : raw).trim();
    const timingValue = (match?.[2] || "").trim();
    if (!timingValue) return parsed;

    timingValue.split(",").forEach((part) => {
      const token = part.trim();
      if (!token) return;

      if (token.startsWith("M:")) parsed.morning = token.slice(2).trim() || "0";
      else if (token.startsWith("A:")) parsed.afternoon = token.slice(2).trim() || "0";
      else if (token.startsWith("E:")) parsed.evening = token.slice(2).trim() || "0";
      else if (token.startsWith("N:")) parsed.night = token.slice(2).trim() || "0";
      else if (token.toLowerCase().startsWith("morning-")) parsed.morning = token.slice(8).trim() || "0";
      else if (token.toLowerCase().startsWith("afternoon-")) parsed.afternoon = token.slice(10).trim() || "0";
      else if (token.toLowerCase().startsWith("evening-")) parsed.evening = token.slice(8).trim() || "0";
      else if (token.toLowerCase().startsWith("night-")) parsed.night = token.slice(6).trim() || "0";
    });

    return parsed;
  };

  const calcMedicineQuantity = (med: { morning: string; afternoon: string; evening: string; night: string; duration: string; medicine_type?: string }): number => {
    // Only "tablet" type uses dose × days. Everything else (syrup/gel/toothpaste/mouthwash) = 1 piece.
    const isTablet = (med.medicine_type || "").trim().toLowerCase() === "tablet";
    if (!isTablet) return 1;
    const perDay = parseDosageValue(med.morning) + parseDosageValue(med.afternoon) + parseDosageValue(med.evening) + parseDosageValue(med.night);
    const days = parseInt(med.duration) || 0;
    return Math.ceil(perDay * days);
  };

  const fetchMedicinesList = async () => {
    // 1. Load medicines master. unit_cost from Settings is the source of truth for price.
    const { data: medsData } = await supabase
      .from("medicines")
      .select("id, name, type, inventory_item_id, unit_cost, unit, dosage, morning, afternoon, evening, night, days, food_instruction")
      .eq("is_active", true)
      .order("name");

    // 2. Load all "Medications" inventory items so we can (a) get prices and (b) include unlinked ones in the dropdown
    const { data: medCategory } = await supabase
      .from("inventory_categories")
      .select("id")
      .ilike("name", "%medication%")
      .maybeSingle();

    let invItems: any[] = [];
    if (medCategory?.id) {
      const { data: invData } = await supabase
        .from("inventory_items")
        .select("id, name, selling_price, quantity")
        .eq("category_id", medCategory.id)
        .eq("is_active", true)
        .order("name");
      invItems = invData || [];
    }

    const invById: Record<string, { name: string; selling_price: number; quantity: number }> = {};
    const invByName: Record<string, string> = {}; // lowercase name -> inv id
    invItems.forEach(inv => {
      invById[inv.id] = { name: inv.name, selling_price: Number(inv.selling_price || 0), quantity: Number(inv.quantity || 0) };
      invByName[inv.name.trim().toLowerCase()] = inv.id;
    });

    const merged: { id: string; name: string; type: string | null; selling_price: number | null; unit?: string | null; unit_cost?: number | null; dosage?: string | null; morning?: string | null; afternoon?: string | null; evening?: string | null; night?: string | null; days?: string | null; food_instruction?: string | null }[] = [];
    const seenKeys = new Set<string>(); // dedupe by name+type

    (medsData || []).forEach((m: any) => {
      const name = (m.name || "").trim();
      const type = (m.type || "").trim();
      if (!name) return;
      const key = `${name.toLowerCase()}|${type.toLowerCase()}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      const linkedInvId = m.inventory_item_id || invByName[name.toLowerCase()] || null;
      // Priority: Settings unit_cost > linked inventory selling_price > 0
      const settingsCost = Number(m.unit_cost || 0);
      const invPrice = linkedInvId ? Number(invById[linkedInvId]?.selling_price ?? 0) : 0;
      const price = settingsCost > 0 ? settingsCost : invPrice;
      merged.push({ id: m.id, name, type: m.type, selling_price: price, unit: m.unit, unit_cost: settingsCost, dosage: m.dosage, morning: m.morning, afternoon: m.afternoon, evening: m.evening, night: m.night, days: m.days, food_instruction: m.food_instruction });
    });

    // NOTE: We intentionally do NOT merge inventory medications here. Only medicines configured
    // in Settings → Medicines master should appear in the prescription dropdown, so the Type
    // filter works correctly and we don't show every inventory item.

    merged.sort((a, b) => a.name.localeCompare(b.name));
    setMedicinesList(merged);

  };

  const fetchPrescriptionTemplates = async () => {
    const { data } = await supabase.from("prescription_templates").select("id, name, treatment_category").eq("is_active", true).order("name");
    if (data) setPrescriptionTemplates(data);
  };

  const fetchDosagesList = async () => {
    const { data } = await supabase.from("medicine_dosages").select("id, medicine_type, value, sort_order").eq("is_active", true).order("medicine_type").order("sort_order");
    if (data) setDosagesList(data as any);
  };

  const fetchLabsList = async () => {
    const { data } = await supabase.from("labs").select("id, name, mobile").eq("is_active", true).order("name");
    if (data) setLabsList(data);
  };

  const fetchLabWorksList = async () => {
    const { data } = await supabase.from("lab_works").select("id, name, materials").eq("is_active", true).order("name");
    if (data) setLabWorksList(data);
  };

  const fetchPreviousBillings = async () => {
    if (!selectedPatient) return;
    const { data } = await supabase
      .from("billings")
      .select("id, total_amount, amount_paid, payment_status, created_at, payment_method, invoice_number, discount_amount, discount_percent, subtotal, tax_amount, notes, patient_id, checkin_id, plan_id")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    setPreviousBillings(dedupeBillingRecords(data || []));
  };

  const searchInvoiceByNumber = async (term: string) => {
    const q = term.trim();
    if (!q) {
      setInvoiceSearchResults([]);
      return;
    }
    setInvoiceSearching(true);
    const { data } = await supabase
      .from("billings")
      .select("id, total_amount, amount_paid, payment_status, created_at, payment_method, invoice_number, discount_amount, discount_percent, subtotal, tax_amount, notes, patient_id, checkin_id, plan_id, patients:patient_id(first_name, last_name, phone)")
      .ilike("invoice_number", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(20);
    setInvoiceSearchResults(data || []);
    setInvoiceSearching(false);
  };

  const openInvoiceFromSearch = (rec: any) => {
    const pname = rec.patients ? `${rec.patients.first_name || ""} ${rec.patients.last_name || ""}`.trim() : "";
    setInvoiceSearchPatientName(pname);
    setSelectedBillingRecord(rec);
    setBillingDialogOpen(true);
  };

  const resolvePatientCheckin = async (patientId: string, includeLatest = false) => {
    const todayCheckin = await getLatestWorkflowDayCheckin(patientId);

    if (todayCheckin?.status === "checked_in" || !includeLatest) return todayCheckin?.status === "checked_in" ? todayCheckin : null;

    const { data: latestCheckin } = await supabase
      .from("patient_checkins")
      .select("*")
      .eq("patient_id", patientId)
      .order("checkin_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    return latestCheckin;
  };

  const loadWorkflowRecords = async (patientId: string, checkinId: string) => {
    const [vitalsRes, chartRes, planRes, prescriptionRes, photosRes, labOrdersRes] = await Promise.all([
      supabase
        .from("patient_vitals")
        .select("id, blood_pressure_systolic, blood_pressure_diastolic, pulse_rate, temperature, weight, height, spo2, blood_sugar, notes")
        .eq("checkin_id", checkinId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("dental_charts")
        .select("id, notes, chart_type")
        .eq("checkin_id", checkinId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("treatment_plans")
        .select("id, notes, doctor")
        .eq("checkin_id", checkinId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("prescriptions")
        .select("id, diagnosis")
        .eq("checkin_id", checkinId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("clinical_photos")
        .select("id, file_path, file_name, photo_type, tooth_number, notes, created_at")
        .eq("checkin_id", checkinId)
        .order("created_at", { ascending: false }),
      supabase
        .from("lab_orders")
        .select("*")
        .eq("checkin_id", checkinId)
        .order("created_at", { ascending: false }),
    ]);

    const parsedVitals = parseVitalsNotesPayload(vitalsRes.data?.notes ?? null);
    setCurrentVitalsId(vitalsRes.data?.id ?? null);
    setVitals({
      blood_pressure_systolic: vitalsRes.data?.blood_pressure_systolic?.toString() ?? "",
      blood_pressure_diastolic: vitalsRes.data?.blood_pressure_diastolic?.toString() ?? "",
      pulse_rate: vitalsRes.data?.pulse_rate?.toString() ?? "",
      temperature: vitalsRes.data?.temperature?.toString() ?? "",
      weight: vitalsRes.data?.weight?.toString() ?? "",
      height: vitalsRes.data?.height?.toString() ?? "",
      spo2: vitalsRes.data?.spo2?.toString() ?? "",
      blood_sugar: vitalsRes.data?.blood_sugar?.toString() ?? "",
      notes: parsedVitals.additionalNotes,
    });
    setSelectedComplaints(parsedVitals.chiefComplaints);
    setOtherComplaint(parsedVitals.otherComplaint);
    setPastDentalNotes(parsedVitals.pastDentalNotes);
    setMedicalHistory(parsedVitals.medicalHistory);
    setOtherMedicalNotes(parsedVitals.otherMedicalNotes);

    setSavedPhotos((photosRes.data as typeof savedPhotos) || []);
    setSavedLabOrders(labOrdersRes.data || []);

    setChartId(chartRes.data?.id ?? null);
    setConsultNotes(chartRes.data?.notes || "");
    setSelectedChartMode((chartRes.data as any)?.chart_type === "child" ? "kids" : "adult");

    if (chartRes.data?.id) {
      const { data: chartEntries } = await supabase
        .from("dental_chart_entries")
        .select("tooth_number, condition, treatment_needed, notes, surface")
        .eq("chart_id", chartRes.data.id)
        .order("tooth_number", { ascending: true });
      const all = (chartEntries as any[]) || [];
      setToothEntries(all.filter((e) => e.tooth_number && e.tooth_number > 0) as ToothEntry[]);
      setConsultGeneralFindings(
        all.filter((e) => !e.tooth_number || e.tooth_number === 0).map((e) => ({
          condition: e.condition,
          treatment_needed: e.treatment_needed || undefined,
        }))
      );
    } else {
      setToothEntries([]);
      setConsultGeneralFindings([]);
    }

    setCurrentPlanId(planRes.data?.id ?? null);
    setPlanNotes(planRes.data?.notes || "");
    setPlanDoctor(planRes.data?.doctor || patientAppointment.doctor || "");

    // Outstanding stages carried over from the patient's earlier visits.
    // These rows stay where they are (history preserved) — Clinic Workflow simply
    // makes them actionable again so treatment progression can continue.
    const loadCarriedPendingItems = async (excludePlanId: string | null) => {
      const { data: carried } = await supabase
        .from("treatment_plan_items")
        .select("id, plan_id, treatment_type, tooth_number, description, estimated_cost, priority, doctor, assistant, status, treatment_plans!inner(patient_id)")
        .eq("status", "pending")
        .eq("treatment_plans.patient_id", patientId)
        .order("created_at", { ascending: true });
      return (carried || [])
        .filter((item: any) => item.plan_id !== excludePlanId)
        .map((item: any) => ({
          id: item.id as string,
          source_plan_id: item.plan_id as string,
          treatment_type: item.treatment_type || "",
          tooth_number: item.tooth_number ? String(item.tooth_number) : "",
          description: item.description || "",
          estimated_cost: item.estimated_cost ? String(item.estimated_cost) : "",
          priority: item.priority || "normal",
          doctor: item.doctor || "",
          assistant: item.assistant || "",
          quantity: "1",
          status: "pending",
        }));
    };

    if (planRes.data?.id) {
      const { data: planItemRows } = await supabase
        .from("treatment_plan_items")
        .select("id, treatment_type, tooth_number, description, estimated_cost, priority, doctor, assistant, status")
        .eq("plan_id", planRes.data.id)
        .order("created_at", { ascending: true });
      const loadedCurrent: typeof planItems = [];
      const loadedUpcoming: typeof upcomingItems = [];
      let loadedStatus: "completed" | "pending" | null = null;
      (planItemRows || []).forEach((item: any) => {
        const mapped = {
          id: item.id as string,
          treatment_type: item.treatment_type || "",
          tooth_number: item.tooth_number ? String(item.tooth_number) : "",
          description: item.description || "",
          estimated_cost: item.estimated_cost ? String(item.estimated_cost) : "",
          priority: item.priority || "normal",
          doctor: item.doctor || "",
          assistant: item.assistant || "",
          quantity: "1",
          status: item.status || "",
        };
        if (item.status === "upcoming") {
          loadedUpcoming.push(mapped);
        } else {
          loadedCurrent.push(mapped);
          if (item.status === "completed") loadedStatus = "completed";
          else if (item.status === "pending" && loadedStatus !== "completed") loadedStatus = "pending";
        }
      });
      const carriedItems = await loadCarriedPendingItems(planRes.data.id);
      const seenKeys = new Set(
        [...loadedCurrent, ...loadedUpcoming].map((it) => `${(it.treatment_type || "").toLowerCase()}|${it.tooth_number || ""}`)
      );
      const carriedUnique = carriedItems.filter((it) => {
        const key = `${(it.treatment_type || "").toLowerCase()}|${it.tooth_number || ""}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });
      setPlanItems([...loadedCurrent, ...carriedUnique]);
      setUpcomingItems(loadedUpcoming);
      setTreatmentStatus(loadedStatus);
    } else {
      const carriedItems = await loadCarriedPendingItems(null);
      const seenKeys = new Set<string>();
      setPlanItems(
        carriedItems.filter((it) => {
          const key = `${(it.treatment_type || "").toLowerCase()}|${it.tooth_number || ""}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        })
      );
      setUpcomingItems([]);
      setTreatmentStatus(null);
    }


    setCurrentPrescriptionId(prescriptionRes.data?.id ?? null);
    setDiagnosis(prescriptionRes.data?.diagnosis || "");
    if (prescriptionRes.data?.id) {
      const { data: prescriptionItems } = await supabase
        .from("prescription_items")
        .select("medicine_name, dosage, frequency, duration, instructions")
        .eq("prescription_id", prescriptionRes.data.id)
        .order("created_at", { ascending: true });
      setMedicines((prescriptionItems || []).map((item: any) => {
        const parsedFrequency = parsePrescriptionFrequency(item.frequency);
        const medMaster = medicinesList.find(m => m.name === item.medicine_name);
        return {
          ...createEmptyMedicine(),
          medicine_type: medMaster?.type || "",
          medicine_name: item.medicine_name || "",
          dosage: item.dosage || "",
          frequency: parsedFrequency.frequency,
          duration: item.duration || "",
          instructions: item.instructions || "",
          morning: parsedFrequency.morning,
          afternoon: parsedFrequency.afternoon,
          evening: parsedFrequency.evening,
          night: parsedFrequency.night,
        };
      }));
    } else {
      setMedicines([]);
    }

    await fetchPreviousBillings();

    // Only apply the local in-progress draft when viewing today's workflow.
    // For historical dates we want to display exactly what was saved on that day.
    const isViewingToday = format(workflowDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
    const draft = isViewingToday ? readWorkflowDraft(patientId) : null;
    if (draft) {
      setVitals(draft.vitals ?? createEmptyVitalsState());
      setSelectedComplaints(draft.selectedComplaints ?? []);
      setOtherComplaint(draft.otherComplaint ?? "");
      setPastDentalNotes(draft.pastDentalNotes ?? "");
      setMedicalHistory(draft.medicalHistory ?? {});
      setOtherMedicalNotes(draft.otherMedicalNotes ?? "");
      setToothEntries(draft.toothEntries ?? []);
      setConsultGeneralFindings(draft.consultGeneralFindings ?? []);
      setConsultNotes(draft.consultNotes ?? "");
      setSelectedChartMode(draft.selectedChartMode ?? "adult");
      setPlanItems(draft.planItems ?? []);
      setUpcomingItems(draft.upcomingItems ?? []);
      setTreatmentStatus(draft.treatmentStatus ?? null);
      setPlanNotes(draft.planNotes ?? "");
      setPlanDoctor(draft.planDoctor ?? "");
      setProceededTeeth(new Set(draft.proceededTeeth ?? []));
      setBillingItems(draft.billingItems ?? []);
      setDiscount(draft.discount ?? "");
      setPaymentMethod(draft.paymentMethod ?? "cash");
      setInvoiceNumber(draft.invoiceNumber ?? "");
      setInvoiceDate(draft.invoiceDate ?? format(new Date(), "yyyy-MM-dd"));
      setMedicines(draft.medicines ?? []);
      setDiagnosis(draft.diagnosis ?? "");
      setLabOrders(draft.labOrders ?? []);
      if (draft.currentStep) {
        setCurrentStepRaw(draft.currentStep);
      }
    }
  };

  useEffect(() => {
    if (!selectedPatient) {
      setPatientAppointment(createEmptyAppointmentContext());
      setCurrentPlanId(null);
      return;
    }
    fetchPatientAppointment(selectedPatient.id);
  }, [selectedPatient, workflowDate]);

  // Sync invoice date to workflow date so all downstream records (billing/payment) anchor to selected date
  useEffect(() => {
    setInvoiceDate(format(workflowDate, "yyyy-MM-dd"));
  }, [workflowDate]);

  useEffect(() => {
    if (!selectedPatient || !activeCheckin) return;
    loadWorkflowRecords(selectedPatient.id, activeCheckin.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient, activeCheckin]);

  // Re-resolve check-in for the selected patient whenever the workflow date changes.
  // This ensures each date shows only that day's modules (vitals, photos, treatment,
  // prescription, lab orders, billing, etc.). A fresh date with no check-in shows blank.
  useEffect(() => {
    if (!selectedPatient) return;
    let cancelled = false;
    (async () => {
      const existing = await getLatestWorkflowDayCheckin(selectedPatient.id);
      if (cancelled) return;
      if (existing && (existing.status === "checked_in" || existing.status === "checked_out")) {
        setActiveCheckin(existing as any);
      } else {
        setActiveCheckin(null);
        // No check-in for this date. Reset server-backed IDs, but preserve
        // in-progress local draft (tooth entries, findings, etc.) so navigating
        // away via the sidebar and returning does NOT wipe the dental chart.
        const isViewingToday = format(workflowDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
        const draft = isViewingToday ? readWorkflowDraft(selectedPatient.id) : null;

        setVitals(draft?.vitals ?? createEmptyVitalsState());
        setSelectedComplaints(draft?.selectedComplaints ?? []);
        setOtherComplaint(draft?.otherComplaint ?? "");
        setPastDentalNotes(draft?.pastDentalNotes ?? "");
        setMedicalHistory(draft?.medicalHistory ?? {});
        setOtherMedicalNotes(draft?.otherMedicalNotes ?? "");
        setToothEntries(draft?.toothEntries ?? []);
        setConsultGeneralFindings(draft?.consultGeneralFindings ?? []);
        setConsultNotes(draft?.consultNotes ?? "");
        setPlanItems(draft?.planItems ?? []);
        setUpcomingItems(draft?.upcomingItems ?? []);
        setTreatmentStatus(draft?.treatmentStatus ?? null);
        setPlanNotes(draft?.planNotes ?? "");
        setMedicines(draft?.medicines ?? []);
        setDiagnosis(draft?.diagnosis ?? "");
        setSavedPhotos([]);
        setSavedLabOrders([]);
        setLabOrders(draft?.labOrders ?? []);
        setBillingItems(draft?.billingItems ?? []);
        setCurrentVitalsId(null);
        setChartId(null);
        setCurrentPlanId(null);
        setCurrentPrescriptionId(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowDate, selectedPatient?.id]);

  useEffect(() => {
    if (currentStep !== "billing") return;

    setBillingItems((prev) => mergeExistingBillingItems(prev));
  }, [currentStep, medicines, planItems, savedLabOrders, labOrders, medicinesList]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedPatient?.id) return;

    const sessionSnapshot: WorkflowSessionSnapshot = {
      patientId: selectedPatient.id,
      step: currentStep,
    };
    localStorage.setItem(CLINIC_WORKFLOW_SESSION_KEY, JSON.stringify(sessionSnapshot));
  }, [selectedPatient?.id, currentStep]);

  useEffect(() => {
    if (!selectedPatient?.id) return;

    const draft: WorkflowDraft = {
      currentStep,
      vitals,
      selectedComplaints,
      otherComplaint,
      pastDentalNotes,
      medicalHistory,
      otherMedicalNotes,
      toothEntries,
      consultGeneralFindings,
      consultNotes,
      selectedChartMode,
      planItems,
      upcomingItems,
      treatmentStatus,
      planNotes,
      planDoctor,
      proceededTeeth: Array.from(proceededTeeth),
      billingItems,
      discount,
      paymentMethod,
      invoiceNumber,
      invoiceDate,
      medicines,
      diagnosis,
      labOrders,
    };

    localStorage.setItem(getWorkflowDraftKey(selectedPatient.id), JSON.stringify(draft));
  }, [
    selectedPatient?.id,
    currentStep,
    vitals,
    selectedComplaints,
    otherComplaint,
    pastDentalNotes,
    medicalHistory,
    otherMedicalNotes,
    toothEntries,
    consultGeneralFindings,
    consultNotes,
    selectedChartMode,
    planItems,
    upcomingItems,
    treatmentStatus,
    planNotes,
    planDoctor,
    proceededTeeth,
    billingItems,
    discount,
    paymentMethod,
    invoiceNumber,
    invoiceDate,
    medicines,
    diagnosis,
    labOrders,
  ]);

  // Auto-save workflowDate (treatment date) on change — debounced, runs only on real changes
  const workflowDateDidMountRef = useRef(false);
  const lastSavedWorkflowDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedPatient?.id || !activeCheckin) return;
    if (!workflowDateDidMountRef.current) {
      workflowDateDidMountRef.current = true;
      lastSavedWorkflowDateRef.current = format(workflowDate, "yyyy-MM-dd");
      return;
    }
    const dateStr = format(workflowDate, "yyyy-MM-dd");
    if (lastSavedWorkflowDateRef.current === dateStr) return;
    const timer = setTimeout(() => {
      lastSavedWorkflowDateRef.current = dateStr;
      handleSaveChart();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowDate, selectedPatient?.id, activeCheckin?.id]);

  // Detect whether a Consultation has already been billed/paid for this checkin (DB lock for removal)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeCheckin?.id) { setConsultationBilledInDb(false); return; }
      const { data: bills } = await supabase
        .from("billings")
        .select("id, payment_status, amount_paid, billing_items(treatment_type)")
        .eq("checkin_id", activeCheckin.id);
      if (cancelled) return;
      const locked = (bills || []).some((b: any) =>
        Array.isArray(b.billing_items) &&
        b.billing_items.some((it: any) => String(it.treatment_type || "").toLowerCase() === "consultation")
      );
      setConsultationBilledInDb(locked);
    })();
    return () => { cancelled = true; };
  }, [activeCheckin?.id, planItems.length]);

  useEffect(() => {
    if (selectedPatient || urlPatientId || urlPatientQuery || typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(CLINIC_WORKFLOW_SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw) as WorkflowSessionSnapshot;
      if (!session?.patientId) return;

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("patient", session.patientId);
        next.set("step", session.step || "checkin");
        return next;
      }, { replace: true });
    } catch {
      localStorage.removeItem(CLINIC_WORKFLOW_SESSION_KEY);
    }
  }, [selectedPatient, urlPatientId, urlPatientQuery, setSearchParams]);

  useEffect(() => {
    if (currentStep === "lab_orders" && selectedPatient) {
      fetchLabOrders();
    }
    if (currentStep === "billing") {
      loadOrPopulateBilling();
      fetchPreviousBillings();
    }
  }, [currentStep, selectedPatient, activeCheckin, savedLabOrders, labOrders, medicines, planItems, medicinesList]);

  const buildBillingItemIdentity = (item: Pick<BillingItemDraft, "treatment_type" | "description" | "tooth_number">) =>
    [item.treatment_type, item.description, item.tooth_number]
      .map((value) => (value || "").trim().toLowerCase())
      .join("::");

  const buildTreatmentBillingItems = () =>
    planItems.reduce<typeof billingItems>((items, item) => {
      if (!item.treatment_type) return items;

      const toothCount = parseToothNumbers(item.tooth_number || "").length;
      items.push({
        treatment_type: item.treatment_type,
        description: item.description,
        tooth_number: item.tooth_number,
        quantity: String(toothCount || parseInt(item.quantity || "1") || 1),
        unit_price: item.estimated_cost || "0",
        category: "treatment",
      });

      return items;
    }, []);

  const buildPrescriptionBillingItems = () =>
    medicines.reduce<typeof billingItems>((items, med) => {
      if (!med.medicine_name) return items;

      const timingParts = [];
      if (med.morning !== "0") timingParts.push(`M:${med.morning}`);
      if (med.afternoon !== "0") timingParts.push(`A:${med.afternoon}`);
      if (med.evening !== "0") timingParts.push(`E:${med.evening}`);
      if (med.night !== "0") timingParts.push(`N:${med.night}`);

      const qty = calcMedicineQuantity(med);
      const medMaster = medicinesList.find((m) => m.name === med.medicine_name);
      const unitPrice = medMaster?.selling_price || Number(med.unit_cost || 0) || 0;

      const description = `${med.medicine_name} (${timingParts.join(", ")}) ${med.duration}`.trim();
      const dup = items.find((x) => x.description.trim().toLowerCase() === description.toLowerCase());
      if (dup) {
        dup.quantity = String((parseInt(dup.quantity) || 1) + (qty || 1));
        return items;
      }
      items.push({
        treatment_type: "Medicine",
        description,
        tooth_number: "",
        quantity: String(qty || 1),
        unit_price: String(unitPrice),
        category: "prescription",
      });

      return items;
    }, []);

  const buildLabBillingItems = (savedOrdersInput = savedLabOrders, draftOrdersInput = labOrders) => {
    const items: typeof billingItems = [];

    savedOrdersInput.filter((lo: any) => lo.status !== "delivered").forEach((lo: any) => {
      if (!lo.work_type) return;

      const toothStr = resolveLabOrderToothNumber(lo);
      const qty = parseToothNumbers(toothStr).length || 1;

      items.push({
        treatment_type: `Lab: ${lo.work_type.replace(/_/g, " ")}`,
        description: `${lo.lab_name}${lo.material ? ` - ${lo.material}` : ""}${toothStr ? ` (Teeth: ${toothStr})` : ""}`,
        tooth_number: toothStr,
        quantity: String(qty),
        unit_price: String(lo.patient_bill || 0),
        category: "lab",
      });
    });

    draftOrdersInput.forEach((lo) => {
      if (!lo.work_type || !lo.lab_name) return;

      const toothStr = resolveLabOrderToothNumber(lo);
      const qty = parseToothNumbers(toothStr).length || 1;

      items.push({
        treatment_type: `Lab: ${lo.work_type.replace(/_/g, " ")}`,
        description: `${lo.lab_name}${lo.material ? ` - ${lo.material}` : ""}${toothStr ? ` (Teeth: ${toothStr})` : ""}`,
        tooth_number: toothStr,
        quantity: String(qty),
        unit_price: lo.patient_bill || "0",
        category: "lab",
      });
    });

    return items;
  };

  const buildGeneratedBillingItems = (savedOrdersInput = savedLabOrders, draftOrdersInput = labOrders) => {
    const treatmentItems = buildTreatmentBillingItems();
    const prescriptionItems = buildPrescriptionBillingItems();
    const labItems = buildLabBillingItems(savedOrdersInput, draftOrdersInput);

    return {
      treatmentItems,
      prescriptionItems,
      labItems,
      items: [...treatmentItems, ...prescriptionItems, ...labItems],
    };
  };

  const isMedicineBillingLine = (item: BillingItemDraft) =>
    item.category === "prescription" || (item.treatment_type || "").trim().toLowerCase() === "medicine";
  const medicineNameFromBillingDescription = (description?: string) => {
    const d = (description || "").trim();
    const idx = d.indexOf(" (");
    return (idx >= 0 ? d.slice(0, idx) : d).trim().toLowerCase().replace(/\s+/g, " ");
  };

  const preferExistingBillingValue = (existingValue: string | undefined, fallbackValue: string) => {
    if (existingValue === undefined || existingValue === null || existingValue === "") return fallbackValue;
    return existingValue;
  };

  const mergeGeneratedBillingItem = (generatedItem: BillingItemDraft, existingItem?: BillingItemDraft): BillingItemDraft => {
    if (!existingItem) return generatedItem;

    return {
      ...generatedItem,
      treatment_type: preferExistingBillingValue(existingItem.treatment_type, generatedItem.treatment_type),
      description: preferExistingBillingValue(existingItem.description, generatedItem.description),
      tooth_number: preferExistingBillingValue(existingItem.tooth_number, generatedItem.tooth_number),
      quantity: preferExistingBillingValue(existingItem.quantity, generatedItem.quantity),
      unit_price: preferExistingBillingValue(existingItem.unit_price, generatedItem.unit_price),
      category: generatedItem.category || existingItem.category || "manual",
    };
  };

  const mergeExistingBillingItems = (
    existingItems: BillingItemDraft[],
    savedOrdersInput = savedLabOrders,
    draftOrdersInput = labOrders,
  ) => {
    const { treatmentItems, prescriptionItems, labItems } = buildGeneratedBillingItems(savedOrdersInput, draftOrdersInput);
    const existingItemsByIdentity = new Map(existingItems.map((item) => [buildBillingItemIdentity(item), item]));
    const consumed = new Set<BillingItemDraft>();
    const takeExact = (item: BillingItemDraft) => {
      const match = existingItemsByIdentity.get(buildBillingItemIdentity(item));
      if (match && !consumed.has(match)) { consumed.add(match); return match; }
      return undefined;
    };

    const mergedTreatmentItems = treatmentItems.map((item) => mergeGeneratedBillingItem(item, takeExact(item)));
    const mergedLabItems = labItems.map((item) => mergeGeneratedBillingItem(item, takeExact(item)));
    // Medicines: match by medicine name (timing/duration may change after first transfer).
    // A stale line for the same medicine is replaced, never kept alongside the new one.
    const mergedPrescriptionItems = prescriptionItems.map((item) => {
      const exact = takeExact(item);
      if (exact) return mergeGeneratedBillingItem(item, exact);
      const name = medicineNameFromBillingDescription(item.description);
      const sameName = existingItems.find(
        (e) => !consumed.has(e) && isMedicineBillingLine(e) && medicineNameFromBillingDescription(e.description) === name,
      );
      if (!sameName) return item;
      consumed.add(sameName);
      return { ...item, unit_price: preferExistingBillingValue(sameName.unit_price, item.unit_price) };
    });

    const extraItems = existingItems
      .filter((item) => !consumed.has(item))
      .map((item) => ({ ...item, category: item.category || "manual" }));

    return [...mergedTreatmentItems, ...mergedPrescriptionItems, ...mergedLabItems, ...extraItems];
  };

  // If a billing already exists for this checkin, merge its manual items with fresh workflow items
  const loadOrPopulateBilling = async () => {
    const draftBillingItems = selectedPatient?.id ? (readWorkflowDraft(selectedPatient.id)?.billingItems ?? []) : [];
    const billingSeedItems = billingItems.length > 0 ? billingItems : draftBillingItems;

    if (!activeCheckin) {
      setBillingItems(mergeExistingBillingItems(billingSeedItems));
      setBillingAutoPopulated(true);
      return;
    }
    const { data: existingBill } = await supabase
      .from("billings")
      .select("id, invoice_number, discount_amount, payment_status")
      .eq("checkin_id", activeCheckin.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Hydrate billing step from saved items whenever a bill exists (paid or unpaid)
    // so historical prices are preserved instead of being recomputed from current masters.
    if (existingBill) {
      const { data: items } = await supabase
        .from("billing_items")
        .select("*")
        .eq("billing_id", existingBill.id)
        .order("created_at", { ascending: true });
      const savedItems: BillingItemDraft[] = (items || []).map((it: any) => ({
        treatment_type: it.treatment_type || "",
        description: it.description || "",
        tooth_number: it.tooth_number || "",
        quantity: String(it.quantity || 1),
        unit_price: String(it.unit_price ?? 0),
        category: "manual",
      }));
      // For paid/historical bills, show exactly what was saved (no regeneration from masters).
      const finalItems = existingBill.payment_status === "paid"
        ? savedItems
        : mergeExistingBillingItems(savedItems);
      setBillingItems(finalItems);
      setInvoiceNumber(existingBill.invoice_number || "");
      const discValue = String(existingBill.discount_amount || "");
      setDiscount(discValue);
      setBillingAutoPopulated(true);
      billingSavedSnapshotRef.current = computeBillingSnapshot(finalItems, discValue);
      return;
    }

    const seeded = mergeExistingBillingItems(billingSeedItems);
    setBillingItems(seeded);
    setBillingAutoPopulated(true);
    billingSavedSnapshotRef.current = computeBillingSnapshot(seeded, discount);
  };

  const autoPopulateBilling = (savedOrdersInput = savedLabOrders, draftOrdersInput = labOrders) => {
    setBillingItems((prev) => mergeExistingBillingItems(prev, savedOrdersInput, draftOrdersInput));
    setInvoiceNumber((prev) => prev || `INV-${Date.now().toString(36).toUpperCase()}`);
    setInvoiceDate((prev) => prev || format(new Date(), "yyyy-MM-dd"));
  };


  const applyPrescriptionTemplate = async (templateId: string) => {
    const { data } = await supabase.from("prescription_template_items").select("*").eq("template_id", templateId).order("sort_order");
    if (data && data.length > 0) {
      const items = data.map((item: any) => {
        const medMaster = medicinesList.find((m) => m.name === item.medicine_name);
        return {
          medicine_type: medMaster?.type || "",
          medicine_name: item.medicine_name || "",
          dosage: item.dosage || "",
          frequency: item.frequency || "",
          duration: item.duration || "",
          instructions: item.instructions || "",
          morning: item.morning || "0",
          afternoon: item.afternoon || "0",
          evening: item.evening || "0",
          night: item.night || "0",
        };
      });
      const seen = new Set<string>();
      const unique = items.filter((m) => {
        const k = [m.medicine_name, m.dosage, m.morning, m.afternoon, m.evening, m.night, m.duration]
          .map((v) => String(v || "").trim().toLowerCase()).join("|");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setMedicines(unique);
    }
  };

  const emptyTemplateItem = () => ({ medicine_name: "", dosage: "", frequency: "", morning: "0", afternoon: "0", evening: "0", night: "0", duration: "", instructions: "" });

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: "", treatment_category: "", description: "" });
    setTemplateItems([emptyTemplateItem()]);
    setShowTemplateDialog(true);
  };

  const openEditTemplate = async (t: any) => {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, treatment_category: t.treatment_category || "", description: t.description || "" });
    const { data } = await supabase.from("prescription_template_items").select("*").eq("template_id", t.id).order("sort_order");
    if (data && data.length > 0) {
      setTemplateItems(data.map((d: any) => ({
        medicine_name: d.medicine_name || "", dosage: d.dosage || "", frequency: d.frequency || "",
        morning: d.morning || "0", afternoon: d.afternoon || "0", evening: d.evening || "0", night: d.night || "0",
        duration: d.duration || "", instructions: d.instructions || "",
      })));
    } else {
      setTemplateItems([emptyTemplateItem()]);
    }
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) { toast({ title: "Template name required", variant: "destructive" }); return; }
    const validItems = templateItems.filter(it => it.medicine_name.trim());
    if (validItems.length === 0) { toast({ title: "Add at least one medicine", variant: "destructive" }); return; }

    let templateId: string;
    if (editingTemplate) {
      await supabase.from("prescription_templates").update({ ...templateForm, updated_at: new Date().toISOString() }).eq("id", editingTemplate.id);
      templateId = editingTemplate.id;
      await supabase.from("prescription_template_items").delete().eq("template_id", templateId);
      toast({ title: "Template updated" });
    } else {
      const { data } = await supabase.from("prescription_templates").insert(templateForm).select("id").single();
      if (!data) { toast({ title: "Error creating template", variant: "destructive" }); return; }
      templateId = data.id;
      toast({ title: "Template created" });
    }
    const insertItems = validItems.map((it, idx) => ({ ...it, template_id: templateId, sort_order: idx }));
    await supabase.from("prescription_template_items").insert(insertItems);
    setShowTemplateDialog(false);
    fetchPrescriptionTemplates();
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("prescription_templates").delete().eq("id", id);
    toast({ title: "Template deleted" });
    fetchPrescriptionTemplates();
  };

  const updateTemplateItem = (idx: number, field: string, value: string) => {
    const n = [...templateItems]; n[idx] = { ...n[idx], [field]: value }; setTemplateItems(n);
  };

  const fetchPatientAppointment = async (patientId: string) => {
    const { dateStr } = getWorkflowDayBounds();
    // 1) Try to find an appointment for the current workflow date.
    const { data } = await supabase
      .from("appointments")
      .select("id, source, doctor, assistant, type")
      .eq("patient_id", patientId)
      .eq("appointment_date", dateStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setPatientAppointment({ id: data.id, source: data.source || "walk-in", doctor: data.doctor || "", assistant: (data as any).assistant || "", type: data.type || "consultation" });
      return;
    }
    // 2) Fallback: auto-fetch source/doctor/assistant/type from the patient's most recent appointment
    //    so the check-in screen pre-fills what was chosen in the New Appointment form.
    const { data: latest } = await supabase
      .from("appointments")
      .select("source, doctor, assistant, type")
      .eq("patient_id", patientId)
      .order("appointment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      setPatientAppointment({
        id: null,
        source: latest.source || "walk-in",
        doctor: latest.doctor || "",
        assistant: (latest as any).assistant || "",
        type: latest.type || "consultation",
      });
    } else {
      setPatientAppointment(createEmptyAppointmentContext());
    }
  };

  const ensureAppointmentRecord = async (overrides: Partial<Omit<AppointmentContext, "id">> = {}, status = "scheduled") => {
    if (!selectedPatient) return null;
    if (patientAppointment.id) return patientAppointment.id;

    const timeNow = format(new Date(), "HH:mm:ss");
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        patient_id: selectedPatient.id,
        appointment_date: format(workflowDate, "yyyy-MM-dd"),
        start_time: timeNow,
        end_time: timeNow,
        status,
        source: overrides.source ?? patientAppointment.source,
        doctor: overrides.doctor ?? (patientAppointment.doctor || null),
        assistant: overrides.assistant ?? (patientAppointment.assistant || null),
        type: overrides.type ?? patientAppointment.type,
      } as any)
      .select("id, source, doctor, assistant, type")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    }

    setPatientAppointment({
      id: data.id,
      source: data.source || "walk-in",
      doctor: data.doctor || "",
      assistant: (data as any).assistant || "",
      type: data.type || "consultation",
    });

    return data.id;
  };

  const updateAppointmentField = async (field: string, value: string) => {
    setPatientAppointment((prev) => ({ ...prev, [field]: value }));
    const existingId = patientAppointment.id;
    const appointmentId = existingId ?? await ensureAppointmentRecord({ [field]: value });
    if (!appointmentId) return;

    if (existingId) {
      const { error } = await supabase.from("appointments").update({ [field]: value } as any).eq("id", appointmentId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    }

    // Cascade doctor change across this visit: local plan state + persisted plan/items
    if (field === "doctor") {
      setPlanDoctor(value);
      setPlanItems((prev) => prev.map((it) => ({ ...it, doctor: value })));
      const checkinId = activeCheckin?.id;
      if (checkinId) {
        const { data: plans } = await supabase
          .from("treatment_plans")
          .update({ doctor: value } as any)
          .eq("checkin_id", checkinId)
          .select("id");
        const planIds = (plans || []).map((p: any) => p.id);
        if (planIds.length) {
          await supabase.from("treatment_plan_items").update({ doctor: value } as any).in("plan_id", planIds);
        }
      }

      toast({
        title: "Doctor updated successfully",
        description:
          "This will update the doctor's name across the entire flow, history, and records for this visit.",
      });
    } else {
      toast({ title: `${field.charAt(0).toUpperCase() + field.slice(1)} updated!` });
    }

    fetchTodayCheckins();
    fetchTodayAppointments();
  };


  const fetchTodayCheckins = async () => {
    const { dateStr, dayStartISO, dayEndISO } = getWorkflowDayBounds();
    const { data: checkedInAppointments } = await supabase
      .from("appointments")
      .select("id, patient_id, source, doctor, assistant, type, status, start_time, checkin_time, patients(first_name, last_name, phone)")
      .eq("appointment_date", dateStr)
      .eq("status", "checked-in")
      .order("checkin_time", { ascending: false, nullsFirst: false })
      .order("start_time", { ascending: false, nullsFirst: false });

    const { data } = await supabase
      .from("patient_checkins")
      .select("*, patients(first_name, last_name, phone)")
      .gte("checkin_time", dayStartISO)
      .lte("checkin_time", dayEndISO)
      .order("checkin_time", { ascending: false });

    const latestCheckinByPatient = new Map<string, any>();
    (data ?? []).forEach((checkin: any) => {
      if (!latestCheckinByPatient.has(checkin.patient_id)) {
        latestCheckinByPatient.set(checkin.patient_id, checkin);
      }
    });

    const queueRows = (checkedInAppointments ?? []).map((appointment: any) => {
      const activeCheckin = latestCheckinByPatient.get(appointment.patient_id);

      return {
        id: activeCheckin?.id ?? appointment.id,
        patient_id: appointment.patient_id,
        status: activeCheckin?.status === "checked_in" ? "checked_in" : "appointment_checked_in",
        checkin_time: activeCheckin?.checkin_time ?? `${dateStr}T${appointment.checkin_time || appointment.start_time || "00:00:00"}`,
        patients: appointment.patients,
        appointment,
      };
    });

    setTodayCheckins(queueRows);
  };

  const fetchTodayAppointments = async () => {
    const { dateStr } = getWorkflowDayBounds();
    const { data } = await supabase
      .from("appointments")
      .select("*, patients(id, first_name, last_name, phone, email, date_of_birth, gender, patient_code, address, location, district, medical_notes, is_high_ticket)")
      .eq("appointment_date", dateStr)
      .in("status", ["scheduled", "confirmed"])
      .order("start_time");
    if (data) setTodayAppointments(data);
  };

  const handleAppointmentCheckin = async (appointment: any) => {
    const patient = appointment.patients;
    if (!patient) return;
    setSelectedPatient(patient);
    setCurrentStep("checkin");
    setPatientAppointment({ id: appointment.id, source: appointment.source || "walk-in", doctor: appointment.doctor || "", assistant: appointment.assistant || "", type: appointment.type || "consultation" });

    // Load existing check-in if any (do NOT auto check-in — staff must click the Check-in button)
    const existingCheckin = await getLatestWorkflowDayCheckin(patient.id);

    if (existingCheckin?.status === "checked_in") {
      setActiveCheckin(existingCheckin);
    } else {
      setActiveCheckin(null);
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.includes(searchTerm)) ||
      (p.patient_code && String(p.patient_code).includes(searchTerm))
  );

  // Quick patient search bar for non-checkin steps
  const renderQuickPatientSearch = () => (
    <div className="bg-secondary/30 rounded-lg p-3 space-y-2 mb-4">
      <div className="flex items-center gap-2">
        {selectedPatient ? (
          <div className="flex items-center gap-3 flex-1">
            <Badge variant="outline" className="text-xs">P.ID: {formatPatientCode(selectedPatient.patient_code)}</Badge>
            <span className="text-sm font-semibold">{selectedPatient.first_name} {selectedPatient.last_name}</span>
            <span className="text-xs text-muted-foreground">{selectedPatient.phone}</span>
            <Button variant="ghost" size="sm" className="ml-auto text-xs h-7" onClick={() => { localStorage.removeItem(CLINIC_WORKFLOW_SESSION_KEY); setSelectedPatient(null); setActiveCheckin(null); }}>
              <X size={12} className="mr-1" /> Change
            </Button>
          </div>
        ) : (
          <div className="flex-1 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patient by name, phone or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {searchTerm && (
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto bg-card">
                {filteredPatients.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPatient(p); setSearchTerm(""); }}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/50 text-left text-xs"
                  >
                    <span className="font-medium">{p.first_name} {p.last_name}</span>
                    <span className="text-muted-foreground">{p.phone} · {formatPatientCode(p.patient_code)}</span>
                  </button>
                ))}
                {filteredPatients.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No patients found</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );


  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const handleCheckin = async () => {
    if (!selectedPatient) return;
    // Guard against double-click; allow re-check-in same day if previous visit was already checked out
    if (isCheckingIn) return;
    if (activeCheckin && activeCheckin.status === "checked_in") return;
    setIsCheckingIn(true);
    setCurrentStep("checkin");

    try {
      // Prevent duplicate active check-in for today (allow new visit after checkout)
      const { dateStr } = getWorkflowDayBounds();
      const existingCheckin = await getLatestWorkflowDayCheckin(selectedPatient.id);

      if (existingCheckin?.status === "checked_in") {
        setActiveCheckin(existingCheckin);
        toast({ title: `${selectedPatient.first_name} already checked in today!`, description: "Existing check-in loaded." });
        return;
      }

      const isRevisit = existingCheckin?.status === "checked_out";

      const { data, error } = await supabase.from("patient_checkins").insert({
        patient_id: selectedPatient.id, status: "checked_in", checkin_time: workflowTimestampISO(),
      }).select().single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      setActiveCheckin(data);

      // For a same-day revisit, reset the per-visit workflow state so the new visit starts fresh
      if (isRevisit) {
        setVitals(createEmptyVitalsState());
        setSelectedComplaints([]);
        setOtherComplaint("");
        setPastDentalNotes("");
        setMedicalHistory({});
        setOtherMedicalNotes("");
        setToothEntries([]);
        setConsultGeneralFindings([]);
        setConsultNotes("");
        setPlanItems([]);
        setUpcomingItems([]);
        setTreatmentStatus(null);
        setPlanNotes("");
        setMedicines([]);
        setDiagnosis("");
        setSavedPhotos([]);
        setSavedLabOrders([]);
        setLabOrders([]);
        setBillingItems([]);
        setCurrentVitalsId(null);
        setChartId(null);
        setCurrentPlanId(null);
        setCurrentPrescriptionId(null);
      }

      // Sync to selected-date appointment so Appointments page reflects check-in
      const workflowTimestamp = new Date(workflowTimestampISO());
      const checkinTimeStr = workflowTimestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (patientAppointment.id) {
        await supabase.from("appointments").update({
          status: "checked-in",
          checkin_time: checkinTimeStr,
        }).eq("id", patientAppointment.id);
      } else {
        const { data: todayApt } = await supabase
          .from("appointments")
          .select("id")
          .eq("patient_id", selectedPatient.id)
          .eq("appointment_date", dateStr)
          .in("status", ["scheduled", "confirmed"])
          .order("start_time", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (todayApt) {
          await supabase.from("appointments").update({
            status: "checked-in",
            checkin_time: checkinTimeStr,
          }).eq("id", todayApt.id);
        }
      }

      toast({ title: `${selectedPatient.first_name} checked in!` });
      fetchTodayCheckins();
      fetchTodayAppointments();
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleSaveVitals = () => runLocked("vitals", async () => {
    if (!activeCheckin || !selectedPatient) return;

    const vitalsPayload = {
      checkin_id: activeCheckin.id,
      patient_id: selectedPatient.id,
      blood_pressure_systolic: vitals.blood_pressure_systolic ? parseInt(vitals.blood_pressure_systolic) : null,
      blood_pressure_diastolic: vitals.blood_pressure_diastolic ? parseInt(vitals.blood_pressure_diastolic) : null,
      pulse_rate: vitals.pulse_rate ? parseInt(vitals.pulse_rate) : null,
      temperature: vitals.temperature ? parseFloat(vitals.temperature) : null,
      weight: vitals.weight ? parseFloat(vitals.weight) : null,
      height: vitals.height ? parseFloat(vitals.height) : null,
      spo2: vitals.spo2 ? parseInt(vitals.spo2) : null,
      blood_sugar: vitals.blood_sugar ? parseFloat(vitals.blood_sugar) : null,
      notes: buildVitalsNotesPayload(
        vitals.notes,
        selectedComplaints,
        otherComplaint,
        pastDentalNotes,
        medicalHistory,
        otherMedicalNotes
      ),
    };

    let resolvedVitalsId = currentVitalsId;
    if (!resolvedVitalsId) {
      const { data: existingVitals, error: existingVitalsError } = await supabase
        .from("patient_vitals")
        .select("id")
        .eq("checkin_id", activeCheckin.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingVitalsError) {
        toast({ title: "Error", description: existingVitalsError.message, variant: "destructive" });
        return;
      }

      resolvedVitalsId = existingVitals?.id ?? null;
    }

    const query = resolvedVitalsId
      ? supabase.from("patient_vitals").update(vitalsPayload).eq("id", resolvedVitalsId).select("id").single()
      : supabase.from("patient_vitals").insert(vitalsPayload).select("id").single();

    const { data, error } = await query;

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    if (data?.id) {
      setCurrentVitalsId(data.id);
    }

    toast({ title: resolvedVitalsId ? "Vitals updated!" : "Vitals recorded!" });
  });

  const handleSaveToothEntry = (entry: ToothEntry) => {
    setToothEntries((prev) => {
      // "healthy" clears all findings for this tooth
      if (entry.condition === "healthy") {
        return prev.filter((e) => e.tooth_number !== entry.tooth_number);
      }
      // Multiple findings allowed per tooth — dedupe by (tooth_number + condition)
      const idx = prev.findIndex(
        (e) => e.tooth_number === entry.tooth_number && e.condition === entry.condition
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      }
      return [...prev, entry];
    });
  };

  const handleSaveChart = (): Promise<boolean | undefined> => runLocked<boolean>("chart", async () => {
    if (!selectedPatient || !activeCheckin) return false;
    if (!patientAppointment?.doctor || !patientAppointment.doctor.trim()) {
      toast({ title: "Consulting Doctor required", description: "Please select a Consulting Doctor before continuing.", variant: "destructive" });
      return false;
    }



    const wfTs = workflowTimestampISO();
    let resolvedChartId = chartId;

    if (!resolvedChartId) {
      const { data: existingChart, error: existingChartError } = await supabase
        .from("dental_charts")
        .select("id")
        .eq("checkin_id", activeCheckin.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingChartError) {
        toast({ title: "Error", description: existingChartError.message, variant: "destructive" });
        return false;
      }

      resolvedChartId = existingChart?.id ?? null;
    }

    const chartPayload = {
      patient_id: selectedPatient.id,
      checkin_id: activeCheckin.id,
      chart_type: selectedChartMode === "kids" ? "child" : "adult",
      notes: consultNotes,
      updated_at: wfTs,
    };

    const chartQuery = resolvedChartId
      ? supabase.from("dental_charts").update(chartPayload).eq("id", resolvedChartId).select().single()
      : supabase.from("dental_charts").insert({ ...chartPayload, created_at: wfTs }).select().single();

    const { data: chart, error } = await chartQuery;
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }

    const { error: deleteEntriesError } = await supabase
      .from("dental_chart_entries")
      .delete()
      .eq("chart_id", chart.id);

    if (deleteEntriesError) {
      toast({ title: "Error", description: deleteEntriesError.message, variant: "destructive" });
      return false;
    }

    const entries: any[] = [];
    if (toothEntries.length > 0) {
      toothEntries.forEach((e) => entries.push({
        chart_id: chart.id,
        tooth_number: e.tooth_number,
        condition: e.condition,
        treatment_needed: e.treatment_needed || null,
        notes: e.notes || null,
        surface: e.surface || null,
      }));
    }
    if (consultGeneralFindings.length > 0) {
      consultGeneralFindings.forEach((g) => entries.push({
        chart_id: chart.id,
        tooth_number: 0,
        condition: g.condition,
        treatment_needed: g.treatment_needed || null,
        notes: null,
        surface: null,
      }));
    }
    if (entries.length > 0) {
      const { error: entriesError } = await supabase.from("dental_chart_entries").insert(entries);
      if (entriesError) {
        toast({ title: "Error", description: entriesError.message, variant: "destructive" });
        return false;
      }
    }
    setChartId(chart.id);
    toast({ title: resolvedChartId ? "Dental chart updated!" : "Dental chart saved!" });

    // Mirror findings into the immutable lifecycle log (additive, idempotent).
    try {
      await syncFindingsFromChart({
        patientId: selectedPatient.id,
        checkinId: activeCheckin.id,
        appointmentId: patientAppointment.id || null,
        chartId: chart.id,
        doctor: patientAppointment.doctor || null,
        recordedAtISO: wfTs,
        toothEntries: toothEntries.map((e) => ({
          tooth_number: e.tooth_number,
          surface: e.surface || null,
          condition: e.condition,
          treatment_needed: e.treatment_needed || null,
          notes: e.notes || null,
        })),
        generalFindings: consultGeneralFindings.map((g) => ({
          condition: g.condition,
          treatment_needed: g.treatment_needed || null,
        })),
      });
    } catch (lifecycleErr) {
      // Lifecycle sync is non-blocking — primary chart save already succeeded.
      console.error("findings lifecycle sync failed", lifecycleErr);
    }

    // Treatment items are added only via "Proceed" button on specific findings
    fetchSavedPhotos();
    return true;
  });

  const handleSaveTreatmentPlan = (): Promise<boolean | undefined> => runLocked<boolean>("treatment_plan", async () => {
    if (!selectedPatient || !activeCheckin) return false;
    // Treatment Status is optional — navigation is not blocked by its selection.
    // Dental Assistant is still recommended when marking Treatment Done, but does not block navigation.
    if (treatmentStatus === "completed") {
      const missing = planItems.reduce<number[]>((acc, item, idx) => {
        const hasContent = (item.treatment_type && item.treatment_type.trim() !== "") || (item.tooth_number && item.tooth_number.trim() !== "");
        if (hasContent && !(item.assistant && item.assistant.trim() !== "")) acc.push(idx);
        return acc;
      }, []);
      if (missing.length > 0) {
        setAssistantErrorRows(new Set(missing));
        toast({ title: "Dental Assistant recommended", description: "Please select a Dental Assistant for completed treatments.", variant: "destructive" });
        // Do not block; allow navigation while highlighting the missing rows.
      } else {
        setAssistantErrorRows(new Set());
      }
    } else {
      setAssistantErrorRows(new Set());
    }
    const totalCost = planItems.reduce((sum, item) => sum + (parseFloat(item.estimated_cost) || 0), 0);
    const wfTs = workflowTimestampISO();
    let resolvedPlanId = currentPlanId;

    if (!resolvedPlanId) {
      const { data: existingPlan, error: existingPlanError } = await supabase
        .from("treatment_plans")
        .select("id")
        .eq("checkin_id", activeCheckin.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPlanError) {
        toast({ title: "Error", description: existingPlanError.message, variant: "destructive" });
        return false;
      }

      resolvedPlanId = existingPlan?.id ?? null;
    }

    const planPayload = {
      patient_id: selectedPatient.id,
      checkin_id: activeCheckin.id,
      chart_id: chartId,
      total_estimated_cost: totalCost,
      notes: planNotes,
      doctor: planDoctor,
      status: treatmentStatus === "completed" ? "completed" : "pending",
      updated_at: wfTs,
    };

    const planQuery = resolvedPlanId
      ? supabase.from("treatment_plans").update(planPayload).eq("id", resolvedPlanId).select().single()
      : supabase.from("treatment_plans").insert({ ...planPayload, created_at: wfTs }).select().single();

    const { data: plan, error } = await planQuery;
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    setCurrentPlanId(plan.id);

    const itemStatus = treatmentStatus === "completed" ? "completed" : "pending";

    // Rows that already live on an earlier visit's plan (carried-over stages).
    // They are updated in place so history stays intact — never duplicated.
    const carriedItems = planItems.filter((it) => it.source_plan_id && it.id);
    const nativeItems = planItems.filter((it) => !it.source_plan_id);

    const filledUpcoming = upcomingItems.filter(
      (item) => (item.treatment_type && item.treatment_type.trim() !== "") || (item.tooth_number && item.tooth_number.trim() !== "")
    );

    // Stage progression: completing a stage does NOT complete the treatment.
    // The next clinical stage is queued as a pending stage so the patient stays
    // in Pending Treatment until the final stage is done.
    const stageKey = (treatment: string, tooth: string) => `${treatment.trim().toLowerCase()}|${(tooth || "").trim()}`;
    const existingKeys = new Set<string>([
      ...planItems.map((it) => stageKey(it.treatment_type || "", it.tooth_number || "")),
      ...filledUpcoming.map((it) => stageKey(it.treatment_type || "", it.tooth_number || "")),
    ]);
    const nextStageRows: any[] = [];
    if (itemStatus === "completed") {
      planItems.forEach((item) => {
        if (!item.treatment_type || item.treatment_type.trim() === "") return;
        const nextStage = getNextStage(item.treatment_type);
        if (!nextStage) return;
        const key = stageKey(nextStage, item.tooth_number || "");
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        nextStageRows.push({
          plan_id: plan.id,
          tooth_number: item.tooth_number ? parseInt(item.tooth_number) || null : null,
          treatment_type: nextStage,
          description: item.description || "",
          estimated_cost: 0,
          priority: item.priority || "normal",
          doctor: item.doctor || planDoctor || null,
          assistant: null,
          status: "pending" as const,
          created_at: wfTs,
          completed_at: null,
        });
      });
    }

    const allSaveItems = [
      ...nativeItems.map((item) => ({
        plan_id: plan.id,
        tooth_number: item.tooth_number ? parseInt(item.tooth_number) || null : null,
        treatment_type: item.treatment_type,
        description: item.description,
        estimated_cost: parseFloat(item.estimated_cost) || 0,
        priority: item.priority,
        doctor: item.doctor || planDoctor || null,
        assistant: item.assistant || null,
        status: itemStatus,
        created_at: wfTs,
        // For "Treatment Done" rows, anchor completion to the workflow date so KPI
        // achievement (Operations dashboard) credits the correct visit day.
        completed_at: itemStatus === "completed" ? wfTs : null,
      })),
      // Only persist upcoming rows the user actually filled in (treatment selected
      // OR teeth chosen). Skips the auto-seeded blank row so History doesn't show
      // an empty "upcoming" entry when nothing was added.
      ...filledUpcoming.map((item) => ({
        plan_id: plan.id,
        tooth_number: item.tooth_number ? parseInt(item.tooth_number) : null,
        treatment_type: item.treatment_type,
        description: item.description,
        estimated_cost: parseFloat(item.estimated_cost) || 0,
        priority: item.priority,
        doctor: item.doctor || planDoctor || null,
        assistant: item.assistant || null,
        status: "upcoming" as const,
        created_at: wfTs,
      })),
      ...nextStageRows,
    ];
    if (resolvedPlanId) {
      const { error: deleteItemsError } = await supabase
        .from("treatment_plan_items")
        .delete()
        .eq("plan_id", resolvedPlanId);

      if (deleteItemsError) {
        toast({ title: "Error", description: deleteItemsError.message, variant: "destructive" });
        return false;
      }
    }

    if (allSaveItems.length > 0) {
      const { error: insertItemsError } = await supabase.from("treatment_plan_items").insert(allSaveItems);
      if (insertItemsError) {
        toast({ title: "Error", description: insertItemsError.message, variant: "destructive" });
        return false;
      }
    }

    // Advance carried-over stages in place (minimal writes: only when changed).
    for (const item of carriedItems) {
      const { error: carriedError } = await supabase
        .from("treatment_plan_items")
        .update({
          status: itemStatus,
          doctor: item.doctor || planDoctor || null,
          assistant: item.assistant || null,
          completed_at: itemStatus === "completed" ? wfTs : null,
        } as any)
        .eq("id", item.id as string);
      if (carriedError) {
        toast({ title: "Error", description: carriedError.message, variant: "destructive" });
        return false;
      }
    }

    // Overall treatment status: stays open while any stage remains.
    const stagesRemain = nextStageRows.length > 0 || filledUpcoming.length > 0 || itemStatus === "pending";
    const overallPlanStatus = stagesRemain ? "pending" : "completed";
    if (overallPlanStatus !== planPayload.status) {
      await supabase.from("treatment_plans").update({ status: overallPlanStatus } as any).eq("id", plan.id);
    }

    // Recalculate this patient's Pending Treatment eligibility across every one of
    // their treatments (patient-scoped, minimal writes, no history touched).
    const sync = await syncPendingTreatmentForPatient(selectedPatient.id);

    toast({
      title:
        itemStatus === "completed"
          ? sync.stillPending
            ? "Stage completed — treatment In Progress"
            : "All treatments completed"
          : "Treatment marked Pending",
      description: sync.stillPending
        ? sync.openStages.length > 0
          ? `Pending stages: ${sync.openStages.join(", ")}`
          : undefined
        : itemStatus === "completed"
          ? "Patient removed from Pending Treatment"
          : undefined,
    });


    setBillingItems((prev) => mergeExistingBillingItems(prev));
    return true;
  });


  const fetchSavedPhotos = async () => {
    if (!selectedPatient) return;
    const { data } = await supabase
      .from("clinical_photos")
      .select("id, file_path, file_name, photo_type, tooth_number, notes, created_at")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false });
    setSavedPhotos(data || []);
  };

  const getPhotoUrl = (filePath: string) => photoUrls[filePath] || "";

  // Resolve signed URLs for all saved photos whenever the list changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paths = savedPhotos.map((p) => p.file_path).filter(Boolean);
      if (paths.length === 0) { setPhotoUrls({}); return; }
      const entries = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage.from("clinical-photos").createSignedUrl(path, 60 * 60 * 24);
          return [path, data?.signedUrl || ""] as const;
        })
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      entries.forEach(([k, v]) => { if (v) map[k] = v; });
      setPhotoUrls(map);
    })();
    return () => { cancelled = true; };
  }, [savedPhotos]);

  // Fetch saved media as actual File objects so we can share/download the real file (not a link)
  const fetchAsFiles = async (
    items: { file_path: string; file_name: string | null; photo_type: string }[]
  ): Promise<File[]> => {
    const files: File[] = [];
    for (const it of items) {
      try {
        let url = getPhotoUrl(it.file_path);
        if (!url) {
          const { data } = await supabase.storage.from("clinical-photos").createSignedUrl(it.file_path, 60 * 60);
          url = data?.signedUrl || "";
        }
        if (!url) continue;
        const res = await fetch(url);
        const blob = await res.blob();
        const ext = (it.file_path.split(".").pop() || (it.photo_type === "video" ? "mp4" : "jpg")).toLowerCase();
        const name = it.file_name && it.file_name.includes(".") ? it.file_name : `${it.file_name || it.photo_type || "media"}.${ext}`;
        files.push(new File([blob], name, { type: blob.type || (it.photo_type === "video" ? "video/mp4" : "image/jpeg") }));
      } catch (e) {
        console.error("fetchAsFiles failed", e);
      }
    }
    return files;
  };

  const downloadFiles = async (
    items: { file_path: string; file_name: string | null; photo_type: string }[]
  ) => {
    if (items.length === 0) return;
    const files = await fetchAsFiles(items);
    for (const f of files) {
      const blobUrl = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // small delay so the browser can register each download
      await new Promise((r) => setTimeout(r, 200));
      URL.revokeObjectURL(blobUrl);
    }
    toast({ title: `${files.length} file(s) downloaded` });
  };

  const shareFilesNative = async (
    items: { file_path: string; file_name: string | null; photo_type: string }[],
    title: string,
    text: string
  ): Promise<boolean> => {
    if (items.length === 0) return false;
    try {
      const files = await fetchAsFiles(items);
      const navAny = navigator as any;
      if (files.length > 0 && navAny.canShare && navAny.canShare({ files })) {
        await navAny.share({ files, title, text });
        return true;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return true;
      console.error("Native share failed", e);
    }
    return false;
  };



  const CAMERA_KEY = "clinic_camera_device_id";

  const cameraLabel = (d: MediaDeviceInfo, i: number) => {
    const l = d.label || "";
    if (!l) return `Camera ${i + 1}`;
    if (/intraoral|usb|dental|endoscope/i.test(l)) return `Intraoral USB Camera – ${l}`;
    if (/integrated|built-in|facetime|front|back|webcam/i.test(l)) return `Integrated Webcam – ${l}`;
    return l;
  };

  const refreshCameraDevices = async (): Promise<MediaDeviceInfo[]> => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      // Browsers return blank deviceIds before camera permission is granted — skip those
      const vids = all.filter(d => d.kind === "videoinput" && !!d.deviceId);
      setCameraDevices(vids);
      return vids;
    } catch { return []; }
  };

  const openCameraStream = async (deviceId?: string): Promise<MediaStream> => {
    const attempts: MediaStreamConstraints[] = [];
    if (deviceId) {
      attempts.push({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, frameRate: { ideal: 30, min: 15 } } });
      attempts.push({ video: { deviceId: { exact: deviceId } } });
    } else {
      attempts.push({ video: { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, frameRate: { ideal: 30, min: 15 } } });
    }
    attempts.push({ video: true });
    let lastErr: any;
    for (const c of attempts) {
      try { return await navigator.mediaDevices.getUserMedia(c); } catch (e) { lastErr = e; if ((e as any)?.name === "NotAllowedError") break; }
    }
    throw lastErr;
  };

  const bindStream = (stream: MediaStream) => {
    webcamStreamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    const actualId = track?.getSettings().deviceId;
    if (actualId) setSelectedCameraId(actualId);
    setTimeout(async () => {
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      try { await v.play(); } catch {}
    }, 50);
  };

  const cameraError = (err: any) => {
    const n = err?.name;
    if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") {
      toast({ title: "Camera not found", description: "Camera not found in system. Please connect an external camera device.", variant: "destructive" });
    } else if (n === "NotReadableError" || n === "TrackStartError") {
      toast({ title: "Camera busy", description: "The camera is in use by another app. Close it and try again.", variant: "destructive" });
    } else {
      toast({ title: "Camera access denied", description: err?.message || "Please allow camera access in your browser settings.", variant: "destructive" });
    }
  };

  const startCameraFor = async (deviceId?: string) => {
    webcamStreamRef.current?.getTracks().forEach(t => t.stop());
    webcamStreamRef.current = null;
    const stream = await openCameraStream(deviceId);
    bindStream(stream);
    const vids = await refreshCameraDevices();
    const id = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (id && vids.some(v => v.deviceId === id)) localStorage.setItem(CAMERA_KEY, id);
  };

  const startWebcam = async () => {
    try {
      const vids = await refreshCameraDevices();
      const saved = localStorage.getItem(CAMERA_KEY) || "";
      const pick = vids.find(v => v.deviceId === saved)?.deviceId || (saved && vids.every(v => !v.deviceId) ? saved : vids[0]?.deviceId) || undefined;
      setShowWebcam(true);
      await startCameraFor(pick || undefined);
    } catch (err: any) {
      setShowWebcam(false);
      cameraError(err);
    }
  };

  const switchCamera = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    localStorage.setItem(CAMERA_KEY, deviceId);
    try { await startCameraFor(deviceId); } catch (err) { cameraError(err); }
  };

  useEffect(() => {
    if (!showWebcam || !navigator.mediaDevices) return;
    const handler = async () => {
      const vids = await refreshCameraDevices();
      const activeId = webcamStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
      const live = webcamStreamRef.current?.getVideoTracks()[0]?.readyState === "live";
      if (!activeId || !live || !vids.some(v => v.deviceId === activeId)) {
        if (vids.length === 0) { toast({ title: "Camera disconnected", variant: "destructive" }); return; }
        toast({ title: "Camera changed", description: `Switched to ${cameraLabel(vids[0], 0)}` });
        try { await startCameraFor(vids[0].deviceId); } catch (err) { cameraError(err); }
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWebcam]);

  useEffect(() => () => { webcamStreamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const captureFromWebcam = async () => {
    if (capturingPhoto) return;
    const video = videoRef.current;
    const track = webcamStreamRef.current?.getVideoTracks()[0];
    if (!video) return;
    if (!track || track.readyState !== "live" || track.muted) {
      toast({ title: "Camera stream interrupted", description: "Restarting camera, please capture again." });
      try { await startCameraFor(selectedCameraId || undefined); } catch (err) { cameraError(err); }
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      toast({ title: "Camera frame not ready. Please wait a second and try again." });
      return;
    }
    setCapturingPhoto(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    console.log("[capture] canvas", canvas.width, "x", canvas.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) { setCapturingPhoto(false); return; }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      setCapturingPhoto(false);
      if (!blob) { toast({ title: "Capture failed", variant: "destructive" }); return; }
      console.log("[capture] blob bytes", blob.size);
      const shot = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, blob, url: URL.createObjectURL(blob), takenAt: new Date(), saved: false, saving: false };
      capturedShotsRef.current = [...capturedShotsRef.current, shot];
      setCapturedShots(prev => { const next = [...prev, shot]; console.log("[capture] shots", next.length); return next; });
      void saveShot(shot.id);
    }, "image/jpeg", 0.9);
  };

  const updateShot = (id: string, patch: Partial<CapturedShot>) => {
    capturedShotsRef.current = capturedShotsRef.current.map(s => s.id === id ? { ...s, ...patch } : s);
    setCapturedShots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const saveShot = async (id: string) => {
    const shot = capturedShotsRef.current.find(s => s.id === id);
    if (!shot || shot.saved || shot.saving) return;
    updateShot(id, { saving: true, failed: false });
    const file = new File([shot.blob], `webcam_${shot.takenAt.getTime()}_${id.slice(-5)}.jpg`, { type: "image/jpeg" });
    let rec: { id: string; file_path: string } | undefined;
    const ok = await handleUploadPhoto(file, "clinical", "", "", { silent: true, onSaved: (r) => { rec = r; } });
    updateShot(id, { saving: false, saved: ok, failed: !ok, recordId: rec?.id, filePath: rec?.file_path });
    if (ok) toast({ title: "Photo captured & saved to patient record" });
  };

  const deleteShot = async (id: string) => {
    const s = capturedShotsRef.current.find(x => x.id === id);
    if (!s) return;
    if (s.saved && s.recordId) {
      if (!window.confirm("Also remove this photo from the patient record?")) return;
      if (s.filePath) await supabase.storage.from("clinical-photos").remove([s.filePath]);
      const { error } = await supabase.from("clinical_photos").delete().eq("id", s.recordId);
      if (error) { toast({ title: "Could not remove photo", description: error.message, variant: "destructive" }); return; }
      fetchSavedPhotos();
      toast({ title: "Photo removed from patient record" });
    }
    URL.revokeObjectURL(s.url);
    capturedShotsRef.current = capturedShotsRef.current.filter(x => x.id !== id);
    setCapturedShots(prev => prev.filter(x => x.id !== id));
  };

  const stopWebcam = () => {
    const pending = capturedShotsRef.current.filter(s => s.saving || s.failed).length;
    if (pending > 0 && !window.confirm(`${pending} captured photo(s) are still uploading or failed to save. Close camera and discard them?`)) return;
    capturedShotsRef.current.forEach(s => URL.revokeObjectURL(s.url));
    capturedShotsRef.current = [];
    setCapturedShots([]);
    webcamStreamRef.current?.getTracks().forEach(t => t.stop());
    webcamStreamRef.current = null;
    setShowWebcam(false);
  };

  const startVideoRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      videoStreamRef.current = stream;
      setShowVideoRecorder(true);
      // Wait next tick for the <video> element to mount
      setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err: any) {
      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        toast({ title: "Camera not found", description: "Camera not found in system. Please connect an external camera device.", variant: "destructive" });
      } else {
        toast({ title: "Camera/Mic access denied", description: err?.message || "Please allow access in your browser.", variant: "destructive" });
      }
    }
  };

  const beginRecording = () => {
    const stream = videoStreamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];
    // Prefer MP4 (H.264 + AAC) for long-term clinical record compatibility.
    // Fall back to WebM if the browser cannot record MP4 natively.
    const mp4Candidates = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4;codecs=avc1,mp4a',
      "video/mp4",
    ];
    const webmCandidates = [
      "video/webm;codecs=h264,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const pick = (list: string[]) => list.find((t) => MediaRecorder.isTypeSupported(t));
    const mp4Type = pick(mp4Candidates);
    const chosen = mp4Type || pick(webmCandidates) || "";
    const isMp4 = !!mp4Type;
    const recorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const outType = isMp4 ? "video/mp4" : "video/webm";
      const ext = isMp4 ? "mp4" : "webm";
      const blob = new Blob(recordedChunksRef.current, { type: outType });
      const file = new File([blob], `video_${Date.now()}.${ext}`, { type: outType });
      if (!isMp4) {
        toast({ title: "Saved as WebM", description: "Your browser does not support MP4 recording. The video will still play in the history viewer." });
      }
      await handleUploadVideo(file);
      recordedChunksRef.current = [];
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecordingVideo(true);
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingVideo(false);
  };

  const closeVideoRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    videoStreamRef.current?.getTracks().forEach(t => t.stop());
    videoStreamRef.current = null;
    setRecordingVideo(false);
    setShowVideoRecorder(false);
    setRecordingSeconds(0);
  };

  const handleUploadVideo = async (file: File) => {
    if (!selectedPatient || !activeCheckin) {
      toast({ title: "Select a patient first", variant: "destructive" });
      return;
    }
    const fileName = `${selectedPatient.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("clinical-photos").upload(fileName, file, { contentType: file.type });
    if (uploadError) { toast({ title: "Upload error", description: uploadError.message, variant: "destructive" }); return; }
    await supabase.from("clinical_photos").insert({
      patient_id: selectedPatient.id,
      checkin_id: activeCheckin.id,
      photo_type: "video",
      file_path: fileName,
      file_name: file.name,
      tooth_number: null,
      notes: null,
    });
    toast({ title: "Video saved!" });
    fetchSavedPhotos();
  };

  const handleUploadPhoto = async (file: File, type: string, toothNum: string, notes: string, opts?: { silent?: boolean; onSaved?: (rec: { id: string; file_path: string }) => void }): Promise<boolean> => {
    if (!selectedPatient) { toast({ title: "Select a patient first", variant: "destructive" }); return false; }
    if (!activeCheckin) { toast({ title: "No active check-in", description: "Check the patient in before saving photos.", variant: "destructive" }); return false; }
    const fileName = `${selectedPatient.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("clinical-photos").upload(fileName, file);
    if (uploadError) { toast({ title: "Upload error", description: uploadError.message, variant: "destructive" }); return false; }
    
    const { data: inserted, error: insertError } = await supabase.from("clinical_photos").insert({
      patient_id: selectedPatient.id,
      checkin_id: activeCheckin.id,
      photo_type: type,
      file_path: fileName,
      file_name: file.name,
      tooth_number: toothNum ? parseInt(toothNum) : null,
      notes: notes || null,
    }).select("id").single();
    if (insertError) { toast({ title: "Could not save photo record", description: insertError.message, variant: "destructive" }); return false; }
    if (inserted) opts?.onSaved?.({ id: inserted.id, file_path: fileName });
    if (!opts?.silent) toast({ title: "Photo uploaded!" });
    fetchSavedPhotos();
    return true;
  };

  const [savingBilling, setSavingBilling] = useState(false);
  // Generic in-flight action lock to prevent double-click duplicates across the workflow
  const actionLockRef = useRef<Set<string>>(new Set());
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const runLocked = async <T,>(key: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (actionLockRef.current.has(key)) return undefined;
    actionLockRef.current.add(key);
    setBusyActions((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      return await fn();
    } finally {
      actionLockRef.current.delete(key);
      setBusyActions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };
  const isBusy = (key: string) => busyActions.has(key);
  const handleSaveBilling = () => runLocked("billing", async () => {
    if (!selectedPatient) { toast({ title: "Please select a patient first", variant: "destructive" }); return; }
    if (!activeCheckin) { toast({ title: "No active check-in found", variant: "destructive" }); return; }
    setSavingBilling(true);
    try {
      const syncedBillingItems = mergeExistingBillingItems(billingItems);
      setBillingItems(syncedBillingItems);

      const subtotal = syncedBillingItems.reduce((sum, item) => sum + (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1), 0);
      const discountAmt = parseFloat(discount) || 0;
      const total = subtotal - discountAmt;

      // Always look up an existing bill for this check-in — one invoice per visit.
      const { data: existingBills } = await supabase
        .from("billings")
        .select("id, invoice_number, amount_paid, payment_status")
        .eq("checkin_id", activeCheckin.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const existingBill = existingBills && existingBills.length > 0 ? existingBills[0] : null;

      let billingId: string;
      let invoiceNum: string;

      const updateExistingBill = async (billRow: { id: string; invoice_number: string | null; amount_paid: number | null }) => {
        const paidSoFar = Number(billRow.amount_paid || 0);
        const newStatus = paidSoFar >= total ? "paid" : paidSoFar > 0 ? "partial" : "pending";
        const { error: upErr } = await supabase.from("billings").update({
          subtotal,
          discount_amount: discountAmt,
          total_amount: total,
          payment_method: paymentMethod,
          payment_status: newStatus,
        }).eq("id", billRow.id);
        if (upErr) throw upErr;
        await supabase.from("billing_items").delete().eq("billing_id", billRow.id);
        return billRow.invoice_number || invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`;
      };

      if (existingBill) {
        // Reuse existing invoice — never INSERT a duplicate for the same visit.
        billingId = existingBill.id;
        try {
          invoiceNum = await updateExistingBill(existingBill);
        } catch (err: any) {
          toast({ title: "Error", description: err?.message || "Could not update bill", variant: "destructive" });
          return;
        }
      } else {
        invoiceNum = invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`;
        const billingPayload = {
          patient_id: selectedPatient.id,
          checkin_id: activeCheckin.id,
          invoice_number: invoiceNum,
          subtotal,
          discount_amount: discountAmt,
          total_amount: total,
          amount_paid: 0,
          payment_method: paymentMethod,
          payment_status: "pending",
          created_at: workflowTimestampISO(),
        };

        const { data: billing, error } = await supabase
          .from("billings")
          .insert(billingPayload)
          .select()
          .single();

        if (error) {
          // Duplicate invoice — another bill already exists for this checkin/invoice. Reuse it.
          if ((error as any).code === "23505") {
            const { data: dupBills } = await supabase
              .from("billings")
              .select("id, invoice_number, amount_paid, payment_status")
              .or(`checkin_id.eq.${activeCheckin.id},invoice_number.eq.${invoiceNum}`)
              .order("created_at", { ascending: false })
              .limit(1);
            const dupBill = dupBills && dupBills.length > 0 ? dupBills[0] : null;
            if (!dupBill) {
              toast({ title: "Bill already exists", description: "An invoice already exists for this visit.", variant: "destructive" });
              return;
            }
            billingId = dupBill.id;
            try {
              invoiceNum = await updateExistingBill(dupBill);
            } catch (err: any) {
              toast({ title: "Error", description: err?.message || "Could not update existing bill", variant: "destructive" });
              return;
            }
          } else {
            toast({ title: "Error", description: error.message, variant: "destructive" });
            return;
          }
        } else {
          billingId = billing.id;
        }
      }

      if (syncedBillingItems.length > 0) {
        const items = syncedBillingItems.map((item) => ({
          billing_id: billingId,
          treatment_type: item.treatment_type,
          description: item.description,
          tooth_number: item.tooth_number || null,
          quantity: parseInt(item.quantity) || 1,
          unit_price: parseFloat(item.unit_price) || 0,
          total_price: (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1),
        }));
        await supabase.from("billing_items").insert(items);
      }
      toast({ title: `Bill saved! Invoice: ${invoiceNum}` });
      fetchPreviousBillings();
      billingSavedSnapshotRef.current = computeBillingSnapshot(syncedBillingItems, discount);
      setCurrentStep("payment");
    } catch (err: any) {
      toast({ title: "Error generating bill", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSavingBilling(false);
    }
  });

  const handleSavePrescription = () => runLocked("prescription", async () => {
    if (!selectedPatient || !activeCheckin) return;

    const wfTs = workflowTimestampISO();
    let resolvedPrescriptionId = currentPrescriptionId;

    if (!resolvedPrescriptionId) {
      const { data: existingPrescription, error: existingPrescriptionError } = await supabase
        .from("prescriptions")
        .select("id")
        .eq("checkin_id", activeCheckin.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPrescriptionError) {
        toast({ title: "Error", description: existingPrescriptionError.message, variant: "destructive" });
        return;
      }

      resolvedPrescriptionId = existingPrescription?.id ?? null;
    }

    // Resolve doctor: prefer planDoctor / appointment doctor; otherwise look up the
    // most recent treatment_plan doctor for this checkin so the prescription reflects
    // the actual treating doctor instead of a default.
    let resolvedPrescriptionDoctor: string | null = planDoctor || patientAppointment.doctor || null;
    if (!resolvedPrescriptionDoctor || resolvedPrescriptionDoctor.trim() === "") {
      const { data: planRow } = await supabase
        .from("treatment_plans")
        .select("doctor")
        .eq("checkin_id", activeCheckin.id)
        .not("doctor", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planRow?.doctor && String(planRow.doctor).trim() !== "") {
        resolvedPrescriptionDoctor = planRow.doctor;
      }
    }

    const prescriptionQuery = resolvedPrescriptionId
      ? supabase.from("prescriptions").update({
          patient_id: selectedPatient.id,
          checkin_id: activeCheckin.id,
          diagnosis,
          doctor: resolvedPrescriptionDoctor,
        }).eq("id", resolvedPrescriptionId).select().single()
      : supabase.from("prescriptions").insert({
          patient_id: selectedPatient.id,
          checkin_id: activeCheckin.id,
          diagnosis,
          doctor: resolvedPrescriptionDoctor,
          created_at: wfTs,
        }).select().single();

    const { data: rx, error } = await prescriptionQuery;
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    const { error: deleteItemsError } = await supabase
      .from("prescription_items")
      .delete()
      .eq("prescription_id", rx.id);

    if (deleteItemsError) {
      toast({ title: "Error", description: deleteItemsError.message, variant: "destructive" });
      return;
    }

    if (medicines.length > 0) {
      const items = medicines.map((m) => {
        const timingParts = [];
        if (hasDoseValue(m.morning)) timingParts.push(`Morning-${m.morning.trim()}`);
        if (hasDoseValue(m.afternoon)) timingParts.push(`Afternoon-${m.afternoon.trim()}`);
        if (hasDoseValue(m.evening)) timingParts.push(`Evening-${m.evening.trim()}`);
        if (hasDoseValue(m.night)) timingParts.push(`Night-${m.night.trim()}`);
        const timing = timingParts.join(", ");
        return {
          prescription_id: rx.id,
          medicine_name: m.medicine_name,
          dosage: [m.morning, m.afternoon, m.evening, m.night].filter(hasDoseValue).join(", ") || null,
          frequency: `${m.frequency}${timing ? ` (${timing})` : ""}`,
          duration: m.duration,
          instructions: m.instructions,
        };
      });
      const { error: itemsError } = await supabase.from("prescription_items").insert(items);
      if (itemsError) {
        toast({ title: "Error", description: itemsError.message, variant: "destructive" });
        return;
      }
    }

    setCurrentPrescriptionId(rx.id);
    toast({ title: resolvedPrescriptionId ? "Prescription updated!" : "Prescription saved!" });
  });

  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    if (!activeCheckin || isCheckingOut) return;
    setIsCheckingOut(true);
    try {
      await supabase.from("patient_checkins").update({ status: "checked_out", checkout_time: workflowTimestampISO() }).eq("id", activeCheckin.id);

      // Update appointment checkout_time and status to completed
      const workflowTimestamp = new Date(workflowTimestampISO());
      const checkoutTimeStr = workflowTimestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (patientAppointment.id) {
        await supabase.from("appointments").update({
          status: "completed",
          checkout_time: checkoutTimeStr,
        }).eq("id", patientAppointment.id);
      } else if (selectedPatient) {
        const dateStr = format(workflowDate, "yyyy-MM-dd");
        const { data: todayApt } = await supabase
          .from("appointments")
          .select("id")
          .eq("patient_id", selectedPatient.id)
          .eq("appointment_date", dateStr)
          .in("status", ["scheduled", "confirmed", "checked-in"])
          .limit(1)
          .maybeSingle();
        if (todayApt) {
          await supabase.from("appointments").update({
            status: "completed",
            checkout_time: checkoutTimeStr,
          }).eq("id", todayApt.id);
        }
      }

      // Auto-send Google review request if checkbox is checked (deduped per visit)
      if (sendReview && selectedPatient) {
        const fullName = `${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim() || "there";
        const clinicName = "Dr Neemz Dentistry";
        let reviewApptId: string | null = patientAppointment.id || null;
        if (!reviewApptId) {
          const { data: apt } = await supabase.from("appointments").select("id")
            .eq("patient_id", selectedPatient.id).eq("appointment_date", format(workflowDate, "yyyy-MM-dd"))
            .limit(1).maybeSingle();
          reviewApptId = apt?.id || null;
        }
        let existingQ = supabase.from("review_requests").select("id").eq("patient_id", selectedPatient.id).eq("source", "checkout");
        if (reviewApptId) existingQ = existingQ.eq("appointment_id", reviewApptId);
        else {
          const d = format(workflowDate, "yyyy-MM-dd");
          existingQ = existingQ.gte("sent_at", `${d}T00:00:00+05:30`).lte("sent_at", `${d}T23:59:59+05:30`);
        }
        const { data: existing } = await existingQ.limit(1).maybeSingle();
        if (existing) {
          toast({ title: "Patient checked out! 🎉", description: "Review request was already sent for this visit." });
        } else {
          const { data: row } = await supabase.from("review_requests").insert({
            patient_name: fullName,
            phone: selectedPatient.phone || "",
            patient_id: selectedPatient.id,
            review_platform: "google",
            appointment_id: reviewApptId,
            source: "checkout",
            status: "sent",
          }).select("id, tracking_token").maybeSingle();
          const trackUrl = row?.tracking_token
            ? `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/review-redirect?t=${row.tracking_token}`
            : "";
          const res = await sendClinicWhatsApp({
            patient: selectedPatient,
            templateKey: "google_review_request",
            bodyParams: [fullName],
            fallbackText: `Hi ${fullName}, thank you for visiting ${clinicName} today! We'd love your feedback — please leave us a Google review${trackUrl ? `: ${trackUrl}` : ""} 🙏`,
            label: "Google Review",
          }).catch((e) => ({ ok: false, via: "none" as const, err: String(e) }));
          if (row?.id && !res.ok) {
            await supabase.from("review_requests").update({ status: "failed", delivery_error: "WhatsApp send failed" }).eq("id", row.id);
          }
          toast({
            title: "Patient checked out! 🎉",
            description: res.ok ? "Google Review request sent via WhatsApp." : "Review request could not be sent on WhatsApp — marked Failed in Reviews.",
          });
        }
      } else {
        toast({ title: "Patient checked out! 🎉" });
      }

      // Reset workflow
      localStorage.removeItem(CLINIC_WORKFLOW_SESSION_KEY);
      clearWorkflowDraft(selectedPatient.id);
      setSelectedPatient(null);
      setActiveCheckin(null);
      setCurrentStep("checkin");
      setVitals({ blood_pressure_systolic: "", blood_pressure_diastolic: "", pulse_rate: "", temperature: "", weight: "", height: "", spo2: "", blood_sugar: "", notes: "" });
      setToothEntries([]);
      setChartId(null);
      setConsultNotes("");
      setConsultGeneralFindings([]);
      setSelectedChartMode("adult");
      setPlanItems([]);
      setUpcomingItems([]);
      setProceededTeeth(new Set());
      setPlanNotes("");
      setBillingItems([]);
      setDiscount("");
      setBillingAutoPopulated(false);
      setInvoiceNumber("");
      setInvoiceDate(format(new Date(), "yyyy-MM-dd"));
      setMedicines([]);
      setDiagnosis("");
      setCurrentVitalsId(null);
      setChartId(null);
      setCurrentPlanId(null);
      setCurrentPrescriptionId(null);
      setPhotos([]);
      setLabOrders([]);
      setSavedLabOrders([]);
      fetchTodayCheckins();
      fetchTodayAppointments();
    } finally {
      setIsCheckingOut(false);
    }
  };

  const addPlanItem = () => setPlanItems([...planItems, { treatment_type: "", tooth_number: "", description: "", estimated_cost: "", priority: "normal", doctor: planDoctor || "", quantity: "1" }]);
  const addBillingItem = () => setBillingItems([...billingItems, { treatment_type: "", description: "", tooth_number: "", quantity: "1", unit_price: "", category: "manual" }]);
  const addMedicine = () => setMedicines([...medicines, { medicine_type: "", medicine_name: "", dosage: "", frequency: "", duration: "", instructions: "", morning: "0", afternoon: "0", evening: "0", night: "0", unit: "", unit_cost: "0" }]);
  const addLabOrder = () => setLabOrders([...labOrders, { ...createEmptyLabOrder(), doctor: planDoctor || patientAppointment.doctor || "" }]);
  const removeLabOrder = (i: number) => setLabOrders(labOrders.filter((_, idx) => idx !== i));

  const getLabMaterials = (workType: string) => {
    const work = labWorksList.find(w => w.name === workType);
    return work?.materials || [];
  };

  const handleSaveLabOrders = () => runLocked("lab_orders", async () => {
    if (!selectedPatient || !activeCheckin) return;

    // If editing an existing order, update it
    if (editingLabOrderId && labOrders.length === 1) {
      const o = labOrders[0];
      const toothNumber = resolveLabOrderToothNumber(o);
      const { error } = await supabase.from("lab_orders").update({
        lab_name: o.lab_name,
        lab_phone: o.lab_phone || null,
        work_type: o.work_type,
        material: o.material || null,
        shade: o.shade || null,
        tooth_number: toothNumber || null,
        description: toothNumber ? `Teeth: ${toothNumber}` : (o.description || null),
        price_of_material: parseFloat(o.price_of_material) || 0,
        lab_expense: parseFloat(o.lab_expense) || 0,
        patient_bill: parseFloat(o.patient_bill) || 0,
        lab_expense_paid_amount: parseFloat(o.lab_expense_paid_amount) || 0,
        sent_date: o.sent_date || null,
        expected_delivery_date: o.expected_delivery_date || null,
        notes: o.notes || null,
        doctor: o.doctor || null,
      }).eq("id", editingLabOrderId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Lab order updated!" });
      setLabOrders([]);
      setEditingLabOrderId(null);
      fetchLabOrders();
      return;
    }

    const ordersToSave = labOrders.filter(o => o.lab_name && o.work_type);
    if (ordersToSave.length > 0) {
      const rows = ordersToSave.map(o => {
        const toothNumber = resolveLabOrderToothNumber(o);

        return buildLabOrderRow({
        patient_id: selectedPatient.id,
        checkin_id: activeCheckin.id,
        lab_name: o.lab_name,
        lab_phone: o.lab_phone,
        work_type: o.work_type,
        material: o.material,
        shade: o.shade,
        tooth_number: toothNumber,
        description: o.description,
        price_of_material: o.price_of_material,
        lab_expense: o.lab_expense,
        patient_bill: o.patient_bill,
        lab_expense_paid_amount: o.lab_expense_paid_amount,
        // Default sent_date to the workflow date (not today) so backdated visits stay aligned.
        sent_date: o.sent_date || format(workflowDate, "yyyy-MM-dd"),
        expected_delivery_date: o.expected_delivery_date,
        notes: o.notes,
        doctor: o.doctor,
        created_at: workflowTimestampISO(),
        });
      });
      const { error } = await supabase.from("lab_orders").insert(rows as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: `${ordersToSave.length} lab order(s) saved!` });
      setLabOrders([]);
      const refreshedOrders = await fetchLabOrders();
      autoPopulateBilling(refreshedOrders || [], []);
      setBillingAutoPopulated(true);
    }
  });

  // Register per-step auto-savers (called when navigating away from a step)
  useEffect(() => {
    autoSaversRef.current = {
      vitals: handleSaveVitals,
      consultation: handleSaveChart,
      treatment_plan: handleSaveTreatmentPlan,
      treatment: () => { try { stopWebcam(); closeVideoRecorder(); } catch {} },
      prescription: handleSavePrescription,
      lab_orders: handleSaveLabOrders,
    };
  });

  const handleEditLabOrder = (order: any) => {
    setEditingLabOrderId(order.id);
    const toothStr = resolveLabOrderToothNumber(order);
    setLabOrders([{
      lab_name: order.lab_name || "",
      lab_phone: order.lab_phone || "",
      work_type: order.work_type || "",
      material: order.material || "",
      shade: order.shade || "",
           tooth_number: toothStr,
      description: order.description || "",
      price_of_material: order.price_of_material ? String(order.price_of_material) : "",
      lab_expense: order.lab_expense ? String(order.lab_expense) : "",
      patient_bill: order.patient_bill ? String(order.patient_bill) : "",
      lab_expense_paid_amount: order.lab_expense_paid_amount ? String(order.lab_expense_paid_amount) : "",
      sent_date: order.sent_date || format(new Date(), "yyyy-MM-dd"),
      expected_delivery_date: order.expected_delivery_date || "",
      notes: order.notes || "",
      doctor: order.doctor || "",
      quadrants: toothNumbersToQuadrants(toothStr),
    }]);
  };

  const handleCancelEditLabOrder = () => {
    setEditingLabOrderId(null);
    setLabOrders([]);
  };

  const handleAddRework = async (orderId: string) => {
    const order = savedLabOrders.find(o => o.id === orderId);
    if (!order || !selectedPatient || !activeCheckin) return;
    const { error } = await supabase.from("lab_orders").insert({
      patient_id: selectedPatient.id,
      checkin_id: activeCheckin.id,
      lab_name: order.lab_name,
      lab_phone: order.lab_phone,
      work_type: order.work_type,
      material: order.material,
      shade: order.shade,
      tooth_number: order.tooth_number,
      description: `Rework of order`,
      notes: `Rework — original order ID: ${orderId}`,
      price_of_material: Number(order.price_of_material || 0),
      lab_expense: Number(order.lab_expense || 0),
      patient_bill: Number(order.patient_bill || 0),
      lab_expense_paid_amount: 0,
      status: "sent",
      sent_date: format(workflowDate, "yyyy-MM-dd"),
      doctor: order.doctor || null,
      created_at: workflowTimestampISO(),
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Rework order created!" });
    fetchLabOrders();
  };

  const fetchLabOrders = async () => {
    if (!selectedPatient) return;
    const { data } = await supabase.from("lab_orders").select("*").eq("patient_id", selectedPatient.id).order("created_at", { ascending: false });
    const records = data || [];
    setSavedLabOrders(records);
    return records;
  };

  const deleteLabOrder = async (orderId: string) => {
    await supabase.from("lab_orders").delete().eq("id", orderId);
    toast({ title: "Lab order deleted" });
    fetchLabOrders();
  };

  const updateLabOrderStatus = async (orderId: string, status: string, deliveryDate?: string) => {
    const updates: any = { status };
    if (deliveryDate) updates.actual_delivery_date = deliveryDate;
    await supabase.from("lab_orders").update(updates).eq("id", orderId);
    toast({ title: `Lab order ${status}!` });
    fetchLabOrders();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Clinic Workflow</h1>
          <p className="text-sm text-muted-foreground">Patient journey: Check-in → Consultation → Treatment → Billing → Checkout</p>
        </div>
        <Popover open={workflowDateOpen} onOpenChange={setWorkflowDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("gap-2", !workflowDate && "text-muted-foreground")}>
              <CalendarIcon size={16} />
              {format(workflowDate, "dd MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={workflowDate}
              onSelect={(d) => {
                if (d) {
                  setWorkflowDate(d);
                  setWorkflowDateOpen(false);
                }
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Workflow Steps */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {stepConfig.map((step, i) => {
          const Icon = step.icon;
          const isActive = currentStep === step.key;
          const stepIndex = stepConfig.findIndex((s) => s.key === currentStep);
          const isPast = i < stepIndex;
          return (
            <button
              key={step.key}
              onClick={() => { setCurrentStep(step.key); if (step.key === "treatment") fetchSavedPhotos(); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-accent/20 text-accent" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              <Icon size={14} />
              {step.label}
              {i < stepConfig.length - 1 && <ChevronRight size={12} className="ml-1 opacity-50" />}
            </button>
          );
        })}
      </div>

      <div className={`grid grid-cols-1 gap-6 ${rightPanelCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-4"}`}>
        {/* Main Content */}
        <div className={`${rightPanelCollapsed ? "" : "lg:col-span-3"} space-y-4`}>
          {/* STEP 1: CHECK-IN */}
          {currentStep === "checkin" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <UserCheck size={20} /> Patient Check-in
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Today's Scheduled Appointments */}
                {todayAppointments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">📅 Today's Appointments ({todayAppointments.length})</p>
                    <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                      {todayAppointments.map((apt: any) => (
                        <div key={apt.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{apt.patients?.first_name} {apt.patients?.last_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {apt.start_time?.slice(0, 5)} — {apt.patients?.phone || "No phone"} · {apt.type} · {apt.doctor}
                            </p>
                          </div>
                          <Button size="sm" className="gradient-primary text-primary-foreground text-xs" onClick={() => handleAppointmentCheckin(apt)}>
                            <UserCheck size={14} className="mr-1" /> Check In
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or search manually</span></div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search patient by name or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                  </div>
                </div>

                {searchTerm && (
                  <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                    {filteredPatients.map((p) => (
                      <button
                        key={p.id}
                        onClick={async () => { setSelectedPatient(p); setSearchTerm(""); setCurrentStep("checkin"); fetchPatientAppointment(p.id); const checkin = await resolvePatientCheckin(p.id); if (checkin) { setActiveCheckin(checkin); } else { setActiveCheckin(null); } }}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                          selectedPatient?.id === p.id ? "bg-primary/10" : ""
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.first_name} {p.last_name}</p>
                          <p className="text-xs text-muted-foreground">{p.phone} · {p.gender}</p>
                        </div>
                        <ArrowRight size={14} className="text-muted-foreground" />
                      </button>
                    ))}
                    {filteredPatients.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No patients found</p>
                    )}
                  </div>
                )}

                {selectedPatient && (
                  <div className="bg-secondary/30 rounded-lg p-4 space-y-4">
                    {/* Patient Header with Photo */}
                    <div className="flex items-start gap-4">
                      {/* Avatar + Camera */}
                      <div className="flex flex-col items-center gap-1">
                        <div className="relative">
                          <div className="h-20 w-20 rounded-full bg-muted border-2 border-primary/20 flex items-center justify-center overflow-hidden">
                            {patientPhotoUrl ? (
                              <img src={patientPhotoUrl} alt="Patient" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-2xl font-bold text-muted-foreground">
                                {selectedPatient.first_name[0]}{selectedPatient.last_name[0]}
                              </span>
                            )}
                          </div>
                        </div>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !selectedPatient) return;
                              const fileName = `patient-photos/${selectedPatient.id}/${Date.now()}_profile.jpg`;
                              const { error: uploadError } = await supabase.storage.from("clinical-photos").upload(fileName, file);
                              if (uploadError) { toast({ title: "Upload error", description: uploadError.message, variant: "destructive" }); return; }
                              const { data: signed } = await supabase.storage.from("clinical-photos").createSignedUrl(fileName, 60 * 60 * 24);
                              setPatientPhotoUrl(signed?.signedUrl || null);
                              toast({ title: "Photo captured!" });
                            }}
                          />
                          <div className="flex items-center gap-1 text-[10px] text-primary font-medium hover:underline">
                            <Camera size={12} /> Camera
                          </div>
                        </label>
                      </div>

                      {/* Name & ID */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-lg">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                          {selectedPatient.is_high_ticket && (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-600 gap-1">
                              <Star size={12} className="fill-current" /> High Ticket
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs mt-1">P.ID: {formatPatientCode(selectedPatient.patient_code)}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">Age: <span className="font-medium text-foreground">{getPatientAgeLabel(selectedPatient.date_of_birth)}</span></p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <Badge className="bg-accent text-accent-foreground">Selected</Badge>
                        <Button
                          variant={selectedPatient.is_high_ticket ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "text-xs gap-1.5 h-7",
                            selectedPatient.is_high_ticket
                              ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                              : "border-amber-500/40 text-amber-600 hover:bg-amber-50"
                          )}
                          onClick={async () => {
                            const newVal = !selectedPatient.is_high_ticket;
                            const { error } = await supabase
                              .from("patients")
                              .update({ is_high_ticket: newVal })
                              .eq("id", selectedPatient.id);
                            if (error) {
                              toast({ title: "Failed to update", description: error.message, variant: "destructive" });
                              return;
                            }
                            setSelectedPatient({ ...selectedPatient, is_high_ticket: newVal });
                            toast({ title: newVal ? "Marked as High Ticket ⭐" : "High Ticket removed" });
                          }}
                        >
                          <Star size={12} className={selectedPatient.is_high_ticket ? "fill-current" : ""} />
                          {selectedPatient.is_high_ticket ? "High Ticket" : "Mark High Ticket"}
                        </Button>
                      </div>
                    </div>

                    {/* Patient Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Mobile</p>
                        <p className="font-medium">{selectedPatient.phone || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Gender</p>
                        <p className="font-medium capitalize">{selectedPatient.gender || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Date of Birth</p>
                        <p className="font-medium">{selectedPatient.date_of_birth || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Age</p>
                        <p className="font-medium">{getPatientAgeLabel(selectedPatient.date_of_birth)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Location</p>
                        <p className="font-medium">{selectedPatient.location || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">District</p>
                        <p className="font-medium">{selectedPatient.district || "—"}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Address</p>
                        <p className="font-medium break-words">{getPatientAddressLabel(selectedPatient)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Source</p>
                        <Select value={patientAppointment.source} onValueChange={(v) => updateAppointmentField("source", v)}>
                          <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {clinicSourceOptions.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Doctor</p>
                        <Select value={patientAppointment.doctor} onValueChange={(v) => updateAppointmentField("doctor", v)}>
                          <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                          <SelectContent>
                            {clinicDoctorNames.map(d => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-medium">Treatment Type</p>
                        <Select value={patientAppointment.type} onValueChange={(v) => updateAppointmentField("type", v)}>
                          <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {clinicTreatmentNames.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Communication + Admit Card */}
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-medium mb-2">Actions</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5 border-green-500/30 text-green-600 hover:bg-green-50 hover:text-green-700"
                          onClick={() => {
                            const patientFullName = [selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(" ") || selectedPatient.first_name || "there";
                            const queueIndex = todayCheckins.findIndex((c: any) => c.patient_id === selectedPatient.id);
                            const patientsAhead = queueIndex === -1 ? todayCheckins.length : queueIndex;
                            const estimatedWaitMinutes = String(patientsAhead * 15);
                            void sendClinicWhatsApp({
                              patient: selectedPatient,
                              templateKey: "patient_welcome_flex",
                              // {{1}} Patient Name, {{2}} Doctor Name, {{3}} Estimated Wait (minutes)
                              bodyParams: [
                                patientFullName,
                                patientAppointment.doctor || "Dr Neemz Dentistry",
                                estimatedWaitMinutes,
                              ],
                              fallbackText: buildWelcomeText(selectedPatient.first_name || "there"),
                              label: "Welcome",
                            });
                          }}
                        >
                          💬 WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5 border-blue-500/30 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                          onClick={() => {
                            if (selectedPatient.phone) {
                              window.open(`sms:${selectedPatient.phone}?body=Hi ${selectedPatient.first_name}, welcome to our clinic!`, "_blank");
                              toast({ title: "SMS app opened!" });
                            } else {
                              toast({ title: "No phone number", variant: "destructive" });
                            }
                          }}
                        >
                          📱 SMS
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5 border-purple-500/30 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                          onClick={() => {
                            if (selectedPatient.email) {
                              window.open(`mailto:${selectedPatient.email}?subject=Welcome!&body=Hi ${selectedPatient.first_name}, welcome to our clinic!`, "_blank");
                              toast({ title: "Email app opened!" });
                            } else {
                              toast({ title: "No email", description: "Patient email not available", variant: "destructive" });
                            }
                          }}
                        >
                          ✉️ Email
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={() => setShowAdmitCard(true)}
                        >
                          <CreditCard size={12} /> Admit Card
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={handleCheckin}
                      disabled={(activeCheckin?.status === "checked_in") || isCheckingIn}
                      className="w-full gradient-primary text-primary-foreground"
                    >
                      <UserCheck size={16} className="mr-2" />
                      {activeCheckin?.status === "checked_in"
                        ? "Already Checked In"
                        : activeCheckin?.status === "checked_out"
                          ? "Check In Again"
                          : "Check In Patient"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 2: VITALS */}
          {currentStep === "vitals" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Activity size={20} /> Record Vitals & History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {renderQuickPatientSearch()}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Chief Complaint</Label>
                  <p className="text-sm text-muted-foreground">Select the patient's primary complaints</p>
                  <div className="flex flex-wrap gap-2">
                    {chiefComplaints.map((c) => (
                      <button
                        key={c}
                        onClick={() => setSelectedComplaints((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                        )}
                        className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                          selectedComplaints.includes(c)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {selectedComplaints.includes("Other") && (
                    <Input placeholder="Describe other complaint..." value={otherComplaint} onChange={(e) => setOtherComplaint(e.target.value)} className="mt-2" />
                  )}
                </div>

                <div className="border-t" />

                {/* Vitals */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Vitals</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm">BP Systolic (mmHg)</Label>
                      <Input type="number" placeholder="120" value={vitals.blood_pressure_systolic} onChange={(e) => setVitals({ ...vitals, blood_pressure_systolic: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">BP Diastolic (mmHg)</Label>
                      <Input type="number" placeholder="80" value={vitals.blood_pressure_diastolic} onChange={(e) => setVitals({ ...vitals, blood_pressure_diastolic: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">Pulse (bpm)</Label>
                      <Input type="number" placeholder="72" value={vitals.pulse_rate} onChange={(e) => setVitals({ ...vitals, pulse_rate: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">SpO2 (%)</Label>
                      <Input type="number" placeholder="98" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">Temperature (°F)</Label>
                      <Input type="number" step="0.1" placeholder="98.6" value={vitals.temperature} onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">Weight (kg)</Label>
                      <Input type="number" step="0.1" placeholder="70" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">Height (cm)</Label>
                      <Input type="number" placeholder="170" value={vitals.height} onChange={(e) => setVitals({ ...vitals, height: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-sm">Blood Sugar (mg/dL)</Label>
                      <Input type="number" placeholder="100" value={vitals.blood_sugar} onChange={(e) => setVitals({ ...vitals, blood_sugar: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="border-t" />

                {/* Past Dental History */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Past Dental History</Label>
                  <Textarea value={pastDentalNotes} onChange={(e) => setPastDentalNotes(e.target.value)} placeholder="Any previous dental treatments, surgeries, or ongoing issues..." rows={3} />
                </div>

                <div className="border-t" />

                {/* Past Medical History */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-base font-semibold">Past Medical History</Label>
                    <p className="text-[11px] text-muted-foreground">Tap toggle: Yes / No</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                    {medicalHistoryItems.map((item) => {
                      const val = medicalHistory[item];
                      const isYes = val === "yes";
                      const isNo = val === "no";
                      const next = () =>
                        setMedicalHistory((prev) => ({
                          ...prev,
                          [item]: prev[item] === "yes" ? "no" : prev[item] === "no" ? null : "yes",
                        }));
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={next}
                          className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-left transition-all ${
                            isYes
                              ? "border-destructive/60 bg-destructive/10"
                              : isNo
                              ? "border-accent/60 bg-accent/10"
                              : "border-border bg-card hover:border-primary/40"
                          }`}
                          title="Click to cycle: – → Yes → No → –"
                        >
                          <span className="text-xs font-medium truncate">{item}</span>
                          <span
                            className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors ${
                              isYes ? "bg-destructive" : isNo ? "bg-accent" : "bg-muted"
                            }`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
                                isYes ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-background/90">
                              {isYes ? "Y" : isNo ? "N" : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {medicalHistory["Other"] === "yes" && (
                    <Textarea value={otherMedicalNotes} onChange={(e) => setOtherMedicalNotes(e.target.value)} placeholder="Describe other medical conditions..." rows={2} />
                  )}
                </div>

                <div className="border-t" />

                {/* Notes */}
                <div>
                  <Label className="text-sm">Additional Notes</Label>
                  <Textarea value={vitals.notes} onChange={(e) => setVitals({ ...vitals, notes: e.target.value })} placeholder="Any additional notes..." />
                </div>

              </CardContent>
            </Card>
          )}

          {/* STEP 3: CONSULTATION - DENTAL CHART */}
          {currentStep === "consultation" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Stethoscope size={20} /> Doctor Consultation - Dental Chart
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderQuickPatientSearch()}
                <ExistingFindingsPanel
                  patientId={selectedPatient?.id ?? null}
                  checkinId={activeCheckin?.id ?? null}
                  appointmentId={patientAppointment.id || null}
                  doctor={patientAppointment.doctor || null}
                  workflowDateISO={workflowTimestampISO()}
                />
                <ToothChart
                  entries={toothEntries}
                  onToothClick={() => {}}
                  onSaveEntry={handleSaveToothEntry}
                  generalFindings={consultGeneralFindings}
                  onGeneralFindingsChange={setConsultGeneralFindings}
                  chartType={selectedChartMode === "kids" ? "child" : "adult"}
                  onChartModeChange={(mode) => setSelectedChartMode(mode)}
                  proceededTeeth={proceededTeeth}
                  proceededGeneralConditions={new Set(consultGeneralFindings.filter(gf => planItems.some(p => p.treatment_type === (gf.treatment_needed || ""))).map(gf => gf.condition))}
                  onProceedToTreatment={(group) => {
                    setPendingProceedGroup(group);
                    setShowProceedChoiceDialog(true);
                  }}
                  onUndoProceed={(group) => {
                    const treatmentKey = group.treatment_needed || "";
                    // Remove from proceededTeeth
                    setProceededTeeth((prev) => {
                      const next = new Set(prev);
                      group.teeth.forEach((t) => next.delete(t));
                      return next;
                    });
                    // Remove from planItems
                    setPlanItems((prev) => prev.filter((item) => item.treatment_type !== treatmentKey));
                    toast({ title: "Proceed undone", description: `${treatmentKey || group.condition} removed from Treatment Done` });
                  }}
                  onDeleteFinding={(group) => {
                    // Remove tooth entries for this finding
                    const teethSet = new Set(group.teeth);
                    const newEntries = toothEntries.filter(
                      (e) => !(teethSet.has(e.tooth_number) && e.condition === group.condition)
                    );
                    // Reset those teeth to healthy by removing them
                    setToothEntries(newEntries);
                    // Also remove from proceeded and planItems if they were proceeded
                    setProceededTeeth((prev) => {
                      const next = new Set(prev);
                      group.teeth.forEach((t) => next.delete(t));
                      return next;
                    });
                    const treatmentKey = group.treatment_needed || "";
                    setPlanItems((prev) => prev.filter((item) => item.treatment_type !== treatmentKey));
                    toast({ title: "Finding deleted", description: `${group.condition} finding removed` });
                  }}
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label>Consultation Notes</Label>
                    <Textarea value={consultNotes} onChange={(e) => setConsultNotes(e.target.value)} placeholder="Clinical findings, patient complaints..." rows={3} />
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">Consulting Doctor:<span className="text-destructive ml-0.5">*</span></Label>
                    <Select value={patientAppointment.doctor} onValueChange={(v) => updateAppointmentField("doctor", v)}>
                      <SelectTrigger className={cn("w-48", !patientAppointment.doctor && "border-destructive")}><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                      <SelectContent>
                        {doctorNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">Dental Assistant:</Label>
                    <Select value={(patientAppointment as any).assistant || ""} onValueChange={(v) => updateAppointmentField("assistant", v)}>
                      <SelectTrigger className="w-48"><SelectValue placeholder={assistantNames.length ? "Select Assistant" : "Add in Settings"} /></SelectTrigger>
                      <SelectContent>
                        {assistantNames.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    className="border-purple-500 text-purple-600 hover:bg-purple-50"
                    onClick={async () => {
                      if (!selectedPatient) {
                        toast({ title: "Select a patient first", variant: "destructive" });
                        return;
                      }
                      // Persist findings first; abort if save fails
                      const saved = await handleSaveChart();
                      if (!saved) {
                        toast({
                          title: "Could not save findings",
                          description: "Ortho case not created. Please retry.",
                          variant: "destructive",
                        });
                        return;
                      }
                      // Check if an ortho case already exists for this patient
                      const { data: existing } = await supabase
                        .from("orthodontic_cases" as any)
                        .select("id")
                        .eq("patient_id", selectedPatient.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (!existing) {
                        const caseCode = `ORTHO-${Date.now().toString().slice(-6)}`;
                        const { error } = await supabase.from("orthodontic_cases" as any).insert({
                          patient_id: selectedPatient.id,
                          case_code: caseCode,
                          doctor: patientAppointment.doctor || null,
                          status: "active",
                          start_date: format(workflowDate, "yyyy-MM-dd"),
                          treatment_notes: consultNotes || null,
                        });
                        if (error) {
                          toast({ title: "Failed to create ortho case", description: error.message, variant: "destructive" });
                          return;
                        }
                      }
                      sonnerToast.success(existing ? "Ortho case already exists" : "Ortho case created", {
                        description: "Data sent to Ortho Treatment module.",
                        action: {
                          label: "Open Ortho Treatment",
                          onClick: () => navigate("/ortho-treatment"),
                        },
                      });
                    }}
                  >
                    <Smile size={16} className="mr-2" /> Send to Ortho Treatment
                  </Button>
                  <Button
                    variant="outline"
                    className="border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                    onClick={async () => {
                      if (!selectedPatient) {
                        toast({ title: "Select a patient first", variant: "destructive" });
                        return;
                      }
                      // 1. Persist findings first; abort EMI creation on failure
                      const saved = await handleSaveChart();
                      if (saved !== true) {
                        toast({
                          title: "Could not save findings",
                          description: "EMI case not created. Please retry.",
                          variant: "destructive",
                        });
                        return;
                      }
                      const totalCost = (planItems || []).reduce((s: number, it: any) => s + Number(it.cost || it.price || 0), 0);
                      const treatmentName = (planItems || [])
                        .map((it: any) => it.treatment_type || it.name || it.treatment || "")
                        .filter(Boolean)
                        .join(", ") || null;
                      const { data: existing } = await supabase
                        .from("emi_insurance_cases" as any)
                        .select("id")
                        .eq("patient_id", selectedPatient.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (!existing) {
                        const { error } = await supabase.from("emi_insurance_cases" as any).insert({
                          patient_id: selectedPatient.id,
                          case_type: "emi",
                          status: "draft",
                          treatment_cost: totalCost,
                          treatment_name: treatmentName,
                          doctor: patientAppointment.doctor || null,
                          notes: consultNotes || null,
                        });
                        if (error) {
                          toast({ title: "Failed to create EMI case", description: error.message, variant: "destructive" });
                          return;
                        }
                      }
                      // Stay on Consultation; offer navigation via toast action
                      sonnerToast.success(existing ? "EMI case already exists" : "EMI case created", {
                        description: "Findings saved. You can open the EMI & Insurance module.",
                        action: {
                          label: "Open EMI & Insurance",
                          onClick: () => navigate("/emi-insurance"),
                        },
                      });
                    }}
                  >
                    <CreditCard size={16} className="mr-2" /> Send to EMI & Insurance
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 4: TREATMENT PLAN */}
          {currentStep === "treatment_plan" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="font-display flex items-center gap-2">
                    <ClipboardList size={20} /> Treatment Done
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setCurrentStep("history")}>
                      <History size={14} /> History
                    </Button>
                    {/* Treatment status toggle — mandatory */}
                    <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md border border-border/50">
                      <Button
                        type="button"
                        size="sm"
                        variant={treatmentStatus === "completed" ? "default" : "ghost"}
                        className={cn("h-7 text-xs gap-1", treatmentStatus === "completed" && "bg-success text-success-foreground hover:bg-success/90")}
                        onClick={() => {
                          const missing = planItems.reduce<number[]>((acc, it, idx) => {
                            const hasContent = (it.treatment_type && it.treatment_type.trim() !== "") || (it.tooth_number && it.tooth_number.trim() !== "");
                            if (hasContent && !(it.assistant && it.assistant.trim() !== "")) acc.push(idx);
                            return acc;
                          }, []);
                          if (missing.length > 0) {
                            setAssistantErrorRows(new Set(missing));
                            toast({ title: "Dental Assistant required", description: "Please select a Dental Assistant before completing the treatment.", variant: "destructive" });
                            return;
                          }
                          setAssistantErrorRows(new Set());
                          setTreatmentStatus("completed");
                        }}
                      >
                        <Check size={12} /> Treatment Done
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={treatmentStatus === "pending" ? "default" : "ghost"}
                        className={cn("h-7 text-xs gap-1", treatmentStatus === "pending" && "bg-warning text-warning-foreground hover:bg-warning/90")}
                        onClick={() => setTreatmentStatus("pending")}
                      >
                        <Clock size={12} /> Treatment Pending
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-md">
                      <CalendarIcon size={14} className="text-muted-foreground" />
                      <span className="text-sm font-medium">{format(workflowDate, "dd MMM yyyy")}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderQuickPatientSearch()}

                {/* Table Header */}
                <div className="grid grid-cols-[100px_60px_1fr_1fr_100px_auto] gap-2 px-3 py-2 bg-muted/50 rounded-t-lg border border-border/50 text-xs font-semibold text-muted-foreground">
                  <span>Teeth</span>
                  <span>Qty</span>
                  <span>Treatment</span>
                  <span>Doctor</span>
                  <span></span>
                  <span className="text-right">Notes</span>
                </div>

                {/* Plan Items */}
                <div className="space-y-1 -mt-3">
                  {planItems.map((item, i) => {
                    const teethNums = String(item.tooth_number || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                    const q1Teeth = teethNums.filter(t => (t >= 11 && t <= 18) || (t >= 51 && t <= 55));
                    const q2Teeth = teethNums.filter(t => (t >= 21 && t <= 28) || (t >= 61 && t <= 65));
                    const q3Teeth = teethNums.filter(t => (t >= 31 && t <= 38) || (t >= 71 && t <= 75));
                    const q4Teeth = teethNums.filter(t => (t >= 41 && t <= 48) || (t >= 81 && t <= 85));

                    const quadrantPrefix: Record<string, number> = { q1: 10, q2: 20, q3: 30, q4: 40 };
                    const updateQuadrantTeeth = (quadrant: string, value: string) => {
                      const prefix = quadrantPrefix[quadrant] || 0;
                      // Extract every 1-8 digit from the input (ignore commas/spaces/other chars)
                      const singleDigits = (value.match(/[1-8]/g) ?? []);
                      // Dedupe while preserving order
                      const uniqueDigits = Array.from(new Set(singleDigits));
                      const fdiNums = uniqueDigits.map(d => prefix + parseInt(d, 10));
                      const otherTeeth = teethNums.filter(t => {
                        if (quadrant === "q1") return !((t >= 11 && t <= 18) || (t >= 51 && t <= 55));
                        if (quadrant === "q2") return !((t >= 21 && t <= 28) || (t >= 61 && t <= 65));
                        if (quadrant === "q3") return !((t >= 31 && t <= 38) || (t >= 71 && t <= 75));
                        if (quadrant === "q4") return !((t >= 41 && t <= 48) || (t >= 81 && t <= 85));
                        return true;
                      });
                      const allTeeth = [...otherTeeth, ...fdiNums];
                      const n = [...planItems];
                      n[i] = { ...n[i], tooth_number: allTeeth.join(", "), quantity: String(allTeeth.length || 1) };
                      setPlanItems(n);
                    };

                    return (
                      <div key={i} className="grid grid-cols-[220px_60px_1fr_1fr_100px_150px] gap-2 items-center px-3 py-2 bg-background border border-border/30 rounded-md">
                        {/* Teeth - 4 editable quadrant boxes */}
                        <div className="grid grid-cols-2 gap-px bg-border rounded overflow-hidden" style={{ width: 220 }}>
                          {([{key:"q1",teeth:q1Teeth},{key:"q2",teeth:q2Teeth},{key:"q4",teeth:q4Teeth},{key:"q3",teeth:q3Teeth}] as const).map((q, qi) => {
                            const bufKey = `${i}:${q.key}`;
                            const derived = q.teeth.length > 0 ? q.teeth.map(t => t % 10).join(",") : "";
                            const displayValue = planQuadrantText[bufKey] ?? derived;
                            return (
                              <input
                                key={q.key}
                                className={cn(
                                  "h-9 w-full text-center text-xs font-semibold border border-border bg-background leading-tight outline-none focus:ring-1 focus:ring-primary/50",
                                  qi === 0 && "rounded-tl", qi === 1 && "rounded-tr", qi === 2 && "rounded-bl", qi === 3 && "rounded-br",
                                  (q.teeth.length > 0 || displayValue.trim() !== "") && "bg-primary/10 text-primary border-primary/40"
                                )}
                                placeholder={q.key.toUpperCase()}
                                title="Type 1-8 digits separated by comma (e.g. 1,3,5). Letters allowed for notes."
                                value={displayValue}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setPlanQuadrantText(prev => ({ ...prev, [bufKey]: v }));
                                  updateQuadrantTeeth(q.key, v);
                                }}
                              />
                            );
                          })}
                        </div>
                        {/* Qty */}
                        <Input type="number" min="1" value={item.quantity} onChange={(e) => { const n = [...planItems]; n[i].quantity = e.target.value; setPlanItems(n); }} className="h-8 text-xs text-center px-1" />
                        {/* Treatment */}
                        <Select value={item.treatment_type} onValueChange={(v) => { const n = [...planItems]; n[i].treatment_type = v; setPlanItems(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Treatment" /></SelectTrigger>
                          <SelectContent>
                            {treatmentTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {/* Doctor + Assistant */}
                        <div className="space-y-1">
                          <Select value={item.doctor} onValueChange={(v) => { const n = [...planItems]; n[i].doctor = v; setPlanItems(n); }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                            <SelectContent>
                              {doctorNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={item.assistant || ""} onValueChange={(v) => { const n = [...planItems]; n[i].assistant = v; setPlanItems(n); if (v) setAssistantErrorRows((prev) => { if (!prev.has(i)) return prev; const next = new Set(prev); next.delete(i); return next; }); }}>
                            <SelectTrigger className={cn("h-7 text-[11px]", assistantErrorRows.has(i) && "border-destructive ring-1 ring-destructive animate-pulse")}><SelectValue placeholder={assistantNames.length ? "Assistant *" : "Add in Settings"} /></SelectTrigger>
                            <SelectContent>
                              {assistantNames.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {assistantErrorRows.has(i) && (
                            <p className="text-[10px] text-destructive font-medium">Assistant required</p>
                          )}
                        </div>
                        {/* Actions: Move to upcoming + Return to consultation + Proceed to Lab */}
                        <div className="flex gap-0.5">
                          <Button variant="outline" size="icon" className="h-7 w-7" title="Move to Upcoming" onClick={() => {
                            const moved = planItems[i];
                            setPlanItems(planItems.filter((_, idx) => idx !== i));
                            setUpcomingItems([...upcomingItems, moved]);
                          }}>
                            <ArrowDown size={12} />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" title="Return to Consultation" onClick={() => {
                            const movedItem = planItems[i];
                            setPlanItems(planItems.filter((_, idx) => idx !== i));
                            const teethToRemove = movedItem.tooth_number
                              ? movedItem.tooth_number.split(",").map((t) => parseInt(t.trim())).filter((n) => !isNaN(n))
                              : [];
                            setProceededTeeth((prev) => {
                              const next = new Set(prev);
                              teethToRemove.forEach((t) => next.delete(t));
                              return next;
                            });
                            toast({ title: "Moved back to Consultation" });
                          }}>
                            <CornerDownLeft size={12} />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7 text-accent border-accent/30" title="Proceed to Lab" onClick={() => {
                            const newLabOrder = {
                              ...createEmptyLabOrder(),
                              tooth_number: item.tooth_number || "",
                              quadrants: toothNumbersToQuadrants(item.tooth_number || ""),
                              description: `${item.treatment_type} - Teeth: ${item.tooth_number || "N/A"}`,
                            };
                            setLabOrders((prev) => [...prev, newLabOrder]);
                            setCurrentStep("lab_orders");
                            toast({ title: "Proceeded to Lab Orders", description: `Tooth ${item.tooth_number || "—"} added to lab order` });
                          }}>
                            <FlaskConical size={12} />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7 text-success border-success/30" title="Proceed to Bill" onClick={() => {
                            const exists = billingItems.some(b => b.treatment_type === item.treatment_type && b.tooth_number === (item.tooth_number || "") && b.category === "treatment");
                            if (!exists) {
                              setBillingItems(prev => [...prev, {
                                treatment_type: item.treatment_type,
                                description: item.description,
                                tooth_number: item.tooth_number || "",
                                quantity: item.quantity || "1",
                                unit_price: item.estimated_cost || "0",
                                category: "treatment",
                              }]);
                            }
                            setInvoiceNumber((prev) => prev || `INV-${Date.now().toString(36).toUpperCase()}`);
                            setInvoiceDate((prev) => prev || format(new Date(), "yyyy-MM-dd"));
                            setCurrentStep("billing");
                            toast({ title: "Proceeded to Billing", description: `${item.treatment_type || "Treatment"} added to bill` });
                          }}>
                            <Receipt size={12} />
                          </Button>
                          {String(item.treatment_type || "").toLowerCase() === "consultation" && (() => {
                            const sessionBilled = billingItems.some(b => String(b.treatment_type || "").toLowerCase() === "consultation");
                            const locked = sessionBilled || consultationBilledInDb;
                            return (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10 disabled:opacity-50"
                                title={locked ? "This consultation has already been billed and cannot be removed." : "Remove from Treatment"}
                                disabled={locked}
                                onClick={() => {
                                  if (locked) {
                                    toast({ title: "Cannot remove", description: "This consultation has already been billed and cannot be removed.", variant: "destructive" });
                                    return;
                                  }
                                  setRemoveConsultIndex(i);
                                }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            );
                          })()}
                        </div>
                        {/* Notes */}
                        <Input placeholder="Notes..." value={item.description} onChange={(e) => { const n = [...planItems]; n[i].description = e.target.value; setPlanItems(n); }} className="h-8 text-xs" />
                      </div>
                    );
                  })}
                </div>

                {/* Add Row Button */}
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={addPlanItem} size="sm" className="gap-1">
                    <Plus size={14} /> Add row
                  </Button>
                </div>

                {/* Plan Notes */}
                <Textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Treatment notes..." rows={2} className="text-xs" />

                {/* Remove Consultation confirmation */}
                <AlertDialog open={removeConsultIndex !== null} onOpenChange={(open) => { if (!open) setRemoveConsultIndex(null); }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this consultation from today's treatment list?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Clinical findings and consultation history will be preserved. Only the treatment row will be removed from this session.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                          if (removeConsultIndex === null) return;
                          const idx = removeConsultIndex;
                          setPlanItems((prev) => prev.filter((_, i) => i !== idx));
                          setAssistantErrorRows((prev) => {
                            const next = new Set<number>();
                            prev.forEach((r) => { if (r < idx) next.add(r); else if (r > idx) next.add(r - 1); });
                            return next;
                          });
                          setRemoveConsultIndex(null);
                          toast({ title: "Consultation removed", description: "Clinical findings and history preserved." });
                        }}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>


                {/* ===== UPCOMING TREATMENTS SECTION ===== */}
                <div className="border-2 border-dashed border-accent rounded-lg p-4 space-y-3 bg-accent/5 min-h-[80px]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CalendarIcon size={16} className="text-primary" /> Upcoming Treatments
                    </h4>
                    <Badge variant="secondary" className="text-xs">{upcomingItems.length}</Badge>
                  </div>

                  {/* Auto-seed a default empty row so the table is always usable */}
                  {upcomingItems.length === 0 && (() => {
                    setTimeout(() => {
                      setUpcomingItems((prev) => prev.length === 0 ? [{
                        treatment_type: "",
                        tooth_number: "",
                        description: "",
                        estimated_cost: "",
                        priority: "medium",
                        doctor: planDoctor || patientAppointment?.doctor || "",
                        quantity: "1",
                      }] : prev);
                    }, 0);
                    return null;
                  })()}

                  {upcomingItems.map((item, i) => {
                    const teethNums = String(item.tooth_number || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                    const q1Teeth = teethNums.filter(t => (t >= 11 && t <= 18) || (t >= 51 && t <= 55));
                    const q2Teeth = teethNums.filter(t => (t >= 21 && t <= 28) || (t >= 61 && t <= 65));
                    const q3Teeth = teethNums.filter(t => (t >= 31 && t <= 38) || (t >= 71 && t <= 75));
                    const q4Teeth = teethNums.filter(t => (t >= 41 && t <= 48) || (t >= 81 && t <= 85));

                    const upQuadrantPrefix: Record<string, number> = { q1: 10, q2: 20, q3: 30, q4: 40 };
                    const updateUpcomingQuadrant = (quadrant: string, value: string) => {
                      const prefix = upQuadrantPrefix[quadrant] || 0;
                      // Extract every 1-8 digit from the input (ignore commas/spaces/other chars)
                      const singleDigits = (value.match(/[1-8]/g) ?? []);
                      // Dedupe while preserving order
                      const uniqueDigits = Array.from(new Set(singleDigits));
                      const fdiNums = uniqueDigits.map(d => prefix + parseInt(d, 10));
                      const otherTeeth = teethNums.filter(t => {
                        if (quadrant === "q1") return !((t >= 11 && t <= 18) || (t >= 51 && t <= 55));
                        if (quadrant === "q2") return !((t >= 21 && t <= 28) || (t >= 61 && t <= 65));
                        if (quadrant === "q3") return !((t >= 31 && t <= 38) || (t >= 71 && t <= 75));
                        if (quadrant === "q4") return !((t >= 41 && t <= 48) || (t >= 81 && t <= 85));
                        return true;
                      });
                      const allTeeth = [...otherTeeth, ...fdiNums];
                      const n = [...upcomingItems];
                      n[i] = { ...n[i], tooth_number: allTeeth.join(", "), quantity: String(allTeeth.length || 1) };
                      setUpcomingItems(n);
                    };

                    return (
                      <div key={i} className="grid grid-cols-[220px_60px_1fr_1fr_90px_120px] gap-2 items-center px-3 py-2 bg-background border border-border/30 rounded-md">
                        <div className="grid grid-cols-2 gap-px bg-border rounded overflow-hidden" style={{ width: 220 }}>
                          {([{key:"q1",teeth:q1Teeth},{key:"q2",teeth:q2Teeth},{key:"q4",teeth:q4Teeth},{key:"q3",teeth:q3Teeth}] as const).map((q, qi) => {
                            const bufKey = `${i}:${q.key}`;
                            const derived = q.teeth.length > 0 ? q.teeth.map(t => t % 10).join(",") : "";
                            const displayValue = upcomingQuadrantText[bufKey] ?? derived;
                            return (
                              <input
                                key={q.key}
                                className={cn(
                                  "h-9 w-full text-center text-xs font-semibold border border-border bg-background leading-tight outline-none focus:ring-1 focus:ring-primary/50",
                                  qi === 0 && "rounded-tl", qi === 1 && "rounded-tr", qi === 2 && "rounded-bl", qi === 3 && "rounded-br",
                                  q.teeth.length > 0 && "bg-primary/10 text-primary border-primary/40"
                                )}
                                placeholder={q.key.toUpperCase()}
                                title="Type 1-8 for teeth. Letters allowed for notes (e.g. UL, A)."
                                value={displayValue}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setUpcomingQuadrantText(prev => ({ ...prev, [bufKey]: v }));
                                  updateUpcomingQuadrant(q.key, v);
                                }}
                              />
                            );
                          })}
                        </div>
                        <Input type="number" min="1" value={item.quantity} onChange={(e) => { const n = [...upcomingItems]; n[i].quantity = e.target.value; setUpcomingItems(n); }} className="h-8 text-xs text-center px-1" />
                        <Select value={item.treatment_type} onValueChange={(v) => { const n = [...upcomingItems]; n[i].treatment_type = v; setUpcomingItems(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Treatment" /></SelectTrigger>
                          <SelectContent>{treatmentTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="space-y-1">
                          <Select value={item.doctor} onValueChange={(v) => { const n = [...upcomingItems]; n[i].doctor = v; setUpcomingItems(n); }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Doctor" /></SelectTrigger>
                            <SelectContent>{doctorNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={item.assistant || ""} onValueChange={(v) => { const n = [...upcomingItems]; n[i].assistant = v; setUpcomingItems(n); }}>
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder={assistantNames.length ? "Assistant" : "Add in Settings"} /></SelectTrigger>
                            <SelectContent>{assistantNames.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-0.5">
                          <Button variant="outline" size="icon" className="h-7 w-7" title="Move to Treatment Done" onClick={() => { const moved = upcomingItems[i]; setUpcomingItems(upcomingItems.filter((_, idx) => idx !== i)); setPlanItems([...planItems, moved]); }}>
                            <ArrowUp size={12} />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" title="Move to Consultation" onClick={() => {
                            const movedItem = upcomingItems[i];
                            setUpcomingItems(upcomingItems.filter((_, idx) => idx !== i));
                            // Re-enable matching Proceed button by removing from proceededGroups
                            const teethToRemove = movedItem.tooth_number
                              ? movedItem.tooth_number.split(",").map((t) => parseInt(t.trim())).filter((n) => !isNaN(n))
                              : [];
                            setProceededTeeth((prev) => {
                              const next = new Set(prev);
                              teethToRemove.forEach((t) => next.delete(t));
                              return next;
                            });
                            setCurrentStep("consultation");
                            toast({ title: "Moved back to Consultation" });
                          }}>
                            <CornerDownLeft size={12} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setUpcomingItems(upcomingItems.filter((_, idx) => idx !== i))}><X size={12} /></Button>
                        </div>
                        <Input placeholder="Notes" value={item.description} onChange={(e) => { const n = [...upcomingItems]; n[i].description = e.target.value; setUpcomingItems(n); }} className="h-8 text-xs" />
                      </div>
                    );
                  })}

                  {/* Add Row — always visible */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => setUpcomingItems([...upcomingItems, {
                        treatment_type: "",
                        tooth_number: "",
                        description: "",
                        estimated_cost: "",
                        priority: "medium",
                        doctor: planDoctor || patientAppointment?.doctor || "",
                        quantity: "1",
                      }])}
                    >
                      <Plus size={14} /> Add Row
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs gap-1"
                      onClick={() => { setShowUpcomingAppointment(showUpcomingAppointment !== null ? null : 0); setUpcomingAppDate(undefined); }}
                    >
                      <CalendarIcon size={12} /> Book Appointment for Upcoming Treatments
                    </Button>
                  </div>

                  {showUpcomingAppointment !== null && selectedPatient && upcomingItems.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg space-y-3 border border-border/50">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <CalendarIcon size={14} /> Smart Appointment Booking
                      </div>
                      
                      {/* Inline Calendar */}
                      <div className="flex justify-center">
                        <Calendar
                          mode="single"
                          selected={upcomingAppDate}
                          onSelect={setUpcomingAppDate}
                          className="pointer-events-auto rounded-md border bg-background p-2"
                        />
                      </div>

                      {/* Time Selection */}
                      {upcomingAppDate && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">Select Time</Label>
                          <div className="flex gap-1.5 items-center">
                            <Select value={upcomingAppHour} onValueChange={setUpcomingAppHour}>
                              <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{Array.from({ length: 12 }, (_, i) => { const v = String(i + 1).padStart(2, "0"); return <SelectItem key={v} value={v}>{v}</SelectItem>; })}</SelectContent>
                            </Select>
                            <span className="text-xs font-bold">:</span>
                            <Select value={upcomingAppMinute} onValueChange={setUpcomingAppMinute}>
                              <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{["00","05","10","15","20","25","30","35","40","45","50","55"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={upcomingAppPeriod} onValueChange={(v) => setUpcomingAppPeriod(v as "AM" | "PM")}>
                              <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* Existing Appointments for Selected Date */}
                      {upcomingAppDate && (
                        <DateAppointmentsList date={upcomingAppDate} />
                      )}

                      {/* Confirm / Cancel */}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 text-xs gap-1" disabled={!upcomingAppDate}
                          onClick={async () => {
                            if (!upcomingAppDate || !selectedPatient) return;
                            const treatments = upcomingItems.map(item => `${item.treatment_type}${item.tooth_number ? ` (Tooth #${item.tooth_number})` : ""}`).join(", ");
                            const dateStr = format(upcomingAppDate, "yyyy-MM-dd");
                            let h24 = parseInt(upcomingAppHour);
                            if (upcomingAppPeriod === "AM" && h24 === 12) h24 = 0;
                            else if (upcomingAppPeriod === "PM" && h24 !== 12) h24 += 12;
                            const mins = parseInt(upcomingAppMinute);
                            const startTime = `${String(h24).padStart(2, "0")}:${upcomingAppMinute}`;
                            const endMin = mins + 30;
                            const endTime = `${String(h24 + Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
                            const displayTime = `${upcomingAppHour}:${upcomingAppMinute} ${upcomingAppPeriod}`;
                            const { error } = await supabase.from("appointments").insert({
                              patient_id: selectedPatient.id, appointment_date: dateStr, start_time: startTime, end_time: endTime,
                              type: upcomingItems[0]?.treatment_type || "consultation", doctor: planDoctor || patientAppointment.doctor || null,
                              notes: `Upcoming: ${treatments}`, status: "scheduled", source: patientAppointment.source || "walk-in",
                            });
                            if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
                            else { toast({ title: "Appointment booked!", description: `${upcomingItems.length} treatments on ${format(upcomingAppDate, "dd MMM yyyy")} at ${displayTime}` }); setShowUpcomingAppointment(null); setUpcomingAppDate(undefined); setUpcomingAppHour("09"); setUpcomingAppMinute("00"); setUpcomingAppPeriod("AM"); }
                          }}>
                          <CalendarIcon size={12} /> Confirm Booking
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowUpcomingAppointment(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Book Appointment Button */}
                {selectedPatient && (
                  <>
                    <Button variant="outline" className="w-full gap-2 text-sm" onClick={() => setShowBookAppointmentDialog(true)}>
                      <CalendarIcon size={14} /> Book Appointment
                    </Button>

                    <Dialog open={showBookAppointmentDialog} onOpenChange={setShowBookAppointmentDialog}>
                      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <CalendarIcon size={18} /> Book Appointment
                          </DialogTitle>
                        </DialogHeader>
                        <BookAppointmentStep
                          renderQuickPatientSearch={() => <></>}
                          selectedPatient={selectedPatient}
                          doctorNames={doctorNames}
                          treatmentTypes={treatmentTypes}
                          defaultDoctor={planDoctor || patientAppointment.doctor || ""}
                          defaultSource={patientAppointment.source || "walk-in"}
                          embedded
                        />
                      </DialogContent>
                    </Dialog>
                  </>
                )}

              </CardContent>
            </Card>
          )}

          {/* Proceed Choice Dialog - Now or Schedule (rendered outside step cards) */}
          <Dialog open={showProceedChoiceDialog} onOpenChange={(open) => {
            setShowProceedChoiceDialog(open);
            if (!open) setPendingProceedGroup(null);
          }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>How would you like to proceed?</DialogTitle>
                <DialogDescription>
                  {pendingProceedGroup && `${pendingProceedGroup.treatment_needed || pendingProceedGroup.condition} - Teeth: ${pendingProceedGroup.teeth.join(", ")}`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 pt-2">
                <Button className="w-full gap-2" onClick={() => {
                  if (!pendingProceedGroup) return;
                  const group = pendingProceedGroup;
                  const treatmentKey = group.treatment_needed || "";
                  const isGeneral = group.teeth.length === 0;
                  
                  if (!isGeneral) {
                    setProceededTeeth((prev) => {
                      const next = new Set(prev);
                      group.teeth.forEach((t) => next.add(t));
                      return next;
                    });
                  }
                  
                  setPlanItems((prev) => {
                    if (isGeneral) {
                      // General finding (scaling/consultation) - no teeth
                      const exists = prev.some((item) => item.treatment_type === treatmentKey);
                      if (exists) return prev;
                      return [...prev, { treatment_type: treatmentKey, tooth_number: "", description: treatmentKey, estimated_cost: "", priority: "normal", doctor: planDoctor || "", quantity: "1" }];
                    }
                    const existingIndex = prev.findIndex((item) => item.treatment_type === treatmentKey);
                    if (existingIndex >= 0) {
                      const existing = prev[existingIndex];
                      const existingTeeth = existing.tooth_number ? existing.tooth_number.split(",").map((t) => t.trim()).filter(Boolean) : [];
                      const newTeeth = group.teeth.map(String);
                      const mergedTeeth = [...new Set([...existingTeeth, ...newTeeth])];
                      const updated = [...prev];
                      updated[existingIndex] = { ...existing, tooth_number: mergedTeeth.join(", "), quantity: String(mergedTeeth.length), description: `${treatmentKey || group.condition} - Teeth: ${mergedTeeth.join(", ")}` };
                      return updated;
                    }
                    return [...prev, { treatment_type: treatmentKey, tooth_number: group.teeth.join(", "), description: `${treatmentKey || group.condition} - Teeth: ${group.teeth.join(", ")}`, estimated_cost: "", priority: "normal", doctor: planDoctor || "", quantity: String(group.teeth.length) }];
                  });
                  toast({ title: isGeneral ? `${treatmentKey} added to Treatment Done` : `${group.teeth.length} teeth added to Treatment Done` });
                  setShowProceedChoiceDialog(false);
                  setPendingProceedGroup(null);
                }}>
                  <Plus size={16} /> Treatment Now
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => {
                  setShowProceedChoiceDialog(false);
                  setShowScheduleFromFinding(true);
                }}>
                  <CalendarIcon size={16} /> Schedule Appointment
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Schedule Appointment from Finding Dialog */}
          <Dialog open={showScheduleFromFinding} onOpenChange={(open) => {
            setShowScheduleFromFinding(open);
            if (!open) setPendingProceedGroup(null);
          }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarIcon size={18} /> Schedule Appointment
                </DialogTitle>
                {pendingProceedGroup && (
                  <DialogDescription>
                    {pendingProceedGroup.treatment_needed || pendingProceedGroup.condition} - Teeth: {pendingProceedGroup.teeth.join(", ")}
                  </DialogDescription>
                )}
              </DialogHeader>
              <BookAppointmentStep
                renderQuickPatientSearch={() => <></>}
                selectedPatient={selectedPatient}
                doctorNames={doctorNames}
                treatmentTypes={treatmentTypes}
                defaultDoctor={planDoctor || patientAppointment.doctor || ""}
                defaultSource={patientAppointment.source || "walk-in"}
                prefilledTeeth={pendingProceedGroup?.teeth ?? []}
                defaultTreatment={pendingProceedGroup?.treatment_needed}
                embedded
              />
            </DialogContent>
          </Dialog>

          {/* STEP 5: TREATMENT & PHOTOS */}
          {currentStep === "treatment" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Camera size={20} /> Treatment & Clinical Photos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderQuickPatientSearch()}

                {/* Upload & Webcam area */}
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center space-y-3">
                  <Camera size={32} className="mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Upload X-rays, clinical photos, or 3D scans</p>
                  <p className="text-xs text-muted-foreground">Supported formats: JPG, JPEG, PNG, WEBP, PDF</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button variant="outline" size="sm" onClick={startWebcam}>
                      <Camera size={14} className="mr-1" /> Live Camera
                    </Button>
                    <Button variant="outline" size="sm" onClick={startVideoRecorder}>
                      <Video size={14} className="mr-1" /> Record Video
                    </Button>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files) {
                            const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
                            const allowedExt = /\.(jpe?g|png|webp|pdf)$/i;
                            const rejected: string[] = [];
                            Array.from(files).forEach((f) => {
                              const ok = allowed.includes(f.type.toLowerCase()) || allowedExt.test(f.name);
                              if (ok) handleUploadPhoto(f, "clinical", "", "");
                              else rejected.push(f.name);
                            });
                            if (rejected.length) {
                              toast({
                                title: "Unsupported file type",
                                description: `Only JPG, JPEG, PNG, WEBP, PDF allowed. Rejected: ${rejected.join(", ")}`,
                                variant: "destructive",
                              });
                            }
                          }
                          e.target.value = "";
                        }}
                      />
                      <Button variant="outline" size="sm" asChild><span><Upload size={14} className="mr-1" /> Upload Files</span></Button>
                    </label>
                  </div>
                </div>

                {/* Live Webcam View */}
                {showWebcam && (
                  <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="space-y-1">
                      <Label className="text-xs">Select Camera</Label>
                      <Select value={selectedCameraId || undefined} onValueChange={(v) => switchCamera(v)}>
                        <SelectTrigger><SelectValue placeholder={cameraDevices.length ? "Select Camera" : "No cameras detected"} /></SelectTrigger>
                        <SelectContent>
                          {cameraDevices.map((d, i) => (
                            <SelectItem key={d.deviceId} value={d.deviceId}>{cameraLabel(d, i)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative rounded-lg overflow-hidden bg-foreground aspect-video">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-2 justify-center">
                      <Button onClick={captureFromWebcam} disabled={capturingPhoto} className="gradient-primary text-primary-foreground">
                        <Camera size={14} className="mr-1" /> {capturingPhoto ? "Capturing..." : "Capture Photo"}
                      </Button>
                      <Button variant="outline" onClick={stopWebcam}>
                        <X size={14} className="mr-1" /> Close Camera
                      </Button>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">Captured Photos ({capturedShots.length})</h4>
                      </div>
                      {capturedShots.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No photos captured yet. Click 'Capture Photo' to take shots.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {capturedShots.map(s => (
                            <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden">
                              <div className="relative aspect-video bg-muted">
                                <img src={s.url} alt="Captured" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewShotUrl(s.url)} />
                                <Badge variant="secondary" className="absolute top-1 left-1 text-[10px]">{s.takenAt.toLocaleTimeString("en-IN")}</Badge>
                                {s.saved && <Badge className="absolute top-1 right-1 text-[10px] bg-success text-success-foreground">Saved</Badge>}
                                {s.saving && <Badge variant="secondary" className="absolute top-1 right-1 text-[10px] gap-1"><Loader2 size={10} className="animate-spin" /> Uploading...</Badge>}
                                {s.failed && !s.saving && <Badge variant="destructive" className="absolute top-1 right-1 text-[10px]">Not saved</Badge>}
                              </div>
                              <div className="flex gap-1 p-1 justify-between">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Preview" onClick={() => setPreviewShotUrl(s.url)}><EyeIcon size={14} /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" disabled={s.saving} onClick={() => deleteShot(s.id)}><Trash2 size={14} /></Button>
                                {s.failed && !s.saving && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => saveShot(s.id)}>Retry Save</Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Dialog open={!!previewShotUrl} onOpenChange={(o) => !o && setPreviewShotUrl(null)}>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader><DialogTitle>Captured Photo</DialogTitle></DialogHeader>
                        {previewShotUrl && <img src={previewShotUrl} alt="Captured preview" className="w-full rounded-lg" />}
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Video Recorder View */}
                {showVideoRecorder && (
                  <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                      <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {recordingVideo && (
                        <div className="absolute top-2 left-2 flex items-center gap-2 bg-destructive text-destructive-foreground px-2 py-1 rounded text-xs font-medium">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          REC {Math.floor(recordingSeconds / 60).toString().padStart(2, "0")}:{(recordingSeconds % 60).toString().padStart(2, "0")}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 justify-center flex-wrap">
                      {!recordingVideo ? (
                        <Button onClick={beginRecording} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          <Video size={14} className="mr-1" /> Start Recording
                        </Button>
                      ) : (
                        <Button onClick={stopRecording} variant="outline" className="border-destructive text-destructive">
                          <Square size={14} className="mr-1" /> Stop & Save
                        </Button>
                      )}
                      <Button variant="outline" onClick={closeVideoRecorder}>
                        <X size={14} className="mr-1" /> Close
                      </Button>
                    </div>
                  </div>
                )}


                {/* Photo & Video Gallery */}
                {(() => {
                  const imagePhotos = savedPhotos.filter(p => p.photo_type !== "video");
                  const videoFiles = savedPhotos.filter(p => p.photo_type === "video");
                  return (
                    <>
                      {imagePhotos.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                              <Camera size={16} className="text-primary" /> Saved Photos ({imagePhotos.length})
                            </h3>
                            <div className="flex items-center gap-2">
                              {selectedPhotoIds.size > 0 && (
                                <Badge variant="secondary" className="text-xs">{selectedPhotoIds.size} selected</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => {
                                  if (selectedPhotoIds.size === imagePhotos.length) {
                                    setSelectedPhotoIds(new Set());
                                  } else {
                                    setSelectedPhotoIds(new Set(imagePhotos.map(p => p.id)));
                                  }
                                }}
                              >
                                {selectedPhotoIds.size === imagePhotos.length ? "Deselect All" : "Select All"}
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {imagePhotos.map((photo, idx) => {
                              const isSelected = selectedPhotoIds.has(photo.id);
                              return (
                                <div key={photo.id} className={cn("group relative rounded-lg overflow-hidden border-2 bg-muted/30 cursor-pointer transition-all", isSelected ? "border-primary ring-2 ring-primary/20" : "border-border")}>
                                  <div className="absolute top-2 left-2 z-10" onClick={(e) => { e.stopPropagation(); }}>
                                    <button
                                      className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors", isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-background/80 border-muted-foreground/40")}
                                      onClick={() => {
                                        setSelectedPhotoIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(photo.id)) next.delete(photo.id);
                                          else next.add(photo.id);
                                          return next;
                                        });
                                      }}
                                    >
                                      {isSelected && <Check size={12} />}
                                    </button>
                                  </div>
                                  <div onClick={() => setLightboxIndex(idx)}>
                                    <img
                                      src={getPhotoUrl(photo.file_path)}
                                      alt={photo.file_name || "Clinical photo"}
                                      className="w-full aspect-square object-cover"
                                      loading="lazy"
                                    />
                                    <div className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur-sm p-1.5 text-[10px]">
                                      <p className="font-medium text-foreground truncate">{photo.file_name || photo.photo_type}</p>
                                      {photo.tooth_number && <p className="text-muted-foreground">Tooth #{photo.tooth_number}</p>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Fullscreen Lightbox */}
                          {lightboxIndex !== null && imagePhotos[lightboxIndex] && (
                            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxIndex(null)}>
                              <button className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2" onClick={() => setLightboxIndex(null)}>
                                <X size={28} />
                              </button>
                              <button
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10 p-2 disabled:opacity-30"
                                disabled={lightboxIndex === 0}
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                              >
                                <ChevronLeft size={36} />
                              </button>
                              <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                                <img
                                  src={getPhotoUrl(imagePhotos[lightboxIndex].file_path)}
                                  alt={imagePhotos[lightboxIndex].file_name || "Clinical photo"}
                                  className="max-w-full max-h-[80vh] object-contain rounded-lg"
                                />
                                <div className="mt-3 text-center text-white/90 text-sm">
                                  <p className="font-medium">{imagePhotos[lightboxIndex].file_name || imagePhotos[lightboxIndex].photo_type}</p>
                                  {imagePhotos[lightboxIndex].tooth_number && <p className="text-white/60">Tooth #{imagePhotos[lightboxIndex].tooth_number}</p>}
                                  <p className="text-white/50 text-xs mt-1">{lightboxIndex + 1} / {imagePhotos.length}</p>
                                </div>
                              </div>
                              <button
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10 p-2 disabled:opacity-30"
                                disabled={lightboxIndex === imagePhotos.length - 1}
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                              >
                                <ChevronRight size={36} />
                              </button>
                            </div>
                          )}
                          {/* Share / Download Buttons */}
                          {selectedPatient && (
                            <div className="mt-3 flex flex-col sm:flex-row flex-wrap gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                                disabled={selectedPhotoIds.size === 0}
                                onClick={async () => {
                                  const photosToShare = imagePhotos.filter(p => selectedPhotoIds.has(p.id));
                                  const ok = await shareFilesNative(
                                    photosToShare,
                                    `Clinical photos - ${selectedPatient.first_name}`,
                                    `Hi ${selectedPatient.first_name}, here are your clinical photos.`
                                  );
                                  if (!ok) {
                                    toast({ title: "Sharing not supported", description: "Use Download then attach manually, or open on mobile to share as files." });
                                  }
                                }}
                              >
                                <Share2 size={16} className="mr-2" /> Share as Photo {selectedPhotoIds.size > 0 ? `(${selectedPhotoIds.size})` : ""}
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1"
                                disabled={selectedPhotoIds.size === 0}
                                onClick={async () => {
                                  const photosToShare = imagePhotos.filter(p => selectedPhotoIds.has(p.id));
                                  await downloadFiles(photosToShare);
                                }}
                              >
                                <Download size={16} className="mr-2" /> Download {selectedPhotoIds.size > 0 ? `(${selectedPhotoIds.size})` : ""}
                              </Button>
                              {selectedPatient.phone && (
                                <Button
                                  variant="outline"
                                  className="flex-1 border-green-500/30 text-green-600 hover:bg-green-500/10"
                                  disabled={selectedPhotoIds.size === 0}
                                  onClick={async () => {
                                    const photosToShare = imagePhotos.filter(p => selectedPhotoIds.has(p.id));
                                    // Try native file share first (opens WhatsApp etc. with actual files)
                                    const ok = await shareFilesNative(
                                      photosToShare,
                                      `Clinical photos - ${selectedPatient.first_name}`,
                                      `Hi ${selectedPatient.first_name}, here are your clinical photos.`
                                    );
                                    if (ok) return;
                                    // Desktop fallback: download files then open WhatsApp chat for manual attach
                                    await downloadFiles(photosToShare);
                                    const phone = selectedPatient.phone?.replace(/\D/g, "") || "";
                                    const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;
                                    const message = `Hi ${selectedPatient.first_name}, sharing your clinical photos (attached).`;
                                    toast({ title: "Photos downloaded", description: "Attach them in the WhatsApp chat that just opened." });
                                    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, "_blank");
                                  }}
                                >
                                  <MessageCircle size={16} className="mr-2" /> WhatsApp {selectedPhotoIds.size > 0 ? `(${selectedPhotoIds.size})` : ""}
                                </Button>
                              )}
                              {selectedPatient.email && (
                                <Button
                                  variant="outline"
                                  className="flex-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                                  disabled={selectedPhotoIds.size === 0}
                                  onClick={async () => {
                                    const photosToShare = imagePhotos.filter(p => selectedPhotoIds.has(p.id));
                                    // Download files so user can attach to email
                                    await downloadFiles(photosToShare);
                                    const subject = encodeURIComponent(`Your Clinical Photos - ${selectedPatient.first_name} ${selectedPatient.last_name}`);
                                    const body = encodeURIComponent(`Hi ${selectedPatient.first_name},\n\nPlease find your clinical photos attached.\n\nRegards`);
                                    toast({ title: "Photos downloaded", description: "Attach them to the email draft that just opened." });
                                    window.open(`mailto:${selectedPatient.email}?subject=${subject}&body=${body}`, "_blank");
                                  }}
                                >
                                  <Mail size={16} className="mr-2" /> Email {selectedPhotoIds.size > 0 ? `(${selectedPhotoIds.size})` : ""}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                                disabled={selectedPhotoIds.size === 0}
                                onClick={async () => {
                                  const ids = Array.from(selectedPhotoIds);
                                  if (ids.length === 0) return;
                                  if (!window.confirm(`Delete ${ids.length} selected photo(s)? This cannot be undone.`)) return;
                                  const toDelete = imagePhotos.filter(p => selectedPhotoIds.has(p.id));
                                  const paths = toDelete.map(p => p.file_path);
                                  if (paths.length > 0) {
                                    await supabase.storage.from("clinical-photos").remove(paths);
                                  }
                                  const { error } = await supabase.from("clinical_photos").delete().in("id", ids);
                                  if (error) {
                                    toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                                    return;
                                  }
                                  setSavedPhotos(prev => prev.filter(p => !selectedPhotoIds.has(p.id)));
                                  setSelectedPhotoIds(new Set());
                                  toast({ title: `${ids.length} photo(s) deleted` });
                                }}
                              >
                                <Trash2 size={16} className="mr-2" /> Delete {selectedPhotoIds.size > 0 ? `(${selectedPhotoIds.size})` : ""}
                              </Button>
                            </div>
                          )}

                        </div>
                      )}

                      {/* Saved Videos Gallery */}
                      {videoFiles.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-border">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                              <Video size={16} className="text-primary" /> Saved Videos ({videoFiles.length})
                            </h3>
                            <div className="flex items-center gap-2">
                              {selectedVideoIds.size > 0 && (
                                <Badge variant="secondary" className="text-xs">{selectedVideoIds.size} selected</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => {
                                  if (selectedVideoIds.size === videoFiles.length) {
                                    setSelectedVideoIds(new Set());
                                  } else {
                                    setSelectedVideoIds(new Set(videoFiles.map(v => v.id)));
                                  }
                                }}
                              >
                                {selectedVideoIds.size === videoFiles.length ? "Deselect All" : "Select All"}
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {videoFiles.map((vid) => {
                              const isSelected = selectedVideoIds.has(vid.id);
                              return (
                                <div key={vid.id} className={cn("group relative rounded-lg overflow-hidden border-2 bg-muted/30 transition-all", isSelected ? "border-primary ring-2 ring-primary/20" : "border-border")}>
                                  <div className="absolute top-2 left-2 z-10">
                                    <button
                                      className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors", isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-background/80 border-muted-foreground/40")}
                                      onClick={() => {
                                        setSelectedVideoIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(vid.id)) next.delete(vid.id);
                                          else next.add(vid.id);
                                          return next;
                                        });
                                      }}
                                    >
                                      {isSelected && <Check size={12} />}
                                    </button>
                                  </div>
                                  <div className="bg-black aspect-video">
                                    <video
                                      src={getPhotoUrl(vid.file_path)}
                                      controls
                                      preload="metadata"
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                  <div className="bg-background/80 backdrop-blur-sm p-2 text-xs">
                                    <p className="font-medium text-foreground truncate">{vid.file_name || "Clinical video"}</p>
                                    <p className="text-muted-foreground text-[10px]">{new Date(vid.created_at).toLocaleString()}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Video Share / Download / Delete Buttons */}
                          {selectedPatient && (
                            <div className="mt-3 flex flex-col sm:flex-row flex-wrap gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                                disabled={selectedVideoIds.size === 0}
                                onClick={async () => {
                                  const toShare = videoFiles.filter(v => selectedVideoIds.has(v.id));
                                  const ok = await shareFilesNative(
                                    toShare,
                                    `Clinical videos - ${selectedPatient.first_name}`,
                                    `Hi ${selectedPatient.first_name}, here are your clinical videos.`
                                  );
                                  if (!ok) {
                                    toast({ title: "Sharing not supported", description: "Use Download then attach manually, or open on mobile to share as files." });
                                  }
                                }}
                              >
                                <Share2 size={16} className="mr-2" /> Share as Video {selectedVideoIds.size > 0 ? `(${selectedVideoIds.size})` : ""}
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1"
                                disabled={selectedVideoIds.size === 0}
                                onClick={async () => {
                                  const toShare = videoFiles.filter(v => selectedVideoIds.has(v.id));
                                  await downloadFiles(toShare);
                                }}
                              >
                                <Download size={16} className="mr-2" /> Download {selectedVideoIds.size > 0 ? `(${selectedVideoIds.size})` : ""}
                              </Button>
                              {selectedPatient.phone && (
                                <Button
                                  variant="outline"
                                  className="flex-1 border-green-500/30 text-green-600 hover:bg-green-500/10"
                                  disabled={selectedVideoIds.size === 0}
                                  onClick={async () => {
                                    const toShare = videoFiles.filter(v => selectedVideoIds.has(v.id));
                                    const ok = await shareFilesNative(
                                      toShare,
                                      `Clinical videos - ${selectedPatient.first_name}`,
                                      `Hi ${selectedPatient.first_name}, here are your clinical videos.`
                                    );
                                    if (ok) return;
                                    await downloadFiles(toShare);
                                    const phone = selectedPatient.phone?.replace(/\D/g, "") || "";
                                    const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;
                                    const message = `Hi ${selectedPatient.first_name}, sharing your clinical videos (attached).`;
                                    toast({ title: "Videos downloaded", description: "Attach them in the WhatsApp chat that just opened." });
                                    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, "_blank");
                                  }}
                                >
                                  <MessageCircle size={16} className="mr-2" /> WhatsApp {selectedVideoIds.size > 0 ? `(${selectedVideoIds.size})` : ""}
                                </Button>
                              )}
                              {selectedPatient.email && (
                                <Button
                                  variant="outline"
                                  className="flex-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                                  disabled={selectedVideoIds.size === 0}
                                  onClick={async () => {
                                    const toShare = videoFiles.filter(v => selectedVideoIds.has(v.id));
                                    await downloadFiles(toShare);
                                    const subject = encodeURIComponent(`Your Clinical Videos - ${selectedPatient.first_name} ${selectedPatient.last_name}`);
                                    const body = encodeURIComponent(`Hi ${selectedPatient.first_name},\n\nPlease find your clinical videos attached.\n\nRegards`);
                                    toast({ title: "Videos downloaded", description: "Attach them to the email draft that just opened." });
                                    window.open(`mailto:${selectedPatient.email}?subject=${subject}&body=${body}`, "_blank");
                                  }}
                                >
                                  <Mail size={16} className="mr-2" /> Email {selectedVideoIds.size > 0 ? `(${selectedVideoIds.size})` : ""}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                                disabled={selectedVideoIds.size === 0}
                                onClick={async () => {
                                  const ids = Array.from(selectedVideoIds);
                                  if (ids.length === 0) return;
                                  if (!window.confirm(`Delete ${ids.length} selected video(s)? This cannot be undone.`)) return;
                                  const toDelete = videoFiles.filter(v => selectedVideoIds.has(v.id));
                                  const paths = toDelete.map(v => v.file_path);
                                  if (paths.length > 0) {
                                    await supabase.storage.from("clinical-photos").remove(paths);
                                  }
                                  const { error } = await supabase.from("clinical_photos").delete().in("id", ids);
                                  if (error) {
                                    toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                                    return;
                                  }
                                  setSavedPhotos(prev => prev.filter(p => !selectedVideoIds.has(p.id)));
                                  setSelectedVideoIds(new Set());
                                  toast({ title: `${ids.length} video(s) deleted` });
                                }}
                              >
                                <Trash2 size={16} className="mr-2" /> Delete {selectedVideoIds.size > 0 ? `(${selectedVideoIds.size})` : ""}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* STEP: DIAGNOSTICS (X-Ray & Blood Test) */}
          {currentStep === "diagnostics" && selectedPatient && (
            <DiagnosticsStep
              patient={selectedPatient as any}
              appointmentId={patientAppointment?.id ?? null}
              doctor={patientAppointment?.doctor ?? null}
              onContinue={() => setCurrentStep("consultation")}
            />
          )}

          {/* STEP 6: BILLING */}
          {currentStep === "billing" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="font-display flex items-center gap-2">
                    <Receipt size={20} /> Billing
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={attemptBackToPrescription} className="gap-1">
                    <ChevronLeft size={14} /> Back to Prescription
                  </Button>
                </div>
              </CardHeader>
              <AlertDialog open={showBillingBackConfirm} onOpenChange={setShowBillingBackConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Unsaved billing changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      You have unsaved billing changes. Do you want to leave this page?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Stay on Billing</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setShowBillingBackConfirm(false);
                        billingSavedSnapshotRef.current = computeBillingSnapshot(billingItems, discount);
                        setCurrentStep("prescription");
                      }}
                    >
                      Discard & Go Back
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <CardContent className="space-y-4">
                {/* Patient Info Header */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Patient ID</Label>
                        <p className="text-sm font-semibold">{formatPatientCode(selectedPatient?.patient_code)}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Patient Name</Label>
                        <p className="text-sm font-semibold">{selectedPatient?.first_name} {selectedPatient?.last_name}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Mobile Number</Label>
                        <p className="text-sm font-semibold">{selectedPatient?.phone || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Visit ID</Label>
                        <p className="text-sm font-semibold">{activeCheckin ? activeCheckin.id.slice(0, 8).toUpperCase() : "—"}</p>
                      </div>
                    </div>
                    <Dialog open={changePatientOpen} onOpenChange={setChangePatientOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="shrink-0">
                          <Search size={14} className="mr-1" /> Change Patient
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Change Patient</DialogTitle>
                          <DialogDescription>Search and select another patient to create or edit their bill.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 mt-2">
                          <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search patient by name, phone or ID..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="pl-8 h-9 text-sm"
                            />
                          </div>
                          {searchTerm && (
                            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto bg-card">
                              {filteredPatients.slice(0, 10).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedPatient(p);
                                    setSearchTerm("");
                                    setChangePatientOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/50 text-left text-sm"
                                >
                                  <span className="font-medium">{p.first_name} {p.last_name}</span>
                                  <span className="text-muted-foreground text-xs">{p.phone} · {formatPatientCode(p.patient_code)}</span>
                                </button>
                              ))}
                              {filteredPatients.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No patients found</p>}
                            </div>
                          )}
                          {!searchTerm && (
                            <p className="text-sm text-muted-foreground">Start typing to search patients.</p>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Invoice Number</Label>
                      <p className="text-sm font-semibold text-primary">{invoiceNumber || "Auto-generated"}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Invoice Date</Label>
                      <Input className="h-8 text-xs" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Billing Items - Category-wise Listed View */}
                {(() => {
                  const treatmentItems = billingItems.map((item, i) => ({ ...item, _idx: i })).filter(i => i.category === "treatment");
                  const pharmacyItems = billingItems.map((item, i) => ({ ...item, _idx: i })).filter(i => i.category === "prescription");
                  const labItems = billingItems.map((item, i) => ({ ...item, _idx: i })).filter(i => i.category === "lab");
                  const manualItems = billingItems.map((item, i) => ({ ...item, _idx: i })).filter(i => !["treatment", "prescription", "lab"].includes(i.category));

                  const renderCategorySection = (title: string, items: typeof treatmentItems, badgeClass: string, icon: string) => {
                    if (items.length === 0) return null;
                    const catTotal = items.reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1), 0);
                    return (
                      <div className="border rounded-lg overflow-hidden">
                        <div className={`flex items-center justify-between px-3 py-2 ${badgeClass}`}>
                          <span className="text-xs font-semibold flex items-center gap-1.5">{icon} {title} ({items.length})</span>
                          <span className="text-xs font-bold">₹{catTotal.toLocaleString()}</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/30 border-b">
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Item</th>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Description</th>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-20">Tooth</th>
                              <th className="px-3 py-1.5 text-center font-medium text-muted-foreground w-14">Qty</th>
                              <th className="px-3 py-1.5 text-right font-medium text-muted-foreground w-20">Price</th>
                              <th className="px-3 py-1.5 text-right font-medium text-muted-foreground w-20">Total</th>
                              <th className="px-3 py-1.5 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item, si) => {
                              const idx = item._idx;
                              const lineTotal = (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1);
                              return (
                                <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                                  <td className="px-3 py-1.5 text-muted-foreground">{si + 1}</td>
                                  <td className="px-3 py-1.5">
                                    <Input className="h-7 text-xs border-0 bg-transparent shadow-none px-0" value={item.treatment_type} onChange={(e) => { const n = [...billingItems]; n[idx].treatment_type = e.target.value; setBillingItems(n); }} />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input className="h-7 text-xs border-0 bg-transparent shadow-none px-0" value={item.description} onChange={(e) => { const n = [...billingItems]; n[idx].description = e.target.value; setBillingItems(n); }} />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input className="h-7 text-xs border-0 bg-transparent shadow-none px-0" value={item.tooth_number} onChange={(e) => { const n = [...billingItems]; n[idx].tooth_number = e.target.value; setBillingItems(n); }} />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input className="h-7 text-xs border-0 bg-transparent shadow-none px-0 text-center" type="number" value={item.quantity} onChange={(e) => { const n = [...billingItems]; n[idx].quantity = e.target.value; setBillingItems(n); }} />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input className="h-7 text-xs border-0 bg-transparent shadow-none px-0 text-right" type="number" placeholder="₹0" value={item.unit_price} onChange={(e) => { const n = [...billingItems]; n[idx].unit_price = e.target.value; setBillingItems(n); }} />
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-medium">₹{lineTotal.toLocaleString()}</td>
                                  <td className="px-1 py-1.5">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setBillingItems(billingItems.filter((_, i) => i !== idx))}><Trash2 size={11} /></Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {renderCategorySection("Treatment", treatmentItems, "bg-primary/10 text-primary", "🦷")}
                      {renderCategorySection("Pharmacy", pharmacyItems, "bg-accent/10 text-accent", "💊")}
                      {renderCategorySection("Lab", labItems, "bg-warning/10 text-warning", "🔬")}
                      {renderCategorySection("Other", manualItems, "bg-muted text-muted-foreground", "📋")}
                    </div>
                  );
                })()}
                <Button variant="outline" onClick={addBillingItem} size="sm"><Plus size={14} className="mr-1" /> Add Item</Button>

                {/* Category-wise Split Summary */}
                {(() => {
                  const treatmentTotal = billingItems.filter(i => i.category === "treatment").reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1), 0);
                  const medicineTotal = billingItems.filter(i => i.category === "prescription").reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1), 0);
                  const labTotal = billingItems.filter(i => i.category === "lab").reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1), 0);
                  const manualTotal = billingItems.filter(i => i.category === "manual").reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1), 0);
                  const subtotal = treatmentTotal + medicineTotal + labTotal + manualTotal;
                  const discountAmt = parseFloat(discount) || 0;
                  const total = subtotal - discountAmt;

                  return (
                    <div className="space-y-2 p-4 bg-card border rounded-lg">
                      {treatmentTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2"><Badge variant="secondary" className="text-[9px] bg-primary/10 text-primary">Treatment</Badge></span>
                          <span>₹{treatmentTotal.toLocaleString()}</span>
                        </div>
                      )}
                      {medicineTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2"><Badge variant="secondary" className="text-[9px] bg-accent/10 text-accent">Medicine</Badge></span>
                          <span>₹{medicineTotal.toLocaleString()}</span>
                        </div>
                      )}
                      {labTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2"><Badge variant="secondary" className="text-[9px] bg-warning/10 text-warning">Lab</Badge></span>
                          <span>₹{labTotal.toLocaleString()}</span>
                        </div>
                      )}
                      {manualTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2"><Badge variant="secondary" className="text-[9px]">Manual</Badge></span>
                          <span>₹{manualTotal.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm border-t pt-2">
                        <span>Discount</span>
                        <Input type="number" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 text-right h-8 text-xs" />
                      </div>
                      <div className="border-t pt-2 flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span className="text-primary">₹{total.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}

                <Button onClick={handleSaveBilling} disabled={savingBilling} className="gradient-primary text-primary-foreground">
                  {savingBilling ? "Generating..." : "Generate Bill & Continue"} <ArrowRight size={16} className="ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 7: PRESCRIPTION */}
          {currentStep === "prescription" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Pill size={20} /> Prescription
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderQuickPatientSearch()}
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">Prescribed by:</Label>
                  <Select value={patientAppointment.doctor} onValueChange={(v) => updateAppointmentField("doctor", v)}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctorNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Select Template</Label>
                    <div className="flex gap-2">
                      <Select onValueChange={(v) => applyPrescriptionTemplate(v)}>
                        <SelectTrigger className="h-9 text-xs flex-1"><SelectValue placeholder="Choose a prescription template..." /></SelectTrigger>
                        <SelectContent>
                          {prescriptionTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name} {t.treatment_category ? `(${t.treatment_category})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={openCreateTemplate}><Plus size={14} className="mr-1" /> New</Button>
                    </div>
                    {prescriptionTemplates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {prescriptionTemplates.map((t) => (
                          <Badge key={t.id} variant="secondary" className="text-[10px] cursor-pointer hover:bg-primary/20 gap-1" onClick={() => applyPrescriptionTemplate(t.id)}>
                            {t.name}
                            <Pencil size={10} className="opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); openEditTemplate(t); }} />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Diagnosis</Label>
                    <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis summary..." rows={1} />
                  </div>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-24">Type</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Medicine</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">Dosage</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-28">Instruction</th>
                        <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-16">Morning</th>
                        <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-16">Afternoon</th>
                        <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-16">Evening</th>
                        <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-16">Night</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">Days</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">Unit</th>
                        <th className="px-2 py-1.5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicines.map((med, i) => {
                        // Types: unique (case-insensitive) from Settings master
                        const typeMap = new Map<string, string>();
                        medicinesList.forEach((m) => {
                          const t = (m.type || "").trim();
                          if (!t) return;
                          const k = t.toLowerCase();
                          if (!typeMap.has(k)) typeMap.set(k, t);
                        });
                        const availableTypes = Array.from(typeMap.values()).sort((a, b) => a.localeCompare(b));
                        // Only show medicines when a type is selected, and only those matching the type
                        const selectedType = (med.medicine_type || "").trim().toLowerCase();
                        const filteredMedsRaw = selectedType
                          ? medicinesList.filter((m) => (m.type || "").trim().toLowerCase() === selectedType)
                          : [];
                        // Dedupe medicine names within the selected type (case-insensitive)
                        const seenMedNames = new Set<string>();
                        const filteredMeds = filteredMedsRaw.filter((m) => {
                          const k = m.name.trim().toLowerCase();
                          if (seenMedNames.has(k)) return false;
                          seenMedNames.add(k);
                          return true;
                        });

                        return (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                          <td className="px-1 py-1">
                            <Select value={med.medicine_type} onValueChange={(v) => {
                              const n = [...medicines];
                              n[i].medicine_type = v;
                              if (n[i].medicine_name) {
                                const cur = medicinesList.find((m) => m.name === n[i].medicine_name);
                                if (!cur || (cur.type || "").trim().toLowerCase() !== v.trim().toLowerCase()) {
                                  n[i].medicine_name = "";
                                }
                              }
                              setMedicines(n);
                            }}>
                              <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1"><SelectValue placeholder="Type" /></SelectTrigger>
                              <SelectContent>{availableTypes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-1">
                            <Select value={med.medicine_name} onValueChange={(v) => {
                              const n = [...medicines];
                              n[i].medicine_name = v;
                              const sel: any = medicinesList.find((m) => m.name === v);
                              if (sel?.type) n[i].medicine_type = sel.type;
                              if (sel?.dosage) n[i].dosage = sel.dosage;
                              if (sel?.unit) n[i].unit = sel.unit;
                              if (sel?.unit_cost != null) n[i].unit_cost = String(sel.unit_cost);
                              // Auto-fill morning/afternoon/evening/night from Settings master
                              const normSlot = (val: any) => {
                                const s = (val ?? "").toString().trim();
                                if (!s || s === "-") return "0";
                                return s;
                              };
                              if (sel) {
                                n[i].morning = normSlot(sel.morning);
                                n[i].afternoon = normSlot(sel.afternoon);
                                n[i].evening = normSlot(sel.evening);
                                n[i].night = normSlot(sel.night);
                                if (sel.days) n[i].duration = String(sel.days);
                                if (sel.food_instruction) n[i].frequency = sel.food_instruction;
                              }
                              setMedicines(n);
                            }}>
                              <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1"><SelectValue placeholder={selectedType ? "Select" : "Pick type first"} /></SelectTrigger>
                              <SelectContent>
                                {filteredMeds.length === 0 ? (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    {selectedType ? "No medicines for this type" : "Select a type first"}
                                  </div>
                                ) : filteredMeds.map((m) => (<SelectItem key={m.id} value={m.name}>{toTitleCase(m.name)}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </td>

                          <td className="px-1 py-1">
                            {(() => {
                              const typeKey = (med.medicine_type || "").trim().toLowerCase();
                              const dOpts = dosagesList.filter(d => d.medicine_type.toLowerCase() === typeKey);
                              return (
                                <>
                                  <Input
                                    list={dOpts.length > 0 ? `dosage-main-${i}` : undefined}
                                    className="h-7 text-xs border-0 bg-transparent shadow-none px-1"
                                    placeholder={getDosagePlaceholder(med.medicine_type)}
                                    value={med.dosage || ""}
                                    onChange={(e) => { const n = [...medicines]; n[i].dosage = e.target.value; setMedicines(n); }}
                                  />
                                  {dOpts.length > 0 && (
                                    <datalist id={`dosage-main-${i}`}>
                                      {dOpts.map((d) => (<option key={d.id} value={d.value} />))}
                                    </datalist>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-1 py-1">
                            <Select value={med.frequency} onValueChange={(v) => { const n = [...medicines]; n[i].frequency = v; setMedicines(n); }}>
                              <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Before Food">Before Food</SelectItem>
                                <SelectItem value="After Food">After Food</SelectItem>
                                <SelectItem value="After Brushing">After Brushing</SelectItem>
                                <SelectItem value="After Mouthwash">After Mouthwash</SelectItem>
                                <SelectItem value="SOS">SOS</SelectItem>
                                <SelectItem value="For Gargling">For Gargling</SelectItem>
                                <SelectItem value="For Brushing">For Brushing</SelectItem>
                                <SelectItem value="Empty Stomach">Empty Stomach</SelectItem>
                                <SelectItem value="With Milk">With Milk</SelectItem>
                                <SelectItem value="Before Sleep">Before Sleep</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          {(["morning", "afternoon", "evening", "night"] as const).map((slot) => (
                            <td key={slot} className="px-1 py-1">
                              <Input
                                className="h-7 text-xs border-0 bg-transparent shadow-none px-1 text-center"
                                placeholder=""
                                value={med[slot] === "0" ? "" : med[slot]}
                                onChange={(e) => {
                                  const n = [...medicines];
                                  n[i][slot] = e.target.value.trim() || "0";
                                  setMedicines(n);
                                }}
                              />
                            </td>
                          ))}
                          <td className="px-1 py-1">
                            <Select value={med.duration} onValueChange={(v) => { const n = [...medicines]; n[i].duration = v; setMedicines(n); }}>
                              <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1"><SelectValue placeholder="Days" /></SelectTrigger>
                              <SelectContent>{[1,2,3,5,7,10,14,15,21,30,45,60,90].map((d) => (<SelectItem key={d} value={`${d} days`}>{d} days</SelectItem>))}</SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-1">
                            <Input
                              className="h-7 text-xs border-0 bg-transparent shadow-none px-1"
                              placeholder="unit"
                              value={med.unit || ""}
                              onChange={(e) => { const n = [...medicines]; n[i].unit = e.target.value; setMedicines(n); }}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setMedicines(medicines.filter((_, idx) => idx !== i))}><Trash2 size={12} /></Button>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={addMedicine} size="sm"><Plus size={14} className="mr-1" /> Add Medicine</Button>
                  <Button variant="outline" size="sm" className="text-success border-success/30 gap-1" disabled={isBusy("proceed_bill_rx")} onClick={() => runLocked("proceed_bill_rx", async () => {
                    setBillingItems((prev) => mergeExistingBillingItems(prev));
                    setInvoiceNumber((prev) => prev || `INV-${Date.now().toString(36).toUpperCase()}`);
                    setInvoiceDate((prev) => prev || format(new Date(), "yyyy-MM-dd"));
                    setCurrentStep("billing");
                    toast({ title: "Proceeded to Billing", description: "Medicines added to bill" });
                  })}>
                    <Receipt size={14} /> Proceed to Bill
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PRESCRIPTION TEMPLATE DIALOG */}
          <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingTemplate ? "Edit Template" : "Create Prescription Template"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Template Name *</Label><Input className="h-9 text-xs" value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. RCT Prescription" /></div>
                  <div className="space-y-1"><Label className="text-xs">Treatment Category</Label><Input className="h-9 text-xs" value={templateForm.treatment_category} onChange={e => setTemplateForm(p => ({ ...p, treatment_category: e.target.value }))} placeholder="e.g. RCT, Implant" /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-9 text-xs" value={templateForm.description} onChange={e => setTemplateForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief notes..." /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Medicines</Label>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setTemplateItems([...templateItems, emptyTemplateItem()])}><Plus size={12} className="mr-1" /> Add Medicine</Button>
                  </div>
                  {templateItems.map((item, idx) => (
                    <div key={idx} className="p-3 bg-secondary/30 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] px-1.5">{idx + 1}</Badge>
                        <span className="text-xs font-medium flex-1">{toTitleCase(item.medicine_name) || "New Medicine"}</span>
                        {templateItems.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTemplateItems(templateItems.filter((_, i) => i !== idx))}><Trash2 size={12} /></Button>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Medicine</Label>
                          <Select value={item.medicine_name} onValueChange={(v) => updateTemplateItem(idx, "medicine_name", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{medicinesList.map(m => <SelectItem key={m.id} value={m.name}>{toTitleCase(m.name)} {m.type ? `(${m.type})` : ""}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Dosage</Label>
                          <Input className="h-8 text-xs" placeholder="e.g. 500mg" value={item.dosage} onChange={e => updateTemplateItem(idx, "dosage", e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                          <Select value={item.frequency} onValueChange={(v) => updateTemplateItem(idx, "frequency", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {["Before Food", "After Food", "After Brushing", "After Mouthwash", "SOS", "For Gargling", "For Brushing", "Before Sleep", "With Milk"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {(["morning", "afternoon", "evening", "night"] as const).map((slot) => (
                          <div key={slot} className="flex flex-col gap-0.5">
                            <Label className="text-[10px] text-muted-foreground capitalize">{slot}</Label>
                            <Select value={item[slot]} onValueChange={(v) => updateTemplateItem(idx, slot, v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="0" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0</SelectItem>
                                <SelectItem value="½">½</SelectItem>
                                <SelectItem value="1">1</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Days</Label>
                          <Select value={item.duration} onValueChange={(v) => updateTemplateItem(idx, "duration", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Days" /></SelectTrigger>
                            <SelectContent>{[1,2,3,5,7,10,14,15,21,30,45,60,90].map(d => <SelectItem key={d} value={`${d} days`}>{d} days</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Instructions</Label>
                        <Input className="h-8 text-xs" placeholder="Special instructions..." value={item.instructions} onChange={e => updateTemplateItem(idx, "instructions", e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                {editingTemplate ? (
                  <Button variant="destructive" size="sm" className="text-xs" onClick={() => { deleteTemplate(editingTemplate.id); setShowTemplateDialog(false); }}>
                    <Trash2 size={12} className="mr-1" /> Delete Template
                  </Button>
                ) : <div />}
                <Button onClick={saveTemplate} className="gradient-primary border-0">{editingTemplate ? "Update Template" : "Create Template"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* STEP: LAB ORDERS */}
          {currentStep === "lab_orders" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <FlaskConical size={20} /> Lab Orders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderQuickPatientSearch()}

                {/* Saved Lab Orders */}
                {savedLabOrders.filter(o => o.status !== "delivered").length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Active Orders ({savedLabOrders.filter(o => o.status !== "delivered").length})</h3>
                    <div className="space-y-2">
                      {savedLabOrders.filter(o => o.status !== "delivered").map((o: any, idx: number) => {
                        // Parse teeth for quadrant display
                        const toothStr = resolveLabOrderToothNumber(o);
                        const teethNums = parseToothNumbers(toothStr);
                        const oq1 = teethNums.filter((t: number) => t >= 11 && t <= 18);
                        const oq2 = teethNums.filter((t: number) => t >= 21 && t <= 28);
                        const oq3 = teethNums.filter((t: number) => t >= 31 && t <= 38);
                        const oq4 = teethNums.filter((t: number) => t >= 41 && t <= 48);
                        return (
                        <div key={o.id} className={`p-3 rounded-lg border space-y-2 ${o.expected_delivery_date && new Date(o.expected_delivery_date) < new Date() ? "border-destructive/40 bg-destructive/5" : "bg-secondary/30"}`}>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1.5">{idx + 1}</Badge>
                              <span className="text-sm font-medium">{o.work_type?.replace(/_/g, " ")}</span>
                              <span className="text-xs text-muted-foreground">• {o.lab_name}</span>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${o.status === "in_progress" ? "text-warning border-warning/30" : "text-primary border-primary/30"}`}>
                              {o.status?.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          {/* Quadrant display */}
                          {teethNums.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">Teeth:</span>
                              <div className="grid grid-cols-2 gap-px bg-border rounded overflow-hidden" style={{ width: 128 }}>
                                {([{key:"Q1",teeth:oq1},{key:"Q2",teeth:oq2},{key:"Q4",teeth:oq4},{key:"Q3",teeth:oq3}]).map((q, qi) => (
                                  <div key={q.key} className={cn(
                                    "min-h-7 px-1 py-0.5 flex items-center justify-center text-[8px] font-semibold border border-border bg-background leading-tight text-center",
                                    qi === 0 && "rounded-tl", qi === 1 && "rounded-tr", qi === 2 && "rounded-bl", qi === 3 && "rounded-br",
                                    q.teeth.length > 0 && "bg-primary/10 text-primary border-primary/40"
                                  )}>
                                    {q.teeth.length > 0 ? q.teeth.map(t => t % 10).join(",") : q.key}
                                  </div>
                                ))}
                              </div>
                              <Badge variant="secondary" className="text-[10px]">Qty: {teethNums.length}</Badge>
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Order Date: </span>
                              <span className="font-medium">{o.sent_date || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Expected: </span>
                              <span className="font-medium">{o.expected_delivery_date || "—"}</span>
                              {o.expected_delivery_date && new Date(o.expected_delivery_date) < new Date() && (
                                <Badge variant="destructive" className="ml-1 text-[9px] px-1">Overdue</Badge>
                              )}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Warranty: </span>
                              <span className="font-medium">{o.material || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Patient Bill: </span>
                              <span className="font-medium">₹{Number(o.patient_bill || 0).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => handleEditLabOrder(o)}>
                              <Pencil size={12} /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-xs h-7 gap-1 text-destructive border-destructive/30" onClick={() => deleteLabOrder(o.id)}>
                              <Trash2 size={12} /> Delete
                            </Button>
                            {o.status === "sent" && (
                              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => updateLabOrderStatus(o.id, "in_progress")}>
                                In Progress
                              </Button>
                            )}
                            {(o.status === "sent" || o.status === "in_progress") && (
                              <Button variant="outline" size="sm" className="text-xs h-7 text-accent border-accent/30" onClick={() => updateLabOrderStatus(o.id, "delivered", format(new Date(), "yyyy-MM-dd"))}>
                                Mark Delivered
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="text-xs h-7 text-warning border-warning/30" onClick={() => handleAddRework(o.id)}>
                              + Rework
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    <div className="border-t pt-3" />
                  </div>
                )}

                {/* New Lab Order Form */}
                <h3 className="text-sm font-semibold text-foreground">{editingLabOrderId ? "Edit Order" : "Create New Order"}</h3>
                {labOrders.map((order, i) => (
                  <div key={i} className="p-3 bg-secondary/30 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] px-1.5">{i + 1}</Badge>
                      <span className="text-xs font-medium text-foreground flex-1">{order.work_type || "New Order"}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeLabOrder(i)}><Trash2 size={12} /></Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* Tooth - Quadrant Input */}
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Label className="text-[10px] text-muted-foreground">Teeth (Quadrants)</Label>
                          <span className="text-[10px] text-muted-foreground">Qty: {getQuadrantQuantity(order.quadrants)}</span>
                        </div>
                        {(() => {
                          const quadrants = order.quadrants || toothNumbersToQuadrants(String(order.tooth_number || ""));
                          const updateLabQuadrant = (quadrant: QuadrantKey, value: string) => {
                            const n = [...labOrders];
                            const nextQuadrants = { ...quadrants, [quadrant]: sanitizeQuadrantInput(value) };
                            n[i] = {
                              ...n[i],
                              quadrants: nextQuadrants,
                              tooth_number: quadrantsToToothNumber(nextQuadrants),
                            };
                            setLabOrders(n);
                          };
                          return (
                            <div className="grid grid-cols-2 gap-px bg-border rounded overflow-hidden" style={{ width: 176 }}>
                              {LAB_ORDER_QUADRANT_DISPLAY_ORDER.map((quadrant, qi) => (
                                <input
                                  key={quadrant}
                                  className={cn(
                                    "h-8 w-full border border-border bg-background px-1.5 text-left text-[10px] font-semibold leading-tight outline-none focus:ring-1 focus:ring-primary/50",
                                    qi === 0 && "rounded-tl", qi === 1 && "rounded-tr", qi === 2 && "rounded-bl", qi === 3 && "rounded-br",
                                    parseQuadrantDigits(quadrants[quadrant]).length > 0 && "bg-primary/10 text-primary border-primary/40"
                                  )}
                                  placeholder={quadrant.toUpperCase()}
                                  value={quadrants[quadrant]}
                                  onChange={(e) => updateLabQuadrant(quadrant, e.target.value)}
                                />
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Lab Name */}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Lab</Label>
                        <Select value={order.lab_name} onValueChange={(v) => {
                          const n = [...labOrders];
                          n[i].lab_name = v;
                          const lab = labsList.find(l => l.name === v);
                          if (lab?.mobile) n[i].lab_phone = lab.mobile;
                          setLabOrders(n);
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select lab" /></SelectTrigger>
                          <SelectContent>
                            {labsList.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Work Type */}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Work Type</Label>
                        <Select value={order.work_type} onValueChange={(v) => { const n = [...labOrders]; n[i].work_type = v; setLabOrders(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select work" /></SelectTrigger>
                          <SelectContent>
                            {labWorksList.map(w => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Warranty */}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Warranty</Label>
                        <Select value={order.material} onValueChange={(v) => { const n = [...labOrders]; n[i].material = v; setLabOrders(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select warranty" /></SelectTrigger>
                          <SelectContent>
                            {WARRANTY_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Recommended Doctor */}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Recommended Doctor</Label>
                        <Select value={order.doctor} onValueChange={(v) => { const n = [...labOrders]; n[i].doctor = v; setLabOrders(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                          <SelectContent>
                            {doctorNames.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {/* Shade */}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Shade</Label>
                        <Select value={order.shade} onValueChange={(v) => { const n = [...labOrders]; n[i].shade = v; setLabOrders(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select shade" /></SelectTrigger>
                          <SelectContent>
                            {["A1","A2","A3","A3.5","A4","B1","B2","B3","B4","C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4"].map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[10px] text-muted-foreground">Price of Material (₹)</Label>
                        <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={order.price_of_material} onChange={(e) => { const n = [...labOrders]; n[i].price_of_material = e.target.value; setLabOrders(n); }} />
                      </div>

                      <div>
                        <Label className="text-[10px] text-muted-foreground">Lab Expense (₹)</Label>
                        <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={order.lab_expense} onChange={(e) => { const n = [...labOrders]; n[i].lab_expense = e.target.value; setLabOrders(n); }} />
                      </div>

                      <div>
                        <Label className="text-[10px] text-muted-foreground">Paid to Lab (₹)</Label>
                        <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={order.lab_expense_paid_amount} onChange={(e) => { const n = [...labOrders]; n[i].lab_expense_paid_amount = e.target.value; setLabOrders(n); }} />
                      </div>

                      <div>
                        <Label className="text-[10px] text-muted-foreground">Patient Bill (₹)</Label>
                        <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={order.patient_bill} onChange={(e) => { const n = [...labOrders]; n[i].patient_bill = e.target.value; setLabOrders(n); }} />
                      </div>

                      {/* Notes */}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Note</Label>
                        <Input className="h-8 text-xs" placeholder="Any notes..." value={order.notes} onChange={(e) => { const n = [...labOrders]; n[i].notes = e.target.value; setLabOrders(n); }} />
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Order Date</Label>
                        <Input className="h-8 text-xs" type="date" value={order.sent_date} onChange={(e) => { const n = [...labOrders]; n[i].sent_date = e.target.value; setLabOrders(n); }} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Expected Arrival Date</Label>
                        <Input className="h-8 text-xs" type="date" value={order.expected_delivery_date} onChange={(e) => { const n = [...labOrders]; n[i].expected_delivery_date = e.target.value; setLabOrders(n); }} />
                      </div>
                    </div>
                  </div>
                ))}

                {!editingLabOrderId && (
                  <Button variant="outline" onClick={addLabOrder} size="sm"><Plus size={14} className="mr-1" /> Create New Order</Button>
                )}

                <div className="flex gap-2">
                  {editingLabOrderId && (
                    <Button variant="outline" onClick={handleCancelEditLabOrder}>
                      Cancel Edit
                    </Button>
                  )}
                  <Button variant="outline" className="text-success border-success/30 gap-1" onClick={async () => {
                    // Save unsaved draft lab orders to DB first
                    const unsavedDrafts = labOrders.filter(o => o.lab_name && o.work_type);
                    if (unsavedDrafts.length > 0 && selectedPatient) {
                      const rows = unsavedDrafts.map(o => {
                        const toothNumber = resolveLabOrderToothNumber(o);
                        return {
                          patient_id: selectedPatient.id,
                          checkin_id: activeCheckin?.id || null,
                          lab_name: o.lab_name,
                          lab_phone: o.lab_phone || null,
                          work_type: o.work_type,
                          material: o.material || null,
                          shade: o.shade || null,
                          tooth_number: toothNumber || null,
                          description: toothNumber ? `Teeth: ${toothNumber}` : (o.description || null),
                          price_of_material: parseFloat(o.price_of_material) || 0,
                          lab_expense: parseFloat(o.lab_expense) || 0,
                          patient_bill: parseFloat(o.patient_bill) || 0,
                          lab_expense_paid_amount: parseFloat(o.lab_expense_paid_amount) || 0,
                          sent_date: o.sent_date || format(workflowDate, "yyyy-MM-dd"),
                          expected_delivery_date: o.expected_delivery_date || null,
                          notes: o.notes || null,
                          doctor: o.doctor || null,
                          created_at: workflowTimestampISO(),
                        };
                      });
                      await supabase.from("lab_orders").insert(rows as any);
                      setLabOrders([]);
                      await fetchLabOrders();
                    }

                    // Now use all saved orders for billing
                    const latestSaved = (await supabase.from("lab_orders").select("*").eq("patient_id", selectedPatient!.id).order("created_at", { ascending: false })).data || [];
                    const allLabOrders = latestSaved.filter((o: any) => o.status !== "delivered");
                    allLabOrders.forEach((lo: any) => {
                      if (lo.work_type) {
                        const toothStr = resolveLabOrderToothNumber(lo);
                        const qty = parseToothNumbers(toothStr).length || 1;
                        const desc = `${lo.lab_name}${lo.material ? ` - ${lo.material}` : ""}${toothStr ? ` (Teeth: ${toothStr})` : ""}`;
                        const exists = billingItems.some(b => b.description === desc && b.category === "lab");
                        if (!exists) {
                          setBillingItems(prev => [...prev, {
                            treatment_type: `Lab: ${(lo.work_type || "").replace(/_/g, " ")}`,
                            description: desc,
                            tooth_number: toothStr,
                            quantity: String(qty),
                            unit_price: String(lo.patient_bill || 0),
                            category: "lab",
                          }]);
                        }
                      }
                    });
                    setInvoiceNumber((prev) => prev || `INV-${Date.now().toString(36).toUpperCase()}`);
                    setInvoiceDate((prev) => prev || format(new Date(), "yyyy-MM-dd"));
                    setCurrentStep("billing");
                    toast({ title: "Proceeded to Billing", description: "Lab orders added to bill" });
                  }}>
                    <Receipt size={14} /> Proceed to Bill
                  </Button>
                  {editingLabOrderId && (
                    <Button onClick={handleSaveLabOrders} disabled={isBusy("lab_orders")} className="gradient-primary text-primary-foreground">
                      Update Order <ArrowRight size={16} className="ml-2" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "treatment_summary" && (
            <TreatmentSummary selectedPatient={selectedPatient} renderQuickPatientSearch={renderQuickPatientSearch} />
          )}

          {/* PAYMENT STEP */}
          {currentStep === "payment" && (
            <PaymentStep
              selectedPatient={selectedPatient}
              renderQuickPatientSearch={renderQuickPatientSearch}
              activeCheckinId={activeCheckin?.id ?? null}
              onContinue={() => setCurrentStep("qc_doctor")}
            />
          )}

          {(currentStep === "qc_doctor" || currentStep === "qc_lab" || currentStep === "qc_pharma") && (
            <QualityCheckStep
              key={currentStep}
              kind={currentStep === "qc_doctor" ? "doctor" : currentStep === "qc_lab" ? "lab" : "pharma"}
              patient={selectedPatient}
              checkinId={activeCheckin?.id ?? null}
              workflowDate={workflowDate}
              renderQuickPatientSearch={renderQuickPatientSearch}
              onContinue={() => setCurrentStep(currentStep === "qc_doctor" ? "qc_lab" : currentStep === "qc_lab" ? "qc_pharma" : "checkout")}
            />
          )}

          {/* STEP 8: CHECKOUT */}
          {currentStep === "checkout" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <LogOut size={20} /> Patient Checkout
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                {renderQuickPatientSearch()}
                <div className="py-8">
                  <div className="w-20 h-20 rounded-full gradient-accent flex items-center justify-center mx-auto mb-4">
                    <LogOut size={32} className="text-accent-foreground" />
                  </div>
                  <h3 className="text-xl font-bold font-display mb-2">Ready to Checkout</h3>
                  <p className="text-muted-foreground mb-1">
                    Patient: <strong>{selectedPatient?.first_name} {selectedPatient?.last_name}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    All records have been saved. Complete the checkout below.
                  </p>
                </div>

                {/* Google Review Checkbox */}
                <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-warning/5 border border-warning/20">
                  <Checkbox
                    id="sendReview"
                    checked={sendReview}
                    onCheckedChange={(checked) => setSendReview(checked === true)}
                  />
                  <label htmlFor="sendReview" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <Star size={16} className="text-warning" />
                    Send Google Review link via WhatsApp automatically
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button onClick={handleCheckout} disabled={isCheckingOut} className="gradient-primary text-primary-foreground" size="lg">
                    <LogOut size={16} className="mr-2" />
                    {isCheckingOut ? "Processing..." : sendReview ? "Checkout & Send Review Request" : "Complete Checkout"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}



          {/* STEP: HISTORY */}
          {currentStep === "history" && (
            <HistoryStep renderQuickPatientSearch={renderQuickPatientSearch} selectedPatient={selectedPatient} />
          )}
        </div>

        {/* Sidebar - Today's Queue */}
        {rightPanelCollapsed ? (
          <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30">
            <Button
              variant="outline"
              size="icon"
              className="rounded-l-lg rounded-r-none h-12 w-8 border-r-0 bg-card shadow-md"
              onClick={() => setRightPanelCollapsed(false)}
              title="Show Today's Queue"
            >
              <PanelRightOpen size={16} />
            </Button>
          </div>
        ) : (
          <div className="space-y-4 relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -left-3 top-0 h-7 w-7 rounded-full bg-card border shadow-sm z-10"
              onClick={() => setRightPanelCollapsed(true)}
              title="Hide Today's Queue"
            >
              <PanelRightClose size={14} />
            </Button>

            {selectedPatient && activeCheckin && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display">Current Patient</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedPatient.phone}</p>
                  <Badge className="mt-2 bg-accent/20 text-accent text-xs">In Progress</Badge>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center justify-between gap-2">
                  <span>Queue ({todayCheckins.length})</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Refresh queue"
                      onClick={async () => {
                        setQueueRefreshing(true);
                        try {
                          await Promise.all([fetchTodayCheckins(), fetchTodayAppointments()]);
                          toast({ title: "Queue refreshed" });
                        } finally {
                          setQueueRefreshing(false);
                        }
                      }}
                      disabled={queueRefreshing}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${queueRefreshing ? "animate-spin" : ""}`} />
                    </Button>
                    <Badge variant="outline" className="text-[10px] font-normal">{format(workflowDate, "dd MMM yyyy")}</Badge>
                  </div>
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Only checked-in patients</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {todayCheckins.length === 0 && (
                    <p className="text-xs text-muted-foreground">No check-ins on this date</p>
                  )}
                  {todayCheckins.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full flex items-center justify-between py-1.5 border-b last:border-0 hover:bg-secondary/50 rounded px-1 transition-colors text-left"
                      onClick={async () => {
                        const { data: patientData } = await supabase
                          .from("patients")
                          .select("id, first_name, last_name, phone, email, date_of_birth, gender, patient_code, address")
                          .eq("id", c.patient_id)
                          .single();
                        if (patientData) {
                          setSelectedPatient(patientData);
                          fetchPatientAppointment(patientData.id);
                          if (c.status === "checked_in") {
                            setActiveCheckin({ id: c.id, patient_id: c.patient_id, status: c.status, checkin_time: c.checkin_time });
                            setCurrentStep("vitals");
                          } else {
                            // Already checked out — treat as fresh entry; staff must click Check-in again
                            setActiveCheckin(null);
                            setCurrentStep("checkin");
                          }
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{c.patients?.first_name} {c.patients?.last_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(c.checkin_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.appointment?.doctor && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary">{c.appointment.doctor}</Badge>
                          )}
                          {c.appointment?.type && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-accent/30 text-accent-foreground">{c.appointment.type}</Badge>
                          )}
                          {c.appointment?.source && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-muted-foreground/30 text-muted-foreground">{c.appointment.source}</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${c.status === "checked_out" ? "text-accent" : "text-warning"}`}>
                        {c.status === "checked_out" ? "Done" : "In Clinic"}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>


      {/* Admit Card Dialog */}
      <Dialog open={showAdmitCard} onOpenChange={setShowAdmitCard}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><CreditCard size={18} /> Patient Admit Card</DialogTitle>
          </DialogHeader>
          {selectedPatient && (
            <div id="admit-card-content">
              <div className="border-2 border-primary/30 rounded-xl p-5 space-y-4 bg-card">
                {/* Clinic Header */}
                <div className="text-center border-b pb-3">
                  <h2 className="text-lg font-bold text-primary font-display">🦷 Dental Clinic</h2>
                  <p className="text-[10px] text-muted-foreground">Patient Admit Card</p>
                </div>

                {/* Photo + Info */}
                <div className="flex gap-4 items-start">
                  <div className="h-16 w-16 rounded-full bg-muted border flex items-center justify-center overflow-hidden shrink-0">
                    {patientPhotoUrl ? (
                      <img src={patientPhotoUrl} alt="Patient" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-muted-foreground">
                        {selectedPatient.first_name[0]}{selectedPatient.last_name[0]}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm flex-1">
                    <p className="font-bold text-base">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                    <p className="text-xs text-muted-foreground">P.ID: {formatPatientCode(selectedPatient.patient_code)}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Mobile:</span> <span className="font-medium">{selectedPatient.phone || "—"}</span></div>
                  <div><span className="text-muted-foreground">Gender:</span> <span className="font-medium capitalize">{selectedPatient.gender || "—"}</span></div>
                  <div><span className="text-muted-foreground">DOB:</span> <span className="font-medium">{selectedPatient.date_of_birth || "—"}</span></div>
                  <div><span className="text-muted-foreground">Age:</span> <span className="font-medium">{getPatientAgeLabel(selectedPatient.date_of_birth)}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{selectedPatient.address || "—"}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(), "dd MMM yyyy, hh:mm a")}</span></div>
                </div>

                {/* Footer */}
                <div className="border-t pt-2 text-center">
                  <p className="text-[9px] text-muted-foreground">This card is valid for today's visit only.</p>
                </div>
              </div>
            </div>
          )}
          <Button
            className="w-full gradient-primary text-primary-foreground gap-2"
            onClick={async () => {
              const content = document.getElementById("admit-card-content");
              if (!content) return;
              const { openBrandedPrintWindow } = await import("@/lib/clinicBranding");
              const extraStyles = `
                .info-row { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 12px; }
                .avatar { width: 60px; height: 60px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: #94a3b8; border: 1px solid #e2e8f0; overflow: hidden; flex-shrink: 0; }
                .avatar img { width: 100%; height: 100%; object-fit: cover; }
                .name { font-weight: bold; font-size: 16px; }
                .pid { font-size: 11px; color: #888; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; }
                .grid .full { grid-column: span 2; }
                .label { color: #888; }
              `;
              const body = `
                <h2 style="text-align:center;margin:0 0 12px;">Patient Admit Card</h2>
                <div class="info-row">
                  <div class="avatar">${patientPhotoUrl ? `<img src="${patientPhotoUrl}" />` : `${selectedPatient?.first_name[0]}${selectedPatient?.last_name[0]}`}</div>
                  <div><div class="name">${selectedPatient?.first_name} ${selectedPatient?.last_name}</div><div class="pid">P.ID: ${formatPatientCode(selectedPatient?.patient_code)}</div></div>
                </div>
                <div class="grid">
                  <div><span class="label">Mobile:</span> ${selectedPatient?.phone || "—"}</div>
                  <div><span class="label">Gender:</span> ${selectedPatient?.gender || "—"}</div>
                  <div><span class="label">DOB:</span> ${selectedPatient?.date_of_birth || "—"}</div>
                  <div><span class="label">Age:</span> ${selectedPatient?.date_of_birth ? Math.floor((new Date().getTime() - new Date(selectedPatient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) + " yrs" : "—"}</div>
                  <div class="full"><span class="label">Address:</span> ${selectedPatient?.address || "—"}</div>
                  <div class="full"><span class="label">Date:</span> ${format(new Date(), "dd MMM yyyy, hh:mm a")}</div>
                </div>
                <div style="text-align:center;font-size:10px;color:#aaa;margin-top:12px;">This card is valid for today's visit only.</div>`;
              await openBrandedPrintWindow({ title: "Admit Card", bodyHtml: body, width: 480, height: 700 });
            }}
          >
            <Printer size={16} /> Print Admit Card
          </Button>
        </DialogContent>
      </Dialog>

      <BillingDetailDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
        billing={selectedBillingRecord}
        patientName={invoiceSearchPatientName || (selectedPatient ? `${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim() : "")}
        allBillings={previousBillings}
        onRefresh={() => { fetchPreviousBillings(); if (invoiceSearch) searchInvoiceByNumber(invoiceSearch); }}
      />
    </div>
  );
};

export default ClinicWorkflow;

