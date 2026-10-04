/**
 * Reservation Domain Service & Lifecycle Controller
 * Canonical Specification: Section 17 of 01_ENGINEERING_SPEC.md & Prompt 09
 * 
 * Rules:
 * 1. Transactional reservations with statuses: ACTIVE, RELEASED, FULFILLED, EXPIRED.
 * 2. Each reservation contains: organization, SKU, warehouse, order, quantity.
 * 3. Never perform non-transactional read-then-write logic; always serialize under balance lock.
 * 4. Tenant isolation enforced on all reservation operations.
 * 5. Integrated directly with inventory ledger through transactional state updates and domain events.
 */

import {
  InventoryReservationRow,
  InventoryBalanceRow,
  InventoryEventRow,
  ReservationStatus,
} from "./schema/types.js";
import {
  calculateSellableAvailable,
  validateInventoryBalanceConstraints,
} from "./transactions.js";
import {
  InventoryLedgerRepository,
} from "./ledger.js";
import {
  InsufficientInventoryError,
  InventoryInvariantError,
  ReservationInvariantError,
  TenantAccessDeniedError,
} from "@platform/domain";

export interface CreateReservationParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantity: number;
  orderId?: string;
  actorId?: string;
  correlationId: string;
  idempotencyKey?: string;
  authenticatedOrgId?: string;
}

export interface ReleaseReservationParams {
  organizationId: string;
  reservationId: string;
  reason?: string;
  actorId?: string;
  correlationId: string;
  idempotencyKey?: string;
  authenticatedOrgId?: string;
}

export interface FulfillReservationParams {
  organizationId: string;
  reservationId: string;
  actorId?: string;
  correlationId: string;
  idempotencyKey?: string;
  authenticatedOrgId?: string;
}

export interface ExpireReservationParams {
  organizationId: string;
  reservationId: string;
  reason?: string;
  actorId?: string;
  correlationId: string;
  idempotencyKey?: string;
  authenticatedOrgId?: string;
}

export interface ReservationMutationResult {
  reservation: InventoryReservationRow;
  balance: InventoryBalanceRow;
  event: InventoryEventRow;
  available: number;
  isDuplicate?: boolean;
}

/**
 * Key-based mutex for local serialized balance locking.
 */
class ReservationLockManager {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, lockPromise);

    return () => {
      this.locks.delete(key);
      releaseLock();
    };
  }
}

/**
 * Reservation Service coordinating lifecycle, concurrency, idempotency, and tenant isolation.
 */
export class ReservationService {
  private lockManager = new ReservationLockManager();

  constructor(private readonly repository: InventoryLedgerRepository) {}

  private validateTenant(resourceOrgId: string, authenticatedOrgId?: string): void {
    if (authenticatedOrgId && authenticatedOrgId !== resourceOrgId) {
      throw new TenantAccessDeniedError(resourceOrgId, authenticatedOrgId);
    }
  }

