import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isUniversalPersonalRoute, type AppRole } from "@/lib/roleAccess";
import BranchSelectScreen from "@/components/branch/BranchSelectScreen";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, roles, canAccessModule } = useAuth();
  const { needsBranchSelection, loading: branchLoading } = useBranch();
  const location = useLocation();

  if (loading || branchLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (needsBranchSelection) {
    return <BranchSelectScreen />;
  }

  // Dashboard always accessible
  if (location.pathname === "/") {
    return <>{children}</>;
  }

  // Admin bypasses all checks
  if (roles.includes("admin" as AppRole)) {
    return <>{children}</>;
  }

  // Personal HRMS routes are accessible to every authenticated staff member
  if (isUniversalPersonalRoute(location.pathname)) {
    return <>{children}</>;
  }

  // Single resolver (module records when present, role map otherwise) with
  // most-specific-prefix-wins matching — same logic the sidebar and the admin
  // Access Preview use, so route access can never disagree with them.
  if (!canAccessModule(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
