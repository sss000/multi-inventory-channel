import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  InventoryLedgerService,
  InMemoryInventoryLedgerRepository,
  calculateSellableAvailable,
  validateInventoryBalanceConstraints,
} from "@platform/database";
import type {
  InventoryBalanceRow,
  InventoryEventRow,
} from "@platform/database";
import {
  InsufficientInventoryError,
  InventoryInvariantError,
} from "@platform/domain";

describe("Phase 7: Inventory Ledger Acceptance Suite", () => {
  let repository: InMemoryInventoryLedgerRepository;
  let ledgerService: InventoryLedgerService;

  const orgId = "11111111-1111-4111-8111-111111111111";
  const skuId = "sku_widget_blue";
  const warehouseA = "wh_east_coast";
  const warehouseB = "wh_west_coast";

  beforeEach(() => {
    repository = new InMemoryInventoryLedgerRepository();
    ledgerService = new InventoryLedgerService(repository);
  });

  describe("1. Canonical Available Quantity Derivation & Storage Invariant", () => {
    it("should accurately compute available quantity dynamically without storing it independently", async () => {
      const { balance, available } = await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 150,
        safetyStock: 10,
        correlationId: "corr_init",
      });

      // Assert on_hand = 150, safetyStock = 10 -> available = 140
      assert.equal(balance.on_hand, 150);
      assert.equal(balance.safety_stock, 10);
      assert.equal(available, 140);

      // Verify row in database does NOT have an independently stored 'available' column
      const rawStored = (await repository.getBalance(orgId, skuId, warehouseA)) as Record<string, unknown>;
      assert.equal(rawStored["available"], undefined, "Table schema must NOT store available as a mutable column");
      assert.equal(calculateSellableAvailable(balance), 140);
    });

    it("should compute available = on_hand - reserved - safety_stock - damaged - quarantined - allocated", () => {
      const sampleRow: Pick<
        InventoryBalanceRow,
        "on_hand" | "reserved" | "safety_stock" | "damaged" | "quarantined" | "allocated"
      > = {
        on_hand: 500,
        reserved: 50,
        safety_stock: 20,
        damaged: 10,
        quarantined: 15,
        allocated: 25,
      };

      // 500 - 50 - 20 - 10 - 15 - 25 = 380
      const available = calculateSellableAvailable(sampleRow);
      assert.equal(available, 380);
    });
  });

  describe("2. Inventory Event Ledger Creation & Metadata", () => {
    it("should record immutable event containing before, after, delta, source, and correlation ID", async () => {
      const importRes = await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 100,
        correlationId: "corr_01",
        actorId: "user_importer",
      });

      const event = importRes.event;
      assert.equal(event.event_type, "INITIAL_IMPORT");
      assert.equal(event.quantity_delta, 100);
      assert.equal(event.source_type, "SYSTEM");
      assert.equal(event.actor_id, "user_importer");
      assert.equal(event.correlation_id, "corr_01");
      assert.ok(event.created_at);
      assert.deepEqual(event.before_state, {});
      assert.equal((event.after_state as any).on_hand, 100);
    });
  });

  describe("3. Canonical Mutation Operations", () => {
    it("1. initial_import: should ingest baseline inventory and set version to 1", async () => {
      const res = await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 75,
        safetyStock: 5,
        correlationId: "corr_imp",
      });

      assert.equal(res.balance.on_hand, 75);
      assert.equal(res.balance.version, 1);
      assert.equal(res.available, 70);
      assert.equal(res.event.event_type, "INITIAL_IMPORT");
    });

    it("2. purchase_receipt: should increment on_hand and update version", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 50,
        correlationId: "corr_init",
      });

      const receipt = await ledgerService.recordPurchaseReceipt({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantityReceived: 30,
        purchaseOrderId: "po_12345",
        correlationId: "corr_po",
      });

      assert.equal(receipt.balance.on_hand, 80);
      assert.equal(receipt.balance.version, 2);
      assert.equal(receipt.available, 80);
      assert.equal(receipt.event.event_type, "PURCHASE_RECEIPT");
      assert.equal(receipt.event.quantity_delta, 30);
    });

    it("3. manual_adjustment: should adjust on_hand (+ or -) with reason audit", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 50,
        correlationId: "corr_init",
      });

      const adj = await ledgerService.recordManualAdjustment({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantityDelta: -5,
        reason: "Shrinkage / lost item",
        correlationId: "corr_adj",
      });

      assert.equal(adj.balance.on_hand, 45);
      assert.equal(adj.balance.version, 2);
      assert.equal(adj.event.event_type, "MANUAL_ADJUSTMENT");
      assert.equal(adj.event.quantity_delta, -5);
      assert.equal((adj.event.after_state as any).reason, "Shrinkage / lost item");
    });

    it("4. recount: should compute exact delta to match physical count", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 100,
        correlationId: "corr_init",
      });

      const recount = await ledgerService.recordRecount({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        physicalCount: 92,
        reason: "Q3 Physical Cycle Count",
        correlationId: "corr_recount",
      });

      assert.equal(recount.balance.on_hand, 92);
      assert.equal(recount.event.event_type, "RECOUNT");
      assert.equal(recount.event.quantity_delta, -8);
    });

    it("5. damage: should move stock to damaged and reduce available", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 100,
        correlationId: "corr_init",
      });

      const damage = await ledgerService.recordDamage({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantity: 4,
        reason: "Forklift dropped box",
        correlationId: "corr_dam",
      });

      assert.equal(damage.balance.damaged, 4);
      assert.equal(damage.balance.on_hand, 100);
      assert.equal(damage.available, 96); // 100 - 4
      assert.equal(damage.event.event_type, "DAMAGE");
    });

    it("6. warehouse_transfer: should atomically debit source and credit destination", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 100,
        correlationId: "corr_wh_a",
      });

      const transfer = await ledgerService.recordWarehouseTransfer({
        organizationId: orgId,
        skuId,
        sourceWarehouseId: warehouseA,
        destinationWarehouseId: warehouseB,
        quantity: 35,
        reason: "Rebalance West Coast regional fulfillment",
        correlationId: "corr_xfer",
      });

      assert.equal(transfer.sourceBalance.on_hand, 65);
      assert.equal(transfer.destinationBalance.on_hand, 35);
      assert.equal(transfer.sourceEvent.quantity_delta, -35);
      assert.equal(transfer.destinationEvent.quantity_delta, 35);
      assert.equal(transfer.sourceEvent.correlation_id, transfer.destinationEvent.correlation_id);
    });

    it("7. reconciliation_correction: should apply correction delta from channel audit", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 50,
        correlationId: "corr_init",
      });

      const recon = await ledgerService.recordReconciliationCorrection({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantityDelta: 3,
        reason: "Channel reconciliation discrepancy resolution",
        correlationId: "corr_recon",
      });

      assert.equal(recon.balance.on_hand, 53);
      assert.equal(recon.event.event_type, "RECONCILIATION");
      assert.equal(recon.event.quantity_delta, 3);
    });

    it("8. order reservation, release, and fulfillment lifecycle", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 100,
        correlationId: "corr_init",
      });

      // 1. Reserve 20
      const reserved = await ledgerService.reserveInventory({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantity: 20,
        orderId: "ord_999",
        correlationId: "corr_res_1",
      });
      assert.equal(reserved.balance.reserved, 20);
      assert.equal(reserved.available, 80);

      // 2. Fulfill 10 of the reserved
      const fulfilled = await ledgerService.fulfillReservation({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantity: 10,
        orderId: "ord_999",
        correlationId: "corr_ful_1",
      });
      assert.equal(fulfilled.balance.on_hand, 90);
      assert.equal(fulfilled.balance.reserved, 10);
      assert.equal(fulfilled.available, 80);

      // 3. Release remaining 10
      const released = await ledgerService.releaseReservation({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantity: 10,
        orderId: "ord_999",
        correlationId: "corr_rel_1",
      });
      assert.equal(released.balance.reserved, 0);
      assert.equal(released.available, 90);
    });
  });

  describe("4. Non-Negative Constraints and Invariant Protections", () => {
    it("should reject adjustments that reduce on_hand below 0", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 10,
        correlationId: "corr_init",
      });

      await assert.rejects(
        () =>
          ledgerService.recordManualAdjustment({
            organizationId: orgId,
            skuId,
            warehouseId: warehouseA,
            quantityDelta: -15,
            reason: "Excessive decrement",
            correlationId: "corr_bad_adj",
          }),
        InventoryInvariantError
      );
    });

    it("should reject reservations exceeding available inventory", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 10,
        safetyStock: 5,
        correlationId: "corr_init",
      });
      // Available is 5

      await assert.rejects(
        () =>
          ledgerService.reserveInventory({
            organizationId: orgId,
            skuId,
            warehouseId: warehouseA,
            quantity: 6,
            correlationId: "corr_over_reserve",
          }),
        InsufficientInventoryError
      );
    });

    it("should reject transfers exceeding source warehouse available stock", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 20,
        correlationId: "corr_init",
      });

      await assert.rejects(
        () =>
          ledgerService.recordWarehouseTransfer({
            organizationId: orgId,
            skuId,
            sourceWarehouseId: warehouseA,
            destinationWarehouseId: warehouseB,
            quantity: 25,
            correlationId: "corr_over_transfer",
          }),
        InsufficientInventoryError
      );
    });
  });

  describe("5. Idempotency & Deduplication", () => {
    it("should not duplicate inventory mutations when called with the same idempotency key", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        onHand: 50,
        correlationId: "corr_init",
      });

      const idempotencyKey = "idemp_unique_key_001";

      // First call
      const firstRes = await ledgerService.recordPurchaseReceipt({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantityReceived: 20,
        correlationId: "corr_receipt_1",
        idempotencyKey,
      });

      assert.equal(firstRes.balance.on_hand, 70);
      assert.equal(firstRes.isDuplicate, undefined);

      // Duplicate call with exact same idempotency key
      const duplicateRes = await ledgerService.recordPurchaseReceipt({
        organizationId: orgId,
        skuId,
        warehouseId: warehouseA,
        quantityReceived: 20,
        correlationId: "corr_receipt_2",
        idempotencyKey,
      });

      assert.equal(duplicateRes.isDuplicate, true);
      assert.equal(duplicateRes.balance.on_hand, 70, "Stock MUST NOT be incremented a second time");
      assert.equal(duplicateRes.event.id, firstRes.event.id, "Must return existing event");

      // Verify event ledger only contains 2 events (initial import + 1 receipt, NOT 2 receipts)
      const events = await ledgerService.getLedgerAuditEvents(orgId, skuId, warehouseA);
      assert.equal(events.length, 2);
    });
  });

  describe("6. CRITICAL CONCURRENCY RACE TEST (Canonical Prompt 08 Gate)", () => {
    it("Two simultaneous transactions attempt to consume the final available unit: exactly one succeeds, one fails with InsufficientInventoryError, and stock is never oversold", async () => {
      // 1. Setup exact balance with available = 1
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId: "sku_last_unit",
        warehouseId: warehouseA,
        onHand: 1,
        safetyStock: 0,
        correlationId: "corr_init_last_unit",
      });

      const initial = await ledgerService.getBalanceWithAvailable(orgId, "sku_last_unit", warehouseA);
      assert.equal(initial?.available, 1, "Initial available must be exactly 1");

      // 2. Launch two simultaneous transactions attempting to reserve 1 unit concurrently
      const tx1 = ledgerService.reserveInventory({
        organizationId: orgId,
        skuId: "sku_last_unit",
        warehouseId: warehouseA,
        quantity: 1,
        orderId: "order_tx_alpha",
        correlationId: "corr_race_1",
      });

      const tx2 = ledgerService.reserveInventory({
        organizationId: orgId,
        skuId: "sku_last_unit",
        warehouseId: warehouseA,
        quantity: 1,
        orderId: "order_tx_beta",
        correlationId: "corr_race_2",
      });

      // 3. Collect settling results using Promise.allSettled
      const results = await Promise.allSettled([tx1, tx2]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // 4. Assert: Exactly one succeeds
      assert.equal(fulfilled.length, 1, "Exactly one concurrent transaction must succeed");

      // 5. Assert: Exactly one fails
      assert.equal(rejected.length, 1, "Exactly one concurrent transaction must fail");

      // 6. Assert: Failure must be InsufficientInventoryError
      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(
        rejectionReason instanceof InsufficientInventoryError,
        `Expected InsufficientInventoryError, received: ${rejectionReason}`
      );

      // 7. Critical Invariant Check: Final balance must have reserved = 1, available = 0, on_hand = 1 (NEVER OVERSOLD)
      const finalState = await ledgerService.getBalanceWithAvailable(orgId, "sku_last_unit", warehouseA);
      assert.equal(finalState?.balance.on_hand, 1);
      assert.equal(finalState?.balance.reserved, 1);
      assert.equal(finalState?.available, 0, "Available inventory must be exactly 0, never negative");
    });

    it("Ten simultaneous transactions race to consume 3 remaining units: exactly 3 succeed, 7 fail, stock remains 0", async () => {
      await ledgerService.recordInitialImport({
        organizationId: orgId,
        skuId: "sku_high_contention",
        warehouseId: warehouseA,
        onHand: 3,
        correlationId: "corr_contention_init",
      });

      const attempts = Array.from({ length: 10 }, (_, i) =>
        ledgerService.reserveInventory({
          organizationId: orgId,
          skuId: "sku_high_contention",
          warehouseId: warehouseA,
          quantity: 1,
          orderId: `order_contention_${i}`,
          correlationId: `corr_contention_${i}`,
        })
      );

      const results = await Promise.allSettled(attempts);
      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      assert.equal(successes.length, 3, "Only 3 units can be consumed");
      assert.equal(failures.length, 7, "7 racing transactions must be rejected");

      const finalState = await ledgerService.getBalanceWithAvailable(orgId, "sku_high_contention", warehouseA);
      assert.equal(finalState?.balance.reserved, 3);
      assert.equal(finalState?.available, 0);
    });
  });
});
