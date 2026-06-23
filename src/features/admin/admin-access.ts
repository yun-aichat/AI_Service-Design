const ADMIN_ROLES = new Set(["admin", "billing-admin"]);

export function hasLocalAdminRole(roles: string[] | null | undefined) {
  return Array.isArray(roles) && roles.some((role) => ADMIN_ROLES.has(role));
}

export function canEnterAdminConsole(input: {
  hasSession: boolean;
  roles: string[] | null | undefined;
}) {
  if (!input.hasSession) return false;
  return true;
}
