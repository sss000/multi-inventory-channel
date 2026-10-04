import { InventoryBalance } from "./types.js";
import { InventoryInvariantError } from "./errors.js";

/**
 * Calculates the available inventory balance.
 * Formula defined in Phase 1:
 * available = onHand - reserved - allocated + incoming
 */
export function calculateAvailableInventory(params: {
  onHand: number;
  reserved?: number;
  allocated?: number;
  incoming?: number;
  [key: string]: unknown;
}): InventoryBalance {
  const onHand = params.onHand ?? 0;
  const reserved = (params.reserved as number) ?? 0;
  const allocated = (params.allocated as number) ?? 0;
  const incoming = (params.incoming as number) ?? 0;
  const available = onHand - reserved - allocated + incoming;

  return {
    id: "bal_default" as any,
    organizationId: "org_default" as any,
    skuId: "sku_default" as any,
    warehouseId: "wh_default" as any,
    onHand,
    reserved,
    allocated,
    incoming,
    inTransit: 0,
    safetyStock: 0,
    damaged: 0,
    quarantined: 0,
    version: 1,
    available,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Verifies that an inventory state satisfies platform invariants.
 * Throws if invariants are violated.
 */
export function assertInventoryInvariants(balance: Partial<InventoryBalance> & { onHand: number; available: number }): void {
  const reserved = balance.reserved ?? 0;
  const allocated = balance.allocated ?? 0;
  const incoming = balance.incoming ?? 0;

  if (reserved < 0) {
    throw new InventoryInvariantError(`Inventory invariant violated: reserved quantity cannot be negative (${reserved})`);
  }
  if (allocated < 0) {
    throw new InventoryInvariantError(`Inventory invariant violated: allocated quantity cannot be negative (${allocated})`);
  }
  if (incoming < 0) {
    throw new InventoryInvariantError(`Inventory invariant violated: incoming quantity cannot be negative (${incoming})`);
  }

  const expectedAvailable = balance.onHand - reserved - allocated + incoming;
  if (balance.available !== expectedAvailable) {
    throw new InventoryInvariantError(
      `Inventory math invariant violated: expected available ${expectedAvailable} but found ${balance.available}`
    );
  }
}
