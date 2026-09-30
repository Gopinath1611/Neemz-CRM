export type AppRole = 
  | 'admin'
  | 'hr'
  | 'finance_manager'
  | 'digital_marketing_manager'
  | 'digital_marketing_executive'
  | 'video_editor'
  | 'telecaller'
  | 'duty_doctor'
  | 'dental_assistant'
  | 'receptionist';

// Routes each role can access (admin gets everything)
export const roleAccessMap: Record<AppRole, string[]> = {
  admin: ['*', '/user-activity-monitor'], // wildcard = all routes
  hr: [
    '/', '/employees', '/attendance', '/leave', '/payroll', '/recruitment', '/operations', '/licenses', '/job-descriptions', '/training', '/document-management',
    '/reports/hrms/download-reports', '/reports/operations/download-reports',
  ],
  finance_manager: [
    '/', '/finance', '/cash-drawer', '/expenses', '/purchases', '/analytics',
    '/fy-projection', '/fy-projection/overview', '/fy-projection/monthly',
    '/fy-projection/departments', '/fy-projection/chair', '/fy-projection/staff',
    '/fy-projection/marketing', '/fy-projection/expansion', '/fy-projection/profit',
    '/fy-projection/variance',
  ],
  digital_marketing_manager: [
    '/', '/leads', '/pipeline', '/followups', '/contacts', '/appointments', '/reviews',
    '/referrals', '/social-media', '/whatsapp', '/local-seo', '/recalls', '/offline-campaigns',
    '/call-logs', '/messages', '/analytics', '/lead-automation', '/operations',
    '/automation-email', '/automation-whatsapp', '/automation-workflow', '/automation-sms', '/automation-ivr',
    '/reports/lead-generation', '/reports/lead-awareness', '/reports/sales-marketing/download-reports',
  ],
  digital_marketing_executive: [
    '/', '/social-media', '/whatsapp', '/local-seo', '/leads', '/contacts',
    '/messages', '/analytics',
  ],
  video_editor: [
    '/', '/social-media', '/patient-education',
  ],
  telecaller: [
    '/', '/leads', '/call-logs', '/messages', '/contacts', '/pipeline', '/followups',
    '/appointments', '/patient-database', '/recalls', '/reviews',
  ],
  duty_doctor: [
    '/', '/clinic-workflow', '/pending-treatments', '/external-referrals', '/patient-database', '/lab-orders', '/patient-education',
    '/cash-drawer',
    '/appointments', '/inventory', '/analytics', '/sterilization', '/waste-management',
    '/quality-control', '/clinic-whatsapp',
  ],
  dental_assistant: [
    '/', '/clinic-workflow', '/pending-treatments', '/external-referrals', '/patient-database', '/inventory', '/lab-orders', '/patient-education',
    '/sterilization', '/waste-management', '/appointments',
  ],
  receptionist: [
    '/', '/appointments', '/patient-database', '/pharmacy', '/contacts', '/reviews', '/recalls',
    '/patient-education', '/call-logs', '/messages', '/cash-drawer', '/clinic-whatsapp',
  ],
};

// Personal HRMS routes available to every authenticated staff member.
// The pages themselves filter data to the current user.
export const UNIVERSAL_PERSONAL_ROUTES = new Set<string>([
  '/hrms/home',
  '/hrms/inbox',
  '/hrms/inbox/leaves',
  '/hrms/inbox/comp-off',
  '/hrms/inbox/expenses',
  '/hrms/inbox/attendance',
  '/hrms/reports',
  '/employees',
  '/attendance',
  '/attendance/my',
  '/attendance/my-shift',
  '/attendance/geo-fencing',
  '/leave',
  '/leave/my',
  '/leave/holidays',
  '/leave/rollover',
  '/leave/comp-off',
  '/leave/customization',
  '/payroll',
  '/payroll/payslips',
  '/payroll/payruns',
  '/payroll/form-16',
  '/payroll/banks',
]);

// Manager-only HRMS routes: universal ONLY for staff who have at least one
// direct report (someone whose "Reports To" points at them).
export const TEAM_MANAGER_ROUTES = new Set<string>([
  '/attendance/team',
  '/attendance/team-shift',
  '/leave/team',
]);

let hasDirectReports = false;
/** Set once per session from the "Reports To" data (user_reports_to). */
export const setHasDirectReports = (value: boolean) => { hasDirectReports = value; };
export const getHasDirectReports = () => hasDirectReports;

// Default permission caps for personal self-service HRMS routes (non-admin).
// Staff may view/apply/amend their own records but never hard-delete them;
// Holidays is a company-wide read-only calendar.
const PERSONAL_ROUTE_PERM_CAPS: Record<string, Array<'read' | 'create' | 'edit' | 'delete'>> = {
  '/attendance/my': ['read', 'create', 'edit'],
  '/attendance/my-shift': ['read', 'create', 'edit'],
  '/leave/my': ['read', 'create', 'edit'],
  '/leave/holidays': ['read'],
};

export const personalRouteAllowsAction = (
  path: string,
  action: 'read' | 'create' | 'edit' | 'delete',
): boolean => {
  const caps = PERSONAL_ROUTE_PERM_CAPS[path];
  if (!caps) return true;
  return caps.includes(action);
};

export const isUniversalPersonalRoute = (path: string): boolean => {
  if (TEAM_MANAGER_ROUTES.has(path)) return hasDirectReports;
  if (UNIVERSAL_PERSONAL_ROUTES.has(path)) return true;
  const basePath = '/' + path.split('/').filter(Boolean)[0];
  return UNIVERSAL_PERSONAL_ROUTES.has(basePath);
};

/**
 * All path prefixes from most specific to least specific.
 * '/a/b/c' → ['/a/b/c', '/a/b', '/a']
 * Enables per-sub-route access decisions instead of matching only the first
 * path segment (which made e.g. every /fy-projection/* page equivalent).
 */
export const pathPrefixes = (path: string): string[] => {
  const segments = path.split('/').filter(Boolean);
  const prefixes: string[] = [];
  for (let i = segments.length; i > 0; i--) {
    prefixes.push('/' + segments.slice(0, i).join('/'));
  }
  return prefixes.length > 0 ? prefixes : ['/'];
};

export const canAccessRoute = (roles: AppRole[], path: string): boolean => {
  if (isUniversalPersonalRoute(path)) return true;
  if (roles.length === 0) return path === '/'; // no role = dashboard only
  const prefixes = pathPrefixes(path);
  return roles.some((role) => {
    const allowed = roleAccessMap[role];
    if (!allowed) return false;
    return allowed.includes('*') || prefixes.some((p) => allowed.includes(p));
  });
};

export const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  finance_manager: 'Finance Manager',
  digital_marketing_manager: 'DM Manager',
  digital_marketing_executive: 'DM Executive',
  video_editor: 'Video Editor',
  telecaller: 'Telecaller',
  duty_doctor: 'Duty Doctor',
  dental_assistant: 'Dental Assistant',
  receptionist: 'Receptionist',
};
