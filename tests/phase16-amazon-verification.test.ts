/**
 * Phase 16: Amazon Verification Acceptance Suite
 * Canonical Specifications: Sections 23, 24, 25, 26, 35, 36, 39, 121, 122, 140 of 01_ENGINEERING_SPEC.md & Prompt 17
 * 
 * Verifies:
 * 1. Outbound Inventory Update Flow:
 *    internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED or CONFLICT.
 * 2. Never represent acknowledgement as verification (acknowledged != verified).
 * 3. Delayed verification & weaker verification state representation with freshness semantics.
 * 4. Conflicting read-back produces CONFLICT (never produce green success state).
 * 5. Read-back timeout handling (must NEVER mark VERIFIED on accepted write if verification timed out).
 * 6. Retry behavior on transient errors (HTTP 503/504) and exhaustion escalation to FAILED.
 * 7. Rate limit handling respecting Amazon SP-API throttling (HTTP 429 RequestThrottled).
 * 8. Authentication failure transitions to REQUIRES_ACTION with domain exception.
 * 9. Section 39 Fulfillment Channel Isolation (direct push to FBA is prohibited).
 * 10. Notification-assisted verification without aggressive polling (SQS / EventBridge).
 * 11. Freshness timestamps (observed_at, received_at, verified_at, displayStatus).
 * 12. Tenant isolation enforcement.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  SyncJobService,
  InMemorySyncJobRepository,
} from "@platform/database";
import {
  SyncEngine,
  AmazonAdapter,
  AmazonVerificationPipeline,
  type VerificationStage,
  type VerificationStageInfo,
} from "@platform/integrations";
import {
  formatFreshnessDisplay,
  evaluateFreshness,
  getVerificationStageInfo,
} from "@platform/contracts";

describe("Phase 16: Amazon Verification Acceptance Suite", () => {
  const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
  const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
  const CHANNEL_ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
  const SKU_ID = "sku_amzn_wireless_headphones";
  const EXTERNAL_SKU = "AMZN-WH-PRO-100";
  const MARKETPLACE_ID = "ATVPDKIKX0DER";
  const SELLER_ID = "A21TJRUUN4KGV";

  let syncJobRepo: InMemorySyncJobRepository;
  let syncJobService: SyncJobService;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncJobRepo = new InMemorySyncJobRepository();
    syncJobService = new SyncJobService(syncJobRepo);
    syncEngine = new SyncEngine(syncJobService);
  });

  /**
   * Helper to construct a controllable AmazonAdapter for deterministic testing.
   */
  function createControllableAmazonAdapter(options: {
    initialQuantity?: number;
    readBackQuantity?: number;
    pushFails?: boolean;
    pushThrottled?: boolean;
    pushAuthFails?: boolean;
    pushValidationFails?: boolean;
    readBackTimesOut?: boolean;
    readBackThrottled?: boolean;
    readBackAuthFails?: boolean;
    fbaQuantity?: number;
  }) {
    let currentQuantity = options.initialQuantity ?? 50;

    const mockFetchFn: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();

      // 1. LWA OAuth Token
      if (urlStr.includes("api.amazon.com/auth/o2/token")) {
        if (options.pushAuthFails || options.readBackAuthFails) {
          return new Response(
            JSON.stringify({ error: "invalid_grant", error_description: "The refresh token is invalid or revoked" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ access_token: "mock_atac_token_12345", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // 2. Sellers API (marketplace participations)
      if (urlStr.includes(`/sellers/v1/marketplaceParticipations`)) {
        return new Response(
          JSON.stringify({
            payload: {
              participations: [
                {
                  marketplace: {
                    id: MARKETPLACE_ID,
                    name: "Amazon.com",
                    countryCode: "US",
                    defaultCurrencyCode: "USD",
                  },
                  participation: { isParticipating: true, hasSuspendedListings: false },
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // 3. FBA Inventory Summaries API
      if (urlStr.includes(`/fba/inventory/v1/summaries`)) {
        return new Response(
          JSON.stringify({
            payload: {
              granularity: { granularityType: "Marketplace", granularityId: MARKETPLACE_ID },
              inventorySummaries: [
                {
                  asin: "B08XYZ1234",
                  sellerSku: EXTERNAL_SKU,
                  fnSku: "X001ABCDEF",
                  inventoryDetails: {
                    fulfillableQuantity: options.fbaQuantity ?? 120,
                    reservedQuantity: { totalReservedQuantity: 5 },
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // 4. Listings Items PATCH (Outbound inventory update)
      if (init?.method === "PATCH" && urlStr.includes(`/listings/2021-08-01/items`)) {
        if (options.pushFails) {
          return new Response(
            JSON.stringify({ errors: [{ code: "ServiceUnavailable", message: "Amazon Listings service temporarily unavailable" }] }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }

        if (options.pushThrottled) {
          return new Response(
            JSON.stringify({ errors: [{ code: "RequestThrottled", message: "Request rate limit exceeded" }] }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "x-amzn-RateLimit-Limit": "1.0",
                "Retry-After": "2",
              },
            }
          );
        }

        if (options.pushAuthFails) {
          return new Response(
            JSON.stringify({ errors: [{ code: "Unauthorized", message: "Access token expired or unauthorized" }] }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }

        if (options.pushValidationFails) {
          return new Response(
            JSON.stringify({
              sku: EXTERNAL_SKU,
              status: "INVALID",
              submissionId: "feed-sub-invalid",
              issues: [{ message: "SKU not found or invalid attribute", severity: "ERROR" }],
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const body = JSON.parse(String(init.body || "{}"));
        const patch = body.patches?.[0];
        const requestedQty = patch?.value?.[0]?.quantity ?? 0;

        if (options.readBackQuantity !== undefined) {
          currentQuantity = options.readBackQuantity;
        } else {
          currentQuantity = requestedQty;
        }

        return new Response(
          JSON.stringify({
            sku: EXTERNAL_SKU,
            status: "ACCEPTED",
            submissionId: "amzn_sub_998877",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // 5. Listings Items GET (Read-back verification)
      if (urlStr.includes(`/listings/2021-08-01/items`)) {
        if (options.readBackTimesOut) {
          throw new Error("ETIMEDOUT: SP-API timed out during read-back verification");
        }

        if (options.readBackThrottled) {
          return new Response(
            JSON.stringify({ errors: [{ code: "RequestThrottled", message: "Throttled on read-back" }] }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "x-amzn-RateLimit-Limit": "5.0",
                "Retry-After": "3",
              },
            }
          );
        }

        if (options.readBackAuthFails) {
          return new Response(
            JSON.stringify({ errors: [{ code: "Unauthorized", message: "Access denied" }] }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            sku: EXTERNAL_SKU,
            attributes: {
              fulfillment_availability: [
                { fulfillment_channel_code: "DEFAULT", quantity: currentQuantity },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    return new AmazonAdapter(
      {
        sellerId: SELLER_ID,
        marketplaceId: MARKETPLACE_ID,
        clientId: "mock_client_id",
        clientSecret: "mock_client_secret",
        refreshToken: "mock_refresh_token",
        region: "NA",
      },
      { fetchFn: mockFetchFn, maxRetries: 0 }
    );
  }

  // --------------------------------------------------------------------------
  // 1. Outbound Update Flow & State Transitions
  // --------------------------------------------------------------------------
  describe("1. Outbound Update Flow & Canonical Progression", () => {
    it("should execute: internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 10 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const observedStages: VerificationStage[] = [];
      const stageInfos: VerificationStageInfo[] = [];
      const targetQuantity = 42;

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

      // Verify outcome
      assert.equal(outcome.finalState, "VERIFIED");
      assert.equal(outcome.stage, "VERIFIED");
      assert.equal(outcome.isSuccess, true);
      assert.equal(outcome.isConflict, false);
      assert.equal(outcome.isDelayedVerification, false);
      assert.equal(outcome.verifiedQuantity, 42);
      assert.equal(outcome.targetQuantity, 42);
      assert.equal(outcome.submissionId, "amzn_sub_998877");
      assert.equal(outcome.fulfillmentChannel, "SELLER");

      // Verify freshness timestamps
      assert.ok(outcome.observedAt instanceof Date);
      assert.ok(outcome.receivedAt instanceof Date);
      assert.ok(outcome.verifiedAt instanceof Date);
      assert.equal(outcome.isStale, false);

      // Verify persisted job record in database
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
  // 2. Never Represent Acknowledgement as Verification
  // --------------------------------------------------------------------------
  describe("2. Never Represent Acknowledgement as Verification Invariant", () => {
    it("MUST NOT represent acknowledgement as verification (acknowledged != verified)", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 10 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      let acknowledgedStageInfo: VerificationStageInfo | undefined;

      await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 50,
        onStageChange: (stage, info) => {
          if (stage === "REQUEST_ACKNOWLEDGED") {
            acknowledgedStageInfo = info;
          }
        },
      });

      assert.ok(acknowledgedStageInfo, "Must have passed through REQUEST_ACKNOWLEDGED");
      assert.equal(acknowledgedStageInfo.isSuccess, false, "REQUEST_ACKNOWLEDGED must NOT be treated as success");
      assert.equal(acknowledgedStageInfo.isTerminal, false, "REQUEST_ACKNOWLEDGED must NOT be terminal");
      assert.equal(acknowledgedStageInfo.trustState, "UNKNOWN", "Trust state must not be VERIFIED at acknowledgement");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Delayed Verification & Weaker Verification State
  // --------------------------------------------------------------------------
  describe("3. Delayed Verification & Weaker Verification State", () => {
    it("should explicitly represent the weaker verification state and freshness semantics when delayed", async () => {
      // Scenario: Target quantity is 75, but Amazon read-back still reports previous quantity 10 during propagation delay
      const adapter = createControllableAmazonAdapter({
        initialQuantity: 10,
        readBackQuantity: 10, // Amazon hasn't propagated update yet
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const observedStages: VerificationStage[] = [];

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 75,
        allowDelayedVerification: true, // Amazon asynchronous propagation mode enabled
        onStageChange: (stage) => {
          observedStages.push(stage);
        },
      });

      // Must be represented as VERIFICATION_PENDING, NOT VERIFIED and NOT CONFLICT
      assert.equal(outcome.finalState, "VERIFYING");
      assert.equal(outcome.stage, "VERIFICATION_PENDING");
      assert.equal(outcome.isDelayedVerification, true);
      assert.equal(outcome.isSuccess, false, "NEVER mark success while unverified!");
      assert.equal(outcome.isConflict, false);
      assert.equal(outcome.verifiedAt, null, "verifiedAt must be null in weaker verification state");
      assert.match(outcome.freshness.displayStatus, /verification pending propagation/);

      // Verify progression sequence
      assert.deepEqual(observedStages, [
        "REQUEST_SUBMITTED",
        "REQUEST_ACKNOWLEDGED",
        "VERIFICATION_PENDING",
        "VERIFICATION_PENDING",
      ]);

      // Job record remains in VERIFYING state, not prematurely marked VERIFIED
      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "VERIFYING");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Quantity Mismatch Scenario (CONFLICT Invariant)
  // --------------------------------------------------------------------------
  describe("4. Conflicting Read-Back (CONFLICT Invariant)", () => {
    it("MUST produce CONFLICT if Amazon reports a different quantity (NEVER produce green success)", async () => {
      // Scenario: Target is 60, but Amazon read-back reports 45
      const adapter = createControllableAmazonAdapter({
        readBackQuantity: 45,
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const observedStages: VerificationStage[] = [];

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 60,
        allowDelayedVerification: false,
        onStageChange: (stage) => {
          observedStages.push(stage);
        },
      });

      // Verify progression to CONFLICT
      assert.deepEqual(observedStages, [
        "REQUEST_SUBMITTED",
        "REQUEST_ACKNOWLEDGED",
        "VERIFICATION_PENDING",
        "CONFLICT",
      ]);

      // CRITICAL GATE ASSERTIONS:
      assert.equal(outcome.finalState, "CONFLICT");
      assert.equal(outcome.stage, "CONFLICT");
      assert.equal(outcome.isConflict, true);
      assert.equal(outcome.isSuccess, false, "CRITICAL: isSuccess MUST be false on conflict!");
      assert.equal(outcome.stageInfo.isSuccess, false);
      assert.equal(outcome.stageInfo.trustState, "CONFLICT");
      assert.equal(outcome.verifiedQuantity, 45);
      assert.equal(outcome.targetQuantity, 60);

      // Verify error classification
      assert.ok(outcome.error);
      assert.equal(outcome.error.classification, "CONFLICT");
      assert.equal(outcome.error.code, "QUANTITY_MISMATCH_CONFLICT");
      assert.match(outcome.error.message, /target quantity 60/);
      assert.match(outcome.error.message, /actual 45/);

      // Verify persisted job record in database
      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "CONFLICT");
      assert.equal(persistedJob.last_error_code, "QUANTITY_MISMATCH_CONFLICT");

      // Verify domain exception recorded for operator resolution
      const exceptions = await syncJobRepo.getExceptions(ORG_A_ID);
      assert.ok(exceptions.length >= 1);
      const conflictEx = exceptions.find((e) => e.entityId === outcome.jobId);
      assert.ok(conflictEx);
      assert.equal(conflictEx.type, "SYNC_FAILURE");
      assert.match(conflictEx.title, /CONFLICT/);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Read-Back Timeout Scenario
  // --------------------------------------------------------------------------
  describe("5. Read-Back Timeout Scenario", () => {
    it("MUST NOT mark VERIFIED when provider accepted write but verification timed out", async () => {
      const adapter = createControllableAmazonAdapter({
        readBackTimesOut: true,
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 30,
        maxAttempts: 3,
      });

      // Must NOT be verified!
      assert.notEqual(outcome.finalState, "VERIFIED");
      assert.notEqual(outcome.stage, "VERIFIED");
      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.stage, "VERIFICATION_PENDING");

      // Persisted job should be RETRYING with attempt count 1
      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "RETRYING");
      assert.equal(persistedJob.attempt_count, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Retry & Transient Failure Handling
  // --------------------------------------------------------------------------
  describe("6. Retry Behavior & Transient Failures", () => {
    it("should transition to RETRYING on HTTP 503 Service Unavailable during push", async () => {
      const adapter = createControllableAmazonAdapter({
        pushFails: true,
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 20,
        maxAttempts: 3,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.stage, "VERIFICATION_PENDING");
      assert.equal(outcome.error?.classification, "TRANSIENT");

      const persistedJob = await syncJobService.getSyncJob(ORG_A_ID, outcome.jobId);
      assert.ok(persistedJob);
      assert.equal(persistedJob.status, "RETRYING");
      assert.equal(persistedJob.attempt_count, 1);
    });

    it("should escalate to FAILED when retry limit (maxAttempts: 1) is exhausted", async () => {
      const adapter = createControllableAmazonAdapter({
        pushFails: true,
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 20,
        maxAttempts: 1, // Only 1 attempt allowed
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "FAILED");
      assert.equal(outcome.stage, "FAILED");
      assert.ok(outcome.stageInfo.isTerminal);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Rate Limit & Throttling Behavior
  // --------------------------------------------------------------------------
  describe("7. Rate Limit & Throttling Behavior (HTTP 429)", () => {
    it("should respect Amazon SP-API throttling, classify as RATE_LIMIT, and transition to RETRYING", async () => {
      const adapter = createControllableAmazonAdapter({
        pushThrottled: true,
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 25,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.stage, "VERIFICATION_PENDING");
      assert.equal(outcome.error?.classification, "RATE_LIMIT");
      assert.equal(outcome.error?.code, "RATE_LIMIT_EXCEEDED");
      assert.equal(outcome.error?.suggestedDelayMs, 2000); // Parsed from Retry-After: 2 header
    });
  });

  // --------------------------------------------------------------------------
  // 8. Authentication Failure Handling
  // --------------------------------------------------------------------------
  describe("8. Authentication Failure Handling (REQUIRES_ACTION)", () => {
    it("should transition to REQUIRES_ACTION when Amazon SP-API returns 401 Unauthorized", async () => {
      const adapter = createControllableAmazonAdapter({
        pushAuthFails: true,
      });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 15,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "REQUIRES_ACTION");
      assert.equal(outcome.stage, "FAILED");
      assert.equal(outcome.error?.classification, "AUTHENTICATION");

      // Verify domain exception recorded with recommended action
      const exceptions = await syncJobRepo.getExceptions(ORG_A_ID);
      const authEx = exceptions.find((e) => e.entityId === outcome.jobId);
      assert.ok(authEx);
      assert.equal(authEx.type, "SYNC_FAILURE");
      assert.match(authEx.recommendedAction?.action || "", /refresh channel API credentials/);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Section 39 Fulfillment Channel Isolation
  // --------------------------------------------------------------------------
  describe("9. Section 39 Fulfillment Channel Isolation (FBA vs MFN)", () => {
    it("MUST prohibit direct merchant push to FBA inventory and transition to REQUIRES_ACTION", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 100 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 100,
        fulfillmentChannel: "FBA", // Forbidden target for direct merchant push!
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "REQUIRES_ACTION");
      assert.equal(outcome.stage, "FAILED");
      assert.equal(outcome.error?.classification, "VALIDATION");
      assert.equal(outcome.error?.code, "FBA_DIRECT_PUSH_RESTRICTED");
      assert.match(outcome.error?.message || "", /Section 39 Fulfillment Channel Isolation/);

      // Verify domain exception created
      const exceptions = await syncJobRepo.getExceptions(ORG_A_ID);
      const fbaEx = exceptions.find((e) => e.entityId === outcome.jobId);
      assert.ok(fbaEx);
      assert.match(fbaEx.recommendedAction?.action || "", /FBA stock is managed exclusively via Amazon Inbound Shipments/);
    });

    it("should allow read-back inspection of FBA inventory summaries independently", async () => {
      const adapter = createControllableAmazonAdapter({ fbaQuantity: 150 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const res = await pipeline.verifyCurrentInventory(EXTERNAL_SKU, 150, { fulfillmentChannel: "FBA" });
      assert.equal(res.isVerified, true);
      assert.equal(res.status, "VERIFIED");
      assert.equal(res.actualQuantity, 150);
      assert.equal(res.expectedQuantity, 150);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Notification-Assisted Verification (Avoiding Aggressive Polling)
  // --------------------------------------------------------------------------
  describe("10. Notification-Assisted Verification", () => {
    it("should verify target inventory upon receiving LISTINGS_ITEM_STATUS_CHANGE notification matching target", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 10 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      // Create an existing acknowledged job
      const enqueueRes = await syncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        operation: "UPDATE_INVENTORY",
        targetQuantity: 88,
      });

      await syncJobService.transition({ organizationId: ORG_A_ID, jobId: enqueueRes.job.id, nextState: "PROCESSING" });
      await syncJobService.transition({ organizationId: ORG_A_ID, jobId: enqueueRes.job.id, nextState: "SENT" });
      await syncJobService.transition({ organizationId: ORG_A_ID, jobId: enqueueRes.job.id, nextState: "ACKNOWLEDGED" });

      // Incoming SQS notification from Amazon EventBridge
      const notifPayload = {
        NotificationType: "LISTINGS_ITEM_STATUS_CHANGE",
        PayloadVersion: "1.0",
        EventTime: new Date().toISOString(),
        Payload: {
          sellerId: SELLER_ID,
          marketplaceId: MARKETPLACE_ID,
          sku: EXTERNAL_SKU,
          status: "BUYABLE",
          quantity: 88, // Matches target!
        },
      };

      const result = await pipeline.verifyViaNotification({
        organizationId: ORG_A_ID,
        jobId: enqueueRes.job.id,
        notification: notifPayload,
        targetQuantity: 88,
      });

      assert.equal(result.isVerified, true);
      assert.equal(result.isConflict, false);
      assert.equal(result.stage, "VERIFIED");
      assert.equal(result.finalState, "VERIFIED");
      assert.equal(result.notifiedQuantity, 88);

      const persisted = await syncJobService.getSyncJob(ORG_A_ID, enqueueRes.job.id);
      assert.equal(persisted?.status, "VERIFIED");
    });

    it("should produce CONFLICT upon receiving notification with mismatched quantity", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 10 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const enqueueRes = await syncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        operation: "UPDATE_INVENTORY",
        targetQuantity: 88,
      });

      await syncJobService.transition({ organizationId: ORG_A_ID, jobId: enqueueRes.job.id, nextState: "PROCESSING" });
      await syncJobService.transition({ organizationId: ORG_A_ID, jobId: enqueueRes.job.id, nextState: "SENT" });
      await syncJobService.transition({ organizationId: ORG_A_ID, jobId: enqueueRes.job.id, nextState: "ACKNOWLEDGED" });

      // Mismatched notification
      const notifPayload = {
        NotificationType: "LISTINGS_ITEM_STATUS_CHANGE",
        PayloadVersion: "1.0",
        EventTime: new Date().toISOString(),
        Payload: {
          sellerId: SELLER_ID,
          marketplaceId: MARKETPLACE_ID,
          sku: EXTERNAL_SKU,
          status: "BUYABLE",
          quantity: 70, // Differs from 88!
        },
      };

      const result = await pipeline.verifyViaNotification({
        organizationId: ORG_A_ID,
        jobId: enqueueRes.job.id,
        notification: notifPayload,
        targetQuantity: 88,
      });

      assert.equal(result.isVerified, false);
      assert.equal(result.isConflict, true);
      assert.equal(result.stage, "CONFLICT");
      assert.equal(result.finalState, "CONFLICT");
      assert.equal(result.notifiedQuantity, 70);

      const persisted = await syncJobService.getSyncJob(ORG_A_ID, enqueueRes.job.id);
      assert.equal(persisted?.status, "CONFLICT");
    });

    it("awaitNotificationOrReadBack should verify via notification if resolved in time", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 20 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const notificationPromise = Promise.resolve({
        id: "notif_evt_123",
        provider: "AMAZON" as const,
        topic: "LISTINGS_ITEM_STATUS_CHANGE",
        eventType: "INVENTORY_CHANGED" as const,
        payload: {
          sellerSku: EXTERNAL_SKU,
          quantity: 55,
        },
        receivedAt: new Date(),
      });

      const outcome = await pipeline.awaitNotificationOrReadBack(
        {
          organizationId: ORG_A_ID,
          channelAccountId: CHANNEL_ACCOUNT_ID,
          skuId: SKU_ID,
          externalSkuId: EXTERNAL_SKU,
          targetQuantity: 55,
        },
        { notificationPromise, timeoutMs: 500 }
      );

      assert.equal(outcome.isSuccess, true);
      assert.equal(outcome.finalState, "VERIFIED");
      assert.equal(outcome.verifiedQuantity, 55);
    });
  });

  // --------------------------------------------------------------------------
  // 11. Freshness Timestamps & Human-Readable Display
  // --------------------------------------------------------------------------
  describe("11. Freshness Timestamps & Display", () => {
    it("should capture and propagate explicit freshness timestamps matching Section 121", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 30 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const before = new Date(Date.now() - 100);
      const outcome = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 30,
      });
      const after = new Date(Date.now() + 100);

      assert.ok(outcome.observedAt);
      assert.ok(outcome.receivedAt);
      assert.ok(outcome.verifiedAt);
      assert.ok(outcome.observedAt.getTime() >= before.getTime());
      assert.ok(outcome.observedAt.getTime() <= after.getTime());
      assert.equal(outcome.freshness.isStale, false);
      assert.match(outcome.freshness.displayStatus, /seconds ago/);
    });

    it("should format canonical human-readable freshness strings matching Section 121 specifications", () => {
      const now = new Date("2026-09-30T12:00:00.000Z");

      const t42s = new Date("2026-09-30T11:59:18.000Z");
      assert.equal(formatFreshnessDisplay(t42s, now, "verified"), "Last verified 42 seconds ago.");

      const t3m = new Date("2026-09-30T11:57:00.000Z");
      assert.equal(formatFreshnessDisplay(t3m, now, "observed"), "Observed 3 minutes ago.");

      const t2h = new Date("2026-09-30T10:00:00.000Z");
      assert.equal(formatFreshnessDisplay(t2h, now, "observed"), "Observed 2 hours ago.");

      const t1d = new Date("2026-09-29T12:00:00.000Z");
      assert.equal(formatFreshnessDisplay(t1d, now, "observed"), "Observed 1 day ago.");
    });
  });

  // --------------------------------------------------------------------------
  // 12. Tenant Isolation Enforcement
  // --------------------------------------------------------------------------
  describe("12. Tenant Isolation Enforcement", () => {
    it("should prevent Organization B from accessing or executing Organization A's Amazon sync job", async () => {
      const adapter = createControllableAmazonAdapter({ initialQuantity: 20 });
      const pipeline = new AmazonVerificationPipeline(syncEngine, adapter, syncJobService);

      const outcomeA = await pipeline.syncAndVerify({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_ID,
        externalSkuId: EXTERNAL_SKU,
        targetQuantity: 20,
      });

      assert.equal(outcomeA.isSuccess, true);

      // Org B attempts to retrieve Org A's job
      await assert.rejects(
        () => syncJobService.getSyncJob(ORG_B_ID, outcomeA.jobId),
        /Tenant isolation violation: Access denied/
      );

      // Org B attempts to execute Org A's job ID
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
