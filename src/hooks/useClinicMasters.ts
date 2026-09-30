import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Roles in user_roles that should populate the "doctor" dropdowns
const DOCTOR_ROLES = new Set(["duty_doctor", "doctor", "dentist", "consultant_doctor"]);
// Roles that should populate the "dental assistant" dropdowns
const ASSISTANT_ROLES = new Set(["dental_assistant", "chairside_assistant", "assistant"]);

export interface SelectOption {
  value: string;
  label: string;
}

export interface ClinicMedicine {
  id: string;
  name: string;
  type: string | null;
}

export interface PrescriptionTemplate {
  id: string;
  name: string;
  treatment_category: string | null;
}

export interface ClinicLab {
  id: string;
  name: string;
  mobile: string | null;
}

export interface ClinicLabWork {
  id: string;
  name: string;
  materials: string[] | null;
}

export const DEFAULT_DOCTOR_OPTIONS: SelectOption[] = [];

export const DEFAULT_APPOINTMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: "consultation", label: "Consultation" },
  { value: "root-canal", label: "Root Canal" },
  { value: "cleaning", label: "Cleaning" },
  { value: "extraction", label: "Extraction" },
  { value: "filling", label: "Filling" },
  { value: "crown-bridge", label: "Crown & Bridge" },
  { value: "orthodontics", label: "Orthodontics" },
  { value: "checkup", label: "Check-up" },
  { value: "emergency", label: "Emergency" },
];

const normalizeOptionKey = (value: string) => value.trim().toLowerCase();

export const mergeSelectOptions = (...groups: Array<SelectOption[] | undefined>): SelectOption[] => {
  const seen = new Set<string>();
  const merged: SelectOption[] = [];

  groups
    .flatMap((group) => group ?? [])
    .forEach((option) => {
      const value = option.value?.trim();
      const label = option.label?.trim() || value;
      if (!value || !label) return;

      const key = normalizeOptionKey(label);
      if (seen.has(key)) return;

      seen.add(key);
      merged.push({ value, label });
    });

  return merged;
};

export const getAppointmentTypeLabel = (value?: string | null) => {
  if (!value) return "—";
  return DEFAULT_APPOINTMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
};

export const withCurrentOption = (
  options: SelectOption[],
  currentValue?: string | null,
  currentLabel?: string,
) => {
  const trimmedValue = currentValue?.trim();
  if (!trimmedValue || options.some((option) => option.value === trimmedValue)) {
    return options;
  }

  return [{ value: trimmedValue, label: currentLabel?.trim() || trimmedValue }, ...options];
};

