import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ReservationService,
  InventoryLedgerService,
  InMemoryInventoryLedgerRepository,
  calculateSellableAvailable,
} from "@platform/database";
import type {
  InventoryReservationRow,
  InventoryBalanceRow,
} from "@platform/database";
import {
  InsufficientInventoryError,
  ReservationInvariantError,
  TenantAccessDeniedError,
} from "@platform/domain";

describe("Phase 8: Reservations Acceptance Suite", () => {
  let repository: InMemoryInventoryLedgerRepository;
  let ledgerService: InventoryLedgerService;
  let reservationService: ReservationService;

  const orgA = "11111111-1111-4111-8111-111111111111";
  const orgB = "22222222-2222-4222-8222-222222222222";
  const skuId = "sku_super_widget";
  const warehouseId = "wh_chicago_01";

  beforeEach(async () => {
    repository = new InMemoryInventoryLedgerRepository();
    ledgerService = new InventoryLedgerService(repository);
    reservationService = new ReservationService(repository);

    // Baseline inventory in Org A: 100 on_hand, 0 reserved, 10 safety_stock -> available = 90
    await ledgerService.recordInitialImport({
      organizationId: orgA,
      skuId,
      warehouseId,
      onHand: 100,
      safetyStock: 10,
      correlationId: "corr_seed_a",
    });

    // Baseline inventory in Org B: 50 on_hand -> available = 50
    await ledgerService.recordInitialImport({
      organizationId: orgB,
      skuId,
      warehouseId,
      onHand: 50,
      correlationId: "corr_seed_b",
    });
  });

  describe("1. Reservation Lifecycle & State Transitions", () => {
    it("should create an ACTIVE reservation with all required metadata and update inventory ledger", async () => {
      const res = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 15,
        orderId: "ord_1001",
        correlationId: "corr_res_1",
        actorId: "user_checkout",
      });

      assert.equal(res.reservation.status, "ACTIVE");
      assert.equal(res.reservation.organization_id, orgA);
      assert.equal(res.reservation.sku_id, skuId);
      assert.equal(res.reservation.warehouse_id, warehouseId);
      assert.equal(res.reservation.order_id, "ord_1001");
      assert.equal(res.reservation.quantity, 15);
      assert.ok(res.reservation.created_at);
      assert.equal(res.reservation.released_at, null);
      assert.equal(res.reservation.fulfilled_at, null);

      // Ledger integration check
      assert.equal(res.balance.reserved, 15);
      assert.equal(res.available, 75); // 100 - 15 - 10 safety_stock
      assert.equal(res.event.event_type, "ORDER_RESERVATION");
      assert.equal(res.event.quantity_delta, 15);
      assert.equal(res.event.reservation_id, res.reservation.id);
      assert.equal(res.event.order_id, "ord_1001");
    });

    it("should release an active reservation, restoring available inventory and emitting ORDER_RELEASE", async () => {
      const created = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 20,
        orderId: "ord_1002",
        correlationId: "corr_res_2",
      });
      assert.equal(created.available, 70);

      const released = await reservationService.release({
        organizationId: orgA,
        reservationId: created.reservation.id,
        reason: "Customer cancelled checkout",
        correlationId: "corr_rel_2",
      });

      assert.equal(released.reservation.status, "RELEASED");
      assert.ok(released.reservation.released_at);
      assert.equal(released.balance.reserved, 0);
      assert.equal(released.available, 90); // 100 - 0 - 10 safety_stock
      assert.equal(released.event.event_type, "ORDER_RELEASE");
      assert.equal(released.event.quantity_delta, -20);
    });

    it("should fulfill an active reservation upon shipment, atomically decrementing on_hand and reserved", async () => {
      const created = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 25,
        orderId: "ord_1003",
        correlationId: "corr_res_3",
      });

      const fulfilled = await reservationService.fulfill({
        organizationId: orgA,
        reservationId: created.reservation.id,
        correlationId: "corr_ful_3",
      });

      assert.equal(fulfilled.reservation.status, "FULFILLED");
      assert.ok(fulfilled.reservation.fulfilled_at);
      assert.equal(fulfilled.balance.on_hand, 75); // 100 - 25
      assert.equal(fulfilled.balance.reserved, 0); // Decremented back
      assert.equal(fulfilled.available, 65); // 75 - 0 - 10 safety_stock
      assert.equal(fulfilled.event.event_type, "ORDER_FULFILLMENT");
      assert.equal(fulfilled.event.quantity_delta, -25);
    });

    it("should expire an active reservation when cart TTL expires, restoring available stock", async () => {
      const created = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 10,
        orderId: "ord_cart_abandoned",
        correlationId: "corr_expire_1",
      });
      assert.equal(created.available, 80);

      const expired = await reservationService.expire({
        organizationId: orgA,
        reservationId: created.reservation.id,
        reason: "Checkout session expired after 15 minutes",
        correlationId: "corr_expire_2",
      });

      assert.equal(expired.reservation.status, "EXPIRED");
      assert.ok(expired.reservation.released_at);
      assert.ok(expired.reservation.expired_at);
      assert.equal(expired.balance.reserved, 0);
      assert.equal(expired.available, 90);
      assert.equal(expired.event.event_type, "ORDER_RELEASE");
      assert.equal(expired.event.quantity_delta, -10);
    });

    it("should batch expire stale reservations exceeding TTL threshold", async () => {
      // Create 2 reservations
      const r1 = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 5,
        correlationId: "corr_ttl_1",
      });
      const r2 = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 10,
        correlationId: "corr_ttl_2",
      });

      // Override created_at on r1 to make it stale (> 30 minutes ago)
      const staleDate = new Date(Date.now() - 35 * 60 * 1000).toISOString();
      await repository.saveReservation({
        ...r1.reservation,
        created_at: staleDate,
      });

      // Run expiry for TTL = 30 mins (1800000 ms)
      const expiredList = await reservationService.expireOldReservations(orgA, 30 * 60 * 1000, "corr_cron_sweep");

      assert.equal(expiredList.length, 1);
      assert.equal(expiredList[0]?.reservation.id, r1.reservation.id);
      assert.equal(expiredList[0]?.reservation.status, "EXPIRED");

      // Verify r2 is still ACTIVE
      const activeR2 = await reservationService.getReservation(orgA, r2.reservation.id);
      assert.equal(activeR2?.status, "ACTIVE");
    });

    it("should reject double release, fulfillment, or expiry on non-active reservations", async () => {
      const created = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 5,
        correlationId: "corr_inv_1",
      });

      await reservationService.release({
        organizationId: orgA,
        reservationId: created.reservation.id,
        correlationId: "corr_inv_rel",
      });

      // Attempting second release
      await assert.rejects(
        () =>
          reservationService.release({
            organizationId: orgA,
            reservationId: created.reservation.id,
            correlationId: "corr_inv_rel2",
          }),
        ReservationInvariantError
      );

      // Attempting fulfill on released reservation
      await assert.rejects(
        () =>
          reservationService.fulfill({
            organizationId: orgA,
            reservationId: created.reservation.id,
            correlationId: "corr_inv_ful",
          }),
        ReservationInvariantError
      );

      // Attempting expire on released reservation
      await assert.rejects(
        () =>
          reservationService.expire({
            organizationId: orgA,
            reservationId: created.reservation.id,
            correlationId: "corr_inv_exp",
          }),
        ReservationInvariantError
      );
    });
  });

  describe("2. Insufficient Inventory Protection", () => {
    it("should reject reservation when quantity exceeds available inventory", async () => {
      // Org A available is 90
      await assert.rejects(
        () =>
          reservationService.reserve({
            organizationId: orgA,
            skuId,
            warehouseId,
            quantity: 91,
            correlationId: "corr_excess",
          }),
        InsufficientInventoryError
      );

      // Verify balance was not modified
      const current = await ledgerService.getBalanceWithAvailable(orgA, skuId, warehouseId);
      assert.equal(current?.balance.reserved, 0);
      assert.equal(current?.available, 90);
    });

    it("should reject non-positive reservation quantities", async () => {
      await assert.rejects(
        () =>
          reservationService.reserve({
            organizationId: orgA,
            skuId,
            warehouseId,
            quantity: 0,
            correlationId: "corr_zero",
          }),
        ReservationInvariantError
      );

      await assert.rejects(
        () =>
          reservationService.reserve({
            organizationId: orgA,
            skuId,
            warehouseId,
            quantity: -10,
            correlationId: "corr_neg",
          }),
        ReservationInvariantError
      );
    });
  });

  describe("3. Idempotency & Duplicate Request Protection", () => {
    it("should return identical reservation without creating duplicate records on duplicate idempotency key", async () => {
      const idempotencyKey = "idemp_order_checkout_777";

      // First call
      const first = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 12,
        orderId: "ord_idemp_1",
        correlationId: "corr_call_1",
        idempotencyKey,
      });

      assert.equal(first.reservation.quantity, 12);
      assert.equal(first.isDuplicate, undefined);
      assert.equal(first.available, 78); // 90 - 12

      // Duplicate call
      const second = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 12,
        orderId: "ord_idemp_1",
        correlationId: "corr_call_2",
        idempotencyKey,
      });

      assert.equal(second.isDuplicate, true);
      assert.equal(second.reservation.id, first.reservation.id);
      assert.equal(second.balance.reserved, 12, "Must NOT reserve 24 units!");
      assert.equal(second.available, 78);

      // Verify reservations table only has 1 record
      const allRes = await reservationService.listReservations(orgA);
      assert.equal(allRes.length, 1);
    });
  });

  describe("4. CRITICAL CONCURRENCY TEST (Prompt 09 Gate: One-Unit Reservation Race)", () => {
    it("Two simultaneous transactions attempt to reserve the final available unit: exactly one succeeds, one fails with InsufficientInventoryError, and stock is never oversold", async () => {
      // 1. Setup exact balance in warehouse with available = 1
      await ledgerService.recordInitialImport({
        organizationId: orgA,
        skuId: "sku_single_unit_race",
        warehouseId,
        onHand: 1,
        safetyStock: 0,
        correlationId: "corr_race_setup",
      });

      const start = await ledgerService.getBalanceWithAvailable(orgA, "sku_single_unit_race", warehouseId);
      assert.equal(start?.available, 1);

      // 2. Launch 2 simultaneous reservation requests racing for the same final 1 unit
      const txAlpha = reservationService.reserve({
        organizationId: orgA,
        skuId: "sku_single_unit_race",
        warehouseId,
        quantity: 1,
        orderId: "ord_alpha",
        correlationId: "corr_alpha",
      });

      const txBeta = reservationService.reserve({
        organizationId: orgA,
        skuId: "sku_single_unit_race",
        warehouseId,
        quantity: 1,
        orderId: "ord_beta",
        correlationId: "corr_beta",
      });

      const results = await Promise.allSettled([txAlpha, txBeta]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // 3. Exactly one succeeds, exactly one fails
      assert.equal(fulfilled.length, 1, "Exactly one concurrent reservation must succeed");
      assert.equal(rejected.length, 1, "Exactly one concurrent reservation must fail");

      const error = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(
        error instanceof InsufficientInventoryError,
        `Expected InsufficientInventoryError, got: ${error}`
      );

      // 4. Invariant: Available must be exactly 0, reserved 1, NEVER negative or oversold
      const end = await ledgerService.getBalanceWithAvailable(orgA, "sku_single_unit_race", warehouseId);
      assert.equal(end?.balance.on_hand, 1);
      assert.equal(end?.balance.reserved, 1);
      assert.equal(end?.available, 0);

      // 5. Exactly 1 reservation record created
      const reservations = await reservationService.listReservations(orgA, {
        skuId: "sku_single_unit_race",
      });
      assert.equal(reservations.length, 1);
      assert.equal(reservations[0]?.status, "ACTIVE");
    });

    it("Ten simultaneous transactions race for 4 units: exactly 4 succeed, 6 fail, stock remains 0", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgA,
        skuId: "sku_multi_race",
        warehouseId,
        onHand: 4,
        safetyStock: 0,
        correlationId: "corr_multi_race_setup",
      });

      const racers = Array.from({ length: 10 }, (_, i) =>
        reservationService.reserve({
          organizationId: orgA,
          skuId: "sku_multi_race",
          warehouseId,
          quantity: 1,
          orderId: `ord_racer_${i}`,
          correlationId: `corr_racer_${i}`,
        })
      );

      const results = await Promise.allSettled(racers);
      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      assert.equal(successes.length, 4, "Only 4 units may be reserved");
      assert.equal(failures.length, 6, "Remaining 6 racers must be rejected with InsufficientInventoryError");

      const finalState = await ledgerService.getBalanceWithAvailable(orgA, "sku_multi_race", warehouseId);
      assert.equal(finalState?.balance.reserved, 4);
      assert.equal(finalState?.available, 0);
    });
  });

  describe("5. Tenant Isolation Enforcement", () => {
    it("should prevent Organization B from reserving against Organization A's inventory", async () => {
      // Authenticated as Org B attempting to reserve in Org A
      await assert.rejects(
        () =>
          reservationService.reserve({
            organizationId: orgA,
            skuId,
            warehouseId,
            quantity: 5,
            correlationId: "corr_cross_tenant_1",
            authenticatedOrgId: orgB,
          }),
        TenantAccessDeniedError
      );
    });

    it("should prevent Organization B from viewing or releasing Organization A's reservation", async () => {
      const created = await reservationService.reserve({
        organizationId: orgA,
        skuId,
        warehouseId,
        quantity: 10,
        correlationId: "corr_org_a_res",
        authenticatedOrgId: orgA,
      });

      // Org B attempts to read Org A reservation
      await assert.rejects(
        () => reservationService.getReservation(orgA, created.reservation.id, orgB),
        TenantAccessDeniedError
      );

      // Org B attempts to release Org A reservation
      await assert.rejects(
        () =>
          reservationService.release({
            organizationId: orgA,
            reservationId: created.reservation.id,
            correlationId: "corr_hack_release",
            authenticatedOrgId: orgB,
          }),
        TenantAccessDeniedError
      );

      // Org B attempts to fulfill Org A reservation
      await assert.rejects(
        () =>
          reservationService.fulfill({
            organizationId: orgA,
            reservationId: created.reservation.id,
            correlationId: "corr_hack_fulfill",
            authenticatedOrgId: orgB,
          }),
        TenantAccessDeniedError
      );

      // Org B attempts to expire Org A reservation
      await assert.rejects(
        () =>
          reservationService.expire({
            organizationId: orgA,
            reservationId: created.reservation.id,
            correlationId: "corr_hack_expire",
            authenticatedOrgId: orgB,
          }),
        TenantAccessDeniedError
      );

      // Verify Org A reservation is still intact and ACTIVE
      const intact = await reservationService.getReservation(orgA, created.reservation.id, orgA);
      assert.equal(intact?.status, "ACTIVE");
    });
  });
});
