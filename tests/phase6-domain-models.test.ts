import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  InventoryBalance,
  InventoryReservation,
  InventoryAllocation,
  SyncJob,
  DomainException,
} from "@platform/domain";
import {
  // Calculation & Invariant Assertions
  computeSellableAvailable,
  assertBalanceInvariants,
  // Domain Services & Operations
  InventoryDomainService,
  defaultInventoryService,
  // State Machine & Sync
  createSyncJob,
  transitionSyncJob,
  canTransitionSync,
  // Reconciliation
  classifyDiscrepancy,
  isAutoReconcilable,
  createReconciliationResult,
  resolveReconciliationResult,
  // Exceptions
  createDomainException,
  transitionException,
  canTransitionException,
  DEFAULT_EXCEPTION_SEVERITY,
  // Error Taxonomy
  DomainError,
  InventoryInvariantError,
  InsufficientInventoryError,
  ReservationInvariantError,
  AllocationInvariantError,
  InvalidStateTransitionError,
  ReconciliationInvariantError,
  ExceptionInvariantError,
} from "@platform/domain";

describe("Phase 6: Domain Models Acceptance Suite", () => {
  const service = defaultInventoryService;

  const createBaselineBalance = (overrides: Partial<InventoryBalance> = {}): InventoryBalance => {
    const onHand = overrides.onHand ?? 100;
    const reserved = overrides.reserved ?? 10;
    const safetyStock = overrides.safetyStock ?? 5;
    const damaged = overrides.damaged ?? 2;
    const quarantined = overrides.quarantined ?? 3;
    const allocated = overrides.allocated ?? 15;
    const inTransit = overrides.inTransit ?? 0;
    const incoming = overrides.incoming ?? 0;

    const available =
      overrides.available ??
      computeSellableAvailable({
        onHand,
        reserved,
        safetyStock,
        damaged,
        quarantined,
        allocated,
      });

    return {
      id: "bal_test_123",
      organizationId: "11111111-1111-4111-8111-111111111111",
      skuId: "sku_test_123",
      warehouseId: "wh_test_123",
      onHand,
      reserved,
      allocated,
      damaged,
      quarantined,
      inTransit,
      incoming,
      safetyStock,
      version: 1,
      available,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      ...overrides,
    };
  };

  describe("1. Architectural Purity & Dependency Direction", () => {
    it("should verify @platform/domain has ZERO runtime dependencies", () => {
      const packageJsonPath = path.resolve(process.cwd(), "packages/domain/package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      assert.deepEqual(packageJson.dependencies ?? {}, {}, "Domain package must have 0 runtime dependencies");
    });

    it("should verify @platform/domain source files contain no database or framework imports", () => {
      const srcDir = path.resolve(process.cwd(), "packages/domain/src");
      const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts"));

      const forbiddenPatterns = [
        "express",
        "next",
        "react",
        "@supabase",
        "pg",
        "ioredis",
        "bullmq",
        "stripe",
      ];

      for (const file of files) {
        const content = fs.readFileSync(path.join(srcDir, file), "utf-8");
        for (const pattern of forbiddenPatterns) {
          assert.equal(
            content.includes(`"${pattern}`) || content.includes(`'${pattern}`),
            false,
            `Forbidden dependency '${pattern}' detected in pure domain source file: ${file}`
          );
        }
      }
    });
  });

  describe("2. Canonical Inventory Calculations & Invariants", () => {
    it("should accurately calculate sellable available quantity: onHand - reserved - safetyStock - damaged - quarantined - allocated", () => {
      const available = computeSellableAvailable({
        onHand: 200,
        reserved: 30,
        safetyStock: 10,
        damaged: 5,
        quarantined: 5,
        allocated: 20,
      });

      // 200 - 30 - 10 - 5 - 5 - 20 = 130
      assert.equal(available, 130);
    });

    it("should assert inventory invariants and reject negative inventory values", () => {
      const validBalance = createBaselineBalance();
      assert.doesNotThrow(() => assertBalanceInvariants(validBalance));

      const invalidBalance = createBaselineBalance({ reserved: -1 });
      assert.throws(() => assertBalanceInvariants(invalidBalance), InventoryInvariantError);
    });

    it("should reject balance when calculated available does not match stored available", () => {
      const mismatchBalance = createBaselineBalance({ available: 999 });
      assert.throws(() => assertBalanceInvariants(mismatchBalance), InventoryInvariantError);
    });
  });

  describe("3. Reservation Domain Operations", () => {
    it("should atomically create reservation and produce ORDER_RESERVATION domain event", () => {
      const balance = createBaselineBalance();
      const initialAvailable = balance.available;
      const initialReserved = balance.reserved;

      const { updatedBalance, reservation, event } = service.createReservation(balance, {
        quantity: 10,
        orderId: "ord_101",
        correlationId: "corr_001",
      });

      assert.equal(reservation.status, "ACTIVE");
      assert.equal(reservation.quantity, 10);
      assert.equal(updatedBalance.reserved, initialReserved + 10);
      assert.equal(updatedBalance.available, initialAvailable - 10);
      assert.equal(updatedBalance.version, balance.version + 1);

      assert.equal(event.eventType, "ORDER_RESERVATION");
      assert.equal(event.quantityDelta, 10);
      assert.equal(event.correlationId, "corr_001");
      assert.doesNotThrow(() => assertBalanceInvariants(updatedBalance));
    });

    it("should reject reservation when quantity exceeds available inventory", () => {
      const balance = createBaselineBalance(); // Available is 65
      assert.throws(
        () =>
          service.createReservation(balance, {
            quantity: 100,
            correlationId: "corr_over",
          }),
        InsufficientInventoryError
      );
    });

    it("should reject non-positive reservation quantities", () => {
      const balance = createBaselineBalance();
      assert.throws(
        () => service.createReservation(balance, { quantity: 0, correlationId: "corr_zero" }),
        ReservationInvariantError
      );
      assert.throws(
        () => service.createReservation(balance, { quantity: -5, correlationId: "corr_neg" }),
        ReservationInvariantError
      );
    });

    it("should release an active reservation back to available stock", () => {
      const balance = createBaselineBalance();
      const { updatedBalance: reservedBalance, reservation } = service.createReservation(balance, {
        quantity: 15,
        correlationId: "corr_res",
      });

      const { updatedBalance, updatedReservation, event } = service.releaseReservation(
        reservedBalance,
        reservation,
        {
          reason: "Customer canceled order",
          correlationId: "corr_rel",
        }
      );

      assert.equal(updatedReservation.status, "RELEASED");
      assert.equal(updatedBalance.reserved, balance.reserved);
      assert.equal(updatedBalance.available, balance.available);
      assert.equal(event.eventType, "ORDER_RELEASE");
      assert.equal(event.quantityDelta, -15);
    });

    it("should forbid releasing non-active reservations", () => {
      const balance = createBaselineBalance();
      const { updatedBalance, reservation } = service.createReservation(balance, {
        quantity: 5,
        correlationId: "corr_rel",
      });

      const released = service.releaseReservation(updatedBalance, reservation, {
        reason: "Cancelled",
        correlationId: "corr_rel2",
      });

      assert.throws(
        () =>
          service.releaseReservation(released.updatedBalance, released.updatedReservation, {
            reason: "Double release",
            correlationId: "corr_rel3",
          }),
        ReservationInvariantError
      );
    });

    it("should fulfill an active reservation upon shipment", () => {
      const balance = createBaselineBalance();
      const { updatedBalance: reservedBalance, reservation } = service.createReservation(balance, {
        quantity: 10,
        correlationId: "corr_fulfill",
      });

      const { updatedBalance, updatedReservation, event } = service.fulfillReservation(
        reservedBalance,
        reservation,
        {
          correlationId: "corr_ful",
        }
      );

      assert.equal(updatedReservation.status, "FULFILLED");
      assert.equal(updatedBalance.onHand, balance.onHand - 10);
      assert.equal(updatedBalance.reserved, balance.reserved); // Decremented back to original
      assert.equal(event.eventType, "ORDER_FULFILLMENT");
      assert.equal(event.quantityDelta, -10);
    });
  });

  describe("4. Allocation Domain Operations", () => {
    it("should allocate an active reservation to picking/packing state", () => {
      const balance = createBaselineBalance();
      const { updatedBalance: reservedBalance, reservation } = service.createReservation(balance, {
        quantity: 20,
        orderId: "ord_alloc_1",
        correlationId: "corr_alloc",
      });

      const { updatedBalance, updatedReservation, allocation, event } = service.allocateReservation(
        reservedBalance,
        reservation,
        { correlationId: "corr_alloc_step" }
      );

      assert.equal(updatedReservation.status, "FULFILLED");
      assert.equal(allocation.status, "ACTIVE");
      assert.equal(allocation.quantity, 20);
      assert.equal(updatedBalance.reserved, balance.reserved);
      assert.equal(updatedBalance.allocated, balance.allocated + 20);
      assert.equal(event.eventType, "ORDER_ALLOCATION");
      assert.doesNotThrow(() => assertBalanceInvariants(updatedBalance));
    });

    it("should fulfill allocated stock upon carrier pickup", () => {
      const balance = createBaselineBalance();
      const { updatedBalance: resBal, reservation } = service.createReservation(balance, {
        quantity: 10,
        correlationId: "corr_ship",
      });
      const { updatedBalance: allocBal, allocation } = service.allocateReservation(resBal, reservation, {
        correlationId: "corr_ship_alloc",
      });

      const { updatedBalance, updatedAllocation, event } = service.fulfillAllocation(allocBal, allocation, {
        correlationId: "corr_shipped",
      });

      assert.equal(updatedAllocation.status, "FULFILLED");
      assert.equal(updatedBalance.onHand, balance.onHand - 10);
      assert.equal(updatedBalance.allocated, balance.allocated);
      assert.equal(event.eventType, "ORDER_FULFILLMENT");
      assert.equal(event.quantityDelta, -10);
      assert.doesNotThrow(() => assertBalanceInvariants(updatedBalance));
    });

    it("should release allocated stock if order picking is cancelled", () => {
      const balance = createBaselineBalance();
      const { updatedBalance: resBal, reservation } = service.createReservation(balance, {
        quantity: 10,
        correlationId: "corr_canc",
      });
      const { updatedBalance: allocBal, allocation } = service.allocateReservation(resBal, reservation, {
        correlationId: "corr_canc_alloc",
      });

      const { updatedBalance, updatedAllocation, event } = service.releaseAllocation(allocBal, allocation, {
        reason: "Item damaged during pick",
        correlationId: "corr_canc_rel",
      });

      assert.equal(updatedAllocation.status, "RELEASED");
      assert.equal(updatedBalance.allocated, balance.allocated);
      assert.equal(event.eventType, "ORDER_RELEASE");
      assert.doesNotThrow(() => assertBalanceInvariants(updatedBalance));
    });
  });

  describe("5. Adjustments & Recounts Invariants", () => {
    it("should apply positive manual adjustments and update available inventory", () => {
      const balance = createBaselineBalance();
      const { updatedBalance, event } = service.applyAdjustment(balance, {
        quantityDelta: 25,
        reason: "Found extra stock",
        correlationId: "corr_adj_pos",
      });

      assert.equal(updatedBalance.onHand, balance.onHand + 25);
      assert.equal(updatedBalance.available, balance.available + 25);
      assert.equal(event.eventType, "MANUAL_ADJUSTMENT");
      assert.equal(event.quantityDelta, 25);
    });

    it("should reject negative adjustments that exceed on-hand quantity", () => {
      const balance = createBaselineBalance({ onHand: 10 });
      assert.throws(
        () =>
          service.applyAdjustment(balance, {
            quantityDelta: -20,
            reason: "Too much reduction",
            correlationId: "corr_adj_fail",
          }),
        InventoryInvariantError
      );
    });

    it("should apply recount and set on-hand to physical count", () => {
      const balance = createBaselineBalance({ onHand: 100 });
      const { updatedBalance, event } = service.applyRecount(balance, {
        physicalCount: 112,
        reason: "Annual physical count",
        correlationId: "corr_recount",
      });

      assert.equal(updatedBalance.onHand, 112);
      assert.equal(event.eventType, "RECOUNT");
      assert.equal(event.quantityDelta, 12);
    });
  });

  describe("6. Asynchronous Synchronization State Machine", () => {
    it("should successfully progress through canonical sync lifecycle", () => {
      const job = createSyncJob({
        organizationId: "11111111-1111-4111-8111-111111111111",
        channelAccountId: "22222222-2222-4222-8222-222222222222",
        skuId: "sku_test_sync",
        operation: "UPDATE_INVENTORY",
        targetQuantity: 45,
        correlationId: "corr_sync_01",
      });

      assert.equal(job.status, "QUEUED");
      assert.equal(job.targetQuantity, 45);

      const processing = transitionSyncJob(job, "PROCESSING");
      assert.equal(processing.status, "PROCESSING");
      assert.ok(processing.startedAt);

      const sent = transitionSyncJob(processing, "SENT");
      assert.equal(sent.status, "SENT");
      assert.ok(sent.sentAt);

      const acknowledged = transitionSyncJob(sent, "ACKNOWLEDGED");
      assert.equal(acknowledged.status, "ACKNOWLEDGED");
      assert.ok(acknowledged.acknowledgedAt);

      const verifying = transitionSyncJob(acknowledged, "VERIFYING");
      assert.equal(verifying.status, "VERIFYING");

      const verified = transitionSyncJob(verifying, "VERIFIED");
      assert.equal(verified.status, "VERIFIED");
      assert.ok(verified.verifiedAt);
    });

    it("should strictly forbid marking synchronization VERIFIED prematurely", () => {
      const job = createSyncJob({
        organizationId: "11111111-1111-4111-8111-111111111111",
        channelAccountId: "22222222-2222-4222-8222-222222222222",
        skuId: "sku_test_sync",
        operation: "UPDATE_INVENTORY",
        targetQuantity: 50,
        correlationId: "corr_sync_bypass",
      });

      // Attempting QUEUED -> VERIFIED must fail
      assert.throws(
        () => transitionSyncJob(job, "VERIFIED"),
        InvalidStateTransitionError
      );

      // Attempting PROCESSING -> VERIFIED must fail
      const processing = transitionSyncJob(job, "PROCESSING");
      assert.throws(
        () => transitionSyncJob(processing, "VERIFIED"),
        InvalidStateTransitionError
      );

      // Attempting SENT -> VERIFIED must fail
      const sent = transitionSyncJob(processing, "SENT");
      assert.throws(
        () => transitionSyncJob(sent, "VERIFIED"),
        InvalidStateTransitionError
      );
    });

    it("should increment attemptCount on RETRYING and escalate to FAILED on max retries", () => {
      const job = createSyncJob({
        organizationId: "11111111-1111-4111-8111-111111111111",
        channelAccountId: "22222222-2222-4222-8222-222222222222",
        skuId: "sku_test_sync",
        operation: "UPDATE_INVENTORY",
        targetQuantity: 10,
        correlationId: "corr_retry",
      });

      const processing = transitionSyncJob(job, "PROCESSING");

      // First retry
      const retry1 = transitionSyncJob(processing, "RETRYING", {
        errorCode: "RATE_LIMITED",
        maxAttempts: 3,
      });
      assert.equal(retry1.status, "RETRYING");
      assert.equal(retry1.attemptCount, 1);

      // Processing again
      const processing2 = transitionSyncJob(retry1, "PROCESSING");
      // Second retry
      const retry2 = transitionSyncJob(processing2, "RETRYING", { maxAttempts: 3 });
      assert.equal(retry2.attemptCount, 2);

      // Processing again
      const processing3 = transitionSyncJob(retry2, "PROCESSING");
      // Third retry hits maxAttempts (3) -> auto-escalates to FAILED
      const failed = transitionSyncJob(processing3, "RETRYING", {
        errorCode: "MAX_RETRIES_EXCEEDED",
        maxAttempts: 3,
      });
      assert.equal(failed.status, "FAILED");
      assert.equal(failed.attemptCount, 3);
      assert.ok(failed.failedAt);
    });
  });

  describe("7. Reconciliation & Discrepancy Classification", () => {
    it("should classify matching quantities as MATCH and mark auto-reconciled", () => {
      const classification = classifyDiscrepancy(100, 100);
      assert.equal(classification.classification, "MATCH");
      assert.equal(classification.difference, 0);

      const result = createReconciliationResult({
        reconciliationRunId: "run_01",
        skuId: "sku_match",
        internalQuantity: 100,
        externalQuantity: 100,
      });

      assert.equal(result.classification, "MATCH");
      assert.equal(result.status, "AUTO_RESOLVED");
      assert.ok(result.resolvedAt);
    });

    it("should classify minor differences and check auto-reconcile limits", () => {
      const result = classifyDiscrepancy(100, 101);
      assert.equal(result.classification, "MINOR_DIFFERENCE");
      assert.equal(result.difference, 1);
      assert.equal(isAutoReconcilable("MINOR_DIFFERENCE", 1), true);
      assert.equal(isAutoReconcilable("MINOR_DIFFERENCE", 5), false);
    });

    it("should strictly forbid auto-reconciliation of MATERIAL_DIFFERENCE and missing entities", () => {
      assert.equal(isAutoReconcilable("MATERIAL_DIFFERENCE", 25), false);
      assert.equal(isAutoReconcilable("MISSING_EXTERNAL", -10), false);
      assert.equal(isAutoReconcilable("MISSING_INTERNAL", 15), false);
      assert.equal(isAutoReconcilable("UNKNOWN", 0), false);
    });

    it("should classify missing external and missing internal catalog mappings", () => {
      const missingExt = classifyDiscrepancy(50, null);
      assert.equal(missingExt.classification, "MISSING_EXTERNAL");

      const missingInt = classifyDiscrepancy(null, 50);
      assert.equal(missingInt.classification, "MISSING_INTERNAL");
    });

    it("should transition reconciliation result upon manual resolution", () => {
      const result = createReconciliationResult({
        reconciliationRunId: "run_02",
        skuId: "sku_diff",
        internalQuantity: 100,
        externalQuantity: 120, // difference = 20 (MATERIAL)
      });

      assert.equal(result.status, "PENDING");
      assert.equal(result.classification, "MATERIAL_DIFFERENCE");

      const resolved = resolveReconciliationResult(result, "MANUAL");
      assert.equal(resolved.status, "MANUALLY_RESOLVED");
      assert.ok(resolved.resolvedAt);

      assert.throws(
        () => resolveReconciliationResult(resolved, "MANUAL"),
        ReconciliationInvariantError
      );
    });
  });

  describe("8. Exceptions Domain Service & Lifecycles", () => {
    it("should create structured DomainException with deterministic severity scoring", () => {
      const exCritical = createDomainException({
        organizationId: "11111111-1111-4111-8111-111111111111",
        type: "NEGATIVE_INVENTORY",
        entityType: "SKU",
        entityId: "sku_neg",
        title: "Negative Inventory Detected",
        description: "Warehouse recount recorded -2 units",
      });

      assert.equal(exCritical.severity, "CRITICAL");
      assert.equal(exCritical.status, "OPEN");

      const exSync = createDomainException({
        organizationId: "11111111-1111-4111-8111-111111111111",
        type: "SYNC_FAILURE",
        entityType: "SyncJob",
        entityId: "sync_job_01",
        title: "Shopify API Unreachable",
        description: "503 Service Unavailable",
      });

      assert.equal(exSync.severity, "HIGH");
    });

    it("should transition exception status through valid lifecycle", () => {
      const exception = createDomainException({
        organizationId: "11111111-1111-4111-8111-111111111111",
        type: "MISSING_MAPPING",
        entityType: "SKU",
        entityId: "sku_unmapped",
        title: "Unmapped Listing",
        description: "Amazon ASIN has no internal SKU mapping",
      });

      const investigating = transitionException(exception, {
        nextStatus: "INVESTIGATING",
      });
      assert.equal(investigating.status, "INVESTIGATING");

      const actionRequired = transitionException(investigating, {
        nextStatus: "ACTION_REQUIRED",
      });
      assert.equal(actionRequired.status, "ACTION_REQUIRED");

      const resolving = transitionException(actionRequired, {
        nextStatus: "RESOLVING",
      });
      assert.equal(resolving.status, "RESOLVING");

      const resolved = transitionException(resolving, {
        nextStatus: "RESOLVED",
        actorId: "user_resolver_01",
      });
      assert.equal(resolved.status, "RESOLVED");
      assert.equal(resolved.resolvedBy, "user_resolver_01");
      assert.ok(resolved.resolvedAt);
    });

    it("should reject illegal exception transitions", () => {
      const exception = createDomainException({
        organizationId: "11111111-1111-4111-8111-111111111111",
        type: "RATE_LIMIT",
        entityType: "Channel",
        entityId: "ch_01",
        title: "eBay Rate Limit",
        description: "Backoff required",
      });

      const resolved = transitionException(exception, {
        nextStatus: "RESOLVED",
      });

      // Cannot transition from RESOLVED to INVESTIGATING directly (must be reopened to OPEN first)
      assert.throws(
        () => transitionException(resolved, { nextStatus: "INVESTIGATING" }),
        InvalidStateTransitionError
      );
    });
  });

  describe("9. Trust State Determination", () => {
    it("should determine CONFLICT trust state when active sync job is in CONFLICT", () => {
      const balance = createBaselineBalance({ skuId: "sku_trust_1" });
      const job: SyncJob = {
        id: "job_conflict",
        organizationId: balance.organizationId,
        channelAccountId: "ca_1",
        skuId: "sku_trust_1",
        operation: "UPDATE_INVENTORY",
        targetQuantity: 10,
        status: "CONFLICT",
        attemptCount: 1,
        correlationId: "corr_tr_1",
        queuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      assert.equal(service.determineTrustState(balance, [job]), "CONFLICT");
    });

    it("should determine STALE trust state when active sync job is in FAILED or REQUIRES_ACTION", () => {
      const balance = createBaselineBalance({ skuId: "sku_trust_2" });
      const job: SyncJob = {
        id: "job_stale",
        organizationId: balance.organizationId,
        channelAccountId: "ca_1",
        skuId: "sku_trust_2",
        operation: "UPDATE_INVENTORY",
        targetQuantity: 10,
        status: "FAILED",
        attemptCount: 5,
        correlationId: "corr_tr_2",
        queuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      assert.equal(service.determineTrustState(balance, [job]), "STALE");
    });

    it("should determine VERIFIED trust state when all active sync jobs are VERIFIED", () => {
      const balance = createBaselineBalance({ skuId: "sku_trust_3" });
      const job: SyncJob = {
        id: "job_verified",
        organizationId: balance.organizationId,
        channelAccountId: "ca_1",
        skuId: "sku_trust_3",
        operation: "UPDATE_INVENTORY",
        targetQuantity: 10,
        status: "VERIFIED",
        attemptCount: 1,
        correlationId: "corr_tr_3",
        queuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      assert.equal(service.determineTrustState(balance, [job]), "VERIFIED");
    });
  });
});
