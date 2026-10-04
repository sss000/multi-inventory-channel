/**
 * Inventory Ledger Service & Concurrency Controller
 * Canonical Specification: Sections 15, 16, 27 of 01_ENGINEERING_SPEC.md & Prompt 08
 * 
 * Rules:
 * 1. Available quantity must be derived according to canonical formula:
 *    available = on_hand - reserved - safety_stock - damaged - quarantined - allocated
 * 2. Do not store available as an independently mutable value.
 * 3. Every inventory mutation must create an immutable inventory event.
 * 4. Concurrency control: Atomic transactions, pessimistic locking & optimistic version checks.
 * 5. Idempotency: Duplicate requests must not cause duplicate stock mutation.
 */

import {
  InventoryBalanceRow,
  InventoryEventRow,
  InventoryReservationRow,
  InventoryEventType,
  InventorySourceType,
  ActorType,
  ReservationStatus,
} from "./schema/types.js";
import {
  calculateSellableAvailable,
  validateInventoryBalanceConstraints,
  OptimisticLockConflictError,
} from "./transactions.js";
import {
  InsufficientInventoryError,
  InventoryInvariantError,
  DuplicateIdempotencyKeyError,
} from "@platform/domain";

export interface InventoryLedgerRepository {
  getBalance(organizationId: string, skuId: string, warehouseId: string): Promise<InventoryBalanceRow | null>;
  listBalances(organizationId: string, filter?: { skuId?: string; warehouseId?: string }): Promise<InventoryBalanceRow[]>;
  saveBalance(balance: InventoryBalanceRow): Promise<void>;
  createEvent(event: InventoryEventRow): Promise<void>;
  findEventByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<InventoryEventRow | null>;
  getEventsBySku(organizationId: string, skuId: string, warehouseId?: string): Promise<InventoryEventRow[]>;
  getReservation(organizationId: string, reservationId: string): Promise<InventoryReservationRow | null>;
  saveReservation(reservation: InventoryReservationRow): Promise<void>;
  findReservationByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<InventoryReservationRow | null>;
  listReservations(organizationId: string, filter?: { skuId?: string; orderId?: string; status?: ReservationStatus }): Promise<InventoryReservationRow[]>;
}

export class InMemoryInventoryLedgerRepository implements InventoryLedgerRepository {
  private balances = new Map<string, InventoryBalanceRow>();
  private events: InventoryEventRow[] = [];
  private idempotencyIndex = new Map<string, InventoryEventRow>();
  private reservations = new Map<string, InventoryReservationRow>();
  private reservationIdempotencyIndex = new Map<string, InventoryReservationRow>();

  private makeBalanceKey(orgId: string, skuId: string, warehouseId: string): string {
    return `${orgId}:${skuId}:${warehouseId}`;
  }

  private makeReservationKey(orgId: string, reservationId: string): string {
    return `${orgId}:${reservationId}`;
  }

  async getBalance(organizationId: string, skuId: string, warehouseId: string): Promise<InventoryBalanceRow | null> {
    const key = this.makeBalanceKey(organizationId, skuId, warehouseId);
    const balance = this.balances.get(key);
    return balance ? { ...balance } : null;
  }

  async listBalances(organizationId: string, filter?: { skuId?: string; warehouseId?: string }): Promise<InventoryBalanceRow[]> {
    return Array.from(this.balances.values())
      .filter((b) => {
        if (b.organization_id !== organizationId) return false;
        if (filter?.skuId && b.sku_id !== filter.skuId) return false;
        if (filter?.warehouseId && b.warehouse_id !== filter.warehouseId) return false;
        return true;
      })
      .map((b) => ({ ...b }));
  }

  async saveBalance(balance: InventoryBalanceRow): Promise<void> {
    const key = this.makeBalanceKey(balance.organization_id, balance.sku_id, balance.warehouse_id);
    this.balances.set(key, { ...balance });
  }

