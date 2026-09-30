import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  sort_order: number;
}

interface BranchContextType {
  branches: Branch[];
  currentBranchId: string | null;
  currentBranch: Branch | null;
  loading: boolean;
  needsBranchSelection: boolean;
  setCurrentBranch: (branchId: string) => void;
  refreshBranches: () => Promise<void>;
  clearBranch: () => void;
}

const STORAGE_KEY = "selected_branch_id";

const BranchContext = createContext<BranchContextType>({
  branches: [],
  currentBranchId: null,
  currentBranch: null,
  loading: true,
  needsBranchSelection: false,
  setCurrentBranch: () => {},
  refreshBranches: async () => {},
  clearBranch: () => {},
});

export const useBranch = () => useContext(BranchContext);

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const { user, roles, loading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  // Hydrate from localStorage synchronously so a page refresh never flashes
  // the branch-select screen (which would also hide the sidebar/clinic menu).
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const hasLoadedBranchesRef = useRef(false);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const isAdmin = roles.includes("admin");

  const loadBranches = useCallback(async () => {
    const userId = user?.id ?? null;
    const isBackgroundRefresh = hasLoadedBranchesRef.current && lastLoadedUserIdRef.current === userId;

    if (!userId) {
      setBranches([]);
      setCurrentBranchId(null);
      hasLoadedBranchesRef.current = false;
      lastLoadedUserIdRef.current = null;
      setLoading(false);
      return;
    }

    if (!isBackgroundRefresh) {
      setLoading(true);
    }

    let allowedBranchIds: string[] | null = null;
    if (!isAdmin) {
      const { data: ub } = await supabase
        .from("user_branches")
        .select("branch_id, is_default")
        .eq("user_id", userId);
      allowedBranchIds = (ub ?? []).map((r: any) => r.branch_id);
    }

    const { data: branchData } = await supabase
      .from("branches")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const list = (branchData ?? []) as Branch[];
    const filtered = isAdmin
      ? list
      : list.filter((b) => allowedBranchIds?.includes(b.id));
    setBranches(filtered);

    // Determine selected branch
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && filtered.some((b) => b.id === stored)) {
      setCurrentBranchId(stored);
    } else if (!isAdmin && filtered.length === 1) {
      // Single-branch staff: auto-select
      setCurrentBranchId(filtered[0].id);
      localStorage.setItem(STORAGE_KEY, filtered[0].id);
    } else if (!isAdmin && filtered.length > 1) {
      // Try default
      const { data: defRow } = await supabase
        .from("user_branches")
        .select("branch_id")
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle();
      if (defRow?.branch_id && filtered.some((b) => b.id === defRow.branch_id)) {
        setCurrentBranchId(defRow.branch_id);
        localStorage.setItem(STORAGE_KEY, defRow.branch_id);
      } else {
        setCurrentBranchId(null);
      }
    } else {
      setCurrentBranchId(null);
    }

    hasLoadedBranchesRef.current = true;
    lastLoadedUserIdRef.current = userId;
    setInitialized(true);
    setLoading(false);
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!authLoading) {
      void loadBranches();
    }
  }, [authLoading, loadBranches]);

  const setCurrentBranch = (branchId: string) => {
    setCurrentBranchId(branchId);
    localStorage.setItem(STORAGE_KEY, branchId);
  };

  const clearBranch = () => {
    setCurrentBranchId(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const currentBranch = branches.find((b) => b.id === currentBranchId) ?? null;
  // Only ever ask the user to pick a branch after we've actually finished
  // the initial fetch. Without `initialized` a slow network or RLS hiccup
  // briefly drops `loading` to false with empty/incomplete data, which
  // would flash the BranchSelectScreen (and hide the sidebar / clinic
  // module) on every page refresh.
  const needsBranchSelection =
    !!user && initialized && !loading && branches.length > 0 && !currentBranchId;

  return (
    <BranchContext.Provider
      value={{
        branches,
        currentBranchId,
        currentBranch,
        loading,
        needsBranchSelection,
        setCurrentBranch,
        refreshBranches: loadBranches,
        clearBranch,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};
