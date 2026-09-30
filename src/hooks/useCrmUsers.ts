import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CrmUser {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Active CRM users, used for telecaller / lead-owner assignment. */
export const useCrmUsers = () => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["crm-users"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CrmUser[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, active")
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        name: (p.full_name || "").trim() || "Unnamed user",
        avatar_url: p.avatar_url || null,
      }));
    },
  });

  return { users: data, isLoading };
};

/** The signed-in user's display identity for attribution stamps. */
export const useCurrentCrmUser = () => {
  const { user } = useAuth();
  const { users } = useCrmUsers();
  const profile = users.find((u) => u.id === user?.id);
  const name = profile?.name || user?.email || "Unknown user";
  return { id: user?.id ?? null, name, avatar_url: profile?.avatar_url ?? null };
};

export const initialsOf = (name?: string | null) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