export const useClinicMasters = () => {
  const queryClient = useQueryClient();

  // Active staff grouped by role (from profiles + user_roles)
  const staffByRoleQuery = useQuery({
    queryKey: ["clinic-masters", "staff-by-role"],
    queryFn: async () => {
      const [rolesRes, profilesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, full_name, active"),
      ]);
      const activeProfiles = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p: any) => {
        if (p.active !== false && p.full_name) activeProfiles.set(p.id, p.full_name);
      });
      const grouped: Record<string, { id: string; name: string }[]> = {};
      (rolesRes.data ?? []).forEach((r: any) => {
        const name = activeProfiles.get(r.user_id);
        if (!name) return;
        const key = String(r.role);
        if (!grouped[key]) grouped[key] = [];
        if (!grouped[key].some((x) => x.id === r.user_id)) {
          grouped[key].push({ id: r.user_id, name });
        }
      });
      Object.values(grouped).forEach((arr) =>
        arr.sort((a, b) => a.name.localeCompare(b.name)),
      );
      return grouped;
    },
  });

  // Keep staff dropdowns live: refresh when profiles or user_roles change
  useEffect(() => {
    const channel = supabase
      .channel(`clinic-masters-staff-sync-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["clinic-masters", "staff-by-role"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["clinic-masters", "staff-by-role"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Doctors master table from Settings → Admin → Doctors (all members, matching settings UI)
  const doctorsQuery = useQuery({
    queryKey: ["clinic-masters", "doctors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return (data ?? []).filter((doctor) => doctor.id && doctor.name);
    },
  });

  const treatmentsQuery = useQuery({
    queryKey: ["clinic-masters", "treatments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_treatments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []).filter((treatment) => treatment.id && treatment.name);
    },
  });

  const medicinesQuery = useQuery({
    queryKey: ["clinic-masters", "medicines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("id, name, type")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []) as ClinicMedicine[];
    },
  });

  const prescriptionTemplatesQuery = useQuery({
    queryKey: ["clinic-masters", "prescription-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescription_templates")
        .select("id, name, treatment_category")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []) as PrescriptionTemplate[];
    },
  });

  const labsQuery = useQuery({
    queryKey: ["clinic-masters", "labs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labs")
        .select("id, name, mobile")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []) as ClinicLab[];
    },
  });

  const labWorksQuery = useQuery({
    queryKey: ["clinic-masters", "lab-works"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_works")
        .select("id, name, materials")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []) as ClinicLabWork[];
    },
  });

  const sourcesQuery = useQuery({
    queryKey: ["clinic-masters", "lead-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_sources")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []).map((s: any) => ({ value: s.name.toLowerCase().replace(/\s+/g, "-"), label: s.name }));
    },
  });

  const brandsQuery = useQuery({
    queryKey: ["clinic-masters", "brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_brands" as any)
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return ((data ?? []) as any[]).map((b) => ({ value: b.name, label: b.name })) as SelectOption[];
    },
  });

  const assistantsQuery = useQuery({
    queryKey: ["clinic-masters", "dental-assistants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dental_assistants")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data ?? []).filter((a) => a.id && a.name);
    },
  });

  const staffByRole = staffByRoleQuery.data ?? {};

  // Helper: build options for any role_key from active staff (profiles + user_roles)
  const getStaffOptionsByRole = (...roleKeys: string[]): SelectOption[] => {
    const collected: SelectOption[] = [];
    roleKeys.forEach((key) => {
      (staffByRole[key] ?? []).forEach((s) => {
        collected.push({ value: s.name, label: s.name });
      });
    });
    return mergeSelectOptions(collected);
  };

  // Doctors come from both active staff with doctor roles AND the doctors master table
  // so every member listed in Settings → Admin → Doctors appears in all doctor dropdowns.
  // Dedup is name-aware: strips "Dr.", initials (e.g. "N."), dots and spaces so that
  // "Sadham Hussain" (staff) and "Dr.N.Sadham Hussain" (master) collapse to a single entry.
  const doctorOptions = useMemo(() => {
    const normalizeDoctorKey = (raw: string) => {
      const cleaned = raw
        .toLowerCase()
        .replace(/\bdr\b\.?/g, " ") // remove "dr" / "dr."
        .replace(/\b[a-z]\.\s*/g, " ") // remove single-letter initials like "n."
        .replace(/[^a-z0-9]+/g, " ") // collapse punctuation
        .trim()
        .replace(/\s+/g, " ");
      return cleaned;
    };
    const preferLabel = (a: string, b: string) => {
      // Prefer the variant that includes a "Dr" prefix and is longer (more complete).
      const aHasDr = /\bdr\b/i.test(a);
      const bHasDr = /\bdr\b/i.test(b);
      if (aHasDr !== bHasDr) return aHasDr ? a : b;
      return a.length >= b.length ? a : b;
    };

    const fromStaff: SelectOption[] = [];
    const dutyDoctorKeys = new Set<string>();
    Object.entries(staffByRole).forEach(([role, list]) => {
      if (DOCTOR_ROLES.has(role)) {
        list.forEach((s) => {
          fromStaff.push({ value: s.name, label: s.name });
          if (role === "duty_doctor") {
            const k = normalizeDoctorKey(s.name);
            if (k) dutyDoctorKeys.add(k);
          }
        });
      }
    });
    const fromDoctorsMaster: SelectOption[] = (doctorsQuery.data ?? []).map((d: any) => ({
      value: d.name,
      label: d.name,
    }));

    const byKey = new Map<string, SelectOption>();
    [...fromStaff, ...fromDoctorsMaster].forEach((opt) => {
      const value = opt.value?.trim();
      const label = (opt.label?.trim() || value || "").trim();
      if (!value || !label) return;
      const key = normalizeDoctorKey(label);
      if (!key) return;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { value, label });
      } else {
        const winnerLabel = preferLabel(existing.label, label);
        const winnerValue = winnerLabel === label ? value : existing.value;
        byKey.set(key, { value: winnerValue, label: winnerLabel });
      }
    });

    // Duty Doctors first (in the order they were added from staff), then everyone else A-Z.
    const all = Array.from(byKey.entries());
    const duty: SelectOption[] = [];
    const others: SelectOption[] = [];
    all.forEach(([key, opt]) => {
      if (dutyDoctorKeys.has(key)) duty.push(opt);
      else others.push(opt);
    });
    duty.sort((a, b) => a.label.localeCompare(b.label));
    others.sort((a, b) => a.label.localeCompare(b.label));
    return [...duty, ...others];
  }, [staffByRole, doctorsQuery.data]);

  const treatmentOptions = useMemo(
    () =>
      mergeSelectOptions(
        (treatmentsQuery.data ?? []).map((treatment) => ({ value: treatment.name, label: treatment.name })),
        DEFAULT_APPOINTMENT_TYPE_OPTIONS,
      ),
    [treatmentsQuery.data],
  );

  const sourceOptions = useMemo(
    () => sourcesQuery.data ?? [],
    [sourcesQuery.data],
  );

  // Assistants: active staff (assistant roles) + dental_assistants master.
  // Dedup name-aware (strips titles, initials, punctuation) so the same person
  // never appears twice across sources or role assignments.
  const assistantOptions = useMemo(() => {
    const normalizeKey = (raw: string) =>
      raw
        .toLowerCase()
        .replace(/\bdr\b\.?/g, " ")
        .replace(/\bmr\b\.?/g, " ")
        .replace(/\bms\b\.?/g, " ")
        .replace(/\bmrs\b\.?/g, " ")
        .replace(/\b[a-z]\.\s*/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

    const collected: SelectOption[] = [];
    Object.entries(staffByRole).forEach(([role, list]) => {
      if (ASSISTANT_ROLES.has(role)) {
        list.forEach((s) => collected.push({ value: s.name, label: s.name }));
      }
    });
    (assistantsQuery.data ?? []).forEach((a: any) => {
      if (a?.name) collected.push({ value: a.name, label: a.name });
    });

    const byKey = new Map<string, SelectOption>();
    collected.forEach((opt) => {
      const value = opt.value?.trim();
      const label = (opt.label?.trim() || value || "").trim();
      if (!value || !label) return;
      const key = normalizeKey(label);
      if (!key || byKey.has(key)) return;
      byKey.set(key, { value, label });
    });
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [staffByRole, assistantsQuery.data]);

  const telecallerOptions = useMemo(
    () => getStaffOptionsByRole("telecaller"),
    [staffByRole],
  );

  const receptionistOptions = useMemo(
    () => getStaffOptionsByRole("receptionist"),
    [staffByRole],
  );

  return {
    doctorOptions,
    doctorNames: doctorOptions.map((option) => option.value),
    treatmentOptions,
    treatmentNames: treatmentOptions.map((option) => option.value),
    sourceOptions,
    brandOptions: brandsQuery.data ?? [],
    assistantOptions,
    assistantNames: assistantOptions.map((option) => option.value),
    telecallerOptions,
    telecallerNames: telecallerOptions.map((o) => o.value),
    receptionistOptions,
    receptionistNames: receptionistOptions.map((o) => o.value),
    staffByRole,
    getStaffOptionsByRole,
    medicines: medicinesQuery.data ?? [],
    prescriptionTemplates: prescriptionTemplatesQuery.data ?? [],
    labs: labsQuery.data ?? [],
    labWorks: labWorksQuery.data ?? [],
    refetchDoctors: doctorsQuery.refetch,
    refetchTreatments: treatmentsQuery.refetch,
    refetchMedicines: medicinesQuery.refetch,
    refetchPrescriptionTemplates: prescriptionTemplatesQuery.refetch,
    refetchLabs: labsQuery.refetch,
    refetchLabWorks: labWorksQuery.refetch,
    refetchSources: sourcesQuery.refetch,
    refetchBrands: brandsQuery.refetch,
    refetchAssistants: assistantsQuery.refetch,
    refetchStaff: staffByRoleQuery.refetch,
    isLoading:
      doctorsQuery.isLoading ||
      treatmentsQuery.isLoading ||
      medicinesQuery.isLoading ||
      prescriptionTemplatesQuery.isLoading ||
      labsQuery.isLoading ||
      labWorksQuery.isLoading ||
      sourcesQuery.isLoading ||
      brandsQuery.isLoading ||
      assistantsQuery.isLoading,
  };
};
