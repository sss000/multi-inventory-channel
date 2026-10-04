/**
 * Phase 12: Provider Adapter Architecture Acceptance Suite
 * Canonical Specifications: Section 35, 36, 37, 38, 39, 40, 41, 42 of 01_ENGINEERING_SPEC.md & Prompt 13
 * 
 * Rules:
 * 1. Common ChannelAdapter Contract: 13 canonical operations implemented and callable.
 * 2. Explicit Capability Detection: honest capability flags, no pretending unsupported features exist.
 * 3. Provider-Neutral Error Normalization: raw provider errors mapped to canonical error classes.
 * 4. Provider Isolation Architecture: isolated modules for Shopify, Amazon, eBay, Walmart.
 * 5. Operational Honesty Gate: adapters report not-operational until their respective implementation phases.
 * 6. Deterministic Mock Provider: full in-memory simulation, HMAC verification, fault injection.
 * 7. SyncEngine Compatibility: seamless execution with Phase 11 synchronization framework.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  type ChannelAdapter,
  hasCapability,
  assertCapability,
  ShopifyAdapter,
  AmazonAdapter,
  EbayAdapter,
  WalmartAdapter,
  MockChannelAdapter,
  AdapterRegistry,
  createDefaultAdapterRegistry,
  ProviderError,
  ProviderAuthenticationError,
  ProviderRateLimitError,
  ProviderTransientError,
  ProviderValidationError,
  ProviderNotFoundError,
  ProviderConflictError,
  ProviderOperationUnsupportedError,
  ProviderNotOperationalError,
  ShopifyErrorNormalizer,
  AmazonErrorNormalizer,
  EbayErrorNormalizer,
  WalmartErrorNormalizer,
  SHOPIFY_CAPABILITIES,
  AMAZON_CAPABILITIES,
  EBAY_CAPABILITIES,
  WALMART_CAPABILITIES,
  SyncEngine,
} from "@platform/integrations";
import {
  SyncJobService,
  InMemorySyncJobRepository,
} from "@platform/database";

describe("Phase 12: Provider Adapter Architecture Acceptance Suite", () => {
  // --------------------------------------------------------------------------
  // 1. Common ChannelAdapter Contract
  // --------------------------------------------------------------------------
  describe("1. Common ChannelAdapter Contract Compliance", () => {
    it("should implement all 13 canonical operations on the adapter interface", () => {
      const mock = new MockChannelAdapter();
      const requiredMethods: Array<keyof ChannelAdapter> = [
        "authenticate",
        "refreshCredentials",
        "getAccount",
        "listProducts",
        "getProduct",
        "listOrders",
        "getOrder",
        "getInventory",
        "updateInventory",
        "registerWebhooks",
        "verifyWebhook",
        "parseWebhook",
        "healthCheck",
      ];

      for (const method of requiredMethods) {
        assert.equal(
          typeof mock[method],
          "function",
          `ChannelAdapter missing required canonical method '${String(method)}'`
        );
      }
    });

    it("should execute canonical operations conforming to return type contracts", async () => {
      const mock = new MockChannelAdapter({
        initialInventory: { "SKU-PROD-01": 50 },
        initialProducts: [
          {
            id: "prod-1",
            provider: "SHOPIFY",
            title: "Test Product",
            status: "ACTIVE",
            variants: [
              {
                id: "var-1",
                productId: "prod-1",
                sku: "SKU-PROD-01",
                price: 29.99,
              },
            ],
          },
        ],
        initialOrders: [
          {
            id: "order-1",
            provider: "SHOPIFY",
            orderNumber: "1001",
            status: "OPEN",
            totalPrice: 29.99,
            currency: "USD",
            items: [
              {
                id: "line-1",
                externalSku: "SKU-PROD-01",
                quantity: 1,
                unitPrice: 29.99,
              },
            ],
            placedAt: new Date(),
          },
        ],
      });

      // 1. authenticate
      const auth = await mock.authenticate({ shopDomain: "test.myshopify.com" });
      assert.equal(auth.success, true);
      assert.equal(auth.provider, "SHOPIFY");

      // 2. refreshCredentials
      const refreshed = await mock.refreshCredentials();
      assert.equal(refreshed.success, true);

      // 3. getAccount
      const account = await mock.getAccount();
      assert.equal(account.status, "ACTIVE");
      assert.equal(account.currency, "USD");

      // 4. listProducts & 5. getProduct
      const products = await mock.listProducts();
      assert.equal(products.items.length, 1);
      const product = await mock.getProduct("prod-1");
      assert.equal(product.title, "Test Product");

      // 6. listOrders & 7. getOrder
      const orders = await mock.listOrders({});
      assert.equal(orders.items.length, 1);
      const order = await mock.getOrder("order-1");
      assert.equal(order.orderNumber, "1001");

      // 8. getInventory & 9. updateInventory
      const invBefore = await mock.getInventory({ sku: "SKU-PROD-01" });
      assert.equal(invBefore.quantity, 50);

      const updateRes = await mock.updateInventory({ sku: "SKU-PROD-01", quantity: 42 });
      assert.equal(updateRes.acknowledged, true);
      assert.equal(updateRes.status, "ACKNOWLEDGED");

      const invAfter = await mock.getInventory({ sku: "SKU-PROD-01" });
      assert.equal(invAfter.quantity, 42);

      // 10. registerWebhooks
      const hookReg = await mock.registerWebhooks({
        topics: ["orders/create"],
        callbackUrl: "https://api.platform.internal/webhooks/shopify",
      });
      assert.equal(hookReg.success, true);
      assert.ok(hookReg.registeredTopics.includes("orders/create"));

      // 11. verifyWebhook & 12. parseWebhook
      const webhookReq = mock.createSignedWebhookRequest("orders/create", {
        id: "hook-order-99",
        line_items: [{ sku: "SKU-PROD-01", quantity: 2 }],
      });
      const isValid = await mock.verifyWebhook(webhookReq);
      assert.equal(isValid, true);

      const parsedEvent = await mock.parseWebhook(webhookReq);
      assert.equal(parsedEvent.eventType, "ORDER_CREATED");
      assert.equal(parsedEvent.id, "hook-order-99");

      // 13. healthCheck
      const health = await mock.healthCheck();
      assert.equal(health.status, "CONNECTED");
      assert.equal(health.provider, "SHOPIFY");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Explicit Capability Detection
  // --------------------------------------------------------------------------
  describe("2. Explicit Capability Detection & Honest Declaration", () => {
    it("should accurately reflect supported and unsupported capabilities for each provider", () => {
      // Shopify: Supports webhooks, immediate read-back; does not support bulk inventory feeds
      assert.equal(SHOPIFY_CAPABILITIES.supportsWebhooks, true);
      assert.equal(SHOPIFY_CAPABILITIES.supportsImmediateReadBack, true);
      assert.equal(SHOPIFY_CAPABILITIES.supportsBulkInventory, false);
      assert.equal(SHOPIFY_CAPABILITIES.supportsGraphQLAdmin, true);

      // Amazon: Uses SQS/EventBridge, NOT webhooks; eventual consistency; bulk feeds
      assert.equal(AMAZON_CAPABILITIES.supportsWebhooks, false);
      assert.equal(AMAZON_CAPABILITIES.supportsImmediateReadBack, false);
      assert.equal(AMAZON_CAPABILITIES.supportsBulkInventory, true);
      assert.equal(AMAZON_CAPABILITIES.supportsFba, true);

      // eBay: No standard webhooks; immediate readback; bulk inventory
      assert.equal(EBAY_CAPABILITIES.supportsWebhooks, false);
      assert.equal(EBAY_CAPABILITIES.supportsImmediateReadBack, true);
      assert.equal(EBAY_CAPABILITIES.supportsBulkInventory, true);

      // Walmart: No webhooks; async feeds; ship nodes
      assert.equal(WALMART_CAPABILITIES.supportsWebhooks, false);
      assert.equal(WALMART_CAPABILITIES.supportsImmediateReadBack, false);
      assert.equal(WALMART_CAPABILITIES.supportsBulkInventory, true);
      assert.equal(WALMART_CAPABILITIES.supportsAsyncFeeds, true);
      assert.equal(WALMART_CAPABILITIES.supportsShipNodes, true);
    });

    it("should assert capabilities correctly and reject unsupported operations", () => {
      const amazon = new AmazonAdapter();
      const shopify = new ShopifyAdapter();

      // Shopify supports webhooks
      assert.equal(hasCapability(shopify, "supportsWebhooks"), true);
      assert.doesNotThrow(() => assertCapability(shopify, "supportsWebhooks"));

      // Amazon does not support webhooks
      assert.equal(hasCapability(amazon, "supportsWebhooks"), false);
      assert.throws(
        () => assertCapability(amazon, "supportsWebhooks"),
        (err: unknown) => {
          assert.ok(err instanceof ProviderOperationUnsupportedError);
          assert.equal(err.classification, "VALIDATION");
          assert.equal(err.provider, "AMAZON");
          assert.match(err.message, /supportsWebhooks/);
          return true;
        }
      );
    });

    it("should reject calling webhook methods on adapters that do not support webhooks", async () => {
      const amazon = new AmazonAdapter();
      await assert.rejects(
        async () => amazon.registerWebhooks(),
        (err: unknown) => {
          assert.ok(err instanceof ProviderOperationUnsupportedError);
          assert.equal(err.provider, "AMAZON");
          return true;
        }
      );

      const walmart = new WalmartAdapter();
      await assert.rejects(
        async () => walmart.verifyWebhook({ headers: {}, rawBody: "{}" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderOperationUnsupportedError);
          assert.equal(err.provider, "WALMART");
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. Provider-Neutral Error Normalization
  // --------------------------------------------------------------------------
  describe("3. Provider-Neutral Error Normalization", () => {
    describe("Shopify Error Normalizer", () => {
      const normalizer = new ShopifyErrorNormalizer();

      it("should normalize GraphQL THROTTLED into ProviderRateLimitError", () => {
        const raw = {
          errors: [
            {
              message: "Throttled",
              extensions: { code: "THROTTLED" },
            },
          ],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderRateLimitError);
        assert.equal(err.classification, "RATE_LIMIT");
        assert.equal(err.isRetryable, true);
        assert.equal(err.httpStatus, 429);
      });

      it("should normalize ACCESS_DENIED into ProviderAuthenticationError", () => {
        const raw = {
          errors: [
            {
              message: "Access denied for this scope",
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderAuthenticationError);
        assert.equal(err.classification, "AUTHENTICATION");
        assert.equal(err.isRetryable, false);
      });

      it("should normalize userErrors into ProviderValidationError or ProviderConflictError", () => {
        const validationRaw = {
          userErrors: [{ field: ["quantity"], message: "Quantity must be positive", code: "INVALID" }],
        };
        const valErr = normalizer.normalize(validationRaw);
        assert.ok(valErr instanceof ProviderValidationError);
        assert.equal(valErr.classification, "VALIDATION");

        const conflictRaw = {
          userErrors: [{ message: "Stale compare_digest conflict", code: "STALE_INVENTORY" }],
        };
        const confErr = normalizer.normalize(conflictRaw);
        assert.ok(confErr instanceof ProviderConflictError);
        assert.equal(confErr.classification, "CONFLICT");
      });

      it("should parse retry-after headers accurately", () => {
        const err = normalizer.normalize({ status: 429 }, { retryAfterHeader: "5" });
        assert.ok(err instanceof ProviderRateLimitError);
        assert.equal(err.retryAfterMs, 5000);
      });
    });

    describe("Amazon SP-API Error Normalizer", () => {
      const normalizer = new AmazonErrorNormalizer();

      it("should normalize QuotaExceeded into ProviderRateLimitError", () => {
        const raw = {
          errors: [{ code: "QuotaExceeded", message: "You exceeded your quota of requests" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderRateLimitError);
        assert.equal(err.classification, "RATE_LIMIT");
        assert.equal(err.isRetryable, true);
      });

      it("should normalize Unauthorized / AccessDenied into ProviderAuthenticationError", () => {
        const raw = {
          errors: [{ code: "Unauthorized", message: "Access token is missing or invalid" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderAuthenticationError);
        assert.equal(err.classification, "AUTHENTICATION");
        assert.equal(err.isRetryable, false);
      });

      it("should normalize NotFound into ProviderNotFoundError", () => {
        const raw = {
          errors: [{ code: "NotFound", message: "Requested order was not found" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderNotFoundError);
        assert.equal(err.classification, "NOT_FOUND");
      });
    });

    describe("eBay Error Normalizer", () => {
      const normalizer = new EbayErrorNormalizer();

      it("should normalize call limit error 10007 into ProviderRateLimitError", () => {
        const raw = {
          errors: [{ errorId: 10007, domain: "API_PLATFORM", category: "REQUEST", message: "Call limit exceeded" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderRateLimitError);
        assert.equal(err.classification, "RATE_LIMIT");
      });

      it("should normalize token expired error 1001 into ProviderAuthenticationError", () => {
        const raw = {
          errors: [{ errorId: 1001, domain: "SECURITY", category: "APPLICATION", message: "Token has expired" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderAuthenticationError);
        assert.equal(err.classification, "AUTHENTICATION");
      });
    });

    describe("Walmart Error Normalizer", () => {
      const normalizer = new WalmartErrorNormalizer();

      it("should normalize 429 rate limit into ProviderRateLimitError", () => {
        const raw = {
          errors: [{ code: "429.RATE_LIMIT", description: "Rate limit exceeded" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderRateLimitError);
        assert.equal(err.classification, "RATE_LIMIT");
      });

      it("should normalize 401 signature failure into ProviderAuthenticationError", () => {
        const raw = {
          errors: [{ code: "UNAUTHORIZED", description: "Invalid signature or authorization header" }],
        };
        const err = normalizer.normalize(raw);
        assert.ok(err instanceof ProviderAuthenticationError);
        assert.equal(err.classification, "AUTHENTICATION");
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4. Provider Isolation Architecture
  // --------------------------------------------------------------------------
  describe("4. Provider Isolation Architecture & Registry", () => {
    it("should isolate Shopify, Amazon, eBay, and Walmart into distinct modules", () => {
      const shopify = new ShopifyAdapter();
      const amazon = new AmazonAdapter();
      const ebay = new EbayAdapter();
      const walmart = new WalmartAdapter();

      assert.equal(shopify.provider, "SHOPIFY");
      assert.equal(amazon.provider, "AMAZON");
      assert.equal(ebay.provider, "EBAY");
      assert.equal(walmart.provider, "WALMART");

      // Verify they do not share internal state or capabilities
      assert.notEqual(shopify.capabilities, amazon.capabilities);
      assert.notEqual(ebay.capabilities, walmart.capabilities);
    });

    it("should register and discover adapters in AdapterRegistry", () => {
      const registry = createDefaultAdapterRegistry();
      assert.equal(registry.has("SHOPIFY"), true);
      assert.equal(registry.has("AMAZON"), true);
      assert.equal(registry.has("EBAY"), true);
      assert.equal(registry.has("WALMART"), true);

      const shopify = registry.get("SHOPIFY");
      assert.equal(shopify.provider, "SHOPIFY");

      const caps = registry.getCapabilities("AMAZON");
      assert.equal(caps.supportsFba, true);

      const providers = registry.listProviders();
      assert.equal(providers.length, 4);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Operational Honesty Gate
  // --------------------------------------------------------------------------
  describe("5. Operational Honesty Gate (Prompt 13 Invariant)", () => {
    it("should report non-operational status for adapters prior to their dedicated phases", () => {
      const shopify = new ShopifyAdapter();
      const amazon = new AmazonAdapter();
      const ebay = new EbayAdapter();
      const walmart = new WalmartAdapter();

      assert.equal(shopify.isOperational(), false);
      assert.equal(amazon.isOperational(), false);
      assert.equal(ebay.isOperational(), false);
      assert.equal(walmart.isOperational(), false);
    });

    it("should throw structured ProviderNotOperationalError on live execution attempts", async () => {
      const ebay = new EbayAdapter();
      await assert.rejects(
        async () => ebay.authenticate({ clientId: "test-client" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderNotOperationalError);
          assert.equal(err.provider, "EBAY");
          assert.match(err.message, /Phase 15/);
          return true;
        }
      );

      const walmart = new WalmartAdapter();
      await assert.rejects(
        async () => walmart.authenticate({ clientId: "test-client" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderNotOperationalError);
          assert.equal(err.provider, "WALMART");
          assert.match(err.message, /Phase 16/);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. Deterministic Mock Provider Contract Compliance & Fault Injection
  // --------------------------------------------------------------------------
  describe("6. Deterministic Mock Provider & Fault Injection", () => {
    it("should report operational status as true for mock adapter", () => {
      const mock = new MockChannelAdapter();
      assert.equal(mock.isOperational(), true);
    });

    it("should record invocation telemetry and call history for assertions", async () => {
      const mock = new MockChannelAdapter();
      await mock.getAccount();
      await mock.getInventory({ sku: "TEST-SKU" });

      assert.equal(mock.calls.length, 2);
      assert.equal(mock.calls[0].method, "getAccount");
      assert.equal(mock.calls[1].method, "getInventory");
    });

    it("should simulate rate limit fault injection with retry-after metadata", async () => {
      const mock = new MockChannelAdapter();
      mock.setFault({ rateLimit: true, rateLimitRetryAfterMs: 3500 });

      await assert.rejects(
        async () => mock.updateInventory({ sku: "SKU-1", quantity: 10 }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderRateLimitError);
          assert.equal(err.classification, "RATE_LIMIT");
          assert.equal(err.retryAfterMs, 3500);
          return true;
        }
      );

      mock.clearFaults();
      const res = await mock.updateInventory({ sku: "SKU-1", quantity: 10 });
      assert.equal(res.acknowledged, true);
    });

    it("should simulate authentication expiration fault injection", async () => {
      const mock = new MockChannelAdapter();
      mock.setFault({ authError: true });

      await assert.rejects(
        async () => mock.getInventory({ sku: "SKU-1" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderAuthenticationError);
          assert.equal(err.classification, "AUTHENTICATION");
          return true;
        }
      );
    });

    it("should simulate transient server failure fault injection", async () => {
      const mock = new MockChannelAdapter();
      mock.setFault({ transientError: true });

      await assert.rejects(
        async () => mock.listProducts(),
        (err: unknown) => {
          assert.ok(err instanceof ProviderTransientError);
          assert.equal(err.classification, "TRANSIENT");
          assert.equal(err.isRetryable, true);
          return true;
        }
      );
    });

    it("should verify webhook signatures deterministically and reject tampered bodies", async () => {
      const secret = "super_secure_webhook_secret_xyz";
      const mock = new MockChannelAdapter({ webhookSecret: secret });

      // Valid signed webhook
      const validReq = mock.createSignedWebhookRequest("inventory/update", { sku: "SKU-1", qty: 25 }, secret);
      const isSignatureValid = await mock.verifyWebhook(validReq);
      assert.equal(isSignatureValid, true);

      // Tampered payload
      const tamperedReq = {
        ...validReq,
        rawBody: JSON.stringify({ sku: "SKU-1", qty: 99999 }), // tampered
      };
      const isTamperedValid = await mock.verifyWebhook(tamperedReq);
      assert.equal(isTamperedValid, false);

      // Missing signature header
      const missingSigReq = {
        headers: {},
        rawBody: validReq.rawBody,
      };
      const isMissingValid = await mock.verifyWebhook(missingSigReq);
      assert.equal(isMissingValid, false);
    });

    it("should evaluate all 6 canonical health states accurately (Section 42)", async () => {
      const mock = new MockChannelAdapter();

      const healthStates: Array<import("@platform/contracts").ProviderHealthState> = [
        "CONNECTED",
        "DEGRADED",
        "AUTH_REQUIRED",
        "RATE_LIMITED",
        "ERROR",
        "DISCONNECTED",
      ];

      for (const state of healthStates) {
        mock.setHealthState(state, `System state is ${state}`);
        const status = await mock.healthCheck();
        assert.equal(status.status, state);
        assert.equal(status.message, `System state is ${state}`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 7. SyncEngine Integration Gate
  // --------------------------------------------------------------------------
  describe("7. SyncEngine Integration Gate", () => {
    it("should execute SyncEngine through full canonical lifecycle using ChannelAdapter", async () => {
      const syncRepo = new InMemorySyncJobRepository();
      const syncService = new SyncJobService(syncRepo);
      const syncEngine = new SyncEngine(syncService);

      const mockAdapter = new MockChannelAdapter({
        initialInventory: { "SYNC-SKU-1": 10 },
      });

      const enqueueResult = await syncEngine.enqueue({
        organizationId: "org-1",
        channelAccountId: "account-1",
        skuId: "sku-db-1",
        externalSkuId: "SYNC-SKU-1",
        direction: "OUTBOUND",
        syncType: "INVENTORY",
        targetQuantity: 25,
      });

      const outcome = await syncEngine.execute({
        organizationId: "org-1",
        jobId: enqueueResult.job.id,
        adapter: mockAdapter,
        externalSkuId: "SYNC-SKU-1",
      });

      assert.equal(outcome.isSuccess, true);
      assert.equal(outcome.finalState, "VERIFIED");

      // Verify the mock adapter's internal inventory was updated and verified
      const finalInv = await mockAdapter.getInventory({ sku: "SYNC-SKU-1" });
      assert.equal(finalInv.quantity, 25);
    });

    it("should transition to CONFLICT when read-back verification detects quantity mismatch", async () => {
      const syncRepo = new InMemorySyncJobRepository();
      const syncService = new SyncJobService(syncRepo);
      const syncEngine = new SyncEngine(syncService);

      const mockAdapter = new MockChannelAdapter({
        initialInventory: { "SYNC-SKU-CONFLICT": 10 },
      });
      // Simulate that channel accepted write of 50, but read-back returns 30 (mismatch)
      mockAdapter.setFault({ readBackMismatchQuantity: 30 });

      const enqueueResult = await syncEngine.enqueue({
        organizationId: "org-1",
        channelAccountId: "account-1",
        skuId: "sku-db-1",
        externalSkuId: "SYNC-SKU-CONFLICT",
        direction: "OUTBOUND",
        syncType: "INVENTORY",
        targetQuantity: 50,
      });

      const outcome = await syncEngine.execute({
        organizationId: "org-1",
        jobId: enqueueResult.job.id,
        adapter: mockAdapter,
        externalSkuId: "SYNC-SKU-CONFLICT",
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "CONFLICT");
      assert.match(outcome.error?.message ?? "", /Verification detected discrepancy/);
    });

    it("should transition to RETRYING when adapter returns rate limit error", async () => {
      const syncRepo = new InMemorySyncJobRepository();
      const syncService = new SyncJobService(syncRepo);
      const syncEngine = new SyncEngine(syncService);

      const mockAdapter = new MockChannelAdapter();
      mockAdapter.setFault({ rateLimit: true, rateLimitRetryAfterMs: 4000 });

      const enqueueResult = await syncEngine.enqueue({
        organizationId: "org-1",
        channelAccountId: "account-1",
        skuId: "sku-db-1",
        externalSkuId: "SYNC-SKU-RL",
        direction: "OUTBOUND",
        syncType: "INVENTORY",
        targetQuantity: 15,
      });

      const outcome = await syncEngine.execute({
        organizationId: "org-1",
        jobId: enqueueResult.job.id,
        adapter: mockAdapter,
        externalSkuId: "SYNC-SKU-RL",
      });

      assert.equal(outcome.isSuccess, false);
      assert.equal(outcome.finalState, "RETRYING");
      assert.equal(outcome.error?.classification, "RATE_LIMIT");
      assert.equal(outcome.error?.isRetryable, true);
    });
  });
});
