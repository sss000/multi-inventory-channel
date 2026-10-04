/**
 * Phase 15: Amazon Adapter Acceptance Suite
 * Canonical Specifications: Section 38, 39 of 01_ENGINEERING_SPEC.md & Prompt 16
 * 
 * Verifies:
 * 1. API Version Compatibility & Deprecation Guard (Orders 2024-06-01, Listings 2021-08-01, rejects Orders v0).
 * 2. SP-API Operations Catalog (Roles, Scopes, Regions, PII, Throttling, Retry Semantics).
 * 3. Marketplace Selection & Region Endpoint Resolution (NA, EU, FE).
 * 4. LWA Authorization & Token Lifecycle (Code exchange, token refresh, caching, 401 eviction, auth failure).
 * 5. Section 39 Fulfillment Channel Isolation (MFN vs FBA, merchant push to FBA rejected).
 * 6. Order Ingestion & Normalization (Orders 2024-06-01, line items, fulfillment channels).
 * 7. Rate Limiting, Token Bucket & Throttling Backoff (HTTP 429 RequestThrottled).
 * 8. Timeout, Authentication Failure & Error Normalization.
 * 9. SQS/EventBridge Notification Processing & Deduplication.
 * 10. Inventory Reconciliation & Provider Health Diagnostics.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AmazonAdapter,
  AmazonLwaClient,
  AmazonSpApiClient,
  AmazonNotificationDeduplicator,
  parseAmazonNotification,
  assertNotDeprecatedSpApiVersion,
  SP_API_SUPPORTED_VERSIONS,
  SP_API_DEPRECATED_VERSIONS,
  AMAZON_MARKETPLACES,
  AMAZON_REGION_ENDPOINTS,
  SP_API_OPERATIONS_CATALOG,
  ProviderRateLimitError,
  ProviderAuthenticationError,
  ProviderValidationError,
  ProviderTransientError,
  type AmazonCredentials,
  type AmazonNotificationPayload,
} from "@platform/integrations";

describe("Phase 15: Amazon Adapter Acceptance Suite", () => {
  const mockSellerId = "A1TESTSELLER99";
  const mockMarketplaceId = "ATVPDKIKX0DER"; // US Marketplace
  const mockClientId = "amzn1.application-oa2-client.test123456";
  const mockClientSecret = "amzn1.oa2-cs.v1.testsecret987654321";
  const mockRefreshToken = "Atzr|IwEBI...test_refresh_token_abc";
  const mockAccessToken = "Atza|IQEBL...test_access_token_xyz";

  const standardCredentials: AmazonCredentials = {
    sellerId: mockSellerId,
    marketplaceId: mockMarketplaceId,
    clientId: mockClientId,
    clientSecret: mockClientSecret,
    refreshToken: mockRefreshToken,
    region: "NA",
  };

  // --------------------------------------------------------------------------
  // 1. API Version Compatibility & Deprecation Guard
  // --------------------------------------------------------------------------
  describe("1. API Version Compatibility & Deprecation Guard", () => {
    it("should allow officially supported SP-API versions", () => {
      assert.equal(SP_API_SUPPORTED_VERSIONS.ORDERS, "2024-06-01");
      assert.equal(SP_API_SUPPORTED_VERSIONS.LISTINGS_ITEMS, "2021-08-01");
      assert.equal(SP_API_SUPPORTED_VERSIONS.FBA_INVENTORY, "v1");
      assert.equal(SP_API_SUPPORTED_VERSIONS.FEEDS, "2021-06-30");
      assert.equal(SP_API_SUPPORTED_VERSIONS.NOTIFICATIONS, "v1");
      assert.equal(SP_API_SUPPORTED_VERSIONS.SELLERS, "v1");

      // Verify assertNotDeprecatedSpApiVersion accepts supported versions
      assert.doesNotThrow(() => {
        assertNotDeprecatedSpApiVersion("orders", "2024-06-01");
        assertNotDeprecatedSpApiVersion("listings", "2021-08-01");
        assertNotDeprecatedSpApiVersion("fba", "v1");
      });
    });

    it("should strictly reject deprecated versions (e.g. Orders v0) with clear explanation", () => {
      assert.ok(SP_API_DEPRECATED_VERSIONS.includes("orders/v0"));

      assert.throws(
        () => assertNotDeprecatedSpApiVersion("orders", "v0"),
        (err: unknown) => {
          assert.ok(err instanceof ProviderValidationError);
          assert.equal(err.provider, "AMAZON");
          assert.ok(err.message.includes("deprecated"));
          assert.ok(err.message.includes("2024-06-01"));
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. SP-API Operations Catalog
  // --------------------------------------------------------------------------
  describe("2. SP-API Operations Catalog Documentation", () => {
    it("should document role, scope, region, PII, throttling and retry semantics for all core operations", () => {
      const operations = [
        "GET_ORDERS",
        "GET_ORDER_ITEMS",
        "GET_LISTINGS_ITEM",
        "PATCH_LISTINGS_ITEM",
        "GET_FBA_INVENTORY_SUMMARIES",
        "CREATE_FEED",
        "GET_FEED",
        "GET_PARTICIPATIONS",
      ] as const;

      for (const opKey of operations) {
        const spec = SP_API_OPERATIONS_CATALOG[opKey];
        assert.ok(spec, `Operation spec for ${opKey} must exist`);
        assert.ok(spec.requiredRole.length > 0, `${opKey} must document requiredRole`);
        assert.ok(spec.requiredScope.length > 0, `${opKey} must document requiredScope`);
        assert.ok(spec.supportedRegions.length >= 3, `${opKey} must support NA, EU, FE`);
        assert.equal(typeof spec.requiresPii, "boolean", `${opKey} must document requiresPii`);
        assert.ok(spec.throttling.requestsPerSecond > 0, `${opKey} must document rate limit RPS`);
        assert.ok(spec.throttling.burst >= 1, `${opKey} must document rate limit burst`);
        assert.ok(spec.retrySemantics.retryableHttpCodes.includes(429), `${opKey} must handle 429`);
      }

      // Verify specific requirements
      assert.equal(SP_API_OPERATIONS_CATALOG.GET_ORDERS.requiresPii, true);
      assert.equal(SP_API_OPERATIONS_CATALOG.PATCH_LISTINGS_ITEM.requiresPii, false);
      assert.equal(SP_API_OPERATIONS_CATALOG.GET_FBA_INVENTORY_SUMMARIES.requiresPii, false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Marketplace Selection & Region Endpoint Resolution
  // --------------------------------------------------------------------------
  describe("3. Marketplace Selection & Region Resolution", () => {
    it("should resolve correct base endpoint and currency for NA marketplaces (US, CA, MX)", () => {
      const us = AMAZON_MARKETPLACES["ATVPDKIKX0DER"];
      assert.equal(us.countryCode, "US");
      assert.equal(us.region, "NA");
      assert.equal(us.currencyCode, "USD");
      assert.equal(AMAZON_REGION_ENDPOINTS[us.region], "https://sellingpartnerapi-na.amazon.com");

      const ca = AMAZON_MARKETPLACES["A2EUQ1WTGCTBG2"];
      assert.equal(ca.countryCode, "CA");
      assert.equal(ca.region, "NA");
      assert.equal(ca.currencyCode, "CAD");

      const mx = AMAZON_MARKETPLACES["A1AM78C64UM0Y8"];
      assert.equal(mx.countryCode, "MX");
      assert.equal(mx.region, "NA");
      assert.equal(mx.currencyCode, "MXN");
    });

    it("should resolve correct base endpoint for EU marketplaces (UK, DE)", () => {
      const uk = AMAZON_MARKETPLACES["A1F83G8C2ARO7P"];
      assert.equal(uk.countryCode, "GB");
      assert.equal(uk.region, "EU");
      assert.equal(uk.currencyCode, "GBP");
      assert.equal(AMAZON_REGION_ENDPOINTS[uk.region], "https://sellingpartnerapi-eu.amazon.com");

      const de = AMAZON_MARKETPLACES["A1PA6795UKMFR9"];
      assert.equal(de.countryCode, "DE");
      assert.equal(de.region, "EU");
      assert.equal(de.currencyCode, "EUR");
    });

    it("should resolve correct base endpoint for Far East marketplaces (JP, AU)", () => {
      const jp = AMAZON_MARKETPLACES["A1VC38T7YXB528"];
      assert.equal(jp.countryCode, "JP");
      assert.equal(jp.region, "FE");
      assert.equal(jp.currencyCode, "JPY");
      assert.equal(AMAZON_REGION_ENDPOINTS[jp.region], "https://sellingpartnerapi-fe.amazon.com");

      const au = AMAZON_MARKETPLACES["A39IBJ37TRP1C6"];
      assert.equal(au.countryCode, "AU");
      assert.equal(au.region, "FE");
      assert.equal(au.currencyCode, "AUD");
    });
  });

  // --------------------------------------------------------------------------
  // 4. LWA Authorization & Token Lifecycle
  // --------------------------------------------------------------------------
  describe("4. LWA Authorization & Token Lifecycle", () => {
    it("should exchange authorization code for refresh token and access token", async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        assert.equal(url.toString(), "https://api.amazon.com/auth/o2/token");
        assert.equal(init?.method, "POST");
        const body = init?.body as string;
        assert.ok(body.includes("grant_type=authorization_code"));
        assert.ok(body.includes("code=test_auth_code_123"));
        assert.ok(body.includes("client_id=" + mockClientId));

        return new Response(
          JSON.stringify({
            access_token: "Atza|new_exchanged_token",
            refresh_token: "Atzr|new_refresh_token",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const lwaClient = new AmazonLwaClient(standardCredentials, { fetchFn: mockFetch });
      const result = await lwaClient.exchangeAuthorizationCode(
        "test_auth_code_123",
        "https://platform.internal/auth/amazon/callback"
      );

      assert.equal(result.accessToken, "Atza|new_exchanged_token");
      assert.equal(result.refreshToken, "Atzr|new_refresh_token");
      assert.equal(result.expiresIn, 3600);
    });

    it("should refresh access token using refresh_token grant and cache it", async () => {
      let fetchCallCount = 0;
      const mockFetch: typeof fetch = async (url, init) => {
        fetchCallCount++;
        assert.equal(url.toString(), "https://api.amazon.com/auth/o2/token");
        const body = init?.body as string;
        assert.ok(body.includes("grant_type=refresh_token"));
        assert.ok(body.includes("refresh_token=" + encodeURIComponent(mockRefreshToken)));

        return new Response(
          JSON.stringify({
            access_token: mockAccessToken,
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const lwaClient = new AmazonLwaClient(standardCredentials, { fetchFn: mockFetch });

      // First call should execute fetch
      const token1 = await lwaClient.getAccessToken();
      assert.equal(token1, mockAccessToken);
      assert.equal(fetchCallCount, 1);

      // Second call should return cached token without fetch
      const token2 = await lwaClient.getAccessToken();
      assert.equal(token2, mockAccessToken);
      assert.equal(fetchCallCount, 1);
    });

    it("should invalidate cached token on 401 and re-fetch on next call", async () => {
      let fetchCallCount = 0;
      const mockFetch: typeof fetch = async () => {
        fetchCallCount++;
        return new Response(
          JSON.stringify({
            access_token: `Atza|token_v${fetchCallCount}`,
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const lwaClient = new AmazonLwaClient(standardCredentials, { fetchFn: mockFetch });

      const firstToken = await lwaClient.getAccessToken();
      assert.equal(firstToken, "Atza|token_v1");
      assert.equal(fetchCallCount, 1);

      // Invalidate cache
      lwaClient.invalidateToken();

      // Next call re-fetches
      const secondToken = await lwaClient.getAccessToken();
      assert.equal(secondToken, "Atza|token_v2");
      assert.equal(fetchCallCount, 2);
    });

    it("should throw ProviderAuthenticationError when token refresh fails with invalid credentials", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            error: "invalid_client",
            error_description: "Client authentication failed",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      };

      const lwaClient = new AmazonLwaClient(standardCredentials, { fetchFn: mockFetch });

      await assert.rejects(
        async () => lwaClient.getAccessToken(),
        (err: unknown) => {
          assert.ok(err instanceof ProviderAuthenticationError);
          assert.equal(err.provider, "AMAZON");
          assert.ok(err.message.includes("Client authentication failed"));
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. Section 39 Fulfillment Channel Isolation (MFN vs FBA)
  // --------------------------------------------------------------------------
  describe("5. Section 39 Fulfillment Channel Isolation (MFN vs FBA)", () => {
    it("should retrieve seller-fulfilled (MFN) inventory via Listings Items API", async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.amazon.com/auth/o2/token")) {
          return new Response(
            JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }),
            { status: 200 }
          );
        }

        // Listings Items API: GET /listings/2021-08-01/items/{sellerId}/{sku}
        assert.ok(urlStr.includes(`/listings/2021-08-01/items/${mockSellerId}/SKU-ALPINE-100`));
        assert.ok(urlStr.includes(`marketplaceIds=${mockMarketplaceId}`));

        return new Response(
          JSON.stringify({
            sku: "SKU-ALPINE-100",
            summaries: [
              {
                marketplaceId: mockMarketplaceId,
                asin: "B09ABC1234",
                productType: "SPORTING_GOODS",
                itemName: "Alpine Mountain Snowboard",
                status: ["BUYABLE"],
              },
            ],
            attributes: {
              fulfillment_availability: [
                {
                  fulfillment_channel_code: "DEFAULT", // MFN identifier
                  quantity: 42,
                },
              ],
            },
          }),
          { status: 200 }
        );
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      const inventory = await adapter.fetchInventoryLevels({
        sku: "SKU-ALPINE-100",
        fulfillmentChannel: "MFN",
      });

      assert.equal(inventory.length, 1);
      assert.equal(inventory[0]?.sku, "SKU-ALPINE-100");
      assert.equal(inventory[0]?.available, 42);
      assert.equal(inventory[0]?.fulfillmentChannel, "MFN");
      assert.equal(inventory[0]?.provider, "AMAZON");
      assert.ok(inventory[0]?.observedAt instanceof Date);
    });

    it("should retrieve Amazon-fulfilled (FBA) inventory via FBA Inventory Summaries API", async () => {
      const mockFetch: typeof fetch = async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.amazon.com/auth/o2/token")) {
          return new Response(
            JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }),
            { status: 200 }
          );
        }

        // FBA Inventory Summaries API: GET /fba/inventory/v1/summaries
        assert.ok(urlStr.includes("/fba/inventory/v1/summaries"));
        assert.ok(urlStr.includes("granularityType=Marketplace"));
        assert.ok(urlStr.includes(`granularityId=${mockMarketplaceId}`));
        assert.ok(urlStr.includes("SKU-FBA-200"));

        return new Response(
          JSON.stringify({
            payload: {
              granularity: { granularityType: "Marketplace", granularityId: mockMarketplaceId },
              inventorySummaries: [
                {
                  asin: "B08XYZ9876",
                  sellerSku: "SKU-FBA-200",
                  fnSku: "X001ABCDEF",
                  productName: "Premium Thermal Goggles",
                  condition: "NewItem",
                  inventoryDetails: {
                    fulfillableQuantity: 150,
                    inboundWorkingQuantity: 20,
                    inboundShippedQuantity: 10,
                    inboundReceivingQuantity: 0,
                    reservedQuantity: {
                      totalReservedQuantity: 5,
                      pendingCustomerOrderQuantity: 3,
                      pendingTransshipmentQuantity: 2,
                    },
                    researchingQuantity: { totalResearchingQuantity: 0 },
                    unfulfillableQuantity: { totalUnfulfillableQuantity: 1 },
                  },
                },
              ],
            },
          }),
          { status: 200 }
        );
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      const inventory = await adapter.fetchInventoryLevels({
        sku: "SKU-FBA-200",
        fulfillmentChannel: "FBA",
      });

      assert.equal(inventory.length, 1);
      assert.equal(inventory[0]?.sku, "SKU-FBA-200");
      assert.equal(inventory[0]?.available, 150);
      assert.equal(inventory[0]?.reserved, 5);
      assert.equal(inventory[0]?.fulfillmentChannel, "FBA");
      assert.equal(inventory[0]?.provider, "AMAZON");
    });

    it("INVARIANT: direct merchant inventory push to FBA must be strictly rejected with ProviderValidationError", async () => {
      const adapter = new AmazonAdapter(standardCredentials);

      await assert.rejects(
        async () =>
          adapter.pushInventoryLevel({
            inventoryItemId: "SKU-FBA-ITEM",
            sku: "SKU-FBA-ITEM",
            locationId: "FBA_DEFAULT",
            available: 25,
            fulfillmentChannel: "FBA",
          }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderValidationError);
          assert.equal(err.provider, "AMAZON");
          assert.ok(err.message.includes("FBA"));
          assert.ok(err.message.includes("Section 39"));
          return true;
        }
      );
    });

    it("should allow pushing inventory updates to seller-fulfilled (MFN) listings items", async () => {
      let patchPayloadCaptured: any = null;

      const mockFetch: typeof fetch = async (url, init) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.amazon.com/auth/o2/token")) {
          return new Response(
            JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }),
            { status: 200 }
          );
        }

        if (init?.method === "PATCH") {
          assert.ok(urlStr.includes(`/listings/2021-08-01/items/${mockSellerId}/SKU-MFN-100`));
          patchPayloadCaptured = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify({
              sku: "SKU-MFN-100",
              status: "ACCEPTED",
              submissionId: "feed-sub-998877",
            }),
            { status: 200 }
          );
        }

        // Return current state for verification read-back
        return new Response(
          JSON.stringify({
            sku: "SKU-MFN-100",
            attributes: {
              fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: 85 }],
            },
          }),
          { status: 200 }
        );
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      const result = await adapter.pushInventoryLevel({
        inventoryItemId: "SKU-MFN-100",
        sku: "SKU-MFN-100",
        locationId: "MFN",
        available: 85,
        fulfillmentChannel: "MFN",
      });

      assert.equal(result.success, true);
      assert.equal(result.provider, "AMAZON");
      assert.ok(patchPayloadCaptured);
      assert.equal(patchPayloadCaptured.productType, "PRODUCT");
      const patch = patchPayloadCaptured.patches[0];
      assert.equal(patch.op, "replace");
      assert.equal(patch.path, "/attributes/fulfillment_availability");
      assert.equal(patch.value[0].quantity, 85);
      assert.equal(patch.value[0].fulfillment_channel_code, "DEFAULT");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Order Ingestion & Normalization
  // --------------------------------------------------------------------------
  describe("6. Order Ingestion & Normalization", () => {
    it("should fetch orders using Orders v2024-06-01 and map line items", async () => {
      const mockFetch: typeof fetch = async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.amazon.com/auth/o2/token")) {
          return new Response(
            JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }),
            { status: 200 }
          );
        }

        if (urlStr.includes("/orders/2024-06-01/orders/114-1234567-7654321/orderItems")) {
          return new Response(
            JSON.stringify({
              payload: {
                amazonOrderId: "114-1234567-7654321",
                orderItems: [
                  {
                    orderItemId: "item-554433",
                    sellerSku: "SKU-ALPINE-100",
                    title: "Alpine Mountain Snowboard",
                    quantityOrdered: 2,
                    itemPrice: { currencyCode: "USD", amount: "599.98" },
                    itemTax: { currencyCode: "USD", amount: "48.00" },
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }

        if (urlStr.includes("/orders/2024-06-01/orders")) {
          return new Response(
            JSON.stringify({
              payload: {
                orders: [
                  {
                    amazonOrderId: "114-1234567-7654321",
                    purchaseDate: "2026-09-30T10:00:00Z",
                    lastUpdateDate: "2026-09-30T10:15:00Z",
                    orderStatus: "Unshipped",
                    fulfillmentChannel: "MFN",
                    orderTotal: { currencyCode: "USD", amount: "647.98" },
                    shippingAddress: {
                      name: "Alex Customer",
                      addressLine1: "123 Mountain Way",
                      city: "Denver",
                      stateOrRegion: "CO",
                      postalCode: "80202",
                      countryCode: "US",
                    },
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }

        return new Response("Not Found", { status: 404 });
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      const orders = await adapter.fetchOrders();

      assert.equal(orders.length, 1);
      const order = orders[0]!;
      assert.equal(order.id, "114-1234567-7654321");
      assert.equal(order.provider, "AMAZON");
      assert.equal(order.fulfillmentStatus, "UNFULFILLED");
      assert.equal(order.financialStatus, "PAID");
      assert.equal(order.totalAmount, 647.98);
      assert.equal(order.currency, "USD");
      assert.equal(order.lineItems.length, 1);
      assert.equal(order.lineItems[0]?.sku, "SKU-ALPINE-100");
      assert.equal(order.lineItems[0]?.quantity, 2);
      assert.equal(order.lineItems[0]?.unitPrice, 299.99);
      assert.equal(order.metadata?.fulfillmentChannel, "MFN");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Rate Limiting, Token Bucket & Throttling Backoff
  // --------------------------------------------------------------------------
  describe("7. Rate Limiting & Throttling Backoff", () => {
    it("should handle HTTP 429 RequestThrottled with exponential backoff and retry", async () => {
      let attempt = 0;
      const mockFetch: typeof fetch = async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.amazon.com/auth/o2/token")) {
          return new Response(
            JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }),
            { status: 200 }
          );
        }

        attempt++;
        if (attempt === 1) {
          // Return SP-API 429 RequestThrottled
          return new Response(
            JSON.stringify({
              errors: [
                {
                  code: "RequestThrottled",
                  message: "Request was throttled by the Selling Partner API.",
                },
              ],
            }),
            { status: 429, headers: { "Retry-After": "1" } }
          );
        }

        // Second attempt succeeds
        return new Response(
          JSON.stringify({
            sku: "SKU-THROTTLED-1",
            attributes: {
              fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: 12 }],
            },
          }),
          { status: 200 }
        );
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      const inventory = await adapter.fetchInventoryLevels({ sku: "SKU-THROTTLED-1" });

      assert.equal(inventory.length, 1);
      assert.equal(inventory[0]?.available, 12);
      assert.equal(attempt, 2);
    });

    it("should throw ProviderRateLimitError when retries are exhausted", async () => {
      const mockFetch: typeof fetch = async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.amazon.com/auth/o2/token")) {
          return new Response(
            JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            errors: [
              {
                code: "QuotaExceeded",
                message: "Hourly quota exceeded for the operation.",
              },
            ],
          }),
          { status: 429 }
        );
      };

      // Set maxRetries to 1 for quick failure
      const client = new AmazonSpApiClient(standardCredentials, {
        fetchFn: mockFetch,
        maxRetries: 1,
      });
      const adapter = new AmazonAdapter(standardCredentials, { client });

      await assert.rejects(
        async () => adapter.fetchInventoryLevels({ sku: "SKU-QUOTA-1" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderRateLimitError);
          assert.equal(err.provider, "AMAZON");
          assert.ok(err.retryAfterMs >= 1000);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8. Timeout, Authentication Failure & Error Normalization
  // --------------------------------------------------------------------------
  describe("8. Timeout, Authentication Failure & Error Normalization", () => {
    it("should normalize SP-API error codes into canonical typed errors", async () => {
      // 1. InvalidInput -> ProviderValidationError
      const invalidFetch: typeof fetch = async (url) => {
        if (url.toString().includes("auth/o2/token")) {
          return new Response(JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }));
        }
        return new Response(
          JSON.stringify({
            errors: [{ code: "InvalidInput", message: "MarketplaceId is invalid." }],
          }),
          { status: 400 }
        );
      };
      const invalidAdapter = new AmazonAdapter(standardCredentials, { fetchFn: invalidFetch });
      await assert.rejects(
        async () => invalidAdapter.fetchInventoryLevels({ sku: "SKU-INVALID" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderValidationError);
          return true;
        }
      );

      // 2. Unauthorized -> ProviderAuthenticationError
      const authFailFetch: typeof fetch = async (url) => {
        if (url.toString().includes("auth/o2/token")) {
          return new Response(JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }));
        }
        return new Response(
          JSON.stringify({
            errors: [{ code: "Unauthorized", message: "Access token expired or invalid." }],
          }),
          { status: 401 }
        );
      };
      const authAdapter = new AmazonAdapter(standardCredentials, { fetchFn: authFailFetch });
      await assert.rejects(
        async () => authAdapter.fetchInventoryLevels({ sku: "SKU-AUTH-FAIL" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderAuthenticationError);
          return true;
        }
      );
    });

    it("should handle timeout with ProviderTransientError", async () => {
      const timeoutFetch: typeof fetch = async (url) => {
        if (url.toString().includes("auth/o2/token")) {
          return new Response(JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }));
        }
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: timeoutFetch });
      await assert.rejects(
        async () => adapter.fetchInventoryLevels({ sku: "SKU-TIMEOUT" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderTransientError);
          assert.equal(err.provider, "AMAZON");
          assert.equal(err.classification, "TRANSIENT");
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 9. SQS / EventBridge Notification Processing & Deduplication
  // --------------------------------------------------------------------------
  describe("9. SQS / EventBridge Notification Processing & Deduplication", () => {
    it("should parse ORDER_CHANGE notification payload", () => {
      const rawPayload: AmazonNotificationPayload = {
        NotificationType: "ORDER_CHANGE",
        PayloadVersion: "1.0",
        EventTime: "2026-09-30T12:00:00Z",
        NotificationMetadata: {
          NotificationId: "notif-order-001",
          SubscriptionId: "sub-12345",
          PublishTime: "2026-09-30T12:00:01Z",
        },
        Payload: {
          OrderChangeNotification: {
            SellerId: mockSellerId,
            AmazonOrderId: "114-9988776-5544332",
            OrderStatus: "Shipped",
            FulfillmentChannel: "MFN",
          },
        },
      };

      const parsed = parseAmazonNotification(rawPayload);
      assert.equal(parsed.notificationType, "ORDER_CHANGE");
      assert.equal(parsed.notificationId, "notif-order-001");
      assert.equal(parsed.sellerId, mockSellerId);
      assert.equal(parsed.amazonOrderId, "114-9988776-5544332");
      assert.equal(parsed.fulfillmentChannel, "MFN");
    });

    it("should parse LISTINGS_ITEM_STATUS_CHANGE notification payload", () => {
      const rawPayload: AmazonNotificationPayload = {
        NotificationType: "LISTINGS_ITEM_STATUS_CHANGE",
        PayloadVersion: "1.0",
        EventTime: "2026-09-30T12:05:00Z",
        NotificationMetadata: {
          NotificationId: "notif-listing-002",
          SubscriptionId: "sub-12345",
          PublishTime: "2026-09-30T12:05:01Z",
        },
        Payload: {
          ListingsItemStatusChangeNotification: {
            SellerId: mockSellerId,
            Sku: "SKU-SNOW-2026",
            Asin: "B091234567",
            Status: "BUYABLE",
          },
        },
      };

      const parsed = parseAmazonNotification(rawPayload);
      assert.equal(parsed.notificationType, "LISTINGS_ITEM_STATUS_CHANGE");
      assert.equal(parsed.notificationId, "notif-listing-002");
      assert.equal(parsed.sku, "SKU-SNOW-2026");
      assert.equal(parsed.asin, "B091234567");
    });

    it("should parse FBA_INVENTORY_AVAILABILITY_CHANGE notification payload", () => {
      const rawPayload: AmazonNotificationPayload = {
        NotificationType: "FBA_INVENTORY_AVAILABILITY_CHANGE",
        PayloadVersion: "1.0",
        EventTime: "2026-09-30T12:10:00Z",
        NotificationMetadata: {
          NotificationId: "notif-fba-003",
          SubscriptionId: "sub-12345",
          PublishTime: "2026-09-30T12:10:01Z",
        },
        Payload: {
          FbaInventoryAvailabilityChangeNotification: {
            SellerId: mockSellerId,
            SellerSku: "SKU-FBA-GOGGLE",
            Asin: "B089876543",
            FulfillableQuantity: 48,
          },
        },
      };

      const parsed = parseAmazonNotification(rawPayload);
      assert.equal(parsed.notificationType, "FBA_INVENTORY_AVAILABILITY_CHANGE");
      assert.equal(parsed.notificationId, "notif-fba-003");
      assert.equal(parsed.sku, "SKU-FBA-GOGGLE");
      assert.equal(parsed.fulfillmentChannel, "FBA");
      assert.equal(parsed.quantity, 48);
    });

    it("should detect and deduplicate duplicate notifications using AmazonNotificationDeduplicator", () => {
      const deduplicator = new AmazonNotificationDeduplicator(100);
      const notifId = "notif-unique-event-999";

      // First time: not duplicate
      assert.equal(deduplicator.isDuplicate(notifId), false);
      deduplicator.record(notifId);

      // Second time: detected as duplicate
      assert.equal(deduplicator.isDuplicate(notifId), true);
      assert.equal(deduplicator.size(), 1);

      // Clearing resets deduplicator
      deduplicator.clear();
      assert.equal(deduplicator.size(), 0);
      assert.equal(deduplicator.isDuplicate(notifId), false);
      assert.equal(deduplicator.size(), 1);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Inventory Reconciliation & Provider Health Diagnostics
  // --------------------------------------------------------------------------
  describe("10. Inventory Reconciliation & Provider Health Diagnostics", () => {
    it("should perform full reconciliation returning current inventory levels", async () => {
      const mockFetch: typeof fetch = async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes("auth/o2/token")) {
          return new Response(JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }));
        }

        return new Response(
          JSON.stringify({
            sku: "SKU-RECON-1",
            attributes: {
              fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: 60 }],
            },
          }),
          { status: 200 }
        );
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      const inventory = await adapter.reconcileInventory();

      assert.ok(Array.isArray(inventory));
      assert.equal(inventory.length, 1);
      assert.equal(inventory[0]?.sku, "SKU-RECON-1");
      assert.equal(inventory[0]?.quantity, 60);
    });

    it("should report CONNECTED health when operational and seller participations return 200", async () => {
      const mockFetch: typeof fetch = async (url) => {
        if (url.toString().includes("auth/o2/token")) {
          return new Response(JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }));
        }
        return new Response(
          JSON.stringify({
            payload: [{ marketplace: { id: mockMarketplaceId } }],
          }),
          { status: 200 }
        );
      };

      const adapter = new AmazonAdapter(standardCredentials, { fetchFn: mockFetch });
      assert.equal(adapter.isOperational(), true);
      const health = await adapter.getHealth();

      assert.equal(health.status, "CONNECTED");
      assert.equal(health.provider, "AMAZON");
      assert.ok(health.latencyMs !== undefined && health.latencyMs >= 0);
      assert.ok(health.rateLimitHeadroom !== undefined && health.rateLimitHeadroom > 0);
    });

    it("should report AUTH_REQUIRED when adapter credentials are not operational", async () => {
      const adapter = new AmazonAdapter(); // No credentials
      assert.equal(adapter.isOperational(), false);

      const health = await adapter.getHealth();
      assert.equal(health.status, "AUTH_REQUIRED");
      assert.equal(health.provider, "AMAZON");
    });

    it("should report RATE_LIMITED when health check encounters 429", async () => {
      const mockFetch: typeof fetch = async (url) => {
        if (url.toString().includes("auth/o2/token")) {
          return new Response(JSON.stringify({ access_token: mockAccessToken, expires_in: 3600 }));
        }
        return new Response(
          JSON.stringify({
            errors: [{ code: "RequestThrottled", message: "Throttled" }],
          }),
          { status: 429 }
        );
      };

      const client = new AmazonSpApiClient(standardCredentials, {
        fetchFn: mockFetch,
        maxRetries: 0,
      });
      const adapter = new AmazonAdapter(standardCredentials, { client });
      const health = await adapter.getHealth();

      assert.equal(health.status, "RATE_LIMITED");
      assert.equal(health.provider, "AMAZON");
    });
  });
});