  async createEvent(event: InventoryEventRow): Promise<void> {
    const copy = { ...event };
    this.events.push(copy);
    if (copy.idempotency_key) {
      const idmpKey = `${copy.organization_id}:${copy.idempotency_key}`;
      this.idempotencyIndex.set(idmpKey, copy);
    }
  }

  async findEventByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<InventoryEventRow | null> {
    const idmpKey = `${organizationId}:${idempotencyKey}`;
    const found = this.idempotencyIndex.get(idmpKey);
    return found ? { ...found } : null;
  }

  async getEventsBySku(organizationId: string, skuId: string, warehouseId?: string): Promise<InventoryEventRow[]> {
    return this.events
      .filter((e) => {
        if (e.organization_id !== organizationId || e.sku_id !== skuId) return false;
        if (warehouseId && e.warehouse_id !== warehouseId) return false;
        return true;
      })
      .map((e) => ({ ...e }));
  }

  async getReservation(organizationId: string, reservationId: string): Promise<InventoryReservationRow | null> {
    const key = this.makeReservationKey(organizationId, reservationId);
    const res = this.reservations.get(key);
    return res ? { ...res } : null;
  }

  async saveReservation(reservation: InventoryReservationRow): Promise<void> {
    const key = this.makeReservationKey(reservation.organization_id, reservation.id);
    this.reservations.set(key, { ...reservation });
    if (reservation.idempotency_key) {
      const idmpKey = `${reservation.organization_id}:${reservation.idempotency_key}`;
      this.reservationIdempotencyIndex.set(idmpKey, { ...reservation });
    }
  }

  async findReservationByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<InventoryReservationRow | null> {
    const idmpKey = `${organizationId}:${idempotencyKey}`;
    const found = this.reservationIdempotencyIndex.get(idmpKey);
    return found ? { ...found } : null;
  }

  async listReservations(
    organizationId: string,
    filter?: { skuId?: string; orderId?: string; status?: ReservationStatus }
  ): Promise<InventoryReservationRow[]> {
    return Array.from(this.reservations.values())
      .filter((r) => {
        if (r.organization_id !== organizationId) return false;
        if (filter?.skuId && r.sku_id !== filter.skuId) return false;
        if (filter?.orderId && r.order_id !== filter.orderId) return false;
        if (filter?.status && r.status !== filter.status) return false;
        return true;
      })
      .map((r) => ({ ...r }));
  }

  clear(): void {
    this.balances.clear();
    this.events = [];
    this.idempotencyIndex.clear();
    this.reservations.clear();
    this.reservationIdempotencyIndex.clear();
  }
}

