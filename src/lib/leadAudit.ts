import { supabase } from "@/integrations/supabase/client";

export interface ActorInfo {
  id: string | null;
  name: string;
}

export interface ActivityEntry {
  leadId: string;
  action: string;
  description: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

/** Writes a single audit-trail row for a lead. Never throws — audit must not block UX. */
export const logLeadActivity = async (entry: ActivityEntry, actor: ActorInfo) => {
  try {
    await supabase.from("lead_activity").insert({
      lead_id: entry.leadId,
      action: entry.action,
      description: entry.description,
      field: entry.field ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      user_id: actor.id,
      user_name: actor.name,
    });
  } catch (err) {
    console.warn("lead activity log failed", err);
  }
};

export const logLeadActivities = async (entries: ActivityEntry[], actor: ActorInfo) => {
  for (const entry of entries) {
    // Sequential keeps timeline ordering stable for same-second writes.
    await logLeadActivity(entry, actor);
  }
};

/**
 * Auto-assigns the acting user as lead owner when the lead is unassigned.
 * Returns the owner patch to merge into a lead update (empty when already owned).
 */
export const ownerPatchForAction = (
  lead: { assigned_to_id?: string | null } | null | undefined,
  actor: ActorInfo,
): Record<string, any> => {
  if (!actor.id) return {};
  if (lead?.assigned_to_id) return {};
  return { assigned_to_id: actor.id, assigned_to_name: actor.name };
};

export const auditPatch = (actor: ActorInfo): Record<string, any> => ({
  updated_by: actor.id,
  updated_by_name: actor.name,
});
