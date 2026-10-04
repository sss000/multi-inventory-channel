/**
 * Phase 11: Synchronization Framework Acceptance Test Suite
 * Canonical Specification: Sections 23, 24, 25, 26 of 01_ENGINEERING_SPEC.md & Prompt 12 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 *
 * Verifies:
 * 1. Provider-independent synchronization engine.
 * 2. Canonical sync job state machine: QUEUED -> PROCESSING -> SENT -> ACKNOWLEDGED -> VERIFYING -> VERIFIED.
 * 3. Failure states: RETRYING, FAILED, REQUIRES_ACTION, CONFLICT.
 * 4. Error classification: TRANSIENT, RATE_LIMIT, AUTHENTICATION, VALIDATION, NOT_FOUND, CONFLICT, UNKNOWN.
 * 5. Mandatory Verification Invariant: A synchronization job must never be marked VERIFIED solely because an outbound HTTP/API operation succeeded.
 * 6. Explicit failure scenarios:
 *    - timeout
 *    - provider accepted request followed by client timeout
 *    - rate limit
 *    - authentication failure
 *    - validation failure
 *    - conflict
 *    - not found
 * 7. Idempotency deduplication.
 * 8. Tenant isolation enforcement.
 * 9. REST API endpoints and RBAC conformance.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  SyncJobService,
  InMemorySyncJobRepository,
  type SyncJobRow,
} from "@platform/database";

import {
  SyncEngine,
  classifySyncError,
  type ChannelAdapter,
  type PushInventoryResult,
  type VerificationResult,
  type ExternalInventorySnapshot,
} from "@platform/integrations";

import {
  TenantAccessDeniedError,
  InvalidStateTransitionError,
} from "@platform/domain";

import { startApiServer } from "@platform/api";

import { SupabaseAuthAdapter } from "@platform/security";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const CHANNEL_ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
const SKU_A_ID = "sku_001";
const EXTERNAL_SKU_A = "ext_sku_001";

function createMockAuthAdapter() {
  const client = {
    auth: {
      async getUser(token: string) {
        if (token === "token_org_a_owner") {
          return {
            data: {
              user: {
                id: "u-owner-a",
                email: "owner-a@example.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Organization Alpha",
                  slug: "org-alpha",
                  role: "OWNER",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_org_a_viewer") {
          return {
            data: {
              user: {
                id: "u-viewer-a",
                email: "viewer-a@example.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Organization Alpha",
                  slug: "org-alpha",
                  role: "VIEWER",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_org_b_owner") {
          return {
            data: {
              user: {
                id: "u-owner-b",
                email: "owner-b@example.com",
                user_metadata: {
                  organization_id: ORG_B_ID,
                  organization_name: "Organization Beta",
                  slug: "org-beta",
                  role: "OWNER",
                },
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: new Error("Invalid token") };
      },
    },
  };
  return new SupabaseAuthAdapter(client as any);
}

/**
 * Creates a controllable test adapter for sync scenarios.
 */
function createTestAdapter(options: {
  pushHandler?: (sku: string, qty: number) => Promise<PushInventoryResult>;
  verifyHandler?: (sku: string, expected: number) => Promise<VerificationResult>;
} = {}): ChannelAdapter {
  return {
    provider: "SHOPIFY",
    connect: async () => ({ status: "connected" }),
    fetchInventoryLevels: async (skus: string[]): Promise<ExternalInventorySnapshot[]> => {
      return skus.map((sku) => ({
        externalSkuId: sku,
        quantity: 10,
        observedAt: new Date(),
      }));
    },
    pushInventoryLevel:
      options.pushHandler ??
      (async (sku, qty): Promise<PushInventoryResult> => ({
        externalSkuId: sku,
        acknowledged: true,
        submittedAt: new Date(),
        status: "ACKNOWLEDGED",
        providerTransactionId: "tx_mock_123",
      })),
    verifyInventoryLevel:
      options.verifyHandler ??
      (async (sku, expected): Promise<VerificationResult> => ({
        externalSkuId: sku,
        isVerified: true,
        expectedQuantity: expected,
        actualQuantity: expected,
        verifiedAt: new Date(),
        status: "VERIFIED",
      })),
  };
}

