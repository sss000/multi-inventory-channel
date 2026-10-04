/**
 * Phase 13: Shopify Adapter Acceptance Suite
 * Canonical Specifications: Section 36, 37 of 01_ENGINEERING_SPEC.md & Prompt 14
 * 
 * Verifies:
 * 1. API Version Compatibility & Startup Validation (2025-01, rejects unstable/RC).
 * 2. OAuth Lifecycle (URL generation, CSRF state, HMAC callback signature, code exchange, AES token encryption).
 * 3. Catalog Import (Products, variants, mapping, preserving inventoryItemId).
 * 4. Identifier Distinction Invariant (Product != Variant != InventoryItem != Location).
 * 5. Inventory Read & Write (Retrieval by location, inventorySetQuantities mutation, userErrors).
 * 6. Order Ingestion (GraphQL order query, line item mapping).
 * 7. Webhook Verification, Duplicate Detection, and Uninstall Handling.
 * 8. Leaky Bucket Rate Limiting, Retries with Jitter, Timeouts, and Auth Failures.
 * 9. Provider Health Diagnostics (CONNECTED, DEGRADED, RATE_LIMITED, AUTH_REQUIRED, DISCONNECTED).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ShopifyAdapter,
  ShopifyGraphQLClient,
  validateShopifyApiVersion,
  assertValidShopifyApiVersion,
  buildOAuthAuthorizationUrl,
  verifyOAuthCallback,
  exchangeOAuthCode,
  encryptToken,
  decryptToken,
  sanitizeShopDomain,
  ShopifyWebhookDeduplicator,
  verifyShopifyWebhookHmac,
  parseShopifyWebhook,
  ProviderRateLimitError,
  ProviderAuthenticationError,
  ProviderValidationError,
  ProviderConflictError,
  SHOPIFY_DEFAULT_API_VERSION,
  type WebhookRequest,
} from "@platform/integrations";

describe("Phase 13: Shopify Adapter Acceptance Suite", () => {
  const mockShop = "test-store.myshopify.com";
  const mockToken = "shpat_mock_access_token_123456789";
  const mockApiKey = "mock_api_key_abc";
  const mockApiSecret = "mock_api_secret_xyz123";

  // --------------------------------------------------------------------------
  // 1. API Version Compatibility & Startup Validation
  // --------------------------------------------------------------------------
  describe("1. API Version Compatibility Guard", () => {
    it("should accept supported stable versions (e.g. 2025-01, 2024-10)", () => {
      const res2025 = validateShopifyApiVersion("2025-01");
      assert.equal(res2025.valid, true);
      assert.equal(res2025.isStable, true);
      assert.equal(res2025.isUnstable, false);

      const res2024 = validateShopifyApiVersion("2024-10");
      assert.equal(res2024.valid, true);

      assert.equal(assertValidShopifyApiVersion(), SHOPIFY_DEFAULT_API_VERSION);
    });

    it("should reject unstable or release-candidate versions per Prompt 14 directive", () => {
      const unstableRes = validateShopifyApiVersion("unstable");
      assert.equal(unstableRes.valid, false);
      assert.equal(unstableRes.isUnstable, true);
      assert.match(unstableRes.error ?? "", /unstable and strictly prohibited/);

      const rcRes = validateShopifyApiVersion("2025-04-rc1");
      assert.equal(rcRes.valid, false);
      assert.equal(rcRes.isReleaseCandidate, true);
      assert.match(rcRes.error ?? "", /release-candidate and strictly prohibited/);

      assert.throws(
        () => assertValidShopifyApiVersion("unstable"),
        /Shopify API Version Validation Failed/
      );
    });

    it("should reject invalid date formats or obsolete unsupported versions", () => {
      const malformed = validateShopifyApiVersion("2025/01");
      assert.equal(malformed.valid, false);
      assert.match(malformed.error ?? "", /YYYY-MM/);

      const obsolete = validateShopifyApiVersion("2021-01");
      assert.equal(obsolete.valid, false);
      assert.match(obsolete.error ?? "", /not in the supported stable set/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. OAuth Lifecycle & Security
  // --------------------------------------------------------------------------
  describe("2. OAuth Lifecycle, State Validation, & Token Encryption", () => {
    it("should sanitize shop domains accurately", () => {
      assert.equal(sanitizeShopDomain("my-brand"), "my-brand.myshopify.com");
      assert.equal(sanitizeShopDomain("https://my-brand.myshopify.com/admin"), "my-brand.myshopify.com");
      assert.equal(sanitizeShopDomain("MY-BRAND.myshopify.com"), "my-brand.myshopify.com");

      assert.throws(() => sanitizeShopDomain(""), (err: unknown) => {
        assert.ok(err instanceof ProviderValidationError);
        return true;
      });
    });

    it("should generate OAuth install URL with CSRF state nonce and minimum required scopes", () => {
      const { url, state, shop } = buildOAuthAuthorizationUrl({
        shop: "brand-store",
        clientId: mockApiKey,
        redirectUri: "https://platform.internal/auth/shopify/callback",
      });

      assert.equal(shop, "brand-store.myshopify.com");
      assert.ok(state.length >= 32);
      assert.ok(url.startsWith("https://brand-store.myshopify.com/admin/oauth/authorize?"));

      const parsedUrl = new URL(url);
      assert.equal(parsedUrl.searchParams.get("client_id"), mockApiKey);
      assert.equal(parsedUrl.searchParams.get("state"), state);
      assert.ok(parsedUrl.searchParams.get("scope")?.includes("read_inventory"));
      assert.ok(parsedUrl.searchParams.get("scope")?.includes("write_inventory"));
      assert.ok(parsedUrl.searchParams.get("scope")?.includes("read_orders"));
    });

    it("should verify timing-safe OAuth callback HMAC signature and detect tampering", () => {
      const callbackQuery = {
        code: "temp_oauth_code_12345",
        shop: "brand-store.myshopify.com",
        state: "known_state_nonce_123",
        timestamp: "1727700000",
      };

      // Construct valid HMAC
      const sortedMessage = Object.keys(callbackQuery)
        .sort()
        .map((k) => `${k}=${(callbackQuery as any)[k]}`)
        .join("&");

      const validHmac = crypto
        .createHmac("sha256", mockApiSecret)
        .update(sortedMessage, "utf8")
        .digest("hex");

      const validResult = verifyOAuthCallback(
        { ...callbackQuery, hmac: validHmac },
        mockApiSecret,
        "known_state_nonce_123"
      );
      assert.equal(validResult.valid, true);
      assert.equal(validResult.shop, "brand-store.myshopify.com");

      // State mismatch (CSRF attack)
      const invalidStateResult = verifyOAuthCallback(
        { ...callbackQuery, hmac: validHmac },
        mockApiSecret,
        "different_state_nonce"
      );
      assert.equal(invalidStateResult.valid, false);
      assert.match(invalidStateResult.error ?? "", /CSRF/);

      // Tampered code parameter
      const tamperedResult = verifyOAuthCallback(
        { ...callbackQuery, code: "tampered_code", hmac: validHmac },
        mockApiSecret,
        "known_state_nonce_123"
      );
      assert.equal(tamperedResult.valid, false);
      assert.match(tamperedResult.error ?? "", /Invalid HMAC/);
    });

    it("should exchange temporary code for permanent access token", async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        assert.equal(url, "https://brand-store.myshopify.com/admin/oauth/access_token");
        assert.equal(init?.method, "POST");
        const body = JSON.parse(init?.body as string);
        assert.equal(body.code, "valid_code_123");
        assert.equal(body.client_id, mockApiKey);
        assert.equal(body.client_secret, mockApiSecret);

        return new Response(
          JSON.stringify({
            access_token: "shpat_permanent_token_999",
            scope: "read_products,write_inventory",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const tokenRes = await exchangeOAuthCode(
        {
          shopDomain: "brand-store",
          code: "valid_code_123",
          clientId: mockApiKey,
          clientSecret: mockApiSecret,
        },
        mockFetch
      );

      assert.equal(tokenRes.access_token, "shpat_permanent_token_999");
      assert.ok(tokenRes.scope.includes("write_inventory"));
    });

    it("should securely encrypt and decrypt access tokens using AES-256-GCM", () => {
      const secretKey = "super_secure_vault_encryption_key_32_bytes";
      const token = "shpat_secret_access_token_super_confidential";

      const encrypted = encryptToken(token, secretKey);
      assert.notEqual(encrypted, token);
      assert.ok(encrypted.includes("iv"));
      assert.ok(encrypted.includes("tag"));
      assert.ok(encrypted.includes("data"));

      const decrypted = decryptToken(encrypted, secretKey);
      assert.equal(decrypted, token);

      // Decryption with wrong secret key fails
      assert.throws(
        () => decryptToken(encrypted, "wrong_secret_key"),
        (err: unknown) => {
          assert.ok(err instanceof ProviderAuthenticationError);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. Catalog Import & Identifier Distinction Invariant
  // --------------------------------------------------------------------------
  describe("3. Catalog Import & Identifier Distinction Invariant (Prompt 14 Gate)", () => {
    it("should list products and map variants while retaining inventoryItemId", async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.ok(body.query.includes("GetCatalogProducts"));

        return new Response(
          JSON.stringify({
            data: {
              products: {
                pageInfo: { hasNextPage: false, endCursor: "cursor-10" },
                nodes: [
                  {
                    id: "gid://shopify/Product/10001",
                    title: "Snowboard Alpine",
                    descriptionHtml: "<p>Best snowboard</p>",
                    status: "ACTIVE",
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: "2026-01-02T00:00:00Z",
                    variants: {
                      nodes: [
                        {
                          id: "gid://shopify/ProductVariant/20001",
                          title: "155cm / Blue",
                          sku: "SNOW-ALP-155-BLU",
                          price: "499.00",
                          barcode: "123456789012",
                          inventoryItem: {
                            id: "gid://shopify/InventoryItem/30001",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const catalog = await adapter.listProducts();
      assert.equal(catalog.items.length, 1);

      const product = catalog.items[0];
      assert.equal(product.id, "gid://shopify/Product/10001");
      assert.equal(product.title, "Snowboard Alpine");
      assert.equal(product.variants.length, 1);

      const variant = product.variants[0];
      assert.equal(variant.id, "gid://shopify/ProductVariant/20001");
      assert.equal(variant.sku, "SNOW-ALP-155-BLU");
      assert.equal(variant.price, 499);

      // CRITICAL SPECIFICATION GATE (Prompt 14):
      // "Correctly distinguish: Shopify Product, Shopify Product Variant, Shopify InventoryItem, Shopify Location.
      // Do not treat these identifiers as interchangeable."
      assert.equal(variant.inventoryItemId, "gid://shopify/InventoryItem/30001");
      assert.notEqual(product.id, variant.id);
      assert.notEqual(variant.id, variant.inventoryItemId);
    });

    it("should retrieve a single product by GID", async () => {
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.ok(body.query.includes("GetProductById"));
        assert.equal(body.variables.id, "gid://shopify/Product/10001");

        return new Response(
          JSON.stringify({
            data: {
              product: {
                id: "gid://shopify/Product/10001",
                title: "Snowboard Alpine",
                status: "ACTIVE",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-02T00:00:00Z",
                variants: { nodes: [] },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const product = await adapter.getProduct("10001");
      assert.equal(product.id, "gid://shopify/Product/10001");
      assert.equal(product.title, "Snowboard Alpine");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Locations & Inventory Read / Write
  // --------------------------------------------------------------------------
  describe("4. Locations & Inventory Retrieval / Update Operations", () => {
    it("should list shop locations and map to internal warehouse references", async () => {
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.ok(body.query.includes("GetShopLocations"));

        return new Response(
          JSON.stringify({
            data: {
              locations: {
                nodes: [
                  { id: "gid://shopify/Location/40001", name: "Main Warehouse", isActive: true },
                  { id: "gid://shopify/Location/40002", name: "Retail Store", isActive: true },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const locations = await adapter.listLocations();
      assert.equal(locations.length, 2);
      assert.equal(locations[0].id, "gid://shopify/Location/40001");
      assert.equal(locations[0].name, "Main Warehouse");
    });

    it("should retrieve inventory levels by inventoryItemId and location", async () => {
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.ok(body.query.includes("GetInventoryItemLevels"));

        return new Response(
          JSON.stringify({
            data: {
              inventoryItem: {
                id: "gid://shopify/InventoryItem/30001",
                inventoryLevels: {
                  nodes: [
                    {
                      id: "gid://shopify/InventoryLevel/50001",
                      location: { id: "gid://shopify/Location/40001" },
                      quantities: [
                        { name: "available", quantity: 88 },
                        { name: "on_hand", quantity: 100 },
                      ],
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const inv = await adapter.getInventory({
        sku: "gid://shopify/InventoryItem/30001",
        locationId: "40001",
      });

      assert.equal(inv.quantity, 88);
      assert.equal(inv.locationId, "gid://shopify/Location/40001");
    });

    it("should update inventory using inventorySetQuantities mutation", async () => {
      let mutationPayload: any;
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        if (body.query.includes("GetShopLocations")) {
          return new Response(
            JSON.stringify({
              data: {
                locations: {
                  nodes: [{ id: "gid://shopify/Location/40001", name: "Main", isActive: true }],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        assert.ok(body.query.includes("SetInventoryQuantity"));
        mutationPayload = body.variables.input;

        return new Response(
          JSON.stringify({
            data: {
              inventorySetQuantities: {
                inventoryAdjustmentGroup: {
                  reason: "correction",
                  changes: [{ name: "available", delta: 12, quantityAfterChange: 100 }],
                },
                userErrors: [],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const res = await adapter.updateInventory({
        sku: "gid://shopify/InventoryItem/30001",
        quantity: 100,
        locationId: "gid://shopify/Location/40001",
      });

      assert.equal(res.acknowledged, true);
      assert.equal(res.status, "ACKNOWLEDGED");
      assert.equal(mutationPayload.quantities[0].quantity, 100);
      assert.equal(mutationPayload.quantities[0].inventoryItemId, "gid://shopify/InventoryItem/30001");
      assert.equal(mutationPayload.quantities[0].locationId, "gid://shopify/Location/40001");
    });

    it("should handle inventory userErrors and map conflicts to ProviderConflictError", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            data: {
              inventorySetQuantities: {
                userErrors: [
                  {
                    field: ["quantities", "0"],
                    message: "The inventory level was changed by another user. Stale compare quantity.",
                    code: "STALE_INVENTORY",
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      await assert.rejects(
        async () =>
          adapter.updateInventory({
            sku: "gid://shopify/InventoryItem/30001",
            quantity: 50,
            locationId: "40001",
          }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderConflictError);
          assert.equal(err.classification, "CONFLICT");
          assert.match(err.message, /Stale compare quantity/);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. Order Ingestion
  // --------------------------------------------------------------------------
  describe("5. Order Ingestion", () => {
    it("should list orders, map pricing, line items, and variant relations", async () => {
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.ok(body.query.includes("GetOrdersList"));

        return new Response(
          JSON.stringify({
            data: {
              orders: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  {
                    id: "gid://shopify/Order/90001",
                    name: "#1001",
                    createdAt: "2026-03-01T12:00:00Z",
                    updatedAt: "2026-03-01T12:05:00Z",
                    displayFinancialStatus: "PAID",
                    displayFulfillmentStatus: "UNFULFILLED",
                    totalPriceSet: {
                      shopMoney: { amount: "149.99", currencyCode: "USD" },
                    },
                    lineItems: {
                      nodes: [
                        {
                          id: "gid://shopify/LineItem/80001",
                          sku: "SKU-SNOW-01",
                          quantity: 1,
                          title: "Snowboard Boots",
                          variant: {
                            id: "gid://shopify/ProductVariant/20001",
                            product: { id: "gid://shopify/Product/10001" },
                          },
                          originalUnitPriceSet: {
                            shopMoney: { amount: "149.99", currencyCode: "USD" },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const orderPage = await adapter.listOrders({ limit: 10 });
      assert.equal(orderPage.items.length, 1);

      const order = orderPage.items[0];
      assert.equal(order.id, "gid://shopify/Order/90001");
      assert.equal(order.orderNumber, "#1001");
      assert.equal(order.totalPrice, 149.99);
      assert.equal(order.currency, "USD");
      assert.equal(order.items.length, 1);

      const item = order.items[0];
      assert.equal(item.externalSku, "SKU-SNOW-01");
      assert.equal(item.externalProductId, "gid://shopify/Product/10001");
      assert.equal(item.externalVariantId, "gid://shopify/ProductVariant/20001");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Webhooks, Duplicate Detection, & Uninstall Handling
  // --------------------------------------------------------------------------
  describe("6. Webhook Registration, Validation, Duplicate Filtering, & Uninstall", () => {
    it("should verify authentic HMAC signatures and reject tampered payloads", async () => {
      const adapter = new ShopifyAdapter({
        shopDomain: mockShop,
        accessToken: mockToken,
        apiSecret: mockApiSecret,
      });

      const body = JSON.stringify({ id: 999, note: "Original" });
      const hmac = crypto
        .createHmac("sha256", mockApiSecret)
        .update(body, "utf8")
        .digest("base64");

      const validRequest: WebhookRequest = {
        headers: { "x-shopify-hmac-sha256": hmac, "x-shopify-topic": "orders/create" },
        rawBody: body,
      };

      assert.equal(await adapter.verifyWebhook(validRequest), true);

      // Tampered payload
      const tamperedRequest: WebhookRequest = {
        headers: { "x-shopify-hmac-sha256": hmac, "x-shopify-topic": "orders/create" },
        rawBody: JSON.stringify({ id: 999, note: "TAMPERED" }),
      };
      assert.equal(await adapter.verifyWebhook(tamperedRequest), false);
    });

    it("should detect duplicate webhook events by X-Shopify-Webhook-Id", async () => {
      const adapter = new ShopifyAdapter({
        shopDomain: mockShop,
        accessToken: mockToken,
        apiSecret: mockApiSecret,
      });

      const webhookId = "webhook_guid_12345_unique";
      const request: WebhookRequest = {
        headers: {
          "x-shopify-topic": "orders/create",
          "x-shopify-webhook-id": webhookId,
        },
        rawBody: JSON.stringify({ id: 101, name: "Order #101" }),
      };

      const event1 = await adapter.parseWebhook(request);
      assert.equal(event1.id, webhookId);
      assert.equal(event1.payload._isDuplicate, undefined);

      // Second delivery of same webhook ID
      const event2 = await adapter.parseWebhook(request);
      assert.equal(event2.id, webhookId);
      assert.equal(event2.payload._isDuplicate, true);
    });

    it("should handle app/uninstalled topic and transition adapter to disconnected", async () => {
      const adapter = new ShopifyAdapter({
        shopDomain: mockShop,
        accessToken: mockToken,
      });

      assert.equal(adapter.isOperational(), true);

      const uninstallRequest: WebhookRequest = {
        headers: { "x-shopify-topic": "app/uninstalled" },
        rawBody: JSON.stringify({ shop_id: 12345 }),
      };

      const event = await adapter.parseWebhook(uninstallRequest);
      assert.equal(event.eventType, "APP_UNINSTALLED");
      assert.equal(adapter.isOperational(), false);

      const health = await adapter.healthCheck();
      assert.equal(health.status, "DISCONNECTED");
      assert.match(health.message ?? "", /uninstalled/);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Rate Limiting, Retries with Jitter, & Error Handling
  // --------------------------------------------------------------------------
  describe("7. Rate Limiting & Leaky Bucket Throttle Handling", () => {
    it("should track leaky bucket capacity from GraphQL extensions", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            data: { shop: { id: "1" } },
            extensions: {
              cost: {
                requestedQueryCost: 50,
                actualQueryCost: 40,
                throttleStatus: {
                  maximumAvailable: 1000,
                  currentlyAvailable: 850,
                  restoreRate: 50,
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const client = new ShopifyGraphQLClient(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      await client.request({ query: "{ shop { id } }" });
      const bucket = client.getBucketState();

      assert.equal(bucket.maximumAvailable, 1000);
      assert.equal(Math.floor(bucket.currentlyAvailable), 850);
      assert.equal(bucket.restoreRate, 50);
    });

    it("should retry with jitter on HTTP 429 and eventually succeed", async () => {
      let attempts = 0;
      const mockFetch: typeof fetch = async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ errors: [{ message: "Too many requests" }] }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "0.05", // 50ms
            },
          });
        }
        return new Response(JSON.stringify({ data: { shop: { id: "1" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const client = new ShopifyGraphQLClient(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const res = await client.request({ query: "{ shop { id } }" });
      assert.equal(attempts, 2);
      assert.ok(res.data);
    });

    it("should normalize authentication failures accurately", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            errors: [
              {
                message: "Access denied for this shop",
                extensions: { code: "UNAUTHORIZED" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const client = new ShopifyGraphQLClient(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      await assert.rejects(
        async () => client.request({ query: "{ shop { id } }" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderAuthenticationError);
          assert.equal(err.classification, "AUTHENTICATION");
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8. Provider Health Diagnostics
  // --------------------------------------------------------------------------
  describe("8. Provider Health Diagnostics (Section 42 Conformance)", () => {
    it("should report CONNECTED with rate limit headroom when healthy", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            data: { shop: { id: "1" } },
            extensions: {
              cost: {
                throttleStatus: {
                  maximumAvailable: 1000,
                  currentlyAvailable: 950,
                  restoreRate: 50,
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const health = await adapter.healthCheck();
      assert.equal(health.status, "CONNECTED");
      assert.equal(health.provider, "SHOPIFY");
      assert.equal(health.rateLimitHeadroom, 95);
      assert.ok(health.latencyMs !== undefined);
    });

    it("should report RATE_LIMITED when available bucket points are critically low", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            data: { shop: { id: "1" } },
            extensions: {
              cost: {
                throttleStatus: {
                  maximumAvailable: 1000,
                  currentlyAvailable: 50, // 5%
                  restoreRate: 50,
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new ShopifyAdapter(
        { shopDomain: mockShop, accessToken: mockToken },
        { fetchFn: mockFetch }
      );

      const health = await adapter.healthCheck();
      assert.equal(health.status, "RATE_LIMITED");
      assert.equal(health.rateLimitHeadroom, 5);
    });

    it("should report AUTH_REQUIRED when access token is missing or unauthorized", async () => {
      const adapter = new ShopifyAdapter({ shopDomain: mockShop }); // no access token
      const health = await adapter.healthCheck();
      assert.equal(health.status, "AUTH_REQUIRED");
    });
  });
});