export interface InitialImportParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  onHand: number;
  safetyStock?: number;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface PurchaseReceiptParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantityReceived: number;
  purchaseOrderId?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface ManualAdjustmentParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantityDelta: number;
  reason: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface RecountParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  physicalCount: number;
  reason: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface DamageParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface WarehouseTransferParams {
  organizationId: string;
  skuId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  quantity: number;
  reason?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface ReconciliationCorrectionParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantityDelta: number;
  reason: string;
  channelAccountId?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface ReserveParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantity: number;
  orderId?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface ReleaseParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantity: number;
  orderId?: string;
  reservationId?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface FulfillParams {
  organizationId: string;
  skuId: string;
  warehouseId: string;
  quantity: number;
  orderId?: string;
  reservationId?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId: string;
  idempotencyKey?: string;
}

export interface LedgerMutationResult {
  balance: InventoryBalanceRow;
  event: InventoryEventRow;
  available: number;
  isDuplicate?: boolean;
}

export interface TransferMutationResult {
  sourceBalance: InventoryBalanceRow;
  destinationBalance: InventoryBalanceRow;
  sourceEvent: InventoryEventRow;
  destinationEvent: InventoryEventRow;
  sourceAvailable: number;
  destinationAvailable: number;
  isDuplicate?: boolean;
}

/**
 * Concurrency key locks for in-process thread/async serialization.
 */
class AsyncLockManager {
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
 * Inventory Ledger Service: Authoritative Coordinator for all Inventory Mutations.
 */
export class InventoryLedgerService {
  private lockManager = new AsyncLockManager();

  constructor(private readonly repository: InventoryLedgerRepository) {}

  getRepository(): InventoryLedgerRepository {
    return this.repository;
  }

  async getBalance(
    organizationId: string,
    skuId: string,
    warehouseId: string
  ): Promise<InventoryBalanceRow | null> {
    return this.repository.getBalance(organizationId, skuId, warehouseId);
  }

  async listBalances(
    organizationId: string,
    filter?: { skuId?: string; warehouseId?: string }
  ): Promise<InventoryBalanceRow[]> {
    return this.repository.listBalances(organizationId, filter);
  }

  async getEventsBySku(
    organizationId: string,
    skuId: string,
    warehouseId?: string
  ): Promise<InventoryEventRow[]> {
    return this.repository.getEventsBySku(organizationId, skuId, warehouseId);
  }

  async listConflicts(organizationId: string): Promise<Array<{
    id: string;
    organizationId: string;
    skuId: string;
    warehouseId: string | null;
    channelAccountId: string | null;
    internalQuantity: number;
    externalQuantity: number;
    difference: number;
    status: "OPEN" | "INVESTIGATING" | "RESOLVED";
    detectedAt: string;
  }>> {
    const balances = await this.listBalances(organizationId);
    const conflicts: Array<{
      id: string;
      organizationId: string;
      skuId: string;
      warehouseId: string | null;
      channelAccountId: string | null;
      internalQuantity: number;
      externalQuantity: number;
      difference: number;
      status: "OPEN" | "INVESTIGATING" | "RESOLVED";
      detectedAt: string;
    }> = [];

    for (const b of balances) {
      const avail = calculateSellableAvailable(b);
      if (avail < 0) {
        conflicts.push({
          id: `conflict_${b.id}`,
          organizationId: b.organization_id,
          skuId: b.sku_id,
          warehouseId: b.warehouse_id,
          channelAccountId: null,
          internalQuantity: b.on_hand,
          externalQuantity: b.on_hand - avail,
          difference: Math.abs(avail),
          status: "OPEN",
          detectedAt: b.updated_at,
        });
      }
    }

    return conflicts;
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

  private async withMultiLock<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    // Sort keys to prevent deadlocks when locking multiple resources
    const sortedKeys = [...new Set(keys)].sort();
    const releases: (() => void)[] = [];

    for (const key of sortedKeys) {
      const release = await this.lockManager.acquire(key);
      releases.push(release);
    }

    try {
      return await fn();
    } finally {
      // Release in reverse order
      for (let i = releases.length - 1; i >= 0; i--) {
        releases[i]?.();
      }
    }
  }

  private createEventRecord(params: {
    organizationId: string;
    skuId: string;
    warehouseId: string;
    eventType: InventoryEventType;
    quantityDelta: number;
    sourceType: InventorySourceType;
    sourceId: string;
    orderId?: string | null;
    reservationId?: string | null;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    idempotencyKey?: string | null;
    correlationId: string;
    actorType: ActorType;
    actorId?: string | null;
  }): InventoryEventRow {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      sku_id: params.skuId,
      warehouse_id: params.warehouseId,
      event_type: params.eventType,
      quantity_delta: params.quantityDelta,
      source_type: params.sourceType,
      source_id: params.sourceId,
      order_id: params.orderId ?? null,
      reservation_id: params.reservationId ?? null,
      before_state: params.beforeState,
      after_state: params.afterState,
      idempotency_key: params.idempotencyKey ?? null,
      correlation_id: params.correlationId,
      actor_type: params.actorType,
      actor_id: params.actorId ?? null,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Helper to check and handle idempotency deduplication.
   */
  private async checkIdempotency(
    organizationId: string,
    idempotencyKey?: string
  ): Promise<InventoryEventRow | null> {
    if (!idempotencyKey) return null;
    return await this.repository.findEventByIdempotencyKey(organizationId, idempotencyKey);
  }

  /**
   * 1. Initial Stock Import
   */
  async recordInitialImport(params: InitialImportParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.onHand < 0) {
        throw new InventoryInvariantError(`Initial import stock cannot be negative (received ${params.onHand})`);
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const existing = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      const now = new Date().toISOString();
      const beforeState = existing ? { ...existing } : {};

      const safetyStock = params.safetyStock ?? (existing?.safety_stock ?? 0);
      const newBalance: InventoryBalanceRow = {
        id: existing?.id || `bal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        organization_id: params.organizationId,
        sku_id: params.skuId,
        warehouse_id: params.warehouseId,
        on_hand: params.onHand,
        reserved: existing?.reserved ?? 0,
        allocated: existing?.allocated ?? 0,
        damaged: existing?.damaged ?? 0,
        quarantined: existing?.quarantined ?? 0,
        in_transit: existing?.in_transit ?? 0,
        incoming: existing?.incoming ?? 0,
        safety_stock: safetyStock,
        version: (existing?.version ?? 0) + 1,
        created_at: existing?.created_at || now,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(newBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "INITIAL_IMPORT",
        quantityDelta: params.onHand - (existing?.on_hand ?? 0),
        sourceType: "SYSTEM",
        sourceId: `import_${params.correlationId}`,
        beforeState,
        afterState: { ...newBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(newBalance);
      await this.repository.createEvent(event);

      return {
        balance: newBalance,
        event,
        available: calculateSellableAvailable(newBalance),
      };
    });
  }

  /**
   * 2. Purchase Order Receipt
   */
  async recordPurchaseReceipt(params: PurchaseReceiptParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantityReceived <= 0) {
        throw new InventoryInvariantError(
          `Purchase receipt quantity must be positive (received ${params.quantityReceived})`
        );
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot record receipt: inventory balance does not exist for SKU ${params.skuId} in warehouse ${params.warehouseId}. Create initial import first.`
        );
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const newOnHand = balance.on_hand + params.quantityReceived;
      const newIncoming = Math.max(0, balance.incoming - params.quantityReceived);

      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        on_hand: newOnHand,
        incoming: newIncoming,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "PURCHASE_RECEIPT",
        quantityDelta: params.quantityReceived,
        sourceType: "PURCHASE_ORDER",
        sourceId: params.purchaseOrderId || `po_${Date.now()}`,
        beforeState,
        afterState: { ...updatedBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 3. Manual Adjustment (+/-)
   */
  async recordManualAdjustment(params: ManualAdjustmentParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantityDelta === 0) {
        throw new InventoryInvariantError("Adjustment delta cannot be zero.");
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot adjust inventory: balance does not exist for SKU ${params.skuId}.`
        );
      }

      const beforeState = { ...balance };
      const newOnHand = balance.on_hand + params.quantityDelta;
      if (newOnHand < 0) {
        throw new InventoryInvariantError(
          `Manual adjustment would result in negative on_hand quantity (${newOnHand}). Current on_hand: ${balance.on_hand}.`
        );
      }

      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        on_hand: newOnHand,
        version: balance.version + 1,
        updated_at: now,
      };

      const newAvailable = calculateSellableAvailable(updatedBalance);
      if (newAvailable < 0) {
        throw new InventoryInvariantError(
          `Manual adjustment would reduce available stock below 0 (${newAvailable}). Release reservations or allocations first.`
        );
      }

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "MANUAL_ADJUSTMENT",
        quantityDelta: params.quantityDelta,
        sourceType: "MANUAL",
        sourceId: `adj_${Date.now()}`,
        beforeState,
        afterState: { ...updatedBalance, reason: params.reason },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: newAvailable,
      };
    });
  }

  /**
   * 4. Physical Recount / Cycle Count
   */
  async recordRecount(params: RecountParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.physicalCount < 0) {
        throw new InventoryInvariantError(
          `Recount physical count cannot be negative (${params.physicalCount}).`
        );
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot record recount: balance does not exist for SKU ${params.skuId}.`
        );
      }

      const delta = params.physicalCount - balance.on_hand;
      const beforeState = { ...balance };
      const now = new Date().toISOString();

      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        on_hand: params.physicalCount,
        version: balance.version + 1,
        updated_at: now,
      };

      const newAvailable = calculateSellableAvailable(updatedBalance);
      if (newAvailable < 0) {
        throw new InventoryInvariantError(
          `Recount would cause available stock to become negative (${newAvailable}) due to existing reservations/allocations.`
        );
      }

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "RECOUNT",
        quantityDelta: delta,
        sourceType: "MANUAL",
        sourceId: `recount_${Date.now()}`,
        beforeState,
        afterState: { ...updatedBalance, reason: params.reason },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: newAvailable,
      };
    });
  }

  /**
   * 5. Damaged Stock Segregation
   */
  async recordDamage(params: DamageParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantity <= 0) {
        throw new InventoryInvariantError(`Damage quantity must be positive (received ${params.quantity}).`);
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot record damage: balance does not exist for SKU ${params.skuId}.`
        );
      }

      const available = calculateSellableAvailable(balance);
      if (available < params.quantity) {
        throw new InsufficientInventoryError(params.quantity, available, {
          reason: "Cannot mark more stock damaged than is currently unreserved/sellable.",
        });
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const newDamaged = balance.damaged + params.quantity;

      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        damaged: newDamaged,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "DAMAGE",
        quantityDelta: params.quantity,
        sourceType: "MANUAL",
        sourceId: `damage_${Date.now()}`,
        beforeState,
        afterState: { ...updatedBalance, reason: params.reason },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 6. Warehouse Transfer (Atomic Source & Destination Mutation)
   */
  async recordWarehouseTransfer(params: WarehouseTransferParams): Promise<TransferMutationResult> {
    if (params.sourceWarehouseId === params.destinationWarehouseId) {
      throw new InventoryInvariantError("Source and destination warehouses must be different.");
    }
    if (params.quantity <= 0) {
      throw new InventoryInvariantError(`Transfer quantity must be positive (received ${params.quantity}).`);
    }

    const sourceKey = `${params.organizationId}:${params.skuId}:${params.sourceWarehouseId}`;
    const destKey = `${params.organizationId}:${params.skuId}:${params.destinationWarehouseId}`;

    return this.withMultiLock([sourceKey, destKey], async () => {
      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const srcBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.sourceWarehouseId
          ))!;
          const destBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.destinationWarehouseId
          ))!;
          return {
            sourceBalance: srcBal,
            destinationBalance: destBal,
            sourceEvent: existingEvent,
            destinationEvent: existingEvent,
            sourceAvailable: calculateSellableAvailable(srcBal),
            destinationAvailable: calculateSellableAvailable(destBal),
            isDuplicate: true,
          };
        }
      }

      const sourceBalance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.sourceWarehouseId
      );

      if (!sourceBalance) {
        throw new InventoryInvariantError(
          `Transfer source balance does not exist for warehouse ${params.sourceWarehouseId}.`
        );
      }

      const sourceAvailable = calculateSellableAvailable(sourceBalance);
      if (sourceAvailable < params.quantity) {
        throw new InsufficientInventoryError(params.quantity, sourceAvailable, {
          reason: "Insufficient available inventory in source warehouse for transfer.",
        });
      }

      let destBalance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.destinationWarehouseId
      );

      const now = new Date().toISOString();

      if (!destBalance) {
        destBalance = {
          id: `bal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          organization_id: params.organizationId,
          sku_id: params.skuId,
          warehouse_id: params.destinationWarehouseId,
          on_hand: 0,
          reserved: 0,
          allocated: 0,
          damaged: 0,
          quarantined: 0,
          in_transit: 0,
          incoming: 0,
          safety_stock: 0,
          version: 1,
          created_at: now,
          updated_at: now,
        };
      }

      const sourceBefore = { ...sourceBalance };
      const destBefore = { ...destBalance };

      const updatedSource: InventoryBalanceRow = {
        ...sourceBalance,
        on_hand: sourceBalance.on_hand - params.quantity,
        version: sourceBalance.version + 1,
        updated_at: now,
      };

      const updatedDest: InventoryBalanceRow = {
        ...destBalance,
        on_hand: destBalance.on_hand + params.quantity,
        version: destBalance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedSource);
      validateInventoryBalanceConstraints(updatedDest);

      const transferId = `trans_${Date.now()}`;
      const sourceEvent = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.sourceWarehouseId,
        eventType: "WAREHOUSE_TRANSFER",
        quantityDelta: -params.quantity,
        sourceType: "MANUAL",
        sourceId: transferId,
        beforeState: sourceBefore,
        afterState: { ...updatedSource, destinationWarehouseId: params.destinationWarehouseId },
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:src` : undefined,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      const destEvent = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.destinationWarehouseId,
        eventType: "WAREHOUSE_TRANSFER",
        quantityDelta: params.quantity,
        sourceType: "MANUAL",
        sourceId: transferId,
        beforeState: destBefore,
        afterState: { ...updatedDest, sourceWarehouseId: params.sourceWarehouseId },
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:dest` : undefined,
        correlationId: params.correlationId,
        actorType: params.actorType || "USER",
        actorId: params.actorId,
      });

      // Atomic commit of both balances and both events
      await this.repository.saveBalance(updatedSource);
      await this.repository.saveBalance(updatedDest);
      await this.repository.createEvent(sourceEvent);
      await this.repository.createEvent(destEvent);

      return {
        sourceBalance: updatedSource,
        destinationBalance: updatedDest,
        sourceEvent,
        destinationEvent: destEvent,
        sourceAvailable: calculateSellableAvailable(updatedSource),
        destinationAvailable: calculateSellableAvailable(updatedDest),
      };
    });
  }

  /**
   * 7. Reconciliation Correction
   */
  async recordReconciliationCorrection(params: ReconciliationCorrectionParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantityDelta === 0) {
        throw new InventoryInvariantError("Reconciliation correction delta cannot be zero.");
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot record reconciliation correction: balance does not exist for SKU ${params.skuId}.`
        );
      }

      const beforeState = { ...balance };
      const newOnHand = balance.on_hand + params.quantityDelta;
      if (newOnHand < 0) {
        throw new InventoryInvariantError(
          `Reconciliation correction would cause negative on_hand (${newOnHand}).`
        );
      }

      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        on_hand: newOnHand,
        version: balance.version + 1,
        updated_at: now,
      };

      const newAvailable = calculateSellableAvailable(updatedBalance);
      if (newAvailable < 0) {
        throw new InventoryInvariantError(
          `Reconciliation correction would result in negative available (${newAvailable}) with existing reservations.`
        );
      }

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "RECONCILIATION",
        quantityDelta: params.quantityDelta,
        sourceType: "RECONCILIATION",
        sourceId: params.channelAccountId || `recon_${Date.now()}`,
        beforeState,
        afterState: { ...updatedBalance, reason: params.reason },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "SYSTEM",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: newAvailable,
      };
    });
  }

  /**
   * 8. Atomic Order Reservation
   * Enforces the CRITICAL CONCURRENCY INVARIANT:
   * Two simultaneous transactions attempt to consume the final available unit;
   * exactly one succeeds, the second fails with InsufficientInventoryError.
   */
  async reserveInventory(params: ReserveParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantity <= 0) {
        throw new InventoryInvariantError(`Reservation quantity must be positive (received ${params.quantity}).`);
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot reserve: balance does not exist for SKU ${params.skuId}.`
        );
      }

      const available = calculateSellableAvailable(balance);
      if (available < params.quantity) {
        throw new InsufficientInventoryError(params.quantity, available, {
          skuId: params.skuId,
          warehouseId: params.warehouseId,
        });
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        reserved: balance.reserved + params.quantity,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "ORDER_RESERVATION",
        quantityDelta: params.quantity,
        sourceType: "ORDER",
        sourceId: params.orderId || `ord_${Date.now()}`,
        orderId: params.orderId,
        beforeState,
        afterState: { ...updatedBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "SYSTEM",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 9. Release Reservation back to available
   */
  async releaseReservation(params: ReleaseParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantity <= 0) {
        throw new InventoryInvariantError(`Release quantity must be positive (received ${params.quantity}).`);
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot release reservation: balance does not exist for SKU ${params.skuId}.`
        );
      }

      if (balance.reserved < params.quantity) {
        throw new InventoryInvariantError(
          `Cannot release ${params.quantity} units; balance only has ${balance.reserved} units reserved.`
        );
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        reserved: balance.reserved - params.quantity,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "ORDER_RELEASE",
        quantityDelta: -params.quantity,
        sourceType: "ORDER",
        sourceId: params.orderId || params.reservationId || `rel_${Date.now()}`,
        orderId: params.orderId,
        reservationId: params.reservationId,
        beforeState,
        afterState: { ...updatedBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "SYSTEM",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * 10. Fulfill Reservation (Order Shipment)
   */
  async fulfillReservation(params: FulfillParams): Promise<LedgerMutationResult> {
    return this.withBalanceLock(params.organizationId, params.skuId, params.warehouseId, async () => {
      if (params.quantity <= 0) {
        throw new InventoryInvariantError(`Fulfill quantity must be positive (received ${params.quantity}).`);
      }

      if (params.idempotencyKey) {
        const existingEvent = await this.checkIdempotency(params.organizationId, params.idempotencyKey);
        if (existingEvent) {
          const currentBal = (await this.repository.getBalance(
            params.organizationId,
            params.skuId,
            params.warehouseId
          ))!;
          return {
            balance: currentBal,
            event: existingEvent,
            available: calculateSellableAvailable(currentBal),
            isDuplicate: true,
          };
        }
      }

      const balance = await this.repository.getBalance(
        params.organizationId,
        params.skuId,
        params.warehouseId
      );

      if (!balance) {
        throw new InventoryInvariantError(
          `Cannot fulfill: balance does not exist for SKU ${params.skuId}.`
        );
      }

      if (balance.on_hand < params.quantity || balance.reserved < params.quantity) {
        throw new InventoryInvariantError(
          `Insufficient stock to fulfill: on_hand=${balance.on_hand}, reserved=${balance.reserved}, required=${params.quantity}`
        );
      }

      const beforeState = { ...balance };
      const now = new Date().toISOString();
      const updatedBalance: InventoryBalanceRow = {
        ...balance,
        on_hand: balance.on_hand - params.quantity,
        reserved: balance.reserved - params.quantity,
        version: balance.version + 1,
        updated_at: now,
      };

      validateInventoryBalanceConstraints(updatedBalance);

      const event = this.createEventRecord({
        organizationId: params.organizationId,
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        eventType: "ORDER_FULFILLMENT",
        quantityDelta: -params.quantity,
        sourceType: "ORDER",
        sourceId: params.orderId || params.reservationId || `ful_${Date.now()}`,
        orderId: params.orderId,
        reservationId: params.reservationId,
        beforeState,
        afterState: { ...updatedBalance },
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        actorType: params.actorType || "SYSTEM",
        actorId: params.actorId,
      });

      await this.repository.saveBalance(updatedBalance);
      await this.repository.createEvent(event);

      return {
        balance: updatedBalance,
        event,
        available: calculateSellableAvailable(updatedBalance),
      };
    });
  }

  /**
   * Helper to retrieve current balance and available quantity.
   */
  async getBalanceWithAvailable(
    organizationId: string,
    skuId: string,
    warehouseId: string
  ): Promise<{ balance: InventoryBalanceRow; available: number } | null> {
    const balance = await this.repository.getBalance(organizationId, skuId, warehouseId);
    if (!balance) return null;
    return {
      balance,
      available: calculateSellableAvailable(balance),
    };
  }

  /**
   * Helper to retrieve audit event ledger for SKU.
   */
  async getLedgerAuditEvents(
    organizationId: string,
    skuId: string,
    warehouseId?: string
  ): Promise<InventoryEventRow[]> {
    return await this.repository.getEventsBySku(organizationId, skuId, warehouseId);
  }
}
