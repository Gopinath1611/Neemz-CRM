import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { routeToModule } from "@/lib/activityMonitoring";

// The activity_* tables are not yet part of the generated Supabase types,
// so we go through an `any`-typed handle for these lightweight, best-effort
// tracking calls.
const db = supabase as any;

const HEARTBEAT_INTERVAL_MS = 60_000;

function getDisplayName(user: any): string | null {
  return (
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email ??
    null
  );
}

/**
 * Lightweight, fire-and-forget activity tracking hook. Records sessions and
 * page views for admin monitoring purposes. Never blocks rendering or
 * navigation and swallows all errors.
 */
export function useActivityTracking() {
  const { user, roles } = useAuth();
  const location = useLocation();

  const sessionIdRef = useRef<string | null>(null);
  const currentPageViewIdRef = useRef<string | null>(null);
  const currentPageEnteredAtRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start a session once per mount, while a user is present.
  useEffect(() => {
    if (!user) return;

    const sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = sessionId;

    void (async () => {
      try {
        await db.from("activity_sessions").insert({
          session_id: sessionId,
          user_id: user.id,
          user_name: getDisplayName(user),
          role: Array.isArray(roles) && roles.length > 0 ? roles[0] : "",
          started_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[useActivityTracking] failed to start session:", err);
      }
    })();

    return () => {
      const id = sessionIdRef.current;
      if (!id) return;
      void (async () => {
        try {
          await db
            .from("activity_sessions")
            .update({ ended_at: new Date().toISOString() })
            .eq("session_id", id);
        } catch (err) {
          console.error("[useActivityTracking] failed to end session:", err);
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const closeCurrentPageView = () => {
    const pageViewId = currentPageViewIdRef.current;
    const enteredAt = currentPageEnteredAtRef.current;
    if (!pageViewId || !enteredAt) return;

    const durationSeconds = Math.max(0, Math.round((Date.now() - enteredAt) / 1000));
    try {
      void db
        .from("activity_page_views")
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq("id", pageViewId);
    } catch (err) {
      console.error("[useActivityTracking] failed to close page view:", err);
    }
  };

  const startPageView = (route: string) => {
    if (!user) return;
    currentPageEnteredAtRef.current = Date.now();
    currentPageViewIdRef.current = null;

    void (async () => {
      try {
        const { data, error } = await db
          .from("activity_page_views")
          .insert({
            session_id: sessionIdRef.current,
            user_id: user.id,
            user_name: getDisplayName(user),
            route,
            module: routeToModule(route),
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) throw error;
        currentPageViewIdRef.current = data?.id ?? null;
      } catch (err) {
        console.error("[useActivityTracking] failed to start page view:", err);
      }
    })();
  };

  // Track route changes.
  useEffect(() => {
    if (!user) return;

    closeCurrentPageView();
    startPageView(location.pathname);

    return () => {
      closeCurrentPageView();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, location.pathname]);

  // Heartbeat: keep the session alive and refresh the current page view.
  useEffect(() => {
    if (!user) return;

    heartbeatRef.current = setInterval(() => {
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void db
          .from("activity_sessions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("session_id", sessionId)
          .then(null, (err: unknown) => {
            console.error("[useActivityTracking] heartbeat session update failed:", err);
          });
      }

      const pageViewId = currentPageViewIdRef.current;
      const enteredAt = currentPageEnteredAtRef.current;
      if (pageViewId && enteredAt) {
        const durationSeconds = Math.max(0, Math.round((Date.now() - enteredAt) / 1000));
        void db
          .from("activity_page_views")
          .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
          .eq("id", pageViewId)
          .then(null, (err: unknown) => {
            console.error("[useActivityTracking] heartbeat page view update failed:", err);
          });
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user?.id]);

  // Close the current page view when the tab is hidden or the app unloads.
  useEffect(() => {
    if (!user) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        closeCurrentPageView();
      }
    };

    const handleUnload = () => {
      closeCurrentPageView();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
