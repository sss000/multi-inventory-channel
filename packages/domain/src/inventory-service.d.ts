/**
 * Inventory Domain Service & Invariant Controller
 * Canonical Specification: Sections 15, 16, 17 of 01_ENGINEERING_SPEC.md & Prompt 07
 * Strict Invariant: Inventory mutation MUST only occur through this domain service.
 */
import { InventoryBalance, InventoryReservation, InventoryAllocation, InventoryDomainEvent, OrderId, UserId, UUID, TrustState, SyncJob } from "./types.js";
/**
 * Calculates sellable available inventory according to Section 15:
 * available = onHand - reserved - safetyStock - damaged - quarantined - allocated
 */
export declare function computeSellableAvailable(balance: Pick<InventoryBalance, "onHand" | "reserved" | "safetyStock" | "damaged" | "quarantined" | "allocated">): number;
/**
 * Asserts all balance fields satisfy non-negative and calculation invariants.
 */
export declare function assertBalanceInvariants(balance: InventoryBalance): void;
export interface CreateReservationParams {
    orderId?: OrderId;
    quantity: number;
    correlationId: UUID;
    actorId?: UserId;
    idempotencyKey?: string;
}
export interface ReleaseReservationParams {
    reason: string;
    correlationId: UUID;
    actorId?: UserId;
    idempotencyKey?: string;
}
export interface FulfillReservationParams {
    correlationId: UUID;
    actorId?: UserId;
    idempotencyKey?: string;
}
export interface AllocateReservationParams {
    correlationId: UUID;
    actorId?: UserId;
    idempotencyKey?: string;
}
export interface FulfillAllocationParams {
    correlationId: UUID;
    actorId?: UserId;
    idempotencyKey?: string;
}
export interface ReleaseAllocationParams {
    reason: string;
    correlationId: UUID;
    actorId?: UserId;
    idempotencyKey?: string;
}
export interface ManualAdjustmentParams {
    quantityDelta: number;
    reason: string;
    sourceType?: "MANUAL" | "SYSTEM";
    actorId?: UserId;
    correlationId: UUID;
    idempotencyKey?: string;
}
export interface RecountParams {
    physicalCount: number;
    reason: string;
    actorId?: UserId;
    correlationId: UUID;
    idempotencyKey?: string;
}
/**
 * Core Inventory Domain Service.
 * Governs all balance mutations, reservation lifecycles, and domain event generation.
 */
export declare class InventoryDomainService {
    /**
     * Atomically creates a reservation against an inventory balance.
     * Throws InsufficientInventoryError if available < requested quantity.
     */
    createReservation(balance: InventoryBalance, params: CreateReservationParams): {
        updatedBalance: InventoryBalance;
        reservation: InventoryReservation;
        event: InventoryDomainEvent;
    };
    /**
     * Releases an active reservation back to available inventory.
     */
    releaseReservation(balance: InventoryBalance, reservation: InventoryReservation, params: ReleaseReservationParams): {
        updatedBalance: InventoryBalance;
        updatedReservation: InventoryReservation;
        event: InventoryDomainEvent;
    };
    /**
     * Fulfills an active reservation upon order shipment.
     * Decrements both onHand and reserved atomically.
     */
    fulfillReservation(balance: InventoryBalance, reservation: InventoryReservation, params: FulfillReservationParams): {
        updatedBalance: InventoryBalance;
        updatedReservation: InventoryReservation;
        event: InventoryDomainEvent;
    };
    /**
     * Allocates an active reservation (e.g. order being picked and packed).
     * Moves quantity from reserved to allocated atomically.
     */
    allocateReservation(balance: InventoryBalance, reservation: InventoryReservation, params: AllocateReservationParams): {
        updatedBalance: InventoryBalance;
        updatedReservation: InventoryReservation;
        allocation: InventoryAllocation;
        event: InventoryDomainEvent;
    };
    /**
     * Fulfills allocated stock when the order is shipped.
     * Atomically decrements onHand and allocated.
     */
    fulfillAllocation(balance: InventoryBalance, allocation: InventoryAllocation, params: FulfillAllocationParams): {
        updatedBalance: InventoryBalance;
        updatedAllocation: InventoryAllocation;
        event: InventoryDomainEvent;
    };
    /**
     * Releases allocated stock back to available (e.g. pick cancelled).
     * Atomically decrements allocated.
     */
    releaseAllocation(balance: InventoryBalance, allocation: InventoryAllocation, params: ReleaseAllocationParams): {
        updatedBalance: InventoryBalance;
        updatedAllocation: InventoryAllocation;
        event: InventoryDomainEvent;
    };
    /**
     * Applies a manual stock adjustment (+ or -) with reason logging.
     */
    applyAdjustment(balance: InventoryBalance, params: ManualAdjustmentParams): {
        updatedBalance: InventoryBalance;
        event: InventoryDomainEvent;
    };
    /**
     * Applies an inventory recount, computing exact delta from physical inventory count.
     */
    applyRecount(balance: InventoryBalance, params: RecountParams): {
        updatedBalance: InventoryBalance;
        event: InventoryDomainEvent;
    };
    /**
     * Computes the current TrustState according to sync jobs and verification state.
     */
    determineTrustState(balance: InventoryBalance, activeJobs: SyncJob[]): TrustState;
}
export declare const defaultInventoryService: InventoryDomainService;
//# sourceMappingURL=inventory-service.d.ts.map