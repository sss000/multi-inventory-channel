/**
 * Role-Based Access Control (RBAC) & Permission Matrices
 * Canonical Specification: Section 10 (Roles), Section 69 (Security) of 01_ENGINEERING_SPEC.md & Prompt 06
 */

export type Permission =
  | "inventory:read"
  | "inventory:write"
  | "inventory:adjust"
  | "inventory:bulk_operation"
  | "orders:read"
  | "orders:write"
  | "orders:fulfill"
  | "channels:read"
  | "channels:write"
  | "channels:sync"
  | "reconciliation:read"
  | "reconciliation:write"
  | "exceptions:read"
  | "exceptions:resolve"
  | "billing:read"
  | "billing:manage"
  | "organization:manage"
  | "users:manage"
  | "org:manage"
  | "admin:action"
  | "audit:read"
  | "audit:export"
  | "notifications:read"
  | "notifications:manage"
  | "products:read"
  | "products:write"
  | "integrations:read"
  | "integrations:write";

export type CanonicalRole = "OWNER" | "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER";
export type LegacyRole = "Owner" | "Admin" | "InventoryManager" | "Operator" | "Viewer";
export type SystemRole = CanonicalRole | LegacyRole;

export class PermissionDeniedError extends Error {
  constructor(public readonly role: string, public readonly requiredPermission: Permission) {
    super(`Access denied. Role '${role}' lacks required permission '${requiredPermission}'.`);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Normalizes any supported role string to its canonical uppercase representation.
 */
export function normalizeRole(role: string): CanonicalRole {
  const upper = role.toUpperCase();
  if (upper === "OWNER") return "OWNER";
  if (upper === "ADMIN") return "ADMIN";
  if (upper === "MANAGER" || upper === "INVENTORYMANAGER") return "MANAGER";
  if (upper === "OPERATOR") return "OPERATOR";
  return "VIEWER";
}

export const CANONICAL_ROLE_PERMISSIONS: Record<CanonicalRole, readonly Permission[]> = {
  OWNER: [
    "inventory:read",
    "inventory:write",
    "inventory:adjust",
    "inventory:bulk_operation",
    "orders:read",
    "orders:write",
    "orders:fulfill",
    "channels:read",
    "channels:write",
    "channels:sync",
    "reconciliation:read",
    "reconciliation:write",
    "exceptions:read",
    "exceptions:resolve",
    "billing:read",
    "billing:manage",
    "organization:manage",
    "users:manage",
    "org:manage",
    "admin:action",
    "audit:read",
    "audit:export",
    "notifications:read",
    "notifications:manage",
    "products:read",
    "products:write",
    "integrations:read",
    "integrations:write",
  ],
  ADMIN: [
    "inventory:read",
    "inventory:write",
    "inventory:adjust",
    "inventory:bulk_operation",
    "orders:read",
    "orders:write",
    "orders:fulfill",
    "channels:read",
    "channels:write",
    "channels:sync",
    "reconciliation:read",
    "reconciliation:write",
    "exceptions:read",
    "exceptions:resolve",
    "billing:read",
    "billing:manage",
    "organization:manage",
    "users:manage",
    "org:manage",
    "admin:action",
    "audit:read",
    "audit:export",
    "notifications:read",
    "notifications:manage",
    "products:read",
    "products:write",
    "integrations:read",
    "integrations:write",
  ],
  MANAGER: [
    "inventory:read",
    "inventory:write",
    "inventory:adjust",
    "orders:read",
    "orders:write",
    "orders:fulfill",
    "channels:read",
    "channels:sync",
    "reconciliation:read",
    "reconciliation:write",
    "exceptions:read",
    "exceptions:resolve",
    "billing:read",
    "users:manage",
    "audit:read",
    "notifications:read",
    "notifications:manage",
    "products:read",
    "products:write",
    "integrations:read",
  ],
  OPERATOR: [
    "inventory:read",
    "inventory:adjust",
    "orders:read",
    "orders:fulfill",
    "channels:read",
    "reconciliation:read",
    "exceptions:read",
    "exceptions:resolve",
    "notifications:read",
    "products:read",
    "integrations:read",
  ],
  VIEWER: [
    "inventory:read",
    "orders:read",
    "channels:read",
    "reconciliation:read",
    "exceptions:read",
    "billing:read",
    "notifications:read",
    "products:read",
    "integrations:read",
  ],
};

// Backward-compatible mapping for legacy role casing
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ...CANONICAL_ROLE_PERMISSIONS,
  Owner: CANONICAL_ROLE_PERMISSIONS.OWNER,
  Admin: CANONICAL_ROLE_PERMISSIONS.ADMIN,
  InventoryManager: CANONICAL_ROLE_PERMISSIONS.MANAGER,
  Operator: CANONICAL_ROLE_PERMISSIONS.OPERATOR,
  Viewer: CANONICAL_ROLE_PERMISSIONS.VIEWER,
};

/**
 * Checks whether a given role has the requested permission.
 */
export function hasPermission(role: SystemRole, permission: Permission): boolean {
  const canonical = normalizeRole(role);
  return CANONICAL_ROLE_PERMISSIONS[canonical]?.includes(permission) ?? false;
}

/**
 * Asserts that a role possesses a required permission, throwing PermissionDeniedError if not.
 */
export function assertPermission(role: SystemRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError(role, permission);
  }
}
