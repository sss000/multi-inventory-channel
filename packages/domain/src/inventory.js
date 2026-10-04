"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAvailableInventory = calculateAvailableInventory;
exports.assertInventoryInvariants = assertInventoryInvariants;
const errors_js_1 = require("./errors.js");
/**
 * Calculates the available inventory balance.
 * Formula defined in Phase 1:
 * available = onHand - reserved - allocated + incoming
 */
function calculateAvailableInventory(params) {
    const onHand = params.onHand ?? 0;
    const reserved = params.reserved ?? 0;
    const allocated = params.allocated ?? 0;
    const incoming = params.incoming ?? 0;
    const available = onHand - reserved - allocated + incoming;
    return {
        id: "bal_default",
        organizationId: "org_default",
        skuId: "sku_default",
        warehouseId: "wh_default",
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
function assertInventoryInvariants(balance) {
    const reserved = balance.reserved ?? 0;
    const allocated = balance.allocated ?? 0;
    const incoming = balance.incoming ?? 0;
    if (reserved < 0) {
        throw new errors_js_1.InventoryInvariantError(`Inventory invariant violated: reserved quantity cannot be negative (${reserved})`);
    }
    if (allocated < 0) {
        throw new errors_js_1.InventoryInvariantError(`Inventory invariant violated: allocated quantity cannot be negative (${allocated})`);
    }
    if (incoming < 0) {
        throw new errors_js_1.InventoryInvariantError(`Inventory invariant violated: incoming quantity cannot be negative (${incoming})`);
    }
    const expectedAvailable = balance.onHand - reserved - allocated + incoming;
    if (balance.available !== expectedAvailable) {
        throw new errors_js_1.InventoryInvariantError(`Inventory math invariant violated: expected available ${expectedAvailable} but found ${balance.available}`);
    }
}
//# sourceMappingURL=inventory.js.map