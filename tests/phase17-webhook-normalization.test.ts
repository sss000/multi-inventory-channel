/**
 * Phase 17 Acceptance Test Suite: Webhook and Event Normalization
 * Canonical Specifications:
 * - Section 43 (Webhook Processing) of 01_ENGINEERING_SPEC.md
 * - Section 44 (Normalized Events) of 01_ENGINEERING_SPEC.md
 * - Prompt 18 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  WebhookIngestionPipeline,
  RawWebhookStorageService,
  InMemoryStorageDriver,
  WebhookDeduplicationStore,
  WebhookNormalizer,
  InvalidSignatureError,
  PayloadTooLargeError,
  MalformedPayloadError,
  UnauthorizedStorageAccessError,
  type WebhookDomainDispatcher,
  type WebhookSyncTrigger,
  type WebhookQueueEnqueuer,
} from "@platform/integrations";
import {
  type WebhookIngestionRequest,
  type NormalizedEvent,
  type OrderCreated,
  type OrderUpdated,
  type OrderCancelled,
  type InventoryChanged,
  type ProductChanged,
  type ListingChanged,
  type ReturnCreated,
  type ReturnUpdated,
  type IntegrationChanged,
} from "@platform/contracts";
import { redactSensitiveData, maskCreditCard } from "@platform/security";

describe("Phase 17: Webhook and Event Normalization Acceptance Suite", () => {
  const ORG_A = "11111111-1111-4111-8111-111111111111";
  const ORG_B = "22222222-2222-4222-8222-222222222222";
  const ACCOUNT_SHOPIFY = "acc-shopify-101";
  const ACCOUNT_AMAZON = "acc-amazon-202";
  const SHOPIFY_SECRET = "shpss_test_secret_key_12345";

  let storageDriver: InMemoryStorageDriver;
  let storageService: RawWebhookStorageService;
  let deduplicator: WebhookDeduplicationStore;
  let normalizer: WebhookNormalizer;
  let dispatchedEvents: NormalizedEvent[];
  let syncTriggerEvents: NormalizedEvent[];
  let reconciliationTriggers: Array<{ event: NormalizedEvent; reason: string }>;
  let queuedJobs: any[];
  let entityVersions: Map<string, { lastUpdatedAt?: Date; version?: number }>;

  // Helper to compute valid Shopify HMAC
  function computeShopifyHmac(body: string, secret: string = SHOPIFY_SECRET): string {
    return crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
  }

  beforeEach(() => {
    storageDriver = new InMemoryStorageDriver();
    storageService = new RawWebhookStorageService(storageDriver, {
      bucket: "test-raw-webhooks",
      maxSizeBytes: 1024 * 1024, // 1MB for test
      retentionDays: 14,
      enableRedaction: true,
    });
    deduplicator = new WebhookDeduplicationStore({ ttlMs: 3600 * 1000 });
    normalizer = new WebhookNormalizer();
    dispatchedEvents = [];
    syncTriggerEvents = [];
    reconciliationTriggers = [];
    queuedJobs = [];
    entityVersions = new Map();
  });

  function createPipeline(options: {
    delayedThresholdMs?: number;
    verifySignatures?: boolean;
    asyncDelayMs?: number;
  } = {}): WebhookIngestionPipeline {
    const dispatcher: WebhookDomainDispatcher = {
      applyOrderCreated: async (e) => {
        if (options.asyncDelayMs) await new Promise((r) => setTimeout(r, options.asyncDelayMs));
        dispatchedEvents.push(e);
      },
      applyOrderUpdated: async (e) => {
        dispatchedEvents.push(e);
      },
      applyOrderCancelled: async (e) => {
        dispatchedEvents.push(e);
      },
      applyInventoryChanged: async (e) => {
        if (options.asyncDelayMs) await new Promise((r) => setTimeout(r, options.asyncDelayMs));
        dispatchedEvents.push(e);
      },
      applyProductChanged: async (e) => {
        dispatchedEvents.push(e);
      },
      applyListingChanged: async (e) => {
        dispatchedEvents.push(e);
      },
      applyReturnCreated: async (e) => {
        dispatchedEvents.push(e);
      },
      applyReturnUpdated: async (e) => {
        dispatchedEvents.push(e);
      },
      applyIntegrationChanged: async (e) => {
        dispatchedEvents.push(e);
      },
      getEntityVersion: async (type, id) => {
        return entityVersions.get(`${type}:${id}`) ?? null;
      },
    };

    const syncTrigger: WebhookSyncTrigger = {
      triggerSync: async (e) => {
        syncTriggerEvents.push(e);
      },
      triggerReconciliation: async (e, reason) => {
        reconciliationTriggers.push({ event: e, reason });
      },
    };

    const queueEnqueuer: WebhookQueueEnqueuer = {
      enqueue: async (job) => {
        queuedJobs.push(job);
      },
    };

    const signatureVerifier = options.verifySignatures !== false
      ? async (provider: string, accountId: string, req: WebhookIngestionRequest) => {
          if (provider.toUpperCase() === "SHOPIFY") {
            const hmac = req.headers["x-shopify-hmac-sha256"] || req.headers["X-Shopify-Hmac-Sha256"];
            if (!hmac) return false;
            const expected = computeShopifyHmac(
              typeof req.rawBody === "string" ? req.rawBody : req.rawBody.toString("utf8")
            );
            return hmac === expected;
          }
          if (provider.toUpperCase() === "AMAZON") {
            return req.headers["x-amz-signature"] === "valid_amz_sig";
          }
          return true;
        }
      : undefined;

    return new WebhookIngestionPipeline({
      storageService,
      deduplicator,
      normalizer,
      dispatcher,
      syncTrigger,
      queueEnqueuer,
      signatureVerifier,
      delayedEventThresholdMs: options.delayedThresholdMs ?? 24 * 3600 * 1000,
    });
  }

  // ==========================================================================
  // 1. FAST ACKNOWLEDGEMENT INVARIANT (Section 43 & Prompt 18)
  // ==========================================================================
  describe("1. Fast Acknowledgement Invariant", () => {
    it("should acknowledge provider quickly BEFORE long-running domain work begins", async () => {
      // Invariant: Never perform long-running inventory operations before acknowledging
      const pipeline = createPipeline({ asyncDelayMs: 250 });
      const rawPayload = JSON.stringify({
        id: 9901,
        order_number: "#1001",
        total_price: "150.00",
        currency: "USD",
        line_items: [{ id: 1, sku: "TSHIRT-BLK-M", quantity: 2, price: "75.00" }],
      });

      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "orders/create",
          "x-shopify-webhook-id": "sp_event_fast_ack_001",
          "x-shopify-hmac-sha256": computeShopifyHmac(rawPayload),
        },
        rawBody: rawPayload,
      };

      const start = Date.now();
      // Call fast acknowledgement stage
      const { ack, rawStoragePath } = await pipeline.receiveAndAcknowledge(req);
      const elapsed = Date.now() - start;

      // Must complete in under 50ms (well under any network timeout)
      assert.ok(elapsed < 50, `Expected fast acknowledgement < 50ms, took ${elapsed}ms`);
      assert.equal(ack.received, true);
      assert.equal(ack.status, "ACCEPTED");
      assert.equal(ack.provider, "SHOPIFY");
      assert.ok(ack.eventId);
      assert.ok(rawStoragePath);

      // Verify that at this exact moment, domain work has NOT yet been dispatched!
      assert.equal(dispatchedEvents.length, 0, "Domain work must NOT occur before acknowledgement");
      assert.equal(queuedJobs.length, 1, "Asynchronous job must be queued");

      // Now process the queued job asynchronously (worker simulation)
      await pipeline.processPersistedWebhook({
        eventId: ack.eventId,
        organizationId: ORG_A,
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        rawStoragePath: rawStoragePath!,
      });

      // Now domain work is dispatched
      assert.equal(dispatchedEvents.length, 1);
      assert.equal(dispatchedEvents[0]?.event_type, "OrderCreated");
    });
  });

  // ==========================================================================
  // 2. SIGNATURE VERIFICATION & SECURITY (Section 43 & Prompt 18)
  // ==========================================================================
  describe("2. Signature Verification & Security", () => {
    it("should accept valid cryptographic signature and persist raw webhook", async () => {
      const pipeline = createPipeline();
      const rawPayload = JSON.stringify({ id: 101, title: "Test Product" });
      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "products/update",
          "x-shopify-webhook-id": "wb_sig_valid_01",
          "x-shopify-hmac-sha256": computeShopifyHmac(rawPayload),
        },
        rawBody: rawPayload,
      };

      const res = await pipeline.ingestSync(req);
      assert.equal(res.success, true);
      assert.equal(res.httpStatus, 200);
      assert.equal(res.acknowledged.received, true);
      assert.equal(res.normalizedEvent?.event_type, "ProductChanged");
    });

    it("should reject invalid signatures with HTTP 401 and prevent storage or domain execution", async () => {
      const pipeline = createPipeline();
      const rawPayload = JSON.stringify({ id: 102, title: "Tampered Product" });
      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "products/update",
          "x-shopify-webhook-id": "wb_sig_invalid_01",
          "x-shopify-hmac-sha256": "bogus_invalid_signature_base64==",
        },
        rawBody: rawPayload,
      };

      const res = await pipeline.ingestSync(req);
      assert.equal(res.success, false);
      assert.equal(res.httpStatus, 401);
      assert.equal(res.acknowledged.received, false);
      assert.equal(res.acknowledged.status, "IGNORED");
      assert.match(res.error || "", /Invalid webhook signature/);

      // Verify no raw storage, queue, or domain actions took place
      assert.equal(dispatchedEvents.length, 0);
      assert.equal(queuedJobs.length, 0);
    });
  });

  // ==========================================================================
  // 3. RAW WEBHOOK SECURE STORAGE & DATA MINIMIZATION (Prompt 18)
  // ==========================================================================
  describe("3. Raw Webhook Storage, Retention & Redaction", () => {
    it("should partition raw payloads by tenant path: ${orgId}/webhooks/${year}/${month}/${eventId}.json", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const rawPayload = JSON.stringify({ id: 501, note: "Inventory Sync" });
      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "inventory_levels/update" },
        rawBody: rawPayload,
      };

      const { rawStoragePath, ack } = await pipeline.receiveAndAcknowledge(req);
      assert.ok(rawStoragePath);

      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const expectedPrefix = `${ORG_A}/webhooks/${year}/${month}/`;
      assert.ok(
        rawStoragePath.startsWith(expectedPrefix),
        `Path ${rawStoragePath} did not match prefix ${expectedPrefix}`
      );
      assert.ok(rawStoragePath.endsWith(`${ack.eventId}.json`));
    });

    it("should enforce tenant access control and block cross-tenant read", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const rawPayload = JSON.stringify({ id: 502, note: "Tenant A confidential data" });
      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {},
        rawBody: rawPayload,
      };

      const { rawStoragePath } = await pipeline.receiveAndAcknowledge(req);

      // Org A can access their payload
      const contentA = await storageService.getPayload(ORG_A, rawStoragePath!);
      assert.ok(contentA.includes("Tenant A"));

      // Org B attempting to access Org A's path must be rejected with 403
      await assert.rejects(
        () => storageService.getPayload(ORG_B, rawStoragePath!),
        (err: any) => {
          assert.equal(err.name, "UnauthorizedStorageAccessError");
          assert.equal(err.httpStatus, 403);
          return true;
        }
      );
    });

    it("should redact sensitive payment details (credit cards, CVV, tokens) from persisted storage", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const rawPayload = JSON.stringify({
        id: 777,
        order_number: "#9999",
        payment: {
          credit_card: "4532-1188-9944-1234",
          cvv: "123",
          token: "secret_tok_xyz888",
          password: "mySecretPassword1!",
        },
      });

      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {},
        rawBody: rawPayload,
      };

      const { rawStoragePath } = await pipeline.receiveAndAcknowledge(req);
      const storedContent = await storageService.getPayload(ORG_A, rawStoragePath!);

      // Assert sensitive fields are redacted
      assert.ok(!storedContent.includes("4532-1188-9944-1234"));
      assert.ok(storedContent.includes("****-****-****-1234")); // Masked card
      assert.ok(!storedContent.includes("secret_tok_xyz888"));
      assert.ok(!storedContent.includes("mySecretPassword1!"));
      assert.ok(storedContent.includes("[REDACTED]"));
    });

    it("should enforce maximum payload size limit and reject oversized payloads with HTTP 413", async () => {
      // Create storage with small 1KB limit
      const smallStorage = new RawWebhookStorageService(new InMemoryStorageDriver(), {
        maxSizeBytes: 1024,
      });
      const pipeline = new WebhookIngestionPipeline({
        storageService: smallStorage,
        signatureVerifier: () => true,
      });

      const oversizedPayload = "X".repeat(2048); // 2KB payload > 1KB limit
      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {},
        rawBody: oversizedPayload,
      };

      const res = await pipeline.ingestSync(req);
      assert.equal(res.success, false);
      assert.equal(res.httpStatus, 413);
      assert.match(res.error || "", /Payload size 2048 bytes exceeds maximum/);
    });

    it("should track retention limits and prune expired webhook records", async () => {
      // Create storage service with 1 day retention
      const expiringStorage = new RawWebhookStorageService(new InMemoryStorageDriver(), {
        retentionDays: 1,
      });

      const record = await expiringStorage.savePayload({
        organizationId: ORG_A,
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        eventId: "exp_ev_01",
        providerEventId: "prov_01",
        rawBody: JSON.stringify({ test: "retention" }),
      });

      assert.ok(record.expiresAt > record.createdAt);

      // Artificially age the record by adjusting expiresAt to yesterday
      (record as any).expiresAt = new Date(Date.now() - 3600 * 1000);

      const cleanupResult = await expiringStorage.cleanupExpiredWebhooks();
      assert.equal(cleanupResult.deletedCount, 1);
      assert.equal(expiringStorage.getRecord("exp_ev_01"), undefined);
    });
  });

  // ==========================================================================
  // 4. DEDUPLICATION & PROVIDER RETRIES (Section 43 & Prompt 18)
  // ==========================================================================
  describe("4. Deduplication & Provider Retries", () => {
    it("should handle duplicate webhook events idempotently without double-mutating domain", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const rawPayload = JSON.stringify({
        id: 8881,
        order_number: "#DUP-101",
        total_price: "50.00",
        currency: "USD",
        line_items: [{ sku: "WIDGET-01", quantity: 1, price: "50.00" }],
      });

      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "orders/create",
          "x-shopify-webhook-id": "shopify_event_dup_999",
        },
        rawBody: rawPayload,
      };

      // 1st delivery
      const res1 = await pipeline.ingestSync(req);
      assert.equal(res1.success, true);
      assert.equal(res1.isDuplicate, false);
      assert.equal(res1.acknowledged.status, "ACCEPTED");
      assert.equal(dispatchedEvents.length, 1);

      // 2nd delivery (provider retry with exact same webhook ID)
      const res2 = await pipeline.ingestSync(req);
      assert.equal(res2.success, true);
      assert.equal(res2.isDuplicate, true);
      assert.equal(res2.acknowledged.status, "DUPLICATE");

      // Verify domain dispatcher was NOT called a second time
      assert.equal(dispatchedEvents.length, 1, "Domain mutation must not be executed twice");
    });
  });

  // ==========================================================================
  // 5. OUT-OF-ORDER EVENT HANDLING (Prompt 18)
  // ==========================================================================
  describe("5. Out-of-Order Events Protection", () => {
    it("should drop/flag out-of-order older events arriving after a newer state was recorded", async () => {
      const pipeline = createPipeline({ verifySignatures: false });

      // Simulate existing order entity version in DB (updated at 14:00)
      const entityTimeT2 = new Date("2026-09-30T14:00:00.000Z");
      entityVersions.set("OrderUpdated:ORD-XYZ", { lastUpdatedAt: entityTimeT2 });

      // Stale event arrived out-of-order (occurred earlier at 13:30)
      const stalePayload = JSON.stringify({
        id: "ORD-XYZ",
        financial_status: "REFUNDED",
        updated_at: "2026-09-30T13:30:00.000Z", // T1 < T2
      });

      const staleReq: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "orders/updated",
          "x-shopify-webhook-id": "sp_stale_ooo_1",
        },
        rawBody: stalePayload,
      };

      const resStale = await pipeline.ingestSync(staleReq);
      assert.equal(resStale.success, true);
      assert.equal(resStale.isOutOfOrder, true, "Should identify event as out-of-order");
      assert.equal(resStale.domainDispatched, false, "Should not dispatch stale mutation");
      assert.equal(dispatchedEvents.length, 0);

      // Newer event arrives (occurred at 14:30)
      const newerPayload = JSON.stringify({
        id: "ORD-XYZ",
        financial_status: "COMPLETED",
        updated_at: "2026-09-30T14:30:00.000Z", // T3 > T2
      });

      const newerReq: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "orders/updated",
          "x-shopify-webhook-id": "sp_newer_ooo_2",
        },
        rawBody: newerPayload,
      };

      const resNewer = await pipeline.ingestSync(newerReq);
      assert.equal(resNewer.success, true);
      assert.equal(resNewer.isOutOfOrder, false);
      assert.equal(resNewer.domainDispatched, true);
      assert.equal(dispatchedEvents.length, 1);
    });
  });

  // ==========================================================================
  // 6. DELAYED EVENTS (Prompt 18)
  // ==========================================================================
  describe("6. Delayed Events & Stale Lag Protection", () => {
    it("should flag delayed events exceeding lag threshold and trigger reconciliation", async () => {
      // Threshold 1 hour for test
      const pipeline = createPipeline({
        verifySignatures: false,
        delayedThresholdMs: 3600 * 1000,
      });

      // Event occurred 5 hours ago
      const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
      const rawPayload = JSON.stringify({
        sku: "LAG-SKU-99",
        available: 12,
        updated_at: fiveHoursAgo,
      });

      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {
          "x-shopify-topic": "inventory_levels/update",
          "x-shopify-webhook-id": "delayed_ev_01",
        },
        rawBody: rawPayload,
      };

      const res = await pipeline.ingestSync(req);
      assert.equal(res.success, true);
      assert.equal(res.isDelayed, true, "Should identify event as delayed");
      assert.equal(res.reconciliationTriggered, true, "Should trigger reconciliation for delayed event");
      assert.equal(reconciliationTriggers.length, 1);
      assert.match(reconciliationTriggers[0]?.reason || "", /exceeds 60m threshold/);
    });
  });

  // ==========================================================================
  // 7. MALFORMED PAYLOADS (Prompt 18)
  // ==========================================================================
  describe("7. Malformed Payloads Handling", () => {
    it("should reject unparseable / malformed JSON gracefully with HTTP 400", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const malformedPayload = "{ this is not valid JSON :::: ";

      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {},
        rawBody: malformedPayload,
      };

      const res = await pipeline.ingestSync(req);
      assert.equal(res.success, false);
      assert.equal(res.httpStatus, 400);
      assert.equal(res.acknowledged.received, false);
      assert.match(res.error || "", /Invalid JSON/);
      assert.equal(dispatchedEvents.length, 0);
    });

    it("should reject completely empty raw body with HTTP 400", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const req: WebhookIngestionRequest = {
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: {},
        rawBody: "   ",
      };

      const res = await pipeline.ingestSync(req);
      assert.equal(res.success, false);
      assert.equal(res.httpStatus, 400);
      assert.match(res.error || "", /Empty webhook raw body|Empty payload/);
    });
  });

  // ==========================================================================
  // 8. ALL 9 CANONICAL NORMALIZED EVENT TYPES (Section 44 & Prompt 18)
  // ==========================================================================
  describe("8. Canonical Normalization for All 9 Event Types", () => {
    const pipeline = new WebhookIngestionPipeline({
      signatureVerifier: () => true,
    });

    function assertCommonEventFields(event: NormalizedEvent, expectedType: string) {
      assert.ok(event.event_id, "Must have event_id");
      assert.ok(event.provider, "Must have provider");
      assert.ok(event.provider_account_id, "Must have provider_account_id");
      assert.ok(event.provider_event_id, "Must have provider_event_id");
      assert.equal(event.event_type, expectedType);
      assert.ok(event.occurred_at, "Must have occurred_at");
      assert.ok(event.received_at, "Must have received_at");
      assert.ok(event.payload, "Must have payload");
      assert.ok(event.correlation_id, "Must have correlation_id");
      assert.ok(event.organization_id, "Must have organization_id");
    }

    // 1. OrderCreated
    it("1. OrderCreated: should normalize order creation with line items and customer", async () => {
      const raw = JSON.stringify({
        id: 7001,
        order_number: "#1001",
        total_price: "199.99",
        currency: "USD",
        line_items: [{ id: 91, sku: "SHOE-RED-10", quantity: 1, price: "199.99" }],
        customer: { id: "c1", email: "alice@example.com", first_name: "Alice" },
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "orders/create" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as OrderCreated;
      assertCommonEventFields(ev, "OrderCreated");
      assert.equal(ev.payload.order_id, "7001");
      assert.equal(ev.payload.order_number, "#1001");
      assert.equal(ev.payload.total_amount, 199.99);
      assert.equal(ev.payload.line_items[0]?.sku, "SHOE-RED-10");
    });

    // 2. OrderUpdated
    it("2. OrderUpdated: should normalize order status updates", async () => {
      const raw = JSON.stringify({
        id: 7002,
        order_number: "#1002",
        financial_status: "PAID",
        fulfillment_status: "FULFILLED",
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "orders/updated" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as OrderUpdated;
      assertCommonEventFields(ev, "OrderUpdated");
      assert.equal(ev.payload.order_id, "7002");
      assert.equal(ev.payload.fulfillment_status, "FULFILLED");
    });

    // 3. OrderCancelled
    it("3. OrderCancelled: should normalize order cancellations", async () => {
      const raw = JSON.stringify({
        id: 7003,
        order_number: "#1003",
        cancel_reason: "Customer changed mind",
        cancelled_at: "2026-09-30T15:00:00Z",
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "orders/cancelled" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as OrderCancelled;
      assertCommonEventFields(ev, "OrderCancelled");
      assert.equal(ev.payload.order_id, "7003");
      assert.equal(ev.payload.reason, "Customer changed mind");
    });

    // 4. InventoryChanged
    it("4. InventoryChanged: should normalize channel inventory level updates", async () => {
      const raw = JSON.stringify({
        sku: "LAPTOP-PRO-16",
        available: 42,
        location_id: "loc_wh_1",
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "inventory_levels/update" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as InventoryChanged;
      assertCommonEventFields(ev, "InventoryChanged");
      assert.equal(ev.payload.sku, "LAPTOP-PRO-16");
      assert.equal(ev.payload.quantity, 42);
      assert.equal(ev.payload.available, 42);
    });

    // 5. ProductChanged
    it("5. ProductChanged: should normalize product & variant updates", async () => {
      const raw = JSON.stringify({
        id: 4401,
        title: "Wireless Mouse Pro",
        status: "ACTIVE",
        variants: [
          { id: 101, sku: "WM-BLK", price: 49.99 },
          { id: 102, sku: "WM-WHT", price: 49.99 },
        ],
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "products/update" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as ProductChanged;
      assertCommonEventFields(ev, "ProductChanged");
      assert.equal(ev.payload.product_id, "4401");
      assert.equal(ev.payload.title, "Wireless Mouse Pro");
      assert.equal(ev.payload.variants?.length, 2);
    });

    // 6. ListingChanged
    it("6. ListingChanged: should normalize marketplace listing and pricing changes", async () => {
      const raw = JSON.stringify({
        listingId: "LST-990",
        sellerSKU: "KEYBOARD-RGB",
        asin: "B00XYZ123",
        status: "ACTIVE",
        price: 89.99,
      });
      const res = await pipeline.ingestSync({
        provider: "AMAZON",
        accountId: ACCOUNT_AMAZON,
        organizationId: ORG_A,
        headers: {
          "x-amz-signature": "valid_amz_sig",
          "x-event-type": "PRICING_HEALTH_LISTING",
        },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as ListingChanged;
      assertCommonEventFields(ev, "ListingChanged");
      assert.equal(ev.payload.sku, "KEYBOARD-RGB");
      assert.equal(ev.payload.price, 89.99);
    });

    // 7. ReturnCreated
    it("7. ReturnCreated: should normalize return/refund creation requests", async () => {
      const raw = JSON.stringify({
        id: 3301,
        order_id: "7001",
        note: "Defective item",
        refund_line_items: [{ line_item: { sku: "SHOE-RED-10" }, quantity: 1 }],
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "refunds/create" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as ReturnCreated;
      assertCommonEventFields(ev, "ReturnCreated");
      assert.equal(ev.payload.order_id, "7001");
      assert.equal(ev.payload.items[0]?.sku, "SHOE-RED-10");
    });

    // 8. ReturnUpdated
    it("8. ReturnUpdated: should normalize return processing updates", async () => {
      const raw = JSON.stringify({
        event_type: "ReturnUpdated",
        payload: {
          return_id: "RET-3301",
          order_id: "7001",
          status: "RECEIVED",
          received_items: [{ sku: "SHOE-RED-10", quantity: 1 }],
        },
      });
      const res = await pipeline.ingestSync({
        provider: "GENERIC",
        accountId: "acc-generic-1",
        organizationId: ORG_A,
        headers: {},
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as ReturnUpdated;
      assertCommonEventFields(ev, "ReturnUpdated");
      assert.equal(ev.payload.return_id, "RET-3301");
      assert.equal(ev.payload.status, "RECEIVED");
    });

    // 9. IntegrationChanged
    it("9. IntegrationChanged: should normalize app uninstall / health degradation", async () => {
      const raw = JSON.stringify({
        id: "shop_uninstalled",
        myshopify_domain: "mystore.myshopify.com",
      });
      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "app/uninstalled" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      const ev = res.normalizedEvent as IntegrationChanged;
      assertCommonEventFields(ev, "IntegrationChanged");
      assert.equal(ev.payload.action, "UNINSTALLED");
      assert.equal(ev.payload.status, "DISCONNECTED");
    });
  });

  // ==========================================================================
  // 9. DOWNSTREAM SYNCHRONIZATION TRIGGER (Prompt 18)
  // ==========================================================================
  describe("9. Trigger Synchronization / Reconciliation", () => {
    it("should trigger synchronization on inventory changes to broadcast update to other channels", async () => {
      const pipeline = createPipeline({ verifySignatures: false });
      const raw = JSON.stringify({
        sku: "DESK-OAK-01",
        available: 15,
      });

      const res = await pipeline.ingestSync({
        provider: "SHOPIFY",
        accountId: ACCOUNT_SHOPIFY,
        organizationId: ORG_A,
        headers: { "x-shopify-topic": "inventory_levels/update" },
        rawBody: raw,
      });

      assert.equal(res.success, true);
      assert.equal(syncTriggerEvents.length, 1);
      assert.equal(syncTriggerEvents[0]?.event_type, "InventoryChanged");
      assert.equal((syncTriggerEvents[0]?.payload as any).sku, "DESK-OAK-01");
    });
  });
});
