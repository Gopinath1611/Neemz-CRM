import { useLocation } from "react-router-dom";
import { useAuth, type PermissionAction } from "@/contexts/AuthContext";

export interface ModuleCapabilities {
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  can: (action: PermissionAction) => boolean;
}

/**
 * Per-module CRUD capabilities for the signed-in user.
 * Defaults to the current route when no explicit module path is given, so a
 * page can simply call `usePermissions()`.
 *
 * This is the single hook UI code should use to gate Create / Edit / Delete
 * controls — it reads the same resolver the Access Preview dialog uses, so the
 * preview and the real app can never disagree.
 */
export const usePermissions = (modulePath?: string): ModuleCapabilities => {
  const { canPerform } = useAuth();
  const location = useLocation();
  const path = modulePath ?? location.pathname;

  return {
    canRead: canPerform(path, "read"),
    canCreate: canPerform(path, "create"),
    canEdit: canPerform(path, "edit"),
    canDelete: canPerform(path, "delete"),
    can: (action: PermissionAction) => canPerform(path, action),
  };
};
