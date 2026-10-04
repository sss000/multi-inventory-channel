"use strict";
/**
 * Inventory Domain Service & Invariant Controller
 * Canonical Specification: Sections 15, 16, 17 of 01_ENGINEERING_SPEC.md & Prompt 07
 * Strict Invariant: Inventory mutation MUST only occur through this domain service.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultInventoryService = exports.InventoryDomainService = void 0;
exports.computeSellableAvailable = computeSellableAvailable;
exports.assertBalanceInvariants = assertBalanceInvariants;
const errors_js_1 = require("./errors.js");
/**
 * Calculates sellable available inventory according to Section 15:
 * available = onHand - reserved - safetyStock - damaged - quarantined - allocated
 */
function computeSellableAvailable(balance) {
    return (balance.onHand -
        balance.reserved -
        balance.safetyStock -
        balance.damaged -
        balance.quarantined -
        balance.allocated);
}
/**
 * Asserts all balance fields satisfy non-negative and calculation invariants.
 */
function assertBalanceInvariants(balance) {
    const fields = [
        "onHand",
        "reserved",
        "allocated",
        "damaged",
        "quarantined",
        "inTransit",
        "incoming",
        "safetyStock",
    ];
    for (const field of fields) {
        const val = balance[field];
        if (typeof val === "number" && val < 0) {
            throw new errors_js_1.InventoryInvariantError(`Inventory invariant violated: field '${field}' cannot be negative (${val})`, { field, value: val, balance });
        }
    }
    const expectedAvailable = computeSellableAvailable(balance);
    if (balance.available !== expectedAvailable) {
        throw new errors_js_1.InventoryInvariantError(`Inventory available invariant violated: expected ${expectedAvailable}, but found ${balance.available}`, { expectedAvailable, actualAvailable: balance.available, balance });
    }
}
/**
 * Core Inventory Domain Service.
 * Governs all balance mutations, reservation lifecycles, and domain event generation.
 */
