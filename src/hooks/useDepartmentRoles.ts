import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DepartmentRoleRow {
  id: string;
  department: string;
  role_name: string;
  display_label: string | null;
  sort_order: number | null;
  is_active: boolean;
}

// Map operations department key → URL hash prefix used in /operations#<hash>
export const DEPT_HASH: Record<string, string> = {
  clinic: "clinic",
  sales_marketing: "sales-marketing",
  finance: "finance",
  hr: "hr-admin",
};

export const HASH_TO_DEPT: Record<string, string> = Object.entries(DEPT_HASH).reduce(
  (acc, [dept, hash]) => {
    acc[hash] = dept;
    return acc;
  },
  {} as Record<string, string>,
);

export const slugifyRole = (role: string) => role.toLowerCase().replace(/_/g, "-");

export const prettifyRole = (role: string) =>
  role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const useDepartmentRoles = () => {
  const qc = useQueryClient();
  const query = useQuery<DepartmentRoleRow[]>({
    queryKey: ["department-roles-global"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("department_roles")
        .select("*")
        .eq("is_active", true)
        .order("department")
        .order("sort_order");
      return (data || []) as DepartmentRoleRow[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("department-roles-global-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "department_roles" },
        () => {
          qc.invalidateQueries({ queryKey: ["department-roles-global"] });
          qc.invalidateQueries({ queryKey: ["ops-dept-roles"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
};
