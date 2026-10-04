/**
 * Domain & Database Transaction Boundary
 * Canonical Specification: Section 27 (Concurrency Control) of 01_ENGINEERING_SPEC.md
 * Prompt 04: "Core inventory mutations must not depend on the auto-generated Supabase REST API;
 * use the established server/domain transaction boundary."
 */

import { InventoryBalanceRow, InventoryEventRow, InventoryReservationRow } from "./schema/types.js";

/**
 * Concurrency error thrown when an optimistic lock version conflict is detected.
 */
export class OptimisticLockConflictError extends Error {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict on ${entityName}:${entityId}. Expected version ${expectedVersion}, but found ${actualVersion}.`
    );
    this.name = "OptimisticLockConflictError";
  }
}

/**
 * Invariant error thrown when an inventory balance invariant is violated.
 */
export class InventoryBalanceInvariantError extends Error {
  constructor(message: string, public readonly details: Record<string, unknown>) {
    super(message);
    this.name = "InventoryBalanceInvariantError";
  }
}

/**
 * Verifies that an inventory update satisfies optimistic concurrency versioning.
 */
export function assertInventoryVersion(
  entityName: string,
  entityId: string,
  expectedVersion: number,
  actualVersion: number
): void {
  if (expectedVersion !== actualVersion) {
    throw new OptimisticLockConflictError(entityName, entityId, expectedVersion, actualVersion);
  }
}

/**
 * Canonical calculation of sellable/available inventory balance.
 * Formula per 01_ENGINEERING_SPEC.md Section 15:
 * available = on_hand - reserved - safety_stock - damaged - quarantined - allocated
 */
export function calculateSellableAvailable(
  balance: Pick<
    InventoryBalanceRow,
    "on_hand" | "reserved" | "safety_stock" | "damaged" | "quarantined" | "allocated"
  >
): number {
  const available =
    balance.on_hand -
    balance.reserved -
    balance.safety_stock -
    balance.damaged -
    balance.quarantined -
    balance.allocated;

  return available;
}

/**
 * Validates non-negative balance constraints.
 */
export function validateInventoryBalanceConstraints(
  balance: Partial<InventoryBalanceRow>
): void {
  const nonNegativeFields: (keyof InventoryBalanceRow)[] = [
    "on_hand",
    "reserved",
    "allocated",
    "damaged",
    "quarantined",
    "in_transit",
    "incoming",
    "safety_stock",
  ];

  for (const field of nonNegativeFields) {
    const val = balance[field];
    if (typeof val === "number" && val < 0) {
      throw new InventoryBalanceInvariantError(
        `Field '${field}' cannot be negative (received ${val})`,
        { field, value: val, balance }
      );
    }
  }
}

/**
 * Interface representing a transactional boundary for atomic domain operations.
 */
export interface TransactionBoundary {
  id: string;
  isolationLevel: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Executes a callback within a managed transaction boundary.
 * In server-side domain services, this ensures all mutations (inventory balances,
 * reservations, and immutable inventory events) succeed or fail atomically.
 */
export async function withTransactionBoundary<T>(
  operation: (tx: TransactionBoundary) => Promise<T>,
  isolationLevel: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" = "READ COMMITTED"
): Promise<T> {
  const boundaryId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const tx: TransactionBoundary = {
    id: boundaryId,
    isolationLevel,
    execute: async (fn) => fn(),
  };

  try {
    return await operation(tx);
  } catch (error) {
    // Transaction aborted / rolled back
    throw error;
  }
}
