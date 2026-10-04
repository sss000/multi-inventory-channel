import { InventoryBalance } from "./types.js";
/**
 * Calculates the available inventory balance.
 * Formula defined in Phase 1:
 * available = onHand - reserved - allocated + incoming
 */
export declare function calculateAvailableInventory(params: {
    onHand: number;
    reserved?: number;
    allocated?: number;
    incoming?: number;
    [key: string]: unknown;
}): InventoryBalance;
/**
 * Verifies that an inventory state satisfies platform invariants.
 * Throws if invariants are violated.
 */
export declare function assertInventoryInvariants(balance: Partial<InventoryBalance> & {
    onHand: number;
    available: number;
}): void;
//# sourceMappingURL=inventory.d.ts.map