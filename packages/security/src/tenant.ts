import { AsyncLocalStorage } from "node:async_hooks";
import { OrganizationId, UserId } from "@platform/domain";
import { Permission, SystemRole } from "./permissions.js";

export interface TenantContext {
  organizationId: OrganizationId;
  userId: UserId;
  role: SystemRole;
  permissions: readonly Permission[];
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error("TenantContextMissing: Current execution context lacks required tenant context.");
  }
  return ctx;
}
