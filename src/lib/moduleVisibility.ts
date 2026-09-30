import { canAccessRoute, isUniversalPersonalRoute, personalRouteAllowsAction, pathPrefixes, type AppRole } from "@/lib/roleAccess";

export type PermissionAction = "read" | "create" | "edit" | "delete";

export interface ModulePerms {
  has_access: boolean;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

/**
 * Single source of truth for "can this user see this module path?".
 * Used by AuthContext (live session) and by the admin Access Preview so the
 * preview can never disagree with real login behaviour.
 *
 * Resolution is most-specific-prefix-wins: an explicit record for
 * '/settings/hrms/payroll-reports' overrides a broader '/settings' grant, so
 * sub-routes can be restricted independently.
 */
export const resolveModuleVisibility = (
  roles: AppRole[],
  moduleAccess: Record<string, boolean>,
  path: string,
): boolean => {
  if (roles.includes("admin" as AppRole)) return true;
  if (isUniversalPersonalRoute(path)) return true;

  const prefixes = pathPrefixes(path);

  if (Object.keys(moduleAccess).length > 0) {
    // Most specific explicit decision wins (including an explicit false).
    for (const prefix of prefixes) {
      if (prefix in moduleAccess) return moduleAccess[prefix] === true;
    }
    // No direct record — a granted child (sub-tab) implies parent visibility.
    const hasSubAccess = Object.keys(moduleAccess).some(
      (key) =>
        prefixes.some((p) => key.startsWith(p + "/") || key.startsWith(p + "#")) &&
        moduleAccess[key] === true,
    );
    return hasSubAccess;
  }

  return canAccessRoute(roles, path);
};

export const resolveModulePermission = (
  roles: AppRole[],
  moduleAccess: Record<string, boolean>,
  modulePerms: Record<string, ModulePerms>,
  path: string,
  action: PermissionAction,
): boolean => {
  if (roles.includes("admin" as AppRole)) return true;
  if (isUniversalPersonalRoute(path)) return personalRouteAllowsAction(path, action);

  if (!resolveModuleVisibility(roles, moduleAccess, path)) return false;
  if (Object.keys(modulePerms).length === 0) return true; // role-based fallback grants full CRUD

  const prefixes = pathPrefixes(path);
  for (const prefix of prefixes) {
    const p = modulePerms[prefix];
    if (p) return !!p[`can_${action}`];
  }

  const subKey = Object.keys(modulePerms).find(
    (k) => prefixes.some((p) => k.startsWith(p + "/")) && modulePerms[k].has_access,
  );
  if (subKey) return !!modulePerms[subKey][`can_${action}`];
  return false;
};

/** Normalize user_module_access rows into the two lookup maps the resolvers use. */
export const buildAccessMaps = (
  rows: Array<{
    module_path: string;
    has_access: boolean;
    can_read?: boolean | null;
    can_create?: boolean | null;
    can_edit?: boolean | null;
    can_delete?: boolean | null;
  }> | null | undefined,
) => {
  const access: Record<string, boolean> = {};
  const perms: Record<string, ModulePerms> = {};
  (rows || []).forEach((row) => {
    access[row.module_path] = row.has_access;
    perms[row.module_path] = {
      has_access: row.has_access,
      can_read: row.can_read ?? row.has_access,
      can_create: row.can_create ?? false,
      can_edit: row.can_edit ?? false,
      can_delete: row.can_delete ?? false,
    };
  });
  return { access, perms };
};
