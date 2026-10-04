/**
 * Server-Side Tenant Context Enforcement & Multi-Tenant Isolation
 * Canonical Specification: Prompt 06 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Rule: Never trust a frontend organization ID. Every tenant operation derives
 * and validates organization context strictly from authenticated server authorization state.
 */

import { TenantContext } from "./tenant.js";
import { Permission, assertPermission, hasPermission } from "./permissions.js";
import { TenantAccessDeniedError } from "@platform/domain";

export { TenantAccessDeniedError };

/**
 * Validates that the active authenticated tenant matches the target resource's organization.
 * Strictly prevents cross-tenant data leaks and unauthorized mutations.
 */
export function validateTenantAccess(
  context: TenantContext,
  resourceOrganizationId: string
): void {
  const authOrgId = context.organizationId as unknown as string;
  if (authOrgId !== resourceOrganizationId) {
    throw new TenantAccessDeniedError(resourceOrganizationId, authOrgId);
  }
}

/**
 * Asserts both tenant ownership and required role permission.
 */
export function assertTenantPermission(
  context: TenantContext,
  resourceOrganizationId: string,
  permission: Permission
): void {
  validateTenantAccess(context, resourceOrganizationId);
  assertPermission(context.role, permission);
}

/**
 * Strips any frontend-supplied organization ID and enforces server-derived organization context.
 */
export function enforceTenantScope<T extends Record<string, unknown>>(
  context: TenantContext,
  payload: T
): T & { organizationId: string } {
  const authOrgId = context.organizationId as unknown as string;
  return {
    ...payload,
    organizationId: authOrgId,
  };
}

/**
 * Generic Tenant-Isolated Repository demonstrating deterministic multi-tenant isolation.
 * Used for in-memory operations and isolated testing of products, inventory, orders,
 * exceptions, integrations, and audit records.
 */
export class TenantIsolatedRepository<T extends { id: string; organizationId: string }> {
  private readonly items = new Map<string, T>();

  constructor(private readonly entityName: string) {}

  save(context: TenantContext, item: T): T {
    validateTenantAccess(context, item.organizationId);
    this.items.set(item.id, item);
    return item;
  }

  getById(context: TenantContext, id: string): T | null {
    const item = this.items.get(id);
    if (!item) return null;
    validateTenantAccess(context, item.organizationId);
    return item;
  }

  list(context: TenantContext): T[] {
    const authOrgId = context.organizationId as unknown as string;
    const results: T[] = [];
    for (const item of this.items.values()) {
      if (item.organizationId === authOrgId) {
        results.push(item);
      }
    }
    return results;
  }

  delete(context: TenantContext, id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;
    validateTenantAccess(context, item.organizationId);
    return this.items.delete(id);
  }
}
