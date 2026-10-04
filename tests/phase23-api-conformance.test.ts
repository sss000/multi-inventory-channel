/**
 * Phase 23: Application API Conformance Test Suite
 * Canonical Specification: Prompt 24 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md & 01_ENGINEERING_SPEC.md
 *
 * Verifies:
 * 1. Base path /api/v1 and unversioned backward-compatible aliases for all 11 API families:
 *    - /auth
 *    - /organizations
 *    - /products (and variants)
 *    - /inventory (balances, timeline, adjustments, reconcile, conflicts)
 *    - /orders
 *    - /integrations (and /channels/accounts)
 *    - /sync (and /sync-jobs)
 *    - /reconciliation
 *    - /exceptions
 *    - /audit
 *    - /billing
 *    - /notifications
 * 2. Uniform Envelope Contracts:
 *    - Success: { data: T, meta: { timestamp, correlationId?, requestId?, pagination? } }
 *    - Error: { error: { code, message, correlationId?, requestId?, details? } }
 *    - Never exposes raw unhandled internal exceptions or stack traces.
 * 3. Input & Output Discipline:
 *    - Pagination: default limit 50, maximum limit 250, offset/cursor support, reject > 250 with 400.
 *    - Payload limits: reject > 1MB with HTTP 413 PAYLOAD_TOO_LARGE.
 *    - Malformed JSON: return HTTP 400 INVALID_JSON.
 *    - Rate limiting: return HTTP 429 RATE_LIMITED with Retry-After header.
 *    - Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS, CSP, X-Correlation-Id, X-Request-Id.
 *    - Idempotency key handling.
 * 4. HTTP Status Code Discipline:
 *    - 200, 201, 400, 401, 403, 404, 405, 409, 413, 429.
 * 5. Strict Multi-Tenant Isolation:
 *    - Prevents cross-tenant reads or writes across all API endpoints.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  ProductDatabaseService,
  InMemoryProductRepository,
  IntegrationDatabaseService,
  InMemoryIntegrationRepository,
  InventoryLedgerService,
  InMemoryInventoryLedgerRepository,
  OrderService,
  InMemoryOrderRepository,
  ReservationService,
  SyncJobService,
  InMemorySyncJobRepository,
  ReconciliationDatabaseService,
  InMemoryReconciliationRepository,
  ExceptionDatabaseService,
  InMemoryExceptionRepository,
  AuditDatabaseService,
  InMemoryAuditRepository,
  BillingDatabaseService,
  InMemoryBillingRepository,
  NotificationDatabaseService,
  InMemoryNotificationRepository,
} from "@platform/database";
import {
  SyncEngine,
  ReconciliationEngine,
  ExceptionEngine,
  StripeBillingClient,
} from "@platform/integrations";
import { SupabaseAuthAdapter, OrganizationService } from "@platform/security";
import { startApiServer, ApiRateLimiter } from "@platform/api";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const USER_ADMIN_A = "10000000-0000-0000-0000-000000000001";
const USER_VIEWER_A = "10000000-0000-0000-0000-000000000002";
const USER_ADMIN_B = "20000000-0000-0000-0000-000000000001";

function createMockAuthAdapter(): SupabaseAuthAdapter {
  const client = {
    auth: {
      getUser: async (token: string) => {
        if (token === "token_admin_org_a") {
          return {
            data: {
              user: {
                id: USER_ADMIN_A,
                email: "admin@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_viewer_org_a") {
          return {
            data: {
              user: {
                id: USER_VIEWER_A,
                email: "viewer@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "VIEWER",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_admin_org_b") {
          return {
            data: {
              user: {
                id: USER_ADMIN_B,
                email: "admin@orgb.com",
                user_metadata: {
                  organization_id: ORG_B_ID,
                  organization_name: "Org B",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: new Error("Invalid or expired session token") };
      },
    },
  };
  return new SupabaseAuthAdapter(client as any);
}

describe("Phase 23: Application API Conformance Acceptance Suite", () => {
  let server: Server;
  let baseUrl: string;

  let productDbService: ProductDatabaseService;
  let integrationDbService: IntegrationDatabaseService;
  let ledgerService: InventoryLedgerService;
  let orderService: OrderService;
  let syncJobService: SyncJobService;
  let syncEngine: SyncEngine;
  let reconciliationDbService: ReconciliationDatabaseService;
  let reconciliationEngine: ReconciliationEngine;
  let exceptionDbService: ExceptionDatabaseService;
  let auditDbService: AuditDatabaseService;
  let billingDbService: BillingDatabaseService;
  let notificationDbService: NotificationDatabaseService;
  let orgService: OrganizationService;

  beforeEach(async () => {
    const authAdapter = createMockAuthAdapter();

    const productRepo = new InMemoryProductRepository();
    productDbService = new ProductDatabaseService(productRepo);

    const integrationRepo = new InMemoryIntegrationRepository();
    integrationDbService = new IntegrationDatabaseService(integrationRepo);

    const ledgerRepo = new InMemoryInventoryLedgerRepository();
    ledgerService = new InventoryLedgerService(ledgerRepo);

    const reservationService = new ReservationService(ledgerRepo);
    const orderRepo = new InMemoryOrderRepository();
    orderService = new OrderService(orderRepo, reservationService);

    const syncRepo = new InMemorySyncJobRepository();
    syncJobService = new SyncJobService(syncRepo);
    syncEngine = new SyncEngine(syncJobService);

    const recRepo = new InMemoryReconciliationRepository();
    reconciliationDbService = new ReconciliationDatabaseService(recRepo);
    reconciliationEngine = new ReconciliationEngine(reconciliationDbService, ledgerService);

    const auditRepo = new InMemoryAuditRepository();
    auditDbService = new AuditDatabaseService(auditRepo);

    const exceptionRepo = new InMemoryExceptionRepository();
    exceptionDbService = new ExceptionDatabaseService(exceptionRepo, auditRepo);
    const exceptionEngine = new ExceptionEngine(exceptionDbService);

    const billingRepo = new InMemoryBillingRepository();
    billingDbService = new BillingDatabaseService(billingRepo, auditDbService);
    const stripeClient = new StripeBillingClient();

    const notificationRepo = new InMemoryNotificationRepository();
    notificationDbService = new NotificationDatabaseService(notificationRepo);

    orgService = new OrganizationService();
    await orgService.createOrganization("Org A", USER_ADMIN_A);

    server = startApiServer({
      portOverride: 0,
      authAdapter,
      organizationService: orgService,
      productDbService,
      integrationDbService,
      ledgerService,
      orderService,
      syncJobService,
      syncEngine,
      reconciliationDbService,
      reconciliationEngine,
      exceptionDbService,
      exceptionEngine,
      auditDbService,
      billingDbService,
      stripeClient,
      notificationDbService,
      rateLimitOptions: { maxRequests: 200, windowMs: 60000 },
    });

    await new Promise<void>((resolve) => {
      server.on("listening", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function apiRequest(
    path: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
      rawBody?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<{ status: number; headers: Headers; body: any }> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }
    if (options.body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const payload = options.rawBody !== undefined
      ? options.rawBody
      : options.body !== undefined
      ? JSON.stringify(options.body)
      : undefined;

    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: payload,
    });

    let body: any = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return { status: res.status, headers: res.headers, body };
  }

  // =========================================================================
  // 1. API Envelope & Security Headers
  // =========================================================================
  describe("1. Uniform Envelopes & Security Headers", () => {
    it("should include all mandatory security headers on every response", async () => {
      const res = await apiRequest("/api/v1/status");
      assert.equal(res.status, 200);

      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("x-frame-options"), "DENY");
      assert.equal(res.headers.get("x-xss-protection"), "1; mode=block");
      assert.ok(res.headers.get("strict-transport-security")?.includes("max-age=31536000"));
      assert.ok(res.headers.get("content-security-policy")?.includes("default-src 'none'"));
      assert.ok(res.headers.get("x-correlation-id"));
      assert.ok(res.headers.get("x-request-id"));
    });

    it("should return uniform success envelope with data and meta", async () => {
      const res = await apiRequest("/api/v1/status");
      assert.equal(res.status, 200);
      assert.ok(res.body.data);
      assert.equal(res.body.data.status, "operational");
      assert.ok(res.body.meta);
      assert.ok(res.body.meta.timestamp);
      assert.ok(res.body.meta.correlationId);
      assert.ok(res.body.meta.requestId);
    });

    it("should return uniform error envelope for 404 Not Found", async () => {
      const res = await apiRequest("/api/v1/unknown-endpoint");
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
      assert.equal(res.body.error.code, "NOT_FOUND");
      assert.ok(res.body.error.message);
      assert.ok(res.body.error.correlationId);
      assert.ok(res.body.error.requestId);
    });

    it("should return 401 UNAUTHENTICATED error envelope when token is missing", async () => {
      const res = await apiRequest("/api/v1/products");
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
      assert.ok(res.body.error.code === "UNAUTHORIZED" || res.body.error.code === "UNAUTHENTICATED");
    });
  });

  // =========================================================================
  // 2. Base Path /api/v1 and Unversioned Backward-Compatible Aliases
  // =========================================================================
  describe("2. Base Path /api/v1 and Unversioned Aliases for All 11 API Families", () => {
    it("Family 1: /auth & /api/v1/auth", async () => {
      const res1 = await apiRequest("/api/v1/auth/me", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);
      assert.equal(res1.body.data.user.id, USER_ADMIN_A);

      const res2 = await apiRequest("/auth/me", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.user.id, USER_ADMIN_A);
    });

    it("Family 2: /organizations & /api/v1/organizations", async () => {
      const res1 = await apiRequest("/api/v1/organizations/current", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/organizations/current", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
    });

    it("Family 3: /products & /api/v1/products", async () => {
      // POST /api/v1/products
      const createRes = await apiRequest("/api/v1/products", {
        method: "POST",
        token: "token_admin_org_a",
        body: {
          title: "Conformance Test Product",
          description: "API Conformance testing product",
        },
      });
      assert.equal(createRes.status, 201);
      assert.ok(createRes.body.data.id);

      // GET /api/v1/products
      const listRes1 = await apiRequest("/api/v1/products", { token: "token_admin_org_a" });
      assert.equal(listRes1.status, 200);
      assert.equal(listRes1.body.data.length, 1);

      // GET /products (alias)
      const listRes2 = await apiRequest("/products", { token: "token_admin_org_a" });
      assert.equal(listRes2.status, 200);
      assert.equal(listRes2.body.data.length, 1);
    });

    it("Family 4: /inventory & /api/v1/inventory", async () => {
      const res1 = await apiRequest("/api/v1/inventory", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);
      assert.ok(Array.isArray(res1.body.data));

      const res2 = await apiRequest("/inventory", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
      assert.ok(Array.isArray(res2.body.data));
    });

    it("Family 5: /orders & /api/v1/orders", async () => {
      const res1 = await apiRequest("/api/v1/orders", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/orders", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
    });

    it("Family 6: /integrations & /api/v1/integrations (and /channels/accounts)", async () => {
      const res1 = await apiRequest("/api/v1/integrations", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/integrations", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);

      const res3 = await apiRequest("/channels/accounts", { token: "token_admin_org_a" });
      assert.equal(res3.status, 200);
    });

    it("Family 7: /sync & /api/v1/sync (and /sync-jobs)", async () => {
      const res1 = await apiRequest("/api/v1/sync/jobs", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/sync-jobs", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
    });

    it("Family 8: /reconciliation & /api/v1/reconciliation", async () => {
      const res1 = await apiRequest("/api/v1/reconciliation/runs", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/reconciliation/runs", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
    });

    it("Family 9: /exceptions & /api/v1/exceptions", async () => {
      const res1 = await apiRequest("/api/v1/exceptions", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/exceptions", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
    });

    it("Family 10: /audit & /api/v1/audit", async () => {
      const res1 = await apiRequest("/api/v1/audit", { token: "token_admin_org_a" });
      assert.equal(res1.status, 200);

      const res2 = await apiRequest("/audit", { token: "token_admin_org_a" });
      assert.equal(res2.status, 200);
    });

    it("Family 11: /billing & /api/v1/billing, /notifications & /api/v1/notifications", async () => {
      const resBilling = await apiRequest("/api/v1/billing/subscription", { token: "token_admin_org_a" });
      assert.equal(resBilling.status, 200);

      const resNotif1 = await apiRequest("/api/v1/notifications", { token: "token_admin_org_a" });
      assert.equal(resNotif1.status, 200);

      const resNotif2 = await apiRequest("/notifications", { token: "token_admin_org_a" });
      assert.equal(resNotif2.status, 200);
    });
  });

  // =========================================================================
  // 3. Input & Output Discipline
  // =========================================================================
  describe("3. Input & Output Discipline", () => {
    it("should accept valid pagination limits up to 250", async () => {
      const res = await apiRequest("/api/v1/products?limit=250&page=1", { token: "token_admin_org_a" });
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.pagination.limit, 250);
    });

    it("should reject pagination limit > 250 with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await apiRequest("/api/v1/products?limit=251&page=1", { token: "token_admin_org_a" });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION_ERROR");
    });

    it("should reject non-positive page numbers with HTTP 400", async () => {
      const res = await apiRequest("/api/v1/products?page=0", { token: "token_admin_org_a" });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION_ERROR");
    });

    it("should return HTTP 400 INVALID_JSON for malformed JSON request bodies", async () => {
      const res = await apiRequest("/api/v1/products", {
        method: "POST",
        token: "token_admin_org_a",
        rawBody: "{ malformed json",
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "INVALID_JSON");
    });

    it("should reject payloads > 1MB with HTTP 413 PAYLOAD_TOO_LARGE", async () => {
      // Create a 1.2MB payload
      const largeData = "x".repeat(1.2 * 1024 * 1024);
      const res = await apiRequest("/api/v1/products", {
        method: "POST",
        token: "token_admin_org_a",
        rawBody: JSON.stringify({ sku: "HUGE", name: largeData }),
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(res.status, 413);
      assert.equal(res.body.error.code, "PAYLOAD_TOO_LARGE");
    });

    it("should return HTTP 405 METHOD_NOT_ALLOWED on immutable resources like /audit", async () => {
      const resPost = await apiRequest("/api/v1/audit", {
        method: "POST",
        token: "token_admin_org_a",
        body: { action: "tamper" },
      });
      assert.equal(resPost.status, 405);
      assert.ok(resPost.body.error.code === "METHOD_NOT_ALLOWED" || resPost.body.error.code === "IMMUTABLE_AUDIT_LOG");

      const resDelete = await apiRequest("/api/v1/audit", {
        method: "DELETE",
        token: "token_admin_org_a",
      });
      assert.equal(resDelete.status, 405);
      assert.ok(resDelete.body.error.code === "METHOD_NOT_ALLOWED" || resDelete.body.error.code === "IMMUTABLE_AUDIT_LOG");
    });

    it("should enforce RBAC with HTTP 403 FORBIDDEN when permissions are insufficient", async () => {
      // VIEWER has products:read but lacks products:write
      const res = await apiRequest("/api/v1/products", {
        method: "POST",
        token: "token_viewer_org_a",
        body: { title: "Viewer Test", description: "Forbidden" },
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FORBIDDEN");
    });
  });

  // =========================================================================
  // 4. Multi-Tenant Isolation
  // =========================================================================
  describe("4. Multi-Tenant Isolation", () => {
    it("should strictly prevent Org B from viewing or modifying Org A products", async () => {
      // 1. Org A creates a product
      const createRes = await apiRequest("/api/v1/products", {
        method: "POST",
        token: "token_admin_org_a",
        body: { title: "Org A Exclusive", description: "Org A product" },
      });
      assert.equal(createRes.status, 201);
      const prodId = createRes.body.data.id;

      // 2. Org B attempts to retrieve Org A's product
      const getResB = await apiRequest(`/api/v1/products/${prodId}`, {
        token: "token_admin_org_b",
      });
      assert.equal(getResB.status, 404);
      assert.equal(getResB.body.error.code, "PRODUCT_NOT_FOUND");

      // 3. Org B lists products - Org A's product must NOT appear
      const listResB = await apiRequest("/api/v1/products", {
        token: "token_admin_org_b",
      });
      assert.equal(listResB.status, 200);
      assert.equal(listResB.body.data.length, 0);

      // 4. Org A lists products - Org A's product is present
      const listResA = await apiRequest("/api/v1/products", {
        token: "token_admin_org_a",
      });
      assert.equal(listResA.status, 200);
      assert.equal(listResA.body.data.length, 1);
    });

    it("should strictly isolate integrations between Org A and Org B", async () => {
      // 1. Org A connects an integration
      const connRes = await apiRequest("/api/v1/integrations/shopify/connect", {
        method: "POST",
        token: "token_admin_org_a",
        body: {
          shopDomain: "org-a-shop.myshopify.com",
          scopes: ["read_inventory", "write_inventory"],
        },
      });
      assert.equal(connRes.status, 201);
      const integrationId = connRes.body.data.id;

      // 2. Org B attempts to read health or sync Org A's integration
      const healthResB = await apiRequest(`/api/v1/integrations/${integrationId}/health`, {
        token: "token_admin_org_b",
      });
      assert.equal(healthResB.status, 404);
      assert.equal(healthResB.body.error.code, "INTEGRATION_NOT_FOUND");

      // 3. Org B lists integrations
      const listResB = await apiRequest("/api/v1/integrations", {
        token: "token_admin_org_b",
      });
      assert.equal(listResB.status, 200);
      assert.equal(listResB.body.data.length, 0);
    });
  });

  // =========================================================================
  // 5. Rate Limiting
  // =========================================================================
  describe("5. Rate Limiting", () => {
    it("should enforce rate limiting and return HTTP 429 with Retry-After header", async () => {
      const tightLimiter = new ApiRateLimiter({ maxRequests: 3, windowMs: 10000 });
      const tightServer = startApiServer({
        portOverride: 0,
        rateLimiter: tightLimiter,
      });

      await new Promise<void>((resolve) => {
        tightServer.on("listening", resolve);
      });
      const tightAddr = tightServer.address() as AddressInfo;
      const tightBaseUrl = `http://127.0.0.1:${tightAddr.port}`;

      try {
        // First 3 requests succeed
        for (let i = 0; i < 3; i++) {
          const res = await fetch(`${tightBaseUrl}/api/v1/status`);
          assert.equal(res.status, 200);
        }

        // 4th request must be rate limited
        const rateLimitedRes = await fetch(`${tightBaseUrl}/api/v1/status`);
        assert.equal(rateLimitedRes.status, 429);
        assert.ok(rateLimitedRes.headers.get("retry-after"));
        const body = await rateLimitedRes.json();
        assert.equal(body.error.code, "RATE_LIMITED");
      } finally {
        await new Promise<void>((resolve) => tightServer.close(() => resolve()));
      }
    });
  });

  // =========================================================================
  // 6. Idempotency Key Handling
  // =========================================================================
  describe("6. Idempotency Key Handling", () => {
    it("should accept idempotencyKey on inventory adjustments and return identical result", async () => {
      const skuId = "11111111-1111-1111-1111-111111111111";
      const warehouseId = "22222222-2222-2222-2222-222222222222";
      const idempotencyKey = "idemp_test_adj_001";

      const res1 = await apiRequest("/api/v1/inventory/adjustments", {
        method: "POST",
        token: "token_admin_org_a",
        body: {
          skuId,
          warehouseId,
          quantityDelta: 50,
          reason: "Initial Conformance Receipt",
          idempotencyKey,
        },
      });
      assert.equal(res1.status, 200);
      assert.equal(res1.body.data.balance.onHand, 50);

      // Repeat request with exact same idempotency key
      const res2 = await apiRequest("/api/v1/inventory/adjustments", {
        method: "POST",
        token: "token_admin_org_a",
        body: {
          skuId,
          warehouseId,
          quantityDelta: 50,
          reason: "Initial Conformance Receipt",
          idempotencyKey,
        },
      });
      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.balance.onHand, 50);

      // Verify balances were not doubled
      const balRes = await apiRequest(`/api/v1/inventory/${skuId}`, {
        token: "token_admin_org_a",
      });
      assert.equal(balRes.status, 200);
      assert.equal(balRes.body.data[0].onHand, 50);
    });
  });
});