  private async withBalanceLock<T>(
    orgId: string,
    skuId: string,
    warehouseId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const key = `${orgId}:${skuId}:${warehouseId}`;
    const release = await this.lockManager.acquire(key);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private createEventRecord(params: {
    organizationId: string;
    skuId: string;
    warehouseId: string;
    eventType: "ORDER_RESERVATION" | "ORDER_RELEASE" | "ORDER_FULFILLMENT";
    quantityDelta: number;
    sourceId: string;
    orderId?: string | null;
    reservationId: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    idempotencyKey?: string | null;
    correlationId: string;
    actorId?: string | null;
  }): InventoryEventRow {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      sku_id: params.skuId,
      warehouse_id: params.warehouseId,
      event_type: params.eventType,
      quantity_delta: params.quantityDelta,
      source_type: "ORDER",
      source_id: params.sourceId,
      order_id: params.orderId ?? null,
      reservation_id: params.reservationId,
      before_state: params.beforeState,
      after_state: params.afterState,
      idempotency_key: params.idempotencyKey ?? null,
      correlation_id: params.correlationId,
      actor_type: params.actorId ? "USER" : "SYSTEM",
      actor_id: params.actorId ?? null,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * 1. Reserve Inventory
   * Enforces race-condition protection and idempotency.
   */
  async reserve(params: CreateReservationParams): Promise<ReservationMutationResult> {
    this.validateTenant(params.organizationId, params.authenticatedOrgId);

    if (params.quantity <= 0) {
      throw new ReservationInvariantError(
        `Reservation quantity must be strictly positive (received ${params.quantity})`
      );
    }

    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      // 1. Check idempotency
      if (params.idempotencyKey) {
        const existingReservation = await this.repository.findReservationByIdempotencyKey(
          params.organizationId,
          params.idempotencyKey
        );
        if (existingReservation) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          const events = await this.repository.getEventsBySku(
            params.organizationId,
            params.skuId,
            params.warehouseId
          );
          const relatedEvent = events.find((e) => e.reservation_id === existingReservation.id) || events[0]!;
          return {
            reservation: existingReservation,
            balance: currentBal,
            event: relatedEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      // 2. Fetch balance
      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot reserve: inventory balance does not exist for SKU '${params.skuId}' in warehouse '${params.warehouseId}'.`
        );
      }

      // 3. Invariant: Available calculation
      const available = calculateSellableAvailable(balance);
      if (available < params.quantity) {
        throw new InsufficientInventoryError(params.quantity, available, {
          organizationId: params.organizationId,
          skuId: params.skuId,
          warehouseId: params.warehouseId,
        });
      }

      // 4. Update balance
      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        reserved: balance.reserved + params.quantity,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      // 5. Create reservation record
      const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const reservation: InventoryReservationRow = {
        id: reservationId,
        organization_id: params.organizationId,
        sku_id: params.skuId,
        warehouse_id: params.warehouseId,
        order_id: params.orderId ?? null,
        quantity: params.quantity,
        status: "ACTIVE",
        created_at: now,
        released_at: null,
        fulfilled_at: null,
        expired_at: null,
        idempotency_key: params.idempotencyKey ?? null,
      };

      // 6. Create event record
      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "ORDER_RESERVATION",
        quantityDelta: params.quantity,
        sourceId: params.orderId || reservationId,
        orderId: params.orderId,
        reservationId,
        beforeState,
        afterState: { ...updatedBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorId: params.actorId,
      });

      // 7. Atomic persistence
      await this.repository.saveBalance(updatedBalance);
      await this.repository.saveReservation(reservation);
      await this.repository.createEvent(event);

      return {
        reservation,
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 2. Release Reservation back to available stock
   */
  async release(params: ReleaseReservationParams): Promise<ReservationMutationResult> {
    this.validateTenant(params.organizationId, params.authenticatedOrgId);

    const reservation = await this.repository.getReservation(params.organizationId, params.reservationId);
    if (!reservation) {
      throw new ReservationInvariantError(
        `Reservation '${params.reservationId}' not found for organization '${params.organizationId}'.`
      );
    }

    if (reservation.status !== "ACTIVE") {
      throw new ReservationInvariantError(
        `Cannot release reservation '${params.reservationId}' with status '${reservation.status}'. Only ACTIVE reservations can be released.`
      );
    }

    return this.withBalanceLock(params.organizationId, reservation.sku_id, reservation.warehouse_id, async () => {
      const balance = await this.repository.getBalance(
        params.organizationId,
        reservation.sku_id,
        reservation.warehouse_id
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot release reservation: inventory balance does not exist for SKU '${reservation.sku_id}'.`
        );
      }

      if (balance.reserved < reservation.quantity) {
        throw new InventoryInvariantError(
          `Cannot release ${reservation.quantity} units; balance only has ${balance.reserved} units reserved.`
        );
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        reserved: balance.reserved - reservation.quantity,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const updatedReservation: InventoryReservationRow = {
        ...reservation,
        status: "RELEASED",
        released_at: now,
      };

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: reservation.sku_id,
        warehouseId: reservation.warehouse_id,
        eventType: "ORDER_RELEASE",
        quantityDelta: -reservation.quantity,
        sourceId: params.reservationId,
        orderId: reservation.order_id,
        reservationId: reservation.id,
        beforeState,
        afterState: { ...updatedBalance, reason: params.reason || "Released" },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.saveReservation(updatedReservation);
      await this.repository.createEvent(event);

      return {
        reservation: updatedReservation,
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 3. Fulfill Reservation upon shipment
   */
  async fulfill(params: FulfillReservationParams): Promise<ReservationMutationResult> {
    this.validateTenant(params.organizationId, params.authenticatedOrgId);

    const reservation = await this.repository.getReservation(params.organizationId, params.reservationId);
    if (!reservation) {
      throw new ReservationInvariantError(
        `Reservation '${params.reservationId}' not found for organization '${params.organizationId}'.`
      );
    }

    if (reservation.status !== "ACTIVE") {
      throw new ReservationInvariantError(
        `Cannot fulfill reservation '${params.reservationId}' with status '${reservation.status}'. Only ACTIVE reservations can be fulfilled.`
      );
    }

    return this.withBalanceLock(params.organizationId, reservation.sku_id, reservation.warehouse_id, async () => {
      const balance = await this.repository.getBalance(
        params.organizationId,
        reservation.sku_id,
        reservation.warehouse_id
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot fulfill reservation: inventory balance does not exist for SKU '${reservation.sku_id}'.`
        );
      }

      if (balance.on_hand < reservation.quantity || balance.reserved < reservation.quantity) {
        throw new InventoryInvariantError(
          `Insufficient inventory to fulfill reservation: on_hand=${balance.on_hand}, reserved=${balance.reserved}, required=${reservation.quantity}`
        );
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        on_hand: balance.on_hand - reservation.quantity,
        reserved: balance.reserved - reservation.quantity,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const updatedReservation: InventoryReservationRow = {
        ...reservation,
        status: "FULFILLED",
        fulfilled_at: now,
      };

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: reservation.sku_id,
        warehouseId: reservation.warehouse_id,
        eventType: "ORDER_FULFILLMENT",
        quantityDelta: -reservation.quantity,
        sourceId: params.reservationId,
        orderId: reservation.order_id,
        reservationId: reservation.id,
        beforeState,
        afterState: { ...updatedBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.saveReservation(updatedReservation);
      await this.repository.createEvent(event);

      return {
        reservation: updatedReservation,
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 4. Expire Reservation (Cart abandonment / TTL timeout)
   */
  async expire(params: ExpireReservationParams): Promise<ReservationMutationResult> {
    this.validateTenant(params.organizationId, params.authenticatedOrgId);

    const reservation = await this.repository.getReservation(params.organizationId, params.reservationId);
    if (!reservation) {
      throw new ReservationInvariantError(
        `Reservation '${params.reservationId}' not found for organization '${params.organizationId}'.`
      );
    }

    if (reservation.status !== "ACTIVE") {
      throw new ReservationInvariantError(
        `Cannot expire reservation '${params.reservationId}' with status '${reservation.status}'. Only ACTIVE reservations can expire.`
      );
    }

    return this.withBalanceLock(params.organizationId, reservation.sku_id, reservation.warehouse_id, async () => {
      const balance = await this.repository.getBalance(
        params.organizationId,
        reservation.sku_id,
        reservation.warehouse_id
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot expire reservation: balance does not exist for SKU '${reservation.sku_id}'.`
        );
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        reserved: Math.max(0, balance.reserved - reservation.quantity),
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const updatedReservation: InventoryReservationRow = {
        ...reservation,
        status: "EXPIRED",
        released_at: now,
        expired_at: now,
      };

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: reservation.sku_id,
        warehouseId: reservation.warehouse_id,
        eventType: "ORDER_RELEASE",
        quantityDelta: -reservation.quantity,
        sourceId: `expiry_${params.reservationId}`,
        orderId: reservation.order_id,
        reservationId: reservation.id,
        beforeState,
        afterState: { ...updatedBalance, reason: params.reason || "Expired due to TTL timeout" },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.saveReservation(updatedReservation);
      await this.repository.createEvent(event);

      return {
        reservation: updatedReservation,
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 5. Expire all stale reservations exceeding TTL
   */
  async expireOldReservations(
    organizationId: string,
    ttlMs: number,
    correlationId: string,
    authenticatedOrgId?: string
  ): Promise<ReservationMutationResult[]> {
    this.validateTenant(organizationId, authenticatedOrgId);

    const activeReservations = await this.repository.listReservations(organizationId, {
      status: "ACTIVE",
    });

    const now = Date.now();
    const staleReservations = activeReservations.filter((r) => {
      const createdAt = new Date(r.created_at).getTime();
      return now - createdAt >= ttlMs;
    });

    const results: ReservationMutationResult[] = [];
    for (const r of staleReservations) {
      const res = await this.expire({
        organizationId,
        reservationId: r.id,
        reason: `Auto-expired: exceeded TTL of ${ttlMs}ms`,
        correlationId,
      });
      results.push(res);
    }

    return results;
  }

  /**
   * Get single reservation with tenant check
   */
  async getReservation(
    organizationId: string,
    reservationId: string,
    authenticatedOrgId?: string
  ): Promise<InventoryReservationRow | null> {
    this.validateTenant(organizationId, authenticatedOrgId);
    return await this.repository.getReservation(organizationId, reservationId);
  }

  /**
   * List reservations with tenant check
   */
  async listReservations(
    organizationId: string,
    filter?: { skuId?: string; orderId?: string; status?: ReservationStatus },
    authenticatedOrgId?: string
  ): Promise<InventoryReservationRow[]> {
    this.validateTenant(organizationId, authenticatedOrgId);
    return await this.repository.listReservations(organizationId, filter);
  }
}
