import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { canAccessRoute, isUniversalPersonalRoute, setHasDirectReports, type AppRole as RoleType } from "@/lib/roleAccess";
import { resolveModuleVisibility, resolveModulePermission } from "@/lib/moduleVisibility";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = 'admin' | 'hr' | 'finance_manager' | 'digital_marketing_manager' | 'digital_marketing_executive' | 'video_editor' | 'telecaller' | 'duty_doctor' | 'dental_assistant' | 'receptionist';

export type PermissionAction = "read" | "create" | "edit" | "delete";

export interface ModulePerms {
  has_access: boolean;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  moduleAccess: Record<string, boolean>;
  modulePerms: Record<string, ModulePerms>;
  hasRole: (role: AppRole) => boolean;
  canAccessModule: (path: string) => boolean;
  canPerform: (path: string, action: PermissionAction) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  roles: [],
  moduleAccess: {},
  modulePerms: {},
  hasRole: () => false,
  canAccessModule: () => false,
  canPerform: () => false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});

  const [modulePerms, setModulePerms] = useState<Record<string, ModulePerms>>({});

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (data) {
      setRoles(data.map((r: any) => r.role as AppRole));
    }
  };

  const fetchModuleAccess = async (userId: string) => {
    const { data } = await supabase
      .from("user_module_access")
      .select("module_path, has_access, can_read, can_create, can_edit, can_delete")
      .eq("user_id", userId);

    if (data && data.length > 0) {
      const access: Record<string, boolean> = {};
      const perms: Record<string, ModulePerms> = {};
      data.forEach((row: any) => {
        access[row.module_path] = row.has_access;
        perms[row.module_path] = {
          has_access: row.has_access,
          can_read: row.can_read ?? row.has_access,
          can_create: row.can_create ?? false,
          can_edit: row.can_edit ?? false,
          can_delete: row.can_delete ?? false,
        };
      });
      setModuleAccess(access);
      setModulePerms(perms);
    } else {
      setModuleAccess({}); // empty = use role-based fallback
      setModulePerms({});
    }
  };

  // "Team" HRMS modules are only visible to staff who are someone's manager.
  const fetchDirectReports = async (userId: string) => {
    const { data } = await (supabase.from as any)("user_reports_to")
      .select("user_id")
      .eq("manager_user_id", userId)
      .limit(1);
    setHasDirectReports(((data as any[]) || []).length > 0);
  };

  const refreshUserAccess = async (userId: string) => {
    await Promise.all([fetchRoles(userId), fetchModuleAccess(userId), fetchDirectReports(userId)]);
  };


  useEffect(() => {
    let currentUserId: string | null = null;
    let initialized = false;
    let lastRefreshAt = 0;
    let rolesChannel: ReturnType<typeof supabase.channel> | null = null;
    let accessChannel: ReturnType<typeof supabase.channel> | null = null;

    const teardownRealtime = () => {
      if (rolesChannel) {
        supabase.removeChannel(rolesChannel);
        rolesChannel = null;
      }
      if (accessChannel) {
        supabase.removeChannel(accessChannel);
        accessChannel = null;
      }
    };

    const subscribeRealtime = (userId: string) => {
      teardownRealtime();
      rolesChannel = supabase
        .channel(`auth-user-roles-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${userId}` },
          () => { void fetchRoles(userId); },
        )
        .subscribe();
      accessChannel = supabase
        .channel(`auth-user-module-access-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_module_access", filter: `user_id=eq.${userId}` },
          () => { void fetchModuleAccess(userId); },
        )
        .subscribe();
    };

    const checkActiveAndSync = async (nextSession: Session | null, isInitial: boolean) => {
      // Only show full-screen loader on initial load. Background token
      // refreshes / tab-focus events must not trigger a loader → that
      // unmounts the current page and resets in-progress edits.
      if (isInitial) setLoading(true);

      if (nextSession?.user) {
        const sameUser = currentUserId === nextSession.user.id;

        // Check active status only on initial load or when user changes.
        if (!sameUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("active")
            .eq("id", nextSession.user.id)
            .maybeSingle();

          if (profile && profile.active === false) {
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setRoles([]);
            setModuleAccess({});
            setModulePerms({});
            currentUserId = null;
            teardownRealtime();
            if (isInitial) setLoading(false);
            if (typeof window !== "undefined") {
              const { toast } = await import("sonner");
              toast.error("Your account has been deactivated. Please contact your administrator.");
            }
            return;
          }
        }

        setSession(nextSession);
        setUser(nextSession.user);
        currentUserId = nextSession.user.id;
        // Only refetch roles/module access on initial load or user change.
        // Token refreshes should NOT re-fetch — that triggers re-renders
        // which can unmount pages mid-edit.
        if (!sameUser || isInitial) {
          await refreshUserAccess(nextSession.user.id);
          subscribeRealtime(nextSession.user.id);
        }
      } else {
        setSession(nextSession);
        setUser(null);
        currentUserId = null;
        setRoles([]);
        setModuleAccess({});
        setModulePerms({});
        teardownRealtime();
      }

      if (isInitial) setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setTimeout(() => {
          void checkActiveAndSync(nextSession, !initialized);
          initialized = true;
        }, 0);
      }
    );

    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      void checkActiveAndSync(nextSession, !initialized);
      initialized = true;
    });

    // Throttled background refresh — only on real focus events, max once
    // every 60 seconds. Never triggers loading state, never unmounts UI.
    const refreshIfNeeded = async () => {
      if (!currentUserId) return;
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshAt < 60000) return;
      lastRefreshAt = now;

      const { data: profile } = await supabase
        .from("profiles")
        .select("active")
        .eq("id", currentUserId)
        .maybeSingle();
      if (profile && profile.active === false) {
        const { toast } = await import("sonner");
        toast.error("Your account has been deactivated.");
        await supabase.auth.signOut();
        return;
      }
      void refreshUserAccess(currentUserId);
    };

    // Proactively refresh the auth session if the access token is close to
    // expiring. Prevents "JWT expired" errors when the user comes back to the
    // tab after a while or stays on a long-running form.
    const refreshSessionIfExpiring = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) return;
        const expiresAt = (s.expires_at ?? 0) * 1000;
        // Refresh if less than 5 minutes remain
        if (expiresAt - Date.now() < 5 * 60 * 1000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // ignore — autoRefreshToken will retry
      }
    };

    const onFocus = () => {
      void refreshSessionIfExpiring();
      void refreshIfNeeded();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    // Safety net: every 4 minutes, check if token is expiring soon and refresh.
    const refreshInterval = window.setInterval(refreshSessionIfExpiring, 4 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      teardownRealtime();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(refreshInterval);
    };
  }, []);


  const hasRole = (role: AppRole) => roles.includes(role);

  const canAccessModule = (path: string): boolean =>
    resolveModuleVisibility(roles as RoleType[], moduleAccess, path);

  const canPerform = (path: string, action: PermissionAction): boolean =>
    resolveModulePermission(roles as RoleType[], moduleAccess, modulePerms, path, action);


  const signOut = async () => {
    localStorage.removeItem("selected_branch_id");
    await supabase.auth.signOut();
    setRoles([]);
    setHasDirectReports(false);

    setModuleAccess({});
    setModulePerms({});
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, moduleAccess, modulePerms, hasRole, canAccessModule, canPerform, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
