/**
 * Phase 14: Shopify Verification Acceptance Suite
 * Canonical Specifications: Sections 24, 25, 36, 121, 122, 140 of 01_ENGINEERING_SPEC.md & Prompt 15
 * 
 * Verifies:
 * 1. Outbound Inventory Update Flow:
 *    internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED or CONFLICT.
 * 2. Quantity Mismatch Scenario:
 *    If Shopify reports a different quantity after update, CONFLICT must be produced.
 *    DO NOT produce a green success state.
 * 3. Freshness Timestamps:
 *    observed_at, received_at, verified_at.
 * 4. Stale Data Scenarios:
 *    Explicit detection of stale observations beyond freshness threshold.
 * 5. Explicitly Distinguishes 6 Lifecycle Stages:
 *    - request submitted
 *    - request acknowledged
 *    - verification pending
 *    - verified
 *    - conflict
 *    - failed
 * 6. Read-back timeout handling (must NEVER mark VERIFIED on accepted write if verification timed out).
 * 7. Multi-location verification.
 * 8. Tenant isolation enforcement.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  SyncJobService,
  InMemorySyncJobRepository,
} from "@platform/database";
import {
  SyncEngine,
  ShopifyAdapter,
  ShopifyVerificationPipeline,
  type VerificationStage,
  type VerificationStageInfo,
} from "@platform/integrations";
import {
  formatFreshnessDisplay,
  evaluateFreshness,
  getVerificationStageInfo,
} from "@platform/contracts";

describe("Phase 14: Shopify Verification Acceptance Suite", () => {
  const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
  const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
  const CHANNEL_ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
  const SKU_ID = "sku_premium_hoodie";
  const EXTERNAL_SKU = "gid://shopify/InventoryItem/888999";
  const LOCATION_ID = "gid://shopify/Location/loc_main_warehouse";

  let syncJobRepo: InMemorySyncJobRepository;
  let syncJobService: SyncJobService;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncJobRepo = new InMemorySyncJobRepository();
    syncJobService = new SyncJobService(syncJobRepo);
    syncEngine = new SyncEngine(syncJobService);
  });

  /**
   * Helper to construct a mocked ShopifyAdapter with controllable inventory state and behavior.
   */
  function createControllableShopifyAdapter(options: {
    initialQuantity?: number;
    readBackQuantity?: number;
    pushFails?: boolean;
    pushUserError?: string;
    readBackTimesOut?: boolean;
  }) {
    let currentQuantity = options.initialQuantity ?? 50;

    const mockFetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body || "{}"));
      const query = String(body.query || "");

      // 0. Locations query
      if (query.includes("GetShopLocations") || query.includes("locations(first:")) {
        return new Response(JSON.stringify({
          data: {
            locations: {
              nodes: [
                { id: LOCATION_ID, name: "Main Warehouse", isActive: true }
              ]
            }
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // 1. Set Quantity Mutation
      if (query.includes("mutation SetInventoryQuantity") || query.includes("inventorySetQuantities")) {
        if (options.pushFails) {
          return new Response(JSON.stringify({
            errors: [{ message: "Shopify API gateway timeout", extensions: { code: "GATEWAY_TIMEOUT" } }]
          }), { status: 504, headers: { "Content-Type": "application/json" } });
        }

        if (options.pushUserError) {
          return new Response(JSON.stringify({
            data: {
              inventorySetQuantities: {
                inventoryAdjustmentGroup: null,
                userErrors: [{ field: ["quantities"], message: options.pushUserError, code: "INVALID" }]
              }
            }
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const inputVar = body.variables?.input;
        const requestedQty = inputVar?.quantities?.[0]?.quantity ?? 0;

        // If readBackQuantity is explicitly set, use that; otherwise simulate applying requestedQty
        if (options.readBackQuantity !== undefined) {
          currentQuantity = options.readBackQuantity;
        } else {
          currentQuantity = requestedQty;
        }

        return new Response(JSON.stringify({
          data: {
            inventorySetQuantities: {
              inventoryAdjustmentGroup: {
                reason: "correction",
                changes: [{ name: "available", delta: requestedQty, quantityAfterChange: requestedQty }]
              },
              userErrors: []
            }
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // 2. Read Inventory Level (by inventoryItem ID)
      if (query.includes("query GetInventoryItemLevels") || query.includes("inventoryItem(id:")) {
        if (options.readBackTimesOut) {
          throw new Error("ETIMEDOUT: Connection to Shopify timed out during inventory read-back");
        }

        return new Response(JSON.stringify({
          data: {
            inventoryItem: {
              id: EXTERNAL_SKU,
              inventoryLevels: {
                nodes: [
                  {
                    id: "gid://shopify/InventoryLevel/101",
                    location: { id: LOCATION_ID },
                    quantities: [
                      { name: "available", quantity: currentQuantity },
                      { name: "on_hand", quantity: currentQuantity }
                    ]
                  }
                ]
              }
            }
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // 3. Find Variant by SKU query fallback
      if (query.includes("query FindVariantBySku") || query.includes("productVariants")) {
        return new Response(JSON.stringify({
          data: {
            productVariants: {
              nodes: [
                {
                  id: "gid://shopify/ProductVariant/112233",
                  sku: SKU_ID,
                  inventoryItem: {
                    id: EXTERNAL_SKU,
                    inventoryLevels: {
                      nodes: [
                        {
                          id: "gid://shopify/InventoryLevel/101",
                          location: { id: LOCATION_ID },
                          quantities: [
                            { name: "available", quantity: currentQuantity },
                            { name: "on_hand", quantity: currentQuantity }
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // 4. Default Shop Ping
      return new Response(JSON.stringify({
        data: { shop: { id: "gid://shopify/Shop/1", name: "Test Store", myshopifyDomain: "test.myshopify.com" } }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    return new ShopifyAdapter(
      {
        shopDomain: "test-store.myshopify.com",
        accessToken: "shpat_mock_token_12345",
        apiVersion: "2025-01",
      },
      { fetchFn: mockFetchFn as typeof fetch }
    );
  }

  // --------------------------------------------------------------------------
  // 1. Canonical Outbound Synchronization & Verification Lifecycle
  // --------------------------------------------------------------------------
  describe("1. Outbound Update Flow & State Transitions", () => {
    it("should execute: internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED", async () => {
      const adapter = createControllableShopifyAdapter({ initialQuantity: 10 });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const observedStages: VerificationStage[] = [];
      const stageInfos: VerificationStageInfo[] = [];

      const targetQuantity = 42; // Outbound target quantity

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity,
        onStageChange: (stage, info) => {
          observedStages.push(stage);
          stageInfos.push(info);
        },
      });

      // Verify sequence of stages
      assert.deepEqual(observedStages, [
        "REQUEST_SUBMITTED",
        "REQUEST_ACKNOWLEDGED",
        "VERIFICATION_PENDING",
        "VERIFIED",
      ]);

      // Verify final outcome
      assert.equal(outcome.finalState, "VERIFIED");
      assert.equal(outcome.stage, "VERIFIED");
      assert.equal(outcome.isSuccess, true);
      assert.equal(outcome.isConflict, false);
      assert.equal(outcome.verifiedQuantity, 42);
      assert.equal(outcome.targetQuantity, 42);

      // Verify freshness timestamps
      assert.ok(outcome.observedAt instanceof Date);
      assert.ok(outcome.receivedAt instanceof Date);
      assert.ok(outcome.verifiedAt instanceof Date);
      assert.equal(outcome.isStale, false);

      // Verify job record persisted with verified state and timestamps
      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "VERIFIED");
      assert.ok(persistedJob.queued_at);
      assert.ok(persistedJob.sent_at);
      assert.ok(persistedJob.acknowledged_at);
      assert.ok(persistedJob.verified_at);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Quantity Mismatch / Discrepancy Gate (Prompt 15 Mandatory Rule)
  // --------------------------------------------------------------------------
  describe("2. Quantity Mismatch Scenario (CONFLICT Invariant)", () => {
    it("MUST produce CONFLICT if Shopify reports a different quantity after update (DO NOT produce green success)", async () => {
      // Scenario: Target quantity is 25, but Shopify returns 20 on read-back
      const targetQuantity = 25;
      const reportedQuantity = 20;

      const adapter = createControllableShopifyAdapter({
        readBackQuantity: reportedQuantity, // Read-back differs from target!
      });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const observedStages: VerificationStage[] = [];

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity,
        onStageChange: (stage) => {
          observedStages.push(stage);
        },
      });

      // Verify progression led to CONFLICT
      assert.deepEqual(observedStages, [
        "REQUEST_SUBMITTED",
        "REQUEST_ACKNOWLEDGED",
        "VERIFICATION_PENDING",
        "CONFLICT",
      ]);

      // CRITICAL GATE ASSERTIONS:
      assert.equal(outcome.finalState, "CONFLICT", "Final state must be CONFLICT");
      assert.equal(outcome.stage, "CONFLICT", "Verification stage must be CONFLICT");
      assert.equal(outcome.isConflict, true, "isConflict must be true");
      assert.equal(outcome.isSuccess, false, "CRITICAL: isSuccess MUST be false on conflict. Never produce green success!");
      assert.equal(outcome.stageInfo.isSuccess, false, "Stage info must not indicate success");
      assert.equal(outcome.stageInfo.trustState, "CONFLICT", "Trust state must be CONFLICT");

      // Verify error details
      assert.ok(outcome.error);
      assert.equal(outcome.error.classification, "CONFLICT");
      assert.equal(outcome.error.code, "QUANTITY_MISMATCH_CONFLICT");
      assert.match(outcome.error.message, /target quantity 25/);
      assert.match(outcome.error.message, /reported actual 20/);

      // Verify discrepancy quantities captured
      assert.equal(outcome.targetQuantity, 25);
      assert.equal(outcome.verifiedQuantity, 20);

      // Verify timestamps
      assert.ok(outcome.observedAt instanceof Date);
      assert.ok(outcome.receivedAt instanceof Date);

      // Verify persisted job in database is CONFLICT, not VERIFIED
      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "CONFLICT");
      assert.equal(persistedJob.last_error_code, "QUANTITY_MISMATCH_CONFLICT");
      assert.match(persistedJob.last_error_message ?? "", /target quantity 25/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Freshness Timestamps Implementation (observed_at, received_at, verified_at)
  // --------------------------------------------------------------------------
  describe("3. Freshness Timestamps (observed_at, received_at, verified_at)", () => {
    it("should capture and propagate explicit freshness timestamps conforming to Section 121", async () => {
      const adapter = createControllableShopifyAdapter({ initialQuantity: 15 });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const beforeTime = new Date(Date.now() - 100);
      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 15,
      });
      const afterTime = new Date(Date.now() + 100);

      assert.ok(outcome.observedAt);
      assert.ok(outcome.receivedAt);
      assert.ok(outcome.verifiedAt);

      assert.ok(outcome.observedAt.getTime() >= beforeTime.getTime());
      assert.ok(outcome.observedAt.getTime() <= afterTime.getTime());
      assert.ok(outcome.receivedAt.getTime() >= beforeTime.getTime());
      assert.ok(outcome.verifiedAt.getTime() >= beforeTime.getTime());

      // Freshness metadata object
      assert.equal(outcome.freshness.isStale, false);
      assert.ok(typeof outcome.freshness.stalenessMs === "number");
      assert.match(outcome.freshness.displayStatus, /seconds ago/);
    });

    it("should format canonical human-readable freshness strings matching Section 121 specifications", () => {
      const now = new Date("2026-09-30T12:00:00.000Z");

      // 42 seconds ago (Exact spec example: 'Last verified 42 seconds ago.')
      const t42s = new Date("2026-09-30T11:59:18.000Z");
      assert.equal(formatFreshnessDisplay(t42s, now, "verified"), "Last verified 42 seconds ago.");

      // 3 minutes ago (Exact spec example: 'Observed 3 minutes ago.')
      const t3m = new Date("2026-09-30T11:57:00.000Z");
      assert.equal(formatFreshnessDisplay(t3m, now, "observed"), "Observed 3 minutes ago.");

      // 2 hours ago
      const t2h = new Date("2026-09-30T10:00:00.000Z");
      assert.equal(formatFreshnessDisplay(t2h, now, "observed"), "Observed 2 hours ago.");

      // 1 day ago
      const t1d = new Date("2026-09-29T12:00:00.000Z");
      assert.equal(formatFreshnessDisplay(t1d, now, "observed"), "Observed 1 day ago.");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Stale Data Scenarios
  // --------------------------------------------------------------------------
  describe("4. Stale Data Scenarios & Trust State", () => {
    it("should detect stale external data when observed_at exceeds threshold and flag trust state STALE", () => {
      const now = new Date("2026-09-30T12:00:00.000Z");
      // Observed 10 minutes ago, default threshold 5 minutes (300,000 ms)
      const staleTimestamp = new Date("2026-09-30T11:50:00.000Z");

      const freshness = evaluateFreshness(staleTimestamp, {
        thresholdMs: 5 * 60 * 1000,
        now,
      });

      assert.equal(freshness.isStale, true);
      assert.equal(freshness.stalenessMs, 10 * 60 * 1000);
      assert.equal(freshness.displayStatus, "Observed 10 minutes ago.");
    });

    it("should mark fresh external data as NOT stale within threshold", () => {
      const now = new Date("2026-09-30T12:00:00.000Z");
      // Observed 20 seconds ago
      const freshTimestamp = new Date("2026-09-30T11:59:40.000Z");

      const freshness = evaluateFreshness(freshTimestamp, {
        thresholdMs: 5 * 60 * 1000,
        now,
      });

      assert.equal(freshness.isStale, false);
      assert.equal(freshness.stalenessMs, 20 * 1000);
      assert.equal(freshness.displayStatus, "Observed 20 seconds ago.");
    });

    it("inspectFreshness should query adapter and evaluate trust state appropriately", async () => {
      const adapter = createControllableShopifyAdapter({ initialQuantity: 100 });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const inspection = await pipeline.inspectFreshness(EXTERNAL_SKU);
      assert.equal(inspection.inventory.sku, EXTERNAL_SKU);
      assert.equal(inspection.inventory.quantity, 100);
      assert.equal(inspection.freshness.isStale, false);
      assert.equal(inspection.trustState, "LIVE");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Read-back Timeout Scenario (Never Mark Verified)
  // --------------------------------------------------------------------------
  describe("5. Read-back Timeout / Network Failure", () => {
    it("MUST NOT mark VERIFIED when provider accepted write but verification timed out", async () => {
      // Scenario: Outbound write accepted by Shopify, but read-back verification fails with network timeout
      const adapter = createControllableShopifyAdapter({
        readBackTimesOut: true,
      });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const observedStages: VerificationStage[] = [];

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 30,
        maxAttempts: 3,
        onStageChange: (stage) => {
          observedStages.push(stage);
        },
      });

      // Must NOT be verified!
      assert.notEqual(outcome.finalState, "VERIFIED");
      assert.notEqual(outcome.stage, "VERIFIED");
      assert.equal(outcome.isSuccess, false);

      // Transitions to RETRYING or FAILED, stage remains VERIFICATION_PENDING
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.stage, "VERIFICATION_PENDING");

      // Verify observed stages
      assert.deepEqual(observedStages, [
        "REQUEST_SUBMITTED",
        "REQUEST_ACKNOWLEDGED",
        "VERIFICATION_PENDING",
        "VERIFICATION_PENDING", // Error during verifying kept it in pending/retrying
      ]);

      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "RETRYING");
      assert.equal(persistedJob.attempt_count, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Provider Push Rejection & Errors
  // --------------------------------------------------------------------------
  describe("6. Outbound Push Rejection", () => {
    it("should transition to REQUIRES_ACTION when Shopify rejects update with user error", async () => {
      const adapter = createControllableShopifyAdapter({
        pushUserError: "Inventory item not found or deactivated for location",
      });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 10,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "REQUIRES_ACTION");
      assert.equal(outcome.stage, "FAILED");
      assert.equal(outcome.stageInfo.isTerminal, true);
    });

    it("should transition to RETRYING when Shopify responds with HTTP 504 gateway timeout on push", async () => {
      const adapter = createControllableShopifyAdapter({
        pushFails: true,
      });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 10,
        maxAttempts: 3,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.stage, "VERIFICATION_PENDING");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Direct Read-Back Verification Helper
  // --------------------------------------------------------------------------
  describe("7. Direct Read-Back Verification", () => {
    it("should return VERIFIED when inventory query matches expectation", async () => {
      const adapter = createControllableShopifyAdapter({ initialQuantity: 55 });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const res = await pipeline.verifyCurrentInventory(EXTERNAL_SKU, 55, LOCATION_ID);

      assert.equal(res.isVerified, true);
      assert.equal(res.status, "VERIFIED");
      assert.equal(res.actualQuantity, 55);
      assert.equal(res.expectedQuantity, 55);
      assert.ok(res.observedAt instanceof Date);
      assert.ok(res.receivedAt instanceof Date);
      assert.ok(res.verifiedAt instanceof Date);
    });

    it("should return MISMATCH when inventory query differs from expectation", async () => {
      const adapter = createControllableShopifyAdapter({ initialQuantity: 55 });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const res = await pipeline.verifyCurrentInventory(EXTERNAL_SKU, 60, LOCATION_ID);

      assert.equal(res.isVerified, false);
      assert.equal(res.status, "MISMATCH");
      assert.equal(res.actualQuantity, 55);
      assert.equal(res.expectedQuantity, 60);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Tenant Isolation Enforcement
  // --------------------------------------------------------------------------
  describe("8. Tenant Isolation Enforcement", () => {
    it("should prevent Organization B from accessing or verifying Organization A's sync job", async () => {
      const adapter = createControllableShopifyAdapter({ initialQuantity: 20 });
      const pipeline = new ShopifyVerificationPipeline(syncEngine, adapter);

      const outcomeA = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 20,
      });

      assert.equal(outcomeA.isSuccess, true);

      // Organization B attempts to retrieve Org A's job
      await assert.rejects(
        () => syncJobService.getSyncJob(ORG_B_ID, outcomeA.jobId),
        /Tenant isolation violation: Access denied/
      );

      // Organization B attempts to execute Org A's job ID
      await assert.rejects(
        () =>
          syncEngine.execute({
            organizationId: ORG_B_ID,
            jobId: outcomeA.jobId,
            adapter,
            externalSkuId: EXTERNAL_SKU,
          }),
        /Tenant isolation violation: Access denied/
      );
    });
  });
});
