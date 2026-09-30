import { ReactNode } from "react";
import { useActivityTracking } from "@/hooks/useActivityTracking";

interface ActivityTrackingProviderProps {
  children: ReactNode;
}

/**
 * Mounts the client-side activity tracking hook once for the whole app.
 * Must be rendered inside both the router and auth providers.
 */
export function ActivityTrackingProvider({ children }: ActivityTrackingProviderProps) {
  useActivityTracking();
  return <>{children}</>;
}
