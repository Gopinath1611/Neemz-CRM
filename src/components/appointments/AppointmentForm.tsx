import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInYears } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { type Patient } from "@/pages/Appointments";
import { DEFAULT_APPOINTMENT_TYPE_OPTIONS, DEFAULT_DOCTOR_OPTIONS, type SelectOption } from "@/hooks/useClinicMasters";
import { Search, User, Camera, MessageCircle, Phone, CheckCircle2, Plus } from "lucide-react";
import { formatPatientCode } from "@/lib/patientCode";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";

interface Props {
  patients: Patient[];
  selectedDate: Date;
  doctorOptions?: SelectOption[];
  treatmentOptions?: SelectOption[];
  sourceOptions?: SelectOption[];
  onSuccess: () => void;
}

const AppointmentForm = ({
  patients,
  selectedDate,
  doctorOptions = DEFAULT_DOCTOR_OPTIONS,
  treatmentOptions = DEFAULT_APPOINTMENT_TYPE_OPTIONS,
  sourceOptions = [],
  onSuccess,
}: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [districtError, setDistrictError] = useState(false);

  // Auto-capitalize first letter of each word (used for patient name typing).
  const toTitleCase = (s: string) =>
    s.replace(/(^|\s)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
  const [patientSearch, setPatientSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [dobDate, setDobDate] = useState<Date | undefined>(undefined);
  const [manualAge, setManualAge] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const [createdPatient, setCreatedPatient] = useState<{ id: string; code: number; name: string; phone: string } | null>(null);
  const [addDistrictOpen, setAddDistrictOpen] = useState(false);
  const [newDistrictName, setNewDistrictName] = useState("");
  const [formData, setFormData] = useState({
    patientId: "",
    newName: "",
    newPhoneCountry: "+91",
    newPhone: "",
    newEmail: "",
    newGender: "",
    newDistrict: "",
    newState: "",
    newCountry: "",
    date: format(selectedDate, "yyyy-MM-dd"),
    timeHour: "09",
    timeMinute: "00",
    timePeriod: "AM" as "AM" | "PM",
    type: "",
    doctor: "",
    notes: "",
    source: "walk-in",
    welcomeTemplate: "Welcome to our clinic! 🦷 We look forward to providing you with excellent dental care. Thank you for choosing us!",
  });

  // Supported country dial codes for the mobile number prefix.
  // maxLen = max number of digits in the local subscriber number.
  const COUNTRY_CODES: { code: string; dial: string; flag: string; label: string; maxLen: number }[] = [
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
  const activeCountry = COUNTRY_CODES.find((c) => c.dial === formData.newPhoneCountry) ?? COUNTRY_CODES[0];
  const phoneDigits = formData.newPhone.replace(/\D/g, "");
  // Reject obviously invalid patterns: all-same-digit (e.g. 6666666666), or
  // straight sequential ascending/descending (e.g. 1234567890 / 9876543210).
  const SEQ_ASC = "0123456789";
  const SEQ_DESC = "9876543210";
  const isRepeatingOrSequential = (digits: string) => {
    if (digits.length < 4) return false;
    if (/^(\d)\1+$/.test(digits)) return true;
    if (SEQ_ASC.includes(digits) || SEQ_DESC.includes(digits)) return true;
    return false;
  };
  // India-specific rule: mobile numbers must start with 6, 7, 8, or 9.
  const indiaStartValid =
    activeCountry.code !== "IN" || /^[6-9]/.test(phoneDigits);
  const phoneInvalidReason: string | null = (() => {
    if (phoneDigits.length !== activeCountry.maxLen) {
      return `Enter a valid ${activeCountry.maxLen}-digit mobile number for ${activeCountry.label}.`;
    }
    if (!indiaStartValid) {
      return "Enter a valid mobile number — Indian mobile numbers must start with 6, 7, 8 or 9.";
    }
    if (isRepeatingOrSequential(phoneDigits)) {
      return "Enter a valid mobile number — repeating or sequential digits are not allowed.";
    }
    return null;
  })();
  const isPhoneValid = phoneInvalidReason === null;

  // Referrer state (only used when source === "referral")
  const [referrerSearch, setReferrerSearch] = useState("");
  const [referrerSuggestionsOpen, setReferrerSuggestionsOpen] = useState(false);
  const [selectedReferrer, setSelectedReferrer] = useState<Patient | null>(null);

  const normalizePhone = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
  const normalizePhoneTail = (value: string | null | undefined) => {
    const digits = normalizePhone(value);
    return digits.length > 10 ? digits.slice(-10) : digits;
  };
  const normalizeText = (value: string | null | undefined) =>
    (value ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const matchesPatientSearch = useCallback((patient: Patient, rawQuery: string) => {
    const query = normalizeText(rawQuery);
    const phoneQuery = normalizePhone(rawQuery);
    const phoneTailQuery = normalizePhoneTail(rawQuery);
    const patientCodeQuery = rawQuery.replace(/\D/g, "");
    const fullName = normalizeText(`${patient.first_name} ${patient.last_name}`);
    const patientPhone = normalizePhone(patient.phone);
    const patientPhoneTail = normalizePhoneTail(patient.phone);
    const patientCode = String(patient.patient_code ?? "");

    return (
      (!!query && fullName.includes(query)) ||
      (!!phoneQuery && (patientPhone.includes(phoneQuery) || patientPhoneTail.includes(phoneTailQuery))) ||
      (!!patientCodeQuery && !!patientCode && patientCode.includes(patientCodeQuery))
    );
  }, []);

  const [debouncedReferrerSearch, setDebouncedReferrerSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedReferrerSearch(referrerSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [referrerSearch]);

  const { data: liveReferrers = [] } = useQuery({
    queryKey: ["referrer-search", debouncedReferrerSearch],
    enabled: debouncedReferrerSearch.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const q = debouncedReferrerSearch;
      const digits = q.replace(/\D/g, "");
      const orParts: string[] = [
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `phone.ilike.%${digits || q}%`,
      ];
      if (digits) orParts.push(`patient_code.eq.${digits}`);
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, patient_code")
        .or(orParts.join(","))
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Patient[];
    },
  });

  const filteredReferrers = useMemo(() => {
    if (!referrerSearch.trim()) return [];
    const localMatches = patients.filter((p) => matchesPatientSearch(p, referrerSearch));
    const merged = [...liveReferrers];
    for (const p of localMatches) {
      if (!merged.some((m) => m.id === p.id)) merged.push(p);
    }
    return merged.slice(0, 10);
  }, [referrerSearch, patients, liveReferrers, matchesPatientSearch]);

  const selectReferrer = (p: Patient) => {
    setSelectedReferrer(p);
    setReferrerSearch(`${p.first_name} ${p.last_name} — ${p.phone || "No phone"}`);
    setReferrerSuggestionsOpen(false);
    setFormData((prev) => ({ ...prev, source: "referral" }));
  };
  const clearReferrer = () => {
    setSelectedReferrer(null);
    setReferrerSearch("");
  };

  // Fetch districts
  const { data: districts = [], refetch: refetchDistricts } = useQuery({
    queryKey: ["districts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("districts").select("id, name, state, country").order("name");
      if (error) throw error;
      return data as { id: string; name: string; state: string; country: string }[];
    },
  });

  useEffect(() => {
    setFormData((prev) => {
      const nextDate = format(selectedDate, "yyyy-MM-dd");
      const nextDoctor = doctorOptions.some((option) => option.value === prev.doctor)
        ? prev.doctor
        : "";
      const nextType = treatmentOptions.some((option) => option.value === prev.type)
        ? prev.type
        : "";

      if (prev.date === nextDate && prev.doctor === nextDoctor && prev.type === nextType) {
        return prev;
      }

      return {
        ...prev,
        date: nextDate,
        doctor: nextDoctor,
        type: nextType,
      };
    });
  }, [selectedDate, doctorOptions, treatmentOptions]);

  const calculatedAge = useMemo(() => {
    if (dobDate) return differenceInYears(new Date(), dobDate);
    if (manualAge) return parseInt(manualAge);
    return null;
  }, [dobDate, manualAge]);

  // Debounce search input
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(patientSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [patientSearch]);

  // Live server-side patient search — always reflects the freshest data,
  // including patients added moments ago that aren't in the cached `patients` prop.
  const { data: livePatients = [] } = useQuery({
    queryKey: ["patient-search", debouncedSearch],
    enabled: debouncedSearch.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const q = debouncedSearch;
      const digits = q.replace(/\D/g, "");
      const orParts: string[] = [
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `phone.ilike.%${digits || q}%`,
      ];
      if (digits) orParts.push(`patient_code.eq.${digits}`);
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, patient_code")
        .or(orParts.join(","))
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Patient[];
    },
  });

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const localMatches = patients.filter((p) => matchesPatientSearch(p, patientSearch));
    const merged = [...livePatients];
    for (const p of localMatches) {
      if (!merged.some((m) => m.id === p.id)) merged.push(p);
    }
    return merged.slice(0, 10);
  }, [patientSearch, patients, livePatients, matchesPatientSearch]);

  // Note: We intentionally do NOT auto-merge or block based on duplicate phone numbers.
  // Family members (e.g. parent + children) may share the same mobile number.
  // Each new patient gets a distinct patient_id.


  const formatSourceLabel = (value: string) => {
    const masterLabel = sourceOptions.find((option) => option.value === value)?.label;
    if (masterLabel) return masterLabel;
    return value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const selectPatient = useCallback(async (patient: Patient) => {
    setSelectedPatient(patient);
    setFormData((prev) => ({ ...prev, patientId: patient.id }));
    setPatientSearch(`${patient.first_name} ${patient.last_name} — ${patient.phone || "No phone"}`);
    setShowSuggestions(false);
    clearReferrer();

    // Auto-fill source from previous appointment (or patient.source) for returning patients
    setIsResolvingSource(true);
    try {
      const { data: lastApt } = await supabase
        .from("appointments")
        .select("source")
        .eq("patient_id", patient.id)
        .not("source", "is", null)
        .order("appointment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let prevSource: string | null = lastApt?.source ?? null;
      if (!prevSource) {
        const { data: pData } = await supabase
          .from("patients")
          .select("source")
          .eq("id", patient.id)
          .maybeSingle();
        prevSource = (pData as any)?.source ?? null;
      }
      setFormData((prev) => ({ ...prev, source: (prevSource as string) || "walk-in" }));
    } catch {
      setFormData((prev) => ({ ...prev, source: "walk-in" }));
    } finally {
      setIsResolvingSource(false);
    }
  }, [clearReferrer]);

  useEffect(() => {
    if (isNewPatient || selectedPatient || !patientSearch.trim()) return;

    const normalizedSearch = normalizePhone(patientSearch);
    const normalizedSearchTail = normalizePhoneTail(patientSearch);
    if (!normalizedSearch) return;

    const exactMatches = patients.filter((patient) => {
      const patientPhone = normalizePhone(patient.phone);
      const patientPhoneTail = normalizePhoneTail(patient.phone);
      return patientPhone === normalizedSearch || patientPhoneTail === normalizedSearchTail;
    });
    if (exactMatches.length === 1) {
      void selectPatient(exactMatches[0]);
    }
  }, [isNewPatient, patientSearch, patients, selectedPatient, selectPatient]);

  const clearPatient = () => {
    setSelectedPatient(null);
    setIsResolvingSource(false);
    clearReferrer();
    setFormData({ ...formData, patientId: "", source: "walk-in" });
    setPatientSearch("");
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAddDistrict = async () => {
    if (!newDistrictName.trim()) return;
    try {
      const { error } = await supabase.from("districts").insert({ name: newDistrictName.trim() });
      if (error) throw error;
      toast({ title: "District added!" });
      setFormData({ ...formData, newDistrict: newDistrictName.trim() });
      setNewDistrictName("");
      setAddDistrictOpen(false);
      refetchDistricts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (isNewPatient) {
      if (!formData.newName.trim()) {
        toast({ title: "Error", description: "Name is mandatory", variant: "destructive" });
        return;
      }
      if (!formData.newPhone.trim()) {
        toast({ title: "Error", description: "Contact number is mandatory", variant: "destructive" });
        return;
      }
      if (!isPhoneValid) {
        toast({
          title: "Invalid mobile number",
          description: phoneInvalidReason ?? `Enter a valid ${activeCountry.maxLen}-digit mobile number for ${activeCountry.label}.`,
          variant: "destructive",
        });
        return;
      }
      if (!dobDate) {
        toast({ title: "Error", description: "Date of birth is mandatory", variant: "destructive" });
        return;
      }

      const missingDistrict = !formData.newDistrict.trim();
      if (missingDistrict) {
        setDistrictError(missingDistrict);
        toast({ title: "Missing fields", description: "Please select District.", variant: "destructive" });
        return;
      }
    }

    if (isNewPatient && !formData.source?.trim()) {
      setSourceError(true);
      toast({ title: "Source required", description: "Please select a Source.", variant: "destructive" });
      return;
    }

    if (formData.source === "referral" && isNewPatient && !selectedReferrer) {
      toast({ title: "Error", description: "Please select the referring patient", variant: "destructive" });
      return;
    }

    setLoading(true);
    const now = format(new Date(), "HH:mm:ss");
    // Convert 12h time to 24h
    let h24 = parseInt(formData.timeHour, 10);
    if (formData.timePeriod === "AM" && h24 === 12) h24 = 0;
    else if (formData.timePeriod === "PM" && h24 !== 12) h24 += 12;
    const startTime = `${String(h24).padStart(2, "0")}:${formData.timeMinute}:00`;
    const endMin = h24 * 60 + parseInt(formData.timeMinute, 10) + 30;
    const eh = Math.floor(endMin / 60) % 24;
    const em = endMin % 60;
    const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;
    try {
      let patientId = formData.patientId;
      if (isNewPatient) {
        const trimmedName = formData.newName.trim();
        const nameParts = trimmedName.split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || "";
        // Store the full readable number in `phone` (back-compat with search,
        // display, and existing WhatsApp/SMS code paths) AND keep the country
        // code separately in `phone_country_code` for future WA/SMS integrations.
        const composedPhone = `${formData.newPhoneCountry} ${formData.newPhone}`;
        const { data: newPatient, error: patientError } = await supabase
          .from("patients")
          .insert({
            first_name: firstName,
            last_name: lastName,
            phone: composedPhone,
            phone_country_code: formData.newPhoneCountry,
            email: formData.newEmail || null,
            gender: formData.newGender,
            date_of_birth: dobDate ? format(dobDate, "yyyy-MM-dd") : null,
            district: formData.newDistrict || null,
            source: formData.source || "walk-in",
          })
          .select("id, patient_code, first_name, last_name, phone")
          .single();
        if (patientError) throw patientError;
        patientId = newPatient.id;
        queryClient.setQueryData(["patients"], (current: Patient[] | undefined) => {
          const nextPatient: Patient = {
            id: newPatient.id,
            first_name: newPatient.first_name,
            last_name: newPatient.last_name,
            phone: newPatient.phone,
            patient_code: newPatient.patient_code,
          };
          const existing = current ?? [];
          if (existing.some((patient) => patient.id === nextPatient.id)) {
            return existing;
          }
          return [...existing, nextPatient].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        });

        if (photoFile) {
          const ext = photoFile.name.split(".").pop();
          const filePath = `patient-photos/${patientId}.${ext}`;
          await supabase.storage.from("clinical-photos").upload(filePath, photoFile, { upsert: true });
        }

        setCreatedPatient({
          id: patientId,
          code: newPatient.patient_code,
          name: trimmedName,
          phone: `${formData.newPhoneCountry} ${formData.newPhone}`,
        });
      }

      // Book the appointment as SCHEDULED only. Check-in is a separate, manual step
      // performed inside the Clinic Workflow → Check-in page (so backdated bookings,
      // future bookings, and re-bookings don't accidentally create live check-ins).
      const { data: aptData, error: aptError } = await supabase.from("appointments").insert({
        patient_id: patientId,
        appointment_date: formData.date,
        start_time: startTime,
        end_time: endTime,
        type: formData.type,
        doctor: formData.doctor,
        notes: formData.notes || null,
        source: formData.source,
        status: "scheduled",
      }).select("id").single();
      if (aptError) throw aptError;

      // If source is referral, auto-create a referral record linked to both patients
      if (formData.source === "referral" && selectedReferrer) {
        const referredName = isNewPatient
          ? formData.newName.trim()
          : (selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}`.trim() : "");
        const referredPhone = isNewPatient ? `${formData.newPhoneCountry} ${formData.newPhone}` : (selectedPatient?.phone || "");
        const code = `DRNEEMZ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await supabase.from("referrals").insert({
          referrer_patient_id: selectedReferrer.id,
          referrer_name: `${selectedReferrer.first_name} ${selectedReferrer.last_name}`.trim(),
          referrer_phone: selectedReferrer.phone || "",
          referred_patient_id: patientId,
          referred_name: referredName,
          referred_phone: referredPhone,
          referral_code: code,
          status: "contacted",
        } as any);
      }

      toast({
        title: "Appointment booked!",
        description: `Scheduled for ${formData.date} at ${startTime.slice(0,5)}. Check-in will happen from Clinic Workflow on the visit day.`,
      });

      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });

      // For existing patient, just refresh the list — do NOT auto-navigate to workflow,
      // because that would imply a same-day check-in.
      if (!isNewPatient) {
        onSuccess();
      }
    } catch (err: any) {
      const raw = String(err?.message || "");
      const isPermission = /row-level security|permission denied/i.test(raw);
      toast({
        title: isPermission ? "Not allowed for your role" : "Error",
        description: isPermission
          ? "Your role can't register a new patient. Please ask reception to add the patient, then book the appointment."
          : raw,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendWelcomeWhatsApp = async () => {
    const firstName = createdPatient?.name?.split(" ")[0] || "there";
    const clinicName = "Dr. Neemz Dental";
    // Format appointment date (from form's date picker) — e.g. "12 Jul 2026"
    const apptDateRaw = formData.date;
    let apptDate = apptDateRaw;
    try {
      apptDate = format(new Date(apptDateRaw), "dd MMM yyyy");
    } catch { /* keep raw */ }
    // Format appointment time (from form's time picker) — e.g. "10:30 AM"
    const apptTime = `${formData.timeHour}:${formData.timeMinute} ${formData.timePeriod}`;

    await sendClinicWhatsApp({
      patient: { first_name: firstName, phone: createdPatient?.phone, name: createdPatient?.name },
      templateKey: "patient_welcome_flex",
      // {{1}} patient, {{2}} clinic, {{3}} please wait for your turn, {{4}} clinic
      bodyParams: [
        createdPatient?.name || firstName,
        "Dr Neemz Dentistry",
        "please wait for your turn",
        "Dr Neemz Dentistry",
      ],
      fallbackText:
        `Hi ${firstName}, your appointment at ${clinicName} is confirmed for ${apptDate} at ${apptTime}. ` +
        `Patient ID: ${createdPatient?.code}. See you soon!`,
      label: "Booking confirmation",
      successToastTitle: "Booking confirmation sent successfully via Meta API! ✓",
    });
  };

  const sendWelcomeSMS = () => {
    const phone = createdPatient?.phone || "";
    const message = encodeURIComponent(
      `Welcome to our clinic, ${createdPatient?.name}! Your Patient ID is: ${createdPatient?.code}. We look forward to providing you with excellent dental care.`
    );
    window.open(`sms:${phone}?body=${message}`, "_blank");
  };

  const handleGoToWorkflow = () => {
    if (createdPatient) {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      onSuccess();
      navigate(`/clinic-workflow/${createdPatient.id}`);
    }
  };

  // After patient created - show success card with welcome message options
  if (createdPatient) {
    return (
      <div className="space-y-4 pt-2">
        <div className="text-center p-4 bg-success/10 rounded-lg border border-success/20">
          <CheckCircle2 size={32} className="mx-auto text-success mb-2" />
          <h3 className="font-semibold text-foreground">Appointment Booked & Checked In!</h3>
          <p className="text-sm text-muted-foreground mt-1">New patient created successfully</p>
        </div>

        <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
          <div className="flex items-center gap-3">
            {photoPreview ? (
              <img src={photoPreview} alt="Patient" className="h-12 w-12 rounded-full object-cover border-2 border-primary/20" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {createdPatient.name.split(" ").map(n => n[0]).join("")}
              </div>
            )}
            <div>
              <p className="font-semibold text-sm text-foreground">{createdPatient.name}</p>
              <p className="text-xs text-muted-foreground">Patient ID: <span className="font-bold text-primary">{createdPatient.code}</span></p>
              <p className="text-xs text-muted-foreground">{createdPatient.phone}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Send Welcome Message</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2 text-xs h-10 border-success/30 hover:bg-success/10 text-success"
              onClick={sendWelcomeWhatsApp}
            >
              <MessageCircle size={16} /> WhatsApp
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-xs h-10 border-info/30 hover:bg-info/10 text-info"
              onClick={sendWelcomeSMS}
            >
              <Phone size={16} /> SMS
            </Button>
          </div>
        </div>

        <Button className="w-full gradient-primary text-primary-foreground" onClick={handleGoToWorkflow}>
          Go to Clinic Workflow →
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Patient</Label>
          <Button variant="ghost" size="sm" className="text-xs h-auto p-1" onClick={() => { const next = !isNewPatient; setIsNewPatient(next); clearPatient(); setSourceError(false); if (next) setFormData((prev) => ({ ...prev, source: "" })); }}>
            {isNewPatient ? "Select Existing" : "+ New Patient"}
          </Button>
        </div>
        {isNewPatient ? (
          <div className="space-y-3">
            {/* Patient ID + Photo Upload */}
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Patient ID</p>
                <div className="h-8 min-w-[56px] px-2 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">Auto</span>
                </div>
              </div>
              <label className="cursor-pointer relative">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="h-16 w-16 rounded-full object-cover border-2 border-primary/30" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-secondary border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:bg-secondary/80 transition-colors">
                    <Camera size={20} className="text-muted-foreground" />
                  </div>
                )}
              </label>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Patient Photo</p>
                <p>Click to upload</p>
              </div>
            </div>

            <Input placeholder="Name *" value={formData.newName} onChange={(e) => setFormData({ ...formData, newName: toTitleCase(e.target.value.replace(/^\s+/, "")) })} onBlur={(e) => setFormData({ ...formData, newName: toTitleCase(e.target.value.trim()) })} />
            <div className="space-y-1">
              <Label className="text-xs">Mobile Number *</Label>
              <div className="flex gap-2">
                <Select
                  value={formData.newPhoneCountry}
                  onValueChange={(v) => setFormData({ ...formData, newPhoneCountry: v })}
                >
                  <SelectTrigger className="w-[110px] text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => (
                      <SelectItem key={`${c.code}-${c.dial}`} value={c.dial} className="text-xs">
                        <span className="mr-1">{c.flag}</span> {c.dial} <span className="text-muted-foreground ml-1">{c.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder={`${activeCountry.maxLen}-digit mobile number`}
                  value={formData.newPhone}
                  maxLength={activeCountry.maxLen}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, activeCountry.maxLen);
                    setFormData({ ...formData, newPhone: digits });
                  }}
                  className={`flex-1 ${formData.newPhone && !isPhoneValid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
              </div>
              {formData.newPhone && !isPhoneValid && (
                <p className="text-[11px] text-destructive">
                  {phoneInvalidReason}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Family members may share the same mobile number — each patient gets a unique Patient ID.
              </p>
            </div>

            <Input placeholder="Email (Optional)" value={formData.newEmail} onChange={(e) => setFormData({ ...formData, newEmail: e.target.value })} />

            {/* Gender Dropdown */}
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select value={formData.newGender || undefined} onValueChange={(v) => setFormData({ ...formData, newGender: v })}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Select Gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date of Birth + Age */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Date of Birth *</Label>
                <Input
                  type="date"
                  className="text-xs"
                  min="1900-01-01"
                  max={format(new Date(), "yyyy-MM-dd")}
                  value={dobDate ? format(dobDate, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) {
                      setDobDate(undefined);
                      return;
                    }
                    setDobDate(new Date(`${value}T00:00:00`));
                    setManualAge("");
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="Age"
                    className="text-xs"
                    value={dobDate ? (calculatedAge ?? "") : manualAge}
                    readOnly={!!dobDate}
                    onChange={(e) => {
                      if (dobDate) return;
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                      setManualAge(digits);
                    }}
                  />
                  {calculatedAge !== null && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">yrs</span>
                  )}
                </div>
              </div>
            </div>

            {/* District + State + Country */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    District <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 p-0 text-[10px] text-primary"
                    onClick={() => setAddDistrictOpen(true)}
                  >
                    <Plus size={10} className="mr-0.5" /> Add
                  </Button>
                </div>
                <Select value={formData.newDistrict} onValueChange={(v) => {
                  const selected = districts.find(d => d.name === v);
                  setFormData({
                    ...formData,
                    newDistrict: v,
                    newState: selected?.state || formData.newState,
                    newCountry: selected?.country || formData.newCountry,
                  });
                  if (districtError) setDistrictError(false);
                }}>
                  <SelectTrigger className={`text-xs ${districtError ? "border-destructive focus-visible:ring-destructive" : ""}`}><SelectValue placeholder="Select District" /></SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input
                  placeholder="State"
                  className="text-xs"
                  value={formData.newState}
                  onChange={(e) => setFormData({ ...formData, newState: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Input
                  placeholder="Country"
                  className="text-xs"
                  value={formData.newCountry}
                  onChange={(e) => setFormData({ ...formData, newCountry: e.target.value })}
                />
              </div>
            </div>

            {/* Welcome Message Template + Send Buttons */}
            <div className="space-y-2">
              <Label className="text-xs">Welcome Message</Label>
              <Textarea
                className="text-xs"
                rows={3}
                value={formData.welcomeTemplate}
                onChange={(e) => setFormData({ ...formData, welcomeTemplate: e.target.value })}
                placeholder="Type your welcome message template..."
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-8 border-success/30 hover:bg-success/10 text-success"
                  disabled={!formData.newPhone || !isPhoneValid}
                  onClick={async () => {
                    const first = (formData.newName || "").trim().split(" ")[0] || "there";
                    const clinicName = "Dr. Neemz Dental";
                    let apptDate = formData.date;
                    try { apptDate = format(new Date(formData.date), "dd MMM yyyy"); } catch { /* keep raw */ }
                    const apptTime = `${formData.timeHour}:${formData.timeMinute} ${formData.timePeriod}`;
                    await sendClinicWhatsApp({
                      patient: {
                        first_name: first,
                        name: formData.newName,
                        phone: `${formData.newPhoneCountry.replace(/\D/g, "")}${formData.newPhone}`,
                      },
                      templateKey: "appointment_booking_confirmation",
                      bodyParams: [
                        formData.newName || first,
                        apptDate,
                        apptTime,
                        formData.type || "Consultation",
                        formData.doctor || "Our Doctor",
                      ],
                      fallbackText: formData.welcomeTemplate,
                      label: "Booking confirmation",
                      successToastTitle: "Booking confirmation sent successfully via Meta API! ✓",
                    });
                  }}
                >
                  <MessageCircle size={14} /> WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-8 border-info/30 hover:bg-info/10 text-info"
                  disabled={!formData.newPhone || !isPhoneValid}
                  onClick={() => {
                    const msg = encodeURIComponent(formData.welcomeTemplate);
                    window.open(`sms:${formData.newPhoneCountry}${formData.newPhone}?body=${msg}`, "_blank");
                  }}
                >
                  <Phone size={14} /> SMS
                </Button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 size={10} className="text-success" /> Patient ID will be auto-generated
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone number..."
                className="pl-9"
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowSuggestions(true);
                  if (selectedPatient) {
                    setSelectedPatient(null);
                    setFormData({ ...formData, patientId: "" });
                  }
                }}
                onFocus={() => patientSearch && setShowSuggestions(true)}
              />
            </div>
            {showSuggestions && filteredPatients.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredPatients.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center gap-2 text-sm transition-colors"
                    onClick={() => selectPatient(p)}
                  >
                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold text-secondary-foreground">
                      {p.first_name[0]}{p.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-foreground">{p.first_name} {p.last_name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.phone || "No phone"} · P.ID: {formatPatientCode(p.patient_code)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && patientSearch && filteredPatients.length === 0 && !selectedPatient && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">No patient found</p>
                <Button variant="link" className="text-xs p-0 h-auto mt-1" onClick={() => { setIsNewPatient(true); setShowSuggestions(false); }}>
                  + Add New Patient
                </Button>
              </div>
            )}
            {selectedPatient && (
              <div className="mt-2 flex items-center gap-2 p-2 bg-secondary/50 rounded-md">
                <User size={14} className="text-primary" />
                <span className="text-xs font-medium text-foreground">{selectedPatient.first_name} {selectedPatient.last_name}</span>
                <span className="text-[10px] text-muted-foreground">P.ID: {selectedPatient.patient_code ? formatPatientCode(selectedPatient.patient_code) : "Auto"}</span>
                <Button variant="ghost" size="sm" className="ml-auto h-5 text-[10px] p-1" onClick={clearPatient}>Change</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Time</Label>
          <div className="flex gap-1 items-center">
            <Select value={formData.timeHour} onValueChange={(v) => setFormData({ ...formData, timeHour: v })}>
              <SelectTrigger className="h-10 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 12 }, (_, i) => { const v = String(i + 1).padStart(2, "0"); return <SelectItem key={v} value={v}>{v}</SelectItem>; })}</SelectContent>
            </Select>
            <span className="text-xs font-bold">:</span>
            <Select value={formData.timeMinute} onValueChange={(v) => setFormData({ ...formData, timeMinute: v })}>
              <SelectTrigger className="h-10 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{["00","05","10","15","20","25","30","35","40","45","50","55"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={formData.timePeriod} onValueChange={(v) => setFormData({ ...formData, timePeriod: v as "AM" | "PM" })}>
              <SelectTrigger className="h-10 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Source</Label>
          {!isNewPatient && selectedPatient ? (
            <div className="flex h-10 items-center rounded-md border border-border bg-secondary/50 px-3 text-xs text-foreground">
              {isResolvingSource ? "Loading source..." : formatSourceLabel(formData.source)}
            </div>
          ) : (
            <Select value={formData.source} onValueChange={(v) => { setFormData({ ...formData, source: v }); if (v) setSourceError(false); }}>
              <SelectTrigger className={`text-xs ${sourceError ? "border-destructive ring-1 ring-destructive animate-pulse" : ""}`}>
                <SelectValue placeholder={isNewPatient ? "Select source *" : undefined} />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.length > 0 ? sourceOptions.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                )) : (
                  <>
                    <SelectItem value="walk-in">Walk-in</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="google-ads">Google Ads</SelectItem>
                    <SelectItem value="meta-ads">Meta Ads</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          )}
          {sourceError && <p className="text-[10px] text-destructive">Please select a Source.</p>}
        </div>
      </div>

      {isNewPatient && (
        <div className="space-y-1 p-3 rounded-md border border-accent/30 bg-accent/5">
          <Label className="text-xs flex items-center gap-1">
            <User size={12} className="text-accent" /> Referenced By {formData.source === "referral" && <span className="text-destructive">*</span>}
            <span className="text-[10px] text-muted-foreground ml-1">(search existing patient by name or mobile)</span>
          </Label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search referrer by name or phone..."
              className="pl-9 text-xs"
              value={referrerSearch}
              onChange={(e) => {
                setReferrerSearch(e.target.value);
                setReferrerSuggestionsOpen(true);
                if (selectedReferrer) setSelectedReferrer(null);
              }}
              onFocus={() => referrerSearch && setReferrerSuggestionsOpen(true)}
            />
            {referrerSuggestionsOpen && filteredReferrers.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredReferrers.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center gap-2 text-xs"
                    onClick={() => selectReferrer(p)}
                  >
                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold">
                      {p.first_name[0]}{p.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{p.first_name} {p.last_name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.phone || "No phone"} · P.ID: {formatPatientCode(p.patient_code)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedReferrer && (
            <div className="flex items-center gap-2 p-2 bg-accent/10 rounded-md">
              <User size={12} className="text-accent" />
              <span className="text-xs font-medium">{selectedReferrer.first_name} {selectedReferrer.last_name}</span>
              <span className="text-[10px] text-muted-foreground">{selectedReferrer.phone}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-5 text-[10px] p-1" onClick={clearReferrer}>Change</Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Treatment Type</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="Select option" /></SelectTrigger>
            <SelectContent>
              {treatmentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{toTitleCase(option.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Doctor</Label>
          <Select value={formData.doctor} onValueChange={(v) => setFormData({ ...formData, doctor: v })}>
            <SelectTrigger><SelectValue placeholder="Select Doctor" /></SelectTrigger>
            <SelectContent>
              {doctorOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea placeholder="Any notes..." value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={async () => {
          const firstName = isNewPatient
            ? (formData.newName || "").trim().split(" ")[0]
            : (selectedPatient?.first_name || "").trim();
          const fullName = isNewPatient
            ? (formData.newName || "").trim()
            : `${selectedPatient?.first_name || ""} ${selectedPatient?.last_name || ""}`.trim();
          const phone = isNewPatient
            ? `${formData.newPhoneCountry} ${formData.newPhone}`.trim()
            : (selectedPatient?.phone || "");
          const missing: string[] = [];
          if (!fullName) missing.push("patient name");
          if (!phone || (isNewPatient && !isPhoneValid)) missing.push("valid phone");
          if (!formData.date) missing.push("appointment date");
          if (!formData.timeHour || !formData.timeMinute || !formData.timePeriod) missing.push("appointment time");
          if (missing.length) {
            toast({ title: "Missing details", description: `Please fill: ${missing.join(", ")}`, variant: "destructive" });
            return;
          }
          let apptDate = formData.date;
          try { apptDate = format(new Date(formData.date), "dd MMM yyyy"); } catch { /* keep raw */ }
          const apptTime = `${formData.timeHour}:${formData.timeMinute} ${formData.timePeriod}`;
          await sendClinicWhatsApp({
            patient: { first_name: firstName || "there", phone, name: fullName },
            templateKey: "appointment_booking_confirmation",
            bodyParams: [
              fullName || firstName || "there",
              apptDate,
              apptTime,
              formData.type || "Consultation",
              formData.doctor || "Our Doctor",
            ],
            fallbackText: `Hi ${firstName || "there"}, your appointment at Dr. Neemz Dental is confirmed for ${apptDate} at ${apptTime}.`,
            label: "Booking confirmation",
            successToastTitle: "Booking confirmation sent successfully via Meta API! ✓",
          });
        }}
      >
        <MessageCircle size={16} /> Send WhatsApp Confirmation
      </Button>

      <Button
        className="w-full gradient-primary text-primary-foreground"
        onClick={handleSubmit}
        disabled={loading || (!isNewPatient && !formData.patientId) || (isNewPatient && (!formData.newName.trim() || !formData.newPhone.trim() || !isPhoneValid || !dobDate))}
      >
        {loading ? "Booking..." : "Book Appointment"}
      </Button>

      {/* Add District Dialog */}
      <Dialog open={addDistrictOpen} onOpenChange={setAddDistrictOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-display">Add New District</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="District Name"
              value={newDistrictName}
              onChange={(e) => setNewDistrictName(e.target.value)}
            />
            <Button className="w-full gradient-primary text-primary-foreground" onClick={handleAddDistrict} disabled={!newDistrictName.trim()}>
              Add District
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppointmentForm;