class InventoryDomainService {
    /**
     * Atomically creates a reservation against an inventory balance.
     * Throws InsufficientInventoryError if available < requested quantity.
     */
    createReservation(balance, params) {
        if (params.quantity <= 0) {
            throw new errors_js_1.ReservationInvariantError(`Reservation quantity must be strictly positive (received ${params.quantity})`);
        }
        assertBalanceInvariants(balance);
        const available = computeSellableAvailable(balance);
        if (available < params.quantity) {
            throw new errors_js_1.InsufficientInventoryError(params.quantity, available, {
                balanceId: balance.id,
                skuId: balance.skuId,
            });
        }
        const beforeState = { ...balance };
        const newReserved = balance.reserved + params.quantity;
        const newAvailable = balance.onHand - newReserved - balance.safetyStock - balance.damaged - balance.quarantined - balance.allocated;
        const updatedBalance = {
            ...balance,
            reserved: newReserved,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const reservation = {
            id: reservationId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            orderId: params.orderId,
            quantity: params.quantity,
            status: "ACTIVE",
            createdAt: new Date(),
        };
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "ORDER_RESERVATION",
            quantityDelta: params.quantity,
            sourceType: "ORDER",
            sourceId: params.orderId || reservationId,
            reservationId,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, reservation, event };
    }
    /**
     * Releases an active reservation back to available inventory.
     */
    releaseReservation(balance, reservation, params) {
        if (reservation.status !== "ACTIVE") {
            throw new errors_js_1.ReservationInvariantError(`Cannot release reservation with status '${reservation.status}'. Only ACTIVE reservations can be released.`);
        }
        assertBalanceInvariants(balance);
        if (balance.reserved < reservation.quantity) {
            throw new errors_js_1.InventoryInvariantError(`Cannot release ${reservation.quantity} units; balance only has ${balance.reserved} units reserved.`);
        }
        const beforeState = { ...balance };
        const newReserved = balance.reserved - reservation.quantity;
        const newAvailable = balance.onHand - newReserved - balance.safetyStock - balance.damaged - balance.quarantined - balance.allocated;
        const updatedBalance = {
            ...balance,
            reserved: newReserved,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const updatedReservation = {
            ...reservation,
            status: "RELEASED",
            releasedAt: new Date(),
        };
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "ORDER_RELEASE",
            quantityDelta: -reservation.quantity,
            sourceType: "ORDER",
            sourceId: reservation.id,
            reservationId: reservation.id,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, updatedReservation, event };
    }
    /**
     * Fulfills an active reservation upon order shipment.
     * Decrements both onHand and reserved atomically.
     */
    fulfillReservation(balance, reservation, params) {
        if (reservation.status !== "ACTIVE") {
            throw new errors_js_1.ReservationInvariantError(`Cannot fulfill reservation with status '${reservation.status}'. Only ACTIVE reservations can be fulfilled.`);
        }
        assertBalanceInvariants(balance);
        if (balance.onHand < reservation.quantity || balance.reserved < reservation.quantity) {
            throw new errors_js_1.InventoryInvariantError(`Insufficient inventory to fulfill reservation: onHand=${balance.onHand}, reserved=${balance.reserved}, required=${reservation.quantity}`);
        }
        const beforeState = { ...balance };
        const newOnHand = balance.onHand - reservation.quantity;
        const newReserved = balance.reserved - reservation.quantity;
        const newAvailable = newOnHand - newReserved - balance.safetyStock - balance.damaged - balance.quarantined - balance.allocated;
        const updatedBalance = {
            ...balance,
            onHand: newOnHand,
            reserved: newReserved,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const updatedReservation = {
            ...reservation,
            status: "FULFILLED",
            fulfilledAt: new Date(),
        };
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "ORDER_FULFILLMENT",
            quantityDelta: -reservation.quantity,
            sourceType: "ORDER",
            sourceId: reservation.id,
            reservationId: reservation.id,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, updatedReservation, event };
    }
    /**
     * Allocates an active reservation (e.g. order being picked and packed).
     * Moves quantity from reserved to allocated atomically.
     */
    allocateReservation(balance, reservation, params) {
        if (reservation.status !== "ACTIVE") {
            throw new errors_js_1.ReservationInvariantError(`Cannot allocate reservation with status '${reservation.status}'. Only ACTIVE reservations can be allocated.`);
        }
        assertBalanceInvariants(balance);
        if (balance.reserved < reservation.quantity) {
            throw new errors_js_1.AllocationInvariantError(`Insufficient reserved inventory to allocate: reserved=${balance.reserved}, required=${reservation.quantity}`);
        }
        const beforeState = { ...balance };
        const newReserved = balance.reserved - reservation.quantity;
        const newAllocated = balance.allocated + reservation.quantity;
        const newAvailable = balance.onHand -
            newReserved -
            balance.safetyStock -
            balance.damaged -
            balance.quarantined -
            newAllocated;
        const updatedBalance = {
            ...balance,
            reserved: newReserved,
            allocated: newAllocated,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const updatedReservation = {
            ...reservation,
            status: "FULFILLED",
            fulfilledAt: new Date(),
        };
        const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const allocation = {
            id: allocationId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            orderId: reservation.orderId,
            reservationId: reservation.id,
            quantity: reservation.quantity,
            status: "ACTIVE",
            createdAt: new Date(),
        };
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "ORDER_ALLOCATION",
            quantityDelta: reservation.quantity,
            sourceType: "ORDER",
            sourceId: allocationId,
            orderId: reservation.orderId,
            reservationId: reservation.id,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, updatedReservation, allocation, event };
    }
    /**
     * Fulfills allocated stock when the order is shipped.
     * Atomically decrements onHand and allocated.
     */
    fulfillAllocation(balance, allocation, params) {
        if (allocation.status !== "ACTIVE") {
            throw new errors_js_1.AllocationInvariantError(`Cannot fulfill allocation with status '${allocation.status}'. Only ACTIVE allocations can be fulfilled.`);
        }
        assertBalanceInvariants(balance);
        if (balance.onHand < allocation.quantity || balance.allocated < allocation.quantity) {
            throw new errors_js_1.AllocationInvariantError(`Insufficient inventory to fulfill allocation: onHand=${balance.onHand}, allocated=${balance.allocated}, required=${allocation.quantity}`);
        }
        const beforeState = { ...balance };
        const newOnHand = balance.onHand - allocation.quantity;
        const newAllocated = balance.allocated - allocation.quantity;
        const newAvailable = newOnHand -
            balance.reserved -
            balance.safetyStock -
            balance.damaged -
            balance.quarantined -
            newAllocated;
        const updatedBalance = {
            ...balance,
            onHand: newOnHand,
            allocated: newAllocated,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const updatedAllocation = {
            ...allocation,
            status: "FULFILLED",
            fulfilledAt: new Date(),
        };
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "ORDER_FULFILLMENT",
            quantityDelta: -allocation.quantity,
            sourceType: "ORDER",
            sourceId: allocation.id,
            orderId: allocation.orderId,
            reservationId: allocation.reservationId,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, updatedAllocation, event };
    }
    /**
     * Releases allocated stock back to available (e.g. pick cancelled).
     * Atomically decrements allocated.
     */
    releaseAllocation(balance, allocation, params) {
        if (allocation.status !== "ACTIVE") {
            throw new errors_js_1.AllocationInvariantError(`Cannot release allocation with status '${allocation.status}'. Only ACTIVE allocations can be released.`);
        }
        assertBalanceInvariants(balance);
        if (balance.allocated < allocation.quantity) {
            throw new errors_js_1.AllocationInvariantError(`Cannot release ${allocation.quantity} allocated units; balance only has ${balance.allocated} units allocated.`);
        }
        const beforeState = { ...balance };
        const newAllocated = balance.allocated - allocation.quantity;
        const newAvailable = balance.onHand -
            balance.reserved -
            balance.safetyStock -
            balance.damaged -
            balance.quarantined -
            newAllocated;
        const updatedBalance = {
            ...balance,
            allocated: newAllocated,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const updatedAllocation = {
            ...allocation,
            status: "RELEASED",
            releasedAt: new Date(),
        };
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "ORDER_RELEASE",
            quantityDelta: -allocation.quantity,
            sourceType: "ORDER",
            sourceId: allocation.id,
            orderId: allocation.orderId,
            reservationId: allocation.reservationId,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, updatedAllocation, event };
    }
    /**
     * Applies a manual stock adjustment (+ or -) with reason logging.
     */
    applyAdjustment(balance, params) {
        assertBalanceInvariants(balance);
        const newOnHand = balance.onHand + params.quantityDelta;
        if (newOnHand < 0) {
            throw new errors_js_1.InventoryInvariantError(`Adjustment would result in negative on_hand quantity (${newOnHand}).`, { currentOnHand: balance.onHand, delta: params.quantityDelta });
        }
        const beforeState = { ...balance };
        const newAvailable = newOnHand - balance.reserved - balance.safetyStock - balance.damaged - balance.quarantined - balance.allocated;
        if (newAvailable < 0) {
            throw new errors_js_1.InventoryInvariantError(`Adjustment would result in negative available inventory (${newAvailable}). Release reservations before reducing stock below allocated orders.`, { newOnHand, reserved: balance.reserved, newAvailable });
        }
        const updatedBalance = {
            ...balance,
            onHand: newOnHand,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "MANUAL_ADJUSTMENT",
            quantityDelta: params.quantityDelta,
            sourceType: params.sourceType || "MANUAL",
            sourceId: `adj_${Date.now()}`,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, event };
    }
    /**
     * Applies an inventory recount, computing exact delta from physical inventory count.
     */
    applyRecount(balance, params) {
        if (params.physicalCount < 0) {
            throw new errors_js_1.InventoryInvariantError(`Recount physical count cannot be negative (${params.physicalCount})`);
        }
        const delta = params.physicalCount - balance.onHand;
        const beforeState = { ...balance };
        const newAvailable = params.physicalCount - balance.reserved - balance.safetyStock - balance.damaged - balance.quarantined - balance.allocated;
        if (newAvailable < 0) {
            throw new errors_js_1.InventoryInvariantError(`Recount results in ${newAvailable} available units because ${balance.reserved} units are currently reserved. Handle reservations before applying recount deficit.`);
        }
        const updatedBalance = {
            ...balance,
            onHand: params.physicalCount,
            available: newAvailable,
            version: balance.version + 1,
            updatedAt: new Date(),
        };
        assertBalanceInvariants(updatedBalance);
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const event = {
            id: eventId,
            organizationId: balance.organizationId,
            skuId: balance.skuId,
            warehouseId: balance.warehouseId,
            eventType: "RECOUNT",
            quantityDelta: delta,
            sourceType: "MANUAL",
            sourceId: `recount_${Date.now()}`,
            beforeState: beforeState,
            afterState: updatedBalance,
            idempotencyKey: params.idempotencyKey,
            correlationId: params.correlationId,
            actorType: params.actorId ? "USER" : "SYSTEM",
            actorId: params.actorId,
            createdAt: new Date(),
        };
        return { updatedBalance, event };
    }
    /**
     * Computes the current TrustState according to sync jobs and verification state.
     */
    determineTrustState(balance, activeJobs) {
        const skuJobs = activeJobs.filter((j) => j.skuId === balance.skuId);
        if (skuJobs.some((j) => j.status === "CONFLICT")) {
            return "CONFLICT";
        }
        if (skuJobs.some((j) => j.status === "FAILED" || j.status === "REQUIRES_ACTION")) {
            return "STALE";
        }
        if (skuJobs.some((j) => j.status === "QUEUED" || j.status === "PROCESSING" || j.status === "SENT")) {
            return "LIVE";
        }
        if (skuJobs.length > 0 && skuJobs.every((j) => j.status === "VERIFIED")) {
            return "VERIFIED";
        }
        return "LIVE";
    }
}
exports.InventoryDomainService = InventoryDomainService;
exports.defaultInventoryService = new InventoryDomainService();
//# sourceMappingURL=inventory-service.js.map