describe("Phase 11: Synchronization Framework Acceptance Suite", () => {
  let repository: InMemorySyncJobRepository;
  let service: SyncJobService;
  let engine: SyncEngine;

  beforeEach(() => {
    repository = new InMemorySyncJobRepository();
    service = new SyncJobService(repository);
    engine = new SyncEngine(service);
  });

  // =========================================================================
  // 1. Happy Path Lifecycle & Explicit Read-Back Verification Gate
  // =========================================================================
  describe("1. Happy Path & Mandatory Verification Invariant Gate", () => {
    it("should execute canonical lifecycle: QUEUED -> PROCESSING -> SENT -> ACKNOWLEDGED -> VERIFYING -> VERIFIED", async () => {
      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 42,
        idempotencyKey: "test:happy:1",
      });

      assert.equal(enqueued.job.status, "QUEUED");
      assert.ok(enqueued.job.queued_at);

      const adapter = createTestAdapter();
      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
      });

      assert.equal(outcome.isSuccess, true);
      assert.equal(outcome.finalState, "VERIFIED");
      assert.equal(outcome.verifiedQuantity, 42);

      // Verify all timestamps are preserved in database
      const finalJob = await service.getSyncJob(ORG_A_ID, enqueued.job.id);
      assert.ok(finalJob);
      assert.equal(finalJob.status, "VERIFIED");
      assert.ok(finalJob.started_at);
      assert.ok(finalJob.sent_at);
      assert.ok(finalJob.acknowledged_at);
      assert.ok(finalJob.verified_at);
      assert.equal(finalJob.target_quantity, 42);
    });

    it("CRITICAL INVARIANT GATE: outbound write ACKNOWLEDGED must NEVER mark job VERIFIED without read-back", async () => {
      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 50,
      });

      // Outbound push succeeded, but verification handler is never invoked or fails
      // Attempting to directly transition from ACKNOWLEDGED to VERIFIED without VERIFYING must be rejected!
      await service.transition({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        nextState: "PROCESSING",
      });
      await service.transition({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        nextState: "SENT",
      });
      await service.transition({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        nextState: "ACKNOWLEDGED",
      });

      // Direct transition to VERIFIED without passing through VERIFYING must throw InvalidStateTransitionError
      await assert.rejects(
        async () => {
          await service.transition({
            organizationId: ORG_A_ID,
            jobId: enqueued.job.id,
            nextState: "VERIFIED",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof InvalidStateTransitionError);
          const msg = (err as any).details?.reason || err.message;
          assert.match(
            msg,
            /cannot transition from 'ACKNOWLEDGED' to 'VERIFIED'|read-back verification/
          );
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. Failure Scenarios Required by Prompt 12
  // =========================================================================
  describe("2. Canonical Error Classification & Failure Scenarios", () => {
    it("Scenario: timeout during outbound push -> TRANSIENT -> RETRYING (escalates to FAILED after max attempts)", async () => {
      const adapter = createTestAdapter({
        pushHandler: async () => {
          const err = new Error("Gateway timeout connecting to Shopify API");
          (err as any).code = "ETIMEDOUT";
          (err as any).status = 504;
          throw err;
        },
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 100,
      });

      // Attempt 1: Should transition to RETRYING
      const outcome1 = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
        maxAttempts: 2,
      });

      assert.equal(outcome1.isSuccess, false);
      assert.equal(outcome1.finalState, "RETRYING");
      assert.equal(outcome1.error?.classification, "TRANSIENT");
      assert.equal(outcome1.job.attempt_count, 1);

      // Attempt 2: Reaches maxAttempts (2) -> Escalate to FAILED
      const outcome2 = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
        maxAttempts: 2,
      });

      assert.equal(outcome2.isSuccess, false);
      assert.equal(outcome2.finalState, "FAILED");
      assert.equal(outcome2.job.attempt_count, 2);
      assert.ok(outcome2.job.failed_at);
      assert.equal(outcome2.job.last_error_code, "ETIMEDOUT");
    });

    it("Scenario: provider accepted request followed by client timeout -> TRANSIENT -> RETRYING (NOT VERIFIED)", async () => {
      // Outbound push succeeds, but read-back verification times out on the client side
      const adapter = createTestAdapter({
        pushHandler: async (sku) => ({
          externalSkuId: sku,
          acknowledged: true,
          status: "ACKNOWLEDGED",
          submittedAt: new Date(),
        }),
        verifyHandler: async () => {
          const err = new Error("Client socket timeout waiting for verification read-back response");
          (err as any).code = "ECONNRESET";
          throw err;
        },
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 30,
      });

      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
        maxAttempts: 3,
      });

      // MUST NOT be marked VERIFIED! Must be RETRYING
      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.error?.classification, "TRANSIENT");
      assert.notEqual(outcome.job.status, "VERIFIED");
      assert.equal(outcome.job.status, "RETRYING");
      assert.ok(outcome.job.acknowledged_at); // Outbound was acknowledged
      assert.equal(outcome.job.verified_at, null); // Never verified!
    });

    it("Scenario: rate limit -> RATE_LIMIT -> RETRYING with suggested backoff delay", async () => {
      const adapter = createTestAdapter({
        pushHandler: async () => ({
          externalSkuId: EXTERNAL_SKU_A,
          acknowledged: false,
          status: "FAILED",
          error: "Throttled: 429 Too Many Requests. API call limit exceeded.",
          httpStatus: 429,
          retryAfterMs: 4000,
        }),
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 25,
      });

      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
        maxAttempts: 5,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.error?.classification, "RATE_LIMIT");
      assert.equal(outcome.error?.suggestedDelayMs, 4000);
      assert.equal(outcome.error?.isRetryable, true);
    });

    it("Scenario: authentication failure -> AUTHENTICATION -> REQUIRES_ACTION (no blind retry)", async () => {
      const adapter = createTestAdapter({
        pushHandler: async () => ({
          externalSkuId: EXTERNAL_SKU_A,
          acknowledged: false,
          status: "FAILED",
          error: "401 Unauthorized: Invalid API secret key or expired OAuth token",
          httpStatus: 401,
          errorCode: "INVALID_CREDENTIALS",
        }),
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 15,
      });

      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "REQUIRES_ACTION");
      assert.equal(outcome.error?.classification, "AUTHENTICATION");
      assert.equal(outcome.error?.isRetryable, false);

      // Check that a domain exception was recorded with remediation guidance
      const exceptions = await repository.getExceptions(ORG_A_ID);
      assert.equal(exceptions.length, 1);
      assert.match(
        String(exceptions[0].recommendedAction?.action || ""),
        /refresh channel API credentials/i
      );
    });

    it("Scenario: validation failure -> VALIDATION -> REQUIRES_ACTION", async () => {
      const adapter = createTestAdapter({
        pushHandler: async () => ({
          externalSkuId: EXTERNAL_SKU_A,
          acknowledged: false,
          status: "FAILED",
          error: "422 Unprocessable Entity: Inventory quantity must be an integer >= 0",
          httpStatus: 422,
          errorCode: "SCHEMA_VALIDATION_ERROR",
        }),
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: -5,
      });

      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "REQUIRES_ACTION");
      assert.equal(outcome.error?.classification, "VALIDATION");
      assert.equal(outcome.error?.isRetryable, false);
    });

    it("Scenario: conflict (read-back quantity mismatch) -> CONFLICT -> CONFLICT", async () => {
      // Outbound push was acknowledged for quantity 100, but read-back observes only 85
      const adapter = createTestAdapter({
        pushHandler: async (sku) => ({
          externalSkuId: sku,
          acknowledged: true,
          status: "ACKNOWLEDGED",
          submittedAt: new Date(),
        }),
        verifyHandler: async (sku) => ({
          externalSkuId: sku,
          isVerified: false,
          expectedQuantity: 100,
          actualQuantity: 85, // Mismatch!
          verifiedAt: new Date(),
          status: "MISMATCH",
        }),
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 100,
      });

      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "CONFLICT");
      assert.equal(outcome.error?.classification, "CONFLICT");
      assert.equal(outcome.verifiedQuantity, 85);

      const exceptions = await repository.getExceptions(ORG_A_ID);
      assert.equal(exceptions.length, 1);
      assert.match(
        String(exceptions[0].recommendedAction?.action || ""),
        /inventory reconciliation/i
      );
    });

    it("Scenario: not found -> NOT_FOUND -> REQUIRES_ACTION", async () => {
      const adapter = createTestAdapter({
        pushHandler: async () => ({
          externalSkuId: EXTERNAL_SKU_A,
          acknowledged: false,
          status: "FAILED",
          error: "404 Not Found: InventoryItem with ID ext_sku_001 does not exist on Shopify store",
          httpStatus: 404,
          errorCode: "INVENTORY_ITEM_NOT_FOUND",
        }),
      });

      const enqueued = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 10,
      });

      const outcome = await engine.execute({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        adapter,
        externalSkuId: EXTERNAL_SKU_A,
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "REQUIRES_ACTION");
      assert.equal(outcome.error?.classification, "NOT_FOUND");
    });
  });

  // =========================================================================
  // 3. Idempotency & Tenant Isolation
  // =========================================================================
  describe("3. Idempotency & Tenant Isolation", () => {
    it("should return existing job on duplicate idempotency key without redundant row creation", async () => {
      const idemKey = "org1:shopify:sku001:v42";

      const first = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 42,
        idempotencyKey: idemKey,
      });
      assert.equal(first.isDuplicate, false);

      const duplicate = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 42,
        idempotencyKey: idemKey,
      });

      assert.equal(duplicate.isDuplicate, true);
      assert.equal(duplicate.job.id, first.job.id);

      const list = await service.listSyncJobs(ORG_A_ID);
      assert.equal(list.total, 1);
    });

    it("should strictly forbid cross-tenant access to sync jobs", async () => {
      const jobA = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 10,
      });

      // Org B attempting to fetch Org A's sync job must throw TenantAccessDeniedError
      await assert.rejects(
        async () => {
          await service.getSyncJob(ORG_B_ID, jobA.job.id);
        },
        TenantAccessDeniedError
      );

      // Org B attempting to list jobs must only see empty list
      const listB = await service.listSyncJobs(ORG_B_ID);
      assert.equal(listB.total, 0);
    });

    it("should allow manual retry of failed or requires_action sync jobs", async () => {
      const job = await engine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 10,
      });

      // Transition to FAILED
      await service.transition({
        organizationId: ORG_A_ID,
        jobId: job.job.id,
        nextState: "PROCESSING",
      });
      await service.transition({
        organizationId: ORG_A_ID,
        jobId: job.job.id,
        nextState: "FAILED",
        errorCode: "TIMEOUT",
      });

      // Operator triggers retry
      const retried = await service.retrySyncJob(ORG_A_ID, job.job.id);
      assert.equal(retried.status, "QUEUED");
      assert.equal(retried.last_error_code, null);
    });
  });

  // =========================================================================
  // 4. REST API & RBAC Conformance
  // =========================================================================
  describe("4. REST API Endpoints & RBAC Conformance", () => {
    let server: Server;
    let baseUrl: string;
    let authAdapter: SupabaseAuthAdapter;
    let apiSyncJobService: SyncJobService;
    let apiSyncEngine: SyncEngine;

    beforeEach(async () => {
      authAdapter = createMockAuthAdapter();

      const apiRepo = new InMemorySyncJobRepository();
      apiSyncJobService = new SyncJobService(apiRepo);
      apiSyncEngine = new SyncEngine(apiSyncJobService);

      server = startApiServer({
        portOverride: 0,
        authAdapter,
        syncJobService: apiSyncJobService,
        syncEngine: apiSyncEngine,
      });

      await new Promise<void>((resolve) => {
        server.on("listening", resolve);
      });
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it("POST /sync-jobs: should enqueue sync job and return 201 Created", async () => {
      const res = await fetch(`${baseUrl}/sync-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer token_org_a_owner`,
        },
        body: JSON.stringify({
          channelAccountId: CHANNEL_ACCOUNT_ID,
          skuId: SKU_A_ID,
          operation: "UPDATE_INVENTORY",
          targetQuantity: 75,
          idempotencyKey: "idem_api_1",
        }),
      });

      assert.equal(res.status, 201);
      const body = (await res.json()) as any;
      assert.equal(body.data.targetQuantity, 75);
      assert.equal(body.data.status, "QUEUED");
      assert.ok(body.data.id);
    });

    it("GET /sync-jobs: should list sync jobs with pagination and envelope", async () => {
      // Enqueue 2 jobs under Org A
      await apiSyncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 10,
      });
      await apiSyncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: "sku_002",
        targetQuantity: 20,
      });

      const res = await fetch(`${baseUrl}/sync-jobs?limit=10`, {
        headers: {
          Authorization: `Bearer token_org_a_owner`,
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.length, 2);
      assert.equal(body.meta.pagination.total, 2);
    });

    it("GET /sync-jobs/:id: should retrieve single sync job", async () => {
      const enqueued = await apiSyncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 42,
      });

      const res = await fetch(`${baseUrl}/sync-jobs/${enqueued.job.id}`, {
        headers: {
          Authorization: `Bearer token_org_a_owner`,
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.id, enqueued.job.id);
      assert.equal(body.data.targetQuantity, 42);
    });

    it("POST /sync-jobs/:id/retry: should manually retry a failed sync job", async () => {
      const enqueued = await apiSyncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 10,
      });

      // Force to FAILED
      await apiSyncJobService.transition({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        nextState: "PROCESSING",
      });
      await apiSyncJobService.transition({
        organizationId: ORG_A_ID,
        jobId: enqueued.job.id,
        nextState: "FAILED",
        errorCode: "NETWORK_ERROR",
      });

      const res = await fetch(`${baseUrl}/sync-jobs/${enqueued.job.id}/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer token_org_a_owner`,
        },
        body: JSON.stringify({ force: false }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.status, "QUEUED");
      assert.equal(body.data.lastErrorCode, null);
    });

    it("RBAC enforcement: VIEWER role without channels:sync is forbidden from POST /sync-jobs", async () => {
      const res = await fetch(`${baseUrl}/sync-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer token_org_a_viewer`,
        },
        body: JSON.stringify({
          channelAccountId: CHANNEL_ACCOUNT_ID,
          skuId: SKU_A_ID,
          targetQuantity: 10,
        }),
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "FORBIDDEN");
    });

    it("HTTP Tenant Isolation: Org B user is forbidden from accessing Org A sync job", async () => {
      const enqueued = await apiSyncEngine.enqueue({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        skuId: SKU_A_ID,
        targetQuantity: 10,
      });

      const res = await fetch(`${baseUrl}/sync-jobs/${enqueued.job.id}`, {
        headers: {
          Authorization: `Bearer token_org_b_owner`,
        },
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "FORBIDDEN");
    });
  });
});

